import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Automated Shoutouts Streamer.bot package', () => {
  it('uses only the documented native Twitch methods behind the broker dispatch marker', async () => {
    const source = await readFile('packages/streamerbot/automated-shoutouts/src/TwitchNativeShoutout.cs', 'utf8');
    expect(source).toContain('thsvAddonRelayToken');
    expect(source).toContain('CPH.TwitchSendShoutoutById(userId)');
    expect(source).toContain('CPH.TwitchSendShoutoutByLogin(userName)');
    expect(source).not.toContain('CPH.RunAction');
    expect(source).not.toMatch(/Process\.Start|powershell|cmd\.exe/iu);
  });

  it('uses the documented Twitch extended-user category and relays only bounded profile data', async () => {
    const source = await readFile('packages/streamerbot/automated-shoutouts/src/LookupTwitchCreator.cs', 'utf8');
    expect(source).toContain('CPH.TwitchGetExtendedUserInfoById(userId)');
    expect(source).toContain('CPH.TwitchGetExtendedUserInfoByLogin(userName)');
    expect(source).toContain('information.Game');
    expect(source).toContain('addon.thsv.automated-shoutouts.twitch-profile-received');
    expect(source).not.toContain('CPH.SendMessage');
  });

  it('pins the action ID consumed by the add-on and declares only required references', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/automated-shoutouts/manifest.json', 'utf8')) as { actions: Array<{ id: string; references: string[] }> };
    expect(manifest.actions.map((action) => action.id)).toEqual(['e3d92d7e-193a-5bba-8b8c-4f17e605c9d2', 'c84fdb40-d06f-5b0a-9ddf-f6d21c68922e']);
    expect(manifest.actions[1]?.references).toEqual([
      'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\mscorlib.dll',
      'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.dll',
    ]);
  });
});
