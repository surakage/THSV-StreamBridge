[CmdletBinding()]
param(
    [string]$Fixture = 'tests/fixtures/twitch-chat.json',
    [string]$BaseUrl = 'http://127.0.0.1:8787',
    [string]$TokenPath = 'data/runtime/control-token'
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$resolvedFixture = if ([System.IO.Path]::IsPathRooted($Fixture)) { $Fixture } else { Join-Path $repo $Fixture }
$resolvedToken = if ([System.IO.Path]::IsPathRooted($TokenPath)) { $TokenPath } else { Join-Path $repo $TokenPath }
if (-not (Test-Path -LiteralPath $resolvedFixture -PathType Leaf)) { throw "Simulation fixture not found: $resolvedFixture" }
if (-not (Test-Path -LiteralPath $resolvedToken -PathType Leaf)) { throw "Bridge control token not found: $resolvedToken" }
$token = (Get-Content -Raw -LiteralPath $resolvedToken).Trim()
if ([string]::IsNullOrWhiteSpace($token)) { throw 'Bridge control token is empty.' }
$body = Get-Content -Raw -LiteralPath $resolvedFixture
Invoke-RestMethod -Method Post -Uri "$BaseUrl/simulate" -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' -Body $body

