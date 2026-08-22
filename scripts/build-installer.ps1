param([switch]$Silent)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$started = Get-Date

& (Join-Path $root 'build.bat') /s
if ($LASTEXITCODE -ne 0) { throw "Application build failed with exit code $LASTEXITCODE." }
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
Push-Location $root
try {
  Write-Host '[MaterialPBX] Building an unsigned Squirrel.Windows installer.'
  & pnpm package:windows | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Squirrel.Windows packaging failed with exit code $LASTEXITCODE." }
} finally { Pop-Location }
$directory = Join-Path $root 'apps\desktop\dist\squirrel-windows'
$setup = Get-ChildItem $directory -Filter '*Setup.exe' -File | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
$releases = Join-Path $directory 'RELEASES'
$package = Get-ChildItem $directory -Filter '*.nupkg' -File | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
if (-not $setup -or -not (Test-Path $releases) -or -not $package) { throw 'Squirrel.Windows output is incomplete. Expected Setup.exe, RELEASES, and a full .nupkg.' }
$hash = Get-FileHash $setup.FullName -Algorithm SHA256
Write-Host '[MaterialPBX] The installer is intentionally unsigned and may show an unknown-publisher warning.'
Write-Host "[MaterialPBX] Installer: $($setup.FullName)"
Write-Host "[MaterialPBX] SHA-256: $($hash.Hash.ToLower())"
Write-Host ("[MaterialPBX] Installer build completed in {0:c}." -f ((Get-Date)-$started))

