# Native compiler registry

The native compiler registry separates stored desired state from generated PBX output. It previews an exact bounded diff, records a snapshot identity, applies module-owned output in one database transaction, reloads FreePBX separately, and leaves runtime verification explicitly pending.

## Supported native output

Version 1 compiles only enabled ring groups with validated members, a 1–300 second ring time, and terminate failover. It stores a module-owned artifact and renders the context through FreePBX's `get_config` hook using fixed `NoOp`, `Dial`, and `Hangup` objects. It never writes core configuration files or native FreePBX module tables.

Extensions have a bounded `extension-get-config-v1` compiler that generates the module-owned internal context for a validated 2–12 digit numeric extension. Inbound routes compile validated DID patterns, optional Caller ID patterns, and allowlisted destination types into module-owned contexts. Outbound routes compile 1–128 valid dial patterns with 1–16 trunk identifiers; emergency routes must name exactly one trunk. Queues have bounded `queue-get-config-v1` support for enabled queues with one to 256 unique validated members, a supported Asterisk strategy (`ringall`, `leastrecent`, `fewestcalls`, `random`, or `rrmemory`), terminate failover, and a 1–3600 second timeout.

Trunks have a deliberately narrow `trunk-get-config-v1` compiler for credentialless PJSIP trunks using UDP, TCP, or TLS with a valid host/IP and port. The generation hook writes only fixed, field-validated endpoint/AOR/identify records to `/etc/asterisk/pjsip_materialpbx_custom.conf`. Registration and referenced credentials remain unsupported until reviewed provider-specific handling exists. IVRs, voicemail, and time conditions remain native-compiler `unsupported`; undocumented table schemas are still not guessed.

## Transactions and rollback

Before replacing a compiled artifact, the module locks the prior row and stores its compiler and artifact under a UUID snapshot. Artifact replacement and snapshot creation commit together. Rollback is single-use: it locks the snapshot, restores or removes the prior module-owned artifact, and marks the snapshot restored in one transaction. `POST /v1/resources/compiler/rollback` performs only that restore; FreePBX reload and runtime verification remain pending and are returned as such.

Unsupported or disabled compilation still upserts the normalized desired record in its own transaction before returning `storedDesired=true`; compiled output remains untouched. Deleting a resource locks any compiled artifact, snapshots it, removes desired and compiled rows in one transaction, and returns a removal diff plus rollback identity. When no compiled artifact exists, deletion removes desired state but reports native compilation unsupported and does not trigger a reload.

Disabling a previously compiled ring group is a supported removal transition: desired state, snapshot, and compiled-artifact removal commit together, then FreePBX reloads while runtime verification remains pending. If no compiled artifact exists, disabled desired state is stored as an honest no-op with no reload. For any other unsupported edit with prior compiled output, the result explicitly says that output was retained and runtime may differ from desired state.

## Result semantics

Responses distinguish `storedDesired`, compilation status and diff, snapshot identity, `applied`, `reloaded`, `runtimeVerification: pending`, partial failure, and rollback outcome. A compiler-unsupported result exits successfully at the bounded bridge but returns `applied=false`; the control plane does not reload FreePBX.

## Limitations and verification

Generated extension, route, queue, ring-group, and trunk output is module owned but does not yet prove end-to-end destination linkage across resource types. Route generation records bounded contexts/patterns; actual destination dispatch needs live verification. Ring-group/queue membership assumes PJSIP endpoint identifiers match validated members; outbound trunk selection assumes identifiers match compiled trunk endpoints; trunk generation assumes credentialless direct IP-style service. No live FreePBX/Asterisk migration, generated output, reload, rollback, disablement, deletion, or real call verification has run. PHP syntax checks and package builds prove parsing/compilation only, not telephony behavior.
