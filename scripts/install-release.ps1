[CmdletBinding()]
param(
    [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'THSV StreamBridge'),
    [string]$SourceRoot = (Split-Path -Parent $PSScriptRoot),
    [switch]$SkipDependencyInstall,
    [switch]$StartBridge
)

$ErrorActionPreference = 'Stop'

function Resolve-SafeRoot([string]$Path, [string]$Label) {
    $resolved = [System.IO.Path]::GetFullPath($Path).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
    $driveRoot = [System.IO.Path]::GetPathRoot($resolved).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
    if ([string]::IsNullOrWhiteSpace($resolved) -or $resolved -eq $driveRoot -or $resolved.Length -lt 10) {
        throw "Unsafe $Label path: $resolved"
    }
    return $resolved
}

function Resolve-ManifestPath([string]$Root, [string]$RelativePath) {
    if ([string]::IsNullOrWhiteSpace($RelativePath) -or [System.IO.Path]::IsPathRooted($RelativePath) -or $RelativePath -match '(^|[\\/])\.\.([\\/]|$)') {
        throw "Unsafe release manifest path: $RelativePath"
    }
    $normalized = $RelativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
    $candidate = [System.IO.Path]::GetFullPath((Join-Path $Root $normalized))
    $prefix = $Root.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    if (-not $candidate.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Release manifest path leaves its root: $RelativePath"
    }
    return $candidate
}

function Remove-SafeTree([string]$Path, [string]$ParentRoot) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $resolved = [System.IO.Path]::GetFullPath($Path)
    $parent = [System.IO.Path]::GetFullPath($ParentRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
    $prefix = $parent + [System.IO.Path]::DirectorySeparatorChar
    if (-not $resolved.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove a path outside the installation parent: $resolved"
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}

$source = Resolve-SafeRoot $SourceRoot 'source'
$destination = Resolve-SafeRoot $InstallRoot 'installation'
if ($source -eq $destination) { throw 'Install from an extracted release directory into a different installation directory.' }

$manifestPath = Join-Path $source 'release-manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "release-manifest.json is missing. Use an official THSV StreamBridge release archive: $source"
}
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if ($manifest.product -ne 'THSV StreamBridge' -or [string]::IsNullOrWhiteSpace($manifest.version) -or $null -eq $manifest.files) {
    throw 'The release manifest is invalid or belongs to another product.'
}

foreach ($file in $manifest.files) {
    $sourceFile = Resolve-ManifestPath $source ([string]$file.path)
    if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) { throw "Release file is missing: $($file.path)" }
    $actualSize = (Get-Item -LiteralPath $sourceFile).Length
    if ($actualSize -ne [long]$file.size) { throw "Release file size mismatch: $($file.path)" }
    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $sourceFile).Hash.ToLowerInvariant()
    if ($actualHash -ne ([string]$file.sha256).ToLowerInvariant()) { throw "Release file hash mismatch: $($file.path)" }
}

$parent = Split-Path -Parent $destination
New-Item -ItemType Directory -Path $parent -Force | Out-Null
$stage = Join-Path $parent ('.thsv-streambridge-install-' + [guid]::NewGuid().ToString('N'))
$rollback = Join-Path $parent ('.thsv-streambridge-rollback-' + [guid]::NewGuid().ToString('N'))
$destinationMoved = $false

try {
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    foreach ($file in $manifest.files) {
        $sourceFile = Resolve-ManifestPath $source ([string]$file.path)
        $stageFile = Resolve-ManifestPath $stage ([string]$file.path)
        New-Item -ItemType Directory -Path (Split-Path -Parent $stageFile) -Force | Out-Null
        Copy-Item -LiteralPath $sourceFile -Destination $stageFile -Force
    }
    Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $stage 'release-manifest.json') -Force
    @('data\runtime', 'data\state', 'data\logs', 'data\backups') | ForEach-Object {
        New-Item -ItemType Directory -Path (Join-Path $stage $_) -Force | Out-Null
    }

    if (-not $SkipDependencyInstall) {
        $nodeVersion = (& node --version 2>$null)
        if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(2[2-9]|[3-9][0-9])\.') { throw 'Node.js 22 or later is required.' }
        Push-Location $stage
        try {
            & npm.cmd ci --omit=dev --ignore-scripts
            if ($LASTEXITCODE -ne 0) { throw 'Production dependency installation failed.' }
        } finally { Pop-Location }
    }

    if (Test-Path -LiteralPath $destination) {
        $pidFile = Join-Path $destination 'data\runtime\streambridge.pid'
        $stopScript = Join-Path $destination 'scripts\stop.ps1'
        if ((Test-Path -LiteralPath $pidFile) -and (Test-Path -LiteralPath $stopScript)) { & $stopScript }
        $backupScript = Join-Path $destination 'scripts\backup.ps1'
        if (Test-Path -LiteralPath $backupScript) { & $backupScript | Write-Output }
        $existingData = Join-Path $destination 'data'
        if (Test-Path -LiteralPath $existingData) { Copy-Item -LiteralPath $existingData -Destination $stage -Recurse -Force }
        Move-Item -LiteralPath $destination -Destination $rollback
        $destinationMoved = $true
    }

    if (-not (Test-Path -LiteralPath (Join-Path $stage 'data\runtime\bridge.local.json'))) {
        Copy-Item -LiteralPath (Join-Path $stage 'config\bridge.example.json') -Destination (Join-Path $stage 'data\runtime\bridge.local.json')
    }
    $installRecord = [ordered]@{
        product = 'THSV StreamBridge'
        version = [string]$manifest.version
        installedAt = (Get-Date).ToUniversalTime().ToString('o')
        installRoot = $destination
        releaseFiles = @($manifest.files | ForEach-Object { [string]$_.path }) + @('release-manifest.json')
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Join-Path $stage 'data\runtime\install-manifest.json'), ($installRecord | ConvertTo-Json -Depth 4), $utf8NoBom)

    Move-Item -LiteralPath $stage -Destination $destination
    if ($destinationMoved) { Remove-SafeTree $rollback $parent }
} catch {
    if (Test-Path -LiteralPath $stage) { Remove-SafeTree $stage $parent }
    if ($destinationMoved -and (Test-Path -LiteralPath $rollback)) {
        if (Test-Path -LiteralPath $destination) { Remove-SafeTree $destination $parent }
        Move-Item -LiteralPath $rollback -Destination $destination
    }
    throw
}

if ($StartBridge) { & (Join-Path $destination 'scripts\start.ps1') -Config 'data/runtime/bridge.local.json' }
Write-Output "THSV StreamBridge $($manifest.version) installed at $destination"
Write-Output "Local configuration: $(Join-Path $destination 'data\runtime\bridge.local.json')"
