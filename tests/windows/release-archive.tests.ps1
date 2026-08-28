param(
  [Parameter(Mandatory = $true)][string]$CurrentArchive,
  [Parameter(Mandatory = $true)][string]$PreviousArchive
)

$ErrorActionPreference = 'Stop'
$currentArchivePath = (Resolve-Path -LiteralPath $CurrentArchive).Path
$previousArchivePath = (Resolve-Path -LiteralPath $PreviousArchive).Path
$temporaryBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$testRoot = Join-Path $temporaryBase "thsv-release-archive-$([guid]::NewGuid())"
$resolvedTestRoot = [System.IO.Path]::GetFullPath($testRoot)
if (-not $resolvedTestRoot.StartsWith($temporaryBase, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe release-archive test root.' }

function Expand-Release([string]$Archive, [string]$Destination) {
  New-Item -ItemType Directory -Path $Destination | Out-Null
  Expand-Archive -LiteralPath $Archive -DestinationPath $Destination
  if (Test-Path -LiteralPath (Join-Path $Destination 'release-manifest.json')) { return $Destination }
  $roots = @(Get-ChildItem -LiteralPath $Destination -Directory)
  if ($roots.Count -ne 1) { throw "Release archive must contain exactly one top-level directory: $Archive" }
  return $roots[0].FullName
}

function Install-Release([string]$Source, [string]$Destination) {
  $node = Join-Path $Source 'runtime\node.exe'
  $installer = Join-Path $Source 'installer\install.mjs'
  & $node $installer --install-root $Destination --no-start --skip-acl
  if ($LASTEXITCODE -ne 0) { throw "Release installer failed for $Source" }
  return Get-Content -LiteralPath (Join-Path $Destination 'data\runtime\install-manifest.json') -Raw | ConvertFrom-Json
}

function Set-IsolatedPort([string]$Destination, [int]$Port) {
  $configPath = Join-Path $Destination 'data\configuration\bridge.local.json'
  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  $config.service.port = $Port
  $config | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $configPath -Encoding utf8
}

try {
  $currentSource = Expand-Release $currentArchivePath (Join-Path $resolvedTestRoot 'current')
  $previousSource = Expand-Release $previousArchivePath (Join-Path $resolvedTestRoot 'previous')
  $cleanRoot = Join-Path $resolvedTestRoot 'clean-install'
  $clean = Install-Release $currentSource $cleanRoot
  if ($clean.installerMode -ne 'verified-portable-release' -or -not $clean.buildFingerprint) { throw 'Clean install did not record verified build provenance.' }
  Set-IsolatedPort $cleanRoot 58787

  $repairTarget = Join-Path $cleanRoot "app\$($clean.activeVersion)\wizard\browser\index.html"
  Set-Content -LiteralPath $repairTarget -Value 'repair-test-corruption' -Encoding utf8
  $repair = Install-Release $currentSource $cleanRoot
  if ((Get-Content -LiteralPath $repairTarget -Raw) -eq 'repair-test-corruption') { throw 'Same-version repair did not restore the packaged file.' }
  if ($repair.buildFingerprint -ne $clean.buildFingerprint) { throw 'Same-version repair changed the build fingerprint.' }

  $upgradeRoot = Join-Path $resolvedTestRoot 'upgrade-install'
  $previous = Install-Release $previousSource $upgradeRoot
  Set-IsolatedPort $upgradeRoot 58788
  New-Item -ItemType Directory -Path (Join-Path $upgradeRoot 'data\state') -Force | Out-Null
  $marker = Join-Path $upgradeRoot 'data\state\release-upgrade-marker.txt'
  Set-Content -LiteralPath $marker -Value 'preserve-me' -Encoding utf8
  $upgraded = Install-Release $currentSource $upgradeRoot
  if ($upgraded.activeVersion -eq $previous.activeVersion) { throw 'Upgrade smoke test did not move to a newer release.' }
  if ((Get-Content -LiteralPath $marker -Raw).Trim() -ne 'preserve-me') { throw 'Upgrade did not preserve creator data.' }

  [pscustomobject]@{ cleanInstall = $clean.activeVersion; repair = $repair.activeVersion; upgradedFrom = $previous.activeVersion; upgradedTo = $upgraded.activeVersion; creatorDataPreserved = $true } | ConvertTo-Json -Compress
} finally {
  if (Test-Path -LiteralPath $resolvedTestRoot) { Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force }
}
