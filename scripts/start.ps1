[CmdletBinding()]
param([string]$Config = '')
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $repo 'data\runtime\streambridge.pid'
$activeConfigFile = Join-Path $repo 'data\runtime\active-config.txt'
if ([string]::IsNullOrWhiteSpace($Config)) {
    if (Test-Path -LiteralPath $activeConfigFile) { $Config = (Get-Content -Raw -LiteralPath $activeConfigFile).Trim() }
    if ([string]::IsNullOrWhiteSpace($Config) -and (Test-Path -LiteralPath (Join-Path $repo 'data\runtime\bridge.local.json'))) { $Config = 'data/runtime/bridge.local.json' }
    if ([string]::IsNullOrWhiteSpace($Config)) { $Config = 'config/bridge.example.json' }
}
$requestedConfigPath = if ([IO.Path]::IsPathRooted($Config)) { $Config } else { Join-Path $repo $Config }
if (-not (Test-Path -LiteralPath $requestedConfigPath)) { throw "Configuration file not found: $Config" }
if (Test-Path -LiteralPath $pidFile) {
    $existingPid = [int](Get-Content -Raw -LiteralPath $pidFile)
    if (Get-Process -Id $existingPid -ErrorAction SilentlyContinue) {
        Write-Output "Replacing running THSV StreamBridge process $existingPid."
        # The running process owns the active configuration. In particular, its HTTP
        # control port may differ from the configuration requested for the replacement.
        & (Join-Path $PSScriptRoot 'stop.ps1')
    } else {
        Remove-Item -LiteralPath $pidFile -Force
    }
}
$requestedConfig = Get-Content -Raw -LiteralPath $requestedConfigPath | ConvertFrom-Json
$requestedPort = [int]$requestedConfig.service.port
$listener = Get-NetTCPConnection -LocalPort $requestedPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -ne $listener) {
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
    $ownerCommandLine = if ($null -eq $owner) { '' } else { [string]$owner.CommandLine }
    $normalizedRepo = [IO.Path]::GetFullPath($repo)
    $isStreamBridge = $null -ne $owner -and $owner.Name -ieq 'node.exe' -and
        $ownerCommandLine.IndexOf($normalizedRepo, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
        $ownerCommandLine.IndexOf('bridge-service', [StringComparison]::OrdinalIgnoreCase) -ge 0
    if (-not $isStreamBridge) {
        $ownerDescription = if ($null -eq $owner) { "PID $($listener.OwningProcess)" } else { "$($owner.Name) (PID $($owner.ProcessId))" }
        throw "Port conflict: 127.0.0.1:$requestedPort is owned by $ownerDescription, not THSV StreamBridge."
    }
    Write-Output "Replacing orphaned THSV StreamBridge process $($owner.ProcessId) on port $requestedPort."
    Stop-Process -Id $owner.ProcessId -Force
    for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
        if (-not (Get-NetTCPConnection -LocalPort $requestedPort -State Listen -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 100
    }
    if (Get-NetTCPConnection -LocalPort $requestedPort -State Listen -ErrorAction SilentlyContinue) {
        throw "THSV StreamBridge process $($owner.ProcessId) stopped but port $requestedPort did not close."
    }
}
Push-Location $repo
try {
    $distEntry = Join-Path $repo 'dist\apps\bridge-service.js'
    $buildInputs = @(
        Get-ChildItem -LiteralPath (Join-Path $repo 'apps'), (Join-Path $repo 'bridge'), (Join-Path $repo 'schemas') -File -Recurse -ErrorAction SilentlyContinue
        Get-Item -LiteralPath (Join-Path $repo 'package.json'), (Join-Path $repo 'tsconfig.build.json') -ErrorAction SilentlyContinue
    )
    $latestInputWrite = $buildInputs | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1 -ExpandProperty LastWriteTimeUtc
    $needsBuild = -not (Test-Path -LiteralPath $distEntry)
    if (-not $needsBuild -and $null -ne $latestInputWrite) { $needsBuild = $latestInputWrite -gt (Get-Item -LiteralPath $distEntry).LastWriteTimeUtc }
    if ($needsBuild) {
        if (-not (Test-Path -LiteralPath (Join-Path $repo 'node_modules\.bin\tsc.cmd'))) {
            throw 'Compiled service is missing or stale and development build tools are unavailable. Reinstall an official release or run npm ci in this source checkout.'
        }
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
    }
    $env:THSV_STREAMBRIDGE_CONFIG = $Config
    $stdout = Join-Path $repo 'data\logs\service.stdout.log'
    $stderr = Join-Path $repo 'data\logs\service.stderr.log'
    $process = Start-Process -FilePath 'node' -ArgumentList 'dist/apps/bridge-service.js' -WorkingDirectory $repo -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru -WindowStyle Hidden
    Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding ascii
    Set-Content -LiteralPath $activeConfigFile -Value $Config -Encoding utf8
    Start-Sleep -Milliseconds 500
    if ($process.HasExited) { throw "THSV StreamBridge exited during startup. Check $stderr." }
    Write-Output "THSV StreamBridge started with PID $($process.Id) using $Config."
} finally { Pop-Location }
