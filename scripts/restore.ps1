[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$BackupPath,
    [switch]$ApproveRestore
)

$ErrorActionPreference = 'Stop'
if (-not $ApproveRestore) { throw 'Restore requires -ApproveRestore because it replaces current configuration, state, and installed add-on code.' }
$repo = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$backup = [System.IO.Path]::GetFullPath($BackupPath)
if (-not (Test-Path -LiteralPath $backup -PathType Container)) { throw "Backup directory does not exist: $backup" }
$manifestPath = Join-Path $backup 'backup-manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'backup-manifest.json is missing.' }
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if ($manifest.product -ne 'THSV StreamBridge Backup' -or $null -eq $manifest.files) { throw 'The backup manifest is invalid or belongs to another product.' }

function Resolve-BackupFile([string]$RelativePath) {
    if ([string]::IsNullOrWhiteSpace($RelativePath) -or [System.IO.Path]::IsPathRooted($RelativePath) -or $RelativePath -match '(^|[\/])\.\.([\/]|$)') { throw "Unsafe backup path: $RelativePath" }
    $candidate = [System.IO.Path]::GetFullPath((Join-Path $backup $RelativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)))
    $prefix = $backup.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    if (-not $candidate.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Backup path leaves its root: $RelativePath" }
    return $candidate
}

foreach ($file in $manifest.files) {
    $path = Resolve-BackupFile ([string]$file.path)
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Backup file is missing: $($file.path)" }
    if ((Get-Item -LiteralPath $path).Length -ne [long]$file.size) { throw "Backup file size mismatch: $($file.path)" }
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()
    if ($hash -ne ([string]$file.sha256).ToLowerInvariant()) { throw "Backup file hash mismatch: $($file.path)" }
}

$pidFile = Join-Path $repo 'data\runtime\streambridge.pid'
$stopScript = Join-Path $repo 'scripts\stop.ps1'
if ((Test-Path -LiteralPath $pidFile) -and (Test-Path -LiteralPath $stopScript)) { & $stopScript }
& (Join-Path $repo 'scripts\backup.ps1') | Write-Output

$stamp = [guid]::NewGuid().ToString('N')
$stage = Join-Path $repo "data\backups\.restore-stage-$stamp"
$rollback = Join-Path $repo "data\backups\.restore-rollback-$stamp"
$mappings = @(
    [pscustomobject]@{ Name = 'config'; Source = (Join-Path $backup 'config'); Target = (Join-Path $repo 'config') },
    [pscustomobject]@{ Name = 'bridge.local.json'; Source = (Join-Path $backup 'bridge.local.json'); Target = (Join-Path $repo 'data\runtime\bridge.local.json') },
    [pscustomobject]@{ Name = 'state'; Source = (Join-Path $backup 'state'); Target = (Join-Path $repo 'data\state') },
    [pscustomobject]@{ Name = 'addons'; Source = (Join-Path $backup 'addons'); Target = (Join-Path $repo 'data\addons') }
) | Where-Object { Test-Path -LiteralPath $_.Source }

try {
    New-Item -ItemType Directory -Path $stage, $rollback -Force | Out-Null
    foreach ($mapping in $mappings) {
        $staged = Join-Path $stage $mapping.Name
        New-Item -ItemType Directory -Path (Split-Path -Parent $staged) -Force | Out-Null
        Copy-Item -LiteralPath $mapping.Source -Destination $staged -Recurse -Force
    }
    foreach ($mapping in $mappings) {
        $targetParent = Split-Path -Parent $mapping.Target
        New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
        if (Test-Path -LiteralPath $mapping.Target) { Move-Item -LiteralPath $mapping.Target -Destination (Join-Path $rollback $mapping.Name) }
        Move-Item -LiteralPath (Join-Path $stage $mapping.Name) -Destination $mapping.Target
    }
    Remove-Item -LiteralPath $rollback -Recurse -Force
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
} catch {
    foreach ($mapping in $mappings) {
        $saved = Join-Path $rollback $mapping.Name
        if (Test-Path -LiteralPath $saved) {
            if (Test-Path -LiteralPath $mapping.Target) { Remove-Item -LiteralPath $mapping.Target -Recurse -Force }
            Move-Item -LiteralPath $saved -Destination $mapping.Target
        }
    }
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $rollback -Recurse -Force -ErrorAction SilentlyContinue
    throw
}

Write-Output "THSV StreamBridge restored from $backup"
Write-Output 'Review data/runtime/bridge.local.json, then start StreamBridge when ready.'
