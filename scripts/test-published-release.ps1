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

function Expand-ReleaseRoot([string]$ArchivePath, [string]$DestinationPath) {
    [System.IO.Directory]::CreateDirectory($DestinationPath) | Out-Null
    Expand-Archive -LiteralPath $ArchivePath -DestinationPath $DestinationPath
    if (Test-Path -LiteralPath (Join-Path $DestinationPath 'release-manifest.json')) { return $DestinationPath }
    $roots = @(Get-ChildItem -LiteralPath $DestinationPath -Directory)
    if ($roots.Count -ne 1) { throw "Published archive $(Split-Path -Leaf $ArchivePath) has an invalid root layout." }
    return $roots[0].FullName
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
    $source = Expand-ReleaseRoot $archive (Join-Path $testRoot 'current-clean')
    $installRoot = Join-Path $testRoot 'installed'
    & (Join-Path $source 'runtime\node.exe') (Join-Path $source 'installer\install.mjs') --install-root $installRoot --no-start
    if ($LASTEXITCODE -ne 0) { throw 'Published archive clean installation failed.' }
    $manifest = Get-Content -Raw -LiteralPath (Join-Path $installRoot 'data\runtime\install-manifest.json') | ConvertFrom-Json
    if ($manifest.activeVersion -ne $version -or $manifest.installerMode -ne 'verified-portable-release' -or [string]::IsNullOrWhiteSpace([string]$manifest.buildFingerprint)) { throw 'Published installation provenance is incomplete.' }
} finally {
    if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}

$previous = & (Join-Path $PSScriptRoot 'resolve-previous-release.ps1') -CurrentTag $Tag -Repository $Repository -Destination 'artifacts\published-release\previous' -AllowExistingCurrentRelease
$drillRoot = Join-Path ([System.IO.Path]::GetTempPath()) "thsv-published-lifecycle-$([Guid]::NewGuid())"
$creatorMarker = '{"preserved":true}'
try {
    $previousSource = Expand-ReleaseRoot $previous.archive (Join-Path $drillRoot 'previous-source')
    $currentSource = Expand-ReleaseRoot $archive (Join-Path $drillRoot 'current-source')
    $drillInstallRoot = Join-Path $drillRoot 'installed'
    & (Join-Path $previousSource 'runtime\node.exe') (Join-Path $previousSource 'installer\install.mjs') --install-root $drillInstallRoot --no-start
    if ($LASTEXITCODE -ne 0) { throw "Previous release $($previous.previousTag) installation failed." }
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    try { $listener.Start(); $isolatedPort = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port } finally { $listener.Stop() }
    $configurationPath = Join-Path $drillInstallRoot 'data\configuration\bridge.local.json'
    $configuration = Get-Content -Raw -LiteralPath $configurationPath | ConvertFrom-Json
    $configuration.service.port = $isolatedPort
    [System.IO.File]::WriteAllText($configurationPath, "$($configuration | ConvertTo-Json -Depth 20)`n", [System.Text.UTF8Encoding]::new($false))
    $markerPath = Join-Path $drillInstallRoot 'data\state\post-release-smoke.json'
    [System.IO.File]::WriteAllText($markerPath, $creatorMarker, [System.Text.UTF8Encoding]::new($false))
    & (Join-Path $currentSource 'runtime\node.exe') (Join-Path $currentSource 'installer\install.mjs') --install-root $drillInstallRoot --no-start
    if ($LASTEXITCODE -ne 0) { throw "Upgrade from $($previous.previousTag) to $Tag failed." }
    $upgradedManifest = Get-Content -Raw -LiteralPath (Join-Path $drillInstallRoot 'data\runtime\install-manifest.json') | ConvertFrom-Json
    if ($upgradedManifest.activeVersion -ne $version -or (Get-Content -Raw -LiteralPath $markerPath) -ne $creatorMarker) { throw 'Published upgrade did not preserve the expected version and creator data.' }
    & (Join-Path $currentSource 'runtime\node.exe') (Join-Path $currentSource 'installer\install.mjs') --install-root $drillInstallRoot --no-start
    if ($LASTEXITCODE -ne 0) { throw "Same-version reinstall of $Tag failed." }
    $savedPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $downgradeOutput = & (Join-Path $previousSource 'runtime\node.exe') (Join-Path $previousSource 'installer\install.mjs') --install-root $drillInstallRoot --no-start 2>&1 | Out-String
        $downgradeExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $savedPreference }
    if ($downgradeExit -eq 0 -or $downgradeOutput -notmatch 'Refusing to downgrade') { throw 'Rollback protection did not reject the older published release.' }
    $protectedManifest = Get-Content -Raw -LiteralPath (Join-Path $drillInstallRoot 'data\runtime\install-manifest.json') | ConvertFrom-Json
    if ($protectedManifest.activeVersion -ne $version -or (Get-Content -Raw -LiteralPath $markerPath) -ne $creatorMarker) { throw 'Rollback-protection drill changed the active version or creator data.' }
} finally {
    if (Test-Path -LiteralPath $drillRoot) { Remove-Item -LiteralPath $drillRoot -Recurse -Force }
}
$evidence = [ordered]@{ tag = $Tag; previousTag = $previous.previousTag; releaseUrl = $release.url; coreChecksumVerified = $true; provenanceVerified = $true; addOnCount = $actualAddOns.Count; addOnIndexMatched = $true; cleanInstall = $version; upgradedFrom = $previous.previousTag.TrimStart('v'); upgradedTo = $version; reinstall = $version; rollbackProtectionVerified = $true; creatorDataPreserved = $true; verifiedAt = [DateTime]::UtcNow.ToString('o') }
$evidencePath = Join-Path $destinationPath 'latest.json'
[System.IO.File]::WriteAllText($evidencePath, "$($evidence | ConvertTo-Json -Depth 4)`n", [System.Text.UTF8Encoding]::new($false))
[pscustomobject]$evidence
