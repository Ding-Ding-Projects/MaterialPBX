# Handoff

## Implemented in the UI lane

- Vue and Vuetify monorepo surface for web, desktop, and documentation-site builds.
- Real control-service client with a persisted non-secret endpoint, health and capability preflight, permission-aware resource reads and writes, bounded responses, and explicit offline, permission, incompatible, degraded, and live states.
- Guided onboarding covering extensions, devices, trunks, routes, emergency calling, NAT, firewall, TLS, SRTP, backups, and normal test calls.
- Feature navigation and guided/expert entry points for the planned FreePBX and Asterisk feature set.
- Settings for language, independent tone levels, dialog emoji, School mode, narration, themes, density, color, fonts, schedules, local vocabulary, attention accommodations, and external editor choices.
- Local history, notification history, command palette, exports, appearance editing, and destructive-action confirmation surfaces.
- Windows desktop shell with context isolation, sandboxing, external-link blocking, and an unsigned Squirrel.Windows packaging configuration.
- Dedicated editorial landing/documentation home with an interactive call-route studio, asymmetric beginner/hosted/paired/desktop journeys, live local control playground, registry-derived grouped feature atlas, no-nagging commitment, Open Graph metadata, an honest published-versus-candidate installer state, and an explicit no-PBX-control boundary.
- The public walkthrough exports a local Markdown planning checklist and links onward to the production deployment guide; it never presents disconnected validation as a working action.
- Landing selectors, the ring-time slider, and voice-encryption switch share one reactive preview. The Asterisk feature map is derived from the page registry, includes ring groups, uses the configured SVG icon paths, and collapses its branch connector correctly on narrow layouts.
- Dual publication adapters: GitHub Pages at the repository base path and managed Sites hosting with a Cloudflare-compatible worker entry.
- Per-feature documentation under `docs/features/`.

## Build state

- `pnpm check:site` verifies 62 exact landing/publication requirements, the managed-hosting identifier boundary, and 62 independent deliberate red-then-green negative regressions. Both production builds parse every local script and stylesheet URL, verify the exact `/MaterialPBX/` or `/` base, require target-specific absolute Open Graph URLs, and compare the emitted icon byte-for-byte with the canonical generated source. Vite still reports the existing initial-chunk size advisory.
- The approved cheap headless route captured the redesigned public Home at desktop and narrow widths, its working narrow overflow surface, and the freshly installed desktop application. The public-site captures remain candidate evidence until the exact source commit is published. They do not prove keyboard-only use, contrast, or live PBX behavior.
- The complete web, site, desktop, protocol, control-plane, and privileged-helper builds passed. The dependency audit reported no production vulnerabilities. Shell syntax, shell analysis, PowerShell parsing, PHP syntax, and whitespace checks passed.
- Generated unsigned Squirrel files: `MaterialPBX-0.1.1-x64-Setup.exe` (135,599,104 bytes, SHA-256 `45453d7a340deb70c49d063b526d2476dbfe4e7876c06c2e5196da6f221a0b20`), `materialpbx-desktop-0.1.1-full.nupkg` (134,508,235 bytes, SHA-256 `b997717ebb03e0aebc7c47edb2882eee2ca0753d3d8de2bd5048409fc8b0abd5`), and `RELEASES` (90 bytes, SHA-256 `2f630098b454e6ea2370eaaf0e227113f26d8df77063bd0ca3f2a48c6a6c1fda`). The 73-row installer contract and all five negative regressions passed.
- The prior candidate was uninstalled through Squirrel, the new Setup executable completed with exit code 0, the registry reports MaterialPBX 0.1.1, the installed executable is 210,164,224 bytes, and the installed application launched as a real 2220×1410 `Chrome_WidgetWin_1` window titled `MaterialPBX Desktop Lab` on the approved hidden desktop. The installed executable, updater, and Setup executable report `NotSigned`.
- Native compiler milestone at `44111eed9a6daccce70ca6a6eee570f3da8d7c4a`: enabled ring groups with validated PJSIP members, bounded ring time, and terminate failover compile into module-owned output through the FreePBX generation hook. Preview, diff, UUID snapshot, transactional apply/removal, single-use rollback, reload state, and pending runtime verification are returned independently.
- Disabled ring groups persist disabled desired state and transactionally snapshot and remove prior compiled output. Deletion likewise snapshots and removes compiled output. Unsupported edits state when prior output is retained and runtime may differ from desired state.
- Every typed application feature subset now has a bounded native compiler. Extensions, inbound/outbound routes, IVRs, queues, voicemail, time conditions, ring groups, and credentialless PJSIP trunks compile into module-owned artifacts with explicit validation. Cross-resource destination dispatch remains unproven until live runtime verification.
- FreePBX 17 runtime integration now uses the platform's `FreePBX\modules` BMO namespace, the `FreePBX::Database()` migration handle, and zero-argument `fwconsole` command construction with `FreePBX::create()`. Module version 0.1.0 installed and enabled, and its `materialpbx_resources`, `materialpbx_compiled`, and `materialpbx_compiler_snapshots` tables were created.
- The failed disposable first-boot proof established a concrete deployment fault: systemd mounted a new tmpfs at `/run`, obscuring the nested Compose mounts for input credentials and the helper socket. The corrected source mounts read-only credential input at `/etc/materialpbx/secrets-input`, writes generated database state under `/var/lib/materialpbx/control-plane`, and shares the helper socket under `/var/lib/materialpbx-helper`. Compose also waits for the helper runtime export before PBX initialization.
- The first corrected Compose launch exposed an independent entrypoint defect before installation: the PBX image placed `tini` at PID 1 and systemd at PID 2, so `/sbin/init` acted as a `telinit` client and exited. The image now launches `/sbin/init` directly as PID 1; the failed fresh project is retained as task evidence pending final cleanup.
- A subsequent fresh launch exposed the host-network FQDN boundary: Docker did not add the configured hostname to `/etc/hosts`, so `hostname -f` failed despite a dotted hostname. Compose now maps the configured PBX hostname to loopback before the official installer runs.
- First boot now preflights credentials before installation, separates the base-install and final-ready markers, resumes integration without repeating the base installer, disables only the unusable container-local fail2ban unit, and applies bounded checks for MariaDB, Redis, Apache, Asterisk, the bridge module, HTTP, and the helper socket before writing the final marker.
- `pnpm check:runtime-mounts` verified 139 required source-contract rows and 23 forbidden legacy patterns. Each inventoried source row's deliberate removal or reintroduction independently turned the contract red before the restored source passed. The control-plane and helper contract suites passed; the immutable FreePBX snapshot suite passed 27 cases and skipped four Windows-only-inapplicable POSIX ownership/mode/symlink cases. These remain source and local behavior checks; a real Debian 12 service lifecycle still requires separate runtime proof.
- Live database evidence showed a ring-group artifact and its snapshots compiled successfully. Single-use rollback restored the prior-null state by removing the compiled artifact and marking the snapshot restored. This proves migration, transactional compilation, snapshot creation, and rollback behavior for that exercised subset.
- Full FreePBX reload is not proven. The exercised container was an interrupted older bootstrap and lacked the generated custom include files required by the installed FreePBX configuration. A fresh clean lab image build and first boot remain pending, and hosted production still requires a dedicated Debian 12 amd64 host.
- The native production bootstrap now installs digest-verified, content-addressed control-plane and privileged-helper generations with hardened systemd units, authenticated readiness checks, request-snapshot binding, independent installed-manifest attestation, bounded process execution, and rollback. The complete payload builder succeeded from the locked pnpm store without network downloads: `control-plane.tar.gz` is 909,414 bytes with SHA-256 `49f80c794f3af478fb794fa3f292fe89681e57f9109a81343268f291df913a99`; `privileged-helper.tar.gz` is 141,767 bytes with SHA-256 `27835251beaeeeba844c46e79bc1fa9c0e1717681a54e4eb6517e2d355192d04`.
- GitHub Actions run `32597947154` completed the installer build and installer verification stages but failed before release publication when the native payload builder asked npm for a tarball that existed only in the pnpm store. Run `32598808924` reached the same stage and showed that pnpm's legacy deploy path also re-resolved an absent registry-metadata mirror. The repaired builder now uses pnpm's frozen shared-lockfile deploy path with injected workspace-package snapshots, dereferences the runtime graph, removes the unused virtual store and hidden package-manager metadata, and passed the complete local archive build with an explicitly empty metadata cache. A replacement workflow run and published-installer verification are still required.
- Release `build-120-27d5ff4` is a verified non-draft publication for the landing repair at `27d5ff4bff8de086c04e68c4ddeec3b0f277cbc7`. Its unsigned installer is 136,000,512 bytes with SHA-256 `d60a19fe4002e8d770ec209cfda41df290bfb134e83adafff010752c85853592`; the full package, `RELEASES`, and checksum manifest are attached to the same release.

## Hosted deployment preflight

- No server state was mutated during preflight.
- The current bootstrap supports amd64 Debian 12 only.
- The inventoried general host is ARM64 and therefore does not match the bootstrap architecture.
- The inventoried x86_64 host runs Debian 13, not Debian 12, and ports 80 and 443 are already owned by the unrelated HeapAndyville proxy.
- The other inventoried ARM64 host is busy.
- Deployment therefore remains blocked pending either a reviewed platform/network adaptation or a dedicated compatible host. Existing workloads and ports must not be displaced.

## External dependencies

- The WorldLens design package is consumed from the immutable `worldlens-design-system-0.1.0.tgz` release asset. Published SHA-256: `cd7ccd70a1b73a3bf65914c3901d9c8d45d4b1dacd2956eb70a0db4524cb96eb`; source commit: `e6638a7e608e221c6bdd77f638d014368ae3d04f`.
- The runtime lane owns the control service, deployment artifacts, protocol implementation, and production telephony behavior. This UI sends only the documented control-service requests and never treats an unconfirmed response as success.
- The documentation site uses GitHub's stable latest-release asset route for the 0.1.1 candidate and labels it unavailable until the latest verified non-draft release actually contains that asset. It does not hardcode a release tag or source commit that can become stale.
- GitHub Pages is live at <https://ding-ding-projects.github.io/MaterialPBX/>.
- A managed Sites project is bound in `site/.openai/hosting.json` and is public at <https://materialpbx.yeredow264.chatgpt.site/>. Its first exact-source deployment succeeded from commit `27d5ff4bff8de086c04e68c4ddeec3b0f277cbc7`; an unauthenticated read returned `200` and loaded the expected root-based 734,551-byte JavaScript asset.
- Commit `41d75a5f2eb7cc7ac1426ee12fb0c4a668ed10f9` restricted release and Pages push triggers to `main` after release-created tags recursively triggered duplicate releases. Historical duplicates remain immutable; no tags or releases were deleted.

## Next actions

1. Keep the WorldLens tarball URL immutable and update it only through a reviewed design-system release.
2. Exercise the control-service preflight and feature mutations against a deployed runtime with a permitted account.
3. Extend built-artifact capture coverage to every remaining application and documentation state; the public-site captures still need release-commit receipts.
4. Download and reinstall the workflow-produced 0.1.1 Setup executable, then compare its digest and installed state with the published manifest.
5. Decide whether to adapt the bootstrap for a supported inventoried platform or provision a dedicated Debian 12 amd64 host, without disturbing existing workloads.
6. Build and boot a fresh clean PBX container from the corrected mount and first-boot contract, then prove the final marker, required services, generated custom includes, helper socket, and a complete FreePBX reload.
7. Prove generated dialplan, disablement, deletion, actual calls/dispatch for every compiled subset, and credentialless PJSIP trunk behavior.
8. Implement the remaining native compilers only through documented FreePBX APIs or reviewed module-owned generation paths.
9. Run the remaining public-site keyboard, screen-reader, contrast, and live deployed-browser checks through the approved cheap headless route.
