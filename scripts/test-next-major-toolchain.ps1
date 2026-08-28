[CmdletBinding()]
param(
    [ValidateSet('typescript-7', 'node-types-26', 'combined')][string]$Lane = 'combined'
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$evidenceRoot = Join-Path $repo 'artifacts\toolchain-canary'
$npmCache = Join-Path $repo '.cache\npm-toolchain-canary'
New-Item -ItemType Directory -Path $evidenceRoot, $npmCache -Force | Out-Null
Push-Location $repo
try {
    $sourceCommitSha = if ($env:GITHUB_SHA -match '^[0-9a-f]{40}$') { $env:GITHUB_SHA } else { (git rev-parse HEAD).Trim() }
    if ($sourceCommitSha -notmatch '^[0-9a-f]{40}$') { throw 'Could not bind toolchain canary evidence to an exact source commit.' }
    $lockBefore = (Get-FileHash -LiteralPath 'package-lock.json' -Algorithm SHA256).Hash
    # TypeScript 7 runs side-by-side because typescript-eslint still requires the TypeScript 6 API.
    # Independent lanes attribute failures before the combined interaction gate runs.
    $trialPackages = @()
    if ($Lane -in @('typescript-7', 'combined')) { $trialPackages += 'typescript-next@npm:typescript@7.0.2' }
    if ($Lane -in @('node-types-26', 'combined')) { $trialPackages += '@types/node@26.4.0' }
    npm.cmd install --no-save --package-lock=false --legacy-peer-deps --cache $npmCache @trialPackages
    if ($LASTEXITCODE -ne 0) { throw 'Next-major toolchain installation failed.' }
    $resolved = node -e "const lane=process.argv[1]; console.log(JSON.stringify({typescript:lane==='node-types-26'?require('typescript/package.json').version:require('typescript-next/package.json').version,nodeTypes:require('@types/node/package.json').version}))" $Lane | ConvertFrom-Json
    $checks = @()
    $typecheck = if ($Lane -eq 'node-types-26') { 'typecheck' } else { 'typecheck-ts7' }
    foreach ($name in @('lint', $typecheck, 'test:unit', 'build')) {
        if ($name -eq 'typecheck-ts7') { node node_modules/typescript-next/lib/tsc.js --noEmit }
        else { npm.cmd run $name }
        $checks += [ordered]@{ name = $name; passed = $LASTEXITCODE -eq 0 }
        if ($LASTEXITCODE -ne 0) { break }
    }
    $lockUnchanged = (Get-FileHash -LiteralPath 'package-lock.json' -Algorithm SHA256).Hash -eq $lockBefore
    $passed = $lockUnchanged -and @($checks | Where-Object { -not $_.passed }).Count -eq 0 -and $checks.Count -eq 4
    $result = [ordered]@{ schemaVersion = 3; checkedAt = (Get-Date).ToUniversalTime().ToString('o'); sourceCommitSha = $sourceCommitSha; lane = $Lane; isolated = $true; productionManifestChanged = -not $lockUnchanged; typescript = [string]$resolved.typescript; nodeTypes = [string]$resolved.nodeTypes; checks = $checks; passed = $passed }
    [System.IO.File]::WriteAllText((Join-Path $evidenceRoot 'latest.json'), ($result | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))
    if (-not $passed) { throw "$Lane compatibility canary failed. Production dependencies remain unchanged." }
    $result
} finally {
    npm.cmd ci --ignore-scripts --cache $npmCache | Out-Null
    Pop-Location
}
