[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Push-Location $repo
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
    npm run config:validate
    if ($LASTEXITCODE -ne 0) { throw 'Configuration validation failed.' }
} finally { Pop-Location }
