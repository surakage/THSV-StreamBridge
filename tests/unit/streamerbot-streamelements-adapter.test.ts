import { describe, expect, it } from 'vitest';
import { StreamerBotEventRelay } from '../../bridge/adapters/streamerbot-event-relay.js';
import { StreamerBotStreamElementsAdapter, normalizeStreamerBotStreamElementsTip } from '../../bridge/adapters/streamerbot-streamelements-adapter.js';
import type { NormalizedEvent } from '../../schemas/event.js';

function envelope(data: Record<string, unknown>): Record<string, unknown> {
  return { time: '2026-10-31T18:00:00.000Z', event: { source: 'StreamElements', type: 'Tip' }, data };
}

describe('native Streamer.bot StreamElements adapter', () => {
  it('normalizes Streamer.bot tip variables into a donation with the StreamElements tip ID', () => {
    const event = normalizeStreamerBotStreamElementsTip(envelope({ tipId: 'tip-123', tipUsername: 'Villager', tipAmount: 5, tipCurrency: 'eur', tipMessage: 'For the sloths!' }));
    expect(event).toMatchObject({
      eventType: 'engagement.donation', platform: 'streamelements', channel: { name: 'streamelements' },
      source: { adapter: 'streamerbot-streamelements', eventId: 'tip-123', eventName: 'StreamElementsTip' },
      user: { name: 'Villager', displayName: 'Villager' }, payload: { amount: '5', currency: 'EUR', message: 'For the sloths!' }, metadata: { simulated: false },
    });
    expect(event.eventId).toBe('streamerbot-streamelements-tip-123');
  });

  it("reads StreamElements' own activity record nested in the event", () => {
    const event = normalizeStreamerBotStreamElementsTip(envelope({ _id: 'activity-9', type: 'tip', createdAt: '2026-10-31T17:59:58.000Z', data: { username: 'Fan', amount: '12.50', currency: 'USD', message: 'gg' } }));
    expect(event).toMatchObject({ source: { eventId: 'activity-9' }, user: { name: 'Fan' }, payload: { amount: '12.50', currency: 'USD', message: 'gg' } });
  });

  it('fails closed for a live tip without a StreamElements identity', () => {
    expect(() => normalizeStreamerBotStreamElementsTip(envelope({ tipUsername: 'Viewer', tipAmount: 5, tipCurrency: 'USD' }))).toThrow('stable tipId, _id, id, or activityId');
  });

  it('gives emulated tips an isolated simulated identity', () => {
    const event = normalizeStreamerBotStreamElementsTip(envelope({ isMock: true, tipUsername: 'Tester', tipAmount: 1, tipCurrency: 'USD' }));
    expect(event.source.eventId).toMatch(/^simulated:[a-f0-9]{64}$/u);
    expect(event.metadata).toMatchObject({ simulated: true, unverifiedFields: ['source.eventId'] });
  });

  it('rejects a tip without an exact amount and currency', () => {
    expect(() => normalizeStreamerBotStreamElementsTip(envelope({ tipId: 't', tipUsername: 'Viewer', tipAmount: 'lots', tipCurrency: 'USD' }))).toThrow('exact amount');
  });

  it('ignores other Streamer.bot events and delivers subscribed tips through the adapter context', async () => {
    const relay = new StreamerBotEventRelay();
    const adapter = new StreamerBotStreamElementsAdapter('streamelements', {
      enabled: true, inputEnabled: true, outputEnabled: false, adapter: 'streamerbot-streamelements', capabilities: ['donations'],
      reconnect: { enabled: false, initialDelayMs: 10, maxDelayMs: 10, maxAttempts: 0 },
    }, relay);
    const received: NormalizedEvent[] = [];
    await adapter.start({
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      emit: (event) => { received.push(event as NormalizedEvent); return Promise.resolve({ accepted: true }); },
    });
    relay.publish({ time: '2026-10-31T18:00:00.000Z', event: { source: 'StreamElements', type: 'Merch' }, data: { tipId: 'x' } });
    relay.publish(envelope({ tipId: 'tip-1', tipUsername: 'Viewer', tipAmount: '3.00', tipCurrency: 'USD' }));
    await expect.poll(() => received.length).toBe(1);
    expect(received[0]).toMatchObject({ platform: 'streamelements', eventType: 'engagement.donation', source: { eventId: 'tip-1' } });
    await adapter.stop();
  });
});
