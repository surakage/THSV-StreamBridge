[CmdletBinding()]
param(
    [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'THSV StreamBridge'),
    [string]$SourceRoot = (Split-Path -Parent $PSScriptRoot),
    [switch]$SkipDependencyInstall,
    [switch]$AllowDowngrade,
    [switch]$StartBridge
)

$ErrorActionPreference = 'Stop'

function Resolve-SafeRoot([string]$Path, [string]$Label) {
    $resolved = [System.IO.Path]::GetFullPath($Path).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
    $driveRoot = [System.IO.Path]::GetPathRoot($resolved).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
    if ([string]::IsNullOrWhiteSpace($resolved) -or $resolved -eq $driveRoot -or $resolved.Length -lt 10) {
        throw "Unsafe $Label path: $resolved"
    }
    return $resolved
}

function Resolve-ManifestPath([string]$Root, [string]$RelativePath) {
    if ([string]::IsNullOrWhiteSpace($RelativePath) -or [System.IO.Path]::IsPathRooted($RelativePath) -or $RelativePath -match '(^|[\\/])\.\.([\\/]|$)') {
        throw "Unsafe release manifest path: $RelativePath"
    }
    $normalized = $RelativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
    $candidate = [System.IO.Path]::GetFullPath((Join-Path $Root $normalized))
    $prefix = $Root.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    if (-not $candidate.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Release manifest path leaves its root: $RelativePath"
    }
    return $candidate
}

function Remove-SafeTree([string]$Path, [string]$ParentRoot) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $resolved = [System.IO.Path]::GetFullPath($Path)
    $parent = [System.IO.Path]::GetFullPath($ParentRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
    $prefix = $parent + [System.IO.Path]::DirectorySeparatorChar
    if (-not $resolved.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove a path outside the installation parent: $resolved"
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}

function Protect-PrivateStage([string]$Path) {
    $security = New-Object System.Security.AccessControl.DirectorySecurity
    $security.SetAccessRuleProtection($true, $false)
    $inheritance = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
    $propagation = [System.Security.AccessControl.PropagationFlags]::None
    $allow = [System.Security.AccessControl.AccessControlType]::Allow
    $fullControl = [System.Security.AccessControl.FileSystemRights]::FullControl
    $identities = @(
        [System.Security.Principal.WindowsIdentity]::GetCurrent().User,
        (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')),
        (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544'))
    )
    foreach ($identity in $identities) {
        $security.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($identity, $fullControl, $inheritance, $propagation, $allow)))
    }
    Set-Acl -LiteralPath $Path -AclObject $security
}

function Assert-ManifestFiles([string]$Root, $Manifest) {
    foreach ($file in $Manifest.files) {
        $candidate = Resolve-ManifestPath $Root ([string]$file.path)
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "Release file is missing: $($file.path)" }
        if ((Get-Item -LiteralPath $candidate).Length -ne [long]$file.size) { throw "Release file size mismatch: $($file.path)" }
        $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $candidate).Hash.ToLowerInvariant()
        if ($actualHash -ne ([string]$file.sha256).ToLowerInvariant()) { throw "Release file hash mismatch: $($file.path)" }
    }
}

function Convert-SemVer([string]$Value) {
    $match = [regex]::Match($Value, '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$')
    if (-not $match.Success) { throw "Release version is not valid SemVer: $Value" }
    return [pscustomobject]@{
        Major = [long]$match.Groups[1].Value
        Minor = [long]$match.Groups[2].Value
        Patch = [long]$match.Groups[3].Value
        Prerelease = $match.Groups[4].Value
    }
}

function Compare-SemVer([string]$Left, [string]$Right) {
    $leftVersion = Convert-SemVer $Left
    $rightVersion = Convert-SemVer $Right
    foreach ($part in @('Major', 'Minor', 'Patch')) {
        if ($leftVersion.$part -lt $rightVersion.$part) { return -1 }
        if ($leftVersion.$part -gt $rightVersion.$part) { return 1 }
    }
    if ($leftVersion.Prerelease -eq $rightVersion.Prerelease) { return 0 }
    if ([string]::IsNullOrEmpty($leftVersion.Prerelease)) { return 1 }
    if ([string]::IsNullOrEmpty($rightVersion.Prerelease)) { return -1 }
    $leftParts = $leftVersion.Prerelease.Split('.')
    $rightParts = $rightVersion.Prerelease.Split('.')
    $count = [Math]::Max($leftParts.Count, $rightParts.Count)
    for ($index = 0; $index -lt $count; $index++) {
        if ($index -ge $leftParts.Count) { return -1 }
        if ($index -ge $rightParts.Count) { return 1 }
        $leftNumeric = $leftParts[$index] -match '^\d+$'
        $rightNumeric = $rightParts[$index] -match '^\d+$'
        if ($leftNumeric -and $rightNumeric) {
            $leftNumber = [long]$leftParts[$index]
            $rightNumber = [long]$rightParts[$index]
            if ($leftNumber -lt $rightNumber) { return -1 }
            if ($leftNumber -gt $rightNumber) { return 1 }
        } elseif ($leftNumeric) { return -1 }
        elseif ($rightNumeric) { return 1 }
        else {
            $comparison = [string]::CompareOrdinal($leftParts[$index], $rightParts[$index])
            if ($comparison -lt 0) { return -1 }
            if ($comparison -gt 0) { return 1 }
        }
    }
    return 0
}

$source = Resolve-SafeRoot $SourceRoot 'source'
$destination = Resolve-SafeRoot $InstallRoot 'installation'
if ($source -eq $destination) { throw 'Install from an extracted release directory into a different installation directory.' }

$manifestPath = Join-Path $source 'release-manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "release-manifest.json is missing. Use an official THSV StreamBridge release archive: $source"
}
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if ($manifest.product -ne 'THSV StreamBridge' -or [string]::IsNullOrWhiteSpace($manifest.version) -or $null -eq $manifest.files) {
    throw 'The release manifest is invalid or belongs to another product.'
}

$existingRecordPath = Join-Path $destination 'data\runtime\install-manifest.json'
if (Test-Path -LiteralPath $existingRecordPath -PathType Leaf) {
    $existingRecord = Get-Content -Raw -LiteralPath $existingRecordPath | ConvertFrom-Json
    if ($existingRecord.product -ne 'THSV StreamBridge' -or [string]::IsNullOrWhiteSpace($existingRecord.version)) {
        throw "The existing installation record is invalid: $existingRecordPath"
    }
    if ((Compare-SemVer ([string]$manifest.version) ([string]$existingRecord.version)) -lt 0 -and -not $AllowDowngrade) {
        throw "Refusing to downgrade THSV StreamBridge from $($existingRecord.version) to $($manifest.version). Older code may not understand newer state. Back up the installation and pass -AllowDowngrade only when this is intentional."
    }
}

Assert-ManifestFiles $source $manifest

$parent = Split-Path -Parent $destination
New-Item -ItemType Directory -Path $parent -Force | Out-Null
$stage = Join-Path $parent ('.thsv-streambridge-install-' + [guid]::NewGuid().ToString('N'))
$rollback = Join-Path $parent ('.thsv-streambridge-rollback-' + [guid]::NewGuid().ToString('N'))
$destinationMoved = $false

try {
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    Protect-PrivateStage $stage
    foreach ($file in $manifest.files) {
        $sourceFile = Resolve-ManifestPath $source ([string]$file.path)
        $stageFile = Resolve-ManifestPath $stage ([string]$file.path)
        New-Item -ItemType Directory -Path (Split-Path -Parent $stageFile) -Force | Out-Null
        Copy-Item -LiteralPath $sourceFile -Destination $stageFile -Force
    }
    Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $stage 'release-manifest.json') -Force
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $manifestPath).Hash -ne (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $stage 'release-manifest.json')).Hash) {
        throw 'Release manifest changed while it was copied into private staging.'
    }
    # Trust only the creator-private copy from this point forward. This closes the
    # verification-to-copy window for archives extracted into a shared directory.
    Assert-ManifestFiles $stage $manifest
    @('data\runtime', 'data\state', 'data\logs', 'data\backups') | ForEach-Object {
        New-Item -ItemType Directory -Path (Join-Path $stage $_) -Force | Out-Null
    }

    if (-not $SkipDependencyInstall) {
        $nodeVersion = (& node --version 2>$null)
        if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(2[2-9]|[3-9][0-9])\.') { throw 'Node.js 22 or later is required.' }
        Push-Location $stage
        try {
            & npm.cmd ci --omit=dev --ignore-scripts
            if ($LASTEXITCODE -ne 0) { throw 'Production dependency installation failed.' }
        } finally { Pop-Location }
    }

    if (Test-Path -LiteralPath $destination) {
        $pidFile = Join-Path $destination 'data\runtime\streambridge.pid'
        $stopScript = Join-Path $destination 'scripts\stop.ps1'
        if ((Test-Path -LiteralPath $pidFile) -and (Test-Path -LiteralPath $stopScript)) { & $stopScript }
        $backupScript = Join-Path $destination 'scripts\backup.ps1'
        if (Test-Path -LiteralPath $backupScript) { & $backupScript | Write-Output }
        $existingData = Join-Path $destination 'data'
        if (Test-Path -LiteralPath $existingData) { Copy-Item -LiteralPath $existingData -Destination $stage -Recurse -Force }
        Move-Item -LiteralPath $destination -Destination $rollback
        $destinationMoved = $true
    }

    if (-not (Test-Path -LiteralPath (Join-Path $stage 'data\runtime\bridge.local.json'))) {
        Copy-Item -LiteralPath (Join-Path $stage 'config\bridge.example.json') -Destination (Join-Path $stage 'data\runtime\bridge.local.json')
    }
    $installRecord = [ordered]@{
        product = 'THSV StreamBridge'
        version = [string]$manifest.version
        installedAt = (Get-Date).ToUniversalTime().ToString('o')
        installRoot = $destination
        releaseFiles = @($manifest.files | ForEach-Object { [string]$_.path }) + @('release-manifest.json')
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Join-Path $stage 'data\runtime\install-manifest.json'), ($installRecord | ConvertTo-Json -Depth 4), $utf8NoBom)

    Move-Item -LiteralPath $stage -Destination $destination
    if ($destinationMoved) { Remove-SafeTree $rollback $parent }
} catch {
    if (Test-Path -LiteralPath $stage) { Remove-SafeTree $stage $parent }
    if ($destinationMoved -and (Test-Path -LiteralPath $rollback)) {
        if (Test-Path -LiteralPath $destination) { Remove-SafeTree $destination $parent }
        Move-Item -LiteralPath $rollback -Destination $destination
    }
    throw
}

if ($StartBridge) { & (Join-Path $destination 'scripts\start.ps1') -Config 'data/runtime/bridge.local.json' }
Write-Output "THSV StreamBridge $($manifest.version) installed at $destination"
Write-Output "Local configuration: $(Join-Path $destination 'data\runtime\bridge.local.json')"
