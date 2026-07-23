[CmdletBinding()]
param([string]$NodeVersion = '22.23.1')
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$package = Get-Content -Raw -LiteralPath (Join-Path $repo 'package.json') | ConvertFrom-Json
# Windows x64 is currently the only supported target; the asset name intentionally omits a platform suffix.
$assetName = "THSV-StreamBridge-$($package.version)"
$staging = Join-Path $repo "packages\$assetName"
$archive = "$staging.zip"
$checksum = "$archive.sha256"
$resolvedPackages = [System.IO.Path]::GetFullPath((Join-Path $repo 'packages'))
$resolvedStaging = [System.IO.Path]::GetFullPath($staging)
if (-not $resolvedStaging.StartsWith($resolvedPackages, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe release staging path.' }
$temporary = Join-Path ([System.IO.Path]::GetTempPath()) ('.thsv-package-' + [guid]::NewGuid().ToString('N'))

Push-Location $repo
try {
    npm.cmd run clean
    if ($LASTEXITCODE -ne 0) { throw 'Clean failed.' }
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
    npm.cmd run lint
    if ($LASTEXITCODE -ne 0) { throw 'Lint failed.' }
    npm.cmd run typecheck
    if ($LASTEXITCODE -ne 0) { throw 'Type check failed.' }
    npm.cmd test
    if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
    npm.cmd run config:validate
    if ($LASTEXITCODE -ne 0) { throw 'Configuration validation failed.' }
    New-Item -ItemType Directory -Path $temporary -Force | Out-Null
    Get-ChildItem -LiteralPath $resolvedPackages -Filter '*.thsv-addon*' -File | Remove-Item -Force
    Get-ChildItem -LiteralPath $resolvedPackages -Filter 'THSV-StreamBridge-AddOn-*.zip*' -File | Remove-Item -Force
    $addOnOutputs = @()
    $addOnPackageFolderNames = @()
    Get-ChildItem -LiteralPath (Join-Path $repo 'addons') -Directory | Sort-Object Name | ForEach-Object {
        $descriptorPath = Join-Path $_.FullName 'module-package.json'
        if (-not (Test-Path -LiteralPath $descriptorPath)) { return }
        $descriptor = Get-Content -Raw -LiteralPath $descriptorPath | ConvertFrom-Json
        $safeName = ([string]$descriptor.manifest.name -replace '[^A-Za-z0-9]+', '-').Trim('-')
        if ([string]::IsNullOrWhiteSpace($safeName) -or [string]::IsNullOrWhiteSpace([string]$descriptor.manifest.version)) { throw "Invalid add-on release identity in $descriptorPath" }
        $addOnArchive = Join-Path $resolvedPackages "THSV-$safeName-$($descriptor.manifest.version).thsv-addon"
        npm.cmd run addon:package -- $_.FullName $addOnArchive
        if ($LASTEXITCODE -ne 0) { throw "$($descriptor.manifest.name) add-on packaging failed." }
        $addOnHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $addOnArchive).Hash.ToLowerInvariant()
        $streamerBotPackageRoot = Join-Path $repo "packages\streamerbot\$($_.Name)"
        $streamerBotManifestPath = Join-Path $streamerBotPackageRoot 'manifest.json'
        if (-not (Test-Path -LiteralPath $streamerBotManifestPath)) { throw "$($descriptor.manifest.name) is missing its separate Streamer.bot package." }
        $streamerBotManifest = Get-Content -Raw -LiteralPath $streamerBotManifestPath | ConvertFrom-Json
        $streamerBotImports = @($streamerBotManifest.action.importFile) + @($streamerBotManifest.actions | ForEach-Object { $_.importFile }) |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique
        if ($streamerBotImports.Count -eq 0) { throw "$($descriptor.manifest.name) has no Streamer.bot import file declared." }
        foreach ($importFile in $streamerBotImports) {
            if (-not (Test-Path -LiteralPath (Join-Path $streamerBotPackageRoot $importFile))) { throw "$($descriptor.manifest.name) is missing Streamer.bot import $importFile." }
        }

        $bundleName = "THSV-StreamBridge-AddOn-$safeName-$($descriptor.manifest.version)"
        $bundleRoot = Join-Path $temporary $bundleName
        $bundleStreamerBotRoot = Join-Path $bundleRoot 'Streamer.bot'
        New-Item -ItemType Directory -Path $bundleStreamerBotRoot -Force | Out-Null
        Copy-Item -LiteralPath $addOnArchive -Destination (Join-Path $bundleRoot ([System.IO.Path]::GetFileName($addOnArchive)))
        Set-Content -LiteralPath (Join-Path $bundleRoot "$([System.IO.Path]::GetFileName($addOnArchive)).sha256") -Encoding ascii -Value "$addOnHash  $([System.IO.Path]::GetFileName($addOnArchive))"
        foreach ($importFile in $streamerBotImports) { Copy-Item -LiteralPath (Join-Path $streamerBotPackageRoot $importFile) -Destination $bundleStreamerBotRoot }
        if (Test-Path -LiteralPath (Join-Path $streamerBotPackageRoot 'README.md')) { Copy-Item -LiteralPath (Join-Path $streamerBotPackageRoot 'README.md') -Destination (Join-Path $bundleStreamerBotRoot 'README.md') }
        $installText = @(
            "$($descriptor.manifest.name) $($descriptor.manifest.version)",
            '',
            '1. Open THSV StreamBridge Setup Wizard -> Add-ons.',
            "2. Install $([System.IO.Path]::GetFileName($addOnArchive)) and approve its requested permissions.",
            '3. In Streamer.bot, choose Import and import every .sb file from the Streamer.bot folder.',
            '4. Return to the wizard, enable the add-on, approve only its required Streamer.bot actions, save settings, and restart StreamBridge.',
            '',
            'The Streamer.bot imports in this bundle belong only to this add-on. They are intentionally not included in the main StreamBridge package.'
        )
        Set-Content -LiteralPath (Join-Path $bundleRoot 'INSTALL.txt') -Encoding utf8 -Value $installText
        $addOnBundle = Join-Path $resolvedPackages "$bundleName.zip"
        Compress-Archive -Path "$bundleRoot\*" -DestinationPath $addOnBundle -CompressionLevel Optimal
        $addOnBundleHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $addOnBundle).Hash.ToLowerInvariant()
        $addOnChecksum = "$addOnBundle.sha256"
        Set-Content -LiteralPath $addOnChecksum -Encoding ascii -Value "$addOnBundleHash  $([System.IO.Path]::GetFileName($addOnBundle))"
        Remove-Item -LiteralPath $addOnArchive -Force
        $addOnPackageFolderNames += $_.Name
        $addOnOutputs += [pscustomobject]@{
            ModuleId = [string]$descriptor.manifest.moduleId
            Name = [string]$descriptor.manifest.name
            Version = [string]$descriptor.manifest.version
            PublisherId = [string]$descriptor.trust.publisherId
            Archive = $addOnBundle
            ArchiveName = [System.IO.Path]::GetFileName($addOnBundle)
            Sha256 = $addOnBundleHash
            Checksum = $addOnChecksum
            MinimumCoreVersion = [string]$descriptor.manifest.minimumCoreVersion
            MaximumTestedCoreVersion = [string]$descriptor.manifest.maximumTestedCoreVersion
            Permissions = @($descriptor.permissions)
            Revoked = $false
        }
    }
    $addOnIndexPath = Join-Path $resolvedPackages 'THSV-StreamBridge-AddOns-index.json'
    $addOnIndex = [ordered]@{
        schemaVersion = 1
        product = 'THSV StreamBridge Add-ons'
        generatedAt = (Get-Date).ToUniversalTime().ToString('o')
        releaseUrl = 'https://github.com/surakage/THSV-StreamBridge/releases'
        trustModel = 'GitHub release asset hashes plus GitHub artifact attestations; no silent install or auto-enable.'
        packages = @($addOnOutputs | ForEach-Object {
            [ordered]@{
                moduleId = $_.ModuleId
                name = $_.Name
                version = $_.Version
                publisherId = $_.PublisherId
                archiveName = $_.ArchiveName
                sha256 = $_.Sha256
                minimumCoreVersion = $_.MinimumCoreVersion
                maximumTestedCoreVersion = $_.MaximumTestedCoreVersion
                permissions = @($_.Permissions)
                revoked = $_.Revoked
            }
        })
        revoked = @()
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($addOnIndexPath, ($addOnIndex | ConvertTo-Json -Depth 8), $utf8NoBom)
    $addOnIndexHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $addOnIndexPath).Hash.ToLowerInvariant()
    Set-Content -LiteralPath "$addOnIndexPath.sha256" -Encoding ascii -Value "$addOnIndexHash  $([System.IO.Path]::GetFileName($addOnIndexPath))"

    Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $checksum -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $staging | Out-Null
    $appRoot = Join-Path $staging 'app'
    $runtimeRoot = Join-Path $staging 'runtime'
    $installerRoot = Join-Path $staging 'installer'
    $launcherRoot = Join-Path $staging 'launcher'
    New-Item -ItemType Directory -Path $appRoot, $runtimeRoot, $installerRoot, $launcherRoot | Out-Null

    @('dist','overlays','wizard','package.json','package-lock.json') | ForEach-Object {
        Copy-Item -LiteralPath (Join-Path $repo $_) -Destination $appRoot -Recurse
    }
    New-Item -ItemType Directory -Path (Join-Path $appRoot 'config'), (Join-Path $appRoot 'docs') | Out-Null
    Copy-Item -LiteralPath (Join-Path $repo 'config\bridge.example.json') -Destination (Join-Path $appRoot 'config')
    $releaseDocs = @(
        'add-on-capabilities.md', 'add-on-development.md', 'architecture.md', 'auto-translate.md', 'automated-shoutouts.md', 'browser-overlay.md',
        'compatibility.md', 'configuration.md', 'contracts-v2.md', 'integration-assumptions.md',
        'discord-chat-archive.md', 'getting-started.md', 'production-readiness.md', 'quote-vault.md', 'release.md', 'rewards.md', 'security.md', 'setup.md',
        'streamerbot-csharp-references.md', 'streamerbot-setup.md', 'streamerbot-trigger-matrix.md',
        'subathon-timer.md', 'testing.md', 'timed-actions.md', 'troubleshooting.md', 'user-translate.md'
    )
    foreach ($document in $releaseDocs) {
        Copy-Item -LiteralPath (Join-Path $repo "docs\$document") -Destination (Join-Path $appRoot 'docs')
    }
    New-Item -ItemType Directory -Path (Join-Path $appRoot 'packages') | Out-Null
    $coreStreamerBotRoot = Join-Path $appRoot 'packages\streamerbot'
    New-Item -ItemType Directory -Path $coreStreamerBotRoot | Out-Null
    Get-ChildItem -LiteralPath (Join-Path $repo 'packages\streamerbot') -Directory | Where-Object { $_.Name -notin $addOnPackageFolderNames } | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $coreStreamerBotRoot $_.Name) -Recurse
    }
    # Keep only the import file named by each package manifest; stale generated imports are not runtime assets.
    Get-ChildItem -LiteralPath $coreStreamerBotRoot -Directory | ForEach-Object {
        $manifestPath = Join-Path $_.FullName 'manifest.json'
        if (-not (Test-Path -LiteralPath $manifestPath)) { return }
        $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
        $currentImports = @($manifest.action.importFile) + @($manifest.actions | ForEach-Object { $_.importFile }) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique
        Get-ChildItem -LiteralPath $_.FullName -Filter '*.sb' -File | Where-Object { $_.Name -notin $currentImports } | Remove-Item -Force
    }
    Push-Location $appRoot
    try {
        npm.cmd ci --omit=dev --ignore-scripts
        if ($LASTEXITCODE -ne 0) { throw 'Production dependency installation failed.' }
    } finally { Pop-Location }
    Remove-Item -LiteralPath (Join-Path $appRoot 'package-lock.json') -Force
    Remove-Item -LiteralPath (Join-Path $appRoot 'node_modules\.package-lock.json') -Force -ErrorAction SilentlyContinue

    Copy-Item -LiteralPath (Join-Path $repo 'installer\install.mjs') -Destination $installerRoot
    Copy-Item -LiteralPath (Join-Path $repo 'installer\Install THSV StreamBridge.cmd') -Destination $installerRoot
    Copy-Item -Path (Join-Path $repo 'launcher\*') -Destination $launcherRoot -Recurse
    Copy-Item -LiteralPath (Join-Path $repo 'installer\Install THSV StreamBridge.cmd') -Destination (Join-Path $staging 'Install THSV StreamBridge.cmd')
    @('LICENSE','THIRD-PARTY-NOTICES.md','README.md','CHANGELOG.md','RELEASE-VERIFICATION.md') | ForEach-Object {
        Copy-Item -LiteralPath (Join-Path $repo $_) -Destination $staging
    }

    $nodeArchiveName = "node-v$NodeVersion-win-x64.zip"
    $nodeArchive = Join-Path $temporary $nodeArchiveName
    $nodeBaseUrl = "https://nodejs.org/download/release/v$NodeVersion"
    Invoke-WebRequest -UseBasicParsing -Uri "$nodeBaseUrl/$nodeArchiveName" -OutFile $nodeArchive
    $checksums = (Invoke-WebRequest -UseBasicParsing -Uri "$nodeBaseUrl/SHASUMS256.txt").Content
    $checksumMatch = [regex]::Match($checksums, "(?m)^([a-f0-9]{64})\s+$([regex]::Escape($nodeArchiveName))$")
    if (-not $checksumMatch.Success) { throw "The official Node.js checksum list did not contain $nodeArchiveName." }
    $actualNodeHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $nodeArchive).Hash.ToLowerInvariant()
    if ($actualNodeHash -ne $checksumMatch.Groups[1].Value) { throw 'The downloaded Node.js runtime failed its official SHA-256 verification.' }
    Expand-Archive -LiteralPath $nodeArchive -DestinationPath $temporary
    $nodeExtracted = Join-Path $temporary "node-v$NodeVersion-win-x64"
    Copy-Item -LiteralPath (Join-Path $nodeExtracted 'node.exe') -Destination $runtimeRoot
    Copy-Item -LiteralPath (Join-Path $nodeExtracted 'LICENSE') -Destination (Join-Path $runtimeRoot 'NODE-LICENSE.txt')
    Set-Content -LiteralPath (Join-Path $runtimeRoot 'node-version.txt') -Encoding ascii -Value "v$NodeVersion"

    @('archive','app\packages\streamerbot\viewer-progression','app\packages\streamerbot\companion-actions','app\packages\streamerbot\speaker-orchestration','app\overlays\browser\bloom-idle-sprite.png') | ForEach-Object {
        if (Test-Path -LiteralPath (Join-Path $staging $_)) { throw "Release staging contains archived add-on content: $_" }
    }
    foreach ($unnecessary in @('app\examples', 'app\docs\milestones.md', 'app\docs\stage-2-completion.md', 'app\package-lock.json', 'app\node_modules\.package-lock.json')) {
        if (Test-Path -LiteralPath (Join-Path $staging $unnecessary)) { throw "Release staging contains a development-only file: $unnecessary" }
    }
    $forbiddenReleaseFiles = Get-ChildItem -LiteralPath $staging -File -Recurse | Where-Object {
        $_.Name -in @('.env', 'bridge.local.json', 'control-token', 'streambridge.pid') -or
        $_.FullName -match '[\\/]data[\\/](state|logs|backups|secrets)[\\/].+'
    }
    if ($forbiddenReleaseFiles.Count -gt 0) { throw "Release staging contains private runtime files: $($forbiddenReleaseFiles.FullName -join ', ')" }

    $releaseFiles = @(Get-ChildItem -LiteralPath $staging -File -Recurse | Sort-Object FullName | ForEach-Object {
        $relative = $_.FullName.Substring($resolvedStaging.Length + 1).Replace([System.IO.Path]::DirectorySeparatorChar, '/')
        [ordered]@{ path = $relative; size = $_.Length; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant() }
    })
    $releaseManifest = [ordered]@{
        product = 'THSV StreamBridge'
        layoutVersion = 2
        version = [string]$package.version
        createdAt = (Get-Date).ToUniversalTime().ToString('o')
        canonicalDownload = 'https://github.com/surakage/THSV-StreamBridge/releases'
        runtime = [ordered]@{ nodeVersion = $NodeVersion; platform = 'win32'; arch = 'x64'; upstreamSha256 = $actualNodeHash }
        files = $releaseFiles
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Join-Path $staging 'release-manifest.json'), ($releaseManifest | ConvertTo-Json -Depth 6), $utf8NoBom)
    Compress-Archive -Path "$staging\*" -DestinationPath $archive -CompressionLevel Optimal
    $archiveHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
    Set-Content -LiteralPath $checksum -Encoding ascii -Value "$archiveHash  $([System.IO.Path]::GetFileName($archive))"
    Write-Output "Portable Windows release created at $archive"
    Write-Output "SHA-256 checksum created at $checksum"
    foreach ($addOn in $addOnOutputs) {
        Write-Output "Optional $($addOn.Name) add-on created at $($addOn.Archive)"
        Write-Output "Add-on SHA-256 checksum created at $($addOn.Checksum)"
    }
    Write-Output "Add-on update index created at $addOnIndexPath"
} finally {
    Pop-Location
    Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue
}
