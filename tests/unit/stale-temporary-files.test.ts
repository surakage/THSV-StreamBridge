import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { removeStaleTemporaryFiles } from '../../bridge/services/stale-temporary-files.js';

describe('removeStaleTemporaryFiles', () => {
  let root: string | undefined;
  afterEach(async () => { if (root !== undefined) await rm(root, { recursive: true, force: true }); });

  it('removes only old .tmp files and leaves logs and real files alone', async () => {
    root = await mkdtemp(join(tmpdir(), 'thsv-stale-tmp-'));
    await mkdir(join(root, 'state', 'nested'), { recursive: true });
    await mkdir(join(root, 'logs'), { recursive: true });
    const old = new Date(Date.now() - 3 * 60 * 60 * 1_000);
    const files = { oldTmp: join(root, 'state', 'a.json.123.tmp'), nestedTmp: join(root, 'state', 'nested', 'b.json.tmp'), freshTmp: join(root, 'state', 'c.json.tmp'), real: join(root, 'state', 'a.json'), logTmp: join(root, 'logs', 'd.tmp') };
    for (const path of Object.values(files)) await writeFile(path, '{}', 'utf8');
    for (const path of [files.oldTmp, files.nestedTmp, files.real, files.logTmp]) await utimes(path, old, old);
    const removed = await removeStaleTemporaryFiles([root, root, join(root, 'missing')]);
    expect(removed.sort()).toEqual([files.oldTmp, files.nestedTmp].sort());
    expect((await readdir(join(root, 'state'))).sort()).toEqual(['a.json', 'c.json.tmp', 'nested']);
    expect(await readdir(join(root, 'logs'))).toEqual(['d.tmp']);
  });
});
