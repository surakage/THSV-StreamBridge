import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Ad Break Companion Streamer.bot package', () => {
  it('uses two documented Twitch trigger intakes and three triggerless display controls', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/ad-break-companion/manifest.json', 'utf8')) as {
      actions: Array<{ name: string; group: string; arguments: Array<{ name: string; value: string }> }>;
      manualTriggerSetup: string[];
    };
    expect(manifest.actions).toHaveLength(5);
    expect(new Set(manifest.actions.map((action) => action.group))).toEqual(new Set(['THSV Addon - Ad Break Companion']));
    expect(manifest.actions.map((action) => action.arguments[0]?.value)).toEqual(['upcoming', 'started', 'preview-upcoming', 'preview-active', 'hide']);
    expect(manifest.manualTriggerSetup.join(' ')).toContain('Twitch > Ads > Upcoming Ad');
    expect(manifest.manualTriggerSetup.join(' ')).toContain('Twitch > Ads > Ad Run');
  });

  it('relays bounded timing data without controlling Twitch ads', async () => {
    const source = await readFile('packages/streamerbot/ad-break-companion/src/RelayAdBreak.cs', 'utf8');
    expect(source).toContain('TwitchUpcomingAd');
    expect(source).toContain('TwitchAdRun');
    expect(source).toContain('CPH.WebsocketBroadcastJson');
    expect(source).not.toMatch(/RunCommercial|StartAd|CancelAd/u);
  });
});
