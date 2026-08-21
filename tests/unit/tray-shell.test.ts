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
    expect(source).toContain('tray-preferences.json');
    expect(source).toContain('Snooze acceptance reminders for 24 hours');
    expect(source).toContain('Resume acceptance reminders');
    expect(source).not.toContain('control-token');
    expect(source).not.toContain('Streamer.bot.ico');
  });

  it('ships a hidden execution-policy-safe launcher', async () => {
    const command = await readFile('launcher/Open THSV StreamBridge Tray.cmd', 'utf8');
    expect(command).toContain('-ExecutionPolicy Bypass');
    expect(command).toContain('-WindowStyle Hidden');
    expect(command).toContain('tray.ps1');
  });
});
