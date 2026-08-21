param(
    [Parameter(Mandatory = $true)][string]$Tag,
    [string]$Repository = $(if ([string]::IsNullOrWhiteSpace($env:GITHUB_REPOSITORY)) { 'surakage/THSV-StreamBridge' } else { $env:GITHUB_REPOSITORY }),
    [string]$Destination = 'artifacts\published-release'
)

$ErrorActionPreference = 'Stop'
if ($Tag -notmatch '^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$') { throw "Invalid published release tag: $Tag" }
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$destinationPath = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $Destination))
[System.IO.Directory]::CreateDirectory($destinationPath) | Out-Null
$release = gh release view $Tag --repo $Repository --json tagName,isDraft,url | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $release.tagName -ne $Tag -or $release.isDraft -eq $true) { throw "$Tag is not a published GitHub release." }
gh release download $Tag --repo $Repository --dir $destinationPath --clobber
if ($LASTEXITCODE -ne 0) { throw "Could not download published assets for $Tag." }

function Assert-Checksum([string]$ArchivePath) {
    $checksumPath = "$ArchivePath.sha256"
    if (-not (Test-Path -LiteralPath $checksumPath -PathType Leaf)) { throw "Missing checksum for $(Split-Path -Leaf $ArchivePath)." }
    $expected = ((Get-Content -Raw -LiteralPath $checksumPath).Trim() -split '\s+')[0].ToUpperInvariant()
    $actual = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToUpperInvariant()
    if ($expected -ne $actual) { throw "Published checksum mismatch for $(Split-Path -Leaf $ArchivePath)." }
}

$version = $Tag.TrimStart('v')
$archive = Join-Path $destinationPath "THSV-StreamBridge-$version.zip"
$indexPath = Join-Path $destinationPath 'THSV-StreamBridge-AddOns-index.json'
if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) { throw 'Published core archive is missing.' }
if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) { throw 'Published add-on index is missing.' }
Assert-Checksum $archive
Assert-Checksum $indexPath
gh attestation verify $archive --repo $Repository | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Published core provenance verification failed.' }
gh attestation verify $indexPath --repo $Repository | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Published add-on index provenance verification failed.' }
$index = Get-Content -Raw -LiteralPath $indexPath | ConvertFrom-Json
$expectedAddOns = @($index.packages | ForEach-Object { [string]$_.archiveName } | Sort-Object)
$actualAddOns = @(Get-ChildItem -LiteralPath $destinationPath -Filter 'THSV-StreamBridge-AddOn-*.zip' -File | ForEach-Object Name | Sort-Object)
if (@(Compare-Object $expectedAddOns $actualAddOns).Count -gt 0) { throw 'Published optional add-on assets do not match their signed index.' }
foreach ($name in $actualAddOns) {
    $path = Join-Path $destinationPath $name
    Assert-Checksum $path
    gh attestation verify $path --repo $Repository | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Published provenance verification failed for $name." }
}

$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) "thsv-published-smoke-$([Guid]::NewGuid())"
try {
    Expand-Archive -LiteralPath $archive -DestinationPath $testRoot
    $roots = @(Get-ChildItem -LiteralPath $testRoot -Directory)
    $source = if (Test-Path -LiteralPath (Join-Path $testRoot 'release-manifest.json')) { $testRoot } elseif ($roots.Count -eq 1) { $roots[0].FullName } else { throw 'Published archive has an invalid root layout.' }
    $installRoot = Join-Path $testRoot 'installed'
    & (Join-Path $source 'runtime\node.exe') (Join-Path $source 'installer\install.mjs') --install-root $installRoot --no-start
    if ($LASTEXITCODE -ne 0) { throw 'Published archive clean installation failed.' }
    $manifest = Get-Content -Raw -LiteralPath (Join-Path $installRoot 'data\runtime\install-manifest.json') | ConvertFrom-Json
    if ($manifest.activeVersion -ne $version -or $manifest.installerMode -ne 'verified-portable-release' -or [string]::IsNullOrWhiteSpace([string]$manifest.buildFingerprint)) { throw 'Published installation provenance is incomplete.' }
} finally {
    if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}
$evidence = [ordered]@{ tag = $Tag; releaseUrl = $release.url; coreChecksumVerified = $true; provenanceVerified = $true; addOnCount = $actualAddOns.Count; addOnIndexMatched = $true; cleanInstall = $version; verifiedAt = [DateTime]::UtcNow.ToString('o') }
$evidencePath = Join-Path $destinationPath 'latest.json'
[System.IO.File]::WriteAllText($evidencePath, "$($evidence | ConvertTo-Json -Depth 4)`n", [System.Text.UTF8Encoding]::new($false))
[pscustomobject]$evidence
