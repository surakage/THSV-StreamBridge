param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Add', 'Remove', 'Reset', 'Delete')]
    [string]$Operation,
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z][a-z0-9-]{0,63}$')]
    [string]$ViewerId,
    [ValidateRange(1, 1000000)]
    [int]$Amount,
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
$headers = @{ Authorization = "Bearer $token" }

if ($Operation -in @('Add', 'Remove') -and -not $PSBoundParameters.ContainsKey('Amount')) { throw "Amount is required for $Operation." }
if ($Operation -in @('Reset', 'Delete') -and $PSBoundParameters.ContainsKey('Amount')) { throw "Amount must not be supplied for $Operation." }

if ($Operation -eq 'Delete') {
    $body = @{ performedBy = $PerformedBy; reason = $Reason } | ConvertTo-Json -Compress
    Invoke-RestMethod -Method Delete -Uri "$BaseUrl/viewer-progression/viewers/$ViewerId" -Headers $headers -ContentType 'application/json' -Body $body
    return
}

$request = @{ viewerId = $ViewerId; operation = $Operation.ToLowerInvariant(); performedBy = $PerformedBy; reason = $Reason }
if ($Operation -in @('Add', 'Remove')) { $request.amount = $Amount }
$body = $request | ConvertTo-Json -Compress
Invoke-RestMethod -Method Post -Uri "$BaseUrl/viewer-progression/adjust" -Headers $headers -ContentType 'application/json' -Body $body
