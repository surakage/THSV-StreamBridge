import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('First Five Streamer.bot package', () => {
  it('ships one triggerless controller and one optional manual reset action', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/first-five/manifest.json', 'utf8')) as {
      actions: Array<{ id: string; name: string; group: string; importFile: string }>;
      triggerSafety: string;
    };
    expect(manifest.actions).toHaveLength(2);
    expect(manifest.actions[0]).toMatchObject({
      id: '5807e453-1cdb-49bf-bad8-d50f785cbc77',
      name: 'THSV Addon - First Five - Controller',
      group: 'THSV StreamBridge - Add-ons',
    });
    expect(new Set(manifest.actions.map((action) => action.importFile))).toEqual(new Set(['THSV-StreamBridge-First-Five-1.0.0.sb']));
    expect(manifest.triggerSafety).toContain('Controller must remain triggerless');
  });

  it('uses documented bounded reward methods without SlothCoin or file access', async () => {
    const source = await readFile('packages/streamerbot/first-five/src/FirstFiveController.cs', 'utf8');
    for (const method of ['CPH.UpdateRewardTitle', 'CPH.EnableReward', 'CPH.DisableReward', 'CPH.TwitchRedemptionFulfill', 'CPH.TwitchRedemptionCancel']) {
      expect(source).toContain(method);
    }
    expect(source).toContain('CPH.TryGetArg');
    expect(source).toContain('CPH.WebsocketBroadcastJson');
    expect(source).not.toMatch(/SlothCoin|System\.IO|File\.|Directory\./u);
  });
});
