[CmdletBinding()]
param([string]$Destination = 'artifacts\release-validation\latest.json')

$ErrorActionPreference = 'Stop'
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$destinationPath = if ([System.IO.Path]::IsPathRooted($Destination)) { [System.IO.Path]::GetFullPath($Destination) } else { [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $Destination)) }

function Get-Sha256Hex([string]$Path) {
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        try { return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
        finally { $sha256.Dispose() }
    } finally { $stream.Dispose() }
}

function Invoke-QualityCommand([string]$Label, [scriptblock]$Command) {
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "$Label failed." }
}

Push-Location $repositoryRoot
try {
    $sourceCommit = (& git rev-parse HEAD).Trim()
    if ($sourceCommit -notmatch '^[0-9a-f]{40}$') { throw 'Release source validation requires an exact Git commit.' }
    if (@(& git status --porcelain --untracked-files=normal).Count -ne 0) { throw 'Release source validation requires a clean working tree with no untracked release inputs.' }

    Invoke-QualityCommand 'Clean' { npm.cmd run clean }
    Invoke-QualityCommand 'Streamer.bot import synchronization' { npm.cmd run imports:sync }
    Invoke-QualityCommand 'Build' { npm.cmd run build }
    Invoke-QualityCommand 'Lint' { npm.cmd run lint }
    Invoke-QualityCommand 'Type check' { npm.cmd run typecheck }
    Invoke-QualityCommand 'Tests' { npm.cmd test }
    Invoke-QualityCommand 'Configuration validation' { npm.cmd run config:validate }
    if (@(& git status --porcelain --untracked-files=normal).Count -ne 0) { throw 'Release validation changed source files. Commit the generated updates and validate again.' }

    $packagePath = Join-Path $repositoryRoot 'package.json'
    $lockPath = Join-Path $repositoryRoot 'package-lock.json'
    $packageVersion = [string](Get-Content -Raw -LiteralPath $packagePath | ConvertFrom-Json).version
    $nodeVersion = (& node --version).Trim(); $npmVersion = (& npm.cmd --version).Trim()
    $nodePlatform = (& node -p 'process.platform').Trim(); $nodeArchitecture = (& node -p 'process.arch').Trim()
    $receipt = [ordered]@{
        schemaVersion = 1
        product = 'THSV StreamBridge'
        sourceCommitSha = $sourceCommit
        packageVersion = $packageVersion
        packageJsonSha256 = Get-Sha256Hex $packagePath
        packageLockSha256 = Get-Sha256Hex $lockPath
        validatedAt = [DateTime]::UtcNow.ToString('o')
        toolchain = [ordered]@{ nodeVersion = $nodeVersion; npmVersion = $npmVersion; platform = $nodePlatform; architecture = $nodeArchitecture }
        checks = [ordered]@{ clean = $true; imports = $true; build = $true; lint = $true; typecheck = $true; tests = $true; configuration = $true }
    }
    [System.IO.Directory]::CreateDirectory((Split-Path -Parent $destinationPath)) | Out-Null
    [System.IO.File]::WriteAllText($destinationPath, "$($receipt | ConvertTo-Json -Depth 5)`n", [System.Text.UTF8Encoding]::new($false))
    Write-Output "Release source validation receipt created at $destinationPath"
} finally {
    Pop-Location
}
