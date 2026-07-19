import { describe, expect, it } from 'vitest';
import { TikfinityAdapter, normalizeTikfinityRelay } from '../../bridge/adapters/tikfinity-adapter.js';
import { StreamerBotEventRelay } from '../../bridge/adapters/streamerbot-event-relay.js';
import { platformConfig, silentLogger } from '../helpers.js';
import type { Capability } from '../../schemas/config.js';
import type { NormalizedEvent } from '../../schemas/event.js';

function relay(kind: 'chat' | 'follow' | 'gift' | 'like', overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'thsv.tikfinity', version: '1.0.0', kind, relayId: `relay-${kind}`, receivedAt: '2026-07-16T20:00:00.000Z', simulated: true,
    userId: '12345', username: 'slothviewer', nickname: 'Sloth Viewer', profilePictureUrl: 'https://example.com/avatar.png', commandParams: '',
    giftId: '', giftName: '', coins: '', repeatCount: '', likeCount: '', totalLikeCount: '', argumentKeys: ['userId', 'username'], ...overrides,
  };
}

describe('TikFinity Streamer.bot relay adapter', () => {
  it('normalizes chat without preserving undocumented raw values', () => {
    const event = normalizeTikfinityRelay(relay('chat', { commandParams: 'Hello 🦥' }));
    expect(event).toMatchObject({ eventType: 'chat.message', platform: 'tiktok', user: { id: '12345', name: 'slothviewer', displayName: 'Sloth Viewer' }, payload: { message: 'Hello 🦥' }, metadata: { simulated: true } });
    expect(JSON.stringify(event)).not.toContain('rawPayload');
  });

  it('normalizes gifts with bounded quantity and visible verification limits', () => {
    const event = normalizeTikfinityRelay(relay('gift', { giftId: 'rose-1', giftName: 'Rose', repeatCount: '5', coins: '25' }));
    expect(event).toMatchObject({ eventType: 'engagement.gift', payload: { itemName: 'Rose', quantity: 5, coins: 25 }, metadata: { simulated: true } });
    expect(event.metadata.unverifiedFields).toContain('source.eventId');
    expect(event.metadata.unverifiedFields).toContain('metadata.simulated');
  });

  it('emits only matching broadcasts while enabled', async () => {
    const eventRelay = new StreamerBotEventRelay();
    const config = { ...platformConfig(true), capabilities: ['chatInput', 'follows', 'gifts', 'engagement'] as Capability[] };
    const adapter = new TikfinityAdapter('tiktok', config, eventRelay);
    const received: unknown[] = [];
    await adapter.start({ logger: silentLogger, emit: (event) => { received.push(event); return Promise.resolve(); } });
    eventRelay.publish({ type: 'unrelated' });
    eventRelay.publish(relay('follow'));
    await expect.poll(() => received.length).toBe(1);
    expect(received[0]).toMatchObject({ eventType: 'channel.follow', platform: 'tiktok' });
    await adapter.stop();
  });

  it('emits TikTok like alerts only when a new 100-like milestone is crossed', async () => {
    const eventRelay = new StreamerBotEventRelay();
    const config = { ...platformConfig(true), capabilities: ['chatInput', 'follows', 'gifts', 'engagement'] as Capability[] };
    const adapter = new TikfinityAdapter('tiktok', config, eventRelay);
    const received: NormalizedEvent[] = [];
    await adapter.start({ logger: silentLogger, emit: (event) => { received.push(event as NormalizedEvent); return Promise.resolve(); } });
    for (const total of [1, 99, 100, 150, 200]) eventRelay.publish(relay('like', { relayId: `like-${String(total)}`, totalLikeCount: String(total) }));
    await expect.poll(() => received.length).toBe(2);
    expect(received.map((event) => event.payload['value'])).toEqual([100, 200]);
    await adapter.stop();
  });
});
