import { describe, expect, it } from 'vitest';
import type { NormalizedEvent } from '../../schemas/event.js';
import { createTestBridge, testConfig } from '../helpers.js';

function lifecycle(platform: string, eventType: 'stream.online' | 'stream.offline', id: string): Record<string, unknown> {
  return { schemaVersion: '1.0.0', eventId: id, eventType, platform, source: { adapter: 'test', eventName: eventType, eventId: id }, receivedAt: new Date().toISOString(), channel: { name: platform }, payload: {}, metadata: { simulated: false, unverifiedFields: [] } };
}

describe('Streaming app stopped', () => {
  it('ends the live session on every platform that never reported going offline', async () => {
    const bridge = createTestBridge(await testConfig());
    await bridge.start();
    const seen: NormalizedEvent[] = [];
    bridge.subscribe((event) => { seen.push(event); });
    await bridge.ingest(lifecycle('twitch', 'stream.online', 'on-twitch'));
    await bridge.ingest(lifecycle('tiktok', 'stream.online', 'on-tiktok'));
    await bridge.ingest(lifecycle('twitch', 'stream.offline', 'off-twitch'));

    // TikTok LIVE Studio refused End LIVE and Kick never answered: the stream is still over on both.
    const ended = await bridge.endLiveSessionEverywhere(['twitch', 'kick', 'tiktok'], 'sprigcast');
    expect(ended.sort()).toEqual(['kick', 'tiktok']);
    const offline = seen.filter((event) => event.eventType === 'stream.offline' && event.source.adapter === 'streaming-app');
    expect(offline.map((event) => event.platform).sort()).toEqual(['kick', 'tiktok']);
    expect(offline[0]?.metadata.simulated).toBe(false);
    expect(offline[0]?.payload).toMatchObject({ reason: 'streaming-app-stopped', provider: 'sprigcast' });

    // The platform's own offline arriving later is a repeat, and a second stop sends nothing.
    const late = await bridge.ingest(lifecycle('tiktok', 'stream.offline', 'off-tiktok-late'));
    expect(late.duplicate).toBe(true);
    expect(await bridge.endLiveSessionEverywhere(['twitch', 'kick', 'tiktok'], 'sprigcast')).toEqual([]);
    await bridge.stop();
  });
});
