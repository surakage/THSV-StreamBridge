import { describe, expect, it } from 'vitest';
import { normalizedEventSchema, type NormalizedEvent } from '../../schemas/event.js';
import {
  InvalidMultiAlertError,
  MULTI_ALERTS_MAX_TEXT_LENGTH,
  normalizeAlertPlainText,
  projectMultiAlert,
} from '../../bridge/core/multi-alerts.js';
import { fixture } from '../helpers.js';

describe('Multi-Alerts contract', () => {
  it.each([
    ['twitch-follow.json', 'twitch', 'follow'],
    ['youtube-super-chat.json', 'youtube', 'super-chat'],
    ['kick-follow.json', 'kick', 'follow'],
    ['tiktok-tikfinity-gift.json', 'tiktok', 'gift'],
    ['facebook-donation.json', 'facebook', 'donation'],
  ])('projects %s into one platform-neutral contract', async (fixtureName, platform, alertType) => {
    const alert = projectMultiAlert(await alertFixture(fixtureName));
    expect(alert).toMatchObject({ contractVersion: '1.0.0', sequence: 1, visibility: 'public', platform, alertType, simulated: true });
  });

  it.each([
    ['channel.subscription', { tier: 'tier-1' }, 'subscription'],
    ['channel.membership', { tier: 'member' }, 'membership'],
    ['channel.gift-subscription', { quantity: 5, tier: 'tier-1' }, 'gift-subscription'],
    ['engagement.cheer', { quantity: 100 }, 'cheer'],
    ['channel.raid', { quantity: 42 }, 'raid'],
  ])('supports %s without platform-specific branches', async (eventType, payload, alertType) => {
    const event = await alertFixture('twitch-follow.json');
    expect(projectMultiAlert({ ...event, eventType, payload })).toMatchObject({ alertType, ...payload });
  });

  it('uses decimal strings and uppercase ISO currency without floating-point conversion', async () => {
    const alert = projectMultiAlert(await alertFixture('youtube-super-chat.json'));
    expect(alert).toMatchObject({ amount: '5.00', currency: 'USD', message: 'Simulated support' });
    expect(() => projectMultiAlert(withPayload('engagement.donation', { amount: 0.1, currency: 'USD' }))).toThrow('decimal string');
    expect(() => projectMultiAlert(withPayload('engagement.donation', { amount: '1.00', currency: 'usd' }))).toThrow('uppercase');
  });

  it('normalizes inert alert text while preserving Unicode and emoji', () => {
    expect(normalizeAlertPlainText('  Thanks\n\t🦥 世界\u0000  ')).toBe('Thanks 🦥 世界');
    expect(projectMultiAlert(withPayload('engagement.super-chat', {
      amount: '1.00', currency: 'USD', message: '<script>alert(1)</script> 🦥',
    }))?.message).toBe('<script>alert(1)</script> 🦥');
  });

  it('requires event-specific fields with readable bounded errors', () => {
    expect(() => projectMultiAlert(withPayload('engagement.gift', { quantity: 1 }))).toThrow('itemName');
    expect(() => projectMultiAlert(withPayload('channel.raid', {}))).toThrow('quantity');
    expect(() => projectMultiAlert(withPayload('engagement.milestone', { metric: 'likes' }, false))).toThrow('value');
    expect(() => projectMultiAlert(withPayload('channel.follow', { message: 'x'.repeat(MULTI_ALERTS_MAX_TEXT_LENGTH + 1) }))).toThrow(InvalidMultiAlertError);
  });

  it('supports actor-free milestones and exposes unverified transport truthfully', async () => {
    const milestone = await alertFixture('tiktok-tikfinity-like.json');
    const alert = projectMultiAlert(milestone);
    expect(alert).toMatchObject({ alertType: 'milestone', metric: 'likes', value: 100, verifiedTransport: false });
    expect(alert?.actor).toBeUndefined();
    expect(alert?.unverifiedFields).toContain('payload.metric');
  });

  it('rejects system actors, missing sequence, and missing users for actor alerts', async () => {
    const event = await alertFixture('twitch-follow.json');
    if (event.user === undefined) throw new Error('Fixture must contain a user');
    const user = event.user;
    expect(() => projectMultiAlert({ ...event, user: { ...user, actorType: 'system' } })).toThrow('system actor');
    expect(() => projectMultiAlert({ ...event, user: undefined })).toThrow('requires user data');
    expect(() => projectMultiAlert({ ...event, metadata: { ...event.metadata, bridgeSequence: undefined } })).toThrow('bridge-assigned sequence');
  });

  it('ignores chat, commands, private traffic, and unsupported extension events', async () => {
    const chat = normalizedEventSchema.parse(await fixture('twitch-chat.json'));
    expect(projectMultiAlert(chat)).toBeUndefined();
    expect(projectMultiAlert({ ...chat, eventType: 'command.received' })).toBeUndefined();
    expect(projectMultiAlert({ ...chat, eventType: 'operator.message' })).toBeUndefined();
    expect(projectMultiAlert({ ...chat, eventType: 'plugin.alert' })).toBeUndefined();
  });
});

async function alertFixture(name: string): Promise<NormalizedEvent> {
  const event = normalizedEventSchema.parse(await fixture(name));
  return { ...event, metadata: { ...event.metadata, bridgeSequence: 1 } };
}

function withPayload(eventType: string, payload: NormalizedEvent['payload'], includeUser = true): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: 'alert-test', eventType, platform: 'test',
    source: { adapter: 'fixture', eventName: 'Alert' }, receivedAt: '2026-01-01T00:00:00.000Z',
    channel: { name: 'Example' },
    ...(includeUser ? { user: { name: 'viewer', actorType: 'human' as const, roles: ['viewer'] } } : {}),
    payload, metadata: { bridgeSequence: 1, simulated: true },
  };
}
