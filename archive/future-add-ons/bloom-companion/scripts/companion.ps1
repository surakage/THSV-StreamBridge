[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Wave', 'Eat', 'Sleep', 'Wake', 'Celebrate')]
    [string]$Action,
    [Parameter(Mandatory = $true)]
    [ValidateLength(1, 64)]
    [string]$PerformedBy,
    [Parameter(Mandatory = $true)]
    [ValidateLength(3, 500)]
    [string]$Reason,
    [string]$BaseUrl = 'http://127.0.0.1:8787',
    [string]$TokenPath = 'data/runtime/control-token'
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$resolvedTokenPath = if ([System.IO.Path]::IsPathRooted($TokenPath)) { $TokenPath } else { Join-Path $repo $TokenPath }
$token = (Get-Content -LiteralPath $resolvedTokenPath -Raw).Trim()
if ([string]::IsNullOrWhiteSpace($token)) { throw "Control token is empty: $resolvedTokenPath" }
$body = @{ action = $Action.ToLowerInvariant(); performedBy = $PerformedBy; reason = $Reason } | ConvertTo-Json -Compress
Invoke-RestMethod -Method Post -Uri "$BaseUrl/companion/actions" -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' -Body $body
