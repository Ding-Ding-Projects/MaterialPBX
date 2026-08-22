# Native compiler registry

The native compiler registry separates stored desired state from generated PBX output. It previews an exact bounded diff, records a snapshot identity, applies module-owned output in one database transaction, reloads FreePBX separately, and leaves runtime verification explicitly pending.

## Supported native output

Version 1 compiles only enabled ring groups with validated members, a 1–300 second ring time, and terminate failover. It stores a module-owned artifact and renders the context through FreePBX's `get_config` hook using fixed `NoOp`, `Dial`, and `Hangup` objects. It never writes core configuration files or native FreePBX module tables.

Queues now have a bounded `queue-get-config-v1` compiler for enabled queues with one to 256 unique validated members, a supported Asterisk strategy (`ringall`, `leastrecent`, `fewestcalls`, `random`, or `rrmemory`), terminate failover, and a 1–3600 second timeout. It records an explicit module-owned artifact and follows the same snapshot/transaction path as ring groups. Disabled queues remove prior output transactionally. Extensions, trunks, inbound and outbound routes, IVRs, voicemail, and time conditions remain native-compiler `unsupported`. Their desired state is retained, but no reload or live mutation is claimed. Supporting them requires documented BMO APIs or independently reviewed compilers; undocumented table schemas are not guessed.

## Transactions and rollback

Before replacing a compiled artifact, the module locks the prior row and stores its compiler and artifact under a UUID snapshot. Artifact replacement and snapshot creation commit together. Rollback is single-use: it locks the snapshot, restores or removes the prior module-owned artifact, and marks the snapshot restored in one transaction. `POST /v1/resources/compiler/rollback` performs only that restore; FreePBX reload and runtime verification remain pending and are returned as such.

Unsupported or disabled compilation still upserts the normalized desired record in its own transaction before returning `storedDesired=true`; compiled output remains untouched. Deleting a resource locks any compiled artifact, snapshots it, removes desired and compiled rows in one transaction, and returns a removal diff plus rollback identity. When no compiled artifact exists, deletion removes desired state but reports native compilation unsupported and does not trigger a reload.

Disabling a previously compiled ring group is a supported removal transition: desired state, snapshot, and compiled-artifact removal commit together, then FreePBX reloads while runtime verification remains pending. If no compiled artifact exists, disabled desired state is stored as an honest no-op with no reload. For any other unsupported edit with prior compiled output, the result explicitly says that output was retained and runtime may differ from desired state.

## Result semantics

Responses distinguish `storedDesired`, compilation status and diff, snapshot identity, `applied`, `reloaded`, `runtimeVerification: pending`, partial failure, and rollback outcome. A compiler-unsupported result exits successfully at the bounded bridge but returns `applied=false`; the control plane does not reload FreePBX.

## Limitations and verification

The generated ring-group and queue contexts are module owned but are not linked into another route automatically. Membership assumes PJSIP endpoint identifiers match the validated members. Queue generation still needs live proof that its bounded hook produces the intended Asterisk queue behavior. No live FreePBX, Asterisk dialplan, call, reload, rollback, disablement, deletion, or runtime verification ran during the accelerated pass. Package builds prove parsing/compilation only, not telephony behavior.
