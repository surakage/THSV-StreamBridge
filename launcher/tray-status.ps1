param(
    [switch]$Evaluate,
    [string]$AcceptanceJson = '{}',
    [string]$LastSignature = '',
    [DateTimeOffset]$LastNotifiedAt = [DateTimeOffset]::MinValue,
    [DateTimeOffset]$Now = [DateTimeOffset]::UtcNow,
    [DateTimeOffset]$SnoozedUntil = [DateTimeOffset]::MinValue,
    [int]$CooldownMinutes = 720,
    [switch]$EvaluateWatchdog,
    [switch]$Healthy,
    [switch]$ProcessAlive,
    [switch]$StartupInProgress,
    [switch]$LastKnownLive,
    [DateTimeOffset]$FailingSince = [DateTimeOffset]::MinValue,
    [DateTimeOffset]$LastRestartAt = [DateTimeOffset]::MinValue
)

function Get-AcceptanceTrayState {
    param(
        [object]$Acceptance,
        [string]$PreviousSignature = '',
        [DateTimeOffset]$PreviousNotificationAt = [DateTimeOffset]::MinValue,
        [DateTimeOffset]$CurrentTime = [DateTimeOffset]::UtcNow,
        [DateTimeOffset]$ReminderSnoozedUntil = [DateTimeOffset]::MinValue,
        [int]$NotificationCooldownMinutes = 720
    )
    $due = if ($null -eq $Acceptance) { 0 } else { [Math]::Max(0, [int]$Acceptance.due) }
    $dueSoon = if ($null -eq $Acceptance) { 0 } else { [Math]::Max(0, [int]$Acceptance.dueSoon) }
    $stale = if ($null -eq $Acceptance) { 0 } else { [Math]::Max(0, [int]$Acceptance.stale) }
    $attention = $due + $dueSoon + $stale
    $signature = "due=$due;soon=$dueSoon;stale=$stale"
    $signatureChanged = $signature -ne $PreviousSignature
    $cooldownElapsed = ($CurrentTime - $PreviousNotificationAt).TotalMinutes -ge [Math]::Max(1, $NotificationCooldownMinutes)
    $snoozed = $ReminderSnoozedUntil -gt $CurrentTime
    $noun = if ($attention -eq 1) { 'check' } else { 'checks' }
    $verb = if ($attention -eq 1) { 'is' } else { 'are' }
    [pscustomobject]@{
        attention = $attention
        signature = $signature
        visible = $attention -gt 0
        menuText = "Review live acceptance ($attention)"
        notificationText = "$attention live acceptance $noun $verb due, due soon, or changed. Open the Setup Wizard to review."
        snoozed = $snoozed
        shouldNotify = $attention -gt 0 -and -not $snoozed -and ($signatureChanged -or $cooldownElapsed)
    }
}

# Decides when the tray restarts a Bridge that is running but no longer answering. Only a
# recorded, still-running Bridge that has failed its health check for HangSeconds is restarted,
# never while the last answer said a platform was live, never during a startup, and at most once
# per CooldownMinutes so a Bridge that keeps hanging is left for the creator to look at.
function Get-BridgeWatchdogState {
    param(
        [bool]$IsHealthy,
        [bool]$IsProcessAlive,
        [bool]$IsStartupInProgress,
        [bool]$WasLive,
        [DateTimeOffset]$PreviousFailingSince = [DateTimeOffset]::MinValue,
        [DateTimeOffset]$PreviousRestartAt = [DateTimeOffset]::MinValue,
        [DateTimeOffset]$CurrentTime = [DateTimeOffset]::UtcNow,
        [int]$HangSeconds = 60,
        [int]$RestartCooldownMinutes = 15
    )
    if ($IsHealthy -or -not $IsProcessAlive -or $IsStartupInProgress) {
        $reason = if ($IsHealthy) { 'healthy' } elseif (-not $IsProcessAlive) { 'not-running' } else { 'starting' }
        return [pscustomobject]@{ failingSince = [DateTimeOffset]::MinValue; shouldRestart = $false; reason = $reason }
    }
    $since = if ($PreviousFailingSince -eq [DateTimeOffset]::MinValue) { $CurrentTime } else { $PreviousFailingSince }
    $reason = 'waiting'
    if ($WasLive) { $reason = 'live' }
    elseif (($CurrentTime - $since).TotalSeconds -lt $HangSeconds) { $reason = 'waiting' }
    elseif (($CurrentTime - $PreviousRestartAt).TotalMinutes -lt $RestartCooldownMinutes) { $reason = 'cooldown' }
    else { $reason = 'restart' }
    [pscustomobject]@{ failingSince = $since; shouldRestart = $reason -eq 'restart'; reason = $reason }
}

if ($EvaluateWatchdog) {
    Get-BridgeWatchdogState -IsHealthy $Healthy.IsPresent -IsProcessAlive $ProcessAlive.IsPresent -IsStartupInProgress $StartupInProgress.IsPresent -WasLive $LastKnownLive.IsPresent -PreviousFailingSince $FailingSince -PreviousRestartAt $LastRestartAt -CurrentTime $Now | Select-Object @{ Name = 'failingSince'; Expression = { $_.failingSince.ToUniversalTime().ToString('o') } }, shouldRestart, reason | ConvertTo-Json -Compress
}

if ($Evaluate) {
    $acceptance = ConvertFrom-Json -InputObject $AcceptanceJson
    Get-AcceptanceTrayState -Acceptance $acceptance -PreviousSignature $LastSignature -PreviousNotificationAt $LastNotifiedAt -CurrentTime $Now -ReminderSnoozedUntil $SnoozedUntil -NotificationCooldownMinutes $CooldownMinutes | ConvertTo-Json -Compress
}
