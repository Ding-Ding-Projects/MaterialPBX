# Guided onboarding

## Behavior

The onboarding wizard explains every PBX concept in plain language, saves a local draft, validates every requirement, and applies once.

The public home page now leads with the same mental model: a call enters, one understandable condition decides what happens, and a visible destination receives it. The homepage route preview remains local and educational. **Build my first call path** opens the complete six-step walkthrough, whose final public step exports a planning checklist and never claims that a PBX was configured.

The guided view presents validated pickers, switches, ranges, and clear suggested defaults. The expert view exposes the underlying Asterisk and FreePBX concepts without making raw configuration text the only path.

## Configuration

Open **Guided onboarding** from navigation or the command palette. Every search field starts in plain-text mode and has its own anchored regular-expression builder. Changes are drafts until a connected control service validates and applies them.

## Failure modes

- Disconnected surfaces show no fake records and save local drafts only.
- Unsupported server capabilities remain visible with an exact explanation.
- Network, validation, or authorization failures keep the last known valid state and offer a recovery action.
- Long operations report determinate progress when byte or item counts are available, remain cancellable, and report partial results.

## Security and privacy

Credentials stay outside renderer storage, logs, exports, history, screenshots, and public records. Destructive actions identify the affected data and use the two-key plus full-range confirmation control. Operational and security warnings remain visible; promotional prompts are not shown.

## Verification

The redesigned public route compiled in both GitHub Pages and root-hosted production builds. Its source contract protects the route-studio entry point and public non-runtime boundary. Full keyboard, screen-reader, narrow-layout, and built-artifact visual verification remain pending under the upgraded release workflow.

## Suggested articles

- [Guided onboarding](./onboarding.md)
- [Security](./security.md)
- [Live operations](./observability.md)
- [One-click hosting](./deployment.md)
