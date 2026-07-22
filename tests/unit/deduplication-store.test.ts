import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileDeduplicationStore } from '../../bridge/services/deduplication-store.js';
import { silentLogger } from '../helpers.js';

describe('FileDeduplicationStore', () => {
  it('persists and restores bounded deduplication entries', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'streambridge-dedup-'));
    const path = join(directory, 'dedup.json');
    const store = new FileDeduplicationStore(path, silentLogger, 0);
    const entries = [{ identity: 'event-one', expiresAt: Date.now() + 10_000 }];
    store.scheduleSave(entries);
    await store.flush();
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(entries);
    await expect(store.load()).resolves.toEqual(entries);
  });

  it('fails startup closed when persisted state is corrupted', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'streambridge-dedup-corrupt-'));
    const path = join(directory, 'dedup.json');
    await writeFile(path, '{not-json', 'utf8');
    const store = new FileDeduplicationStore(path, silentLogger, 0);
    await expect(store.load()).rejects.toThrow();
    const status = store.status();
    expect(status['enabled']).toBe(true);
    expect(typeof status['lastError']).toBe('string');
  });
});
