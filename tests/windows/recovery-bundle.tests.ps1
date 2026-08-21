[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$CurrentArchive)

$ErrorActionPreference = 'Stop'
$archive = [System.IO.Path]::GetFullPath($CurrentArchive)
if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) { throw "Current release archive is missing: $archive" }
$root = Join-Path ([System.IO.Path]::GetTempPath()) "thsv-recovery-drill-$([guid]::NewGuid())"
$source = Join-Path $root 'source'
$sourceInstall = Join-Path $root 'source-profile'
$freshInstall = Join-Path $root 'fresh-profile'
$bundle = Join-Path $root 'recovery.thsv-recovery'
$creatorMarker = '{"recovery":"creator-state"}'
$addOnMarker = '{"recovery":"addon-state"}'
try {
    Expand-Archive -LiteralPath $archive -DestinationPath $source
    if (-not (Test-Path -LiteralPath (Join-Path $source 'release-manifest.json'))) {
        $children = @(Get-ChildItem -LiteralPath $source -Directory)
        if ($children.Count -ne 1) { throw 'Recovery drill archive has an invalid root layout.' }
        $source = $children[0].FullName
    }
    $node = Join-Path $source 'runtime\node.exe'
    & $node (Join-Path $source 'installer\install.mjs') --install-root $sourceInstall --no-start --no-shortcuts --skip-acl
    if ($LASTEXITCODE -ne 0) { throw 'Recovery drill could not install the source profile.' }
    $statePath = Join-Path $sourceInstall 'data\state\recovery-drill.json'
    $addOnStatePath = Join-Path $sourceInstall 'addons\state\thsv.recovery-drill\state.json'
    [System.IO.Directory]::CreateDirectory((Split-Path -Parent $statePath)) | Out-Null
    [System.IO.Directory]::CreateDirectory((Split-Path -Parent $addOnStatePath)) | Out-Null
    [System.IO.File]::WriteAllText($statePath, $creatorMarker, [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText($addOnStatePath, $addOnMarker, [System.Text.UTF8Encoding]::new($false))
    $env:THSV_RECOVERY_PASSPHRASE = 'release-candidate-recovery-passphrase'
    $installedNode = Join-Path $sourceInstall 'runtime\node.exe'
    $tool = Join-Path $sourceInstall 'launcher\recovery-bundle.mjs'
    & $installedNode $tool export --install-root $sourceInstall --output $bundle
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $bundle -PathType Leaf)) { throw 'Encrypted recovery export failed.' }
    $bundleText = Get-Content -Raw -LiteralPath $bundle
    if ($bundleText.Contains('creator-state') -or $bundleText.Contains('addon-state')) { throw 'Encrypted recovery bundle exposed plaintext creator data.' }
    & $node (Join-Path $source 'installer\install.mjs') --install-root $freshInstall --no-start --no-shortcuts --skip-acl
    if ($LASTEXITCODE -ne 0) { throw 'Recovery drill could not install the disposable fresh profile.' }
    $freshStatePath = Join-Path $freshInstall 'data\state\recovery-drill.json'
    $freshAddOnStatePath = Join-Path $freshInstall 'addons\state\thsv.recovery-drill\state.json'
    if ((Test-Path -LiteralPath $freshStatePath) -or (Test-Path -LiteralPath $freshAddOnStatePath)) { throw 'Fresh recovery profile unexpectedly contained source creator data.' }
    $freshNode = Join-Path $freshInstall 'runtime\node.exe'
    $freshTool = Join-Path $freshInstall 'launcher\recovery-bundle.mjs'
    & $freshNode $freshTool verify --bundle $bundle
    if ($LASTEXITCODE -ne 0) { throw 'Encrypted recovery verification failed.' }
    & $freshNode $freshTool restore --install-root $freshInstall --bundle $bundle --approve
    if ($LASTEXITCODE -ne 0) { throw 'Encrypted recovery restore failed.' }
    if ((Get-Content -Raw -LiteralPath $freshStatePath) -ne $creatorMarker -or (Get-Content -Raw -LiteralPath $freshAddOnStatePath) -ne $addOnMarker) { throw 'Encrypted recovery restore did not transfer creator and add-on state into the fresh profile.' }
    if (-not (Test-Path -LiteralPath (Join-Path $freshInstall 'data\backups\recovery-restore-latest.json') -PathType Leaf)) { throw 'Encrypted recovery restore evidence is missing.' }
    [pscustomobject]@{ encrypted = $true; verifiedBeforeRestore = $true; freshProfileRestore = $true; creatorDataRestored = $true; addOnStateRestored = $true; recoveryKeyRefreshed = (Test-Path -LiteralPath (Join-Path $freshInstall 'THSV StreamBridge Recovery Key.txt')) } | ConvertTo-Json -Compress
} finally {
    Remove-Item Env:THSV_RECOVERY_PASSPHRASE -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
