import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReleaseReadinessService } from '../../bridge/services/release-readiness-service.js';

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('ReleaseReadinessService', () => {
  it('combines lifecycle evidence with public PR checks without repository mutation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-release-readiness-')); roots.push(root); const evidence = join(root, 'latest.json');
    await writeFile(evidence, JSON.stringify({ currentTag: 'v4.0.3', previousTag: 'v4.0.2', previousChecksumVerified: true, previousProvenanceVerified: true, creatorDataPreserved: true }), 'utf8');
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ number: 9, title: 'Prepare StreamBridge 4.0.3', html_url: 'https://github.test/pr/9', head: { ref: 'codex/release-4.0.3-seamless', sha: 'abc' } }])))
      .mockResolvedValueOnce(new Response(JSON.stringify({ check_runs: [{ name: 'windows', status: 'completed', conclusion: 'success', details_url: 'https://github.test/check/1' }] })));
    const service = new ReleaseReadinessService('4.0.3', evidence, 'surakage/THSV-StreamBridge', fetcher);
    expect(await service.status(false)).toMatchObject({ summary: { lifecycleReady: true, checksGreen: false } });
    const refreshed = await service.status(true);
    expect(refreshed).toMatchObject({ pullRequest: { available: true, number: 9 }, summary: { lifecycleReady: true, checksGreen: true, readyForCreatorReview: true } });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(refreshed)).not.toContain('token');
  });
});
