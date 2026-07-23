import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Fan Crown Streamer.bot package', () => {
  it('ships a stable triggerless controller and two creator maintenance actions', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/fan-crown/manifest.json', 'utf8')) as {
      actions: Array<{ id: string; name: string; group: string; source: string; importFile: string; arguments?: Array<{ name: string; value: string }> }>;
      triggerSafety: string;
    };
    expect(manifest.actions).toHaveLength(3);
    expect(manifest.actions[0]).toMatchObject({
      id: 'ad2b29a1-4e8e-4f0b-9ac2-6c4e5f473e12',
      name: 'THSV Addon - Fan Crown - Controller',
      group: 'THSV StreamBridge - Add-ons',
    });
    expect(manifest.actions[1]?.arguments).toEqual([expect.objectContaining({ name: 'fanCrownControlAction', value: 'reset-crown' })]);
    expect(manifest.actions[2]?.arguments).toEqual([expect.objectContaining({ name: 'fanCrownControlAction', value: 'reset-month' })]);
    expect(new Set(manifest.actions.map((action) => action.importFile))).toEqual(new Set(['THSV-StreamBridge-Fan-Crown-1.0.0.sb']));
    expect(manifest.triggerSafety).toContain('Controller must remain triggerless');
  });

  it('uses documented reward methods, bounded arguments, and no file or OAuth access', async () => {
    const controller = await readFile('packages/streamerbot/fan-crown/src/FanCrownController.cs', 'utf8');
    const control = await readFile('packages/streamerbot/fan-crown/src/FanCrownControl.cs', 'utf8');
    for (const method of ['CPH.UpdateReward', 'CPH.TwitchRedemptionFulfill', 'CPH.TwitchRedemptionCancel', 'CPH.TryGetArg', 'CPH.WebsocketBroadcastJson']) {
      expect(controller).toContain(method);
    }
    expect(controller).toContain('MaximumCost = 2000000000');
    expect(`${controller}\n${control}`).not.toMatch(/SlothCoin|System\.IO|File\.|Directory\.|TwitchOAuthToken|TwitchClientId/u);
  });

  it('exposes organized settings and hosted overlay styling without unsafe HTML rendering', async () => {
    const ui = JSON.parse(await readFile('addons/fan-crown/ui/settings.json', 'utf8')) as { sections: Array<{ id: string }> };
    const overlay = await readFile('overlays/browser/addon-host.js', 'utf8');
    expect(ui.sections.map((section) => section.id)).toEqual(['setup', 'pricing', 'eligibility', 'chat', 'overlay', 'maintenance']);
    expect(overlay).toContain("card.style.setProperty('--card-background'");
    expect(overlay).toContain('cardText.textContent = text');
    expect(overlay).not.toContain('cardText.innerHTML');
  });
});
