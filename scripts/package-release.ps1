[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$package = Get-Content -Raw -LiteralPath (Join-Path $repo 'package.json') | ConvertFrom-Json
$staging = Join-Path $repo "packages\THSV-StreamBridge-$($package.version)"
$archive = "$staging.zip"
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
    New-Item -ItemType Directory -Path $staging | Out-Null
    @('apps','bridge','dist','config','docs','overlays','schemas','scripts','tests','tools','package.json','package-lock.json','tsconfig.json','tsconfig.build.json','vitest.config.ts','eslint.config.mjs','README.md','CHANGELOG.md','LICENSE','.env.example','.gitignore','.gitattributes') | ForEach-Object {
        Copy-Item -LiteralPath (Join-Path $repo $_) -Destination $staging -Recurse
    }
    @('data\runtime','data\state','data\logs','data\backups','packages') | ForEach-Object {
        New-Item -ItemType Directory -Path (Join-Path $staging $_) -Force | Out-Null
    }
    Copy-Item -LiteralPath (Join-Path $repo 'packages\streamerbot') -Destination (Join-Path $staging 'packages\streamerbot') -Recurse
    Compress-Archive -Path "$staging\*" -DestinationPath $archive -CompressionLevel Optimal
    Write-Output "Release package created at $archive"
} finally { Pop-Location }
