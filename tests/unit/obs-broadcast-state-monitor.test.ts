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
});
