[CmdletBinding()]
param([string]$Config = 'config/bridge.example.json')
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Push-Location $repo
try {
    npm run config:validate -- $Config
    if ($LASTEXITCODE -ne 0) { throw 'Configuration validation failed.' }
} finally { Pop-Location }
