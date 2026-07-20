[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runtime = Join-Path $repo 'data\runtime'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null

function Get-FreePort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try { return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port }
    finally { $listener.Stop() }
}

function Write-TestConfig([string]$Path, [int]$Port) {
    $config = Get-Content -Raw -LiteralPath (Join-Path $repo 'config\bridge.example.json') | ConvertFrom-Json
    $config.service.port = $Port
    $config.streamerbot.testMode = $true
    $config.deduplication.persistAcrossRestarts = $false
    $config.streamerbot.deliveryStateFile = "data/state/lifecycle-outbox-$Port.json"
    $config.timedActions.stateFile = "data/state/lifecycle-timers-$Port.json"
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, ($config | ConvertTo-Json -Depth 20), $utf8NoBom)
}

$firstPort = Get-FreePort
$secondPort = Get-FreePort
$firstConfig = Join-Path $runtime 'ci-lifecycle-first.json'
$secondConfig = Join-Path $runtime 'ci-lifecycle-second.json'
Write-TestConfig $firstConfig $firstPort
Write-TestConfig $secondConfig $secondPort
$firstRelative = 'data/runtime/ci-lifecycle-first.json'
$secondRelative = 'data/runtime/ci-lifecycle-second.json'

Push-Location $repo
try {
    & (Join-Path $repo 'scripts\start.ps1') -Config $firstRelative
    $firstPid = [int](Get-Content -Raw -LiteralPath (Join-Path $runtime 'streambridge.pid'))
    $firstHealth = Invoke-RestMethod -Uri "http://127.0.0.1:$firstPort/health" -TimeoutSec 5
    if ($firstHealth.status -ne 'healthy') { throw 'First custom-port bridge did not become healthy.' }

    $distEntry = Join-Path $repo 'dist\apps\bridge-service.js'
    $beforeBuild = (Get-Item -LiteralPath $distEntry).LastWriteTimeUtc
    (Get-Item -LiteralPath (Join-Path $repo 'bridge\core\bridge.ts')).LastWriteTimeUtc = [DateTime]::UtcNow.AddSeconds(1)
    & (Join-Path $repo 'scripts\start.ps1') -Config $secondRelative
    $secondPid = [int](Get-Content -Raw -LiteralPath (Join-Path $runtime 'streambridge.pid'))
    if ($secondPid -eq $firstPid) { throw 'Replacement did not create a new bridge process.' }
    if ((Get-Process -Id $firstPid -ErrorAction SilentlyContinue)) { throw 'Old custom-port bridge process is still running.' }
    if ((Get-Item -LiteralPath $distEntry).LastWriteTimeUtc -le $beforeBuild) { throw 'A stale compiled service was not rebuilt.' }
    $secondHealth = Invoke-RestMethod -Uri "http://127.0.0.1:$secondPort/health" -TimeoutSec 5
    if ($secondHealth.status -ne 'healthy') { throw 'Replacement custom-port bridge did not become healthy.' }

    & (Join-Path $repo 'scripts\stop.ps1')
    if (Get-Process -Id $secondPid -ErrorAction SilentlyContinue) { throw 'Active-config shutdown did not stop the replacement process.' }
    Write-Output 'Windows custom-port replacement, stale-build detection, and active-config shutdown passed.'
} finally {
    & (Join-Path $repo 'scripts\stop.ps1') -ErrorAction SilentlyContinue
    Pop-Location
}
