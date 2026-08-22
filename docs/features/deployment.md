# One-click hosting

## Behavior

The hosted deployment uses the repository Docker Compose artifacts on a dedicated Linux AMD64 host and keeps its installer state visible.

The guided view presents validated pickers, switches, ranges, and clear suggested defaults. The expert view exposes the underlying Asterisk and FreePBX concepts without making raw configuration text the only path.

## Configuration

Open **One-click hosting** from navigation or the command palette. Every search field starts in plain-text mode and has its own anchored regular-expression builder. Changes are drafts until a connected control service validates and applies them.

## Failure modes

- Disconnected surfaces show no fake records and save local drafts only.
- Unsupported server capabilities remain visible with an exact explanation.
- Network, validation, or authorization failures keep the last known valid state and offer a recovery action.
- Long operations report determinate progress when byte or item counts are available, remain cancellable, and report partial results.

## Security and privacy

Credentials stay outside renderer storage, logs, exports, history, screenshots, and public records. Destructive actions identify the affected data and use the two-key plus full-range confirmation control. Operational and security warnings remain visible; promotional prompts are not shown.

## Verification

This initial ultra-speed implementation was built without tests, lint, type checking, accessibility suites, security suites, smoke checks, or screenshots. The interface labels the disconnected state and does not claim live PBX verification.

## Suggested articles

- [Guided onboarding](./onboarding.md)
- [Security](./security.md)
- [Live operations](./observability.md)
- [One-click hosting](./deployment.md)

