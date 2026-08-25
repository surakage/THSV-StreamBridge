import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('native Windows tray shell', () => {
  it('uses the readiness endpoint and existing safe launchers without embedding a secret', async () => {
    const source = await readFile('launcher/tray.ps1', 'utf8');
    expect(source).toContain('System.Windows.Forms.NotifyIcon');
    expect(source).toContain('/ready');
    expect(source).toContain("Start-Launcher 'open-wizard.mjs'");
    expect(source).toContain("Start-Launcher 'start-streaming-tools.mjs'");
    expect(source).toContain("Start-Launcher 'stop.mjs'");
    expect(source).toContain('DestroyIcon');
    expect(source).toContain('[Thsv.Native.IconHandle]::DestroyIcon($handle)');
    expect(source).toContain('last-startup-report.json');
    expect(source).toContain('THSV StreamBridge startup failed');
    expect(source).toContain('$timer.Interval = 5000');
    expect(source).toContain("$report.Outcome -eq 'in-progress'");
    expect(source).toContain('Starting tools - $phase');
    expect(source).toContain('Get-AcceptanceTrayState -Acceptance $response.acceptance');
    expect(source).toContain('Live acceptance reminder');
    expect(source).toContain('Review live acceptance');
    expect(source).toContain("tray-status.ps1");
    expect(source).toContain('lastAcceptanceNotificationAt');
    expect(source).toContain("@('--view=diagnostics', '--focus=live-acceptance')");
    expect(source).toContain("Start-Launcher 'set-acceptance-reminder.mjs'");
    expect(source).toContain("'Snooze acceptance reminders'");
    expect(source).toContain("'For 1 hour'");
    expect(source).toContain("'For 24 hours'");
    expect(source).toContain("'For 7 days'");
    expect(source).toContain("@('--hours=1')");
    expect(source).toContain("@('--hours=24')");
    expect(source).toContain("@('--hours=168')");
    expect(source).toContain('Resume acceptance reminders');
    expect(source).toContain('function Read-ControlToken');
    expect(source).toContain('/wizard/api/broadcast-connections');
    expect(source).toContain('Broadcast process binding changed');
    expect(source).toContain('Broadcast connection latency');
    expect(source).toContain('Add_BalloonTipClicked');
    expect(source).toContain("'scheduled-reliability-preflight'");
    expect(source).toContain("'direct-connections-title'");
    expect(source).toContain('credentialReminderDue');
    expect(source).not.toMatch(/[A-Za-z0-9_-]{43}/u);
    expect(source).not.toContain('Streamer.bot.ico');
  });

  it('uses the private authenticated helper for persistent reminder changes', async () => {
    const helper = await readFile('launcher/set-acceptance-reminder.mjs', 'utf8');
    expect(helper).toContain('/wizard/api/live-acceptance/reminders');
    expect(helper).toContain('approvedByCreator: true');
    expect(helper).toContain("[1, 24, 168]");
  });

  it('ships a hidden execution-policy-safe launcher', async () => {
    const command = await readFile('launcher/Open THSV StreamBridge Tray.cmd', 'utf8');
    expect(command).toContain('-ExecutionPolicy Bypass');
    expect(command).toContain('-WindowStyle Hidden');
    expect(command).toContain('tray.ps1');
  });
});
