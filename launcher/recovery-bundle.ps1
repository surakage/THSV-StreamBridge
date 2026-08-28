[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet('Export', 'Restore', 'MoveExport', 'MoveRestore')][string]$Mode,
    [Parameter(Mandatory = $true)][string]$InstallRoot
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath($InstallRoot)
$node = Join-Path $root 'runtime\node.exe'
$tool = Join-Path $root 'launcher\recovery-bundle.mjs'
if (-not (Test-Path -LiteralPath $node -PathType Leaf) -or -not (Test-Path -LiteralPath $tool -PathType Leaf)) { throw 'This recovery launcher is not inside a complete StreamBridge installation.' }

if ($Mode -eq 'MoveExport') {
    $previewJson = (& $node $tool transfer-preview --install-root $root) -join "`n"
    if ($LASTEXITCODE -ne 0) { throw 'Move-computer preview failed.' }
    $preview = $previewJson | ConvertFrom-Json
    Write-Host ''
    Write-Host 'Move-computer bundle preview'
    Write-Host "  Included files: $($preview.fileCount)"
    Write-Host "  Included bytes: $($preview.totalBytes)"
    Write-Host "  Redacted credential fields: $($preview.redactedFields)"
    Write-Host "  Omitted secret/private files: $($preview.omittedFiles)"
    foreach ($file in $preview.files) { Write-Host "  + $($file.path) ($($file.size) bytes)" }
    Write-Host "  Always omitted: $($preview.omittedCategories -join ', ')"
    if ((Read-Host 'Type MOVE to continue with this encrypted export') -cne 'MOVE') { throw 'Move-computer export was cancelled.' }
}

$secure = Read-Host 'Recovery bundle passphrase (12 or more characters)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $passphrase = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ($passphrase.Length -lt 12) { throw 'Recovery passphrase must contain at least 12 characters.' }
    if ($Mode -in @('Export', 'MoveExport')) {
        $confirm = Read-Host 'Repeat the recovery bundle passphrase' -AsSecureString
        $confirmPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirm)
        try { if ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmPointer) -cne $passphrase) { throw 'Recovery passphrases did not match.' } }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmPointer) }
        $downloads = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads'
        [System.IO.Directory]::CreateDirectory($downloads) | Out-Null
        $isMove = $Mode -eq 'MoveExport'
        $bundleKind = if ($isMove) { 'Move' } else { 'Recovery' }
        $bundleExtension = if ($isMove) { 'thsv-transfer' } else { 'thsv-recovery' }
        $bundle = Join-Path $downloads "THSV-StreamBridge-$bundleKind-$(Get-Date -Format 'yyyyMMdd-HHmmss').$bundleExtension"
        & $node (Join-Path $root 'launcher\stop.mjs')
        if ($LASTEXITCODE -ne 0) { throw 'StreamBridge could not be stopped safely, so export was cancelled.' }
        try {
            $env:THSV_RECOVERY_PASSPHRASE = $passphrase
            $exportCommand = if ($isMove) { 'transfer-export' } else { 'export' }
            & $node $tool $exportCommand --install-root $root --output $bundle
            if ($LASTEXITCODE -ne 0) { throw 'Recovery bundle export failed.' }
            $verifyCommand = if ($isMove) { 'transfer-verify' } else { 'verify' }
            & $node $tool $verifyCommand --bundle $bundle
            if ($LASTEXITCODE -ne 0) { throw 'The new bundle failed authentication and will not be reported as ready.' }
        } finally {
            & $node (Join-Path $root 'launcher\start.mjs') --wait --open-wizard
            if ($LASTEXITCODE -ne 0) { Write-Warning 'The bundle operation finished, but StreamBridge did not restart automatically.' }
        }
        if ($isMove) { Write-Host "Authenticated encrypted move-computer bundle saved to $bundle"; Write-Host 'Credentials were excluded. Re-enter them in the Setup Wizard on the destination computer.' }
        else { Write-Host "Authenticated encrypted recovery bundle saved to $bundle" }
    } else {
        $isMove = $Mode -eq 'MoveRestore'
        $expectedExtension = if ($isMove) { '.thsv-transfer' } else { '.thsv-recovery' }
        $bundle = Read-Host "Full path to the $expectedExtension bundle"
        if (-not (Test-Path -LiteralPath $bundle -PathType Leaf)) { throw "Recovery bundle does not exist: $bundle" }
        $confirmation = Read-Host 'Type RESTORE to stop StreamBridge and replace persistent creator data'
        if ($confirmation -cne 'RESTORE') { throw 'Recovery restore was cancelled.' }
        & $node (Join-Path $root 'launcher\stop.mjs')
        if ($LASTEXITCODE -ne 0) { throw 'StreamBridge could not be stopped safely, so restore was cancelled.' }
        $env:THSV_RECOVERY_PASSPHRASE = $passphrase
        $verifyCommand = if ($isMove) { 'transfer-verify' } else { 'verify' }
        & $node $tool $verifyCommand --bundle $bundle
        if ($LASTEXITCODE -ne 0) { throw 'Recovery bundle verification failed before restore.' }
        $restoreCommand = if ($isMove) { 'transfer-restore' } else { 'restore' }
        & $node $tool $restoreCommand --install-root $root --bundle $bundle --approve
        if ($LASTEXITCODE -ne 0) { throw 'Recovery bundle restore failed.' }
        & $node (Join-Path $root 'launcher\start.mjs') --wait --open-wizard
        if ($LASTEXITCODE -ne 0) { throw 'Creator data was restored, but StreamBridge did not restart cleanly. Open the startup report before retrying.' }
        if ($isMove) { Write-Host 'Move-computer bundle restored and StreamBridge restarted.'; Write-Host 'Open the Setup Wizard now to re-enter credentials and test connections.' }
        else { Write-Host 'Encrypted recovery bundle restored and StreamBridge restarted.' }
    }
} finally {
    Remove-Item Env:THSV_RECOVERY_PASSPHRASE -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
