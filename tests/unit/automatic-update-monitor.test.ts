import { describe, expect, it, vi } from 'vitest';
import { AutomaticUpdateMonitor } from '../../bridge/services/automatic-update-monitor.js';
import { silentLogger } from '../helpers.js';

describe('AutomaticUpdateMonitor', () => {
  it('checks on each Streamer.bot connection transition without polling the network repeatedly', async () => {
    let connected = false;
    let now = Date.parse('2026-08-15T12:00:00.000Z');
    const checkCore = vi.fn(async () => ({ checkedAt: new Date(now).toISOString(), currentVersion: '3.5.0', available: true, updateAvailable: false, latestVersion: '3.5.0', discoverySource: 'slothbloom' as const }));
    const checkAddOns = vi.fn(async () => ({ checkedAt: new Date(now).toISOString(), available: true, updateCount: 0, revokedCount: 0, addOns: [], discoverySource: 'slothbloom' as const }));
    const persist = vi.fn(async () => undefined);
    const monitor = new AutomaticUpdateMonitor({
      streamerBotConnected: () => connected, checkCore, checkAddOns, logger: silentLogger, statePath: 'automatic-update-status.json', now: () => now, persist,
    });

    await expect(monitor.poll()).resolves.toMatchObject({ state: 'waiting-for-streamerbot', streamerBotConnected: false });
    connected = true;
    await expect(monitor.poll()).resolves.toMatchObject({ state: 'current', streamerBotConnected: true, discoverySource: 'slothbloom' });
    await monitor.poll();
    expect(checkCore).toHaveBeenCalledTimes(1);
    expect(checkAddOns).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);

    connected = false;
    await monitor.poll();
    connected = true;
    now += 60_000;
    await monitor.poll();
    expect(checkCore).toHaveBeenCalledTimes(2);
    expect(checkAddOns).toHaveBeenCalledTimes(2);
  });

  it('retains a concise available-update summary for the authenticated wizard', async () => {
    const monitor = new AutomaticUpdateMonitor({
      streamerBotConnected: () => true,
      checkCore: async () => ({ checkedAt: '2026-08-15T12:00:00.000Z', currentVersion: '3.5.0', available: true, updateAvailable: true, latestVersion: '3.6.0', discoverySource: 'slothbloom' }),
      checkAddOns: async () => ({ checkedAt: '2026-08-15T12:00:00.000Z', available: true, updateCount: 2, revokedCount: 1, addOns: [], discoverySource: 'slothbloom' }),
      logger: silentLogger, statePath: 'automatic-update-status.json', now: () => Date.parse('2026-08-15T12:00:00.000Z'), persist: async () => undefined,
    });
    await expect(monitor.poll()).resolves.toMatchObject({
      state: 'updates-available', coreUpdateAvailable: true, latestCoreVersion: '3.6.0', addOnUpdateCount: 2, revokedAddOnCount: 1,
      message: expect.stringContaining('StreamBridge 3.6.0') as unknown,
    });
  });

  it('contains unexpected checker failures without creating an unhandled timer rejection', async () => {
    const persist = vi.fn(async () => undefined);
    const monitor = new AutomaticUpdateMonitor({
      streamerBotConnected: () => true,
      checkCore: async () => { throw new Error('unexpected release parser failure'); },
      checkAddOns: async () => ({ checkedAt: '2026-08-15T12:00:00.000Z', available: true, updateCount: 0, revokedCount: 0, addOns: [] }),
      logger: silentLogger, statePath: 'automatic-update-status.json', now: () => Date.parse('2026-08-15T12:00:00.000Z'), persist,
    });

    await expect(monitor.poll()).resolves.toMatchObject({
      state: 'unavailable', streamerBotConnected: true, coreUpdateAvailable: false,
      message: expect.stringContaining('Streaming is unaffected') as unknown,
    });
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
