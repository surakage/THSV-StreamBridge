[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path $repo "data\backups\$stamp"
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $repo 'config') -Destination $backupRoot -Recurse
$localConfig = Join-Path $repo 'data\runtime\bridge.local.json'
if (Test-Path -LiteralPath $localConfig) { Copy-Item -LiteralPath $localConfig -Destination $backupRoot }
$state = Join-Path $repo 'data\state'
if (Test-Path -LiteralPath $state) { Copy-Item -LiteralPath $state -Destination $backupRoot -Recurse }
$addons = Join-Path $repo 'data\addons'
if (Test-Path -LiteralPath $addons) { Copy-Item -LiteralPath $addons -Destination $backupRoot -Recurse }
$resolvedBackup = [System.IO.Path]::GetFullPath($backupRoot)
$files = @(Get-ChildItem -LiteralPath $backupRoot -File -Recurse | Sort-Object FullName | ForEach-Object {
    [ordered]@{
        path = $_.FullName.Substring($resolvedBackup.Length + 1).Replace([System.IO.Path]::DirectorySeparatorChar, '/')
        size = $_.Length
        sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
    }
})
$manifest = [ordered]@{
    product = 'THSV StreamBridge Backup'
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    files = $files
}
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $backupRoot 'backup-manifest.json'), ($manifest | ConvertTo-Json -Depth 5), $utf8NoBom)
Write-Output "Backup created at $backupRoot"
