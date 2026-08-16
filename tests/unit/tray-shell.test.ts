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
