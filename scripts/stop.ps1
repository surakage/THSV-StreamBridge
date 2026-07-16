[CmdletBinding()]
param([string]$BaseUrl = 'http://127.0.0.1:8787')
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $repo 'data\runtime\streambridge.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Output 'THSV StreamBridge is not running.'; exit 0 }
$bridgePid = [int](Get-Content -Raw -LiteralPath $pidFile)
$process = Get-Process -Id $bridgePid -ErrorAction SilentlyContinue
if ($null -eq $process) { Remove-Item -LiteralPath $pidFile -Force; Write-Output 'Removed stale PID file.'; exit 0 }
$commandLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $bridgePid").CommandLine
if ($commandLine -notlike '*dist/apps/bridge-service.js*') { throw "PID $bridgePid does not appear to be THSV StreamBridge; refusing to stop it." }
Invoke-RestMethod -Method Post -Uri "$BaseUrl/shutdown" -TimeoutSec 5 | Out-Null
if (-not $process.WaitForExit(6000)) { throw "THSV StreamBridge did not stop within 6 seconds." }
Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
Write-Output 'THSV StreamBridge stopped.'
