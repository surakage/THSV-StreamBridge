import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('native platform intake package', () => {
  it('declares one consistently grouped action per supported native platform', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/native-platform-intake/manifest.json', 'utf8')) as {
      actions: Array<{ name: string; group: string }>;
      triggerContract: Record<string, string[]>;
    };
    expect(manifest.actions).toEqual([
      expect.objectContaining({ name: 'THSV Twitch - Intake', group: 'THSV StreamBridge - Twitch' }),
      expect.objectContaining({ name: 'THSV YouTube - Intake', group: 'THSV StreamBridge - YouTube' }),
      expect.objectContaining({ name: 'THSV Kick - Intake', group: 'THSV StreamBridge - Kick' }),
    ]);
    expect(Object.keys(manifest.triggerContract)).toEqual(['twitch', 'youtube', 'kick']);
  });

  it('keeps the reviewed relay source bounded and side-effect limited', async () => {
    const source = await readFile('packages/streamerbot/native-platform-intake/src/RelayPlatform.cs', 'utf8');
    expect(source).toContain('CPH.WebsocketBroadcastJson');
    expect(source).toContain('CPH.GetEventType()');
    expect(source).not.toContain('CPH.SetGlobalVar');
    expect(source).not.toContain('CPH.RunAction');
    expect(source).not.toMatch(/Process\.Start|PowerShell|cmd\.exe/);
  });
});
