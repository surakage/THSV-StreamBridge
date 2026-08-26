param(
    [string]$CurrentTag = '',
    [string]$PreviousTag = '',
    [string]$Repository = $(if ([string]::IsNullOrWhiteSpace($env:GITHUB_REPOSITORY)) { 'surakage/THSV-StreamBridge' } else { $env:GITHUB_REPOSITORY }),
    [string]$Destination = 'artifacts\previous-release',
    [string]$ReleaseListPath = '',
    [switch]$AllowExistingCurrentRelease,
    [switch]$ResolveOnly
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

if ([string]::IsNullOrWhiteSpace($CurrentTag)) {
    $package = Get-Content -Raw -LiteralPath (Join-Path $repositoryRoot 'package.json') | ConvertFrom-Json
    $CurrentTag = "v$($package.version)"
}
if ($CurrentTag -notmatch '^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$') { throw "Invalid current release tag: $CurrentTag" }
if ($PreviousTag -eq $CurrentTag) { throw 'The previous release must differ from the current candidate.' }

if ([string]::IsNullOrWhiteSpace($ReleaseListPath)) {
    $releaseJson = gh release list --repo $Repository --exclude-drafts --limit 100 --json tagName,isPrerelease 2>$null
    if ($LASTEXITCODE -ne 0) {
        $releaseJson = & node (Join-Path $PSScriptRoot 'public-github-release.mjs') list $Repository
        if ($LASTEXITCODE -ne 0) { throw 'Could not list previous verified releases through either the GitHub CLI or the public GitHub API.' }
    }
} else {
    $releaseJson = Get-Content -Raw -LiteralPath $ReleaseListPath
}
# Windows PowerShell 5.1 can preserve a JSON array as one pipeline object;
# force enumeration so Select-Object always receives release records.
$releases = @((ConvertFrom-Json -InputObject $releaseJson) | ForEach-Object { $_ })
if (($releases.tagName -contains $CurrentTag) -and -not $AllowExistingCurrentRelease) { throw "Release $CurrentTag already exists. Choose a new package version before creating a candidate." }

if ([string]::IsNullOrWhiteSpace($PreviousTag)) {
    $PreviousTag = $releases | Where-Object { $_.isPrerelease -ne $true -and $_.tagName -ne $CurrentTag -and $_.tagName -match '^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$' } | Select-Object -First 1 -ExpandProperty tagName
}

if ([string]::IsNullOrWhiteSpace($PreviousTag)) { throw 'A previous verified release is required for the upgrade smoke test.' }
if ($PreviousTag -notmatch '^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$') { throw "Invalid previous release tag: $PreviousTag" }
if (-not ($releases | Where-Object { $_.tagName -eq $PreviousTag -and $_.isPrerelease -ne $true })) { throw "Previous release $PreviousTag is not present in the verified stable release list." }

$version = $PreviousTag.TrimStart('v')
$result = [ordered]@{ currentTag = $CurrentTag; previousTag = $PreviousTag; archive = $null; checksum = $null; checksumVerified = $false; provenanceVerified = $false }
if ($ResolveOnly) {
    $result | ConvertTo-Json -Compress
    exit 0
}

$destinationPath = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $Destination))
[System.IO.Directory]::CreateDirectory($destinationPath) | Out-Null
gh release download $PreviousTag --repo $Repository --pattern "THSV-StreamBridge-$version.zip" --pattern "THSV-StreamBridge-$version.zip.sha256" --dir $destinationPath --clobber 2>$null
if ($LASTEXITCODE -ne 0) {
    & node (Join-Path $PSScriptRoot 'public-github-release.mjs') download $Repository $PreviousTag $destinationPath "THSV-StreamBridge-$version.zip" "THSV-StreamBridge-$version.zip.sha256"
    if ($LASTEXITCODE -ne 0) { throw "Could not download the previous main release $PreviousTag through either the GitHub CLI or the public GitHub API." }
}
$archive = Join-Path $destinationPath "THSV-StreamBridge-$version.zip"
$checksum = "$archive.sha256"
if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) { throw "The downloaded release archive is missing: $archive" }
if (-not (Test-Path -LiteralPath $checksum -PathType Leaf)) { throw "The downloaded release checksum is missing: $checksum" }
$verification = & (Join-Path $PSScriptRoot 'verify-release-archive.ps1') -ArchivePath $archive -ChecksumPath $checksum -Repository $Repository
$result.archive = (Resolve-Path -LiteralPath $archive).Path
$result.checksum = (Resolve-Path -LiteralPath $checksum).Path
$result.checksumVerified = $verification.checksumVerified
$result.provenanceVerified = $verification.provenanceVerified
[pscustomobject]$result
