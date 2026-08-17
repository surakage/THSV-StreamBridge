import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('add-on setup documentation', () => {
  it('ships one complete setup guide for every first-party add-on', async () => {
    const folders = (await readdir(join(root, 'addons'), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    const guides = (await readdir(join(root, 'docs', 'addons'))).filter((name) => name.endsWith('.md') && name !== 'README.md').map((name) => name.replace(/\.md$/u, '')).sort();
    expect(guides).toEqual(folders);
    for (const folder of folders) {
      const guide = await readFile(join(root, 'docs', 'addons', `${folder}.md`), 'utf8');
      expect(guide).toMatch(/## (?:Install|Built-in setup)/u);
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
    expect(client).toContain('Before you begin');
    expect(client).toContain('Open full setup guide');
  });

  it('links every recommended wizard action to a generated Streamer.bot package action', async () => {
    const client = await readFile(join(root, 'wizard', 'browser', 'addons.js'), 'utf8');
    const source = client.match(/const RECOMMENDED_ADDON_ACTION_NAMES = (\{[\s\S]*?\n\});/u)?.[1];
    if (source === undefined) throw new Error('Wizard action recommendation map was not found.');
    const recommendations = runInNewContext(`(${source})`, {}) as Record<string, string[]>;
    const packageFolders = (await readdir(join(root, 'packages', 'streamerbot'), { withFileTypes: true })).filter((entry) => entry.isDirectory());
    const availableNames = new Set<string>();
    for (const folder of packageFolders) {
      try {
        const manifest = JSON.parse(await readFile(join(root, 'packages', 'streamerbot', folder.name, 'manifest.json'), 'utf8')) as { action?: { name: string }; actions?: Array<{ name: string }> };
        for (const action of manifest.actions ?? (manifest.action ? [manifest.action] : [])) availableNames.add(action.name);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    for (const [moduleId, names] of Object.entries(recommendations)) {
      expect(names.length, `${moduleId} must recommend at least one action`).toBeGreaterThan(0);
      for (const name of names) expect(availableNames.has(name), `${moduleId} recommends missing action ${name}`).toBe(true);
    }
  });
});
