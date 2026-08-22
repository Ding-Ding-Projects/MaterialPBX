# Native compiler registry

The native compiler registry separates stored desired state from generated PBX output. It previews an exact bounded diff, records a snapshot identity, applies module-owned output in one database transaction, reloads FreePBX separately, and leaves runtime verification explicitly pending.

## Supported native output

Version 1 compiles only enabled ring groups with validated members, a 1–300 second ring time, and terminate failover. It stores a module-owned artifact and renders the context through FreePBX's `get_config` hook using fixed `NoOp`, `Dial`, and `Hangup` objects. It never writes core configuration files or native FreePBX module tables.

Extensions, trunks, inbound and outbound routes, IVRs, queues, voicemail, and time conditions remain native-compiler `unsupported`. Their desired state is retained, but no reload or live mutation is claimed. Supporting them requires documented BMO APIs or independently reviewed compilers; undocumented table schemas are not guessed.

## Transactions and rollback

Before replacing a compiled artifact, the module locks the prior row and stores its compiler and artifact under a UUID snapshot. Artifact replacement and snapshot creation commit together. Rollback is single-use: it locks the snapshot, restores or removes the prior module-owned artifact, and marks the snapshot restored in one transaction. `POST /v1/resources/compiler/rollback` performs only that restore; FreePBX reload and runtime verification remain pending and are returned as such.

Unsupported or disabled compilation still upserts the normalized desired record in its own transaction before returning `storedDesired=true`; compiled output remains untouched. Deleting a resource locks any compiled artifact, snapshots it, removes desired and compiled rows in one transaction, and returns a removal diff plus rollback identity. When no compiled artifact exists, deletion removes desired state but reports native compilation unsupported and does not trigger a reload.

## Result semantics

Responses distinguish `storedDesired`, compilation status and diff, snapshot identity, `applied`, `reloaded`, `runtimeVerification: pending`, partial failure, and rollback outcome. A compiler-unsupported result exits successfully at the bounded bridge but returns `applied=false`; the control plane does not reload FreePBX.

## Limitations and verification

The generated ring-group context is module owned but is not linked into another route automatically. Membership also assumes PJSIP endpoint identifiers match the validated members. No live FreePBX, Asterisk dialplan, call, reload, rollback, or runtime verification ran during the accelerated pass. Package builds and PHP syntax checks prove parsing/compilation only, not telephony behavior.
