# Changelog

## Unreleased

### Changed

- Replaced the generic disconnected shell for extensions, trunks, incoming and outgoing routes, phone menus, queues, live operations, and paired servers with feature-specific visual control rooms and typed editors.
- Added a real control-service preflight with persisted non-secret endpoint, health and capability reads, live/offline/permission/incompatibility/degraded states, permission-aware record loading, and confirmed save results.
- Wired onboarding normal test-destination validation to the live control service without placing a call.
- Corrected public documentation to reflect the verified `build-3-5147a89` Windows release and live GitHub Pages site.
- Recorded that commit `41d75a5f2eb7cc7ac1426ee12fb0c4a668ed10f9` restricted release and Pages push triggers to `main`; historical duplicate releases remain immutable and no tags or releases were deleted.

### Verification

This ultra-speed change runs builds only. It does not run tests, lint, type checking, accessibility or security suites, smoke checks, or screenshots.

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

