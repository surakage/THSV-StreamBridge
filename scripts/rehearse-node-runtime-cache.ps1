[CmdletBinding()]
param(
    [string]$NodeVersion = '22.23.1',
    [switch]$OfflineOnly
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$cacheParent = [System.IO.Path]::GetFullPath((Join-Path $repo '.cache\node-runtime'))
$cacheRoot = [System.IO.Path]::GetFullPath((Join-Path $cacheParent "node-v$NodeVersion-win-x64"))
$evidenceRoot = Join-Path $repo 'artifacts\runtime-cache'
$temporary = Join-Path ([System.IO.Path]::GetTempPath()) ('.thsv-runtime-cache-' + [guid]::NewGuid().ToString('N'))
if (-not $cacheRoot.StartsWith($cacheParent + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe Node runtime cache path.' }

function Get-Sha256([string]$PathValue) { return (Get-FileHash -LiteralPath $PathValue -Algorithm SHA256).Hash.ToLowerInvariant() }
function Test-Cache([string]$Root) {
    try {
        $manifest = Get-Content -Raw -LiteralPath (Join-Path $Root 'runtime-cache.json') | ConvertFrom-Json
        $nodePath = Join-Path $Root 'node.exe'; $licensePath = Join-Path $Root 'NODE-LICENSE.txt'
        if (-not (Test-Path -LiteralPath $nodePath) -or -not (Test-Path -LiteralPath $licensePath)) { return $false }
        $reportedVersion = & $nodePath --version 2>$null
        return $manifest.schemaVersion -eq 1 -and $manifest.nodeVersion -eq $NodeVersion -and $reportedVersion -eq "v$NodeVersion" -and $manifest.nodeSha256 -eq (Get-Sha256 $nodePath) -and $manifest.upstreamSha256 -match '^[a-f0-9]{64}$'
    } catch { return $false }
}
function Write-Cache([string]$SourceRoot, [string]$UpstreamSha256) {
    $stage = Join-Path $cacheParent ('.rotation-stage-' + [guid]::NewGuid().ToString('N'))
    $rollback = Join-Path $cacheParent ('.rotation-rollback-' + [guid]::NewGuid().ToString('N'))
    $movedExisting = $false
    try {
        New-Item -ItemType Directory -Path $stage -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $SourceRoot 'node.exe') -Destination $stage
        Copy-Item -LiteralPath (Join-Path $SourceRoot 'LICENSE') -Destination (Join-Path $stage 'NODE-LICENSE.txt')
        $manifest = [ordered]@{ schemaVersion = 1; nodeVersion = $NodeVersion; platform = 'win32'; arch = 'x64'; upstreamSha256 = $UpstreamSha256; nodeSha256 = Get-Sha256 (Join-Path $stage 'node.exe'); cachedAt = (Get-Date).ToUniversalTime().ToString('o'); source = 'scheduled nodejs.org refresh rehearsal' }
        [System.IO.File]::WriteAllText((Join-Path $stage 'runtime-cache.json'), ($manifest | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
        if (-not (Test-Cache $stage)) { throw 'Staged portable runtime cache failed verification.' }
        if (Test-Path -LiteralPath $cacheRoot) { Move-Item -LiteralPath $cacheRoot -Destination $rollback; $movedExisting = $true }
        Move-Item -LiteralPath $stage -Destination $cacheRoot
        if (-not (Test-Cache $cacheRoot)) { throw 'Rotated portable runtime cache failed verification.' }
        if ($movedExisting) { Remove-Item -LiteralPath $rollback -Recurse -Force }
    } catch {
        if ($movedExisting -and (Test-Path -LiteralPath $rollback)) {
            Remove-Item -LiteralPath $cacheRoot -Recurse -Force -ErrorAction SilentlyContinue
            Move-Item -LiteralPath $rollback -Destination $cacheRoot
        }
        throw
    } finally {
        Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $rollback -Recurse -Force -ErrorAction SilentlyContinue
    }
}

New-Item -ItemType Directory -Path $temporary, $cacheParent, $evidenceRoot -Force | Out-Null
try {
    $refreshed = $false
    if (-not $OfflineOnly) {
        $archiveName = "node-v$NodeVersion-win-x64.zip"
        $archivePath = Join-Path $temporary $archiveName
        $baseUrl = "https://nodejs.org/download/release/v$NodeVersion"
        Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/$archiveName" -OutFile $archivePath
        $checksums = (Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/SHASUMS256.txt").Content
        $match = [regex]::Match($checksums, "(?m)^([a-f0-9]{64})\s+$([regex]::Escape($archiveName))$")
        if (-not $match.Success -or (Get-Sha256 $archivePath) -ne $match.Groups[1].Value) { throw 'Downloaded Node runtime failed its official checksum.' }
        Expand-Archive -LiteralPath $archivePath -DestinationPath $temporary
        Write-Cache (Join-Path $temporary "node-v$NodeVersion-win-x64") $match.Groups[1].Value
        $refreshed = $true
    }
    if (-not (Test-Cache $cacheRoot)) { throw "Portable Node runtime cache is missing or invalid: $cacheRoot" }
    $corruptCopy = Join-Path $temporary 'corrupt-copy'
    Copy-Item -LiteralPath $cacheRoot -Destination $corruptCopy -Recurse
    $corruptManifest = Get-Content -Raw -LiteralPath (Join-Path $corruptCopy 'runtime-cache.json') | ConvertFrom-Json
    $corruptManifest.nodeSha256 = '0' * 64
    [System.IO.File]::WriteAllText((Join-Path $corruptCopy 'runtime-cache.json'), ($corruptManifest | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
    if (Test-Cache $corruptCopy) { throw 'Runtime cache validator accepted a deliberately corrupted manifest.' }
    $manifest = Get-Content -Raw -LiteralPath (Join-Path $cacheRoot 'runtime-cache.json') | ConvertFrom-Json
    $result = [ordered]@{ schemaVersion = 1; checkedAt = (Get-Date).ToUniversalTime().ToString('o'); nodeVersion = $NodeVersion; refreshed = $refreshed; cacheVerified = $true; corruptionRejected = $true; nodeSha256 = $manifest.nodeSha256; upstreamSha256 = $manifest.upstreamSha256 }
    [System.IO.File]::WriteAllText((Join-Path $evidenceRoot 'latest.json'), ($result | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
    $result
} finally { Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue }
