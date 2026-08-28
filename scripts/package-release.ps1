[CmdletBinding()]
param(
    [string]$NodeVersion = '22.23.1',
    [string]$SourceCommitSha = '',
    [string]$ValidationReceiptPath = ''
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$package = Get-Content -Raw -LiteralPath (Join-Path $repo 'package.json') | ConvertFrom-Json
# Windows x64 is currently the only supported target; the asset name intentionally omits a platform suffix.
$assetName = "THSV-StreamBridge-$($package.version)"
$staging = Join-Path $repo "packages\$assetName"
$archive = "$staging.zip"
$checksum = "$archive.sha256"
$resolvedSourceCommit = if (-not [string]::IsNullOrWhiteSpace($SourceCommitSha)) { $SourceCommitSha } elseif (-not [string]::IsNullOrWhiteSpace($env:RELEASE_COMMIT_SHA)) { [string]$env:RELEASE_COMMIT_SHA } else { (& git -C $repo rev-parse HEAD 2>$null).Trim() }
if ($resolvedSourceCommit -notmatch '^[0-9a-f]{40}$') { throw 'Release packaging requires an exact 40-character source commit SHA.' }
$sourceTreeState = 'dirty'
$validatedSource = $false
$resolvedPackages = [System.IO.Path]::GetFullPath((Join-Path $repo 'packages'))
$resolvedStaging = [System.IO.Path]::GetFullPath($staging)
if (-not $resolvedStaging.StartsWith($resolvedPackages, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe release staging path.' }
$temporary = Join-Path ([System.IO.Path]::GetTempPath()) ('.thsv-package-' + [guid]::NewGuid().ToString('N'))

function Get-Sha256Hex([string]$Path) {
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        try { return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
        finally { $sha256.Dispose() }
    } finally { $stream.Dispose() }
}

function Invoke-VerifiedDownload {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [string]$OutFile
    )

    $lastError = $null
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            if ([string]::IsNullOrWhiteSpace($OutFile)) {
                return Invoke-WebRequest -UseBasicParsing -Uri $Uri
            }
            Invoke-WebRequest -UseBasicParsing -Uri $Uri -OutFile $OutFile
            return
        } catch {
            $lastError = $_
            if ($attempt -lt 3) { Start-Sleep -Seconds (2 * $attempt) }
        }
    }
    throw "Download failed after 3 attempts: $Uri. $($lastError.Exception.Message)"
}

if (-not [string]::IsNullOrWhiteSpace($ValidationReceiptPath)) {
    $resolvedReceipt = if ([System.IO.Path]::IsPathRooted($ValidationReceiptPath)) { [System.IO.Path]::GetFullPath($ValidationReceiptPath) } else { [System.IO.Path]::GetFullPath((Join-Path $repo $ValidationReceiptPath)) }
    if (-not (Test-Path -LiteralPath $resolvedReceipt)) { throw "Release validation receipt is missing: $resolvedReceipt" }
    $receipt = Get-Content -Raw -LiteralPath $resolvedReceipt | ConvertFrom-Json
    $packageJsonPath = Join-Path $repo 'package.json'; $packageLockPath = Join-Path $repo 'package-lock.json'
    $checks = @('clean', 'imports', 'build', 'lint', 'typecheck', 'tests', 'configuration')
    $validatedAt = [DateTimeOffset]::MinValue
    $validTimestamp = [DateTimeOffset]::TryParse([string]$receipt.validatedAt, [ref]$validatedAt)
    $receiptAgeHours = if ($validTimestamp) { ([DateTimeOffset]::UtcNow - $validatedAt.ToUniversalTime()).TotalHours } else { [double]::PositiveInfinity }
    $currentNodeVersion = (& node --version).Trim(); $currentNpmVersion = (& npm.cmd --version).Trim()
    $currentNodePlatform = (& node -p 'process.platform').Trim(); $currentNodeArchitecture = (& node -p 'process.arch').Trim()
    if ($receipt.schemaVersion -ne 1 -or $receipt.product -ne 'THSV StreamBridge' -or $receipt.sourceCommitSha -ne $resolvedSourceCommit -or $receipt.packageVersion -ne [string]$package.version -or $receipt.packageJsonSha256 -ne (Get-Sha256Hex $packageJsonPath) -or $receipt.packageLockSha256 -ne (Get-Sha256Hex $packageLockPath) -or $receiptAgeHours -lt -0.1 -or $receiptAgeHours -gt 24 -or $receipt.toolchain.nodeVersion -ne $currentNodeVersion -or $receipt.toolchain.npmVersion -ne $currentNpmVersion -or $receipt.toolchain.platform -ne $currentNodePlatform -or $receipt.toolchain.architecture -ne $currentNodeArchitecture -or @($checks | Where-Object { $receipt.checks.$_ -ne $true }).Count -ne 0) { throw 'Release validation receipt does not match this source tree, toolchain, or 24-hour validation window.' }
    if (@(& git -C $repo status --porcelain --untracked-files=normal 2>$null).Count -ne 0) { throw 'A release validation receipt can only be reused with a clean working tree and no untracked release inputs.' }
    $validatedSource = $true
}

function Get-VerifiedNodeRuntimeCache([string]$Root, [string]$ExpectedVersion) {
    $manifestPath = Join-Path $Root 'runtime-cache.json'; $nodePath = Join-Path $Root 'node.exe'; $licensePath = Join-Path $Root 'NODE-LICENSE.txt'
    if (-not (Test-Path -LiteralPath $manifestPath) -or -not (Test-Path -LiteralPath $nodePath) -or -not (Test-Path -LiteralPath $licensePath)) { return $null }
    try {
        $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
        $nodeHash = Get-Sha256Hex $nodePath
        $nodeVersion = (& $nodePath --version 2>$null)
        if ($manifest.schemaVersion -ne 1 -or $manifest.nodeVersion -ne $ExpectedVersion -or $nodeVersion -ne "v$ExpectedVersion" -or $manifest.nodeSha256 -ne $nodeHash -or $manifest.upstreamSha256 -notmatch '^[a-f0-9]{64}$') { return $null }
        return [pscustomobject]@{ Node = $nodePath; License = $licensePath; UpstreamSha256 = [string]$manifest.upstreamSha256; Source = "dedicated cache $Root" }
    } catch { return $null }
}

function Save-VerifiedNodeRuntimeCache([string]$Root, [string]$NodePath, [string]$LicensePath, [string]$ExpectedVersion, [string]$UpstreamSha256, [string]$Source) {
    $parent = Split-Path -Parent $Root; New-Item -ItemType Directory -Path $parent -Force | Out-Null
    $temporaryCache = Join-Path $parent ('.node-runtime-cache-' + [guid]::NewGuid().ToString('N'))
    try {
        New-Item -ItemType Directory -Path $temporaryCache -Force | Out-Null
        Copy-Item -LiteralPath $NodePath -Destination (Join-Path $temporaryCache 'node.exe')
        Copy-Item -LiteralPath $LicensePath -Destination (Join-Path $temporaryCache 'NODE-LICENSE.txt')
        $manifest = [ordered]@{ schemaVersion = 1; nodeVersion = $ExpectedVersion; platform = 'win32'; arch = 'x64'; upstreamSha256 = $UpstreamSha256; nodeSha256 = Get-Sha256Hex (Join-Path $temporaryCache 'node.exe'); cachedAt = (Get-Date).ToUniversalTime().ToString('o'); source = $Source }
        [System.IO.File]::WriteAllText((Join-Path $temporaryCache 'runtime-cache.json'), ($manifest | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
        if (Test-Path -LiteralPath $Root) { Remove-Item -LiteralPath $Root -Recurse -Force }
        Move-Item -LiteralPath $temporaryCache -Destination $Root
    } finally { Remove-Item -LiteralPath $temporaryCache -Recurse -Force -ErrorAction SilentlyContinue }
}

Push-Location $repo
try {
    npm.cmd run clean
    if ($LASTEXITCODE -ne 0) { throw 'Clean failed.' }
    npm.cmd run imports:sync
    if ($LASTEXITCODE -ne 0) { throw 'Streamer.bot import synchronization failed.' }
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
    if ($validatedSource) {
        if (@(& git status --porcelain --untracked-files=normal).Count -ne 0) { throw 'Receipt-backed repackaging changed source files after validation.' }
        Write-Output "Reusing the matching release validation receipt at $resolvedReceipt"
    } else {
        npm.cmd run lint
        if ($LASTEXITCODE -ne 0) { throw 'Lint failed.' }
        npm.cmd run typecheck
        if ($LASTEXITCODE -ne 0) { throw 'Type check failed.' }
        npm.cmd test
        if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
        npm.cmd run config:validate
        if ($LASTEXITCODE -ne 0) { throw 'Configuration validation failed.' }
    }
    New-Item -ItemType Directory -Path $temporary -Force | Out-Null
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $streamerBotImportIndex = Get-Content -Raw -LiteralPath (Join-Path $repo 'packages\streamerbot\import-index.json') | ConvertFrom-Json
    if ($streamerBotImportIndex.bridgeVersion -ne [string]$package.version) { throw 'The Streamer.bot import index does not match the release version.' }
    $mainFeatureRegistryFile = Get-Content -Raw -LiteralPath (Join-Path $repo 'bridge\core\main-feature-registry.ts')
    $presentationPolicyMarker = 'export const MAIN_FEATURE_PRESENTATION_POLICY'
    $presentationPolicyIndex = $mainFeatureRegistryFile.IndexOf($presentationPolicyMarker, [System.StringComparison]::Ordinal)
    if ($presentationPolicyIndex -lt 0) { throw 'The main feature registry presentation-policy marker is missing.' }
    # Use IndexOf/Substring rather than String.Split. Windows PowerShell 5.1 can
    # bind Split(string) as Split(char[]), which empties this prefix and causes
    # every bundled extension to be published incorrectly as an optional add-on.
    $mainFeatureRegistrySource = $mainFeatureRegistryFile.Substring(0, $presentationPolicyIndex)
    $builtInIntegrationIds = @('thsv.viewer-foundation', 'thsv.community-analytics', 'thsv.kofi-donations')
    $bundledExtensionIds = @([regex]::Matches($mainFeatureRegistrySource, "'(?<id>thsv\.[a-z0-9-]+)'") | ForEach-Object { $_.Groups['id'].Value } | Where-Object { $_ -notin $builtInIntegrationIds } | Select-Object -Unique)
    $bundledExtensionsRoot = Join-Path $temporary 'bundled-extensions'
    $officialUpdatesRoot = Join-Path $temporary 'official-updates'
    New-Item -ItemType Directory -Path $bundledExtensionsRoot, $officialUpdatesRoot -Force | Out-Null
    # Release output is a single-version handoff surface. Remove older generated core
    # archives so a local package directory cannot be mistaken for the current release.
    Get-ChildItem -LiteralPath $resolvedPackages -Filter 'THSV-StreamBridge-*.zip*' -File |
        Where-Object { $_.Name -notlike 'THSV-StreamBridge-AddOn-*' } |
        Remove-Item -Force
    Get-ChildItem -LiteralPath $resolvedPackages -Filter '*.thsv-addon*' -File | Remove-Item -Force
    Get-ChildItem -LiteralPath $resolvedPackages -Filter 'THSV-StreamBridge-AddOn-*.zip*' -File | Remove-Item -Force
    $addOnOutputs = @()
     Get-ChildItem -LiteralPath (Join-Path $repo 'addons') -Directory |
         Sort-Object Name |
         ForEach-Object {
         if ($_.Name -in @('viewer-foundation', 'community-analytics', 'kofi-donations')) { return }
         $descriptorPath = Join-Path $_.FullName 'module-package.json'
        if (-not (Test-Path -LiteralPath $descriptorPath)) { return }
        $packageFolderName = $_.Name
        $descriptor = Get-Content -Raw -LiteralPath $descriptorPath | ConvertFrom-Json
        $safeName = ([string]$descriptor.manifest.name -replace '[^A-Za-z0-9]+', '-').Trim('-')
        if ([string]::IsNullOrWhiteSpace($safeName) -or [string]::IsNullOrWhiteSpace([string]$descriptor.manifest.version)) { throw "Invalid add-on release identity in $descriptorPath" }
        $addOnArchive = Join-Path $resolvedPackages "THSV-$safeName-$($descriptor.manifest.version).thsv-addon"
        npm.cmd run addon:package -- $_.FullName $addOnArchive
        if ($LASTEXITCODE -ne 0) { throw "$($descriptor.manifest.name) add-on packaging failed." }
        $addOnHash = Get-Sha256Hex $addOnArchive
        Copy-Item -LiteralPath $addOnArchive -Destination (Join-Path $officialUpdatesRoot "$([string]$descriptor.manifest.moduleId).thsv-addon")
        $streamerBotPackageRoot = Join-Path $repo "packages\streamerbot\$($_.Name)"
        $streamerBotManifestPath = Join-Path $streamerBotPackageRoot 'manifest.json'
        $hasStreamerBotPackage = Test-Path -LiteralPath $streamerBotManifestPath
        $streamerBotImports = @()
        if ($hasStreamerBotPackage) {
            $streamerBotManifest = Get-Content -Raw -LiteralPath $streamerBotManifestPath | ConvertFrom-Json
            $streamerBotImports = @($streamerBotManifest.action.importFile) + @($streamerBotManifest.actions | ForEach-Object { $_.importFile }) |
                Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique
            if ($streamerBotImports.Count -eq 0) { throw "$($descriptor.manifest.name) has a Streamer.bot package but no import file declared." }
            foreach ($importFile in $streamerBotImports) {
                if (-not (Test-Path -LiteralPath (Join-Path $streamerBotPackageRoot $importFile))) { throw "$($descriptor.manifest.name) is missing Streamer.bot import $importFile." }
            }
        }

        $currentModuleId = [string]$descriptor.manifest.moduleId
        if ($bundledExtensionIds -contains $currentModuleId) {
            # Built-in extensions ship inside the main StreamBridge archive. Keep their
            # verified component package for release staging, but do not publish a second,
            # misleading optional add-on download for the same feature.
            Copy-Item -LiteralPath $addOnArchive -Destination (Join-Path $bundledExtensionsRoot "$currentModuleId.thsv-addon")
            Remove-Item -LiteralPath $addOnArchive -Force
            return
        }

        $bundleName = "THSV-StreamBridge-AddOn-$safeName-$($descriptor.manifest.version)"
        $bundleRoot = Join-Path $temporary $bundleName
        $bundleStreamerBotRoot = Join-Path $bundleRoot 'Streamer.bot'
        New-Item -ItemType Directory -Path $bundleRoot -Force | Out-Null
        Copy-Item -LiteralPath $addOnArchive -Destination (Join-Path $bundleRoot ([System.IO.Path]::GetFileName($addOnArchive)))
        Set-Content -LiteralPath (Join-Path $bundleRoot "$([System.IO.Path]::GetFileName($addOnArchive)).sha256") -Encoding ascii -Value "$addOnHash  $([System.IO.Path]::GetFileName($addOnArchive))"
        if ($hasStreamerBotPackage) {
            New-Item -ItemType Directory -Path $bundleStreamerBotRoot -Force | Out-Null
            foreach ($importFile in $streamerBotImports) {
                $importPath = Join-Path $streamerBotPackageRoot $importFile
                Copy-Item -LiteralPath $importPath -Destination $bundleStreamerBotRoot
                $importHash = Get-Sha256Hex $importPath
                Set-Content -LiteralPath (Join-Path $bundleStreamerBotRoot "$importFile.sha256") -Encoding ascii -Value "$importHash  $importFile"
            }
            $packageImportRecord = $streamerBotImportIndex.packages | Where-Object { $_.folder -eq $packageFolderName } | Select-Object -First 1
            if ($null -eq $packageImportRecord) { throw "$($descriptor.manifest.name) is missing from the synchronized Streamer.bot import index." }
            [System.IO.File]::WriteAllText((Join-Path $bundleStreamerBotRoot 'import-index.json'), ($packageImportRecord | ConvertTo-Json -Depth 6), $utf8NoBom)
            if (Test-Path -LiteralPath (Join-Path $streamerBotPackageRoot 'README.md')) { Copy-Item -LiteralPath (Join-Path $streamerBotPackageRoot 'README.md') -Destination (Join-Path $bundleStreamerBotRoot 'README.md') }
            $installText = @(
                "$($descriptor.manifest.name) $($descriptor.manifest.version)", '',
                '1. Open THSV StreamBridge Setup Wizard -> Add-ons.',
                "2. Install $([System.IO.Path]::GetFileName($addOnArchive)) and approve its requested permissions.",
                '3. Return to THSV Setup Wizard -> Streamer.bot -> One Streamer.bot import.',
                '4. Select this add-on and your other enabled features, then download and import the single generated .sb file.',
                '5. Return to the wizard, enable the add-on, approve only its required Streamer.bot actions, save settings, and restart StreamBridge.', '',
                'The individual Streamer.bot import remains in this bundle as a recovery option. Normal setup should use the wizard-generated universal import so only one file is imported.'
            )
        } else {
            $installText = @(
                "$($descriptor.manifest.name) $($descriptor.manifest.version)", '',
                '1. Open THSV StreamBridge Setup Wizard -> Add-ons.',
                "2. Install $([System.IO.Path]::GetFileName($addOnArchive)) and approve its requested permissions.",
                '3. Enable the add-on, save its settings, and restart StreamBridge.', '',
                'No Streamer.bot import is required. This add-on uses the existing normalized-event and capability-broker connection.'
            )
        }
        Set-Content -LiteralPath (Join-Path $bundleRoot 'INSTALL.txt') -Encoding utf8 -Value $installText
        $setupGuide = Join-Path $repo "docs\addons\$($_.Name).md"
        if (-not (Test-Path -LiteralPath $setupGuide)) { throw "$($descriptor.manifest.name) is missing its setup guide." }
        Copy-Item -LiteralPath $setupGuide -Destination (Join-Path $bundleRoot 'SETUP.md')
        $addOnBundle = Join-Path $resolvedPackages "$bundleName.zip"
        Compress-Archive -Path "$bundleRoot\*" -DestinationPath $addOnBundle -CompressionLevel Optimal
        $addOnBundleHash = Get-Sha256Hex $addOnBundle
        $addOnChecksum = "$addOnBundle.sha256"
        Set-Content -LiteralPath $addOnChecksum -Encoding ascii -Value "$addOnBundleHash  $([System.IO.Path]::GetFileName($addOnBundle))"
        Remove-Item -LiteralPath $addOnArchive -Force
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
            MinimumBridgeVersion = [string]$descriptor.manifest.minimumBridgeVersion
            MaximumTestedBridgeVersion = [string]$descriptor.manifest.maximumTestedBridgeVersion
            Permissions = @($descriptor.permissions)
            Revoked = $false
        }
    }
    $bundledExtensionFiles = @(Get-ChildItem -LiteralPath $bundledExtensionsRoot -Filter '*.thsv-addon' -File)
    if ($bundledExtensionFiles.Count -ne $bundledExtensionIds.Count) {
        throw "Release staging expected $($bundledExtensionIds.Count) bundled extension components but prepared $($bundledExtensionFiles.Count)."
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
                minimumBridgeVersion = $_.MinimumBridgeVersion
                maximumTestedBridgeVersion = $_.MaximumTestedBridgeVersion
                permissions = @($_.Permissions)
                revoked = $_.Revoked
            }
        })
        revoked = @()
    }
    [System.IO.File]::WriteAllText($addOnIndexPath, ($addOnIndex | ConvertTo-Json -Depth 8), $utf8NoBom)
    $addOnIndexHash = Get-Sha256Hex $addOnIndexPath
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
    $viewerFoundationIntegrationRoot = Join-Path $appRoot 'integrations\viewer-foundation'
    Copy-Item -LiteralPath (Join-Path $repo 'addons\viewer-foundation') -Destination $viewerFoundationIntegrationRoot -Recurse
    $communityAnalyticsIntegrationRoot = Join-Path $appRoot 'integrations\community-analytics'
    Copy-Item -LiteralPath (Join-Path $repo 'addons\community-analytics') -Destination $communityAnalyticsIntegrationRoot -Recurse
    $kofiDonationsIntegrationRoot = Join-Path $appRoot 'integrations\kofi-donations'
    Copy-Item -LiteralPath (Join-Path $repo 'addons\kofi-donations') -Destination $kofiDonationsIntegrationRoot -Recurse
    New-Item -ItemType Directory -Path (Join-Path $appRoot 'config'), (Join-Path $appRoot 'docs') | Out-Null
    Copy-Item -LiteralPath (Join-Path $repo 'config\bridge.example.json') -Destination (Join-Path $appRoot 'config')
    $releaseDocs = @(
        'add-on-capabilities.md', 'add-on-development.md', 'addon-setup-for-beginners.md', 'architecture.md', 'automated-shoutouts.md', 'browser-overlay.md',
        'compatibility.md', 'complete-setup-guide.md', 'configuration.md', 'contracts-v2.md', 'integration-assumptions.md',
        'discord-chat-archive.md', 'future-projects-and-addons.md', 'getting-started.md', 'kofi-donations.md', 'module-system.md',
        'main-features.md', 'product-scope.md', 'production-readiness.md', 'quote-vault.md', 'recovery-bundles.md', 'release-candidate-status.md', 'release.md', 'rewards.md', 'scene-actions.md', 'security.md', 'setup.md', 'setup-for-beginners.md',
        'streamerbot-csharp-references.md', 'streamerbot-setup.md', 'streamerbot-trigger-matrix.md',
        'starting-soon-countdown.md', 'subathon-timer.md', 'testing.md', 'timed-actions.md', 'troubleshooting.md', 'user-translate.md', 'version-3-migration.md', 'live-test-checklist.md', 'viewer-foundation.md'
    )
    foreach ($document in $releaseDocs) {
        Copy-Item -LiteralPath (Join-Path $repo "docs\$document") -Destination (Join-Path $appRoot 'docs')
    }
    New-Item -ItemType Directory -Path (Join-Path $appRoot 'docs\addons') -Force | Out-Null
    Get-ChildItem -LiteralPath (Join-Path $repo 'docs\addons') -Filter '*.md' -File | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $appRoot 'docs\addons')
    }
    New-Item -ItemType Directory -Path (Join-Path $appRoot 'packages') | Out-Null
    $appExtensionsRoot = Join-Path $appRoot 'packages\extensions'
    New-Item -ItemType Directory -Path $appExtensionsRoot -Force | Out-Null
    $bundledExtensionFiles | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $appExtensionsRoot $_.Name)
    }
    $stagedBundledExtensionFiles = @(Get-ChildItem -LiteralPath $appExtensionsRoot -Filter '*.thsv-addon' -File)
    if ($stagedBundledExtensionFiles.Count -ne $bundledExtensionIds.Count) {
        throw "Release package expected $($bundledExtensionIds.Count) bundled extension components but staged $($stagedBundledExtensionFiles.Count)."
    }
    $appOfficialUpdatesRoot = Join-Path $appRoot 'packages\official-updates'
    New-Item -ItemType Directory -Path $appOfficialUpdatesRoot -Force | Out-Null
    Get-ChildItem -LiteralPath $officialUpdatesRoot -Filter '*.thsv-addon' -File | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $appOfficialUpdatesRoot $_.Name) }
    $coreStreamerBotRoot = Join-Path $appRoot 'packages\streamerbot'
    New-Item -ItemType Directory -Path $coreStreamerBotRoot | Out-Null
    Copy-Item -LiteralPath (Join-Path $repo 'packages\streamerbot\import-index.json') -Destination $coreStreamerBotRoot
    # Ship every reviewed import template so the authenticated local wizard can compose one
    # selective, version-matched Streamer.bot package. Optional add-on code still requires
    # explicit creator approval and is never installed or enabled by this template copy.
    Get-ChildItem -LiteralPath (Join-Path $repo 'packages\streamerbot') -Directory | ForEach-Object {
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
    # Treat the generated import index as the release allow-list and integrity manifest.
    # A partial copy or stale package directory must fail packaging, not a creator's setup.
    $indexedStreamerBotFolders = @($streamerBotImportIndex.packages | ForEach-Object { [string]$_.folder })
    $unexpectedStreamerBotFolders = @(Get-ChildItem -LiteralPath $coreStreamerBotRoot -Directory | Where-Object { $_.Name -notin $indexedStreamerBotFolders })
    if ($unexpectedStreamerBotFolders.Count -gt 0) { throw "Release staging contains unindexed Streamer.bot packages: $($unexpectedStreamerBotFolders.Name -join ', ')" }
    foreach ($packageRecord in $streamerBotImportIndex.packages) {
        $packageRoot = Join-Path $coreStreamerBotRoot ([string]$packageRecord.folder)
        $manifestPath = Join-Path $packageRoot 'manifest.json'
        if (-not (Test-Path -LiteralPath $manifestPath)) { throw "Release staging is missing Streamer.bot manifest for $($packageRecord.folder)." }
        if ((Get-Sha256Hex $manifestPath) -ne [string]$packageRecord.manifestSha256) { throw "Release staging has a mismatched Streamer.bot manifest for $($packageRecord.folder)." }
        foreach ($importRecord in $packageRecord.imports) {
            $importPath = Join-Path $packageRoot ([string]$importRecord.filename)
            if (-not (Test-Path -LiteralPath $importPath)) { throw "Release staging is missing Streamer.bot import $($importRecord.filename)." }
            $importFile = Get-Item -LiteralPath $importPath
            if ($importFile.Length -ne [long]$importRecord.size -or (Get-Sha256Hex $importPath) -ne [string]$importRecord.sha256) {
                throw "Release staging has a mismatched Streamer.bot import $($importRecord.filename)."
            }
        }
    }
    Push-Location $appRoot
    try {
        # Release dependency installation must not depend on or mutate the creator's
        # machine-global npm cache. Antivirus and other npm processes commonly lock
        # that cache on Windows, which previously made otherwise valid builds fail.
        $releaseNpmCache = Join-Path $temporary 'npm-cache'
        New-Item -ItemType Directory -Path $releaseNpmCache -Force | Out-Null
        npm.cmd ci --omit=dev --ignore-scripts --no-audit --no-fund --cache $releaseNpmCache
        if ($LASTEXITCODE -ne 0) { throw 'Production dependency installation failed.' }
    } finally { Pop-Location }
    Remove-Item -LiteralPath (Join-Path $appRoot 'package-lock.json') -Force
    Remove-Item -LiteralPath (Join-Path $appRoot 'node_modules\.package-lock.json') -Force -ErrorAction SilentlyContinue

    Copy-Item -LiteralPath (Join-Path $repo 'installer\install.mjs') -Destination $installerRoot
    Copy-Item -LiteralPath (Join-Path $repo 'installer\apply-update.mjs') -Destination $installerRoot
    Copy-Item -LiteralPath (Join-Path $repo 'installer\Install THSV StreamBridge.cmd') -Destination $installerRoot
    Copy-Item -Path (Join-Path $repo 'launcher\*') -Destination $launcherRoot -Recurse
    Get-ChildItem -LiteralPath $launcherRoot -Filter '*.d.mts' -File -Recurse | Remove-Item -Force
    Copy-Item -LiteralPath (Join-Path $repo 'tools\start-streamerbot-safely.mjs') -Destination (Join-Path $launcherRoot 'start-streamerbot.mjs')
    Copy-Item -LiteralPath (Join-Path $repo 'Start THSV Streamer.bot Safely.cmd') -Destination $launcherRoot
    Copy-Item -LiteralPath (Join-Path $repo 'installer\Install THSV StreamBridge.cmd') -Destination (Join-Path $staging 'Install THSV StreamBridge.cmd')
    @('LICENSE','THIRD-PARTY-NOTICES.md','README.md','CHANGELOG.md','RELEASE-VERIFICATION.md') | ForEach-Object {
        Copy-Item -LiteralPath (Join-Path $repo $_) -Destination $staging
    }

    $nodeArchiveName = "node-v$NodeVersion-win-x64.zip"
    $nodeArchive = Join-Path $temporary $nodeArchiveName
    $nodeBaseUrl = "https://nodejs.org/download/release/v$NodeVersion"
    $actualNodeHash = $null
    $runtimeCacheRoot = [System.IO.Path]::GetFullPath((Join-Path $repo ".cache\node-runtime\node-v$NodeVersion-win-x64"))
    $resolvedRuntimeCacheParent = [System.IO.Path]::GetFullPath((Join-Path $repo '.cache\node-runtime'))
    if (-not $runtimeCacheRoot.StartsWith($resolvedRuntimeCacheParent + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe Node runtime cache path.' }
    $cachedRuntime = Get-VerifiedNodeRuntimeCache $runtimeCacheRoot $NodeVersion
    if ($null -ne $cachedRuntime) {
        Write-Output "Using checksum-verified Node.js runtime from $($cachedRuntime.Source)."
        Copy-Item -LiteralPath $cachedRuntime.Node -Destination $runtimeRoot
        Copy-Item -LiteralPath $cachedRuntime.License -Destination (Join-Path $runtimeRoot 'NODE-LICENSE.txt')
        $actualNodeHash = $cachedRuntime.UpstreamSha256
    } else { try {
        Invoke-VerifiedDownload -Uri "$nodeBaseUrl/$nodeArchiveName" -OutFile $nodeArchive
        $checksums = (Invoke-VerifiedDownload -Uri "$nodeBaseUrl/SHASUMS256.txt").Content
        $checksumMatch = [regex]::Match($checksums, "(?m)^([a-f0-9]{64})\s+$([regex]::Escape($nodeArchiveName))$")
        if (-not $checksumMatch.Success) { throw "The official Node.js checksum list did not contain $nodeArchiveName." }
        $actualNodeHash = Get-Sha256Hex $nodeArchive
        if ($actualNodeHash -ne $checksumMatch.Groups[1].Value) { throw 'The downloaded Node.js runtime failed its official SHA-256 verification.' }
        Expand-Archive -LiteralPath $nodeArchive -DestinationPath $temporary
        $nodeExtracted = Join-Path $temporary "node-v$NodeVersion-win-x64"
        Copy-Item -LiteralPath (Join-Path $nodeExtracted 'node.exe') -Destination $runtimeRoot
        Copy-Item -LiteralPath (Join-Path $nodeExtracted 'LICENSE') -Destination (Join-Path $runtimeRoot 'NODE-LICENSE.txt')
        Save-VerifiedNodeRuntimeCache $runtimeCacheRoot (Join-Path $runtimeRoot 'node.exe') (Join-Path $runtimeRoot 'NODE-LICENSE.txt') $NodeVersion $actualNodeHash 'nodejs.org verified download'
    } catch {
        $fallbackRuntime = Get-ChildItem -LiteralPath $resolvedPackages -Directory -Filter 'THSV-StreamBridge-*' |
            Sort-Object LastWriteTime -Descending |
            ForEach-Object {
                $manifestPath = Join-Path $_.FullName 'release-manifest.json'
                $nodePath = Join-Path $_.FullName 'runtime\node.exe'
                $licensePath = Join-Path $_.FullName 'runtime\NODE-LICENSE.txt'
                if (-not (Test-Path -LiteralPath $manifestPath) -or -not (Test-Path -LiteralPath $nodePath) -or -not (Test-Path -LiteralPath $licensePath)) { return }
                $cachedManifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
                $cachedNodeFile = $cachedManifest.files | Where-Object { $_.path -eq 'runtime/node.exe' } | Select-Object -First 1
                $cachedHash = Get-Sha256Hex $nodePath
                $cachedVersion = (& $nodePath --version 2>$null)
                if ($cachedVersion -eq "v$NodeVersion" -and
                    $cachedManifest.runtime.nodeVersion -eq $NodeVersion -and
                    $cachedNodeFile.sha256 -eq $cachedHash -and
                    $cachedManifest.runtime.upstreamSha256 -match '^[a-f0-9]{64}$') {
                    [pscustomobject]@{ Node = $nodePath; License = $licensePath; UpstreamSha256 = $cachedManifest.runtime.upstreamSha256; Source = $_.Name }
                }
            } | Select-Object -First 1
        if ($null -eq $fallbackRuntime) { throw }
        Write-Warning "Official Node.js download failed; seeding the dedicated runtime cache from verified release $($fallbackRuntime.Source)."
        Copy-Item -LiteralPath $fallbackRuntime.Node -Destination $runtimeRoot
        Copy-Item -LiteralPath $fallbackRuntime.License -Destination (Join-Path $runtimeRoot 'NODE-LICENSE.txt')
        $actualNodeHash = $fallbackRuntime.UpstreamSha256
        Save-VerifiedNodeRuntimeCache $runtimeCacheRoot (Join-Path $runtimeRoot 'node.exe') (Join-Path $runtimeRoot 'NODE-LICENSE.txt') $NodeVersion $actualNodeHash "verified release $($fallbackRuntime.Source)"
    } }
    Copy-Item -LiteralPath (Join-Path $repo 'docs\addons') -Destination (Join-Path $appRoot 'docs\addons') -Recurse
    Set-Content -LiteralPath (Join-Path $runtimeRoot 'node-version.txt') -Encoding ascii -Value "v$NodeVersion"

    # Capture a deterministic, content-derived identity before Authenticode can add
    # certificate and timestamp data to any executable. The final release manifest
    # records this unsigned identity separately from the signing result.
    $sourceTreeState = if (@(& git status --porcelain --untracked-files=normal 2>$null).Count -eq 0) { 'clean' } else { 'dirty' }
    $unsignedFiles = @(Get-ChildItem -LiteralPath $staging -File -Recurse | Sort-Object FullName | ForEach-Object {
        $relative = $_.FullName.Substring($resolvedStaging.Length + 1).Replace([System.IO.Path]::DirectorySeparatorChar, '/')
        [ordered]@{ path = $relative; size = $_.Length; sha256 = Get-Sha256Hex $_.FullName }
    })
    $unsignedPayloadManifest = [ordered]@{
        schemaVersion = 1
        product = 'THSV StreamBridge'
        version = [string]$package.version
        source = [ordered]@{ repository = 'surakage/THSV-StreamBridge'; commitSha = $resolvedSourceCommit; treeState = $sourceTreeState }
        runtime = [ordered]@{ nodeVersion = $NodeVersion; platform = 'win32'; arch = 'x64'; upstreamSha256 = $actualNodeHash }
        files = $unsignedFiles
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $unsignedPayloadManifestPath = Join-Path $staging 'unsigned-payload-manifest.json'
    [System.IO.File]::WriteAllText($unsignedPayloadManifestPath, ($unsignedPayloadManifest | ConvertTo-Json -Depth 6), $utf8NoBom)
    $unsignedPayloadSha256 = Get-Sha256Hex $unsignedPayloadManifestPath

    $signingArguments = @{ StagingRoot = $staging }
    if (-not [string]::IsNullOrWhiteSpace($env:THSV_WINDOWS_SIGNING_PFX)) {
        $signingArguments.CertificatePath = $env:THSV_WINDOWS_SIGNING_PFX
        $signingArguments.CertificatePassword = [string]$env:THSV_WINDOWS_SIGNING_PASSWORD
        $signingArguments.AllowedCertificateThumbprints = @(([string]$env:THSV_WINDOWS_SIGNING_ALLOWED_THUMBPRINTS -split '[,;\r\n]+' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }))
        if (-not [string]::IsNullOrWhiteSpace($env:THSV_WINDOWS_SIGNING_MINIMUM_VALIDITY_DAYS)) { $signingArguments.MinimumCertificateValidityDays = [int]$env:THSV_WINDOWS_SIGNING_MINIMUM_VALIDITY_DAYS }
        if (-not [string]::IsNullOrWhiteSpace($env:THSV_WINDOWS_SIGNING_EXPIRY_WARNING_DAYS)) { $signingArguments.CertificateExpiryWarningDays = [int]$env:THSV_WINDOWS_SIGNING_EXPIRY_WARNING_DAYS }
    }
    if ($env:THSV_REQUIRE_VALID_RUNTIME_SIGNATURE -eq '1') { $signingArguments.RequireValidRuntime = $true }
    $signing = & (Join-Path $repo 'scripts\sign-windows-release.ps1') @signingArguments
    [System.IO.File]::WriteAllText((Join-Path $staging 'windows-signing.json'), ($signing | ConvertTo-Json -Depth 8), [System.Text.UTF8Encoding]::new($false))

    @('archive','app\packages\streamerbot\viewer-progression','app\packages\streamerbot\companion-actions','app\packages\streamerbot\speaker-orchestration','app\overlays\browser\bloom-idle-sprite.png') | ForEach-Object {
        if (Test-Path -LiteralPath (Join-Path $staging $_)) { throw "Release staging contains archived add-on content: $_" }
    }
    foreach ($unnecessary in @('app\examples', 'app\docs\milestones.md', 'app\package-lock.json', 'app\node_modules\.package-lock.json')) {
        if (Test-Path -LiteralPath (Join-Path $staging $unnecessary)) { throw "Release staging contains a development-only file: $unnecessary" }
    }
    $forbiddenReleaseFiles = Get-ChildItem -LiteralPath $staging -File -Recurse | Where-Object {
        $_.Name -in @('.env', 'bridge.local.json', 'control-token', 'streambridge.pid') -or
        $_.FullName -match '[\\/]data[\\/](state|logs|backups|secrets)[\\/].+'
    }
    if ($forbiddenReleaseFiles.Count -gt 0) { throw "Release staging contains private runtime files: $($forbiddenReleaseFiles.FullName -join ', ')" }

    $releaseFiles = @(Get-ChildItem -LiteralPath $staging -File -Recurse | Sort-Object FullName | ForEach-Object {
        $relative = $_.FullName.Substring($resolvedStaging.Length + 1).Replace([System.IO.Path]::DirectorySeparatorChar, '/')
        [ordered]@{ path = $relative; size = $_.Length; sha256 = Get-Sha256Hex $_.FullName }
    })
    $releaseManifest = [ordered]@{
        product = 'THSV StreamBridge'
        layoutVersion = 2
        version = [string]$package.version
        createdAt = (Get-Date).ToUniversalTime().ToString('o')
        canonicalDownload = 'https://github.com/surakage/THSV-StreamBridge/releases'
        source = [ordered]@{ repository = 'surakage/THSV-StreamBridge'; commitSha = $resolvedSourceCommit; treeState = $sourceTreeState }
        runtime = [ordered]@{ nodeVersion = $NodeVersion; platform = 'win32'; arch = 'x64'; upstreamSha256 = $actualNodeHash; authenticodeStatus = $signing.runtime.status }
        unsignedPayload = [ordered]@{ manifestPath = 'unsigned-payload-manifest.json'; sha256 = $unsignedPayloadSha256; fileCount = $unsignedFiles.Count }
        signing = $signing.firstParty
        files = $releaseFiles
    }
    [System.IO.File]::WriteAllText((Join-Path $staging 'release-manifest.json'), ($releaseManifest | ConvertTo-Json -Depth 6), $utf8NoBom)
    Compress-Archive -Path "$staging\*" -DestinationPath $archive -CompressionLevel Optimal
    $archiveHash = Get-Sha256Hex $archive
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
