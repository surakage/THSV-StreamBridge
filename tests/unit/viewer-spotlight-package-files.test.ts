import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
describe('Viewer Spotlight Streamer.bot package', () => {
  it('keeps the reward controller triggerless and no webhook in Streamer.bot', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/viewer-spotlight/manifest.json', 'utf8')) as { actions: Array<{ group: string; arguments?: Array<{ name: string }> }>; manualTriggerSetup: Record<string, unknown[]> };
    expect(new Set(manifest.actions.map((item) => item.group))).toEqual(new Set(['THSV Addon - Viewer Spotlight'])); expect(manifest.manualTriggerSetup['settle-reward']).toEqual([]); expect(manifest.manualTriggerSetup['discord-snapshot']).toBeUndefined(); expect(JSON.stringify(manifest)).not.toContain('WebhookUrl');
    const reward = await readFile('packages/streamerbot/viewer-spotlight/src/SettleReward.cs', 'utf8'); expect(reward).toContain('TwitchRedemptionFulfill'); expect(reward).toContain('TwitchRedemptionCancel');
    await expect(readFile('packages/streamerbot/viewer-spotlight/src/DiscordSnapshot.cs', 'utf8')).rejects.toThrow();
  });
});
