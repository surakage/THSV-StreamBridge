[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$package = Get-Content -Raw -LiteralPath (Join-Path $repo 'package.json') | ConvertFrom-Json
$staging = Join-Path $repo "packages\THSV-StreamBridge-$($package.version)"
$archive = "$staging.zip"
$checksum = "$archive.sha256"
$resolvedPackages = [System.IO.Path]::GetFullPath((Join-Path $repo 'packages'))
$resolvedStaging = [System.IO.Path]::GetFullPath($staging)
if (-not $resolvedStaging.StartsWith($resolvedPackages, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe staging path.' }
Push-Location $repo
try {
    npm run clean
    if ($LASTEXITCODE -ne 0) { throw 'Clean failed.' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
    npm run lint
    if ($LASTEXITCODE -ne 0) { throw 'Lint failed.' }
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw 'Type check failed.' }
    npm test
    if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
    npm run config:validate
    if ($LASTEXITCODE -ne 0) { throw 'Configuration validation failed.' }
    Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $checksum -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $staging | Out-Null
    @('apps','bridge','dist','config','docs','overlays','schemas','scripts','tests','tools','package.json','package-lock.json','tsconfig.json','tsconfig.build.json','vitest.config.ts','eslint.config.mjs','README.md','CHANGELOG.md','LICENSE','THIRD-PARTY-NOTICES.md','.env.example','.gitignore','.gitattributes') | ForEach-Object {
        Copy-Item -LiteralPath (Join-Path $repo $_) -Destination $staging -Recurse
    }
    @('data\runtime','data\state','data\logs','data\backups','packages') | ForEach-Object {
        New-Item -ItemType Directory -Path (Join-Path $staging $_) -Force | Out-Null
    }
    Copy-Item -LiteralPath (Join-Path $repo 'packages\streamerbot') -Destination (Join-Path $staging 'packages\streamerbot') -Recurse
    Get-ChildItem -LiteralPath $staging -Directory -Recurse -Force |
        Where-Object Name -eq '__pycache__' |
        Remove-Item -Recurse -Force
    Get-ChildItem -LiteralPath $staging -File -Recurse -Force |
        Where-Object Extension -in @('.pyc', '.pyo') |
        Remove-Item -Force
    $forbiddenReleaseFiles = Get-ChildItem -LiteralPath $staging -File -Recurse | Where-Object {
        $_.Name -in @('.env', 'bridge.local.json', 'control-token', 'streambridge.pid') -or
        $_.FullName -match '[\\/]data[\\/](state|logs|backups)[\\/].+'
    }
    if ($forbiddenReleaseFiles.Count -gt 0) {
        throw "Release staging contains private runtime files: $($forbiddenReleaseFiles.FullName -join ', ')"
    }
    $releaseFiles = @(Get-ChildItem -LiteralPath $staging -File -Recurse | Sort-Object FullName | ForEach-Object {
        $relative = $_.FullName.Substring($resolvedStaging.Length + 1).Replace([System.IO.Path]::DirectorySeparatorChar, '/')
        [ordered]@{
            path = $relative
            size = $_.Length
            sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
        }
    })
    $releaseManifest = [ordered]@{
        product = 'THSV StreamBridge'
        version = [string]$package.version
        createdAt = (Get-Date).ToUniversalTime().ToString('o')
        minimumNodeVersion = '22.0.0'
        minimumPowerShellVersion = '5.1'
        files = $releaseFiles
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Join-Path $staging 'release-manifest.json'), ($releaseManifest | ConvertTo-Json -Depth 5), $utf8NoBom)
    Compress-Archive -Path "$staging\*" -DestinationPath $archive -CompressionLevel Optimal
    $archiveHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
    Set-Content -LiteralPath $checksum -Encoding ascii -Value "$archiveHash  $([System.IO.Path]::GetFileName($archive))"
    Write-Output "Release package created at $archive"
    Write-Output "SHA-256 checksum created at $checksum"
} finally { Pop-Location }
