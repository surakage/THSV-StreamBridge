param(
    [Parameter(Mandatory = $true)][string]$Tag,
    [string]$Repository = $(if ([string]::IsNullOrWhiteSpace($env:GITHUB_REPOSITORY)) { 'surakage/THSV-StreamBridge' } else { $env:GITHUB_REPOSITORY }),
    [string]$Destination = 'artifacts\published-release',
    [switch]$AllowLegacyEvidence
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

function Get-Sha256([string]$PathValue) {
    $stream = [System.IO.File]::OpenRead($PathValue)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try { return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $sha256.Dispose(); $stream.Dispose() }
}

function Assert-Checksum([string]$ArchivePath) {
    $checksumPath = "$ArchivePath.sha256"
    if (-not (Test-Path -LiteralPath $checksumPath -PathType Leaf)) { throw "Missing checksum for $(Split-Path -Leaf $ArchivePath)." }
    $expected = ((Get-Content -Raw -LiteralPath $checksumPath).Trim() -split '\s+')[0].ToUpperInvariant()
    $actual = (Get-Sha256 $ArchivePath).ToUpperInvariant()
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

function Assert-AuthenticodeEvidence([string]$ReleaseRoot) {
    Import-Module Microsoft.PowerShell.Security -ErrorAction Stop
    $signingPath = Join-Path $ReleaseRoot 'windows-signing.json'
    if (-not (Test-Path -LiteralPath $signingPath -PathType Leaf)) { throw 'Published archive is missing windows-signing.json.' }
    $signing = Get-Content -Raw -LiteralPath $signingPath | ConvertFrom-Json
    $runtime = Get-AuthenticodeSignature -LiteralPath (Join-Path $ReleaseRoot 'runtime\node.exe')
    if ($runtime.Status -ne 'Valid' -or $null -eq $runtime.SignerCertificate) { throw "Published runtime Authenticode verification failed: $($runtime.Status) $($runtime.StatusMessage)" }
    if ([string]$signing.runtime.signer.thumbprint -ne $runtime.SignerCertificate.Thumbprint) { throw 'Published runtime signer does not match windows-signing.json.' }
    if ($null -eq $runtime.TimeStamperCertificate) { throw 'Published runtime Authenticode signature does not contain trusted timestamp evidence.' }
    $verifiedFirstParty = 0
    if ($signing.firstParty.configured -eq $true) {
        if ([string]$signing.firstParty.signer.thumbprint -notmatch '^[A-Fa-f0-9]{40,64}$' -or [int]$signing.firstParty.signedPowerShellCount -ne @($signing.firstParty.signedPaths).Count -or [int]$signing.firstParty.timestampedPowerShellCount -ne @($signing.firstParty.signedPaths).Count) { throw 'Published first-party signing evidence is incomplete.' }
        $rootPrefix = $ReleaseRoot.TrimEnd('\') + '\'
        foreach ($relativePath in @($signing.firstParty.signedPaths)) {
            if ([string]::IsNullOrWhiteSpace([string]$relativePath) -or [System.IO.Path]::IsPathRooted([string]$relativePath)) { throw 'Published signing evidence contains an unsafe path.' }
            $target = [System.IO.Path]::GetFullPath((Join-Path $ReleaseRoot ([string]$relativePath).Replace('/', '\')))
            if (-not $target.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $target -PathType Leaf)) { throw 'Published signing evidence leaves the release root or names a missing file.' }
            $signature = Get-AuthenticodeSignature -LiteralPath $target
            if ($signature.Status -ne 'Valid' -or $null -eq $signature.SignerCertificate -or $signature.SignerCertificate.Thumbprint -ne [string]$signing.firstParty.signer.thumbprint -or $null -eq $signature.TimeStamperCertificate) { throw "Published Authenticode signer or timestamp verification failed for $relativePath." }
            $verifiedFirstParty++
        }
    } elseif ([int]$signing.firstParty.signedPowerShellCount -ne 0) { throw 'Published signing evidence claims unsigned configuration with signed paths.' }
    return [ordered]@{ runtimeSignerSubject = $runtime.SignerCertificate.Subject; runtimeSignerThumbprint = $runtime.SignerCertificate.Thumbprint; runtimeTimestamped = $true; firstPartyConfigured = $signing.firstParty.configured -eq $true; firstPartySignedAndTimestamped = $verifiedFirstParty }
}

$version = $Tag.TrimStart('v')
$releaseEvidencePath = Join-Path $destinationPath "THSV-StreamBridge-$Tag.release-evidence.json"
$releaseEvidenceVerified = $false
if (Test-Path -LiteralPath $releaseEvidencePath -PathType Leaf) {
    Assert-Checksum $releaseEvidencePath
    gh attestation verify $releaseEvidencePath --repo $Repository | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Published release-evidence provenance verification failed.' }
    gh attestation verify "$releaseEvidencePath.sha256" --repo $Repository | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Published release-evidence checksum provenance verification failed.' }
    $releaseEvidence = Get-Content -Raw -LiteralPath $releaseEvidencePath | ConvertFrom-Json
    if ($releaseEvidence.schemaVersion -ne 1 -or $releaseEvidence.product -ne 'THSV StreamBridge' -or $releaseEvidence.tag -ne $Tag -or $releaseEvidence.repository -ne $Repository) { throw 'Published release-evidence identity is invalid.' }
    foreach ($asset in @($releaseEvidence.assets)) {
        $name = [string]$asset.name
        if ([string]::IsNullOrWhiteSpace($name) -or [System.IO.Path]::GetFileName($name) -ne $name -or [string]$asset.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Published release-evidence contains an invalid asset record.' }
        $assetPath = Join-Path $destinationPath $name
        if (-not (Test-Path -LiteralPath $assetPath -PathType Leaf)) { throw "Release-evidence asset is missing: $name" }
        $assetInfo = Get-Item -LiteralPath $assetPath
        $assetHash = Get-Sha256 $assetPath
        if ($assetInfo.Length -ne [long]$asset.size -or $assetHash -ne [string]$asset.sha256) { throw "Release-evidence asset mismatch: $name" }
    }
    $releaseEvidenceVerified = $true
} elseif (-not $AllowLegacyEvidence) { throw "Published release evidence is missing for $Tag." }
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
    $authenticode = Assert-AuthenticodeEvidence $source
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
    $addOnMarkerPath = Join-Path $drillInstallRoot 'addons\state\post-release-smoke\recovery.json'
    [System.IO.Directory]::CreateDirectory((Split-Path -Parent $addOnMarkerPath)) | Out-Null
    [System.IO.File]::WriteAllText($addOnMarkerPath, $creatorMarker, [System.Text.UTF8Encoding]::new($false))
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
    $recoveryKeyPath = Join-Path $drillInstallRoot 'THSV StreamBridge Recovery Key.txt'
    $recoveryKeyBefore = Get-Content -Raw -LiteralPath $recoveryKeyPath
    $controlTokenBefore = [regex]::Match($recoveryKeyBefore, '(?m)^Control token: (.+)$').Groups[1].Value.Trim()
    if ([string]::IsNullOrWhiteSpace($controlTokenBefore)) { throw 'Recovery key did not contain a control token before uninstall.' }
    & (Join-Path $currentSource 'runtime\node.exe') (Join-Path $drillInstallRoot 'launcher\uninstall.mjs') --install-root $drillInstallRoot
    if ($LASTEXITCODE -ne 0) { throw 'Preserve-data uninstall failed.' }
    foreach ($removedPath in @('app', 'runtime', 'launcher')) { if (Test-Path -LiteralPath (Join-Path $drillInstallRoot $removedPath)) { throw "Uninstall left release-owned $removedPath files behind." } }
    if ((Get-Content -Raw -LiteralPath $markerPath) -ne $creatorMarker -or (Get-Content -Raw -LiteralPath $addOnMarkerPath) -ne $creatorMarker -or (Get-Content -Raw -LiteralPath $recoveryKeyPath) -ne $recoveryKeyBefore) { throw 'Preserve-data uninstall changed creator state, add-on state, or the recovery key.' }
    & (Join-Path $currentSource 'runtime\node.exe') (Join-Path $currentSource 'installer\install.mjs') --install-root $drillInstallRoot --no-start
    if ($LASTEXITCODE -ne 0) { throw "Reinstall after preserve-data uninstall failed for $Tag." }
    $reinstalledManifest = Get-Content -Raw -LiteralPath (Join-Path $drillInstallRoot 'data\runtime\install-manifest.json') | ConvertFrom-Json
    $recoveryKeyAfter = Get-Content -Raw -LiteralPath $recoveryKeyPath
    $controlTokenAfter = [regex]::Match($recoveryKeyAfter, '(?m)^Control token: (.+)$').Groups[1].Value.Trim()
    if ($reinstalledManifest.activeVersion -ne $version -or $controlTokenAfter -ne $controlTokenBefore -or (Get-Content -Raw -LiteralPath $markerPath) -ne $creatorMarker -or (Get-Content -Raw -LiteralPath $addOnMarkerPath) -ne $creatorMarker) { throw 'Reinstall did not restore the release while preserving creator state and recovery access.' }
} finally {
    if (Test-Path -LiteralPath $drillRoot) { Remove-Item -LiteralPath $drillRoot -Recurse -Force }
}
$evidence = [ordered]@{ tag = $Tag; previousTag = $previous.previousTag; releaseUrl = $release.url; releaseEvidenceVerified = $releaseEvidenceVerified; coreChecksumVerified = $true; provenanceVerified = $true; authenticode = $authenticode; addOnCount = $actualAddOns.Count; addOnIndexMatched = $true; cleanInstall = $version; upgradedFrom = $previous.previousTag.TrimStart('v'); upgradedTo = $version; reinstall = $version; rollbackProtectionVerified = $true; creatorDataPreserved = $true; uninstallPreservedCreatorData = $true; reinstallAfterUninstall = $version; recoveryKeyVerified = $true; verifiedAt = [DateTime]::UtcNow.ToString('o') }
$resultEvidencePath = Join-Path $destinationPath 'latest.json'
[System.IO.File]::WriteAllText($resultEvidencePath, "$($evidence | ConvertTo-Json -Depth 4)`n", [System.Text.UTF8Encoding]::new($false))
[pscustomobject]$evidence
