[CmdletBinding()]
param([string]$Archive = '')

$ErrorActionPreference = 'Stop'
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$temporaryBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$testRoot = [System.IO.Path]::GetFullPath((Join-Path $temporaryBase "thsv-local-install-rehearsal-$([guid]::NewGuid())"))
if (-not $testRoot.StartsWith($temporaryBase, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe local installation rehearsal root.' }

function Get-FreePort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try { return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port }
  finally { $listener.Stop() }
}

try {
  Push-Location $repositoryRoot
  if ([string]::IsNullOrWhiteSpace($Archive)) {
    & (Join-Path $PSScriptRoot 'package-release.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'Release packaging failed before the local installation rehearsal.' }
    $Archive = (Get-ChildItem (Join-Path $repositoryRoot 'packages\THSV-StreamBridge-*.zip') | Where-Object { $_.Name -notlike 'THSV-StreamBridge-AddOn-*' } | Select-Object -First 1).FullName
  }
  $archivePath = (Resolve-Path -LiteralPath $Archive).Path
  $releaseExtract = Join-Path $testRoot 'release'
  $installRoot = Join-Path $testRoot 'installed'
  New-Item -ItemType Directory -Path $releaseExtract | Out-Null
  Expand-Archive -LiteralPath $archivePath -DestinationPath $releaseExtract
  $releaseRoot = if (Test-Path -LiteralPath (Join-Path $releaseExtract 'release-manifest.json')) { $releaseExtract } else { @(Get-ChildItem -LiteralPath $releaseExtract -Directory)[0].FullName }
  $node = Join-Path $releaseRoot 'runtime\node.exe'
  $installer = Join-Path $releaseRoot 'installer\install.mjs'
  & $node $installer --install-root $installRoot --no-start --no-shortcuts --skip-acl
  if ($LASTEXITCODE -ne 0) { throw 'The isolated clean installation failed.' }

  $configPath = Join-Path $installRoot 'data\configuration\bridge.local.json'
  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  $config.service.port = Get-FreePort
  $config.streamerbot.testMode = $true
  [System.IO.File]::WriteAllText($configPath, "$($config | ConvertTo-Json -Depth 100)`n", [System.Text.UTF8Encoding]::new($false))

  & $node $installer --install-root $installRoot --no-shortcuts --no-open-wizard --no-tray --skip-acl
  if ($LASTEXITCODE -ne 0) { throw 'The isolated same-version activation and installed-Wizard smoke failed.' }
  $smoke = Get-Content -LiteralPath (Join-Path $installRoot 'data\state\installed-wizard-smoke.json') -Raw | ConvertFrom-Json
  $readiness = Get-Content -LiteralPath (Join-Path $installRoot 'data\state\last-upgrade-readiness.json') -Raw | ConvertFrom-Json
  if ($smoke.schemaVersion -ne 2 -or $smoke.ready -ne $true -or $smoke.authenticatedPreflightLoaded -ne $true -or $smoke.settingsInventoryLoaded -ne $true -or $smoke.preStreamReportGenerated -ne $true) { throw 'Installed-Wizard smoke evidence was incomplete.' }
  if ($readiness.after.available -ne $true -or $readiness.upgradedTo -ne $smoke.version) { throw 'Post-install readiness evidence was incomplete.' }
  & (Join-Path $installRoot 'runtime\node.exe') (Join-Path $installRoot 'launcher\stop.mjs') | Out-Null
  [pscustomobject]@{ passed = $true; version = $smoke.version; addOnCount = $smoke.addOnCount; importPackageCount = $smoke.importPackageCount; readinessCaptured = $readiness.after.available; isolatedRoot = $true } | ConvertTo-Json -Compress
} finally {
  Pop-Location -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $testRoot) {
    $resolvedCleanup = [System.IO.Path]::GetFullPath($testRoot)
    if (-not $resolvedCleanup.StartsWith($temporaryBase, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing unsafe local rehearsal cleanup.' }
    $stopScript = Join-Path $resolvedCleanup 'installed\launcher\stop.mjs'
    $runtimeNode = Join-Path $resolvedCleanup 'installed\runtime\node.exe'
    if ((Test-Path -LiteralPath $stopScript) -and (Test-Path -LiteralPath $runtimeNode)) { & $runtimeNode $stopScript 2>$null | Out-Null }
    for ($attempt = 1; $attempt -le 5 -and (Test-Path -LiteralPath $resolvedCleanup); $attempt++) {
      try { Remove-Item -LiteralPath $resolvedCleanup -Recurse -Force -ErrorAction Stop }
      catch { if ($attempt -eq 5) { Write-Warning "Temporary rehearsal folder could not be fully removed: $resolvedCleanup" } else { Start-Sleep -Milliseconds 500 } }
    }
  }
}
