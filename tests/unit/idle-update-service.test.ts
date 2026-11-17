import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IdleUpdateService, QUIET_AFTER_STREAM_MS } from '../../bridge/services/idle-update-service.js';
import type { Logger } from '../../bridge/services/logger.js';
import type { ReleaseUpdateStatus } from '../../bridge/services/release-update-service.js';

const logger: Logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function service(overrides: { live?: () => boolean; busy?: () => Promise<boolean>; latest?: string } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'thsv-idle-update-')); roots.push(root);
  let now = 1_000_000;
  const stage = vi.fn(async () => undefined); const apply = vi.fn(async () => undefined);
  const check = vi.fn(async () => ({ available: true, updateAvailable: overrides.latest !== undefined, ...(overrides.latest === undefined ? {} : { latestVersion: overrides.latest }) }) as unknown as ReleaseUpdateStatus);
  const instance = new IdleUpdateService({ statePath: join(root, 'idle-update.json'), isLive: overrides.live ?? (() => false), appBusy: overrides.busy ?? (async () => false), check, stage, apply, logger, now: () => now });
  return { instance, stage, apply, check, advance: (ms: number) => { now += ms; }, root };
}

describe('Install updates when idle', () => {
  it('is off until the creator switches it on, and remembers the choice', async () => {
    const { instance, apply, advance, root } = await service({ latest: '9.9.9' });
    advance(QUIET_AFTER_STREAM_MS + 1);
    await expect(instance.tick()).resolves.toBe('off');
    await instance.setEnabled(true);
    const again = new IdleUpdateService({ statePath: join(root, 'idle-update.json'), isLive: () => false, appBusy: async () => false, check: vi.fn(), stage: vi.fn(), apply: vi.fn(), logger });
    await expect(again.status()).resolves.toMatchObject({ enabled: true });
    expect(apply).not.toHaveBeenCalled();
  });

  it('never installs while live, right after a stream, or while the streaming app streams or records', async () => {
    let live = true; let busy = false;
    const { instance, apply, advance } = await service({ live: () => live, busy: async () => busy, latest: '9.9.9' });
    await instance.setEnabled(true);
    await expect(instance.tick()).resolves.toBe('live');
    live = false; advance(QUIET_AFTER_STREAM_MS - 1);
    await expect(instance.tick()).resolves.toBe('recently-live');
    advance(2); busy = true;
    await expect(instance.tick()).resolves.toBe('app-busy');
    expect(apply).not.toHaveBeenCalled();
    busy = false;
    await expect(instance.tick()).resolves.toBe('installing');
    expect(apply).toHaveBeenCalledWith('9.9.9');
  });

  it('does nothing when StreamBridge is already current', async () => {
    const { instance, stage, advance } = await service();
    await instance.setEnabled(true); advance(QUIET_AFTER_STREAM_MS + 1);
    await expect(instance.tick()).resolves.toBe('current');
    expect(stage).not.toHaveBeenCalled();
  });

  it('says an update waits while live, and remembers what it installed across the restart', async () => {
    let live = true;
    const { instance, advance, root } = await service({ live: () => live, latest: '9.9.9' });
    await instance.setEnabled(true);
    await instance.tick();
    await expect(instance.status()).resolves.toMatchObject({ pendingVersion: '9.9.9' });
    live = false; advance(QUIET_AFTER_STREAM_MS + 1);
    await expect(instance.tick()).resolves.toBe('installing');
    const restarted = new IdleUpdateService({ statePath: join(root, 'idle-update.json'), isLive: () => false, appBusy: async () => false, check: vi.fn(), stage: vi.fn(), apply: vi.fn(), logger });
    await expect(restarted.status()).resolves.toMatchObject({ enabled: true, lastInstalled: { version: '9.9.9' } });
  });

  it('shows the version running now, whichever way it was installed, and names the streaming app', async () => {
    const { root } = await service({ latest: '9.9.9' });
    let clock = 1_000_000;
    const make = (version: string, at?: string) => new IdleUpdateService({ statePath: join(root, 'idle-update.json'), isLive: () => false, appBusy: async () => false, streamingApp: async () => 'sprigcast', installed: { version, ...(at === undefined ? {} : { at }) }, check: vi.fn(async () => ({ available: true, updateAvailable: true, latestVersion: '9.9.9' }) as unknown as ReleaseUpdateStatus), stage: vi.fn(), apply: vi.fn(), logger, now: () => clock });
    const first = make('1.0.0'); await first.setEnabled(true); clock += QUIET_AFTER_STREAM_MS + 1; await expect(first.tick()).resolves.toBe('installing');
    // Installed by this switch: the same version runs after the restart.
    const auto = await make('9.9.9').status();
    expect(auto).toMatchObject({ streamingApp: 'sprigcast', installed: { version: '9.9.9', automatic: true } });
    expect(typeof auto.installed?.at).toBe('string');
    // A newer version installed another way (installer or by hand): its own install time, not the old automatic one.
    await expect(make('9.9.10', '2026-11-17T05:00:00.000Z').status()).resolves.toMatchObject({ installed: { version: '9.9.10', automatic: false, at: '2026-11-17T05:00:00.000Z' }, lastInstalled: { version: '9.9.9' } });
    const unknownTime = await make('9.9.10').status();
    expect(unknownTime.installed).toEqual({ version: '9.9.10', automatic: false });
  });
});
