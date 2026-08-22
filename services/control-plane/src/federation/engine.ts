import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  FederationEnvelopeSchema,
  FederationScopeSchema,
  PairingInvitationSchema,
  type FederationEnvelope,
  type FederationScope,
  type PairingInvitation
} from "@materialpbx/protocol";
import { atomicWrite, ensurePrivateDirectory } from "../lib/files.js";
import { AuditLog } from "../lib/audit.js";
import {
  canonical,
  decryptJson,
  deriveSharedKey,
  encryptJson,
  fingerprint,
  generateExchangePair,
  generateIdentityPair,
  invitationDigest,
  signObject,
  verifyObject
} from "./crypto.js";

const AcceptanceSchema = z.object({
  version: z.literal(1),
  invitationId: z.string().uuid(),
  receiverId: z.string().uuid(),
  receiverName: z.string().min(1).max(128),
  receiverUrl: z.string().url(),
  identityPublicKey: z.string().min(40).max(256),
  ephemeralPublicKey: z.string().min(40).max(256),
  acceptedScope: FederationScopeSchema,
  acceptedAt: z.string().datetime(),
  nonce: z.string().min(32).max(128),
  signature: z.string().min(40).max(256)
});
export type PairingAcceptance = z.infer<typeof AcceptanceSchema>;

const ConfirmationSchema = z.object({
  version: z.literal(1),
  invitationId: z.string().uuid(),
  issuerId: z.string().uuid(),
  receiverId: z.string().uuid(),
  transcriptHash: z.string().regex(/^[a-f0-9]{64}$/),
  keyId: z.string().uuid(),
  confirmedAt: z.string().datetime(),
  signature: z.string().min(40).max(256)
});
export type PairingConfirmation = z.infer<typeof ConfirmationSchema>;

interface IdentityDocument {
  nodeId: string;
  name: string;
  publicUrl: string;
  publicKey: string;
  privateKey: string;
}
interface PendingInvite { invitation: PairingInvitation; ephemeralPrivateKey: string; consumedAt: string | null }
interface PendingAcceptance { invitation: PairingInvitation; acceptance: PairingAcceptance; sharedKey: string; transcriptHash: string }
export interface FederationPeer {
  peerId: string;
  name: string;
  url: string;
  identityPublicKey: string;
  identityFingerprint: string;
  scope: FederationScope;
  state: "active" | "revoked";
  keyId: string;
  sharedKey: string;
  createdAt: string;
  rotatedAt: string | null;
  revokedAt: string | null;
  lastSeenAt: string | null;
}
interface FederationState { version: 1; invitations: PendingInvite[]; acceptances: PendingAcceptance[]; peers: FederationPeer[] }

export class FederationEngine {
  #identity!: IdentityDocument;
  #state: FederationState = { version: 1, invitations: [], acceptances: [], peers: [] };
  #seenMessages = new Map<string, number>();

  constructor(
    private readonly directory: string,
    private readonly nodeName: string,
    private readonly publicUrl: string,
    private readonly invitationTtlSeconds: number,
    private readonly maxClockSkewSeconds: number,
    private readonly audit: AuditLog
  ) {}

  async initialize(): Promise<void> {
    await ensurePrivateDirectory(this.directory);
    this.#identity = await this.#loadOrCreateIdentity();
    try {
      this.#state = JSON.parse(await readFile(`${this.directory}/state.json`, "utf8")) as FederationState;
      if (this.#state.version !== 1) throw new Error("Unsupported federation state version");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.#persist();
    }
    await this.#pruneExpired();
  }

  identity() {
    return {
      nodeId: this.#identity.nodeId,
      name: this.#identity.name,
      publicUrl: this.#identity.publicUrl,
      identityPublicKey: this.#identity.publicKey,
      fingerprint: fingerprint(this.#identity.publicKey)
    };
  }

  peers(): Omit<FederationPeer, "sharedKey">[] {
    return this.#state.peers.map(({ sharedKey: _, ...peer }) => peer);
  }

  async createInvitation(requestedScope: FederationScope): Promise<PairingInvitation> {
    const scope = FederationScopeSchema.parse(requestedScope);
    const exchange = generateExchangePair();
    const unsigned = {
      version: 1 as const,
      invitationId: randomUUID(),
      issuerId: this.#identity.nodeId,
      issuerName: this.#identity.name,
      issuerUrl: this.#identity.publicUrl,
      identityPublicKey: this.#identity.publicKey,
      ephemeralPublicKey: exchange.publicKey,
      requestedScope: scope,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.invitationTtlSeconds * 1000).toISOString(),
      nonce: randomBytes(32).toString("base64url")
    };
    const invitation = PairingInvitationSchema.parse({ ...unsigned, signature: signObject(unsigned, this.#identity.privateKey) });
    this.#state.invitations.push({ invitation, ephemeralPrivateKey: exchange.privateKey, consumedAt: null });
    await this.#persist();
    await this.audit.record({ actor: "local-admin", action: "federation.invitation.create", target: invitation.invitationId, outcome: "allowed", detail: { expiresAt: invitation.expiresAt, requestedScope: scope } });
    return invitation;
  }

  inspectInvitation(raw: unknown) {
    const invitation = PairingInvitationSchema.parse(raw);
    const { signature, ...unsigned } = invitation;
    if (!verifyObject(unsigned, signature, invitation.identityPublicKey)) throw new Error("Invitation signature is invalid");
    if (Date.parse(invitation.expiresAt) <= Date.now()) throw new Error("Invitation has expired");
    this.#validatePeerUrl(invitation.issuerUrl);
    return { invitation, fingerprint: fingerprint(invitation.identityPublicKey), digest: invitationDigest(unsigned) };
  }

  async acceptInvitation(raw: unknown, confirmedFingerprint: string, receiverScope?: FederationScope): Promise<PairingAcceptance> {
    const { invitation, fingerprint: expected } = this.inspectInvitation(raw);
    if (confirmedFingerprint !== expected) throw new Error("The confirmed identity fingerprint does not match the invitation");
    const exchange = generateExchangePair();
    const acceptedScope = FederationScopeSchema.parse(receiverScope ?? invitation.requestedScope);
    if (!acceptedScope.capabilities.every(capability => invitation.requestedScope.capabilities.includes(capability))) {
      throw new Error("Acceptance cannot add capabilities that were not requested");
    }
    const unsigned = {
      version: 1 as const,
      invitationId: invitation.invitationId,
      receiverId: this.#identity.nodeId,
      receiverName: this.#identity.name,
      receiverUrl: this.#identity.publicUrl,
      identityPublicKey: this.#identity.publicKey,
      ephemeralPublicKey: exchange.publicKey,
      acceptedScope,
      acceptedAt: new Date().toISOString(),
      nonce: randomBytes(32).toString("base64url")
    };
    const acceptance = AcceptanceSchema.parse({ ...unsigned, signature: signObject(unsigned, this.#identity.privateKey) });
    const transcriptHash = invitationDigest([invitation, acceptance]);
    const sharedKey = deriveSharedKey(exchange.privateKey, invitation.ephemeralPublicKey, transcriptHash).toString("base64url");
    this.#state.acceptances = this.#state.acceptances.filter(item => item.invitation.invitationId !== invitation.invitationId);
    this.#state.acceptances.push({ invitation, acceptance, sharedKey, transcriptHash });
    await this.#persist();
    await this.audit.record({ actor: "local-admin", action: "federation.invitation.accept", target: invitation.invitationId, outcome: "allowed", detail: { issuerId: invitation.issuerId, acceptedScope } });
    return acceptance;
  }

  async confirmAcceptance(invitationId: string, raw: unknown, confirmedFingerprint: string): Promise<PairingConfirmation> {
    const pending = this.#state.invitations.find(item => item.invitation.invitationId === invitationId && !item.consumedAt);
    if (!pending) throw new Error("Invitation is missing, expired, or already used");
    if (Date.parse(pending.invitation.expiresAt) <= Date.now()) throw new Error("Invitation has expired");
    const acceptance = AcceptanceSchema.parse(raw);
    if (acceptance.invitationId !== invitationId) throw new Error("Acceptance references a different invitation");
    const { signature, ...unsigned } = acceptance;
    if (!verifyObject(unsigned, signature, acceptance.identityPublicKey)) throw new Error("Acceptance signature is invalid");
    const expected = fingerprint(acceptance.identityPublicKey);
    if (confirmedFingerprint !== expected) throw new Error("The confirmed receiver fingerprint does not match");
    this.#validatePeerUrl(acceptance.receiverUrl);
    const transcriptHash = invitationDigest([pending.invitation, acceptance]);
    const sharedKey = deriveSharedKey(pending.ephemeralPrivateKey, acceptance.ephemeralPublicKey, transcriptHash);
    const keyId = randomUUID();
    this.#upsertPeer({
      peerId: acceptance.receiverId,
      name: acceptance.receiverName,
      url: acceptance.receiverUrl,
      identityPublicKey: acceptance.identityPublicKey,
      identityFingerprint: expected,
      scope: acceptance.acceptedScope,
      state: "active",
      keyId,
      sharedKey: sharedKey.toString("base64url"),
      createdAt: new Date().toISOString(),
      rotatedAt: null,
      revokedAt: null,
      lastSeenAt: null
    });
    pending.consumedAt = new Date().toISOString();
    const confirmationUnsigned = {
      version: 1 as const,
      invitationId,
      issuerId: this.#identity.nodeId,
      receiverId: acceptance.receiverId,
      transcriptHash,
      keyId,
      confirmedAt: new Date().toISOString()
    };
    const confirmation = ConfirmationSchema.parse({ ...confirmationUnsigned, signature: signObject(confirmationUnsigned, this.#identity.privateKey) });
    await this.#persist();
    await this.audit.record({ actor: "local-admin", action: "federation.pair.confirm", target: acceptance.receiverId, outcome: "allowed", detail: { invitationId, keyId, scope: acceptance.acceptedScope } });
    return confirmation;
  }

  async finalizePairing(raw: unknown): Promise<void> {
    const confirmation = ConfirmationSchema.parse(raw);
    const pending = this.#state.acceptances.find(item => item.invitation.invitationId === confirmation.invitationId);
    if (!pending) throw new Error("Pending acceptance was not found");
    const { signature, ...unsigned } = confirmation;
    if (!verifyObject(unsigned, signature, pending.invitation.identityPublicKey)) throw new Error("Confirmation signature is invalid");
    if (confirmation.receiverId !== this.#identity.nodeId || confirmation.issuerId !== pending.invitation.issuerId) throw new Error("Confirmation node identities do not match");
    if (confirmation.transcriptHash !== pending.transcriptHash) throw new Error("Pairing transcript hash does not match");
    this.#upsertPeer({
      peerId: pending.invitation.issuerId,
      name: pending.invitation.issuerName,
      url: pending.invitation.issuerUrl,
      identityPublicKey: pending.invitation.identityPublicKey,
      identityFingerprint: fingerprint(pending.invitation.identityPublicKey),
      scope: pending.acceptance.acceptedScope,
      state: "active",
      keyId: confirmation.keyId,
      sharedKey: pending.sharedKey,
      createdAt: new Date().toISOString(),
      rotatedAt: null,
      revokedAt: null,
      lastSeenAt: null
    });
    this.#state.acceptances = this.#state.acceptances.filter(item => item !== pending);
    await this.#persist();
    await this.audit.record({ actor: "peer", action: "federation.pair.finalize", target: confirmation.issuerId, outcome: "allowed", detail: { invitationId: confirmation.invitationId, keyId: confirmation.keyId } });
  }

  async revoke(peerId: string): Promise<void> {
    const peer = this.#requirePeer(peerId, false);
    peer.state = "revoked";
    peer.revokedAt = new Date().toISOString();
    peer.sharedKey = randomBytes(32).toString("base64url");
    await this.#persist();
    await this.audit.record({ actor: "local-admin", action: "federation.peer.revoke", target: peerId, outcome: "allowed", detail: { keyId: peer.keyId } });
  }

  async rotateLocalIdentity(): Promise<{ previousFingerprint: string; fingerprint: string }> {
    const previousFingerprint = fingerprint(this.#identity.publicKey);
    const pair = generateIdentityPair();
    this.#identity = { ...this.#identity, publicKey: pair.publicKey, privateKey: pair.privateKey };
    await atomicWrite(`${this.directory}/identity.json`, `${JSON.stringify(this.#identity, null, 2)}\n`);
    await this.audit.record({ actor: "local-admin", action: "federation.identity.rotate", target: this.#identity.nodeId, outcome: "allowed", detail: { previousFingerprint, fingerprint: fingerprint(pair.publicKey), peersRequireRepairing: true } });
    return { previousFingerprint, fingerprint: fingerprint(pair.publicKey) };
  }

  seal(peerId: string, routeId: string, payload: unknown, path: string[] = []): FederationEnvelope {
    const peer = this.#requirePeer(peerId);
    if (path.includes(this.#identity.nodeId)) throw new Error("Federation route loop detected");
    const nextPath = [...path, this.#identity.nodeId];
    if (nextPath.length > peer.scope.maxHopCount) throw new Error("Federation hop limit exceeded");
    const header = {
      version: 1 as const,
      peerId: this.#identity.nodeId,
      messageId: randomUUID(),
      routeId,
      path: nextPath,
      hopCount: nextPath.length,
      sentAt: new Date().toISOString(),
      keyId: peer.keyId
    };
    return FederationEnvelopeSchema.parse({ ...header, ...encryptJson(Buffer.from(peer.sharedKey, "base64url"), payload, canonical(header)) });
  }

  async open(raw: unknown): Promise<{ peer: Omit<FederationPeer, "sharedKey">; payload: unknown; envelope: FederationEnvelope }> {
    const envelope = FederationEnvelopeSchema.parse(raw);
    const peer = this.#requirePeer(envelope.peerId);
    if (envelope.keyId !== peer.keyId) throw new Error("Federation key is unknown or rotated");
    if (envelope.path.includes(this.#identity.nodeId)) throw new Error("Federation route loop detected");
    if (envelope.hopCount !== envelope.path.length || envelope.hopCount > peer.scope.maxHopCount) throw new Error("Federation hop limit exceeded");
    const sentAt = Date.parse(envelope.sentAt);
    if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > this.maxClockSkewSeconds * 1000) throw new Error("Federation message timestamp is outside the allowed window");
    this.#pruneReplayCache();
    if (this.#seenMessages.has(envelope.messageId)) throw new Error("Federation message replay detected");
    const { iv, ciphertext, authTag, ...header } = envelope;
    const payload = decryptJson(Buffer.from(peer.sharedKey, "base64url"), { iv, ciphertext, authTag }, canonical(header));
    this.#seenMessages.set(envelope.messageId, Date.now());
    peer.lastSeenAt = new Date().toISOString();
    await this.#persist();
    const { sharedKey: _, ...publicPeer } = peer;
    return { peer: publicPeer, payload, envelope };
  }

  #requirePeer(peerId: string, active = true): FederationPeer {
    const peer = this.#state.peers.find(item => item.peerId === peerId);
    if (!peer || (active && peer.state !== "active")) throw new Error("Federation peer is missing or revoked");
    return peer;
  }
  #upsertPeer(peer: FederationPeer) {
    this.#state.peers = this.#state.peers.filter(item => item.peerId !== peer.peerId);
    this.#state.peers.push(peer);
  }
  async #loadOrCreateIdentity(): Promise<IdentityDocument> {
    try { return JSON.parse(await readFile(`${this.directory}/identity.json`, "utf8")) as IdentityDocument; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const pair = generateIdentityPair();
      const identity = { nodeId: randomUUID(), name: this.nodeName, publicUrl: this.publicUrl, publicKey: pair.publicKey, privateKey: pair.privateKey };
      await atomicWrite(`${this.directory}/identity.json`, `${JSON.stringify(identity, null, 2)}\n`);
      return identity;
    }
  }
  async #pruneExpired() {
    const now = Date.now();
    this.#state.invitations = this.#state.invitations.filter(item => item.consumedAt || Date.parse(item.invitation.expiresAt) > now);
    this.#state.acceptances = this.#state.acceptances.filter(item => Date.parse(item.invitation.expiresAt) > now);
    await this.#persist();
  }
  #pruneReplayCache() {
    const oldest = Date.now() - this.maxClockSkewSeconds * 2_000;
    for (const [id, seenAt] of this.#seenMessages) if (seenAt < oldest) this.#seenMessages.delete(id);
  }
  async #persist() { await atomicWrite(`${this.directory}/state.json`, `${JSON.stringify(this.#state, null, 2)}\n`); }
  #validatePeerUrl(value: string) {
    const url = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== "https:" && !(loopback && url.protocol === "http:"))) {
      throw new Error("Peer URL must use HTTPS without embedded credentials; HTTP is allowed only on loopback");
    }
  }
}
