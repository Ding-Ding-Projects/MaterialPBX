# Changelog

## Unreleased

### Changed

- Rebuilt the public home page as a dedicated beginner-first landing experience instead of a disconnected control dashboard. It now defines a PBX, shows a visual call path, separates beginner, expert, and production routes, demonstrates rich controls, exposes the complete feature map, and keeps the public non-runtime boundary visible.
- Added a managed Sites/Cloudflare Worker publication build while retaining GitHub Pages under the repository base path. The Pages workflow now publishes the client output rather than the complete worker bundle.
- Replaced disabled runtime-looking actions and health metrics on public feature pages with documentation, download, and installed-or-hosted product guidance.
- Added a transactional native compiler registry for the safely bounded ring-group subset. It previews module-owned output, snapshots prior artifacts, applies and removes them through the FreePBX generation hook, provides rollback identity, and reports stored desired state, compiled state, reload state, and pending runtime verification separately.
- Added the bounded `queue-get-config-v1` compiler for enabled queues with 1–256 unique validated members, supported Asterisk strategies, terminate failover, and a 1–3600 second timeout. Disabled queues now remove prior output through the same transactional snapshot path. The queue editor gained guided member add/remove controls.
- Added bounded `extension-get-config-v1` and credentialless `trunk-get-config-v1` compilers. Extensions generate validated module-owned internal contexts; PJSIP trunks support UDP/TCP/TLS with field-validated endpoint/AOR/identify records. Registration and referenced credentials remain explicitly unsupported.
- Added bounded `inbound-route-get-config-v1` and `outbound-route-get-config-v1` compilers. Inbound routes validate DID/Caller ID patterns and destination types. Outbound routes validate 1–128 patterns, 1–16 trunk identifiers, and require exactly one trunk for emergency routes. The route editors gained interactive pattern/trunk list controls.
- Added bounded IVR, voicemail-box, and time-condition compilers, completing a bounded native compiler for every typed application feature subset. IVRs enforce 1–12 unique key choices and timeout bounds; voicemail validates mailbox/email/audio limits; time conditions validate IANA timezone and weekday windows. Cross-resource dispatch remains explicitly pending live runtime proof.
- Kept extensions, trunks, inbound and outbound routes, IVRs, queues, voicemail, and time conditions explicitly unsupported for native compilation until documented FreePBX APIs or reviewed compilers exist. Disabled ring groups remove prior compiled output transactionally; unsupported edits disclose when retained output may differ from desired state.
- Corrected FreePBX 17 runtime integration to use the `FreePBX\modules` BMO namespace, the `FreePBX::Database()` migration handle, and zero-argument `fwconsole` command construction backed by `FreePBX::create()`.
- Made the pinned FreePBX installer find `/var/lib/asterisk/bin/fwconsole` through a PATH-visible `/usr/local/bin/fwconsole` symlink, and removed `/etc/freepbx.conf` from the image volume list so the runtime creates a file rather than a directory at that path.
- Recorded deployment preflight constraints without changing a server: the bootstrap currently supports Debian 12 on amd64 only; the inventoried general host is ARM64, the x86_64 host runs Debian 13 and already uses ports 80 and 443 for the unrelated HeapAndyville proxy, and the other ARM64 host is busy.
- Replaced the generic disconnected shell for extensions, trunks, incoming and outgoing routes, phone menus, queues, live operations, and paired servers with feature-specific visual control rooms and typed editors.
- Added a real control-service preflight with persisted non-secret endpoint, health and capability reads, live/offline/permission/incompatibility/degraded states, permission-aware record loading, and confirmed save results.
- Wired onboarding normal test-destination validation to the live control service without placing a call.
- Changed public installer links to GitHub's stable latest-release asset route for the latest verified non-draft unsigned Windows installer.
- Recorded that commit `41d75a5f2eb7cc7ac1426ee12fb0c4a668ed10f9` restricted release and Pages push triggers to `main`; historical duplicate releases remain immutable and no tags or releases were deleted.

### Verification

The site contract check verified 13 exact requirements plus the managed-hosting identifier boundary. The GitHub Pages build produced a `/MaterialPBX/` client, and the managed build produced a root-based client plus a Cloudflare-compatible worker entry. Visual, responsive, keyboard, and contrast verification did not run because the required cheap headless route was unavailable and no substitute route was used. Vite still reports the existing initial-bundle size advisory.

Desktop builds completed, and PHP 8.4 syntax checks passed on both previously touched FreePBX module files. During the runtime continuation, MaterialPBX module 0.1.0 installed and enabled on FreePBX 17, all three module tables were created, a ring-group artifact and snapshots compiled, and rollback restored the prior-null compiled state. Full FreePBX reload was not proven because the interrupted older container lacked generated custom include files. A fresh clean PBX image build and boot remain pending.

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
