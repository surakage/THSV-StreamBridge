param(
    [switch]$Evaluate,
    [string]$AcceptanceJson = '{}',
    [string]$LastSignature = '',
    [DateTimeOffset]$LastNotifiedAt = [DateTimeOffset]::MinValue,
    [DateTimeOffset]$Now = [DateTimeOffset]::UtcNow,
    [DateTimeOffset]$SnoozedUntil = [DateTimeOffset]::MinValue,
    [int]$CooldownMinutes = 720
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

if ($Evaluate) {
    $acceptance = ConvertFrom-Json -InputObject $AcceptanceJson
    Get-AcceptanceTrayState -Acceptance $acceptance -PreviousSignature $LastSignature -PreviousNotificationAt $LastNotifiedAt -CurrentTime $Now -ReminderSnoozedUntil $SnoozedUntil -NotificationCooldownMinutes $CooldownMinutes | ConvertTo-Json -Compress
}
