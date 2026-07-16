import { describe, expect, it } from 'vitest';
import { EventDeduplicator } from '../../bridge/core/deduplicator.js';
import { fixture } from '../helpers.js';

describe('EventDeduplicator', () => {
  it('uses a source event ID inside a bounded TTL', async () => {
    let now = 1_000;
    const deduplicator = new EventDeduplicator(100, 10, { now: () => now });
    const event = await fixture();
    expect(deduplicator.isDuplicate(event)).toBe(false);
    expect(deduplicator.isDuplicate({ ...event, eventId: 'different-local-id' })).toBe(true);
    now = 1_101;
    expect(deduplicator.isDuplicate(event)).toBe(false);
  });

  it('uses a stable fallback fingerprint without a source ID', async () => {
    const event = await fixture();
    const source = { adapter: event.source.adapter, eventName: event.source.eventName };
    const deduplicator = new EventDeduplicator(1_000, 10);
    expect(deduplicator.isDuplicate({ ...event, source })).toBe(false);
    expect(deduplicator.isDuplicate({ ...event, eventId: 'another-id', source })).toBe(true);
  });

  it('evicts old entries when the cache reaches its limit', async () => {
    const base = await fixture();
    const deduplicator = new EventDeduplicator(1_000, 2);
    for (let index = 0; index < 3; index += 1) {
      expect(deduplicator.isDuplicate({ ...base, eventId: `event-${String(index)}`, source: { ...base.source, eventId: `source-${String(index)}` } })).toBe(false);
    }
    expect(deduplicator.size).toBe(2);
  });
});
