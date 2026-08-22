import { z } from "zod";

export const FederationCapabilitySchema = z.enum([
  "route-calls",
  "share-presence",
  "share-directory",
  "share-health",
  "send-messages",
  "receive-events"
]);
export type FederationCapability = z.infer<typeof FederationCapabilitySchema>;

export const FederationScopeSchema = z.object({
  capabilities: z.array(FederationCapabilitySchema).max(16),
  dialPrefixes: z.array(z.string().regex(/^\+?[0-9*#]{1,24}$/)).max(64),
  inboundContexts: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,80}$/)).max(32),
  maxConcurrentCalls: z.number().int().min(0).max(1000),
  maxHopCount: z.number().int().min(1).max(8)
});
export type FederationScope = z.infer<typeof FederationScopeSchema>;

export const PairingInvitationSchema = z.object({
  version: z.literal(1),
  invitationId: z.string().uuid(),
  issuerId: z.string().uuid(),
  issuerName: z.string().min(1).max(128),
  issuerUrl: z.string().url(),
  identityPublicKey: z.string().min(40).max(256),
  ephemeralPublicKey: z.string().min(40).max(256),
  requestedScope: FederationScopeSchema,
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  nonce: z.string().min(32).max(128),
  signature: z.string().min(40).max(256)
});
export type PairingInvitation = z.infer<typeof PairingInvitationSchema>;

export const FederationEnvelopeSchema = z.object({
  version: z.literal(1),
  peerId: z.string().uuid(),
  messageId: z.string().uuid(),
  routeId: z.string().uuid(),
  path: z.array(z.string().uuid()).max(9),
  hopCount: z.number().int().nonnegative().max(8),
  sentAt: z.string().datetime(),
  keyId: z.string().uuid(),
  iv: z.string().min(16).max(64),
  ciphertext: z.string().min(1).max(2_000_000),
  authTag: z.string().min(16).max(64)
});
export type FederationEnvelope = z.infer<typeof FederationEnvelopeSchema>;
