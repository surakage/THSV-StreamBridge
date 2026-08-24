import { afterEach, describe, expect, it, vi } from 'vitest';
import { ObsBroadcastStateMonitor } from '../../bridge/services/obs-broadcast-state-monitor.js';
import { silentLogger } from '../helpers.js';

afterEach(() => vi.useRealTimers());

describe('OBS broadcast state monitor', () => {
  it('recovers an already-live startup and closes the session once on the active-to-inactive transition', async () => {
    vi.useFakeTimers();
    let active = true;
    const onStarted = vi.fn(async () => undefined); const onStopped = vi.fn(async () => undefined);
    const monitor = new ObsBroadcastStateMonitor({ query: async () => active, onStarted, onStopped, logger: silentLogger, intervalMs: 1_000 });
    await monitor.start();
    expect(onStarted).toHaveBeenCalledTimes(1); expect(onStopped).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onStarted).toHaveBeenCalledTimes(1);
    active = false; await vi.advanceTimersByTimeAsync(1_000);
    expect(onStopped).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(onStopped).toHaveBeenCalledTimes(1);
    monitor.stop();
  });

  it('exposes bounded recovery evidence and clears failures after the next successful sample', async () => {
    vi.useFakeTimers();
    let fail = true;
    const monitor = new ObsBroadcastStateMonitor({ query: async () => { if (fail) throw new Error('OBS unavailable'); return false; }, onStarted: async () => undefined, onStopped: async () => undefined, logger: silentLogger, intervalMs: 1_000 });
    await monitor.start();
    expect(monitor.status()).toMatchObject({ state: 'error', attempts: 1, lastError: 'OBS unavailable' });
    fail = false; await vi.advanceTimersByTimeAsync(1_000);
    expect(monitor.status()).toMatchObject({ state: 'inactive', attempts: 0 });
    expect(monitor.status()).not.toHaveProperty('lastError');
    monitor.stop();
  });
});
