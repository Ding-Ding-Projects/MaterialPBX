param(
  [switch]$Silent,
  [string]$ReleaseVersion = $env:MATERIALPBX_RELEASE_VERSION,
  [string]$PreviousReleaseVersion = $env:MATERIALPBX_PREVIOUS_RELEASE_VERSION
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$started = Get-Date
$desktopPackagePath = Join-Path $root 'apps\desktop\package.json'
$desktopPackage = Get-Content -LiteralPath $desktopPackagePath -Raw | ConvertFrom-Json
$packagingRoot = Join-Path $root 'apps\desktop\dist\squirrel-windows'
$artifactDirectory = Join-Path $packagingRoot 'squirrel-windows'
$expectedSetupName = "MaterialPBX-$($desktopPackage.version)-x64-Setup.exe"
$expectedPackageName = "materialpbx-desktop-$($desktopPackage.version)-full.nupkg"
$expectedDeltaName = "materialpbx-desktop-$($desktopPackage.version)-delta.nupkg"

function ConvertTo-StrictVersion([string]$Value, [string]$Label) {
  if ([string]::IsNullOrWhiteSpace($Value) -or $Value -notmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:\.(0|[1-9][0-9]*))?$') {
    throw "$Label '$Value' must be a numeric three- or four-part version such as 0.1.1 or 0.1.1.0."
  }
  return [Version]$Value
}

function ConvertTo-VersionQuad([Version]$Value) {
  return [Version]::new($Value.Major, $Value.Minor, $Value.Build, ([Math]::Max(0, $Value.Revision)))
}

$packageVersion = ConvertTo-StrictVersion ([string]$desktopPackage.version) 'Desktop package version'
$packageVersionQuad = ConvertTo-VersionQuad $packageVersion
$hasReleaseVersion = -not [string]::IsNullOrWhiteSpace($ReleaseVersion)
$hasPreviousReleaseVersion = -not [string]::IsNullOrWhiteSpace($PreviousReleaseVersion)
if ($hasReleaseVersion -xor $hasPreviousReleaseVersion) {
  throw 'Release builds must supply both MATERIALPBX_RELEASE_VERSION and MATERIALPBX_PREVIOUS_RELEASE_VERSION so package identity and monotonic update order are proved together.'
}
if ($hasReleaseVersion) {
  $explicitVersion = ConvertTo-StrictVersion $ReleaseVersion 'Explicit release version'
  $previousVersion = ConvertTo-StrictVersion $PreviousReleaseVersion 'Previous release version'
  if ($ReleaseVersion -cne [string]$desktopPackage.version -or $explicitVersion -ne $packageVersion) {
    throw "Explicit release version '$ReleaseVersion' does not exactly match apps/desktop/package.json version '$($desktopPackage.version)'."
  }
  if ($explicitVersion -le $previousVersion) {
    throw "Squirrel.Windows package version $explicitVersion is not newer than the previously published package version $previousVersion. Increment apps/desktop/package.json before releasing."
  }
  Write-Host "[MaterialPBX] Monotonic release version proved: $previousVersion -> $explicitVersion."
} else {
  Write-Host "[MaterialPBX] Local candidate version $packageVersion; no release monotonicity claim was requested."
}

function Test-PeStreamHasCertificateTable([IO.Stream]$Stream, [string]$Description) {
  if (-not $Stream.CanSeek) { throw "$Description cannot be inspected because its stream is not seekable." }
  if ($Stream.Length -lt 64) { throw "$Description is too short to be a valid PE file." }
  $reader = New-Object IO.BinaryReader($Stream, [Text.Encoding]::UTF8, $true)
  try {
    $Stream.Position = 0
    if ($reader.ReadUInt16() -ne 0x5A4D) { throw "$Description does not start with a DOS MZ header." }
    $Stream.Position = 0x3C
    $peOffset = [int64]$reader.ReadUInt32()
    if ($peOffset -lt 64 -or $peOffset + 26 -gt $Stream.Length) { throw "$Description has an invalid PE header offset." }
    $Stream.Position = $peOffset
    if ($reader.ReadUInt32() -ne 0x00004550) { throw "$Description does not contain a valid PE signature." }
    $optionalHeader = $peOffset + 24
    $Stream.Position = $optionalHeader
    $magic = $reader.ReadUInt16()
    if ($magic -eq 0x10B) { $dataDirectory = $optionalHeader + 96 }
    elseif ($magic -eq 0x20B) { $dataDirectory = $optionalHeader + 112 }
    else { throw "$Description has an unsupported PE optional-header magic value: $magic" }
    $certificateDirectory = $dataDirectory + (8 * 4)
    if ($certificateDirectory + 8 -gt $Stream.Length) { throw "$Description ends before its PE certificate directory." }
    $Stream.Position = $certificateDirectory
    $certificateOffset = $reader.ReadUInt32()
    $certificateSize = $reader.ReadUInt32()
    return $certificateOffset -ne 0 -or $certificateSize -ne 0
  } finally {
    $reader.Dispose()
  }
}

function Test-PeHasCertificateTable([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  try { return Test-PeStreamHasCertificateTable $stream $Path }
  finally { $stream.Dispose() }
}

function Get-StreamDigestHex([IO.Stream]$Stream, [ValidateSet('SHA1','SHA256')][string]$Algorithm) {
  if ($Stream.CanSeek) { $Stream.Position = 0 }
  $hasher = if ($Algorithm -eq 'SHA1') { [Security.Cryptography.SHA1]::Create() } else { [Security.Cryptography.SHA256]::Create() }
  try {
    $bytes = $hasher.ComputeHash($Stream)
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
  } finally {
    $hasher.Dispose()
  }
}

function Get-FileDigestHex([string]$Path, [ValidateSet('SHA1','SHA256')][string]$Algorithm) {
  $stream = [IO.File]::OpenRead($Path)
  try { return Get-StreamDigestHex $stream $Algorithm }
  finally { $stream.Dispose() }
}

function Get-RequiredArchiveEntry($Archive, [string]$ExpectedName) {
  $matches = @($Archive.Entries | Where-Object { $_.FullName -ieq $ExpectedName })
  if ($matches.Count -ne 1) { throw "The full package must contain exactly one '$ExpectedName' entry; found $($matches.Count)." }
  if ($matches[0].Length -le 0) { throw "The full package entry '$ExpectedName' is empty." }
  return $matches[0]
}

function Copy-ArchiveEntryToMemory($Entry) {
  $source = $Entry.Open()
  $memory = New-Object IO.MemoryStream
  try { $source.CopyTo($memory) }
  finally { $source.Dispose() }
  $memory.Position = 0
  return $memory
}

& (Join-Path $root 'build.bat') /s
if ($LASTEXITCODE -ne 0) { throw "Application build failed with exit code $LASTEXITCODE." }
$resolvedRoot = [IO.Path]::GetFullPath($root).TrimEnd([IO.Path]::DirectorySeparatorChar)
$resolvedPackagingRoot = [IO.Path]::GetFullPath($packagingRoot)
if (-not $resolvedPackagingRoot.StartsWith($resolvedRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to clear a packaging directory outside the checkout: $resolvedPackagingRoot"
}
if (Test-Path -LiteralPath $resolvedPackagingRoot) {
  Remove-Item -LiteralPath $resolvedPackagingRoot -Recurse -Force
}
$packagingStarted = Get-Date
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
$env:CSC_LINK = ''
$env:CSC_KEY_PASSWORD = ''
$env:WIN_CSC_LINK = ''
$env:WIN_CSC_KEY_PASSWORD = ''
Push-Location $root
try {
  Write-Host '[MaterialPBX] Building an unsigned Squirrel.Windows installer.'
  & pnpm package:windows | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Squirrel.Windows packaging failed with exit code $LASTEXITCODE." }
} finally { Pop-Location }

if (-not (Test-Path -LiteralPath $artifactDirectory -PathType Container)) {
  throw "Squirrel.Windows did not create the expected artifact directory: $artifactDirectory"
}
$setupCandidates = @(Get-ChildItem -LiteralPath $artifactDirectory -Filter '*-Setup.exe' -File)
$fullPackageCandidates = @(Get-ChildItem -LiteralPath $artifactDirectory -Filter '*-full.nupkg' -File)
$deltaPackageCandidates = @(Get-ChildItem -LiteralPath $artifactDirectory -Filter '*-delta.nupkg' -File)
$allPackageCandidates = @(Get-ChildItem -LiteralPath $artifactDirectory -Filter '*.nupkg' -File)
$msiCandidates = @(Get-ChildItem -LiteralPath $artifactDirectory -Filter '*.msi' -File)
if ($setupCandidates.Count -ne 1 -or $setupCandidates[0].Name -cne $expectedSetupName) {
  throw "Expected exactly one setup named $expectedSetupName; found $($setupCandidates.Name -join ', ')."
}
if ($fullPackageCandidates.Count -ne 1 -or $fullPackageCandidates[0].Name -cne $expectedPackageName) {
  throw "Expected exactly one full package named $expectedPackageName; found $($fullPackageCandidates.Name -join ', ')."
}
if ($deltaPackageCandidates.Count -gt 1 -or ($deltaPackageCandidates.Count -eq 1 -and $deltaPackageCandidates[0].Name -cne $expectedDeltaName)) {
  throw "Unexpected Squirrel.Windows delta-package set: $($deltaPackageCandidates.Name -join ', ')."
}
if ($allPackageCandidates.Count -ne (1 + $deltaPackageCandidates.Count)) {
  throw "Unexpected package files were produced: $($allPackageCandidates.Name -join ', ')."
}
if ($msiCandidates.Count -ne 0) { throw "MSI output is prohibited for this Squirrel-only release: $($msiCandidates.Name -join ', ')." }

$setupPath = $setupCandidates[0].FullName
$releasesPath = Join-Path $artifactDirectory 'RELEASES'
$packagePath = $fullPackageCandidates[0].FullName
$freshOutputs = @($setupCandidates + $allPackageCandidates)
$freshOutputs += Get-Item -LiteralPath $releasesPath -ErrorAction Stop
foreach ($output in $freshOutputs) {
  if ($output.LastWriteTimeUtc -lt $packagingStarted.ToUniversalTime().AddSeconds(-2)) {
    throw "Squirrel.Windows output is stale rather than produced by this run: $($output.FullName)"
  }
}

if (Test-PeHasCertificateTable $setupPath) {
  throw 'The permanent unsigned-packaging policy was violated. Setup.exe contains an Authenticode certificate table.'
}

$releaseLines = @(Get-Content -LiteralPath $releasesPath | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
if ($releaseLines.Count -ne $allPackageCandidates.Count) {
  throw "RELEASES contains $($releaseLines.Count) records for $($allPackageCandidates.Count) package files."
}
$releaseRecords = @{}
foreach ($line in $releaseLines) {
  $parts = $line.Trim() -split '\s+'
  if ($parts.Count -ne 3 -or $parts[0] -notmatch '^[0-9A-Fa-f]{40}$' -or $parts[2] -notmatch '^[0-9]+$') {
    throw "RELEASES contains a malformed record: $line"
  }
  $name = $parts[1]
  if ([IO.Path]::GetFileName($name) -cne $name -or $releaseRecords.ContainsKey($name)) {
    throw "RELEASES contains an unsafe or duplicate package name: $name"
  }
  $candidate = @($allPackageCandidates | Where-Object Name -CEQ $name)
  if ($candidate.Count -ne 1) { throw "RELEASES references a package not produced by this run: $name" }
  if ([int64]$parts[2] -ne $candidate[0].Length) {
    throw "RELEASES reports package size $($parts[2]), but $name is $($candidate[0].Length) bytes."
  }
  $actualSha1 = Get-FileDigestHex $candidate[0].FullName 'SHA1'
  if ($parts[0].ToLowerInvariant() -cne $actualSha1) { throw "RELEASES contains a digest that does not match $name." }
  $releaseRecords[$name] = $true
}
foreach ($candidate in $allPackageCandidates) {
  if (-not $releaseRecords.ContainsKey($candidate.Name)) { throw "RELEASES omits produced package $($candidate.Name)." }
}
if (-not $releaseRecords.ContainsKey($expectedPackageName)) { throw "RELEASES does not identify the expected full package $expectedPackageName." }

$winUnpacked = Join-Path $packagingRoot 'win-unpacked'
$packagedExecutable = Join-Path $winUnpacked 'MaterialPBX.exe'
$requiredUnpackedExecutables = @('MaterialPBX.exe', 'MaterialPBX_ExecutionStub.exe', 'Squirrel.exe')
foreach ($name in $requiredUnpackedExecutables) {
  $path = Join-Path $winUnpacked $name
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "The unpacked application is missing required executable $name." }
}
$unpackedExecutables = @(Get-ChildItem -LiteralPath $winUnpacked -Filter '*.exe' -File -Recurse)
foreach ($executable in $unpackedExecutables) {
  if (Test-PeHasCertificateTable $executable.FullName) { throw "The permanent unsigned-packaging policy was violated. $($executable.Name) contains an Authenticode certificate table." }
}

$packagedVersion = (Get-Item -LiteralPath $packagedExecutable).VersionInfo
$packagedProductVersion = ConvertTo-VersionQuad (ConvertTo-StrictVersion $packagedVersion.ProductVersion 'Packaged product version')
$packagedFileVersion = ConvertTo-VersionQuad (ConvertTo-StrictVersion $packagedVersion.FileVersion 'Packaged file version')
if ($packagedVersion.ProductName -cne 'MaterialPBX' -or
    $packagedVersion.CompanyName -cne 'Ding Ding Projects' -or
    $packagedVersion.FileDescription -cne 'MaterialPBX desktop lab' -or
    $packagedProductVersion -ne $packageVersionQuad -or
    $packagedFileVersion -ne $packageVersionQuad) {
  throw "The packaged executable has incorrect installed identity: product '$($packagedVersion.ProductName)', company '$($packagedVersion.CompanyName)', description '$($packagedVersion.FileDescription)', product version '$($packagedVersion.ProductVersion)', file version '$($packagedVersion.FileVersion)'."
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($packagePath)
try {
  $duplicateEntries = @($archive.Entries | Group-Object { $_.FullName.ToLowerInvariant() } | Where-Object Count -gt 1)
  if ($duplicateEntries.Count) { throw "The full package contains duplicate entry names: $($duplicateEntries.Name -join ', ')." }
  $mainEntry = Get-RequiredArchiveEntry $archive 'lib/net45/MaterialPBX.exe'
  Get-RequiredArchiveEntry $archive 'lib/net45/MaterialPBX_ExecutionStub.exe' | Out-Null
  Get-RequiredArchiveEntry $archive 'lib/net45/resources/app.asar' | Out-Null
  $iconEntry = Get-RequiredArchiveEntry $archive 'lib/net45/resources/assets/materialpbx.ico'
  Get-RequiredArchiveEntry $archive 'lib/net45/squirrel.exe' | Out-Null

  $nuspecEntries = @($archive.Entries | Where-Object { $_.FullName -like '*.nuspec' })
  if ($nuspecEntries.Count -ne 1) { throw "The full package must contain exactly one nuspec; found $($nuspecEntries.Count)." }
  $nuspecReader = New-Object IO.StreamReader($nuspecEntries[0].Open())
  try { [xml]$nuspec = $nuspecReader.ReadToEnd() }
  finally { $nuspecReader.Dispose() }
  if ([string]$nuspec.package.metadata.id -cne 'materialpbx-desktop' -or [string]$nuspec.package.metadata.version -cne [string]$desktopPackage.version) {
    throw "The full package nuspec identity is '$($nuspec.package.metadata.id)' version '$($nuspec.package.metadata.version)'."
  }

  foreach ($entry in @($archive.Entries | Where-Object { $_.FullName -like '*.exe' })) {
    $memory = Copy-ArchiveEntryToMemory $entry
    try {
      if (Test-PeStreamHasCertificateTable $memory $entry.FullName) { throw "The permanent unsigned-packaging policy was violated. $($entry.FullName) contains an Authenticode certificate table." }
    } finally { $memory.Dispose() }
  }

  $mainMemory = Copy-ArchiveEntryToMemory $mainEntry
  try { $archiveMainSha256 = Get-StreamDigestHex $mainMemory 'SHA256' }
  finally { $mainMemory.Dispose() }
  if ($archiveMainSha256 -cne (Get-FileDigestHex $packagedExecutable 'SHA256')) {
    throw 'The full package contains a different MaterialPBX.exe than the verified unpacked application.'
  }

  $iconMemory = Copy-ArchiveEntryToMemory $iconEntry
  try { $archiveIconSha256 = Get-StreamDigestHex $iconMemory 'SHA256' }
  finally { $iconMemory.Dispose() }
  $canonicalIcon = Join-Path $root 'assets\generated\materialpbx.ico'
  if ($archiveIconSha256 -cne (Get-FileDigestHex $canonicalIcon 'SHA256')) {
    throw 'The packaged runtime icon differs from the canonical generated application icon.'
  }
} finally {
  $archive.Dispose()
}

$hash = Get-FileDigestHex $setupPath 'SHA256'
Write-Host '[MaterialPBX] The installer and installed executable payloads are intentionally unsigned and may show an unknown-publisher warning.'
Write-Host "[MaterialPBX] Installer: $setupPath"
Write-Host "[MaterialPBX] Full package: $packagePath"
Write-Host "[MaterialPBX] Release index: $releasesPath"
Write-Host "[MaterialPBX] Installed identity: $($packagedVersion.ProductName), $($packagedVersion.CompanyName), version $($packagedVersion.ProductVersion)"
Write-Host "[MaterialPBX] SHA-256: $hash"
Write-Host ("[MaterialPBX] Installer build completed in {0:c}." -f ((Get-Date)-$started))
