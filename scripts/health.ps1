[CmdletBinding()]
param([string]$BaseUrl = 'http://127.0.0.1:8787')
$ErrorActionPreference = 'Stop'
$health = Invoke-RestMethod -Uri "$BaseUrl/health" -TimeoutSec 5
try {
    $readiness = Invoke-RestMethod -Uri "$BaseUrl/ready" -TimeoutSec 5
} catch {
    if ($null -eq $_.ErrorDetails.Message) { throw }
    $readiness = $_.ErrorDetails.Message | ConvertFrom-Json
}
[pscustomobject]@{
    Health = $health.status
    Readiness = $readiness.status
    LastAcceptedEvent = $health.lastAcceptedEventAt
}
