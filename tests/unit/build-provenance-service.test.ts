import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readBuildProvenance } from '../../bridge/services/build-provenance-service.js';
import { STREAMBRIDGE_VERSION } from '../../bridge/version.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('readBuildProvenance', () => {
  it('accepts only a matching installed release record with a valid build fingerprint', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-build-proof-')); roots.push(root); await mkdir(join(root, 'runtime'));
    await writeFile(join(root, 'runtime', 'install-manifest.json'), JSON.stringify({ product: 'THSV StreamBridge', activeVersion: STREAMBRIDGE_VERSION, buildFingerprint: 'a'.repeat(64), releaseManifestSha256: 'b'.repeat(64), fileCount: 2532, installedAt: '2026-08-21T00:00:00.000Z' }));
    await expect(readBuildProvenance(root)).resolves.toMatchObject({ version: STREAMBRIDGE_VERSION, installation: 'verified-portable-release', buildFingerprint: 'a'.repeat(64), releaseManifestSha256: 'b'.repeat(64), fileCount: 2532 });
  });
});
