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
  const instance = new IdleUpdateService({ statePath: join(root, 'idle-update.json'), isLive: overrides.live ?? (() => false), obsBusy: overrides.busy ?? (async () => false), check, stage, apply, logger, now: () => now });
  return { instance, stage, apply, check, advance: (ms: number) => { now += ms; }, root };
}

describe('Install updates when idle', () => {
  it('is off until the creator switches it on, and remembers the choice', async () => {
    const { instance, apply, advance, root } = await service({ latest: '9.9.9' });
    advance(QUIET_AFTER_STREAM_MS + 1);
    await expect(instance.tick()).resolves.toBe('off');
    await instance.setEnabled(true);
    const again = new IdleUpdateService({ statePath: join(root, 'idle-update.json'), isLive: () => false, obsBusy: async () => false, check: vi.fn(), stage: vi.fn(), apply: vi.fn(), logger });
    await expect(again.status()).resolves.toMatchObject({ enabled: true });
    expect(apply).not.toHaveBeenCalled();
  });

  it('never installs while live, right after a stream, or while OBS streams or records', async () => {
    let live = true; let busy = false;
    const { instance, apply, advance } = await service({ live: () => live, busy: async () => busy, latest: '9.9.9' });
    await instance.setEnabled(true);
    await expect(instance.tick()).resolves.toBe('live');
    live = false; advance(QUIET_AFTER_STREAM_MS - 1);
    await expect(instance.tick()).resolves.toBe('recently-live');
    advance(2); busy = true;
    await expect(instance.tick()).resolves.toBe('obs-busy');
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
    const restarted = new IdleUpdateService({ statePath: join(root, 'idle-update.json'), isLive: () => false, obsBusy: async () => false, check: vi.fn(), stage: vi.fn(), apply: vi.fn(), logger });
    await expect(restarted.status()).resolves.toMatchObject({ enabled: true, lastInstalled: { version: '9.9.9' } });
  });
});
