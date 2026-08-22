import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = new Map(await Promise.all([
  "apps/desktop/package.json",
  "apps/desktop/electron/main.mjs",
  "apps/desktop/electron/preload.mjs",
  "apps/desktop/electron/after-pack.mjs",
  "scripts/download-dependencies.ps1",
  "scripts/build-installer.ps1",
  "site/vite.config.ts",
  ".github/workflows/release.yml",
].map(async relative => [relative, await readFile(path.join(root, relative), "utf8")])));

const requirements = [
  { id: "genuine-squirrel-target", file: "apps/desktop/package.json", text: '"target": ["squirrel"]' },
  { id: "public-squirrel-icon-url", file: "apps/desktop/package.json", text: '"iconUrl": "https://ding-ding-projects.github.io/MaterialPBX/materialpbx.ico"' },
  { id: "packaged-window-icon-resource", file: "apps/desktop/package.json", text: '{ "from": "../../assets/generated/materialpbx.ico", "to": "assets/materialpbx.ico" }' },
  { id: "public-squirrel-icon-source", file: "site/vite.config.ts", text: "new URL('../assets/generated/materialpbx.ico', import.meta.url)" },
  { id: "public-squirrel-icon-output", file: "site/vite.config.ts", text: "fileName: 'materialpbx.ico'" },
  { id: "signing-disabled", file: "apps/desktop/package.json", text: '"forceCodeSigning": false' },
  { id: "separate-resource-edit-hook", file: "apps/desktop/package.json", text: '"afterPack": "electron/after-pack.mjs"' },
  { id: "resource-editor-from-squirrel-toolchain", file: "apps/desktop/electron/after-pack.mjs", text: '"electron-winstaller", "vendor", "rcedit.exe"' },
  { id: "resource-editor-icon", file: "apps/desktop/electron/after-pack.mjs", text: '"--set-icon", icon' },
  { id: "resource-editor-product", file: "apps/desktop/electron/after-pack.mjs", text: '"--set-version-string", "ProductName", "MaterialPBX"' },
  { id: "resource-editor-company", file: "apps/desktop/electron/after-pack.mjs", text: '"--set-version-string", "CompanyName", "Ding Ding Projects"' },
  { id: "resource-editor-version", file: "apps/desktop/electron/after-pack.mjs", text: '"--set-product-version", version' },
  { id: "native-squirrel-updater", file: "apps/desktop/electron/main.mjs", text: "import { app, autoUpdater, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'" },
  { id: "squirrel-install-lifecycle", file: "apps/desktop/electron/main.mjs", text: "case '--squirrel-install':" },
  { id: "squirrel-update-lifecycle", file: "apps/desktop/electron/main.mjs", text: "case '--squirrel-updated':" },
  { id: "squirrel-uninstall-lifecycle", file: "apps/desktop/electron/main.mjs", text: "case '--squirrel-uninstall':" },
  { id: "squirrel-obsolete-lifecycle", file: "apps/desktop/electron/main.mjs", text: "case '--squirrel-obsolete':" },
  { id: "squirrel-lifecycle-awaited", file: "apps/desktop/electron/main.mjs", text: "const handlingSquirrelLifecycle = await handleSquirrelLifecycle()" },
  { id: "squirrel-lifecycle-timeout", file: "apps/desktop/electron/main.mjs", text: "Squirrel command timed out after" },
  { id: "squirrel-lifecycle-exit-check", file: "apps/desktop/electron/main.mjs", text: "Squirrel command exited with code" },
  { id: "squirrel-lifecycle-error-exit", file: "apps/desktop/electron/main.mjs", text: "app.exit(1)" },
  { id: "squirrel-shortcut-create", file: "apps/desktop/electron/main.mjs", text: "command = ['--createShortcut']" },
  { id: "squirrel-shortcut-remove", file: "apps/desktop/electron/main.mjs", text: "command = ['--removeShortcut']" },
  { id: "squirrel-first-run-delay", file: "apps/desktop/electron/main.mjs", text: "squirrelFirstRun ? 10000 : 3000" },
  { id: "squirrel-app-user-model-id", file: "apps/desktop/electron/main.mjs", text: "com.squirrel.materialpbx-desktop.MaterialPBX" },
  { id: "packaged-window-icon-resolution", file: "apps/desktop/electron/main.mjs", text: "path.join(process.resourcesPath, 'assets', 'materialpbx.ico')" },
  { id: "stable-release-feed", file: "apps/desktop/electron/main.mjs", text: "https://github.com/Ding-Ding-Projects/MaterialPBX/releases/latest/download" },
  { id: "update-readiness-true", file: "apps/desktop/electron/main.mjs", text: "readiness?.safeToRestart === true" },
  { id: "update-readiness-zero", file: "apps/desktop/electron/main.mjs", text: "unsavedWorkCount !== 0" },
  { id: "update-cancelled-fail-closed", file: "apps/desktop/electron/main.mjs", text: "installCancelled: true, message: `Restart was cancelled because the renderer did not confirm that all work was saved." },
  { id: "update-install-authorization", file: "apps/desktop/electron/main.mjs", text: "updateInstallAuthorized = true" },
  { id: "preload-update-status", file: "apps/desktop/electron/preload.mjs", text: "status: () => ipcRenderer.invoke('update:status')" },
  { id: "preload-update-subscription", file: "apps/desktop/electron/preload.mjs", text: "ipcRenderer.on('update:state', handler)" },
  { id: "preload-restart-readiness", file: "apps/desktop/electron/preload.mjs", text: "ipcRenderer.invoke('update:install', normalizeRestartReadiness(readiness))" },
  { id: "preload-unknown-count-fails-closed", file: "apps/desktop/electron/preload.mjs", text: ": -1" },
  { id: "winget-php-package-discovery", file: "scripts/download-dependencies.ps1", text: "PHP.PHP.8.4_*" },
  { id: "php-exact-version-probe", file: "scripts/download-dependencies.ps1", text: "echo PHP_VERSION;" },
  { id: "php-exact-version-contract", file: "scripts/download-dependencies.ps1", text: "validated PHP 8.4.x" },
  { id: "winget-warm-install-recheck", file: "scripts/download-dependencies.ps1", text: "if (-not $php) { throw \"PHP 8.4 installation or discovery failed with Windows Package Manager exit code $wingetExitCode.\" }" },
  { id: "php-path-refresh", file: "scripts/download-dependencies.ps1", text: "$env:Path = \"$phpDirectory;$env:Path\"" },
  { id: "php-immediate-exit-capture", file: "scripts/download-dependencies.ps1", text: "$phpExitCode = $LASTEXITCODE" },
  { id: "nested-artifact-directory", file: "scripts/build-installer.ps1", text: "$artifactDirectory = Join-Path $packagingRoot 'squirrel-windows'" },
  { id: "explicit-release-version", file: "scripts/build-installer.ps1", text: "$env:MATERIALPBX_RELEASE_VERSION" },
  { id: "previous-release-version", file: "scripts/build-installer.ps1", text: "$env:MATERIALPBX_PREVIOUS_RELEASE_VERSION" },
  { id: "monotonic-release-version", file: "scripts/build-installer.ps1", text: "$explicitVersion -le $previousVersion" },
  { id: "exact-release-version-match", file: "scripts/build-installer.ps1", text: "$ReleaseVersion -cne [string]$desktopPackage.version" },
  { id: "fresh-output", file: "scripts/build-installer.ps1", text: "Remove-Item -LiteralPath $resolvedPackagingRoot -Recurse -Force" },
  { id: "fresh-all-produced-outputs", file: "scripts/build-installer.ps1", text: "foreach ($output in $freshOutputs)" },
  { id: "single-setup-cardinality", file: "scripts/build-installer.ps1", text: "$setupCandidates.Count -ne 1" },
  { id: "single-full-package-cardinality", file: "scripts/build-installer.ps1", text: "$fullPackageCandidates.Count -ne 1" },
  { id: "delta-package-identity", file: "scripts/build-installer.ps1", text: "$deltaPackageCandidates[0].Name -cne $expectedDeltaName" },
  { id: "no-msi-output", file: "scripts/build-installer.ps1", text: "MSI output is prohibited" },
  { id: "unsigned-verification", file: "scripts/build-installer.ps1", text: "if (Test-PeHasCertificateTable $setupPath)" },
  { id: "all-unpacked-executables-unsigned", file: "scripts/build-installer.ps1", text: "foreach ($executable in $unpackedExecutables)" },
  { id: "all-package-executables-unsigned", file: "scripts/build-installer.ps1", text: "Test-PeStreamHasCertificateTable $memory $entry.FullName" },
  { id: "runtime-portable-pe-certificate-check", file: "scripts/build-installer.ps1", text: "$certificateDirectory = $dataDirectory + (8 * 4)" },
  { id: "runtime-portable-file-hash", file: "scripts/build-installer.ps1", text: "function Get-FileDigestHex" },
  { id: "packaged-product-identity", file: "scripts/build-installer.ps1", text: "$packagedVersion.ProductName -cne 'MaterialPBX'" },
  { id: "packaged-company-identity", file: "scripts/build-installer.ps1", text: "$packagedVersion.CompanyName -cne 'Ding Ding Projects'" },
  { id: "packaged-exact-product-version", file: "scripts/build-installer.ps1", text: "$packagedProductVersion -ne $packageVersionQuad" },
  { id: "packaged-exact-file-version", file: "scripts/build-installer.ps1", text: "$packagedFileVersion -ne $packageVersionQuad" },
  { id: "release-index-record-count", file: "scripts/build-installer.ps1", text: "$releaseLines.Count -ne $allPackageCandidates.Count" },
  { id: "release-index-digest", file: "scripts/build-installer.ps1", text: "$parts[0].ToLowerInvariant() -cne $actualSha1" },
  { id: "release-index-safe-package-name", file: "scripts/build-installer.ps1", text: "[IO.Path]::GetFileName($name) -cne $name" },
  { id: "installed-executable", file: "scripts/build-installer.ps1", text: "lib/net45/MaterialPBX.exe" },
  { id: "installed-execution-stub", file: "scripts/build-installer.ps1", text: "lib/net45/MaterialPBX_ExecutionStub.exe" },
  { id: "installed-app-archive", file: "scripts/build-installer.ps1", text: "lib/net45/resources/app.asar" },
  { id: "installed-window-icon", file: "scripts/build-installer.ps1", text: "lib/net45/resources/assets/materialpbx.ico" },
  { id: "installed-updater", file: "scripts/build-installer.ps1", text: "lib/net45/squirrel.exe" },
  { id: "package-nuspec-identity", file: "scripts/build-installer.ps1", text: "$nuspec.package.metadata.id -cne 'materialpbx-desktop'" },
  { id: "package-executable-identity", file: "scripts/build-installer.ps1", text: "contains a different MaterialPBX.exe" },
  { id: "package-icon-identity", file: "scripts/build-installer.ps1", text: "packaged runtime icon differs" },
  { id: "release-invokes-supported-installer", file: ".github/workflows/release.yml", text: 'call "%GITHUB_WORKSPACE%\\build-installer.bat" /s' },
];

const forbidden = [
  { id: "no-unsupported-updater-package", file: "apps/desktop/package.json", text: '"electron-updater"' },
  { id: "no-normal-window-during-squirrel-lifecycle", file: "apps/desktop/electron/main.mjs", text: "if (handlingSquirrelLifecycle) createWindow()" },
  { id: "no-runtime-specific-signature-cmdlet", file: "scripts/build-installer.ps1", text: "Get-AuthenticodeSignature" },
  { id: "no-runtime-specific-hash-cmdlet", file: "scripts/build-installer.ps1", text: "Get-FileHash" },
  { id: "no-prefix-product-version", file: "scripts/build-installer.ps1", text: "ProductVersion -notlike" },
];

function inspect(sourceFiles) {
  const problems = requirements
    .filter(row => !sourceFiles.get(row.file)?.includes(row.text))
    .map(row => row.id);
  for (const row of forbidden) {
    if (sourceFiles.get(row.file)?.includes(row.text)) problems.push(row.id);
  }
  return problems;
}

const problems = inspect(files);
if (problems.length) throw new Error(`Installer contract failed: ${problems.join(", ")}`);

for (const row of requirements) {
  const mutated = new Map(files);
  mutated.set(row.file, files.get(row.file).replace(row.text, `REMOVED_${row.id}`));
  if (!inspect(mutated).includes(row.id)) throw new Error(`Negative regression did not fail for ${row.id}`);
}

for (const row of forbidden) {
  const mutated = new Map(files);
  mutated.set(row.file, `${files.get(row.file)}\n${row.text}\n`);
  if (!inspect(mutated).includes(row.id)) throw new Error(`Negative regression did not fail for ${row.id}`);
}

console.log(`Installer contract passed: ${requirements.length} required rows and ${forbidden.length} forbidden rows; every negative regression turned red.`);
