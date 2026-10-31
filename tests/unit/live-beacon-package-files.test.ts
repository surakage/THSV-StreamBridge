import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Live Beacon Streamer.bot package', () => {
  it('ships intact UTF-8 forum welcome templates', async () => {
    const schema = JSON.parse(await readFile('addons/live-beacon/schemas/config.json', 'utf8')) as { properties: Record<string, { default?: string }> };
    for (const platform of ['twitch', 'youtube', 'kick', 'tiktok', 'facebook']) {
      const template = schema.properties[`${platform}ForumWelcome`]?.default ?? '';
      expect(template).toContain('🎮');
      expect(template).toContain('🔗');
      expect(template).not.toContain('??');
      expect(template).not.toMatch(/[ÃÂ�]|â(?:€|€™|€“|€”)/u);
    }
  });

  it('keeps only the broadcast control in Streamer.bot and no webhook links', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/live-beacon/manifest.json', 'utf8')) as { actions: Array<{ name: string; group: string; arguments?: Array<{ name: string; value: string }> }> };
    expect(manifest.actions.every((action) => action.group === 'THSV Addon - Live Beacon')).toBe(true);
    expect(manifest.actions.map((action) => action.name)).toEqual(['THSV Addon - Live Beacon - Broadcast Started']);
    expect(JSON.stringify(manifest)).not.toContain('WebhookUrl');
    await expect(readFile('packages/streamerbot/live-beacon/src/DeliverDiscord.cs', 'utf8')).rejects.toThrow();
    const control = await readFile('packages/streamerbot/live-beacon/src/BroadcastStarted.cs', 'utf8');
    expect(control).toContain('addon.thsv.live-beacon.broadcast-control');
    expect(control).toContain('ReadBoolean("isTest")');
    expect(control).not.toContain('liveBeaconWebhookUrl');
  });
});
