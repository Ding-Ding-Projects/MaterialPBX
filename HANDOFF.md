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

- `pnpm build:site` completed after the stable latest-release installer-link update. Vite reported its existing advisory that the initial CSS and JavaScript chunks exceed 500 kB; the build completed successfully.
- Integrated main merge `bccd0d5335c6ef47b2a6999363a776b1f4facc85` was independently built for the web interface, documentation site, and desktop renderer, then packaged with `electron-builder` 26.15.3 and explicit signing disablement.
- Generated unsigned Squirrel files: `MaterialPBX-0.1.0-x64-Setup.exe` (135,985,664 bytes, SHA-256 `80537386cdbd90f452d324f2c80fd0b33ab88855b83ee6cd1422a4b96596ab7f`), `materialpbx-desktop-0.1.0-full.nupkg` (134,892,401 bytes, SHA-256 `26eed931ac4dface36ddd27f75fc4bcdabbf3e393bc98966d9604a65fcfd5ec9`), and `RELEASES` (SHA-256 `c74aa79aaca493bc47ddbf6014e86bea451c81f2bbf946470677b9cfe7b32aa7`).
- The active ultra-speed workflow did not run tests, lint, type checking, accessibility checks, security checks, smoke checks, or screenshots. Successful compilation and packaging are not runtime verification.

## External dependencies

- The WorldLens design package is consumed from the immutable `worldlens-design-system-0.1.0.tgz` release asset. Published SHA-256: `cd7ccd70a1b73a3bf65914c3901d9c8d45d4b1dacd2956eb70a0db4524cb96eb`; source commit: `e6638a7e608e221c6bdd77f638d014368ae3d04f`.
- The runtime lane owns the control service, deployment artifacts, protocol implementation, and production telephony behavior. This UI sends only the documented control-service requests and never treats an unconfirmed response as success.
- The documentation site uses GitHub's stable latest-release asset route for the latest verified non-draft unsigned MaterialPBX 0.1.0 Windows installer. It does not hardcode a release tag or source commit that can become stale.
- GitHub Pages is live at <https://ding-ding-projects.github.io/MaterialPBX/>.
- Commit `41d75a5f2eb7cc7ac1426ee12fb0c4a668ed10f9` restricted release and Pages push triggers to `main` after release-created tags recursively triggered duplicate releases. Historical duplicates remain immutable; no tags or releases were deleted.

## Next actions

1. Keep the WorldLens tarball URL immutable and update it only through a reviewed design-system release.
2. Exercise the control-service preflight and feature mutations against a deployed runtime with a permitted account.
3. Run the full verification and capture workflow after leaving ultra-speed mode.
4. Verify the next unsigned Windows Squirrel installer from its final integrated commit.
