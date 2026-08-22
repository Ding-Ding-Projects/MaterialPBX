# MaterialPBX

MaterialPBX is a guided, visual control surface for FreePBX and Asterisk. It keeps a beginner-friendly path beside an expert view, replaces configuration-only forms with typed controls wherever values can be discovered, and labels every disconnected or unverified state honestly.

- Documentation site: <https://ding-ding-projects.github.io/MaterialPBX/>
- Install: [MaterialPBX 0.1.0 for Windows](https://github.com/Ding-Ding-Projects/MaterialPBX/releases/download/build-3-5147a89/MaterialPBX-0.1.0-x64-Setup.exe) — verified unsigned Squirrel installer built from `5147a896f8c65b863607378480d5fe46df04e31f`.
- Delivery: production Linux hosting plus a Windows desktop lab.
- License: GPL-3.0-or-later.

## Contents

- [Guided onboarding](docs/features/onboarding.md)
- [Feature documentation](docs/features/README.md)
- [User guide](docs/user-guide/README.md)
- [Build and packaging](#build-and-packaging)
- [Architecture and safety boundary](#architecture-and-safety-boundary)
- [Roadmap](ROADMAP.md)
- [Handoff](HANDOFF.md)

<details>
<summary>Features and interaction model</summary>

The current interface includes guided and expert destinations for extensions, people, devices, trunks, incoming and outgoing routes, IVRs, queues, conferences, voicemail, recordings, announcements, opening hours, call detail records, call events, calendars, presence, parking, paging, WebRTC, paired PBX servers, backups, operations, and security.

It also includes browser-style tabs, settings, language modes, independent tone controls, narration choices, appearance controls, a continuous color picker and color translator, attention accommodations, schedules, local personal-vocabulary loading, local history, notification history, exports, command palette routing, offline documentation, and protected destructive actions.

The local Ollama suite manager and universal file converter are intentionally excluded by explicit project direction.

</details>

<details>
<summary>Build and packaging</summary>

On Windows, run `build.bat` for a runnable build or `build-installer.bat` for the unsigned Squirrel.Windows installer. Both call `download-dependencies.bat`, support `/s` and `--silent`, and install missing user-scoped tooling from canonical sources.

Direct commands on a prepared machine:

```powershell
pnpm install
pnpm assets
pnpm build
pnpm package:windows
```

Code signing is intentionally disabled. The installer may show an unknown-publisher or SmartScreen warning.

</details>

<details>
<summary>Architecture and safety boundary</summary>

The browser and desktop shells are clients of a typed control-service contract. A disconnected client returns empty real-data collections and refuses mutations. The interface therefore never substitutes sample data for a live PBX result.

The Windows desktop app is a lab and management client. The production telephony runtime belongs on the dedicated Linux host described by the deployment artifacts. The public site is landing, documentation, download, status, settings, and link content only; it is not the PBX runtime.

The web and Windows interfaces can preflight a real MaterialPBX control-service endpoint, read server health and the evidence-backed capability registry, distinguish offline, permission, incompatibility, degraded, read-only, and live states, and load only records returned by that server. The successful non-secret endpoint is stored locally; the admin credential exists only in the current in-memory client and is discarded on disconnect or reload. The public documentation site never makes this connection.

The release and Pages workflows now accept push events only on `main`. Commit `41d75a5f2eb7cc7ac1426ee12fb0c4a668ed10f9` added that restriction after release-created tags recursively triggered duplicate releases. Historical duplicate releases remain immutable, and no tags or releases were deleted.

MaterialPBX consumes the published `@worldlens/design-system` package. Shared colors, themes, component defaults, and tokens stay owned by WorldLens instead of being copied here.

</details>

<details>
<summary>Verification state and scale estimate</summary>

This ultra-speed implementation deliberately did not run tests, lint, type checking, accessibility suites, security suites, smoke checks, or screenshots. Build and packaging outcomes are reported separately and do not imply runtime verification.

No release line count exists yet. The first release workflow will run the committed counter and publish source, tests, styles/markup, generated, excluded, and attribution totals. A human-effort estimate will then be calculated from the hand-written count using a disclosed range rather than invented before the count exists.

</details>

