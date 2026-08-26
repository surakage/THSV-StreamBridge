param([Parameter(Mandatory = $true)][string]$CurrentArchive)

$ErrorActionPreference = 'Stop'
$archivePath = (Resolve-Path -LiteralPath $CurrentArchive).Path
$temporaryBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$testRoot = Join-Path $temporaryBase "thsv-trigger-recovery-$([guid]::NewGuid())"
$resolvedTestRoot = [System.IO.Path]::GetFullPath($testRoot)
if (-not $resolvedTestRoot.StartsWith($temporaryBase, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe trigger-recovery test root.' }

try {
  $releaseExtract = Join-Path $resolvedTestRoot 'release'
  $fixtureRoot = Join-Path $resolvedTestRoot 'fixture'
  New-Item -ItemType Directory -Path $releaseExtract | Out-Null
  Expand-Archive -LiteralPath $archivePath -DestinationPath $releaseExtract
  $releaseRoot = if (Test-Path -LiteralPath (Join-Path $releaseExtract 'release-manifest.json')) { $releaseExtract } else {
    $roots = @(Get-ChildItem -LiteralPath $releaseExtract -Directory)
    if ($roots.Count -ne 1) { throw 'Release archive must contain exactly one top-level directory.' }
    $roots[0].FullName
  }
  $node = Join-Path $releaseRoot 'runtime\node.exe'
  $testScript = Join-Path $PSScriptRoot 'streamerbot-trigger-recovery.tests.mjs'
  $output = & $node $testScript $releaseRoot $fixtureRoot
  if ($LASTEXITCODE -ne 0) { throw 'Packaged Streamer.bot trigger recovery lifecycle failed.' }
  $result = $output | Select-Object -Last 1 | ConvertFrom-Json
  if ($result.repairedTriggers -ne 29 -or $result.postRepairRestartReady -ne $true -or $result.verifiedRollback -ne $true) { throw 'Packaged trigger recovery evidence was incomplete.' }
  $result | ConvertTo-Json -Compress
} finally {
  if (Test-Path -LiteralPath $resolvedTestRoot) { Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force }
}
