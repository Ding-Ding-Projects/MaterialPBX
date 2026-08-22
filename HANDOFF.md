# Handoff

## Implemented in the UI lane

- Vue and Vuetify monorepo surface for web, desktop, and documentation-site builds.
- Typed disconnected client that refuses live mutations and returns no fake records.
- Guided onboarding covering extensions, devices, trunks, routes, emergency calling, NAT, firewall, TLS, SRTP, backups, and normal test calls.
- Feature navigation and guided/expert entry points for the planned FreePBX and Asterisk feature set.
- Settings for language, independent tone levels, dialog emoji, School mode, narration, themes, density, color, fonts, schedules, local vocabulary, attention accommodations, and external editor choices.
- Local history, notification history, command palette, exports, appearance editing, and destructive-action confirmation surfaces.
- Windows desktop shell with context isolation, sandboxing, external-link blocking, and an unsigned Squirrel.Windows packaging configuration.
- Landing/documentation site with Open Graph metadata and a verified-download placeholder that stays disabled until release proof exists.
- Per-feature documentation under `docs/features/`.

## Build state

- `pnpm build` completed for the web interface, documentation site, and desktop renderer.
- `pnpm package:windows` completed with `electron-builder` 26.15.3 and explicit signing disablement.
- Generated unsigned Squirrel files: `MaterialPBX-0.1.0-x64-Setup.exe` (135,967,744 bytes, SHA-256 `c0379360caa2ca0678d24c075d6c36cb7371a7c4d77f34bc02348ca4311b390f`), `materialpbx-desktop-0.1.0-full.nupkg` (134,874,490 bytes, SHA-256 `c3e9290fb8c10a4e4ebc976eeb1bee22aa10de803acd447c99b55e171f7992d4`), and `RELEASES` (SHA-256 `3ea0efa34be5b442afee801939e9d40aec3db050fd8c65c719485217dfc3b968`).
- The active ultra-speed workflow did not run tests, lint, type checking, accessibility checks, security checks, smoke checks, or screenshots. Successful compilation and packaging are not runtime verification.

## External dependencies

- The WorldLens design package is consumed from the immutable `worldlens-design-system-0.1.0.tgz` release asset. Published SHA-256: `cd7ccd70a1b73a3bf65914c3901d9c8d45d4b1dacd2956eb70a0db4524cb96eb`; source commit: `e6638a7e608e221c6bdd77f638d014368ae3d04f`.
- The runtime lane owns the control service, deployment artifacts, protocol implementation, and production telephony behavior.
- A verified release asset does not yet exist, so the documentation site correctly shows no active download button.

## Next actions

1. Keep the WorldLens tarball URL immutable and update it only through a reviewed design-system release.
2. Integrate the protocol package and real control-service adapter.
3. Run the full verification and capture workflow after leaving ultra-speed mode.
4. Publish and verify the first Windows Squirrel release from the committed build path.
5. Enable GitHub Pages and verify served metadata, image retrieval, and every route.
