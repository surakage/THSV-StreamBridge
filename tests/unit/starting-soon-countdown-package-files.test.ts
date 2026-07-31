import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Stream Launch Countdown Streamer.bot package', () => {
  it('creates seven scene-friendly controls in the add-on group', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/starting-soon-countdown/manifest.json', 'utf8')) as {
      actions: Array<{ name: string; group: string; importFile: string; arguments: Array<{ name: string; value: string; autoType?: boolean }> }>;
    };
    expect(manifest.actions.map((action) => action.name)).toEqual([
      'THSV Addon - Stream Launch Countdown - Start', 'THSV Addon - Stream Launch Countdown - Pause',
      'THSV Addon - Stream Launch Countdown - Resume', 'THSV Addon - Stream Launch Countdown - Reset',
      'THSV Addon - Stream Launch Countdown - Stop', 'THSV Addon - Stream Launch Countdown - Complete Now',
      'THSV Addon - Stream Launch Countdown - Set & Start',
    ]);
    expect(manifest.actions.every((action) => action.group === 'THSV Addon - Stream Launch Countdown')).toBe(true);
    expect(new Set(manifest.actions.map((action) => action.importFile))).toEqual(new Set(['THSV-StreamBridge-Stream-Launch-Countdown-2.5.2.sb']));
    expect(manifest.actions.at(-1)?.arguments).toContainEqual({ name: 'countdownSeconds', value: '600', autoType: true });
  });

  it('relays only bounded countdown controls without external I/O or action execution', async () => {
    const source = await readFile('packages/streamerbot/starting-soon-countdown/src/ControlCountdown.cs', 'utf8');
    expect(source).toContain('addon.thsv.starting-soon-countdown.control');
    expect(source).toContain('MaximumSeconds = 86400');
    expect(source).toContain('CPH.WebsocketBroadcastJson');
    expect(source).not.toContain('CPH.RunAction');
    expect(source).not.toMatch(/Process\.Start|HttpClient|WebClient|powershell|cmd\.exe/iu);
  });
});
