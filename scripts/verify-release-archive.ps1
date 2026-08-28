param(
    [Parameter(Mandatory = $true)][string]$ArchivePath,
    [Parameter(Mandatory = $true)][string]$ChecksumPath,
    [string]$Repository = $(if ([string]::IsNullOrWhiteSpace($env:GITHUB_REPOSITORY)) { 'surakage/THSV-StreamBridge' } else { $env:GITHUB_REPOSITORY }),
    [switch]$SkipAttestation
)

$ErrorActionPreference = 'Stop'
$archive = (Resolve-Path -LiteralPath $ArchivePath).Path
$checksum = (Resolve-Path -LiteralPath $ChecksumPath).Path
$archiveName = [System.IO.Path]::GetFileName($archive)
$checksumLine = Get-Content -LiteralPath $checksum | Where-Object { $_ -match '^([0-9a-fA-F]{64})\s+\*?(.+)$' } | Select-Object -First 1
if ([string]::IsNullOrWhiteSpace($checksumLine)) { throw "Release checksum file is invalid: $checksum" }
$match = [regex]::Match($checksumLine, '^([0-9a-fA-F]{64})\s+\*?(.+)$')
$expectedHash = $match.Groups[1].Value.ToLowerInvariant()
$expectedName = $match.Groups[2].Value.Trim()
if ($expectedName -ne $archiveName) { throw "Release checksum names $expectedName instead of $archiveName." }
$stream = [System.IO.File]::OpenRead($archive)
try {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { $actualHash = ([System.BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
} finally { $stream.Dispose() }
if ($actualHash -ne $expectedHash) { throw "Release checksum mismatch for $archiveName. Expected $expectedHash but found $actualHash." }

$provenanceVerified = $false
if (-not $SkipAttestation) {
    $previousErrorPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $attestationOutput = gh attestation verify $archive --repo $Repository 2>&1
        $githubCliExitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousErrorPreference }
    if ($githubCliExitCode -ne 0) {
        $bundlePath = Join-Path ([System.IO.Path]::GetTempPath()) "thsv-attestations-$([guid]::NewGuid().ToString('N')).jsonl"
        try {
            & node (Join-Path $PSScriptRoot 'public-github-release.mjs') attestations $Repository "sha256:$actualHash" $bundlePath
            if ($LASTEXITCODE -ne 0) { throw "Release provenance retrieval failed for $archiveName. $($attestationOutput -join ' ')" }
            try {
                $ErrorActionPreference = 'Continue'
                $attestationOutput = gh attestation verify $archive --repo $Repository --bundle $bundlePath 2>&1
                $githubCliExitCode = $LASTEXITCODE
            } finally { $ErrorActionPreference = $previousErrorPreference }
            if ($githubCliExitCode -ne 0) {
                & node (Join-Path $PSScriptRoot 'public-github-release.mjs') verify-attestations $Repository "sha256:$actualHash" $bundlePath
                if ($LASTEXITCODE -ne 0) { throw "Offline release provenance verification failed for $archiveName. $($attestationOutput -join ' ')" }
            }
        } finally { Remove-Item -LiteralPath $bundlePath -Force -ErrorAction SilentlyContinue }
    }
    $provenanceVerified = $true
}

[pscustomobject]@{
    archive = $archive
    sha256 = $actualHash
    checksumVerified = $true
    provenanceVerified = $provenanceVerified
}
