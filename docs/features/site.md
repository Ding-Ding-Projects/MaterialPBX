# Landing and documentation site

## Behavior

The public site is for landing, documentation, downloads, status, settings, and links. It is not the PBX runtime.

It does not connect to a control service, load PBX records, or send PBX changes. Feature pages explain the real installed and hosted controls without sample live data. The home page links the verified unsigned MaterialPBX 0.1.0 Windows installer from release `build-3-5147a89`, built from commit `5147a896f8c65b863607378480d5fe46df04e31f`.

The guided view presents validated pickers, switches, ranges, and clear suggested defaults. The expert view exposes the underlying Asterisk and FreePBX concepts without making raw configuration text the only path.

## Configuration

Open **Landing and documentation site** from navigation or the command palette. Every search field starts in plain-text mode and has its own anchored regular-expression builder. Site settings affect only this visitor's documentation experience.

## Failure modes

- Disconnected surfaces show no fake records and save local drafts only.
- Unsupported server capabilities remain visible with an exact explanation.
- Network, validation, or authorization failures keep the last known valid state and offer a recovery action.
- Long operations report determinate progress when byte or item counts are available, remain cancellable, and report partial results.

## Security and privacy

Credentials stay outside renderer storage, logs, exports, history, screenshots, and public records. Destructive actions identify the affected data and use the two-key plus full-range confirmation control. Operational and security warnings remain visible; promotional prompts are not shown.

## Verification

The site is published at <https://ding-ding-projects.github.io/MaterialPBX/> and the verified installer link is live. The release and Pages workflows were restricted to `main` pushes at commit `41d75a5f2eb7cc7ac1426ee12fb0c4a668ed10f9` after unrestricted pushes allowed release-created tags to trigger duplicate releases recursively. Historical duplicate releases remain immutable; no tag or release was deleted. This ultra-speed change ran no tests, lint, type checking, accessibility or security suites, smoke checks, or screenshots.

## Suggested articles

- [Guided onboarding](./onboarding.md)
- [Security](./security.md)
- [Live operations](./observability.md)
- [One-click hosting](./deployment.md)

