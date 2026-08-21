[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$CurrentArchive)

$ErrorActionPreference = 'Stop'
$archive = [System.IO.Path]::GetFullPath($CurrentArchive)
if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) { throw "Current release archive is missing: $archive" }
$root = Join-Path ([System.IO.Path]::GetTempPath()) "thsv-recovery-drill-$([guid]::NewGuid())"
$source = Join-Path $root 'source'
$install = Join-Path $root 'installed'
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
    & $node (Join-Path $source 'installer\install.mjs') --install-root $install --no-start --no-shortcuts --skip-acl
    if ($LASTEXITCODE -ne 0) { throw 'Recovery drill could not install the candidate archive.' }
    $statePath = Join-Path $install 'data\state\recovery-drill.json'
    $addOnStatePath = Join-Path $install 'addons\state\thsv.recovery-drill\state.json'
    [System.IO.Directory]::CreateDirectory((Split-Path -Parent $statePath)) | Out-Null
    [System.IO.Directory]::CreateDirectory((Split-Path -Parent $addOnStatePath)) | Out-Null
    [System.IO.File]::WriteAllText($statePath, $creatorMarker, [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText($addOnStatePath, $addOnMarker, [System.Text.UTF8Encoding]::new($false))
    $env:THSV_RECOVERY_PASSPHRASE = 'release-candidate-recovery-passphrase'
    $installedNode = Join-Path $install 'runtime\node.exe'
    $tool = Join-Path $install 'launcher\recovery-bundle.mjs'
    & $installedNode $tool export --install-root $install --output $bundle
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $bundle -PathType Leaf)) { throw 'Encrypted recovery export failed.' }
    $bundleText = Get-Content -Raw -LiteralPath $bundle
    if ($bundleText.Contains('creator-state') -or $bundleText.Contains('addon-state')) { throw 'Encrypted recovery bundle exposed plaintext creator data.' }
    [System.IO.File]::WriteAllText($statePath, '{"recovery":"changed"}', [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText($addOnStatePath, '{"recovery":"changed"}', [System.Text.UTF8Encoding]::new($false))
    & $installedNode $tool verify --bundle $bundle
    if ($LASTEXITCODE -ne 0) { throw 'Encrypted recovery verification failed.' }
    & $installedNode $tool restore --install-root $install --bundle $bundle --approve
    if ($LASTEXITCODE -ne 0) { throw 'Encrypted recovery restore failed.' }
    if ((Get-Content -Raw -LiteralPath $statePath) -ne $creatorMarker -or (Get-Content -Raw -LiteralPath $addOnStatePath) -ne $addOnMarker) { throw 'Encrypted recovery restore did not recover creator and add-on state.' }
    if (-not (Test-Path -LiteralPath (Join-Path $install 'data\backups\recovery-restore-latest.json') -PathType Leaf)) { throw 'Encrypted recovery restore evidence is missing.' }
    [pscustomobject]@{ encrypted = $true; verifiedBeforeRestore = $true; creatorDataRestored = $true; addOnStateRestored = $true; recoveryKeyRefreshed = (Test-Path -LiteralPath (Join-Path $install 'THSV StreamBridge Recovery Key.txt')) } | ConvertTo-Json -Compress
} finally {
    Remove-Item Env:THSV_RECOVERY_PASSPHRASE -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
