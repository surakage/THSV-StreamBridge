import { describe, expect, it } from 'vitest';
import { StreamerBotEventRelay } from '../../bridge/adapters/streamerbot-event-relay.js';
import { StreamerBotStreamlabsAdapter, normalizeStreamerBotStreamlabsDonations } from '../../bridge/adapters/streamerbot-streamlabs-adapter.js';
import type { NormalizedEvent } from '../../schemas/event.js';

function envelope(data: Record<string, unknown>): Record<string, unknown> {
  return { time: '2026-07-27T12:00:00.000Z', event: { source: 'Streamlabs', type: 'Donation' }, data };
}

describe('native Streamer.bot Streamlabs adapter', () => {
  it('normalizes official Socket API event and donation IDs without exposing credentials', () => {
    const [event] = normalizeStreamerBotStreamlabsDonations(envelope({
      event_id: 'evt-123',
      message: [{ id: 456, _id: 'donation-456', name: 'TestUser', amount: '42.00', currency: 'usd', message: 'Keep building!' }],
    }));
    expect(event).toMatchObject({
      eventType: 'engagement.donation', platform: 'streamlabs',
      source: { adapter: 'streamerbot-streamlabs', eventId: 'donation-456', eventName: 'StreamlabsDonation' },
      user: { name: 'TestUser' }, payload: { amount: '42.00', currency: 'USD', message: 'Keep building!' }, metadata: { simulated: false },
    });
  });

  it('accepts Streamer.bot-shaped donation data when it includes a stable provider ID', () => {
    const [event] = normalizeStreamerBotStreamlabsDonations(envelope({
      donationId: 'donation-789', donationFrom: 'Viewer', donationAmount: 5, donationCurrency: 'USD', donationMessage: 'Hello',
    }));
    expect(event).toMatchObject({ source: { eventId: 'donation-789' }, payload: { amount: '5', currency: 'USD', message: 'Hello' } });
  });

  it('fails closed for live financial events without a stable Streamlabs identity', () => {
    expect(() => normalizeStreamerBotStreamlabsDonations(envelope({
      donationFrom: 'Viewer', donationAmount: 5, donationCurrency: 'USD', donationMessage: 'No ID',
    }))).toThrow('stable event_id, donation_id, _id, or id');
  });

  it('allows explicit Streamer.bot test events with an isolated simulated identity', () => {
    const [event] = normalizeStreamerBotStreamlabsDonations(envelope({
      isTest: true, donationFrom: 'TestUser', donationAmount: 42, donationCurrency: 'USD', donationMessage: 'Preview',
    }));
    expect(event?.source.eventId).toMatch(/^simulated:[a-f0-9]{64}$/u);
    expect(event?.metadata).toMatchObject({ simulated: true, unverifiedFields: ['source.eventId'] });
  });

  it('normalizes every donation item in a bounded batch', () => {
    const events = normalizeStreamerBotStreamlabsDonations(envelope({ message: [
      { id: 1, name: 'One', amount: '1.00', currency: 'USD' },
      { id: 2, name: 'Two', amount: '2.00', currency: 'USD' },
    ] }));
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.source.eventId)).toEqual(['1', '2']);
  });

  it('delivers a subscribed Streamer.bot event through the adapter context', async () => {
    const relay = new StreamerBotEventRelay();
    const adapter = new StreamerBotStreamlabsAdapter('streamlabs', {
      enabled: true, inputEnabled: true, outputEnabled: false, adapter: 'streamerbot-streamlabs', capabilities: ['donations'],
      reconnect: { enabled: false, initialDelayMs: 10, maxDelayMs: 10, maxAttempts: 0 },
    }, relay);
    const received: NormalizedEvent[] = [];
    await adapter.start({
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      emit: (event) => { received.push(event as NormalizedEvent); return Promise.resolve({ accepted: true }); },
    });
    relay.publish(envelope({ event_id: 'evt-1', donationFrom: 'Viewer', donationAmount: '5.00', donationCurrency: 'USD' }));
    await expect.poll(() => received.length).toBe(1);
    expect(received[0]).toMatchObject({ platform: 'streamlabs', eventType: 'engagement.donation' });
    await adapter.stop();
  });
});
