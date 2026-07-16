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
});
