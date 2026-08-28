[CmdletBinding()]
param(
    [string]$Repository = 'surakage/THSV-StreamBridge',
    [string]$Tag = ''
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$temporary = Join-Path ([System.IO.Path]::GetTempPath()) ('.thsv-attestation-canary-' + [guid]::NewGuid().ToString('N'))
$evidenceRoot = Join-Path $repo 'artifacts\public-attestation'
New-Item -ItemType Directory -Path $temporary, $evidenceRoot -Force | Out-Null
try {
    $releaseJson = & node (Join-Path $PSScriptRoot 'public-github-release.mjs') list $Repository
    if ($LASTEXITCODE -ne 0) { throw 'Public release discovery failed.' }
    $releases = $releaseJson | ConvertFrom-Json
    if ([string]::IsNullOrWhiteSpace($Tag)) {
        $release = $releases | Where-Object { -not $_.isDraft -and -not $_.isPrerelease -and $_.tagName -match '^v\d+\.\d+\.\d+$' } | Select-Object -First 1
        if ($null -eq $release) { throw 'No published stable release was available for the public attestation canary.' }
        $Tag = [string]$release.tagName
    }
    if ($Tag -notmatch '^v\d+\.\d+\.\d+$') { throw 'The public attestation canary accepts only a stable vX.Y.Z tag.' }
    $release = $releases | Where-Object { $_.tagName -eq $Tag -and -not $_.isDraft -and -not $_.isPrerelease } | Select-Object -First 1
    if ($null -eq $release) { throw "Published stable release metadata was unavailable for $Tag." }
    $version = $Tag.TrimStart('v')
    $archiveName = "THSV-StreamBridge-$version.zip"
    $checksumName = "$archiveName.sha256"
    $sbomName = "THSV-StreamBridge-$Tag.cdx.json"
    $evidenceName = "THSV-StreamBridge-$Tag.release-evidence.json"
    $evidenceChecksumName = "$evidenceName.sha256"
    $indexName = 'THSV-StreamBridge-AddOns-index.json'
    $indexChecksumName = "$indexName.sha256"
    $assetMetadata = @($release.assets)
    $assetNames = @($assetMetadata | ForEach-Object { [string]$_.name })
    foreach ($required in @($archiveName, $checksumName, $sbomName, $evidenceName, $evidenceChecksumName, $indexName, $indexChecksumName)) {
        if ($assetNames -notcontains $required) { throw "Release $Tag is missing required public verification asset $required." }
    }
    $addOnArchives = @($assetNames | Where-Object { $_ -match '^THSV-StreamBridge-AddOn-.+-\d+\.\d+\.\d+\.zip$' } | Sort-Object)
    if ($addOnArchives.Count -eq 0) { throw "Release $Tag does not publish any optional add-on archives." }
    foreach ($addOnArchive in $addOnArchives) { if ($assetNames -notcontains "$addOnArchive.sha256") { throw "Release $Tag is missing the checksum for $addOnArchive." } }
    $downloadNames = @($archiveName, $checksumName, $sbomName, $evidenceName, $evidenceChecksumName, $indexName, $indexChecksumName) + $addOnArchives + @($addOnArchives | ForEach-Object { "$_.sha256" })
    $selectedMetadata = @($assetMetadata | Where-Object { $downloadNames -contains [string]$_.name })
    if ($selectedMetadata.Count -ne $downloadNames.Count -or @($selectedMetadata | Where-Object { -not ($_.size -is [int]) -and -not ($_.size -is [long]) -or [long]$_.size -lt 0 -or [long]$_.size -gt 1073741824 }).Count -gt 0) { throw 'Release asset metadata failed bounded-size validation.' }
    if (($selectedMetadata | Measure-Object -Property size -Sum).Sum -gt 2147483648) { throw 'Public canary download set exceeds the 2 GiB safety limit.' }
    & node (Join-Path $PSScriptRoot 'public-github-release.mjs') download $Repository $Tag $temporary @downloadNames
    if ($LASTEXITCODE -ne 0) { throw "Public release asset download failed for $Tag." }
    $releaseMetadataPath = Join-Path $temporary 'release-metadata.json'
    [System.IO.File]::WriteAllText($releaseMetadataPath, ($assetMetadata | ConvertTo-Json -Depth 4), [System.Text.UTF8Encoding]::new($false))
    $assetValidation = & node --input-type=module -e "import {readFile} from 'node:fs/promises'; import {validatePublicReleaseAssets} from './scripts/release-evidence-validation.mjs'; const [directory,repository,tag,metadataPath]=process.argv.slice(1); const releaseAssets=JSON.parse(await readFile(metadataPath,'utf8')); console.log(JSON.stringify(await validatePublicReleaseAssets({directory,repository,tag,releaseAssets})));" $temporary $Repository $Tag $releaseMetadataPath | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or @($assetValidation.addOnArchives).Count -eq 0) { throw "Offline release evidence validation failed for $Tag." }
    $verification = & (Join-Path $PSScriptRoot 'verify-release-archive.ps1') -ArchivePath (Join-Path $temporary $archiveName) -ChecksumPath (Join-Path $temporary $checksumName) -Repository $Repository -SkipAttestation
    $digest = [string]$verification.sha256
    function Get-Sha256([string]$PathValue) { return (Get-FileHash -LiteralPath $PathValue -Algorithm SHA256).Hash.ToLowerInvariant() }
    function Assert-Checksum([string]$PayloadName, [string]$ChecksumAssetName) {
        $tokens = ((Get-Content -Raw -LiteralPath (Join-Path $temporary $ChecksumAssetName)).Trim() -split '\s+')
        if ($tokens.Count -lt 2 -or $tokens[0] -notmatch '^[a-fA-F0-9]{64}$' -or $tokens[-1] -ne $PayloadName -or $tokens[0].ToLowerInvariant() -ne (Get-Sha256 (Join-Path $temporary $PayloadName))) { throw "Checksum verification failed for $PayloadName." }
    }
    Assert-Checksum $evidenceName $evidenceChecksumName
    Assert-Checksum $indexName $indexChecksumName
    foreach ($addOnArchive in $addOnArchives) { Assert-Checksum $addOnArchive "$addOnArchive.sha256" }
    $sbom = Get-Content -Raw -LiteralPath (Join-Path $temporary $sbomName) | ConvertFrom-Json
    if ($sbom.bomFormat -ne 'CycloneDX' -or [string]$sbom.metadata.component.version -ne $version) { throw 'Released CycloneDX SBOM identity does not match the release.' }
    $index = Get-Content -Raw -LiteralPath (Join-Path $temporary $indexName) | ConvertFrom-Json
    $indexedArchives = @($index.packages | ForEach-Object { [string]$_.archiveName } | Sort-Object)
    if (($indexedArchives -join "`n") -ne ($addOnArchives -join "`n")) { throw 'Add-on index archives do not exactly match the published optional add-on archives.' }
    foreach ($package in @($index.packages)) { if ((Get-Sha256 (Join-Path $temporary ([string]$package.archiveName))) -ne [string]$package.sha256) { throw "Add-on index digest mismatch for $($package.archiveName)." } }
    $evidence = Get-Content -Raw -LiteralPath (Join-Path $temporary $evidenceName) | ConvertFrom-Json
    if ($evidence.tag -ne $Tag -or $evidence.version -ne $version -or $evidence.repository -ne $Repository -or [string]$evidence.commitSha -notmatch '^[a-f0-9]{40}$') { throw 'Release evidence identity does not match the public release.' }
    foreach ($asset in @($evidence.assets)) { if ($downloadNames -notcontains [string]$asset.name -or (Get-Sha256 (Join-Path $temporary ([string]$asset.name))) -ne [string]$asset.sha256) { throw "Release evidence digest mismatch for $($asset.name)." } }
    $provenanceAssets = @($archiveName) + $addOnArchives + @($indexName, $evidenceName, $evidenceChecksumName)
    foreach ($attestedName in $provenanceAssets) {
        $attestedDigest = Get-Sha256 (Join-Path $temporary $attestedName)
        $bundlePath = Join-Path $temporary ("attestations-" + [guid]::NewGuid().ToString('N') + '.jsonl')
        & node (Join-Path $PSScriptRoot 'public-github-release.mjs') attestations $Repository "sha256:$attestedDigest" $bundlePath
        if ($LASTEXITCODE -ne 0) { throw "Public attestation retrieval failed for $attestedName." }
        $attestation = & node (Join-Path $PSScriptRoot 'public-github-release.mjs') verify-attestations $Repository "sha256:$attestedDigest" $bundlePath | ConvertFrom-Json
        if ($LASTEXITCODE -ne 0 -or $attestation.provenanceVerified -ne $true) { throw "Public provenance verification failed for $attestedName." }
        if ($attestedName -eq $archiveName) {
            $sbomAttestation = & node (Join-Path $PSScriptRoot 'public-github-release.mjs') verify-sbom-attestations $Repository "sha256:$attestedDigest" $bundlePath (Join-Path $temporary $sbomName) | ConvertFrom-Json
            if ($LASTEXITCODE -ne 0 -or $sbomAttestation.sbomAttestationVerified -ne $true) { throw "Public SBOM attestation verification failed for $attestedName." }
        }
    }
    $result = [ordered]@{ schemaVersion = 2; checkedAt = (Get-Date).ToUniversalTime().ToString('o'); repository = $Repository; tag = $Tag; archive = $archiveName; sha256 = $digest; checksumVerified = $true; provenanceVerified = $true; sbomVerified = $true; sbomAttestationVerified = $true; releaseEvidenceVerified = $true; addOnIndexVerified = $true; addOnArchivesVerified = $addOnArchives.Count; provenanceAssetsVerified = $provenanceAssets.Count; publicAssetsInspected = $assetNames.Count; access = 'unauthenticated-public-api' }
    [System.IO.File]::WriteAllText((Join-Path $evidenceRoot 'latest.json'), ($result | ConvertTo-Json -Depth 4), [System.Text.UTF8Encoding]::new($false))
    $result
} finally {
    Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue
}
