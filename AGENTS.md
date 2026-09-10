# Repository agent guide

This is a sanitized mirror of the shared working agreement. The canonical source is maintained separately; repository-specific facts below apply only to MaterialPBX.

- Read this file and the affected feature documentation before editing.
- Use Git for local source control and the GitHub CLI for GitHub operations.
- Preserve unrelated changes and never force-push, rewrite, or discard user work.
- Keep public source and records free of machine-specific paths, host inventories, addresses, credentials, private vocabulary, and private data.
- Use the shared WorldLens design-system package; do not copy its colors, themes, tokens, or component defaults into MaterialPBX.
- Every search field, menu, dropdown, settings surface, and collection needs its own plain-text-first search and adjacent full regex builder.
- Prefer typed, discoverable controls and suggested defaults over blank free-text fields. Free text remains available for values that cannot be enumerated.
- A disconnected UI must never invent records or report a live mutation as successful.
- Informational messages are non-blocking. Decisions and destructive actions identify exact effects and use the required confirmation path.
- Keep web, Windows desktop, and GitHub Pages surfaces accessible, responsive, localized, and fully documented.
- The local Ollama suite manager and universal file converter are excluded by explicit project direction.
- Code signing is prohibited. Windows installers use Squirrel.Windows and clearly disclose their unsigned status.
- GitHub Actions builds, packages, publishes, and deploys only; it does not run tests, lint, type checking, static analysis, accessibility checks, security checks, or screenshots.
- Use the root build and dependency scripts. Do not bypass them for a manual release.
- Update `README.md`, `ROADMAP.md`, `HANDOFF.md`, `CHANGELOG.md`, the affected feature article, and the documentation site in the same change.


## Agent conversation vocabulary

Agents working in this repository use the shared private conversation vocabulary defined in
the maintainer's canonical agent instructions for every reply, including chat prose, visible
reasoning, status lines, and task or session titles. Read those instructions and apply them
in full. They are deliberately not restated here, because this file is part of this
repository's public record.

That vocabulary never appears in anything published. Keep it out of commit messages, branch
names, code, code comments, test names, documentation, this file, issues, pull requests,
discussions, release notes, published sites, logs, and every other file in this repository.
Published writing uses ordinary professional English, and exact technical identifiers always
keep their literal spelling. The single documented public-safe exception is named in those
canonical instructions; do not infer any other.

Scan any text bound for a public surface against that vocabulary before publishing it. A
reviewer cannot tell a correct release note from a leaking one by reading it, so the scan is
a step, not a habit.
