param(
    [Parameter(Mandatory = $true)][string]$CurrentArchive,
    [Parameter(Mandatory = $true)][string]$InstalledRoot
)

$ErrorActionPreference = 'Stop'
$archivePath = (Resolve-Path -LiteralPath $CurrentArchive).Path
$sourceRoot = (Resolve-Path -LiteralPath $InstalledRoot).Path
$recordPath = Join-Path $sourceRoot 'data\runtime\install-manifest.json'
if (-not (Test-Path -LiteralPath $recordPath -PathType Leaf)) { throw 'The selected installed root has no installation manifest.' }
$sourceRecord = Get-Content -Raw -LiteralPath $recordPath | ConvertFrom-Json
if ($sourceRecord.product -ne 'THSV StreamBridge' -or [string]::IsNullOrWhiteSpace([string]$sourceRecord.activeVersion)) { throw 'The selected installed root is not a recognized THSV StreamBridge installation.' }

$rehearsalRoot = Join-Path ([System.IO.Path]::GetTempPath()) "thsv-streambridge-settings-rehearsal-$([guid]::NewGuid().ToString('N'))"
$candidateRoot = Join-Path $rehearsalRoot 'candidate'
$installRoot = Join-Path $rehearsalRoot 'install'

function Get-TreeFingerprint([string]$Root, [string[]]$RelativePaths) {
    $records = foreach ($relativePath in $RelativePaths) {
        $path = Join-Path $Root $relativePath
        if (-not (Test-Path -LiteralPath $path)) { continue }
        Get-ChildItem -LiteralPath $path -Recurse -File -Force | ForEach-Object {
            $relative = $_.FullName.Substring($Root.Length).TrimStart('\').Replace('\', '/')
            $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
            "$relative|$($_.Length)|$hash"
        }
    }
    $ordered = @($records | Sort-Object)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes(($ordered -join "`n"))
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { $digest = ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
    [pscustomobject]@{ sha256 = $digest; files = $ordered.Count }
}

try {
    New-Item -ItemType Directory -Path $candidateRoot, $installRoot -Force | Out-Null
    Expand-Archive -LiteralPath $archivePath -DestinationPath $candidateRoot -Force
    foreach ($relativePath in @('data', 'addons')) {
        $source = Join-Path $sourceRoot $relativePath
        if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $installRoot $relativePath) -Recurse -Force }
    }
    $recoveryKey = Join-Path $sourceRoot 'THSV StreamBridge Recovery Key.txt'
    if (Test-Path -LiteralPath $recoveryKey -PathType Leaf) { Copy-Item -LiteralPath $recoveryKey -Destination $installRoot -Force }

    $preservedPaths = @('data\configuration', 'data\secrets', 'data\private', 'addons')
    $before = Get-TreeFingerprint $installRoot $preservedPaths
    $node = Join-Path $candidateRoot 'runtime\node.exe'
    $installer = Join-Path $candidateRoot 'installer\install.mjs'
    & $node $installer --install-root $installRoot --no-start --no-shortcuts --skip-acl
    if ($LASTEXITCODE -ne 0) { throw 'The isolated real-settings upgrade rehearsal installer failed.' }
    $after = Get-TreeFingerprint $installRoot $preservedPaths
    if ($before.sha256 -ne $after.sha256 -or $before.files -ne $after.files) { throw 'Creator settings, secrets, private state, or add-on state changed during the isolated upgrade rehearsal.' }
    $resultRecord = Get-Content -Raw -LiteralPath (Join-Path $installRoot 'data\runtime\install-manifest.json') | ConvertFrom-Json
    if ($resultRecord.activeVersion -ne '4.0.8') { throw "The isolated rehearsal installed $($resultRecord.activeVersion) instead of 4.0.8." }

    [pscustomobject]@{
        upgradedFrom = [string]$sourceRecord.activeVersion
        upgradedTo = [string]$resultRecord.activeVersion
        preservedFiles = $before.files
        preservedFingerprint = $before.sha256
        configurationPreserved = $true
        secretsPreserved = $true
        privateStatePreserved = $true
        addOnStatePreserved = $true
        activeInstallationChanged = $false
    } | ConvertTo-Json -Compress
} finally {
    $resolvedTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    $resolvedRehearsal = [System.IO.Path]::GetFullPath($rehearsalRoot)
    if ($resolvedRehearsal.StartsWith($resolvedTemp, [System.StringComparison]::OrdinalIgnoreCase) -and [System.IO.Path]::GetFileName($resolvedRehearsal).StartsWith('thsv-streambridge-settings-rehearsal-', [System.StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $resolvedRehearsal -Recurse -Force -ErrorAction SilentlyContinue
    }
}
