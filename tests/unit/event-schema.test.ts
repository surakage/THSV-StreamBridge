import { describe, expect, it } from 'vitest';
import { normalizedEventSchema } from '../../schemas/event.js';
import { fixture } from '../helpers.js';

describe('normalized event schema', () => {
  it('accepts a valid event', async () => {
    expect(normalizedEventSchema.safeParse(await fixture()).success).toBe(true);
  });

  it('rejects an invalid event type', async () => {
    const event = { ...(await fixture()), eventType: 'Unknown Event' };
    expect(normalizedEventSchema.safeParse(event).success).toBe(false);
  });

  it('accepts a namespaced extension event type and platform', async () => {
    const event = { ...(await fixture()), eventType: 'tikfinity.share', platform: 'future-platform' };
    expect(normalizedEventSchema.safeParse(event).success).toBe(true);
  });

  it('rejects a missing required field', async () => {
    const event = { ...(await fixture()) } as Partial<Record<keyof Awaited<ReturnType<typeof fixture>>, unknown>>;
    delete event.eventId;
    expect(normalizedEventSchema.safeParse(event).success).toBe(false);
  });

  it('requires a stable source event ID for every public alert before deduplication', async () => {
    const alert = await fixture('youtube-super-chat.json');
    const source = { ...alert.source };
    delete source.eventId;
    const result = normalizedEventSchema.safeParse({ ...alert, source });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toContain('stable source event ID');
  });

  it('retains fallback fingerprint support for non-alert events', async () => {
    const chat = await fixture('twitch-chat.json');
    const source = { ...chat.source };
    delete source.eventId;

    expect(normalizedEventSchema.safeParse({ ...chat, source }).success).toBe(true);
  });

  it('accepts bounded HTTPS presentation metadata and rejects unsafe avatar schemes', async () => {
    const chat = await fixture('twitch-chat.json');
    const presentation = {
      ...chat.user,
      avatarUrl: 'https://example.com/avatar.png',
      nameColor: '#72efc2',
      badges: [{ id: 'subscriber', label: 'Subscriber', iconUrl: 'https://example.com/badge.png' }],
    };
    expect(normalizedEventSchema.safeParse({ ...chat, user: presentation }).success).toBe(true);
    expect(normalizedEventSchema.safeParse({ ...chat, user: { ...presentation, avatarUrl: 'file:///C:/secret.txt' } }).success).toBe(false);
    expect(normalizedEventSchema.safeParse({ ...chat, user: { ...presentation, nameColor: 'red; background:url(x)' } }).success).toBe(false);
  });
});
