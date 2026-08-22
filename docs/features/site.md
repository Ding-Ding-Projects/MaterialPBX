# Landing and documentation site

## Behavior

The public site is for product introduction, documentation, downloads, status, settings, and links. It is not the PBX runtime.

It does not connect to a control service, load PBX records, or send PBX changes. Feature pages explain the real installed and hosted controls without sample live data. The public home page has a dedicated product-story shell: the administration drawer, open-tab strip, connection chip, and every disconnected-service diagnostic stay out of the first impression. The hero's concise boundary note remains the honest explanation of what the website does. Entering a guide restores the complete documentation navigation and visitor settings.

The public header keeps notifications, the command palette, settings, and the current installer reachable at every supported width. Wide layouts show the utility actions directly with bundled SVG icons. Intermediate and narrow layouts keep a compact **Get app** action beside one labelled overflow menu. That menu owns its plain-text-first filter, regular-expression mode, supported flags, validation message, result count, and no-match state; its actions call the same destinations as the wide controls. At the tightest width, the installer label yields to its icon while its accessible name and tooltip keep the action explicit.

The editorial hero combines the product explanation with an interactive call-route studio. Visitors can switch between an open office, an after-hours route, and a no-answer fallback; each choice rewrites the visible decision and destination without claiming a live call. Intermediate and high-scale desktop layouts keep a compact form of that real interactive route beside the headline inside the first fold instead of moving the whole preview below it. The phone-width composition remains single-column, with a modestly tighter headline so the first action arrives sooner. A separate playground uses a real selector, slider, and switch to generate one plain-language call-plan sentence. The beginner, hosted, paired-server, and desktop-lab paths use deliberately different visual weights instead of a flat grid of equal cards.

Both production site builds emit the canonical generated application icon as `materialpbx.ico`. The build contract requires that emitted file to be byte-identical to `assets/generated/materialpbx.ico`. Released Squirrel packages do not depend on the mutable site copy: the release workflow anonymously verifies a raw-content icon URL pinned to the exact release commit, supplies that immutable URL during packaging, and parses the packaged `.nuspec` to prove the same URL was stored.

The complete Asterisk feature atlas is derived from the real page registry, grouped by the human job each destination serves, and links every product capability to its explanatory page. The public commitment ribbon reports only source-derived counts and product rules; it does not invent service health or call statistics. One candidate-version value now drives both the visible release badge and every stable latest-release installer URL, preventing the header, download section, and product guides from naming different builds. The candidate is the unsigned MaterialPBX 0.1.1 Windows installer. That candidate URL remains unavailable until the 0.1.1 release is published and verified; the currently published non-draft release still carries 0.1.0. Windows may show an unknown-publisher or SmartScreen warning because code signing is intentionally disabled.

The guided walkthrough is site-specific at its final step. It creates a local Markdown planning checklist containing the visitor's selected call-path and safety choices, states that the file does not configure a PBX, and links to the production deployment guide. Live validation and application remain available only in the installed or hosted product.

The guided view presents validated pickers, switches, ranges, and clear suggested defaults. The expert view exposes the underlying Asterisk and FreePBX concepts without making raw configuration text the only path.

## Configuration

Open **Landing and documentation site** from navigation or the command palette. Site settings affect only this visitor's documentation experience. The GitHub Pages build uses the `/MaterialPBX/` base path, statically emits `https://ding-ding-projects.github.io/MaterialPBX/` as its Open Graph canonical URL, and publishes `site/dist/client`. The managed-hosting build uses `/`, statically emits `https://materialpbx.yeredow264.chatgpt.site/` as its canonical URL, emits a Cloudflare-compatible worker at `site/dist/server/index.js`, and carries only the opaque Sites project identifier in `site/.openai/hosting.json`. Each target's Open Graph image uses that same target's absolute HTTPS origin, so link crawlers receive correct metadata without running JavaScript.

GitHub Pages deployments share one `pages-production` concurrency group, never cancel an in-progress deployment, and fail when manually dispatched from any ref other than `refs/heads/main`.

The navigation search is connected to its own plain-text and regular-expression state. Several secondary searches and dropdown-local builders remain visible but are not fully wired; those limitations must not be described as complete until their focused interaction checks exist.

## Failure modes

- Disconnected surfaces show no fake records and save local drafts only.
- Unsupported server capabilities remain visible with an exact explanation.
- Network, validation, or authorization failures keep the last known valid state and offer a recovery action.
- Long operations report determinate progress when byte or item counts are available, remain cancellable, and report partial results.
- If managed hosting cannot be reached, GitHub Pages remains the public source-backed publication route. A local build is not presented as a successful deployment.
- Built output alone is not visual evidence. Capture proof must come from the approved hidden-desktop route, identify the exact built client and state, and keep publication, keyboard, contrast, and live-runtime claims separate.

## Security and privacy

Credentials stay outside renderer storage, logs, exports, history, screenshots, and public records. Destructive actions identify the affected data and use the two-key plus full-range confirmation control. Operational and security warnings remain visible; promotional prompts are not shown.

## Verification

The site is published through GitHub Pages at <https://ding-ding-projects.github.io/MaterialPBX/> and through managed production hosting at <https://materialpbx.yeredow264.chatgpt.site/>. The currently published 0.1.0 installer remains downloadable; the redesigned source's 0.1.1 installer and icon URLs are pending the next release and Pages publication. The release and Pages workflows were restricted to `main` pushes at commit `41d75a5f2eb7cc7ac1426ee12fb0c4a668ed10f9` after unrestricted pushes allowed release-created tags to trigger duplicate releases recursively. Historical duplicate releases remain immutable; no tag or release was deleted.

For the redesigned product story, `pnpm check:site` verifies 62 exact source requirements, the managed-hosting identifier boundary, and 62 independent deliberate red-then-green negative regressions. The inventory protects the dedicated public shell, omission of Home connection diagnostics, beginner definition, interactive route conditions, intermediate first-fold preview, responsive header actions, overflow-local search and regex state, keyboard entry and two-stage Escape behavior, compact installer action, truthful published-versus-candidate version sources, complete grouped feature atlas, no-nagging commitment, canonical icon source, emitted icon filename, visitor-controlled reduced motion, narrow single-column composition, serialized non-cancelling Pages deployment, and build-time target-specific metadata. After each production build, the same check parses every local script and stylesheet URL, verifies its exact base (`/MaterialPBX/` for GitHub Pages or `/` for managed hosting), requires exactly one target-specific absolute HTTPS `og:url` and `og:image`, rejects unresolved metadata placeholders, verifies the large-card metadata, and compares the built `materialpbx.ico` byte-for-byte with the canonical generated icon. Publication of this candidate remains pending.

<details>
<summary>Built-client Home captures</summary>

The three images below came from the built `/MaterialPBX/` client at the current uncommitted candidate, driven through the approved cheap named hidden-desktop route. They verify the rendered desktop composition, narrow composition, and open overflow state without touching the visible desktop. They do not establish deployed publication, keyboard-only operation, contrast, or live-PBX behavior.

![Dark-themed MaterialPBX website at desktop width, with a Get app button, a large “Your calls. Drawn out, not buried in forms.” hero, guided-setup and feature buttons, three product commitments, and an interactive call-route preview routing an incoming call to a team ring group.](../screenshots/website-home-desktop.png)

![Dark-themed MaterialPBX website at a narrow width, with the logo, Get app button, overflow control, single-column “Your calls. Drawn out, not buried in forms.” hero, guided-setup and feature buttons, and vertically stacked product commitments.](../screenshots/website-home-narrow.png)

![Narrow MaterialPBX website with the Website actions popover open above the hero, showing a filter field, regular-expression builder button, “5 of 5 actions shown,” and actions for How it works, Features, Notifications, Command palette, and Settings.](../screenshots/website-home-overflow.png)

</details>

Commit `27d5ff4bff8de086c04e68c4ddeec3b0f277cbc7` was independently read back from both source repositories before packaging. The managed archive contained 17 expected entries and both required entrypoints. Its owner-only production deployment reached `succeeded`, access was then changed to public, and unauthenticated HTTP reads of both live URLs returned `200`. Each page referenced its correct base-specific JavaScript asset, and both 734,551-byte assets contained the expected beginner, boundary, planning-export, and ring-group strings. These reads verify delivery and asset identity, not rendered interaction, layout, accessibility, or appearance.

## Suggested articles

- [Guided onboarding](./onboarding.md)
- [Security](./security.md)
- [Live operations](./observability.md)
- [One-click hosting](./deployment.md)
