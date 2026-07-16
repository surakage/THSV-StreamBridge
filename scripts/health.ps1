[CmdletBinding()]
param([string]$BaseUrl = 'http://127.0.0.1:8787')
$ErrorActionPreference = 'Stop'
$health = Invoke-RestMethod -Uri "$BaseUrl/health" -TimeoutSec 5
$readiness = Invoke-RestMethod -Uri "$BaseUrl/ready" -TimeoutSec 5
[pscustomobject]@{ Health = $health.status; Readiness = $readiness.status; LastEvent = $health.lastSuccessfulEventAt }
