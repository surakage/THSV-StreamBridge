[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('start', 'stop', 'pause', 'resume')]
    [string]$Operation,
    [string]$BaseUrl = 'http://127.0.0.1:8787'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$tokenPath = Join-Path $repo 'data\runtime\control-token'
if (-not (Test-Path -LiteralPath $tokenPath)) { throw "Control token not found at $tokenPath. Start the bridge first." }
$token = (Get-Content -Raw -LiteralPath $tokenPath).Trim()
Invoke-RestMethod -Method Post -Uri "$BaseUrl/timed-actions/$Operation" -Headers @{ Authorization = "Bearer $token" }
