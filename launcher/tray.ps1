param([string]$InstallRoot = '')

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
. (Join-Path $PSScriptRoot 'tray-status.ps1')
Add-Type -Namespace Thsv.Native -Name IconHandle -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool DestroyIcon(System.IntPtr handle);
'@

if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
    $InstallRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
} else {
    $InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
}

$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\THSV.StreamBridge.Tray', [ref]$createdNew)
if (-not $createdNew) { exit 0 }

$runtime = Join-Path $InstallRoot 'runtime\node.exe'
$configPath = Join-Path $InstallRoot 'data\configuration\bridge.local.json'
$logPath = Join-Path $InstallRoot 'data\logs\tray-shell.log'
$startupReportPath = Join-Path $InstallRoot 'data\logs\last-startup-report.json'
$script:lastReady = $null
$script:lastDetail = 'Checking StreamBridge...'
$script:lastReportTimestamp = $null
$script:lastAcceptanceSignature = $null
$script:lastAcceptanceNotificationAt = [DateTimeOffset]::MinValue
$script:closing = $false

function Write-TrayLog([string]$Message) {
    try {
        $directory = Split-Path -Parent $logPath
        [System.IO.Directory]::CreateDirectory($directory) | Out-Null
        $line = "{0} {1}" -f ([DateTime]::UtcNow.ToString('o')), $Message
        [System.IO.File]::AppendAllText($logPath, "$line`r`n", [System.Text.UTF8Encoding]::new($false))
    } catch { }
}

function New-VillageIcon {
    $bitmap = New-Object System.Drawing.Bitmap 32, 32
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
            (New-Object System.Drawing.Rectangle 2, 2, 28, 28),
            [System.Drawing.Color]::FromArgb(38, 196, 184),
            [System.Drawing.Color]::FromArgb(110, 66, 193),
            45
        )
        try { $graphics.FillEllipse($brush, 2, 2, 28, 28) } finally { $brush.Dispose() }
        $font = New-Object System.Drawing.Font('Segoe UI', 15, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
        $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        try { $graphics.DrawString('V', $font, $textBrush, 8, 7) } finally { $font.Dispose(); $textBrush.Dispose() }
        $handle = $bitmap.GetHicon()
        try {
            return [System.Drawing.Icon]::FromHandle($handle).Clone()
        } finally {
            [void][Thsv.Native.IconHandle]::DestroyIcon($handle)
        }
    } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

function Read-ServiceUrl {
    $config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
    $port = [int]$config.service.port
    if ($port -lt 1 -or $port -gt 65535) { throw 'The configured StreamBridge port is invalid.' }
    return "http://127.0.0.1:$port"
}

function Start-Launcher([string]$ScriptName, [string[]]$Arguments = @()) {
    if (-not (Test-Path -LiteralPath $runtime -PathType Leaf)) { throw 'The bundled StreamBridge runtime is missing.' }
    $scriptPath = Join-Path $InstallRoot "launcher\$ScriptName"
    if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) { throw "The launcher $ScriptName is missing." }
    $argumentText = '"' + $scriptPath.Replace('"', '') + '"'
    if ($Arguments.Count -gt 0) { $argumentText += ' ' + (($Arguments | ForEach-Object { '"' + ([string]$_).Replace('"', '') + '"' }) -join ' ') }
    Start-Process -FilePath $runtime -ArgumentList $argumentText -WorkingDirectory $InstallRoot -WindowStyle Hidden | Out-Null
}

function Show-Balloon([string]$Title, [string]$Text, [System.Windows.Forms.ToolTipIcon]$Kind) {
    $notify.BalloonTipTitle = $Title
    $notify.BalloonTipText = $Text
    $notify.BalloonTipIcon = $Kind
    $notify.ShowBalloonTip(4000)
}

function Read-StartupReport {
    try {
        if (-not (Test-Path -LiteralPath $startupReportPath -PathType Leaf)) { return $null }
        $report = Get-Content -Raw -LiteralPath $startupReportPath | ConvertFrom-Json
        if ([string]::IsNullOrWhiteSpace([string]$report.timestamp) -or [string]::IsNullOrWhiteSpace([string]$report.message)) { return $null }
        return [pscustomobject]@{
            Timestamp = [string]$report.timestamp
            Outcome = [string]$report.outcome
            Category = [string]$report.category
            Phase = [string]$report.phase
            Message = ([string]$report.message).Substring(0, [Math]::Min(220, ([string]$report.message).Length))
        }
    } catch { return $null }
}

function Update-Status {
    $ready = $false
    $detail = 'Bridge is offline'
    $report = Read-StartupReport
    try {
        $response = Invoke-RestMethod -Uri "$(Read-ServiceUrl)/ready" -Method Get -TimeoutSec 2
        $ready = $response.ready -eq $true
        $detail = if ($ready) { 'Bridge is ready' } else { 'Bridge needs attention' }
        $snoozedUntil = if ([string]::IsNullOrWhiteSpace([string]$response.acceptance.snoozedUntil)) { [DateTimeOffset]::MinValue } else { [DateTimeOffset]::Parse([string]$response.acceptance.snoozedUntil) }
        $acceptanceState = Get-AcceptanceTrayState -Acceptance $response.acceptance -PreviousSignature $script:lastAcceptanceSignature -PreviousNotificationAt $script:lastAcceptanceNotificationAt -ReminderSnoozedUntil $snoozedUntil
        if ($acceptanceState.visible) {
            $detail = "$detail - $($acceptanceState.attention) acceptance check$(if ($acceptanceState.attention -eq 1) { ' needs' } else { 's need' }) attention"
            $acceptanceItem.Text = $acceptanceState.menuText
            if ($acceptanceState.shouldNotify) {
                Show-Balloon 'Live acceptance reminder' $acceptanceState.notificationText ([System.Windows.Forms.ToolTipIcon]::Warning)
                $script:lastAcceptanceNotificationAt = [DateTimeOffset]::UtcNow
            }
        }
        $acceptanceItem.Visible = $acceptanceState.visible
        $snoozeAcceptanceMenu.Visible = $acceptanceState.visible -and -not $acceptanceState.snoozed
        $resumeAcceptanceItem.Visible = $acceptanceState.visible -and $acceptanceState.snoozed
        if ($acceptanceState.snoozed) { $resumeAcceptanceItem.Text = "Resume acceptance reminders (snoozed until $($snoozedUntil.ToLocalTime().ToString('g')))" }
        $script:lastAcceptanceSignature = $acceptanceState.signature
    } catch {
        $detail = 'Bridge is offline'
        $acceptanceItem.Visible = $false
        $snoozeAcceptanceMenu.Visible = $false
        $resumeAcceptanceItem.Visible = $false
    }
    if ($null -ne $report -and $report.Outcome -eq 'in-progress') {
        $phase = if ([string]::IsNullOrWhiteSpace($report.Phase)) { 'starting' } else { $report.Phase.Replace('-', ' ') }
        $detail = "Starting tools - $phase"
    } elseif (-not $ready -and $null -ne $report -and $report.Outcome -eq 'failed') {
        $category = if ([string]::IsNullOrWhiteSpace($report.Category)) { 'startup error' } else { $report.Category }
        $detail = "Bridge startup failed ($category)"
    }
    $statusItem.Text = $detail
    $notify.Text = ("THSV StreamBridge - $detail").Substring(0, [Math]::Min(63, ("THSV StreamBridge - $detail").Length))
    if ($null -ne $script:lastReady -and $script:lastReady -ne $ready) {
        if ($ready) {
            Show-Balloon 'THSV StreamBridge is ready' 'The local Bridge passed its readiness check.' ([System.Windows.Forms.ToolTipIcon]::Info)
        } else {
            $attention = if ($null -ne $report -and $report.Outcome -eq 'failed') { $report.Message } else { 'Open the Setup Wizard to review connection and diagnostics.' }
            Show-Balloon 'THSV StreamBridge needs attention' $attention ([System.Windows.Forms.ToolTipIcon]::Warning)
        }
    }
    if ($null -ne $script:lastReportTimestamp -and $null -ne $report -and $script:lastReportTimestamp -ne $report.Timestamp -and $report.Outcome -eq 'failed') {
        Show-Balloon 'THSV StreamBridge startup failed' $report.Message ([System.Windows.Forms.ToolTipIcon]::Error)
    }
    if ($script:lastDetail -ne $detail) { Write-TrayLog $detail }
    $script:lastReady = $ready
    $script:lastDetail = $detail
    if ($null -ne $report) { $script:lastReportTimestamp = $report.Timestamp }
}

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$statusItem = New-Object System.Windows.Forms.ToolStripMenuItem 'Checking StreamBridge...'
$statusItem.Enabled = $false
$openWizardItem = New-Object System.Windows.Forms.ToolStripMenuItem 'Open Setup Wizard'
$acceptanceItem = New-Object System.Windows.Forms.ToolStripMenuItem 'Review live acceptance'
$acceptanceItem.Visible = $false
$snoozeAcceptanceMenu = New-Object System.Windows.Forms.ToolStripMenuItem 'Snooze acceptance reminders'
$snoozeAcceptanceMenu.Visible = $false
$snoozeAcceptanceOneHourItem = New-Object System.Windows.Forms.ToolStripMenuItem 'For 1 hour'
$snoozeAcceptanceOneDayItem = New-Object System.Windows.Forms.ToolStripMenuItem 'For 24 hours'
$snoozeAcceptanceOneWeekItem = New-Object System.Windows.Forms.ToolStripMenuItem 'For 7 days'
[void]$snoozeAcceptanceMenu.DropDownItems.Add($snoozeAcceptanceOneHourItem)
[void]$snoozeAcceptanceMenu.DropDownItems.Add($snoozeAcceptanceOneDayItem)
[void]$snoozeAcceptanceMenu.DropDownItems.Add($snoozeAcceptanceOneWeekItem)
$resumeAcceptanceItem = New-Object System.Windows.Forms.ToolStripMenuItem 'Resume acceptance reminders'
$resumeAcceptanceItem.Visible = $false
$startToolsItem = New-Object System.Windows.Forms.ToolStripMenuItem 'Start streaming tools'
$startBridgeItem = New-Object System.Windows.Forms.ToolStripMenuItem 'Start or repair Bridge'
$stopBridgeItem = New-Object System.Windows.Forms.ToolStripMenuItem 'Stop Bridge'
$openFolderItem = New-Object System.Windows.Forms.ToolStripMenuItem 'Open installation folder'
$checkItem = New-Object System.Windows.Forms.ToolStripMenuItem 'Refresh status'
$exitItem = New-Object System.Windows.Forms.ToolStripMenuItem 'Exit tray shell'
[void]$menu.Items.Add($statusItem)
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
[void]$menu.Items.Add($openWizardItem)
[void]$menu.Items.Add($acceptanceItem)
[void]$menu.Items.Add($snoozeAcceptanceMenu)
[void]$menu.Items.Add($resumeAcceptanceItem)
[void]$menu.Items.Add($startToolsItem)
[void]$menu.Items.Add($startBridgeItem)
[void]$menu.Items.Add($stopBridgeItem)
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
[void]$menu.Items.Add($openFolderItem)
[void]$menu.Items.Add($checkItem)
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
[void]$menu.Items.Add($exitItem)

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = New-VillageIcon
$notify.Text = 'THSV StreamBridge - Checking status'
$notify.ContextMenuStrip = $menu
$notify.Visible = $true

$openWizard = { try { Start-Launcher 'open-wizard.mjs' } catch { Show-Balloon 'Could not open Setup Wizard' $_.Exception.Message ([System.Windows.Forms.ToolTipIcon]::Error) } }
$openWizardItem.Add_Click($openWizard)
$acceptanceItem.Add_Click({ try { Start-Launcher 'open-wizard.mjs' @('--view=diagnostics', '--focus=live-acceptance') } catch { Show-Balloon 'Could not open live acceptance' $_.Exception.Message ([System.Windows.Forms.ToolTipIcon]::Error) } })
$snoozeAcceptanceOneHourItem.Add_Click({ try { Start-Launcher 'set-acceptance-reminder.mjs' @('--hours=1'); Start-Sleep -Milliseconds 300; Update-Status } catch { Show-Balloon 'Could not snooze reminders' $_.Exception.Message ([System.Windows.Forms.ToolTipIcon]::Error) } })
$snoozeAcceptanceOneDayItem.Add_Click({ try { Start-Launcher 'set-acceptance-reminder.mjs' @('--hours=24'); Start-Sleep -Milliseconds 300; Update-Status } catch { Show-Balloon 'Could not snooze reminders' $_.Exception.Message ([System.Windows.Forms.ToolTipIcon]::Error) } })
$snoozeAcceptanceOneWeekItem.Add_Click({ try { Start-Launcher 'set-acceptance-reminder.mjs' @('--hours=168'); Start-Sleep -Milliseconds 300; Update-Status } catch { Show-Balloon 'Could not snooze reminders' $_.Exception.Message ([System.Windows.Forms.ToolTipIcon]::Error) } })
$resumeAcceptanceItem.Add_Click({ try { Start-Launcher 'set-acceptance-reminder.mjs' @('--resume'); $script:lastAcceptanceNotificationAt = [DateTimeOffset]::MinValue; Start-Sleep -Milliseconds 300; Update-Status } catch { Show-Balloon 'Could not resume reminders' $_.Exception.Message ([System.Windows.Forms.ToolTipIcon]::Error) } })
$notify.Add_DoubleClick($openWizard)
$startToolsItem.Add_Click({ try { Start-Launcher 'start-streaming-tools.mjs' } catch { Show-Balloon 'Streaming tools did not start' $_.Exception.Message ([System.Windows.Forms.ToolTipIcon]::Error) } })
$startBridgeItem.Add_Click({ try { Start-Launcher 'start.mjs' @('--wait') } catch { Show-Balloon 'Bridge did not start' $_.Exception.Message ([System.Windows.Forms.ToolTipIcon]::Error) } })
$stopBridgeItem.Add_Click({ try { Start-Launcher 'stop.mjs' } catch { Show-Balloon 'Bridge did not stop' $_.Exception.Message ([System.Windows.Forms.ToolTipIcon]::Error) } })
$openFolderItem.Add_Click({ Start-Process -FilePath 'explorer.exe' -ArgumentList ('"' + $InstallRoot.Replace('"', '') + '"') | Out-Null })
$checkItem.Add_Click({ Update-Status })
$exitItem.Add_Click({ $script:closing = $true; [System.Windows.Forms.Application]::Exit() })

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.Add_Tick({ Update-Status })
$timer.Start()

try {
    Write-TrayLog 'Tray shell started.'
    Update-Status
    [System.Windows.Forms.Application]::Run()
} finally {
    $timer.Stop(); $timer.Dispose()
    $notify.Visible = $false; $notify.Dispose()
    $menu.Dispose()
    $mutex.ReleaseMutex(); $mutex.Dispose()
    Write-TrayLog 'Tray shell exited.'
}
