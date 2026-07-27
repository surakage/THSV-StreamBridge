import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Live Beacon Streamer.bot package', () => {
  it('keeps webhook secrets in Streamer.bot and supports confirmed channel/forum delivery', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/live-beacon/manifest.json', 'utf8')) as { actions: Array<{ group: string; arguments: Array<{ name: string; value: string }> }> };
    expect(manifest.actions[0]?.group).toBe('THSV Addon - Live Beacon');
    expect(manifest.actions[0]?.arguments).toContainEqual(expect.objectContaining({ name: 'liveBeaconWebhookUrl', value: 'REPLACE_WITH_PRIVATE_DISCORD_WEBHOOK_URL' }));
    const source = await readFile('packages/streamerbot/live-beacon/src/DeliverDiscord.cs', 'utf8');
    expect(source).toContain('wait=true');
    expect(source).toContain('["thread_name"]');
    expect(source).toContain('["allowed_mentions"]');
    expect(source).toContain('["roles"]');
    expect(source).toContain('retry_after');
    expect(source).toContain('["threadId"]');
    expect(source).not.toMatch(/Log(?:Info|Warn|Error)\([^\n]*(?:webhook|message)/iu);
  });
});
