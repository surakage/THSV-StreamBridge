import { mkdtemp, readFile } from 'node:fs/promises';
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
});
