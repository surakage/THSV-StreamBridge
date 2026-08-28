[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$ArchivePath)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'The installer ACL acceptance test requires Windows.' }
$archive = (Resolve-Path -LiteralPath $ArchivePath).Path
$temporaryBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$testRoot = Join-Path $temporaryBase "thsv-installer-acl-$([guid]::NewGuid().ToString('N'))"
$resolvedTestRoot = [System.IO.Path]::GetFullPath($testRoot)
if (-not $resolvedTestRoot.StartsWith($temporaryBase, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe ACL acceptance root.' }

function Assert-PrivateAcl([string]$Path) {
  $acl = Get-Acl -LiteralPath $Path
  if (-not $acl.AreAccessRulesProtected) { throw "ACL inheritance is still enabled for $Path" }
  $allowedSids = @(
    [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value,
    'S-1-5-18',
    'S-1-5-32-544'
  )
  $allowRules = @($acl.Access | Where-Object { $_.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow })
  foreach ($sid in $allowedSids) {
    $matching = @($allowRules | Where-Object { try { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -eq $sid } catch { $false } })
    if ($matching.Count -eq 0 -or -not ($matching | Where-Object { ($_.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -ne 0 })) { throw "Required full-control ACL for $sid is missing on $Path" }
  }
  $unexpected = @($allowRules | Where-Object { try { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -notin $allowedSids } catch { $true } })
  if ($unexpected.Count -gt 0) { throw "Unexpected allow ACLs remain on $Path`: $($unexpected.IdentityReference -join ', ')" }
}

try {
  New-Item -ItemType Directory -Path $resolvedTestRoot | Out-Null
  $sourceRoot = Join-Path $resolvedTestRoot 'source'; Expand-Archive -LiteralPath $archive -DestinationPath $sourceRoot
  if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot 'release-manifest.json'))) {
    $roots = @(Get-ChildItem -LiteralPath $sourceRoot -Directory)
    if ($roots.Count -ne 1) { throw 'Release archive did not contain one usable root.' }
    $sourceRoot = $roots[0].FullName
  }
  $installRoot = Join-Path $resolvedTestRoot 'installed'
  & (Join-Path $sourceRoot 'runtime\node.exe') (Join-Path $sourceRoot 'installer\install.mjs') --install-root $installRoot --no-start --no-open-wizard --no-tray
  if ($LASTEXITCODE -ne 0) { throw 'Release installer failed during real ACL acceptance.' }
  Assert-PrivateAcl (Join-Path $installRoot 'data\secrets')
  Assert-PrivateAcl (Join-Path $installRoot 'THSV StreamBridge Recovery Key.txt')
  [pscustomobject]@{ accepted = $true; inheritanceRemoved = $true; principals = @('current-user', 'SYSTEM', 'Administrators') } | ConvertTo-Json -Compress
} finally {
  if (Test-Path -LiteralPath $resolvedTestRoot) { Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force }
}
