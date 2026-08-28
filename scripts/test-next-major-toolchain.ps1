[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$evidenceRoot = Join-Path $repo 'artifacts\toolchain-canary'
$npmCache = Join-Path $repo '.cache\npm-toolchain-canary'
New-Item -ItemType Directory -Path $evidenceRoot, $npmCache -Force | Out-Null
Push-Location $repo
try {
    $lockBefore = (Get-FileHash -LiteralPath 'package-lock.json' -Algorithm SHA256).Hash
    # TypeScript 7 runs side-by-side because typescript-eslint still requires the TypeScript 6 API.
    # The alias keeps lint operational while the actual source typecheck uses the next compiler.
    npm.cmd install --no-save --package-lock=false --legacy-peer-deps --cache $npmCache 'typescript-next@npm:typescript@7.0.2' '@types/node@26.4.0'
    if ($LASTEXITCODE -ne 0) { throw 'Next-major toolchain installation failed.' }
    $resolved = node -e "console.log(JSON.stringify({typescript:require('typescript-next/package.json').version,nodeTypes:require('@types/node/package.json').version}))" | ConvertFrom-Json
    $checks = @()
    foreach ($name in @('lint', 'typecheck-ts7', 'test:unit', 'build')) {
        if ($name -eq 'typecheck-ts7') { node node_modules/typescript-next/lib/tsc.js --noEmit }
        else { npm.cmd run $name }
        $checks += [ordered]@{ name = $name; passed = $LASTEXITCODE -eq 0 }
        if ($LASTEXITCODE -ne 0) { break }
    }
    $lockUnchanged = (Get-FileHash -LiteralPath 'package-lock.json' -Algorithm SHA256).Hash -eq $lockBefore
    $passed = $lockUnchanged -and @($checks | Where-Object { -not $_.passed }).Count -eq 0 -and $checks.Count -eq 4
    $result = [ordered]@{ schemaVersion = 1; checkedAt = (Get-Date).ToUniversalTime().ToString('o'); isolated = $true; productionManifestChanged = -not $lockUnchanged; typescript = [string]$resolved.typescript; nodeTypes = [string]$resolved.nodeTypes; checks = $checks; passed = $passed }
    [System.IO.File]::WriteAllText((Join-Path $evidenceRoot 'latest.json'), ($result | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))
    if (-not $passed) { throw 'TypeScript 7 / Node 26 compatibility canary failed. Production dependencies remain unchanged.' }
    $result
} finally {
    npm.cmd ci --ignore-scripts --cache $npmCache | Out-Null
    Pop-Location
}
