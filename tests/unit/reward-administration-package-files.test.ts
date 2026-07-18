import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

describe('reward administration package', () => {
  it('uses documented Twitch methods and contains no Kick mutation call', async () => {
    const source = await readFile('packages/streamerbot/reward-administration/src/ProcessRewardAdministration.cs', 'utf8');
    for (const method of ['CPH.EnableReward', 'CPH.DisableReward', 'CPH.PauseReward', 'CPH.UnPauseReward', 'CPH.TwitchRedemptionFulfill', 'CPH.TwitchRedemptionCancel']) expect(source).toContain(method);
    expect(source).toContain('platform != "twitch"');
    expect(source).not.toMatch(/CPH\.[A-Za-z]*Kick[A-Za-z]*Reward/u);
    expect(source).toContain('rewardAdminApproved');
  });

  it('packages exactly the reviewed source with creator-facing metadata', async () => {
    const root = 'packages/streamerbot/reward-administration';
    const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8')) as {
      author: string; description: string; action: { source: string; importFile: string };
    };
    const reviewed = (await readFile(`${root}/${manifest.action.source}`, 'utf8')).replaceAll('\r\n', '\n').trimEnd();
    const decoded = Buffer.from((await readFile(`${root}/${manifest.action.importFile}`, 'utf8')).trim(), 'base64');
    expect(decoded.subarray(0, 4).toString('ascii')).toBe('SBAE');
    const exported = JSON.parse(gunzipSync(decoded.subarray(4)).toString('utf8')) as {
      meta: { author: string; description: string };
      data: { actions: Array<{ subActions: Array<{ type: number; enabled: boolean; byteCode?: string }> }> };
    };
    const code = exported.data.actions[0]?.subActions.find((item) => item.type === 99_999 && item.enabled);
    expect(Buffer.from(code?.byteCode ?? '', 'base64').toString('utf8').replaceAll('\r\n', '\n').trimEnd()).toBe(reviewed);
    expect(exported.meta).toMatchObject({ author: manifest.author, description: manifest.description });
  });
});
