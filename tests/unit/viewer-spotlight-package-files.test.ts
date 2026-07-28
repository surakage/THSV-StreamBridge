import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
describe('Viewer Spotlight Streamer.bot package', () => {
  it('keeps reward and Discord controllers triggerless and the webhook private', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/viewer-spotlight/manifest.json', 'utf8')) as { actions: Array<{ group: string; arguments?: Array<{ name: string }> }>; manualTriggerSetup: Record<string, unknown[]> };
    expect(new Set(manifest.actions.map((item) => item.group))).toEqual(new Set(['THSV Addon - Viewer Spotlight'])); expect(manifest.manualTriggerSetup['settle-reward']).toEqual([]); expect(manifest.manualTriggerSetup['discord-snapshot']).toEqual([]);
    const reward = await readFile('packages/streamerbot/viewer-spotlight/src/SettleReward.cs', 'utf8'); expect(reward).toContain('TwitchRedemptionFulfill'); expect(reward).toContain('TwitchRedemptionCancel');
    const discord = await readFile('packages/streamerbot/viewer-spotlight/src/DiscordSnapshot.cs', 'utf8'); expect(discord).toContain('viewerSpotlightDiscordWebhookUrl'); expect(discord).not.toContain('https://discord.com/api/webhooks/123');
  });
});
