[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$CertificatePath,
    [string]$CertificatePassword = '',
    [Parameter(Mandatory = $true)][string[]]$AllowedCertificateThumbprints,
    [ValidateRange(1, 3650)][int]$MinimumCertificateValidityDays = 30,
    [ValidateRange(1, 3650)][int]$CertificateExpiryWarningDays = 60,
    [string]$EvidencePath = ''
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-signing-certificate-policy.ps1')
$resolvedCertificate = [System.IO.Path]::GetFullPath($CertificatePath)
if (-not (Test-Path -LiteralPath $resolvedCertificate -PathType Leaf)) { throw "Signing certificate does not exist: $resolvedCertificate" }
$certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($resolvedCertificate, $CertificatePassword, [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
try {
    $policy = Test-THSVSigningCertificatePolicy -Certificate $certificate -AllowedCertificateThumbprints $AllowedCertificateThumbprints -MinimumCertificateValidityDays $MinimumCertificateValidityDays -CertificateExpiryWarningDays $CertificateExpiryWarningDays
    $evidence = [pscustomobject][ordered]@{ schemaVersion = 1; checkedAt = [DateTime]::UtcNow.ToString('o'); certificate = $policy; passed = $true }
    if (-not [string]::IsNullOrWhiteSpace($EvidencePath)) {
        $resolvedEvidence = [System.IO.Path]::GetFullPath($EvidencePath)
        New-Item -ItemType Directory -Force (Split-Path -Parent $resolvedEvidence) | Out-Null
        [System.IO.File]::WriteAllText($resolvedEvidence, ($evidence | ConvertTo-Json -Depth 6), [System.Text.UTF8Encoding]::new($false))
    }
    $evidence
} finally { $certificate.Dispose() }
