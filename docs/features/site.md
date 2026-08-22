# Landing and documentation site

## Behavior

The public site is for landing, documentation, downloads, status, settings, and links. It is not the PBX runtime.

It does not connect to a control service, load PBX records, or send PBX changes. Feature pages explain the real installed and hosted controls without sample live data. The public home page has its own landing composition instead of presenting disconnected health metrics or disabled runtime controls. It starts with a visual call path, defines a PBX in ordinary language, and offers distinct beginner, expert, and production-deployment routes.

The home page demonstrates real selectors, sliders, switches, cards, and call-flow feedback so visitors can understand the interaction model without mistaking the website for a live controller. The feature map links every listed capability to an explanatory page. The download action uses GitHub's stable latest-release asset route for the latest verified non-draft unsigned MaterialPBX 0.1.0 Windows installer. Windows may show an unknown-publisher or SmartScreen warning because code signing is intentionally disabled.

The guided view presents validated pickers, switches, ranges, and clear suggested defaults. The expert view exposes the underlying Asterisk and FreePBX concepts without making raw configuration text the only path.

## Configuration

Open **Landing and documentation site** from navigation or the command palette. Site settings affect only this visitor's documentation experience. The GitHub Pages build uses the `/MaterialPBX/` base path and publishes `site/dist/client`. The managed-hosting build uses `/`, emits a Cloudflare-compatible worker at `site/dist/server/index.js`, and carries only the opaque Sites project identifier in `site/.openai/hosting.json`.

The navigation search is connected to its own plain-text and regular-expression state. Several secondary searches and dropdown-local builders remain visible but are not fully wired; those limitations must not be described as complete until their focused interaction checks exist.

## Failure modes

- Disconnected surfaces show no fake records and save local drafts only.
- Unsupported server capabilities remain visible with an exact explanation.
- Network, validation, or authorization failures keep the last known valid state and offer a recovery action.
- Long operations report determinate progress when byte or item counts are available, remain cancellable, and report partial results.
- If managed hosting cannot be reached, GitHub Pages remains the public source-backed publication route. A local build is not presented as a successful deployment.
- If the approved headless browser route is unavailable, visual behavior remains explicitly unverified even when both production builds compile.

## Security and privacy

Credentials stay outside renderer storage, logs, exports, history, screenshots, and public records. Destructive actions identify the affected data and use the two-key plus full-range confirmation control. Operational and security warnings remain visible; promotional prompts are not shown.

## Verification

The site is published at <https://ding-ding-projects.github.io/MaterialPBX/> and the verified installer link is live. The release and Pages workflows were restricted to `main` pushes at commit `41d75a5f2eb7cc7ac1426ee12fb0c4a668ed10f9` after unrestricted pushes allowed release-created tags to trigger duplicate releases recursively. Historical duplicate releases remain immutable; no tag or release was deleted.

For the dedicated landing composition, `pnpm check:site` verified 13 exact source requirements plus the managed-hosting identifier boundary. `pnpm build:site` produced the GitHub Pages client with the `/MaterialPBX/` base path. `pnpm --filter @materialpbx/site build:sites` produced the root-based client and `dist/server/index.js` worker. The required cheap headless browser route was unavailable and its direct CLI fallback was not installed, so no browser interaction, responsive inspection, accessibility runtime check, or screenshot is claimed. Vite continues to report that the initial CSS and JavaScript chunks exceed 500 kB.

## Suggested articles

- [Guided onboarding](./onboarding.md)
- [Security](./security.md)
- [Live operations](./observability.md)
- [One-click hosting](./deployment.md)
