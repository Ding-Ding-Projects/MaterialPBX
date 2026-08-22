# Control-plane architecture

## Purpose

The MaterialPBX control plane provides a typed API above Asterisk 22 and FreePBX 17 without giving the web process arbitrary command, database, or filesystem access. It keeps desired resources, live telephony state, paired-server trust, and audit records in distinct boundaries.

## Components

| Component | Authority |
| --- | --- |
| Control plane | Authenticates administrator API requests, validates bounded schemas, stores desired resources, emits events, and coordinates adapters. |
| Privileged helper | Runs an exact allowlist of `fwconsole` and `asterisk` operations over a local Unix socket. It never invokes a shell and bounds runtime and output. |
| FreePBX bridge module | Stores validated resource documents in the FreePBX database, generates narrowly owned configuration, and writes call files atomically. |
| AMI adapter | Opens a bounded AMI session per requested action and authenticates from a secret file. |
| ARI adapter | Calls allowlisted ARI resource roots with bounded responses, no redirects, and request deadlines. |
| CDR/CEL adapter | Uses fixed SQL statements, bounded date ranges, limits, and offsets. |
| Recording catalog | Enumerates allowlisted recording formats below the configured root and skips symbolic links. |
| Federation engine | Owns server identity, invitations, peer scopes, encryption, loop/replay checks, revocation, and key rotation. |
| Audit log | Appends a hash chain whose startup verification rejects altered history. |

## Desired resources

The API represents extensions, users, devices, trunks, inbound and outbound routes, IVRs, queues, conferences, voicemail boxes, recording policies, calendars, presence states, parking lots, paging groups, announcements, time conditions, call files, dynamic features, and WebRTC clients through one versioned envelope. Each write includes a display name, enable state, bounded configuration document, and optional expected revision.

The generic envelope guarantees transport, revision, audit, and bounds. Live application is narrower: extensions, PJSIP trunks, inbound and outbound routes, IVRs, queues, ring groups, voicemail boxes, and time conditions must pass feature-specific normalized schemas before the fixed helper adapter runs. Other kinds and invalid configurations remain stored drafts with an explicit unsupported result. Unsupported fields never become executable Asterisk syntax.

## Request path

1. Fastify enforces a 1 MiB body limit, request timeout, rate limit, CORS origin, and administrator bearer credential.
2. Zod validates route, query, and body values.
3. The resource store performs optimistic revision comparison and an atomic durable write.
4. The control plane constructs an exact ordered application plan and asks the privileged helper to apply one validated feature payload.
5. The helper runs the allowlisted FreePBX bridge command without a shell.
6. The bridge previews the registered native compiler, snapshots prior module-owned output, applies the artifact transactionally when supported, and returns the exact compilation diff and rollback identity.
7. `fwconsole reload` applies configuration; its outcome remains separate from persistence.
8. The API publishes a WebSocket event and appends an audit record.

A saved resource can be durable while application is unsupported or fails. Responses preserve this distinction through the exact plan, validation evidence, `application.applied`, `application.reloaded`, `application.partialFailure`, and `application.warning`.

## Runtime and historical state

AMI handles active call actions such as originate and hangup. ARI exposes current channels, endpoints, and bridges. CDR and CEL are historical database records and are not presented as live state. WebSocket clients receive sequenced events; version 1 emits control-plane and federation changes but does not yet maintain a long-lived AMI/ARI event subscription.

## Capability reporting

The helper probes installed FreePBX and Asterisk versions and inspects loaded modules for ARI, WebRTC, STIR/SHAKEN, CDR, and CEL indicators. A positive report means the relevant module was observed, not that carrier, certificates, dialplan, browser permissions, TLS, ICE/TURN, or jurisdictional configuration is complete.

STIR/SHAKEN reporting is evidence-based. The control plane does not claim attestation authority, certificate ownership, carrier acceptance, or verification merely because `res_stir_shaken.so` is loaded.

## Security boundaries

- Administrator credentials, AMI secrets, ARI passwords, and database DSNs are read from files and redacted from request logs.
- Federation messages have a separate cryptographic authentication path.
- The helper socket must be writable only by the control-plane group; possession grants the bounded command set.
- The supplied deployment binds the control plane to loopback. External exposure requires verified HTTPS and host firewall policy.
- Asterisk and FreePBX retain their own security model. This service does not replace SIP ACLs, TLS, fail2ban, emergency-routing review, carrier fraud controls, or operating-system patching.
- Resource JSON is not a route-language sandbox. Resource compilers must reject executable strings and unsafe number patterns.

## Failure modes

| Failure | Behavior |
| --- | --- |
| Helper unavailable | Desired resources remain storable; application is reported failed. |
| FreePBX reload fails | The resource is durable; response reports `reloaded=false`. |
| CDR database unavailable | Status contains a warning and CDR/CEL endpoints return 503. |
| AMI or ARI unavailable | The live operation fails without arbitrary CLI fallback. |
| Audit chain altered | Startup fails before accepting requests. |
| Resource revision conflict | Write fails instead of overwriting a newer revision. |
| Oversized request or response | The boundary rejects or terminates the operation. |

## Verification state

This implementation was produced under an accelerated delivery mode. Package builds are recorded separately. No unit, integration, telephony-call, security, load, failover, or packaged-runtime verification was run. Resource-specific FreePBX compilation beyond the bridge store, persistent AMI/ARI event ingestion, carrier behavior, WebRTC media negotiation, STIR/SHAKEN credentials, backup restore, and disaster recovery require dedicated verification before production use.
