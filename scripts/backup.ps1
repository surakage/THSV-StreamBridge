[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path $repo "data\backups\$stamp"
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $repo 'config') -Destination $backupRoot -Recurse
$state = Join-Path $repo 'data\state'
if (Test-Path -LiteralPath $state) { Copy-Item -LiteralPath $state -Destination $backupRoot -Recurse }
Write-Output "Backup created at $backupRoot"
