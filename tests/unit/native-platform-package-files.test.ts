import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
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
    expect(manifest.triggerContract.twitch).toContain('TwitchRewardRedemption');
    expect(manifest.triggerContract.twitch).toEqual(expect.arrayContaining(['TwitchStreamOnline', 'TwitchStreamOffline']));
    expect(manifest.triggerContract.youtube).toEqual(expect.arrayContaining(['YouTubeBroadcastStarted', 'YouTubeBroadcastEnded']));
    expect(manifest.triggerContract.kick).toEqual(expect.arrayContaining(['KickStreamOnline', 'KickStreamOffline']));
    expect(manifest.triggerContract.kick).toContain('KickRewardRedemption');
  });

  it('keeps the reviewed relay source bounded and side-effect limited', async () => {
    const source = await readFile('packages/streamerbot/native-platform-intake/src/RelayPlatform.cs', 'utf8');
    expect(source).toContain('CPH.WebsocketBroadcastJson');
    expect(source).toContain('CPH.GetEventType()');
    expect(source).not.toContain('CPH.SetGlobalVar');
    expect(source).not.toContain('CPH.RunAction');
    expect(source).not.toMatch(/Process\.Start|PowerShell|cmd\.exe/);
  });

  it('packages the current reviewed relay source into all three actions', async () => {
    const root = 'packages/streamerbot/native-platform-intake';
    const reviewed = (await readFile(`${root}/src/RelayPlatform.cs`, 'utf8')).replaceAll('\r\n', '\n').trimEnd();
    const decoded = Buffer.from((await readFile(`${root}/THSV-StreamBridge-Native-Platform-Intake-1.1.0.sb`, 'utf8')).trim(), 'base64');
    const exported = JSON.parse(gunzipSync(decoded.subarray(4)).toString('utf8')) as {
      data: { actions: Array<{ subActions: Array<{ type: number; enabled: boolean; byteCode?: string }> }> };
    };
    expect(exported.data.actions).toHaveLength(3);
    for (const action of exported.data.actions) {
      const code = action.subActions.find((item) => item.type === 99_999 && item.enabled);
      expect(Buffer.from(code?.byteCode ?? '', 'base64').toString('utf8').replaceAll('\r\n', '\n').trimEnd()).toBe(reviewed);
    }
  });
});
