import { describe, expect, it } from 'vitest';
import { normalizeStreamerBotAddOnRelay } from '../../bridge/adapters/streamerbot-addon-relay-adapter.js';
import { addOnRelayAuthorizer } from '../../bridge/services/addon-relay-authorizer.js';

function relay(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const moduleId = typeof overrides['moduleId'] === 'string' ? overrides['moduleId'] : 'sample.random-clip-player';
  return {
    type: 'thsv.addon', version: '1.0.0', moduleId: 'sample.random-clip-player', eventType: 'addon.sample.random-clip-player.clips-received',
    sourceEventType: 'THSV Addon - Random Clip Player - Get Clips', relayId: 'relay-clips-1', receivedAt: '2026-07-21T00:00:00.000Z',
    simulated: false, payload: {}, relayToken: addOnRelayAuthorizer.issue(moduleId), ...overrides,
  };
}

describe('Streamer.bot add-on relay adapter', () => {
  it('normalizes a namespaced add-on event with its payload intact', () => {
    const event = normalizeStreamerBotAddOnRelay(relay({ payload: { clipId: 'AwkwardClip', title: 'Nice play', durationSeconds: 12 } }));
    expect(event).toMatchObject({
      eventType: 'addon.sample.random-clip-player.clips-received', platform: 'system', channel: { name: 'system' },
      source: { adapter: 'streamerbot-addon-relay', eventId: 'relay-clips-1', eventName: 'THSV Addon - Random Clip Player - Get Clips' },
      payload: { clipId: 'AwkwardClip', title: 'Nice play', durationSeconds: 12 },
      metadata: { simulated: false, rawPayload: { moduleId: 'sample.random-clip-player' } },
    });
    expect(event.user).toBeUndefined();
  });

  it('rejects core or another add-on namespace', () => {
    expect(() => normalizeStreamerBotAddOnRelay(relay({ eventType: 'system.custom' }))).toThrow('must begin with addon.sample.random-clip-player.');
    expect(() => normalizeStreamerBotAddOnRelay(relay({ eventType: 'addon.someone-else.result' }))).toThrow('must begin with addon.sample.random-clip-player.');
  });

  it('canonicalizes only the two historical Random Clip Player relay event names', () => {
    const clips = normalizeStreamerBotAddOnRelay(relay({ moduleId: 'thsv.random-clip-player', eventType: 'addon.random-clip-player.clips-received' }));
    const download = normalizeStreamerBotAddOnRelay(relay({ moduleId: 'thsv.random-clip-player', eventType: 'addon.random-clip-player.clip-download-received' }));
    expect(clips.eventType).toBe('addon.thsv.random-clip-player.clips-received');
    expect(download.eventType).toBe('addon.thsv.random-clip-player.clip-download-received');
    expect(() => normalizeStreamerBotAddOnRelay(relay({ moduleId: 'sample.random-clip-player', eventType: 'addon.random-clip-player.clips-received' }))).toThrow('must begin with addon.sample.random-clip-player.');
  });

  it('derives a stable eventId from the module ID and relay ID', () => {
    const event = normalizeStreamerBotAddOnRelay(relay({ moduleId: 'sample.no-op', eventType: 'addon.sample.no-op.result', relayId: 'relay-42' }));
    expect(event.eventId).toBe('streamerbot-addon-sample.no-op-relay-42');
  });

  it('hashes a composed relay identity that would exceed the normalized event limit', () => {
    const moduleId = `sample.${'m'.repeat(100)}`;
    const event = normalizeStreamerBotAddOnRelay(relay({ moduleId, eventType: `addon.${moduleId}.result`, relayId: 'r'.repeat(256) }));
    expect(event.eventId).toMatch(/^streamerbot-addon-sha256-[a-f0-9]{64}$/u);
    expect(event.eventId.length).toBeLessThanOrEqual(256);
    expect(event.source.eventId).toBe('r'.repeat(256));
  });

  it('rejects a payload with too many keys', () => {
    const payload = Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`key-${String(index)}`, index]));
    expect(() => normalizeStreamerBotAddOnRelay(relay({ payload }))).toThrow('at most 100 keys');
  });

  it('rejects a payload larger than 64 KiB', () => {
    expect(() => normalizeStreamerBotAddOnRelay(relay({ payload: { blob: 'x'.repeat(70_000) } }))).toThrow('at most 65536 bytes');
  });

  it('rejects an unnamespaced event type that is not a recognized core type', () => {
    expect(() => normalizeStreamerBotAddOnRelay(relay({ eventType: 'clips-received' }))).toThrow();
  });

  it('rejects a message that is not the expected envelope shape', () => {
    expect(() => normalizeStreamerBotAddOnRelay({ type: 'thsv.addon' })).toThrow();
  });

  it('rejects uncorrelated result relays but permits the bounded creator scene control', () => {
    expect(() => normalizeStreamerBotAddOnRelay({ ...relay(), relayToken: '' })).toThrow('relay token');
    expect(normalizeStreamerBotAddOnRelay(relay({
      moduleId: 'thsv.random-clip-player', eventType: 'addon.thsv.random-clip-player.control',
      sourceEventType: 'THSV Addon - Random Clip Player - Enable', relayToken: '', payload: { enabled: true },
    }))).toMatchObject({ eventType: 'addon.thsv.random-clip-player.control', payload: { enabled: true } });
  });

  it('permits only the exact stable-ID Ko-fi donation ingress envelope without a broker token', () => {
    const provider = {
      moduleId: 'thsv.kofi-donations', eventType: 'addon.thsv.kofi-donations.donation-received', sourceEventType: 'KofiDonation',
      relayId: 'ko-fi-message-42', relayToken: '',
      payload: { amount: '5.00', currency: 'USD', from: 'Supporter', isPublic: true, message: 'Thanks!', timestamp: '2026-07-22T12:00:00.000Z' },
    };
    expect(normalizeStreamerBotAddOnRelay(relay(provider))).toMatchObject({
      eventType: 'addon.thsv.kofi-donations.donation-received', source: { eventId: 'ko-fi-message-42', eventName: 'KofiDonation' },
    });
    expect(() => normalizeStreamerBotAddOnRelay(relay({ ...provider, sourceEventType: 'KofiSubscription' }))).toThrow('relay token');
    expect(() => normalizeStreamerBotAddOnRelay(relay({ ...provider, payload: { ...provider.payload, unexpected: 'no' } }))).toThrow('relay token');
  });

  it('permits only bounded, action-matched Subathon Timer creator controls', () => {
    const control = {
      moduleId: 'thsv.subathon-timer', eventType: 'addon.thsv.subathon-timer.control', relayToken: '',
      sourceEventType: 'THSV Addon - Subathon Timer - Add Time', relayId: 'subathon-add-1',
      payload: { action: 'add-time', seconds: 300 },
    };
    expect(normalizeStreamerBotAddOnRelay(relay(control))).toMatchObject({
      eventType: 'addon.thsv.subathon-timer.control', payload: { action: 'add-time', seconds: 300 },
    });
    expect(() => normalizeStreamerBotAddOnRelay(relay({ ...control, payload: { action: 'add-time', seconds: 0 } }))).toThrow('relay token');
    expect(() => normalizeStreamerBotAddOnRelay(relay({ ...control, sourceEventType: 'THSV Addon - Subathon Timer - Reset' }))).toThrow('relay token');
    expect(() => normalizeStreamerBotAddOnRelay(relay({ ...control, payload: { action: 'reset', seconds: 300 } }))).toThrow('relay token');
  });
});
