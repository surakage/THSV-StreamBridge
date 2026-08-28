[CmdletBinding()]
param(
    [switch]$Offline,
    [string[]]$ActionlintArguments = @('-color')
)

$ErrorActionPreference = 'Stop'
$version = '1.7.12'
$archiveName = "actionlint_${version}_windows_amd64.zip"
$expectedArchiveSha256 = '6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9'
$repo = Split-Path -Parent $PSScriptRoot
$cacheRoot = [System.IO.Path]::GetFullPath((Join-Path $repo ".cache\actionlint\$version"))
$archivePath = Join-Path $cacheRoot $archiveName
$downloadUrl = "https://github.com/rhysd/actionlint/releases/download/v$version/$archiveName"
New-Item -ItemType Directory -Force $cacheRoot | Out-Null

function Get-Sha256Hex([string]$Path) {
    $stream = [System.IO.File]::OpenRead($Path)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return ([System.BitConverter]::ToString($sha.ComputeHash($stream)) -replace '-', '').ToLowerInvariant() }
    finally { $sha.Dispose(); $stream.Dispose() }
}

function Test-CachedArchive {
    if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) { return $false }
    return (Get-Sha256Hex $archivePath) -eq $expectedArchiveSha256
}

if (-not (Test-CachedArchive)) {
    if ($Offline) { throw "The verified actionlint $version archive is not cached. Run once online, then retry with -Offline." }
    $temporaryArchive = Join-Path $cacheRoot "$archiveName.download-$([Guid]::NewGuid().ToString('N'))"
    try {
        try {
            Invoke-WebRequest -Uri $downloadUrl -OutFile $temporaryArchive -UseBasicParsing
        } catch {
            if ($null -ne (Get-Command node -ErrorAction SilentlyContinue)) {
                & node (Join-Path $PSScriptRoot 'download-tool-archive.mjs') $downloadUrl $temporaryArchive
            }
            if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $temporaryArchive -PathType Leaf)) {
                if ($null -eq (Get-Command gh -ErrorAction SilentlyContinue)) { throw "HTTPS and Node actionlint downloads failed: $($_.Exception.Message)" }
                & gh release download "v$version" --repo rhysd/actionlint --pattern $archiveName --output $temporaryArchive
                if ($LASTEXITCODE -ne 0) { throw "HTTPS, Node, and GitHub CLI actionlint downloads all failed: $($_.Exception.Message)" }
            }
        }
        $actual = Get-Sha256Hex $temporaryArchive
        if ($actual -ne $expectedArchiveSha256) { throw "Downloaded actionlint archive checksum mismatch. Expected $expectedArchiveSha256; received $actual." }
        Move-Item -LiteralPath $temporaryArchive -Destination $archivePath -Force
    } finally {
        if (Test-Path -LiteralPath $temporaryArchive) { Remove-Item -LiteralPath $temporaryArchive -Force }
    }
}

$runtimeRoot = Join-Path $cacheRoot "runtime-$([Guid]::NewGuid().ToString('N'))"
try {
    New-Item -ItemType Directory -Force $runtimeRoot | Out-Null
    Expand-Archive -LiteralPath $archivePath -DestinationPath $runtimeRoot
    $executable = Join-Path $runtimeRoot 'actionlint.exe'
    if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw 'The verified actionlint archive did not contain actionlint.exe.' }
    $reportedVersion = (& $executable -version | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $reportedVersion -notmatch [regex]::Escape($version)) { throw "The extracted actionlint executable did not report version $version." }
    & $executable @ActionlintArguments
    if ($LASTEXITCODE -ne 0) { throw "actionlint reported workflow errors (exit code $LASTEXITCODE)." }
} finally {
    if (Test-Path -LiteralPath $runtimeRoot) { Remove-Item -LiteralPath $runtimeRoot -Recurse -Force }
}
