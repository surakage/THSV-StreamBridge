import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('add-on setup documentation', () => {
  it('ships one complete setup guide for every first-party add-on', async () => {
    const folders = (await readdir(join(root, 'addons'), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    const guides = (await readdir(join(root, 'docs', 'addons'))).filter((name) => name.endsWith('.md') && name !== 'README.md').map((name) => name.replace(/\.md$/u, '')).sort();
    expect(guides).toEqual(folders);
    for (const folder of folders) {
      const guide = await readFile(join(root, 'docs', 'addons', `${folder}.md`), 'utf8');
      expect(guide).toContain('## Install');
      expect(guide).toContain('## Streamer.bot');
      expect(guide).toContain('## Offline test');
      expect(guide).toContain('## Data and permissions');
    }
  });

  it('links every guide from the add-on index and exposes setup in the wizard', async () => {
    const [index, client] = await Promise.all([
      readFile(join(root, 'docs', 'addons', 'README.md'), 'utf8'),
      readFile(join(root, 'wizard', 'browser', 'addons.js'), 'utf8'),
    ]);
    const folders = (await readdir(join(root, 'addons'), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    for (const folder of folders) expect(index).toContain(`./${folder}.md`);
    expect(client).toContain('Start here');
    expect(client).toContain('Open full setup guide');
  });
});
