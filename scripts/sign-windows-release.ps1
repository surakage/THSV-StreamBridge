[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$StagingRoot,
    [string]$CertificatePath = '',
    [string]$CertificatePassword = '',
    [string]$TimestampServer = 'http://timestamp.digicert.com',
    [switch]$RequireValidRuntime
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath($StagingRoot)
if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw "Release staging root does not exist: $root" }
$runtimePath = Join-Path $root 'runtime\node.exe'
if (-not (Test-Path -LiteralPath $runtimePath -PathType Leaf)) { throw 'The bundled Node.js runtime is missing.' }
$runtimeSignature = Get-AuthenticodeSignature -LiteralPath $runtimePath
if ($RequireValidRuntime -and $runtimeSignature.Status -ne 'Valid') { throw "Bundled Node.js Authenticode verification failed: $($runtimeSignature.Status) $($runtimeSignature.StatusMessage)" }

$scripts = @(Get-ChildItem -LiteralPath $root -Filter '*.ps1' -File -Recurse | Sort-Object FullName)
$signed = @()
if (-not [string]::IsNullOrWhiteSpace($CertificatePath)) {
    $resolvedCertificate = [System.IO.Path]::GetFullPath($CertificatePath)
    if (-not (Test-Path -LiteralPath $resolvedCertificate -PathType Leaf)) { throw "Signing certificate does not exist: $resolvedCertificate" }
    $certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($resolvedCertificate, $CertificatePassword, [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
    try {
        $codeSigningExtensions = @($certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' -and $_.Format($false) -match 'Code Signing' })
        if (-not $certificate.HasPrivateKey -or $codeSigningExtensions.Count -eq 0) { throw 'The supplied certificate is not a code-signing identity with a private key.' }
        foreach ($script in $scripts) {
            $signature = Set-AuthenticodeSignature -LiteralPath $script.FullName -Certificate $certificate -HashAlgorithm SHA256 -TimestampServer $TimestampServer
            if ($signature.Status -ne 'Valid') { throw "Authenticode signing failed for $($script.Name): $($signature.Status) $($signature.StatusMessage)" }
            $signed += $script.FullName.Substring($root.Length + 1).Replace([System.IO.Path]::DirectorySeparatorChar, '/')
        }
    } finally { $certificate.Dispose() }
}

$runtimeSigner = if ($null -eq $runtimeSignature.SignerCertificate) { $null } else { [ordered]@{ subject = $runtimeSignature.SignerCertificate.Subject; thumbprint = $runtimeSignature.SignerCertificate.Thumbprint } }
[pscustomobject]@{
    schemaVersion = 1
    runtime = [ordered]@{ path = 'runtime/node.exe'; status = [string]$runtimeSignature.Status; statusMessage = [string]$runtimeSignature.StatusMessage; signer = $runtimeSigner }
    firstParty = [ordered]@{ configured = -not [string]::IsNullOrWhiteSpace($CertificatePath); signedPowerShellCount = $signed.Count; signedPaths = $signed }
}
