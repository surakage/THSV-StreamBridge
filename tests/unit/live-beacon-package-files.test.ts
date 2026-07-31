import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Live Beacon Streamer.bot package', () => {
  it('keeps webhook secrets in Streamer.bot and supports confirmed channel/forum delivery', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/live-beacon/manifest.json', 'utf8')) as { actions: Array<{ name: string; group: string; arguments?: Array<{ name: string; value: string }> }> };
    expect(manifest.actions.every((action) => action.group === 'THSV Addon - Live Beacon')).toBe(true);
    const deliver = manifest.actions.find((action) => action.name.endsWith('Deliver'));
    expect(deliver?.arguments).toContainEqual(expect.objectContaining({ name: 'liveBeaconWebhookUrl', value: 'REPLACE_WITH_PRIVATE_DISCORD_WEBHOOK_URL' }));
    expect(deliver?.arguments?.map((argument) => argument.name)).toEqual(['liveBeaconWebhookUrl']);
    const source = await readFile('packages/streamerbot/live-beacon/src/DeliverDiscord.cs', 'utf8');
    expect(source).toContain('PlatformWebhook');
    expect(source).toContain('PlatformArgumentName');
    expect(source).toContain('"WebhookUrl"');
    expect(source).toContain('wait=true');
    expect(source).toContain('["thread_name"]');
    expect(source).toContain('"thread_id="');
    expect(source).toContain('liveBeaconThreadId');
    expect(source).toContain('liveBeaconForumWelcome');
    expect(source).toContain('["allowed_mentions"]');
    expect(source).toContain('["roles"]');
    expect(source).toContain('retry_after');
    expect(source).toContain('["threadId"]');
    expect(source).toContain('["embeds"]');
    expect(source).toContain('PlatformColor');
    expect(source).toContain('"Stream title"');
    expect(source).toContain('"Game / Category"');
    expect(source).toContain('"Direct link"');
    expect(source).toContain('liveBeaconStartedAt');
    expect(source).toContain('PlatformWebhook');
    expect(source).toContain('<t:');
    expect(source).not.toMatch(/Log(?:Info|Warn|Error)\([^\n]*(?:webhook|message)/iu);
    const control = await readFile('packages/streamerbot/live-beacon/src/BroadcastStarted.cs', 'utf8');
    expect(control).toContain('addon.thsv.live-beacon.broadcast-control');
    expect(control).toContain('ReadBoolean("isTest")');
    expect(control).not.toContain('liveBeaconWebhookUrl');
  });
});
