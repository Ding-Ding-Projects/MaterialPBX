# Paired-server federation

MaterialPBX federation pairs two servers through explicit, cryptographically authenticated trust. It is not a shared-secret trunk form and does not infer trust from a hostname, SIP registration, or another peer.

## Implemented version 1 profile

- Each server owns a persistent Ed25519 identity key and a stable random node identifier.
- An invitation contains the inviter identity, a one-time X25519 exchange public key, requested capability scope, HTTPS endpoint, issue and expiry timestamps, a random nonce, and an Ed25519 signature.
- The receiving administrator must confirm the displayed inviter fingerprint before producing an acceptance.
- The acceptance contains a new one-time X25519 exchange public key, the receiver identity, its requested scope reduction, and an Ed25519 signature.
- The inviting administrator must confirm the receiver fingerprint before producing the signed confirmation.
- Both sides derive the same 256-bit session key using X25519 and HKDF-SHA-256 over the signed invitation-and-acceptance transcript.
- Federation messages use AES-256-GCM with authenticated canonical headers. Messages carry a key identifier, route identifier, sender node identifier, unique message identifier, timestamp, path vector, and hop count.

The implementation uses the Node.js cryptography provider. It does not implement curve arithmetic, signature encoding, or authenticated encryption primitives itself. Version 1 has one fixed suite; there is no algorithm downgrade negotiation.

## Pairing state machine

1. The inviter creates a signed invitation with a bounded expiry and requested scope.
2. The receiver validates the signature, expiry, endpoint policy, and inviter fingerprint.
3. The receiver may narrow capabilities but cannot add capabilities not offered by the inviter.
4. The receiver signs an acceptance and stores its pending transcript and derived key.
5. The inviter validates the acceptance and requires explicit receiver-fingerprint confirmation.
6. The inviter consumes the invitation, creates an active peer, and signs a transcript confirmation.
7. The receiver validates that confirmation and creates its matching active peer.

Invitations are single use. Expired, absent, or consumed invitations cannot be restored. An acceptance cannot activate routes without the inviter confirmation, and the receiver does not activate its peer until it validates that confirmation.

## Capability and route scope

A peer scope contains an explicit list of supported capabilities, permitted route identifiers, and a maximum hop count. Capability advertisement is not authorization. The accepted scope can only be equal to or narrower than the invitation proposal. Local PBX configuration remains subject to the normal resource validation and privileged-helper boundary.

Federation does not grant arbitrary Asterisk CLI, shell, database, file, recording, module-installation, or dialplan execution. Management operations require the local administrator API credential and remain outside the federation-message endpoint.

## Loop and replay controls

Every encrypted message carries a path vector and hop count. A sender refuses a path already containing itself and refuses a path longer than the peer's accepted maximum. A receiver refuses a path containing its own node identifier, a mismatched path length, a stale timestamp, an unknown key identifier, or a repeated message identifier. The replay cache is memory-bounded by the configured time window; service restart does not provide durable replay memory, which is a documented limitation.

## Endpoint policy

Peer endpoints must use HTTPS and cannot contain embedded credentials. Plain HTTP is accepted only for loopback development addresses. The current implementation validates the signed endpoint but does not itself send envelopes across the network; the caller transports the returned envelope to the peer's public `/v1/federation/messages` endpoint. Production deployment must independently validate TLS certificate policy at that transport boundary.

## Revocation and rotation

Revocation is local and immediate: the peer becomes inactive and its stored session key is replaced before state is persisted. A remote acknowledgement is not required. Local identity rotation creates a new Ed25519 key and explicitly reports that existing peers require pairing again. Version 1 does not pretend to provide seamless dual-signed identity rollover.

## Audit and secret handling

Invitation creation, acceptance, confirmation, finalization, revocation, and identity rotation produce hash-chained append-only audit records. Public peer responses omit derived session keys. Identity private keys and peer keys are stored in the control-plane private data directory with restrictive permissions and are excluded from normal API responses.

The version 1 state file is protected by host filesystem permissions but is not encrypted at rest. Deployment must restrict the control-plane account and backup access accordingly. A future credential-vault integration must migrate this material atomically rather than claiming the current file is hardware protected.

## Failure behavior

- Invalid signatures, fingerprints, transcript hashes, URLs, expiries, identities, key identifiers, and scope expansion fail closed.
- A dropped pairing flow remains pending until expiry; it does not silently create a peer.
- Clock disagreement outside the configured window rejects federation messages.
- An unavailable peer does not cause plaintext, unpinned, or shared-password fallback.
- Revoked peers cannot decrypt or send accepted messages through the local engine.

## Verification state

The protocol implementation and this document were produced during an accelerated delivery pass. Package builds may prove compilation, but no unit, integration, interoperability, fuzz, cryptographic-review, penetration, SIP-call, or long-running replay test was run in that pass. Federation should remain opt-in until independent review and multi-server verification cover invitation races, transcript vectors, cross-implementation key derivation, replay persistence, transport TLS policy, revocation, rotation, and route enforcement.
