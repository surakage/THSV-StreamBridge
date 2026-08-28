[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$StagingRoot,
    [string]$CertificatePath = '',
    [string]$CertificatePassword = '',
    [string]$TimestampServer = 'http://timestamp.digicert.com',
    [string[]]$AllowedCertificateThumbprints = @(),
    [ValidateRange(1, 3650)][int]$MinimumCertificateValidityDays = 30,
    [ValidateRange(1, 3650)][int]$CertificateExpiryWarningDays = 60,
    [switch]$RequireValidRuntime
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-signing-certificate-policy.ps1')
$root = [System.IO.Path]::GetFullPath($StagingRoot)
if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw "Release staging root does not exist: $root" }
$runtimePath = Join-Path $root 'runtime\node.exe'
if (-not (Test-Path -LiteralPath $runtimePath -PathType Leaf)) { throw 'The bundled Node.js runtime is missing.' }
$authenticodeAvailable = $false
try {
    Import-Module Microsoft.PowerShell.Security -ErrorAction Stop
    $authenticodeAvailable = $null -ne (Get-Command Get-AuthenticodeSignature -ErrorAction Stop)
} catch {
    if ($RequireValidRuntime -or -not [string]::IsNullOrWhiteSpace($CertificatePath)) { throw "Windows Authenticode support is required but unavailable: $($_.Exception.Message)" }
}
$runtimeSignature = if ($authenticodeAvailable) { Get-AuthenticodeSignature -LiteralPath $runtimePath } else { [pscustomobject]@{ Status = 'Unavailable'; StatusMessage = 'Microsoft.PowerShell.Security could not be loaded on this host.'; SignerCertificate = $null } }
if ($RequireValidRuntime -and $runtimeSignature.Status -ne 'Valid') { throw "Bundled Node.js Authenticode verification failed: $($runtimeSignature.Status) $($runtimeSignature.StatusMessage)" }

$scripts = @(Get-ChildItem -LiteralPath $root -Filter '*.ps1' -File -Recurse | Sort-Object FullName)
$signed = @()
$timestamped = @()
$firstPartySigner = $null
if (-not [string]::IsNullOrWhiteSpace($CertificatePath)) {
    $resolvedCertificate = [System.IO.Path]::GetFullPath($CertificatePath)
    if (-not (Test-Path -LiteralPath $resolvedCertificate -PathType Leaf)) { throw "Signing certificate does not exist: $resolvedCertificate" }
    $certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($resolvedCertificate, $CertificatePassword, [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
    try {
        $certificatePolicy = Test-THSVSigningCertificatePolicy -Certificate $certificate -AllowedCertificateThumbprints $AllowedCertificateThumbprints -MinimumCertificateValidityDays $MinimumCertificateValidityDays -CertificateExpiryWarningDays $CertificateExpiryWarningDays
        foreach ($script in $scripts) {
            $signature = Set-AuthenticodeSignature -LiteralPath $script.FullName -Certificate $certificate -HashAlgorithm SHA256 -TimestampServer $TimestampServer
            if ($signature.Status -ne 'Valid') { throw "Authenticode signing failed for $($script.Name): $($signature.Status) $($signature.StatusMessage)" }
            if ($null -eq $signature.TimeStamperCertificate) { throw "Authenticode signing did not retain trusted timestamp evidence for $($script.Name)." }
            $signed += $script.FullName.Substring($root.Length + 1).Replace([System.IO.Path]::DirectorySeparatorChar, '/')
            $timestamped += $script.FullName.Substring($root.Length + 1).Replace([System.IO.Path]::DirectorySeparatorChar, '/')
        }
        $firstPartySigner = $certificatePolicy
    } finally { $certificate.Dispose() }
}

$runtimeSigner = if ($null -eq $runtimeSignature.SignerCertificate) { $null } else { [ordered]@{ subject = $runtimeSignature.SignerCertificate.Subject; thumbprint = $runtimeSignature.SignerCertificate.Thumbprint } }
[pscustomobject]@{
    schemaVersion = 2
    runtime = [ordered]@{ path = 'runtime/node.exe'; status = [string]$runtimeSignature.Status; statusMessage = [string]$runtimeSignature.StatusMessage; inspectionAvailable = $authenticodeAvailable; signer = $runtimeSigner }
    firstParty = [ordered]@{ configured = -not [string]::IsNullOrWhiteSpace($CertificatePath); allowlistRequired = $true; minimumValidityDays = $MinimumCertificateValidityDays; expiryWarningDays = $CertificateExpiryWarningDays; signedPowerShellCount = $signed.Count; timestampedPowerShellCount = $timestamped.Count; signedPaths = $signed; timestampServer = $TimestampServer; signer = $firstPartySigner }
}
