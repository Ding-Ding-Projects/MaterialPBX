param([switch]$Silent)
$ErrorActionPreference = 'Stop'
$started = Get-Date
$root = Split-Path -Parent $PSScriptRoot

function Write-Phase([string]$Message) { Write-Host "[MaterialPBX] $Message" }

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

