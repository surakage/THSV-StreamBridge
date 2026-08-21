[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet('Export', 'Restore')][string]$Mode,
    [Parameter(Mandatory = $true)][string]$InstallRoot
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath($InstallRoot)
$node = Join-Path $root 'runtime\node.exe'
$tool = Join-Path $root 'launcher\recovery-bundle.mjs'
if (-not (Test-Path -LiteralPath $node -PathType Leaf) -or -not (Test-Path -LiteralPath $tool -PathType Leaf)) { throw 'This recovery launcher is not inside a complete StreamBridge installation.' }

$secure = Read-Host 'Recovery bundle passphrase (12 or more characters)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $passphrase = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ($passphrase.Length -lt 12) { throw 'Recovery passphrase must contain at least 12 characters.' }
    if ($Mode -eq 'Export') {
        $confirm = Read-Host 'Repeat the recovery bundle passphrase' -AsSecureString
        $confirmPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirm)
        try { if ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmPointer) -cne $passphrase) { throw 'Recovery passphrases did not match.' } }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmPointer) }
        $downloads = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads'
        [System.IO.Directory]::CreateDirectory($downloads) | Out-Null
        $bundle = Join-Path $downloads "THSV-StreamBridge-Recovery-$(Get-Date -Format 'yyyyMMdd-HHmmss').thsv-recovery"
        & $node (Join-Path $root 'launcher\stop.mjs')
        if ($LASTEXITCODE -ne 0) { throw 'StreamBridge could not be stopped safely, so export was cancelled.' }
        try {
            $env:THSV_RECOVERY_PASSPHRASE = $passphrase
            & $node $tool export --install-root $root --output $bundle
            if ($LASTEXITCODE -ne 0) { throw 'Recovery bundle export failed.' }
        } finally {
            & $node (Join-Path $root 'launcher\start.mjs') --wait --open-wizard
            if ($LASTEXITCODE -ne 0) { Write-Warning 'The bundle operation finished, but StreamBridge did not restart automatically.' }
        }
        Write-Host "Encrypted recovery bundle saved to $bundle"
    } else {
        $bundle = Read-Host 'Full path to the .thsv-recovery bundle'
        if (-not (Test-Path -LiteralPath $bundle -PathType Leaf)) { throw "Recovery bundle does not exist: $bundle" }
        $confirmation = Read-Host 'Type RESTORE to stop StreamBridge and replace persistent creator data'
        if ($confirmation -cne 'RESTORE') { throw 'Recovery restore was cancelled.' }
        & $node (Join-Path $root 'launcher\stop.mjs')
        if ($LASTEXITCODE -ne 0) { throw 'StreamBridge could not be stopped safely, so restore was cancelled.' }
        $env:THSV_RECOVERY_PASSPHRASE = $passphrase
        & $node $tool verify --bundle $bundle
        if ($LASTEXITCODE -ne 0) { throw 'Recovery bundle verification failed before restore.' }
        & $node $tool restore --install-root $root --bundle $bundle --approve
        if ($LASTEXITCODE -ne 0) { throw 'Recovery bundle restore failed.' }
        & $node (Join-Path $root 'launcher\start.mjs') --wait --open-wizard
        if ($LASTEXITCODE -ne 0) { throw 'Creator data was restored, but StreamBridge did not restart cleanly. Open the startup report before retrying.' }
        Write-Host 'Encrypted recovery bundle restored and StreamBridge restarted.'
    }
} finally {
    Remove-Item Env:THSV_RECOVERY_PASSPHRASE -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
