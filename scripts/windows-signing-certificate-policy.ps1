function Test-THSVSigningCertificatePolicy {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][System.Security.Cryptography.X509Certificates.X509Certificate2]$Certificate,
        [Parameter(Mandatory = $true)][string[]]$AllowedCertificateThumbprints,
        [ValidateRange(1, 3650)][int]$MinimumCertificateValidityDays = 30,
        [ValidateRange(1, 3650)][int]$CertificateExpiryWarningDays = 60
    )

    $approvedThumbprints = @($AllowedCertificateThumbprints | ForEach-Object { ([string]$_ -replace '[^0-9A-Fa-f]', '').ToUpperInvariant() } | Where-Object { $_ })
    if ($approvedThumbprints.Count -eq 0) { throw 'First-party signing is blocked until the creator configures at least one approved certificate thumbprint.' }
    $certificateThumbprint = ([string]$Certificate.Thumbprint -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()
    if ($certificateThumbprint -notin $approvedThumbprints) { throw "The supplied signing certificate thumbprint $certificateThumbprint is not in the creator-approved allowlist." }
    if (-not $Certificate.HasPrivateKey) { throw 'The supplied certificate does not contain a private key.' }
    $codeSigningOid = '1.3.6.1.5.5.7.3.3'
    $enhancedKeyUsage = @($Certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' })
    $codeSigningAllowed = @($enhancedKeyUsage | Where-Object { @($_.EnhancedKeyUsages | Where-Object { $_.Value -eq $codeSigningOid }).Count -gt 0 }).Count -gt 0
    if (-not $codeSigningAllowed) { throw 'The supplied certificate is not authorized for code signing.' }
    $daysRemaining = [math]::Floor(($Certificate.NotAfter.ToUniversalTime() - [DateTime]::UtcNow).TotalDays)
    if ($daysRemaining -lt $MinimumCertificateValidityDays) { throw "The approved signing certificate expires too soon ($daysRemaining day(s) remaining; minimum is $MinimumCertificateValidityDays)." }
    $expiryState = if ($daysRemaining -lt $CertificateExpiryWarningDays) { 'warning' } else { 'current' }
    if ($expiryState -eq 'warning') { Write-Warning "The approved signing certificate expires in $daysRemaining day(s). Renew and update the allowlist before the next release." }
    [pscustomobject][ordered]@{
        subject = $Certificate.Subject
        thumbprint = $certificateThumbprint
        notBefore = $Certificate.NotBefore.ToUniversalTime().ToString('o')
        notAfter = $Certificate.NotAfter.ToUniversalTime().ToString('o')
        daysRemaining = $daysRemaining
        expiryState = $expiryState
        creatorApproved = $true
        codeSigningEku = $true
    }
}
