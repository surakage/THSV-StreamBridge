[CmdletBinding()]
param(
    [string]$InstallRoot = (Split-Path -Parent $PSScriptRoot),
    [switch]$RemoveUserData
)

$ErrorActionPreference = 'Stop'

function Resolve-SafeInstallRoot([string]$Path) {
    $resolved = [System.IO.Path]::GetFullPath($Path).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
    $driveRoot = [System.IO.Path]::GetPathRoot($resolved).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
    if ([string]::IsNullOrWhiteSpace($resolved) -or $resolved -eq $driveRoot -or $resolved.Length -lt 10) {
        throw "Unsafe installation path: $resolved"
    }
    return $resolved
}

$root = Resolve-SafeInstallRoot $InstallRoot
$recordPath = Join-Path $root 'data\runtime\install-manifest.json'
if (-not (Test-Path -LiteralPath $recordPath -PathType Leaf)) { throw "This is not a managed THSV StreamBridge installation: $root" }
$record = Get-Content -Raw -LiteralPath $recordPath | ConvertFrom-Json
if ($record.product -ne 'THSV StreamBridge' -or ([System.IO.Path]::GetFullPath([string]$record.installRoot).TrimEnd('\') -ne $root.TrimEnd('\'))) {
    throw 'The installation record does not match this directory.'
}

$pidFile = Join-Path $root 'data\runtime\streambridge.pid'
$stopScript = Join-Path $root 'scripts\stop.ps1'
if ((Test-Path -LiteralPath $pidFile) -and (Test-Path -LiteralPath $stopScript)) { & $stopScript }

$parent = Split-Path -Parent $root
$preserved = Join-Path $parent ('.thsv-streambridge-data-' + [guid]::NewGuid().ToString('N'))
if (-not $RemoveUserData) {
    $dataPath = Join-Path $root 'data'
    if (Test-Path -LiteralPath $dataPath) { Move-Item -LiteralPath $dataPath -Destination $preserved }
}

Remove-Item -LiteralPath $root -Recurse -Force

if (-not $RemoveUserData) {
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    if (Test-Path -LiteralPath $preserved) { Move-Item -LiteralPath $preserved -Destination (Join-Path $root 'data') }
    Remove-Item -LiteralPath (Join-Path $root 'data\runtime\install-manifest.json') -Force -ErrorAction SilentlyContinue
    Set-Content -LiteralPath (Join-Path $root 'REINSTALL.txt') -Encoding utf8 -Value 'THSV StreamBridge was uninstalled. The data directory was preserved. Reinstall to restore the application.'
    Write-Output "THSV StreamBridge uninstalled; creator configuration and state remain at $(Join-Path $root 'data')"
} else {
    Write-Output "THSV StreamBridge and its creator data were removed from $root"
}

