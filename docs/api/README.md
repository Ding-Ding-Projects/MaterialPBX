# Control-plane API

## Base and authentication

The API defaults to `http://127.0.0.1:4280` in the supplied deployment and is expected to be published through a separately configured HTTPS boundary. `/healthz` and encrypted inbound federation messages are the only routes that do not use the administrator credential.

All administrator routes require:

```http
Authorization: Bearer <administrator credential>
```

The credential comes from `MATERIALPBX_ADMIN_TOKEN_FILE`; do not place it in a URL, source file, browser storage, log, or command history. The API limits request bodies to 1 MiB and applies global request-rate bounds.

## Resources

`GET /v1/resources` returns all resources; `?kind=` filters by exact kind. `PUT /v1/resources/{kind}/{id}` creates or replaces one desired resource. Supply `expectedRevision` to prevent overwriting a newer change. `DELETE` accepts the same value as a query parameter.

Supported kinds are extensions, users, devices, trunks, inbound routes, outbound routes, IVRs, queues, conferences, voicemail boxes, recording policies, calendars, presence states, parking lots, paging groups, announcements, time conditions, call files, dynamic features, and WebRTC clients.

Successful persistence and successful PBX application are separate facts. Inspect `application.applied`, `application.reloaded`, and `application.warning` on every mutation.

## Runtime, history, and backups

- `GET /v1/runtime/channels`, `/endpoints`, and `/bridges` read allowlisted ARI resources.
- `POST /v1/runtime/originate` and `/hangup` use bounded AMI actions.
- `GET /v1/cdr` and `/v1/cel` accept `from`, `to`, `limit`, and `offset`.
- `GET /v1/recordings` accepts `limit` and an opaque returned `cursor`.
- `POST /v1/resources/call-files/{id}/submit` submits a stored call-file resource through the bounded helper.
- `POST /v1/backups` starts a named FreePBX backup and `GET /v1/backups` lists status.

Backup restore is not exposed. It is destructive and requires a separate verified design with explicit scope, validation, and recovery.

## WebSocket events

Connect to `/v1/events` and authenticate with a WebSocket subprotocol named `materialpbx.token.<base64url-credential>`. URL query credentials are not accepted. Events include an ID, sequence, topic, type, occurrence time, source, and bounded payload.

The current service emits control-plane resource and federation events. It does not yet claim durable, lossless AMI/ARI event replay.

## Federation API

The pairing flow is create invitation, inspect at receiver, accept with confirmed inviter fingerprint, confirm at inviter with confirmed receiver fingerprint, then finalize at receiver. Peer envelopes are produced by `POST /v1/federation/peers/{id}/envelopes` and transported to the peer's `/v1/federation/messages` route.

The message route validates peer identity through the signed pairing-derived AEAD key rather than the administrator bearer credential. See `docs/architecture/federation.md` for trust, expiry, scope, loop, replay, revocation, rotation, and limitations.

## Error behavior

Validation and API errors return a stable error name and a bounded message. Internal errors return `internal_error` without exposing credential, database, filesystem, or command details. Adapter-specific application warnings are returned only on authenticated administrator operations and should still be treated as sensitive operational data.

## OpenAPI and Postman

`openapi.yaml` is the hand-maintained version 1 contract. The repository-level Postman collection is under `postman/`. The accelerated implementation pass did not run schema-conformance or live endpoint verification; consumers must treat the API as pre-release until those checks exist.
