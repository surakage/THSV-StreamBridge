import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileCommandSyncStore, NoopCommandSyncStore, reconcileCommandSync } from '../../bridge/services/command-sync-store.js';
import { commandSyncStateSchema, syncedCommandSchema } from '../../bridge/contracts/v2/command-sync.js';
import { silentLogger } from '../helpers.js';

function syncedCommand(overrides: Partial<Parameters<typeof syncedCommandSchema.parse>[0]> = {}) {
  return syncedCommandSchema.parse({
    contractVersion: '2.0.0-preview.1',
    streamerBotId: 'sb-action-1',
    name: 'shoutout',
    aliases: ['so'],
    source: 'framework',
    lastSeenAt: '2026-07-18T00:00:00.000Z',
    driftStatus: 'in-sync',
    ...overrides,
  });
}

describe('command sync contract', () => {
  it('rejects a state that is not shaped like a bounded command mirror', () => {
    expect(commandSyncStateSchema.safeParse({ version: 1, commands: 'not-an-array' }).success).toBe(false);
    expect(commandSyncStateSchema.safeParse({ version: 1, commands: [syncedCommand()] }).success).toBe(true);
  });

  it('requires an explicit source distinguishing framework packages from wizard-generated commands', () => {
    expect(() => syncedCommand({ source: 'creator' as never })).toThrow();
  });
});

describe('FileCommandSyncStore', () => {
  it('persists and restores the command sync mirror', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'streambridge-command-sync-'));
    const path = join(directory, 'command-sync.json');
    const store = new FileCommandSyncStore(path, silentLogger, 0);
    const state = { version: 1 as const, commands: [syncedCommand()] };
    store.scheduleSave(state);
    await store.flush();
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(state);
    await expect(store.load()).resolves.toEqual(state);
  });

  it('starts with an empty mirror rather than crashing when no file exists yet', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'streambridge-command-sync-missing-'));
    const store = new FileCommandSyncStore(join(directory, 'missing.json'), silentLogger, 0);
    await expect(store.load()).resolves.toEqual({ version: 1, commands: [] });
    expect(store.status()).toMatchObject({ enabled: true });
  });

  it('degrades to an empty mirror on corrupted state instead of throwing, and reports the error', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'streambridge-command-sync-corrupt-'));
    const path = join(directory, 'command-sync.json');
    await mkdir(directory, { recursive: true });
    await writeFile(path, '{ not valid json');
    const store = new FileCommandSyncStore(path, silentLogger, 0);
    await expect(store.load()).resolves.toEqual({ version: 1, commands: [] });
    expect(store.status()).toMatchObject({ enabled: true, lastError: expect.any(String) as string });
  });

  it('rejects state that fails schema validation rather than trusting a malformed file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'streambridge-command-sync-invalid-'));
    const path = join(directory, 'command-sync.json');
    await writeFile(path, JSON.stringify({ version: 1, commands: [{ streamerBotId: 'x' }] }));
    const store = new FileCommandSyncStore(path, silentLogger, 0);
    await expect(store.load()).resolves.toEqual({ version: 1, commands: [] });
    expect(store.status()['lastError']).toContain('Command sync state is invalid');
  });
});

describe('reconcileCommandSync', () => {
  it('marks a tracked command in-sync when its id and name both still match', () => {
    const previous = [syncedCommand({ streamerBotId: 'sb-1', name: 'shoutout' })];
    const result = reconcileCommandSync(previous, [{ id: 'sb-1', name: 'shoutout' }], '2026-07-19T00:00:00.000Z');
    expect(result).toEqual([{ ...previous[0], driftStatus: 'in-sync', lastSeenAt: '2026-07-19T00:00:00.000Z' }]);
  });

  it('follows a rename by id, not by name, and updates the mirrored name', () => {
    const previous = [syncedCommand({ streamerBotId: 'sb-1', name: 'shoutout' })];
    const result = reconcileCommandSync(previous, [{ id: 'sb-1', name: 'so-renamed' }], '2026-07-19T00:00:00.000Z');
    expect(result).toEqual([{ ...previous[0], name: 'so-renamed', driftStatus: 'renamed', lastSeenAt: '2026-07-19T00:00:00.000Z' }]);
  });

  it('marks a tracked command missing when its id disappears, without dropping the entry or bumping lastSeenAt', () => {
    const previous = [syncedCommand({ streamerBotId: 'sb-1', lastSeenAt: '2026-07-18T00:00:00.000Z' })];
    const result = reconcileCommandSync(previous, [], '2026-07-19T00:00:00.000Z');
    expect(result).toEqual([{ ...previous[0], driftStatus: 'missing', lastSeenAt: '2026-07-18T00:00:00.000Z' }]);
  });

  it('never adds an entry for a live command the mirror was not already tracking', () => {
    const result = reconcileCommandSync([], [{ id: 'sb-unrelated', name: 'creator-command' }], '2026-07-19T00:00:00.000Z');
    expect(result).toEqual([]);
  });
});

describe('NoopCommandSyncStore', () => {
  it('never persists and always reports disabled', async () => {
    const store = new NoopCommandSyncStore();
    await expect(store.load()).resolves.toEqual({ version: 1, commands: [] });
    store.scheduleSave();
    await store.flush();
    expect(store.status()).toEqual({ enabled: false });
  });
});
