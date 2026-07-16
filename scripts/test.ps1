[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Push-Location $repo
try {
    npm run lint
    if ($LASTEXITCODE -ne 0) { throw 'Lint failed.' }
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw 'Type check failed.' }
    npm test
    if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
} finally { Pop-Location }
