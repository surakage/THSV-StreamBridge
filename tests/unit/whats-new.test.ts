import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { whatsNew } from '../../bridge/services/whats-new.js';
import { STREAMBRIDGE_VERSION } from '../../bridge/version.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe("What's new", () => {
  it('reads one version of the changelog as plain sentences', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-whats-new-')); roots.push(root);
    const path = join(root, 'CHANGELOG.md');
    await writeFile(path, '# Changelog\n\n## [2.0.0] - 2026-11-13\n\n- Added: A **bold** idea with `code` and a [link](https://example.com).\n- Fixed: A bug.\n\n## [1.0.0] - 2026-11-01\n\n- Changed: Older.\n', 'utf8');
    await expect(whatsNew('2.0.0', path)).resolves.toEqual({ version: '2.0.0', items: ['A bold idea with code and a link.', 'A bug.'] });
    await expect(whatsNew('3.0.0', path)).resolves.toEqual({ version: '3.0.0', items: [] });
    await expect(whatsNew('2.0.0', join(root, 'missing.md'))).resolves.toEqual({ version: '2.0.0', items: [] });
  });

  it('finds the current version in the real changelog', async () => {
    expect((await whatsNew(STREAMBRIDGE_VERSION)).items.length).toBeGreaterThan(0);
  });
});
