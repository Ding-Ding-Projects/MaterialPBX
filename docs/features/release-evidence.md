# Release evidence

Every successful Windows release is tied to one exact commit and contains the verified unsigned Squirrel.Windows installer set, a complete native-host deployment bundle, checksums, reproducible source-scale evidence, canonical public dim-sum provenance, and measured publication timing. GitHub Actions builds, packages, and publishes. It does not run tests, lint, standalone type checks, accessibility checks, security checks, smoke checks, or screenshots.

## Supported build paths

The Windows release workflow invokes the repository's supported one-click installer entry point:

    build-installer.bat /s

That path builds the application, clears stale packaging output, creates the unsigned Squirrel.Windows files, validates the PE structure and unsigned state, checks RELEASES against the full package size and SHA-1, verifies installed product identity, and opens the full package to confirm its required payload.

The release workflow separately runs:

    ./deploy/native/build-service-payloads.sh

It packages the control plane and privileged helper with their production dependencies and creates manifest.sha256. Publication then creates MaterialPBX-<version>-native-host.zip, containing deploy/production-bootstrap.sh, the native service units and helpers, the FreePBX module, and both digest-verified service payloads. A downloaded native-host bundle therefore does not depend on files from a developer checkout.

The candidate desktop package version must be a three-part numeric version strictly newer than the highest installed Squirrel package version found across every public final release. A unique release tag does not make an equal installed version an upgrade, and a release marked “latest” cannot hide a newer installed version attached to another immutable historical release.

## Reproducible line count

Run the committed counter from the repository root:

    node scripts/count-lines.mjs --revision HEAD

The counter reads the tracked tree at the requested commit, not the mutable working directory. Its table separates source, tests and executable contract checks, styles and markup, documentation, configuration and data, generated files, and exclusions. It reports total and nonblank lines, a hand-written project total, and a grand total that keeps generated and excluded rows visible.

Interface captures under docs/screenshots/ are classified as generated evidence. They remain visible in generated file counts, contribute zero binary text lines, and do not inflate the hand-written project total.

Surviving-line attribution comes from git blame at the same commit. A line is classified as agent-authored when its commit author is a known automation identity or its commit carries an agent co-author trailer; all other lines are classified as people-authored. The counter fails if file counts, line counts, nonblank counts, or attribution totals do not add up exactly.

Dependency lockfiles are excluded from the project total because they describe resolved third-party dependencies rather than hand-written project code. Generated images remain visible as generated files but contribute zero text lines. Binary detection is based on bytes and strict UTF-8 decoding rather than filename alone.

## Canonical dim-sum provenance

The workflow resolves Classic Har Gow · 蝦餃 from the official Ding-Ding-Projects/dim-sum-photos catalog at pinned commit 2541e4f85d4eb28509789eb9697e4323b9ba55c5. It requires the public, non-draft catalog-v1 release asset hk-dish-0001-classic-har-gow.png with exactly 2,406,444 bytes and SHA-256 c6ff2d32938f1e4c4ea685442f69227b8cd387f302ab8f8a62e8dd96c62b5ac0.

The resolver bounds catalog, release-metadata, and image responses; uses a 30-second request deadline; permits HTTPS responses only from reviewed GitHub hosts; validates the catalog schema, bilingual dish names, release state, media type, PNG signature, byte count, and digest; and writes through a temporary file only after complete validation.

The temporary image exists only under the GitHub-hosted runner's temporary directory and is deleted immediately after verification. MaterialPBX does not stage, upload, attach, vendor, or commit a copied dim-sum image. Release notes carry the bilingual dish names, catalog revision, exact asset filename, byte size, SHA-256, and canonical public asset URL.

## Immutable installer icon

Squirrel package metadata uses an anonymous public raw-content URL pinned to the exact 40-character release commit:

    https://raw.githubusercontent.com/Ding-Ding-Projects/MaterialPBX/<commit>/assets/generated/materialpbx.ico

Before packaging, the workflow downloads that exact URL without repository credentials and compares its byte count and SHA-256 with assets/generated/materialpbx.ico. It then supplies the verified immutable URL to the packaging configuration for that run. After packaging, it opens the full .nupkg, parses its single .nuspec, and requires the stored iconUrl to equal the verified exact-commit URL.

This avoids a race with an independent documentation deployment and keeps the icon address referenced by an installed release immutable. The documentation site may also serve materialpbx.ico for visitors, but that mutable convenience copy is not the release package's integrity boundary.

## Publication and timing

The release tag includes the workflow run number, attempt number, and short commit. Publication fails closed when either the exact refs/tags/<tag> ref or a release record already exists. After publication, the workflow reads and boundedly peels the Git tag object and requires the resulting commit to equal GITHUB_SHA; target_commitish is checked as additional metadata, not treated as tag proof.

Before upload, every staged asset receives an exact filename, byte-size, and SHA-256 record in release-evidence/release-assets.json. After publication, the workflow:

1. verifies the public, non-draft, non-prerelease release, exact tag name, target metadata, peeled tag commit, API asset names, and API asset sizes;
2. downloads every published asset into a fresh runner-temporary directory;
3. rechecks the complete name set, byte size, and SHA-256 of every downloaded file against staging; and
4. removes the temporary download directory.

The timing section starts with the earliest actual job started_at. It does not use the release's initial published_at as workflow completion. Publication uses exactly two bounded timing passes. The first timing-bearing notes are published and read back while the release, tag, and asset inventory are re-verified. Only after that complete verification does the workflow capture Workflow completed. A second and final notes update persists that measured time, then the workflow reads the body back and verifies the release, tag, and assets again. The evidence record separately captures when that final readback completed. Duration uses stable HH:mm:ss formatting.

The installer is intentionally unsigned. Release notes state that Windows may show an unknown-publisher or SmartScreen warning and that the workflow did not perform quality or runtime verification.

## Terminal diagnostics

Publication remains a normal failing step: it does not use continue-on-error. The safe diagnostic collection and artifact-upload steps run after the publication attempt with always() and continue-on-error.

The diagnostic record includes safe run identity, commit, runner context, the publication step's outcome and conclusion, the terminal job state, whether a publication-state record exists, and exact local staged filenames, sizes, and SHA-256 values. Release outputs, final notes, evidence, publication state, and diagnostics are retained for 14 days. Diagnostic handling cannot turn a publication failure into success or replace its original cause.

## Failure modes

- An unclassifiable tracked path stops line counting instead of disappearing from the totals.
- A blame/count arithmetic mismatch stops publication instead of reporting inconsistent authorship.
- An equal or older installed version is rejected even when the proposed release tag is unique.
- A changed catalog schema, dish identity, release state, filename, media type, size, digest, or PNG signature stops canonical provenance verification.
- A copied image in consumer release staging stops publication.
- A missing or mismatched exact-commit installer icon stops before packaging; a mismatched packaged .nuspec stops before publication.
- An incomplete native service payload, bad payload manifest, or deployment archive missing a bootstrap dependency stops staging.
- An existing tag ref or release record is never overwritten or reused.
- A release whose tag, peeled commit, target metadata, asset set, downloaded size, downloaded digest, or final notes differ from the candidate is reported as failed.
- Either of the two bounded timing-note updates or readback proofs failing stops publication verification.
- Safe terminal outputs still upload on failure when artifact handling remains available; missing diagnostic files warn without masking the original failure.

## Security and privacy

The workflow uses RELEASE_TOKEN, then ORG_TOKEN, then GITHUB_TOKEN, and never prints a credential. Canonical public catalog and icon reads are anonymous integrity inputs. No private source, local user path, credential, dependency directory, cache, environment dump, or copied catalog photograph is added to the public release.

Code signing remains disabled. HTTPS, exact-commit URLs, package hashes, release-asset hashes, and tag/commit proof provide integrity evidence without claiming a digital signature.

## Verification

Run the focused source contract locally:

    pnpm check:release-evidence

The contract checks the workflow and package-script graph, rejects direct and transitive quality-check routes in GitHub Actions, requires the supported installer and native-payload builders, runs the real counter against HEAD, checks all arithmetic, classifies tracked captures, and proves every hand-written requirement with deliberate in-memory red-then-green mutations. It does not publish a release or mutate GitHub.

## Suggested articles

- [Windows desktop lab](./desktop.md)
- [Landing and documentation site](./site.md)
- [Status and notifications](./status-notifications.md)
- [One-click hosting](./deployment.md)
