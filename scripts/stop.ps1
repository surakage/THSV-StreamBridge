[CmdletBinding()]
param(
    [string]$BaseUrl = '',
    [string]$Config = ''
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $repo 'data\runtime\streambridge.pid'
$activeConfigFile = Join-Path $repo 'data\runtime\active-config.txt'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Output 'THSV StreamBridge is not running.'; exit 0 }
$bridgePid = [int](Get-Content -Raw -LiteralPath $pidFile)
$process = Get-Process -Id $bridgePid -ErrorAction SilentlyContinue
if ($null -eq $process) {
    Remove-Item -LiteralPath $pidFile -Force
    Remove-Item -LiteralPath $activeConfigFile -Force -ErrorAction SilentlyContinue
    Write-Output 'Removed stale PID file.'
    exit 0
}
if ([string]::IsNullOrWhiteSpace($Config) -and (Test-Path -LiteralPath $activeConfigFile)) {
    $Config = (Get-Content -Raw -LiteralPath $activeConfigFile).Trim()
}
if ([string]::IsNullOrWhiteSpace($Config)) { $Config = 'config/bridge.example.json' }
$configPath = if ([IO.Path]::IsPathRooted($Config)) { $Config } else { Join-Path $repo $Config }
$settings = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
    $controlHost = [string]$settings.service.host
    if ($controlHost -in @('0.0.0.0', '::', '[::]')) { $controlHost = '127.0.0.1' }
    if ($controlHost -eq '::1') { $controlHost = '[::1]' }
    $BaseUrl = "http://${controlHost}:$([int]$settings.service.port)"
}
$tokenEnvironment = if ($settings.security.controlTokenEnv) { $settings.security.controlTokenEnv } else { 'THSV_STREAMBRIDGE_CONTROL_TOKEN' }
$token = [Environment]::GetEnvironmentVariable($tokenEnvironment)
if ([string]::IsNullOrWhiteSpace($token)) {
    $tokenPath = if ($settings.security.controlTokenFile) { $settings.security.controlTokenFile } else { 'data/runtime/control-token' }
    $token = (Get-Content -Raw -LiteralPath (Join-Path $repo $tokenPath)).Trim()
}
if ([string]::IsNullOrWhiteSpace($token)) { throw 'Bridge control token is unavailable; refusing an unauthenticated shutdown.' }
Invoke-RestMethod -Method Post -Uri "$BaseUrl/shutdown" -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 5 | Out-Null
if (-not $process.WaitForExit(6000)) { throw "THSV StreamBridge did not stop within 6 seconds." }
Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $activeConfigFile -Force -ErrorAction SilentlyContinue
Write-Output 'THSV StreamBridge stopped.'
