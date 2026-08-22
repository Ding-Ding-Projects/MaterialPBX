#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildReport, classifyPath, renderMarkdown } from "./count-lines.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePaths = [
  ".github/workflows/release.yml",
  ".github/workflows/pages.yml",
  "scripts/count-lines.mjs",
  "scripts/prepare-dim-sum-release-asset.mjs",
  "docs/features/release-evidence.md",
  "docs/features/site.md",
  "README.md",
  "CHANGELOG.md",
  "package.json",
  "site/package.json",
  "apps/desktop/package.json",
  "apps/web/package.json",
  "build.bat",
  "build-installer.bat",
  "scripts/build.ps1",
  "scripts/build-installer.ps1",
  "deploy/native/build-service-payloads.sh",
];
const files = new Map(
  sourcePaths.map((file) => [file, readFileSync(path.join(repositoryRoot, file), "utf8")]),
);

const required = [
  ["counter exact revision", "scripts/count-lines.mjs", 'runGit(["rev-parse", "--verify", `${revision}^{commit}`]'],
  ["counter tracked tree", "scripts/count-lines.mjs", 'runGit(["ls-tree", "-r", "--name-only", "-z", resolvedRevision]'],
  ["capture evidence classification", "scripts/count-lines.mjs", '/^docs\\/screenshots\\/.*\\.(?:gif|jpe?g|png|webp)$/i'],
  ["source category", "scripts/count-lines.mjs", '"Source"'],
  ["tests category", "scripts/count-lines.mjs", '"Tests and verification"'],
  ["styles category", "scripts/count-lines.mjs", '"Styles and markup"'],
  ["generated category", "scripts/count-lines.mjs", '"Generated"'],
  ["excluded category", "scripts/count-lines.mjs", '"Excluded"'],
  ["project total definition", "scripts/count-lines.mjs", 'projectTotal: "Hand-written source'],
  ["grand total definition", "scripts/count-lines.mjs", 'grandTotal: "Every tracked text line'],
  ["blame attribution", "scripts/count-lines.mjs", 'runGit(["blame", "--line-porcelain", "--root", revision'],
  ["attribution total assertion", "scripts/count-lines.mjs", "attribution.agent + attribution.people !== attribution.total"],
  ["workflow main-only push", ".github/workflows/release.yml", "branches:\n      - main"],
  ["supported installer entrypoint", ".github/workflows/release.yml", 'call "%GITHUB_WORKSPACE%\\build-installer.bat" /s'],
  ["installer batch verifier route", "build-installer.bat", "scripts\\build-installer.ps1"],
  ["installer verifier invokes runnable builder", "scripts/build-installer.ps1", "& (Join-Path $root 'build.bat') /s"],
  ["installer verifier invokes Squirrel package", "scripts/build-installer.ps1", "& pnpm package:windows | Out-Host"],
  ["runnable build invokes bounded root build", "scripts/build.ps1", "& pnpm build | Out-Host"],
  ["desktop Vite build", "apps/desktop/package.json", '"build": "vite build"'],
  ["desktop Squirrel package", "apps/desktop/package.json", '"package:windows": "pnpm build && electron-builder --win squirrel --publish never"'],
  ["web Vite build", "apps/web/package.json", '"build": "vite build"'],
  ["native payload builder", ".github/workflows/release.yml", "./deploy/native/build-service-payloads.sh"],
  ["native builder control-plane command", "deploy/native/build-service-payloads.sh", 'npm --prefix "$repo_root/services/control-plane" run build'],
  ["native builder helper command", "deploy/native/build-service-payloads.sh", 'npm --prefix "$repo_root/services/privileged-helper" run build'],
  ["emit-only native compiler", ".github/workflows/release.yml", "$manifest.scripts.build = $manifest.scripts.build -replace '(^|&&\\s*)tsc -p ', '${1}tsc --noCheck -p '"],
  ["native build manifest restoration", ".github/workflows/release.yml", "[IO.File]::WriteAllText((Resolve-Path $manifestPath), $originals[$manifestPath], $utf8)"],
  ["strict installed version", ".github/workflows/release.yml", "is not strictly newer than latest published installed version"],
  ["exact SHA counter", ".github/workflows/release.yml", "node scripts/count-lines.mjs --revision $env:GITHUB_SHA"],
  ["counter SHA assertion", ".github/workflows/release.yml", "Line counter measured $($count.revision), expected $env:GITHUB_SHA."],
  ["temporary canonical image", ".github/workflows/release.yml", 'Join-Path $env:RUNNER_TEMP "materialpbx-dish-'],
  ["canonical image hash proof", ".github/workflows/release.yml", "The anonymously downloaded canonical image differs from its reviewed metadata."],
  ["no copied image notes", ".github/workflows/release.yml", "Canonical public image (not copied into this release)"],
  ["consumer image staging refusal", ".github/workflows/release.yml", "Consumer releases must not attach copied dim-sum images"],
  ["native deployment bundle", ".github/workflows/release.yml", 'MaterialPBX-$version-native-host.zip'],
  ["bootstrap in deployment bundle", ".github/workflows/release.yml", "deploy/production-bootstrap.sh"],
  ["control payload in deployment bundle", ".github/workflows/release.yml", "dist/native-services/control-plane.tar.gz"],
  ["helper payload in deployment bundle", ".github/workflows/release.yml", "dist/native-services/privileged-helper.tar.gz"],
  ["native payload manifest proof", ".github/workflows/release.yml", "differs from manifest.sha256"],
  ["staged release manifest", ".github/workflows/release.yml", "release-evidence/release-assets.json"],
  ["tag ref absence", ".github/workflows/release.yml", 'git ls-remote --tags origin "refs/tags/$tag"'],
  ["tag ref collision refusal", ".github/workflows/release.yml", "Tag ref refs/tags/$tag already exists; refusing to overwrite or recycle it."],
  ["release record collision refusal", ".github/workflows/release.yml", "Release $tag already exists; refusing to overwrite or recycle it."],
  ["release tag name proof", ".github/workflows/release.yml", "$Release.tag_name -ne $Tag"],
  ["release target metadata proof", ".github/workflows/release.yml", "$Release.target_commitish -ne $env:GITHUB_SHA"],
  ["peeled tag proof", ".github/workflows/release.yml", "Published tag $Tag peels to $peeledCommit, expected $env:GITHUB_SHA."],
  ["bounded tag peel", ".github/workflows/release.yml", "$depth -lt 5"],
  ["published API asset size proof", ".github/workflows/release.yml", "$publishedAssets[$index].size -ne [int64]$ExpectedAssets[$index].bytes"],
  ["published asset download", ".github/workflows/release.yml", "gh release download $tag"],
  ["downloaded asset digest proof", ".github/workflows/release.yml", "differs byte-for-byte from staging"],
  ["first timing-pass body proof", ".github/workflows/release.yml", "Published release notes differ from the first timing-pass notes."],
  ["final timing-pass body proof", ".github/workflows/release.yml", "Published release notes differ from the final timing-pass notes."],
  ["two-pass timing bound", ".github/workflows/release.yml", "$publicationState.timingPasses = 2"],
  ["timing observed after first proof", ".github/workflows/release.yml", "$completedAt = [DateTimeOffset]::UtcNow"],
  ["final notes verification timestamp", ".github/workflows/release.yml", "$publicationState.finalNotesVerifiedAt = [DateTimeOffset]::UtcNow.ToString('o')"],
  ["timing start", ".github/workflows/release.yml", "Workflow started:"],
  ["timing completion", ".github/workflows/release.yml", "Workflow completed:"],
  ["timing duration", ".github/workflows/release.yml", "Workflow duration:"],
  ["immutable icon URL", ".github/workflows/release.yml", "https://raw.githubusercontent.com/Ding-Ding-Projects/MaterialPBX/$env:GITHUB_SHA/assets/generated/materialpbx.ico"],
  ["full icon commit SHA", ".github/workflows/release.yml", "Release commit $env:GITHUB_SHA is not a full lowercase commit SHA."],
  ["anonymous immutable icon fetch", ".github/workflows/release.yml", "Invoke-WebRequest -Uri $iconUrl"],
  ["immutable icon digest proof", ".github/workflows/release.yml", "The immutable public installer icon differs from the exact release commit's packaged icon."],
  ["post-build icon stability proof", ".github/workflows/release.yml", "The installer build changed the generated icon after immutable public-icon verification."],
  ["transient Squirrel icon configuration", ".github/workflows/release.yml", "$desktopPackage.build.squirrelWindows.iconUrl = $iconUrl"],
  ["single nuspec proof", ".github/workflows/release.yml", "does not contain exactly one nuspec"],
  ["nuspec icon URL proof", ".github/workflows/release.yml", "The packaged Squirrel nuspec does not contain the verified immutable icon URL."],
  ["publication step id", ".github/workflows/release.yml", "id: publish"],
  ["publication state record", ".github/workflows/release.yml", "release-evidence/publication-state.json"],
  ["terminal diagnostics", ".github/workflows/release.yml", "Collect safe terminal workflow diagnostics"],
  ["terminal publish outcome", ".github/workflows/release.yml", "steps.publish.outcome"],
  ["terminal publish conclusion", ".github/workflows/release.yml", "steps.publish.conclusion"],
  ["terminal job state", ".github/workflows/release.yml", "terminalPublicationState"],
  ["always diagnostics", ".github/workflows/release.yml", "if: ${{ always() }}"],
  ["terminal artifact upload", ".github/workflows/release.yml", "Upload safe terminal build and release evidence"],
  ["no files warning", ".github/workflows/release.yml", "if-no-files-found: warn"],
  ["bounded retention", ".github/workflows/release.yml", "retention-days: 14"],
  ["token fallback", ".github/workflows/release.yml", "secrets.RELEASE_TOKEN || secrets.ORG_TOKEN || secrets.GITHUB_TOKEN"],
  ["unsigned notice", ".github/workflows/release.yml", "The installer is intentionally unsigned"],
  ["serialized Pages deployment", ".github/workflows/pages.yml", "group: pages-production"],
  ["non-cancelling Pages deployment", ".github/workflows/pages.yml", "cancel-in-progress: false"],
  ["main-only manual deployment", ".github/workflows/pages.yml", "Documentation deployment is allowed only from refs/heads/main."],
  ["pure Pages workflow build", ".github/workflows/pages.yml", "pnpm build:site:ci"],
  ["pure root build graph", "package.json", '"build": "pnpm build:web && pnpm build:site:ci && pnpm build:desktop"'],
  ["pure Pages build graph", "package.json", '"build:site:ci": "pnpm --filter @materialpbx/site build"'],
  ["pure site build script", "site/package.json", '"build": "vite build"'],
  ["local verified site build", "site/package.json", '"build:verified": "vite build && node ../scripts/check-site-contract.mjs'],
  ["catalog repository", "scripts/prepare-dim-sum-release-asset.mjs", 'const CATALOG_REPOSITORY = "Ding-Ding-Projects/dim-sum-photos"'],
  ["catalog commit", "scripts/prepare-dim-sum-release-asset.mjs", 'const CATALOG_COMMIT = "2541e4f85d4eb28509789eb9697e4323b9ba55c5"'],
  ["catalog asset", "scripts/prepare-dim-sum-release-asset.mjs", 'const EXPECTED_ASSET_NAME = "hk-dish-0001-classic-har-gow.png"'],
  ["catalog size", "scripts/prepare-dim-sum-release-asset.mjs", "const EXPECTED_ASSET_BYTES = 2_406_444"],
  ["catalog digest", "scripts/prepare-dim-sum-release-asset.mjs", "c6ff2d32938f1e4c4ea685442f69227b8cd387f302ab8f8a62e8dd96c62b5ac0"],
  ["release documentation", "docs/features/release-evidence.md", "# Release evidence"],
  ["counter command", "package.json", '"count:lines": "node scripts/count-lines.mjs"'],
  ["contract command", "package.json", '"check:release-evidence": "node scripts/check-release-evidence-contract.mjs"'],
  ["README counter command", "README.md", "node scripts/count-lines.mjs --revision HEAD"],
  ["changelog evidence", "CHANGELOG.md", "Added a reproducible release line counter"],
];

const forbiddenWorkflowCommands = [
  /^\s*(?:-\s+run:\s*)?(?:pnpm|npm|npx|yarn)\s+(?:run\s+)?(?:test|lint|typecheck|type-check|check|audit|vitest|playwright)\b/im,
  /^\s*(?:-\s+run:\s*)?(?:node|python|py)\s+[^\r\n]*(?:test|lint|audit|screenshot|capture)[^\r\n]*$/im,
  /^\s*(?:-\s+)?uses:\s*[^\r\n]*(?:codeql|dependency-review|scorecard)[^\r\n]*$/im,
];

function validate(candidateFiles) {
  const failures = [];
  for (const [id, file, text] of required) {
    if (!candidateFiles.get(file)?.includes(text)) failures.push(`missing:${id}`);
  }
  for (const workflowPath of [".github/workflows/release.yml", ".github/workflows/pages.yml"]) {
    const workflow = candidateFiles.get(workflowPath) ?? "";
    for (const [index, pattern] of forbiddenWorkflowCommands.entries()) {
      if (pattern.test(workflow)) failures.push(`forbidden:${workflowPath}:quality-command-${index + 1}`);
    }
  }
  const release = candidateFiles.get(".github/workflows/release.yml") ?? "";
  const pages = candidateFiles.get(".github/workflows/pages.yml") ?? "";
  let rootPackage;
  let sitePackage;
  try {
    rootPackage = JSON.parse(candidateFiles.get("package.json") ?? "");
    sitePackage = JSON.parse(candidateFiles.get("site/package.json") ?? "");
  } catch {
    failures.push("forbidden:invalid-package-json");
    return failures;
  }
  if (rootPackage.scripts?.build !== "pnpm build:web && pnpm build:site:ci && pnpm build:desktop") {
    failures.push("forbidden:recursive-or-unbounded-root-build");
  }
  if (rootPackage.scripts?.["build:site:ci"] !== "pnpm --filter @materialpbx/site build") {
    failures.push("forbidden:transitive-pages-build-route");
  }
  if (sitePackage.scripts?.build !== "vite build") {
    failures.push("forbidden:transitive-site-quality-command");
  }
  if (/\bpnpm\s+(?:build|package:windows)\b/i.test(release)) {
    failures.push("forbidden:direct-installer-bypass");
  }
  if (!/pnpm build:site:ci\b/.test(pages) || /pnpm build:site(?:\s|$)/m.test(pages)) {
    failures.push("forbidden:pages-verified-build-route");
  }
  if (pages.includes("cancel-in-progress: true") || !pages.includes("group: pages-production")) {
    failures.push("forbidden:unsafe-pages-concurrency");
  }
  if (release.includes("--asset-output-dir release") || /release[/\\]hk-dish-[^\s]+[.]png/i.test(release)) {
    failures.push("forbidden:copied-catalog-image");
  }
  const publishIndex = release.indexOf("id: publish");
  const diagnosticsIndex = release.indexOf("Collect safe terminal workflow diagnostics");
  const uploadIndex = release.indexOf("Upload safe terminal build and release evidence");
  if (publishIndex < 0 || diagnosticsIndex <= publishIndex || uploadIndex <= diagnosticsIndex) {
    failures.push("forbidden:nonterminal-evidence-order");
  }
  const downloadedProofIndex = release.indexOf("$publicationState.downloadedAssetVerification = 'verified'");
  const firstNotesProofIndex = release.indexOf("Published release notes differ from the first timing-pass notes.");
  const completionCaptureIndex = release.indexOf("$completedAt = [DateTimeOffset]::UtcNow");
  const finalNotesProofIndex = release.indexOf("Published release notes differ from the final timing-pass notes.");
  const finalReadbackIndex = release.indexOf("$publicationState.finalNotesVerifiedAt = [DateTimeOffset]::UtcNow.ToString('o')");
  if (
    downloadedProofIndex < 0 ||
    firstNotesProofIndex <= downloadedProofIndex ||
    completionCaptureIndex <= firstNotesProofIndex ||
    finalNotesProofIndex <= completionCaptureIndex ||
    finalReadbackIndex <= finalNotesProofIndex
  ) {
    failures.push("forbidden:premature-or-unbounded-timing");
  }
  return failures;
}

assert.deepEqual(validate(files), [], "Release evidence contract is incomplete.");

let negativeChecks = 0;
for (const [id, file, text] of required) {
  const original = files.get(file);
  const position = original.indexOf(text);
  assert.notEqual(position, -1, `Required source for ${id} is absent before its negative regression.`);
  const mutated = new Map(files);
  mutated.set(file, original.replaceAll(text, ""));
  assert(validate(mutated).includes(`missing:${id}`), `Removing ${id} did not turn the contract red.`);
  negativeChecks += 1;
}

for (const [workflowPath, command] of [
  [".github/workflows/release.yml", "pnpm test"],
  [".github/workflows/release.yml", "pnpm lint"],
  [".github/workflows/pages.yml", "npm audit"],
]) {
  const mutated = new Map(files);
  mutated.set(workflowPath, `${files.get(workflowPath)}\n      - run: ${command}\n`);
  assert(validate(mutated).some((failure) => failure.startsWith(`forbidden:${workflowPath}:quality-command-`)));
  negativeChecks += 1;
}

for (const mutation of [
  ["package.json", '"build": "pnpm build:web && pnpm build:site:ci && pnpm build:desktop"', '"build": "pnpm -r --if-present build"', "forbidden:recursive-or-unbounded-root-build"],
  ["package.json", '"build:site:ci": "pnpm --filter @materialpbx/site build"', '"build:site:ci": "pnpm --filter @materialpbx/site build:verified"', "forbidden:transitive-pages-build-route"],
  ["site/package.json", '"build": "vite build"', '"build": "vite build && node ../scripts/check-site-contract.mjs"', "forbidden:transitive-site-quality-command"],
  [".github/workflows/release.yml", 'call "%GITHUB_WORKSPACE%\\build-installer.bat" /s', "pnpm package:windows", "forbidden:direct-installer-bypass"],
  [".github/workflows/pages.yml", "cancel-in-progress: false", "cancel-in-progress: true", "forbidden:unsafe-pages-concurrency"],
  [".github/workflows/release.yml", 'Join-Path $env:RUNNER_TEMP "materialpbx-dish-', 'Join-Path "release" "materialpbx-dish-', "missing:temporary canonical image"],
]) {
  const [file, before, after, expectedFailure] = mutation;
  const mutated = new Map(files);
  mutated.set(file, files.get(file).replace(before, after));
  assert(validate(mutated).includes(expectedFailure), `Mutation for ${expectedFailure} did not turn red.`);
  negativeChecks += 1;
}

{
  const release = files.get(".github/workflows/release.yml");
  const completionLine = "            $completedAt = [DateTimeOffset]::UtcNow\n";
  const firstProofLine = "              throw 'Published release notes differ from the first timing-pass notes.'\n";
  assert(release.includes(completionLine) && release.includes(firstProofLine));
  const movedCompletion = release
    .replace(completionLine, "")
    .replace(firstProofLine, `${completionLine}${firstProofLine}`);
  const mutated = new Map(files);
  mutated.set(".github/workflows/release.yml", movedCompletion);
  assert(
    validate(mutated).includes("forbidden:premature-or-unbounded-timing"),
    "Moving workflow completion before the first complete publication proof did not turn red.",
  );
  negativeChecks += 1;
}

assert.equal(
  classifyPath("docs/screenshots/website-home-desktop.png").category,
  "Generated",
  "Tracked interface captures must remain visible as generated evidence without inflating project source.",
);

const report = buildReport({ revision: "HEAD", cwd: repositoryRoot });
assert.equal(report.project.total, report.attribution.total);
assert.equal(report.project.nonblank, report.attribution.nonblank);
assert.equal(report.attribution.agent + report.attribution.people, report.attribution.total);
assert.equal(report.attribution.agentNonblank + report.attribution.peopleNonblank, report.attribution.nonblank);
assert.equal(report.grand.files, report.categories.reduce((sum, category) => sum + category.files, 0));
assert.equal(report.grand.total, report.categories.reduce((sum, category) => sum + category.total, 0));
assert.equal(report.grand.nonblank, report.categories.reduce((sum, category) => sum + category.nonblank, 0));
const markdown = renderMarkdown(report);
for (const label of ["Project total", "Grand total", "Surviving-line attribution", "Exclusions"]) {
  assert(markdown.includes(label), `Rendered line-count table is missing ${label}.`);
}

const trackedFiles = execFileSync("git", ["ls-files", "-z"], { cwd: repositoryRoot, encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
assert(
  !trackedFiles.some((file) => /^release\/hk-dish-.*[.]png$/i.test(file)),
  "A downloaded dim-sum image must not be committed to the repository.",
);

console.log(
  `Release evidence contract passed: ${required.length} exact requirements, ${negativeChecks} deliberate red-then-green negatives, ${report.project.total} attributed project lines at ${report.revision}.`,
);
