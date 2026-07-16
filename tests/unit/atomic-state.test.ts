import { mkdir, mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeJsonAtomic } from '../../bridge/services/atomic-state.js';

describe('writeJsonAtomic', () => {
  it('removes its temporary file when rename fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'streambridge-atomic-'));
    const target = join(directory, 'target');
    await mkdir(target);
    await expect(writeJsonAtomic(target, { value: true })).rejects.toThrow();
    expect((await readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});
