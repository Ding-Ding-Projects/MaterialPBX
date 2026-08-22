# Changelog

## Unreleased

### Changed

- Added a transactional native compiler registry for the safely bounded ring-group subset. It previews module-owned output, snapshots prior artifacts, applies and removes them through the FreePBX generation hook, provides rollback identity, and reports stored desired state, compiled state, reload state, and pending runtime verification separately.
- Added the bounded `queue-get-config-v1` compiler for enabled queues with 1–256 unique validated members, supported Asterisk strategies, terminate failover, and a 1–3600 second timeout. Disabled queues now remove prior output through the same transactional snapshot path. The queue editor gained guided member add/remove controls.
- Added bounded `extension-get-config-v1` and credentialless `trunk-get-config-v1` compilers. Extensions generate validated module-owned internal contexts; PJSIP trunks support UDP/TCP/TLS with field-validated endpoint/AOR/identify records. Registration and referenced credentials remain explicitly unsupported.
- Kept extensions, trunks, inbound and outbound routes, IVRs, queues, voicemail, and time conditions explicitly unsupported for native compilation until documented FreePBX APIs or reviewed compilers exist. Disabled ring groups remove prior compiled output transactionally; unsupported edits disclose when retained output may differ from desired state.
- Recorded deployment preflight constraints without changing a server: the bootstrap currently supports Debian 12 on amd64 only; the inventoried general host is ARM64, the x86_64 host runs Debian 13 and already uses ports 80 and 443 for the unrelated HeapAndyville proxy, and the other ARM64 host is busy.
- Replaced the generic disconnected shell for extensions, trunks, incoming and outgoing routes, phone menus, queues, live operations, and paired servers with feature-specific visual control rooms and typed editors.
- Added a real control-service preflight with persisted non-secret endpoint, health and capability reads, live/offline/permission/incompatibility/degraded states, permission-aware record loading, and confirmed save results.
- Wired onboarding normal test-destination validation to the live control service without placing a call.
- Changed public installer links to GitHub's stable latest-release asset route for the latest verified non-draft unsigned Windows installer.
- Recorded that commit `41d75a5f2eb7cc7ac1426ee12fb0c4a668ed10f9` restricted release and Pages push triggers to `main`; historical duplicate releases remain immutable and no tags or releases were deleted.

### Verification

Protocol/control-plane/desktop builds completed, and PHP 8.4 syntax checks passed on both touched FreePBX module files. FreePBX module loading, generated dialplan/PJSIP output, reload, rollback, live calls, and runtime behavior remain unverified because no suitable deployment host was mutated. This ultra-speed change did not run tests, lint, separate type checking, accessibility or security suites, smoke checks, or screenshots.

## 0.1.0 · 2026-08-22

### Added

- Initial guided MaterialPBX web interface and Windows desktop lab.
- One-click onboarding for users unfamiliar with PBX and computer administration.
- Visual destinations for the planned FreePBX and Asterisk feature set.
- Landing and documentation site with a strict non-runtime boundary.
- WorldLens design-system consumption contract.
- Unsigned Squirrel.Windows packaging path.

### Verification

This ultra-speed implementation did not run tests, lint, type checking, accessibility checks, security checks, smoke checks, or screenshots.

