import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppUpdateWatch, type ApplicationVersionChange, type WatchedApplicationVersion } from '../../bridge/services/app-update-watch.js';
import type { Logger } from '../../bridge/services/logger.js';

let roots: string[] = [];
afterEach(async () => { await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))); roots = []; });

function logger() {
  const info = vi.fn(); const warn = vi.fn();
  return { info, warn, logger: { debug: vi.fn(), info, warn, error: vi.fn() } as unknown as Logger };
}

async function setup(initial: WatchedApplicationVersion[]) {
  const root = await mkdtemp(join(tmpdir(), 'thsv-app-updates-')); roots.push(root);
  let current = initial;
  let now = Date.parse('2026-10-30T12:00:00.000Z');
  const seen: (readonly ApplicationVersionChange[])[] = [];
  const log = logger();
  const options = { versions: () => Promise.resolve(current), onChange: (changes: readonly ApplicationVersionChange[]) => { seen.push(changes); return Promise.resolve(); }, logger: log.logger, statePath: join(root, 'state', 'app-versions.json'), now: () => now };
  return { root, options, seen, log, set: (next: WatchedApplicationVersion[]) => { current = next; }, advance: (ms: number) => { now += ms; } };
}

const sb = (version: string): WatchedApplicationVersion => ({ id: 'streamerbot', label: 'Streamer.bot', version });
const obs = (version: string): WatchedApplicationVersion => ({ id: 'obs', label: 'OBS Studio', version });

describe('integrated program update watch', () => {
  it('records versions on the first check, then reports an update once, rechecks, and tells the tray', async () => {
    const test = await setup([sb('1.1.0-alpha.17'), obs('32.2.2')]);
    const watch = new AppUpdateWatch(test.options);
    await watch.check();
    expect(test.seen).toEqual([]);
    expect(watch.status()).toMatchObject({ signature: '', recentChanges: [] });

    test.set([sb('1.1.0-alpha.18'), obs('32.2.2')]); test.advance(60_000);
    await watch.check();
    expect(test.seen).toHaveLength(1);
    expect(test.seen[0]).toMatchObject([{ id: 'streamerbot', from: '1.1.0-alpha.17', to: '1.1.0-alpha.18' }]);
    expect(test.log.info).toHaveBeenCalledWith('Integrated program updated', { app: 'Streamer.bot', from: '1.1.0-alpha.17', to: '1.1.0-alpha.18' });
    const status = watch.status();
    expect(status['title']).toBe('Streamer.bot updated');
    expect(status['text']).toContain('Streamer.bot 1.1.0-alpha.18');
    expect(watch.notices()[0]).toMatchObject({ area: 'app-updates' });

    await watch.check();
    expect(test.seen).toHaveLength(1);
    expect(watch.status()['signature']).toBe(status['signature']);
  });

  it('remembers versions across restarts, so an update made while StreamBridge was closed is still noticed', async () => {
    const test = await setup([obs('32.2.2')]);
    await new AppUpdateWatch(test.options).check();
    test.set([obs('32.3.0'), { id: 'voicemod', label: 'Voicemod', version: '3.17.39' }]);
    const restarted = new AppUpdateWatch(test.options);
    await restarted.check();
    expect(test.seen).toEqual([[expect.objectContaining({ id: 'obs', from: '32.2.2', to: '32.3.0' })]]);
    const saved = JSON.parse(await readFile(test.options.statePath, 'utf8')) as { versions: Record<string, { version: string }> };
    expect(saved.versions['voicemod']?.version).toBe('3.17.39');
  });

  it('groups several updates into one note and lets old ones expire after two weeks', async () => {
    const test = await setup([sb('1'), obs('1')]);
    const watch = new AppUpdateWatch(test.options);
    await watch.check();
    test.set([sb('2'), obs('2')]);
    await watch.check();
    expect(watch.status()['title']).toBe('2 programs updated');
    test.advance(15 * 24 * 60 * 60 * 1000);
    expect(watch.status()).toMatchObject({ signature: '', recentChanges: [] });
    expect(watch.notices()).toEqual([]);
  });

  it('keeps working when versions cannot be read or the recheck fails', async () => {
    const test = await setup([sb('1')]);
    const watch = new AppUpdateWatch({ ...test.options, versions: () => Promise.reject(new Error('probe failed')) });
    await watch.check();
    expect(test.log.warn).toHaveBeenCalledWith('Could not read integrated program versions', expect.anything());
    const failing = new AppUpdateWatch({ ...test.options, onChange: () => Promise.reject(new Error('feed down')) });
    await failing.check(); test.set([sb('2')]); await failing.check();
    expect(test.log.warn).toHaveBeenCalledWith('Recheck after a program update failed', expect.anything());
    expect(failing.status()['title']).toBe('Streamer.bot updated');
  });
});
