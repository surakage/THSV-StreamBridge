param(
    [string]$CurrentTag = '',
    [string]$PreviousTag = '',
    [switch]$AllowPublishedCurrentVersion,
    [switch]$SkipPackaging
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Push-Location $repositoryRoot
try {
    $packageVersion = [string](Get-Content -Raw -LiteralPath (Join-Path $repositoryRoot 'package.json') | ConvertFrom-Json).version
    $expectedTag = "v$packageVersion"
    if ([string]::IsNullOrWhiteSpace($CurrentTag)) { $CurrentTag = $expectedTag }
    if ($CurrentTag -ne $expectedTag) { throw "Candidate tag $CurrentTag does not match package.json version $packageVersion. Expected $expectedTag." }
    if (-not $SkipPackaging) {
        $validationReceipt = Join-Path $repositoryRoot 'artifacts\release-validation\latest.json'
        & (Join-Path $PSScriptRoot 'test-release-source.ps1') -Destination $validationReceipt
        if ($LASTEXITCODE -ne 0) { throw 'Release source validation failed.' }
        & (Join-Path $PSScriptRoot 'package-release.ps1') -ValidationReceiptPath $validationReceipt
        if ($LASTEXITCODE -ne 0) { throw 'Release packaging failed.' }
    }

    $previous = & (Join-Path $PSScriptRoot 'resolve-previous-release.ps1') -CurrentTag $CurrentTag -PreviousTag $PreviousTag -AllowExistingCurrentRelease:$AllowPublishedCurrentVersion
    $archive = Get-ChildItem (Join-Path $repositoryRoot 'packages\THSV-StreamBridge-*.zip') | Where-Object { $_.Name -notlike 'THSV-StreamBridge-AddOn-*' } | Select-Object -First 1
    if ($null -eq $archive) { throw 'Release archive was not produced.' }
    $installationRehearsalOutput = & (Join-Path $repositoryRoot 'scripts\test-local-installation-rehearsal.ps1') -Archive $archive.FullName
    if ($LASTEXITCODE -ne 0) { throw 'Isolated installed-Wizard activation rehearsal failed.' }
    $installationRehearsal = $installationRehearsalOutput | Select-Object -Last 1 | ConvertFrom-Json
    $lifecycleOutput = & (Join-Path $repositoryRoot 'tests\windows\release-archive.tests.ps1') -CurrentArchive $archive.FullName -PreviousArchive $previous.archive
    if ($LASTEXITCODE -ne 0) { throw 'Release install, repair, or upgrade smoke testing failed.' }
    $lifecycle = $lifecycleOutput | Select-Object -Last 1 | ConvertFrom-Json
    $recoveryOutput = & (Join-Path $repositoryRoot 'tests\windows\recovery-bundle.tests.ps1') -CurrentArchive $archive.FullName
    if ($LASTEXITCODE -ne 0) { throw 'Encrypted recovery bundle export and restore testing failed.' }
    $recovery = $recoveryOutput | Select-Object -Last 1 | ConvertFrom-Json
    $triggerRecoveryOutput = & (Join-Path $repositoryRoot 'tests\windows\streamerbot-trigger-recovery.tests.ps1') -CurrentArchive $archive.FullName
    if ($LASTEXITCODE -ne 0) { throw 'Packaged Streamer.bot trigger recovery lifecycle failed.' }
    $triggerRecovery = $triggerRecoveryOutput | Select-Object -Last 1 | ConvertFrom-Json
    $evidenceDirectory = Join-Path $repositoryRoot 'artifacts\release-lifecycle'
    [System.IO.Directory]::CreateDirectory($evidenceDirectory) | Out-Null
    $evidencePath = Join-Path $evidenceDirectory 'latest.json'
    $evidence = [ordered]@{
        currentTag = $CurrentTag
        previousTag = $previous.previousTag
        previousChecksumVerified = $previous.checksumVerified
        previousProvenanceVerified = $previous.provenanceVerified
        cleanInstall = $lifecycle.cleanInstall
        repair = $lifecycle.repair
        upgradedFrom = $lifecycle.upgradedFrom
        upgradedTo = $lifecycle.upgradedTo
        creatorDataPreserved = $lifecycle.creatorDataPreserved
        installedWizardSmoke = $installationRehearsal.passed
        installedWizardSettingsInventory = $installationRehearsal.addOnCount
        installedWizardImportPackages = $installationRehearsal.importPackageCount
        upgradeReadinessCaptured = $installationRehearsal.readinessCaptured
        encryptedRecoveryBundleVerified = $recovery.encrypted -eq $true -and $recovery.verifiedBeforeRestore -eq $true
        recoveryFreshProfileRestored = $recovery.freshProfileRestore
        recoveryCreatorDataRestored = $recovery.creatorDataRestored
        recoveryAddOnStateRestored = $recovery.addOnStateRestored
        recoveryKeyRefreshed = $recovery.recoveryKeyRefreshed
        triggerRecoveryDetectedMissing = $triggerRecovery.detectedMissingTriggers
        triggerRecoveryRepaired = $triggerRecovery.repairedTriggers
        triggerRecoveryActionBodiesPreserved = $triggerRecovery.actionBodiesPreserved
        triggerRecoveryPostRestartReady = $triggerRecovery.postRepairRestartReady
        triggerRecoveryRollbackVerified = $triggerRecovery.verifiedRollback
    }
    [System.IO.File]::WriteAllText($evidencePath, "$($evidence | ConvertTo-Json -Depth 4)`n", [System.Text.UTF8Encoding]::new($false))

    [pscustomobject]@{
        currentTag = $CurrentTag
        previousTag = $previous.previousTag
        currentArchive = $archive.FullName
        previousArchive = $previous.archive
        lifecycleEvidence = $evidencePath
        previousChecksumVerified = $previous.checksumVerified
        previousProvenanceVerified = $previous.provenanceVerified
    }
} finally {
    Pop-Location
}
