param([switch]$Silent)
$ErrorActionPreference = 'Stop'
$started = Get-Date
$root = Split-Path -Parent $PSScriptRoot

function Write-Phase([string]$Message) { Write-Host "[MaterialPBX] $Message" }

function Get-PhpVersion([string]$Path) {
  $versionOutput = @(& $Path -r 'echo PHP_VERSION;' 2>$null)
  $versionExitCode = $LASTEXITCODE
  if ($versionExitCode -ne 0 -or $versionOutput.Count -ne 1 -or $versionOutput[0] -notmatch '^8\.4\.[0-9]+$') { return $null }
  try { return [Version]$versionOutput[0] }
  catch { return $null }
}

function Find-PhpExecutable {
  $candidates = New-Object Collections.Generic.List[string]
  $command = Get-Command php.exe -ErrorAction SilentlyContinue
  if ($command) { $candidates.Add($command.Source) }

  $wingetPackages = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
  if (Test-Path -LiteralPath $wingetPackages) {
    $packageDirectories = Get-ChildItem -LiteralPath $wingetPackages -Directory -Filter 'PHP.PHP.8.4_*' -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTimeUtc -Descending
    foreach ($directory in $packageDirectories) {
      $candidate = Get-ChildItem -LiteralPath $directory.FullName -File -Recurse -Filter 'php.exe' -ErrorAction SilentlyContinue |
        Select-Object -First 1
      if ($candidate) { $candidates.Add($candidate.FullName) }
    }
  }

  $seen = New-Object Collections.Generic.HashSet[string]([StringComparer]::OrdinalIgnoreCase)
  foreach ($candidatePath in $candidates) {
    if (-not $seen.Add($candidatePath)) { continue }
    $version = Get-PhpVersion $candidatePath
    if ($version) { return [pscustomobject]@{ Path = $candidatePath; Version = $version } }
  }
  return $null
}

Write-Phase 'Checking Node.js 22 or newer.'
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) {
  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $winget) { throw 'Node.js 22 or newer is missing, and winget is unavailable. Tried the Windows Package Manager canonical source.' }
  Write-Phase 'Installing Node.js LTS through Windows Package Manager.'
  & $winget.Source install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent --scope user | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Node.js installation failed with exit code $LASTEXITCODE." }
  $env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node) { throw 'Node.js installation completed but node.exe is not visible to this process.' }
}
$major = [int]((& $node.Source --version).TrimStart('v').Split('.')[0])
if ($major -lt 22) { throw "Node.js $major is installed; MaterialPBX requires version 22 or newer." }
Write-Phase "Using $(& $node.Source --version) from $($node.Source)."

Write-Phase 'Enabling the pinned pnpm package manager through Corepack.'
& corepack enable | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Corepack enable failed with exit code $LASTEXITCODE." }
& corepack prepare pnpm@10.33.2 --activate | Out-Host
if ($LASTEXITCODE -ne 0) { throw "pnpm 10.33.2 preparation failed with exit code $LASTEXITCODE." }

Write-Phase 'Installing locked project dependencies.'
Push-Location $root
try {
  if (Test-Path (Join-Path $root 'pnpm-lock.yaml')) { & pnpm install --frozen-lockfile | Out-Host }
  else { & pnpm install | Out-Host }
  if ($LASTEXITCODE -ne 0) { throw "pnpm install failed with exit code $LASTEXITCODE. The WorldLens design-system source commit must be available from GitHub." }
} finally { Pop-Location }

$elapsed = (Get-Date) - $started
Write-Phase ("Dependencies are ready in {0:c}." -f $elapsed)

Write-Phase 'Checking the PHP command-line interpreter for FreePBX module syntax checks.'
$php = Find-PhpExecutable
if (-not $php) {
  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $winget) { throw 'PHP is missing, and winget is unavailable. Tried the Windows Package Manager canonical source.' }
  Write-Phase 'Installing PHP through Windows Package Manager into the user scope.'
  & $winget.Source install PHP.PHP.8.4 --accept-package-agreements --accept-source-agreements --silent --scope user | Out-Host
  $wingetExitCode = $LASTEXITCODE
  $env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')
  $php = Find-PhpExecutable
  if (-not $php) { throw "PHP 8.4 installation or discovery failed with Windows Package Manager exit code $wingetExitCode." }
}
$phpPath = $php.Path
$phpDirectory = Split-Path -Parent $phpPath
if (($env:Path -split ';') -notcontains $phpDirectory) { $env:Path = "$phpDirectory;$env:Path" }
$phpVersionOutput = & $phpPath --version
$phpExitCode = $LASTEXITCODE
if ($phpExitCode -ne 0) { throw "PHP was found at $phpPath but could not execute (exit code $phpExitCode)." }
$phpVersionLine = $phpVersionOutput | Select-Object -First 1
if ($php.Version.Major -ne 8 -or $php.Version.Minor -ne 4) { throw "PHP $($php.Version) was selected, but MaterialPBX requires PHP 8.4.x." }
Write-Phase "Using $phpVersionLine from $phpPath (validated PHP 8.4.x)."
