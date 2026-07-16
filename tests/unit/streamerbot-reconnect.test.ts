import { describe, expect, it } from 'vitest';
import { calculateReconnectDelay } from '../../bridge/adapters/streamerbot-adapter.js';

describe('Streamer.bot reconnect delay', () => {
  it('uses bounded equal jitter on exponential backoff', () => {
    expect(calculateReconnectDelay(1_000, 30_000, 0, () => 0)).toBe(500);
    expect(calculateReconnectDelay(1_000, 30_000, 2, () => 1)).toBe(4_000);
    expect(calculateReconnectDelay(1_000, 3_000, 8, () => 1)).toBe(3_000);
  });

  it('bounds an out-of-range random source', () => {
    expect(calculateReconnectDelay(1_000, 30_000, 0, () => -1)).toBe(500);
    expect(calculateReconnectDelay(1_000, 30_000, 0, () => 2)).toBe(1_000);
  });
});
