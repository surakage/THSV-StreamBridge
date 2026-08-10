import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const productionRoots = ['wizard', 'overlays', 'addons', 'packages', 'bridge', 'config', 'apps', 'launcher', 'scripts', 'docs'];
const textExtensions = new Set(['.ts', '.js', '.json', '.md', '.css', '.html', '.mjs', '.cs', '.ps1', '.cmd']);
const intentionallyEncodedPaths = new Set(['addons/clip-courier/migrations/001-current-stream-only.mjs']);
const mojibakePattern = /[ÃÂ�]|â(?:€|€™|€“|€”|€¢)|ðŸ/u;

async function productionTextFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry): Promise<string[]> => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return productionTextFiles(path);
    if (entry.isFile() && textExtensions.has(extname(entry.name).toLowerCase())) return [path];
    return [];
  }));
  return files.flat();
}

describe('production text encoding', () => {
  it('contains no common UTF-8 mojibake or replacement characters', async () => {
    const files = (await Promise.all(productionRoots.map(productionTextFiles))).flat();
    const failures = (await Promise.all(files.map(async (file): Promise<string | null> => {
        const normalized = relative('.', file).replaceAll('\\', '/');
        if (intentionallyEncodedPaths.has(normalized)) return null;
        return mojibakePattern.test(await readFile(file, 'utf8')) ? normalized : null;
      }))).filter((failure): failure is string => failure !== null);
    expect(failures).toEqual([]);
  });
});
