import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { downloadGitHubArtifact } from '../../scripts/download-github-artifact.mjs';

describe('GitHub artifact digest downloader', () => {
  it('writes an artifact only after its GitHub digest matches', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-artifact-')); const outputPath = join(root, 'evidence.zip'); const bytes = Buffer.from('verified artifact');
    const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    const result = await downloadGitHubArtifact({ repository: 'surakage/THSV-StreamBridge', artifactId: 42, expectedDigest: digest, outputPath, token: 'test', fetcher: async () => new Response(bytes) });
    expect(result).toMatchObject({ artifactId: 42, digest });
    await expect(readFile(outputPath)).resolves.toEqual(bytes);
  });

  it('rejects bytes that do not match the API-provided artifact digest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-artifact-'));
    await expect(downloadGitHubArtifact({ repository: 'surakage/THSV-StreamBridge', artifactId: 42, expectedDigest: `sha256:${'a'.repeat(64)}`, outputPath: join(root, 'bad.zip'), token: 'test', fetcher: async () => new Response('wrong') })).rejects.toThrow('digest mismatch');
  });
});
