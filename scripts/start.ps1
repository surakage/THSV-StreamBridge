[CmdletBinding()]
param([string]$Config = '')
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $repo 'data\runtime\streambridge.pid'
$activeConfigFile = Join-Path $repo 'data\runtime\active-config.txt'
if ([string]::IsNullOrWhiteSpace($Config)) {
    if (Test-Path -LiteralPath $activeConfigFile) { $Config = (Get-Content -Raw -LiteralPath $activeConfigFile).Trim() }
    if ([string]::IsNullOrWhiteSpace($Config) -and (Test-Path -LiteralPath (Join-Path $repo 'data\runtime\bridge.local.json'))) { $Config = 'data/runtime/bridge.local.json' }
    if ([string]::IsNullOrWhiteSpace($Config)) { $Config = 'config/bridge.example.json' }
}
if (-not (Test-Path -LiteralPath (Join-Path $repo $Config))) { throw "Configuration file not found: $Config" }
if (Test-Path -LiteralPath $pidFile) {
    $existingPid = [int](Get-Content -Raw -LiteralPath $pidFile)
    if (Get-Process -Id $existingPid -ErrorAction SilentlyContinue) {
        Write-Output "Replacing running THSV StreamBridge process $existingPid."
        & (Join-Path $PSScriptRoot 'stop.ps1') -Config $Config
        if ($LASTEXITCODE -ne 0) { throw "Could not stop the existing THSV StreamBridge process $existingPid." }
    } else {
        Remove-Item -LiteralPath $pidFile -Force
    }
}
Push-Location $repo
try {
    if (-not (Test-Path -LiteralPath (Join-Path $repo 'dist\apps\bridge-service.js'))) {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
    }
    $env:THSV_STREAMBRIDGE_CONFIG = $Config
    $stdout = Join-Path $repo 'data\logs\service.stdout.log'
    $stderr = Join-Path $repo 'data\logs\service.stderr.log'
    $process = Start-Process -FilePath 'node' -ArgumentList 'dist/apps/bridge-service.js' -WorkingDirectory $repo -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru -WindowStyle Hidden
    Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding ascii
    Set-Content -LiteralPath $activeConfigFile -Value $Config -Encoding utf8
    Start-Sleep -Milliseconds 500
    if ($process.HasExited) { throw "THSV StreamBridge exited during startup. Check $stderr." }
    Write-Output "THSV StreamBridge started with PID $($process.Id) using $Config."
} finally { Pop-Location }
