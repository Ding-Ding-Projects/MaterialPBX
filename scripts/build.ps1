param([switch]$Silent)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$started = Get-Date

if (-not $Silent) {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host '[MaterialPBX] Requesting elevation before the build begins. User-scoped installs remain preferred.'
    try {
      Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$PSCommandPath`"")
      exit $LASTEXITCODE
    } catch { throw 'Elevation was declined before the build began.' }
  }
}

& (Join-Path $root 'download-dependencies.bat') /s
if ($LASTEXITCODE -ne 0) { throw "Dependency preparation failed with exit code $LASTEXITCODE." }
Push-Location $root
try {
  Write-Host '[MaterialPBX] Generating application icons and the social preview.'
  & pnpm assets | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Asset generation failed with exit code $LASTEXITCODE." }
  Write-Host '[MaterialPBX] Building the web app, documentation site, and Windows desktop renderer.'
  & pnpm build | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Build failed with exit code $LASTEXITCODE." }
} finally { Pop-Location }
Write-Host ("[MaterialPBX] Runnable builds completed in {0:c}." -f ((Get-Date)-$started))
if (-not $Silent) {
  $answer = Read-Host 'Open the web build now? [y/N]'
  if ($answer -match '^(y|yes)$') { Start-Process (Join-Path $root 'apps\web\dist\index.html') }
}

