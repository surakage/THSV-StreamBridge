[CmdletBinding()]
param([string]$Config = 'config/bridge.example.json')
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $repo 'data\runtime\streambridge.pid'
if (Test-Path -LiteralPath $pidFile) {
    $existingPid = [int](Get-Content -Raw -LiteralPath $pidFile)
    if (Get-Process -Id $existingPid -ErrorAction SilentlyContinue) { throw "THSV StreamBridge is already running with PID $existingPid." }
    Remove-Item -LiteralPath $pidFile -Force
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
    Set-Content -LiteralPath (Join-Path $repo 'data\runtime\active-config.txt') -Value $Config -Encoding utf8
    Start-Sleep -Milliseconds 500
    if ($process.HasExited) { throw "THSV StreamBridge exited during startup. Check $stderr." }
    Write-Output "THSV StreamBridge started with PID $($process.Id)."
} finally { Pop-Location }
