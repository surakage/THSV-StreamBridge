import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

interface ImportIndex {
  readonly schemaVersion: number;
  readonly bridgeVersion: string;
  readonly packages: readonly {
    readonly folder: string;
    readonly kind: 'core' | 'extension' | 'addon';
    readonly manifestSha256: string;
    readonly imports: readonly { readonly filename: string; readonly size: number; readonly sha256: string }[];
  }[];
}

describe('Streamer.bot import index', () => {
  it('covers every canonical package with current hashes', async () => {
    const index = JSON.parse(await readFile('packages/streamerbot/import-index.json', 'utf8')) as ImportIndex;
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as { version: string };
    expect(index.schemaVersion).toBe(1);
    expect(index.bridgeVersion).toBe(packageJson.version);
    expect(index.packages.length).toBeGreaterThan(35);
    expect(new Set(index.packages.map((entry) => entry.folder)).size).toBe(index.packages.length);
    expect(index.packages.some((entry) => entry.kind === 'extension')).toBe(true);
    expect(index.packages.some((entry) => entry.kind === 'addon')).toBe(true);
    for (const entry of index.packages) {
      const root = `packages/streamerbot/${entry.folder}`;
      const manifest = await readFile(`${root}/manifest.json`);
      expect(entry.manifestSha256).toBe(createHash('sha256').update(manifest).digest('hex'));
      expect(entry.imports).toHaveLength(1);
      const bytes = await readFile(`${root}/${entry.imports[0]?.filename ?? ''}`);
      expect(entry.imports[0]).toMatchObject({ size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  });
});
