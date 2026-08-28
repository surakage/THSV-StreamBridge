[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EvidenceRoot,
    [Parameter(Mandatory = $true)][string]$RunIdsCsv,
    [Parameter(Mandatory = $true)][string]$ExpectedHeadShasCsv
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath($EvidenceRoot)
$RunIds = @($RunIdsCsv -split ',' | ForEach-Object { [long]$_.Trim() })
$ExpectedHeadShas = @($ExpectedHeadShasCsv -split ',' | ForEach-Object { $_.Trim().ToLowerInvariant() })
if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw "Toolchain evidence root does not exist: $root" }
if ($RunIds.Count -ne 3 -or @($RunIds | Select-Object -Unique).Count -ne 3) { throw 'Exactly three unique scheduled canary run IDs are required.' }
if ($ExpectedHeadShas.Count -ne $RunIds.Count -or @($ExpectedHeadShas | Where-Object { $_ -notmatch '^[0-9a-f]{40}$' }).Count -ne 0) { throw 'Each canary run requires one valid expected head SHA in matching order.' }

$expectedVersions = @{ typescript = '7.0.2'; nodeTypes = '26.4.0' }
$expectedLanes = @('typescript-7', 'node-types-26', 'combined')
$validatedRuns = @()
for ($runIndex = 0; $runIndex -lt $RunIds.Count; $runIndex++) {
    $runId = $RunIds[$runIndex]
    $expectedHeadSha = $ExpectedHeadShas[$runIndex]
    $runRoot = Join-Path $root ([string]$runId)
    if (-not (Test-Path -LiteralPath $runRoot -PathType Container)) { throw "Downloaded evidence is missing for run $runId." }
    $documents = @(Get-ChildItem -LiteralPath $runRoot -Filter 'latest.json' -File -Recurse)
    if ($documents.Count -ne 3) { throw "Run $runId must contain exactly three lane evidence documents; found $($documents.Count)." }
    $lanes = @{}
    foreach ($document in $documents) {
        $evidence = Get-Content -Raw -LiteralPath $document.FullName | ConvertFrom-Json
        $lane = [string]$evidence.lane
        if ($lane -notin $expectedLanes -or $lanes.ContainsKey($lane)) { throw "Run $runId contains a missing, duplicate, or unknown lane: $lane." }
        $expectedTypecheck = if ($lane -eq 'node-types-26') { 'typecheck' } else { 'typecheck-ts7' }
        $checkNames = @($evidence.checks | ForEach-Object { [string]$_.name })
        $failedChecks = @($evidence.checks | Where-Object { $_.passed -ne $true })
        if ($evidence.schemaVersion -ne 3 -or [string]$evidence.sourceCommitSha -ne $expectedHeadSha -or $evidence.passed -ne $true -or $evidence.isolated -ne $true -or $evidence.productionManifestChanged -ne $false -or [string]$evidence.typescript -ne $expectedVersions.typescript -or [string]$evidence.nodeTypes -ne $expectedVersions.nodeTypes -or $failedChecks.Count -ne 0 -or $checkNames.Count -ne 4 -or $checkNames[0] -ne 'lint' -or $checkNames[1] -ne $expectedTypecheck -or $checkNames[2] -ne 'test:unit' -or $checkNames[3] -ne 'build') {
            throw "Run $runId lane $lane does not contain complete passing schema-v3 evidence bound to head SHA $expectedHeadSha."
        }
        $lanes[$lane] = [ordered]@{ checkedAt = [string]$evidence.checkedAt; checks = $checkNames }
    }
    foreach ($lane in $expectedLanes) { if (-not $lanes.ContainsKey($lane)) { throw "Run $runId is missing the $lane lane." } }
    $validatedRuns += [ordered]@{ runId = $runId; headSha = $expectedHeadSha; lanes = $lanes }
}

[pscustomobject]@{
    schemaVersion = 1
    verifiedAt = [DateTime]::UtcNow.ToString('o')
    expectedVersions = $expectedVersions
    runs = $validatedRuns
    passed = $true
}
