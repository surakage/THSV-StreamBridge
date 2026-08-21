param(
    [Parameter(Mandatory = $true)][string]$Tag,
    [Parameter(Mandatory = $true)][string]$CommitSha,
    [Parameter(Mandatory = $true)][string]$Repository,
    [string]$PackagesDirectory = 'packages',
    [Parameter(Mandatory = $true)][string]$SbomPath,
    [string]$LifecycleEvidencePath = 'artifacts\release-lifecycle\latest.json',
    [string]$StartupEvidencePath = 'artifacts\startup-chaos\latest.json',
    [string]$Destination = ''
)

$ErrorActionPreference = 'Stop'
if ($Tag -notmatch '^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$') { throw "Invalid release tag: $Tag" }
if ($CommitSha -notmatch '^[0-9a-f]{40}$') { throw 'CommitSha must contain 40 lowercase hexadecimal characters.' }
if ($Repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { throw "Invalid repository: $Repository" }
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
function Resolve-EvidencePath([string]$PathValue) { if ([System.IO.Path]::IsPathRooted($PathValue)) { return [System.IO.Path]::GetFullPath($PathValue) }; return [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $PathValue)) }
function Get-Sha256([string]$PathValue) {
    $stream = [System.IO.File]::OpenRead($PathValue)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try { return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $sha256.Dispose(); $stream.Dispose() }
}
$packagesPath = Resolve-EvidencePath $PackagesDirectory
$sbomFullPath = Resolve-EvidencePath $SbomPath
$lifecycleFullPath = Resolve-EvidencePath $LifecycleEvidencePath
$startupFullPath = Resolve-EvidencePath $StartupEvidencePath
$destinationPath = if ([string]::IsNullOrWhiteSpace($Destination)) { $repositoryRoot } else { Resolve-EvidencePath $Destination }
foreach ($requiredPath in @($packagesPath, $sbomFullPath, $lifecycleFullPath, $startupFullPath)) { if (-not (Test-Path -LiteralPath $requiredPath)) { throw "Required release evidence input is missing: $requiredPath" } }
[System.IO.Directory]::CreateDirectory($destinationPath) | Out-Null
$version = $Tag.TrimStart('v')
$assetFiles = @(
    Get-ChildItem -LiteralPath $packagesPath -File | Where-Object {
        $_.Name -eq "THSV-StreamBridge-$version.zip" -or
        $_.Name -eq "THSV-StreamBridge-$version.zip.sha256" -or
        $_.Name -like 'THSV-StreamBridge-AddOn-*.zip' -or
        $_.Name -like 'THSV-StreamBridge-AddOn-*.zip.sha256' -or
        $_.Name -eq 'THSV-StreamBridge-AddOns-index.json' -or
        $_.Name -eq 'THSV-StreamBridge-AddOns-index.json.sha256'
    }
)
$assetFiles += Get-Item -LiteralPath $sbomFullPath
$names = @($assetFiles | ForEach-Object Name)
if ($names -notcontains "THSV-StreamBridge-$version.zip" -or $names -notcontains "THSV-StreamBridge-$version.zip.sha256" -or $names -notcontains 'THSV-StreamBridge-AddOns-index.json' -or $names -notcontains 'THSV-StreamBridge-AddOns-index.json.sha256') { throw 'Core release evidence assets are incomplete.' }
if (@($assetFiles | Where-Object Name -Like 'THSV-StreamBridge-AddOn-*.zip').Count -eq 0) { throw 'No optional add-on release assets were found.' }
$assets = @($assetFiles | Sort-Object Name | ForEach-Object { [ordered]@{ name = $_.Name; size = $_.Length; sha256 = Get-Sha256 $_.FullName } })
$lifecycle = Get-Content -Raw -LiteralPath $lifecycleFullPath | ConvertFrom-Json
$startup = Get-Content -Raw -LiteralPath $startupFullPath | ConvertFrom-Json
if ($lifecycle.currentTag -ne $Tag -or $lifecycle.creatorDataPreserved -ne $true) { throw 'Lifecycle evidence does not match the release tag or creator-data requirement.' }
if ($startup.passed -ne $true -or $startup.isolated -ne $true -or @($startup.scenarios).Count -eq 0) { throw 'Startup-chaos evidence is not an isolated successful acceptance run.' }
$manifest = [ordered]@{
    schemaVersion = 1
    product = 'THSV StreamBridge'
    tag = $Tag
    version = $version
    repository = $Repository
    commitSha = $CommitSha
    workflowRunId = [string]$env:GITHUB_RUN_ID
    workflowRunAttempt = [string]$env:GITHUB_RUN_ATTEMPT
    generatedAt = [DateTime]::UtcNow.ToString('o')
    lifecycle = $lifecycle
    startupChaos = $startup
    assets = $assets
}
$manifestName = "THSV-StreamBridge-$Tag.release-evidence.json"
$manifestPath = Join-Path $destinationPath $manifestName
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($manifestPath, "$($manifest | ConvertTo-Json -Depth 20)`n", $utf8NoBom)
$manifestHash = Get-Sha256 $manifestPath
$checksumPath = "$manifestPath.sha256"
[System.IO.File]::WriteAllText($checksumPath, "$manifestHash  $manifestName`n", $utf8NoBom)
[pscustomobject]@{ manifestPath = $manifestPath; checksumPath = $checksumPath; assetCount = $assets.Count; sha256 = $manifestHash }
