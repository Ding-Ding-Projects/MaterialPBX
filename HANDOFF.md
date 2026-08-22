# Handoff

## Implemented in the UI lane

- Vue and Vuetify monorepo surface for web, desktop, and documentation-site builds.
- Real control-service client with a persisted non-secret endpoint, health and capability preflight, permission-aware resource reads and writes, bounded responses, and explicit offline, permission, incompatible, degraded, and live states.
- Guided onboarding covering extensions, devices, trunks, routes, emergency calling, NAT, firewall, TLS, SRTP, backups, and normal test calls.
- Feature navigation and guided/expert entry points for the planned FreePBX and Asterisk feature set.
- Settings for language, independent tone levels, dialog emoji, School mode, narration, themes, density, color, fonts, schedules, local vocabulary, attention accommodations, and external editor choices.
- Local history, notification history, command palette, exports, appearance editing, and destructive-action confirmation surfaces.
- Windows desktop shell with context isolation, sandboxing, external-link blocking, and an unsigned Squirrel.Windows packaging configuration.
- Landing/documentation site with Open Graph metadata, a verified MaterialPBX 0.1.0 installer link, and an explicit no-PBX-control boundary.
- Per-feature documentation under `docs/features/`.

## Build state

- `pnpm build:web`, `pnpm build:site`, and `pnpm build:desktop` completed from the visual-control-room source. A root recursive build attempt stopped in the runtime-owned protocol package before these explicit builds because that fresh checkout had not yet installed its workspace dependencies; it is not reported as evidence for this lane.
- `pnpm package:windows` completed with `electron-builder` 26.15.3 and explicit signing disablement.
- Generated unsigned Squirrel files: `MaterialPBX-0.1.0-x64-Setup.exe` (135,984,640 bytes, SHA-256 `cdd3de7af4b12901b49d5514a36fa6b752971137a8ee43701209dd076036fe06`), `materialpbx-desktop-0.1.0-full.nupkg` (134,891,025 bytes, SHA-256 `24fdd7bcb156203e92cfd3d4776be4f3818a4722b1917397b121a0c08e3c8851`), and `RELEASES` (SHA-256 `cbfd0f3073cfea8681bbb643696db4ba1065f4a6aef2dbec7bfc64608eb713b3`).
- After those completed builds, the final source pass wired previously decorative buttons to real handlers or honest disabled explanations, added the shared regex-builder dialog, and updated public records. The orchestrator explicitly requested that completed builds not be rerun, so those last presentation and handler edits are committed without a newer bundle verdict.
- The active ultra-speed workflow did not run tests, lint, type checking, accessibility checks, security checks, smoke checks, or screenshots. Successful compilation and packaging are not runtime verification.

## External dependencies

- The WorldLens design package is consumed from the immutable `worldlens-design-system-0.1.0.tgz` release asset. Published SHA-256: `cd7ccd70a1b73a3bf65914c3901d9c8d45d4b1dacd2956eb70a0db4524cb96eb`; source commit: `e6638a7e608e221c6bdd77f638d014368ae3d04f`.
- The runtime lane owns the control service, deployment artifacts, protocol implementation, and production telephony behavior. This UI sends only the documented control-service requests and never treats an unconfirmed response as success.
- Release `build-3-5147a89` provides the verified unsigned MaterialPBX 0.1.0 Windows installer built from commit `5147a896f8c65b863607378480d5fe46df04e31f`; the documentation site links it directly.
- GitHub Pages is live at <https://ding-ding-projects.github.io/MaterialPBX/>.
- Commit `41d75a5f2eb7cc7ac1426ee12fb0c4a668ed10f9` restricted release and Pages push triggers to `main` after release-created tags recursively triggered duplicate releases. Historical duplicates remain immutable; no tags or releases were deleted.

## Next actions

1. Keep the WorldLens tarball URL immutable and update it only through a reviewed design-system release.
2. Exercise the control-service preflight and feature mutations against a deployed runtime with a permitted account.
3. Run the full verification and capture workflow after leaving ultra-speed mode.
4. Verify the next unsigned Windows Squirrel installer from its final integrated commit.
