import { mkdtemp, readFile, readdir, writeFile, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as FsPromises from 'node:fs/promises';
import { writeJsonAtomic } from '../../bridge/services/atomic-state.js';

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof FsPromises>();
  return { ...actual, rename: vi.fn(actual.rename) };
});
beforeEach(async () => {
  const actual = await vi.importActual<typeof FsPromises>('node:fs/promises');
  vi.mocked(rename).mockReset().mockImplementation(actual.rename);
});
describe('atomic state replacement under file locks', () => {
  it('retries temporary Windows locks and commits the new state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thsv-state-lock-'));
    const target = join(directory, 'state.json');
    await writeFile(target, '{"old":true}');
    vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('locked'), { code: 'EPERM' }))
      .mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'EBUSY' }));
    await writeJsonAtomic(target, { updated: true });
    expect(JSON.parse(await readFile(target, 'utf8'))).toEqual({ updated: true });
    expect(rename).toHaveBeenCalledTimes(3);
    expect(await readdir(directory)).toEqual(['state.json']);
  });
  it('bounds persistent locks while preserving committed state and cleaning the temporary file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thsv-state-lock-'));
    const target = join(directory, 'state.json');
    await writeFile(target, '{"old":true}');
    vi.mocked(rename).mockRejectedValue(Object.assign(new Error('locked'), { code: 'EPERM' }));
    await expect(writeJsonAtomic(target, { updated: true })).rejects.toThrow('locked');
    expect(rename).toHaveBeenCalledTimes(6);
    expect(JSON.parse(await readFile(target, 'utf8'))).toEqual({ old: true });
    expect(await readdir(directory)).toEqual(['state.json']);
  });
  it('does not retry unrelated filesystem errors', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thsv-state-lock-'));
    vi.mocked(rename).mockRejectedValue(Object.assign(new Error('bad path'), { code: 'ENOTDIR' }));
    await expect(writeJsonAtomic(join(directory, 'state.json'), {})).rejects.toThrow('bad path');
    expect(rename).toHaveBeenCalledTimes(1);
    expect(await readdir(directory)).toEqual([]);
  });
});
