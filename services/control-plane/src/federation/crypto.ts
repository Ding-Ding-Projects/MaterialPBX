import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  sign,
  timingSafeEqual,
  verify,
  type KeyObject
} from "node:crypto";

export function generateIdentityPair() {
  const pair = generateKeyPairSync("ed25519");
  return { publicKey: exportPublic(pair.publicKey), privateKey: exportPrivate(pair.privateKey) };
}

export function generateExchangePair() {
  const pair = generateKeyPairSync("x25519");
  return { publicKey: exportPublic(pair.publicKey), privateKey: exportPrivate(pair.privateKey) };
}

export function exportPublic(key: KeyObject): string {
  return key.export({ type: "spki", format: "pem" }).toString();
}

export function exportPrivate(key: KeyObject): string {
  return key.export({ type: "pkcs8", format: "pem" }).toString();
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function signObject(value: unknown, privateKey: string): string {
  return sign(null, Buffer.from(canonical(value)), privateKey).toString("base64url");
}

export function verifyObject(value: unknown, signature: string, publicKey: string): boolean {
  try { return verify(null, Buffer.from(canonical(value)), publicKey, Buffer.from(signature, "base64url")); }
  catch { return false; }
}

export function fingerprint(publicKey: string): string {
  return createHash("sha256").update(publicKey).digest("hex").match(/.{1,4}/g)!.join("-");
}

export function invitationDigest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export function deriveSharedKey(privateKey: string, peerPublicKey: string, transcriptHash: string): Buffer {
  const secret = diffieHellman({ privateKey: createPrivateKey(privateKey), publicKey: createPublicKey(peerPublicKey) });
  return Buffer.from(hkdfSync("sha256", secret, Buffer.from(transcriptHash, "hex"), Buffer.from("materialpbx-federation-v1"), 32));
}

export function encryptJson(key: Buffer, value: unknown, additionalData: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(additionalData));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { iv: iv.toString("base64url"), ciphertext: ciphertext.toString("base64url"), authTag: cipher.getAuthTag().toString("base64url") };
}

export function decryptJson(key: Buffer, value: { iv: string; ciphertext: string; authTag: string }, additionalData: string): unknown {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(value.iv, "base64url"));
  decipher.setAAD(Buffer.from(additionalData));
  decipher.setAuthTag(Buffer.from(value.authTag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64url")), decipher.final()]).toString("utf8"));
}

export function constantTimeTextEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
