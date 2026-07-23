import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Subathon Timer Streamer.bot package', () => {
  it('creates five bounded local controls in the add-on group', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/subathon-timer/manifest.json', 'utf8')) as {
      actions: Array<{ name: string; group: string; importFile: string; arguments: Array<{ name: string; value: string }> }>;
    };
    expect(manifest.actions.map((action) => action.name)).toEqual([
      'THSV Addon - Subathon Timer - Start', 'THSV Addon - Subathon Timer - Pause',
      'THSV Addon - Subathon Timer - Resume', 'THSV Addon - Subathon Timer - Reset',
      'THSV Addon - Subathon Timer - Add Time',
    ]);
    expect(manifest.actions.every((action) => action.group === 'THSV StreamBridge - Add-ons')).toBe(true);
    expect(new Set(manifest.actions.map((action) => action.importFile))).toEqual(new Set(['THSV-StreamBridge-Subathon-Timer-2.4.0.sb']));
    expect(manifest.actions[4]?.arguments).toContainEqual({ name: 'subathonSeconds', value: '300', autoType: true });
  });

  it('relays only the owned control event and never runs actions, processes, or external requests', async () => {
    const source = await readFile('packages/streamerbot/subathon-timer/src/ControlTimer.cs', 'utf8');
    expect(source).toContain('addon.thsv.subathon-timer.control');
    expect(source).toContain('MaximumAddSeconds = 86400');
    expect(source).toContain('CPH.WebsocketBroadcastJson');
    expect(source).not.toContain('CPH.RunAction');
    expect(source).not.toMatch(/Process\.Start|HttpClient|WebClient|powershell|cmd\.exe/iu);
  });
});
