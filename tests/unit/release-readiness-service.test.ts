import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReleaseReadinessService } from '../../bridge/services/release-readiness-service.js';

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('ReleaseReadinessService', () => {
  it('combines lifecycle evidence with public PR checks without repository mutation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-release-readiness-')); roots.push(root); const evidence = join(root, 'latest.json'); const published = join(root, 'published.json'); const cache = join(root, 'cache.json');
    await writeFile(evidence, JSON.stringify({ currentTag: 'v4.0.3', previousTag: 'v4.0.2', previousChecksumVerified: true, previousProvenanceVerified: true, creatorDataPreserved: true, encryptedRecoveryBundleVerified: true, recoveryFreshProfileRestored: true }), 'utf8');
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ number: 9, title: 'Prepare StreamBridge 4.0.3', html_url: 'https://github.test/pr/9', head: { ref: 'codex/release-4.0.3-seamless', sha: 'abc' } }])))
      .mockResolvedValueOnce(new Response(JSON.stringify({ workflow_runs: [{ id: 91, name: 'Post-release smoke', display_title: 'v4.0.3 published', head_branch: 'v4.0.3', html_url: 'https://github.test/actions/91', artifacts_url: 'https://api.github.test/actions/91/artifacts', status: 'completed', conclusion: 'success', created_at: '2026-08-21T12:00:00Z', updated_at: '2026-08-21T12:05:00Z' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'main', protected: true, commit: { sha: 'abc' } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ enabled: true, enforced_by_owner: false })))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 7, name: 'Protect main', target: 'branch', enforcement: 'active', _links: { html: { href: 'https://github.test/rules/7' } } }])))
      .mockResolvedValueOnce(new Response(JSON.stringify({ check_runs: [{ name: 'windows', status: 'completed', conclusion: 'success', details_url: 'https://github.test/check/1' }] })));
    const service = new ReleaseReadinessService('4.0.3', evidence, published, cache, 'surakage/THSV-StreamBridge', fetcher);
    expect(await service.status(false)).toMatchObject({ summary: { lifecycleReady: true, checksGreen: false } });
    const refreshed = await service.status(true);
    expect(refreshed).toMatchObject({ pullRequest: { available: true, number: 9, sha: 'abc' }, repositoryProtection: { mainProtected: true, immutableReleases: true, activeRulesetCount: 1 }, releaseHandoff: { tag: 'v4.0.3', expectedMainSha: 'abc', exactMainReady: true }, postReleaseSmoke: { available: true, conclusion: 'success', evidenceUrl: 'https://github.test/actions/91#artifacts' }, summary: { lifecycleReady: true, checksGreen: true, postReleaseVerified: true, repositoryProtectionsReady: true, readyForCreatorReview: true } });
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(JSON.stringify(refreshed)).not.toContain('token');
    const offline = new ReleaseReadinessService('4.0.3', evidence, published, cache, 'surakage/THSV-StreamBridge', vi.fn<typeof fetch>());
    await expect(offline.status(false)).resolves.toMatchObject({ githubStatusSource: 'cache', usingCachedGitHubStatus: true, pullRequest: { number: 9 }, summary: { checksGreen: true } });
    const unavailable = new ReleaseReadinessService('4.0.3', evidence, published, cache, 'surakage/THSV-StreamBridge', vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 })));
    const cachedAfterFailure = await unavailable.status(true);
    expect(cachedAfterFailure).toMatchObject({ githubStatusSource: 'cache', usingCachedGitHubStatus: true, pullRequest: { number: 9 }, summary: { checksGreen: true } });
    expect(cachedAfterFailure.error).toContain('showing the last successful result');
  });

  it('prefers current local post-release evidence with rollback protection', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-release-published-')); roots.push(root); const lifecycle = join(root, 'lifecycle.json'); const published = join(root, 'published.json'); const cache = join(root, 'cache.json');
    await writeFile(published, JSON.stringify({ tag: 'v4.0.3', previousTag: 'v4.0.2', cleanInstall: '4.0.3', reinstall: '4.0.3', rollbackProtectionVerified: true, creatorDataPreserved: true }), 'utf8');
    const service = new ReleaseReadinessService('4.0.3', lifecycle, published, cache, 'surakage/THSV-StreamBridge', vi.fn<typeof fetch>());
    await expect(service.status(false)).resolves.toMatchObject({ postReleaseSmoke: { available: true, source: 'local-evidence', reinstall: '4.0.3' }, summary: { postReleaseVerified: true } });
  });
});
