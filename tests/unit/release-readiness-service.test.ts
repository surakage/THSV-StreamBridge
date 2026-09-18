import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
      .mockResolvedValueOnce(new Response(JSON.stringify([{ number: 9, title: 'Prepare StreamBridge 4.0.3', body: 'Promotion evidence attestation: https://github.com/surakage/THSV-StreamBridge/attestations/12345', html_url: 'https://github.test/pr/9', head: { ref: 'codex/release-4.0.3-seamless', sha: 'abc' } }])))
      .mockResolvedValueOnce(new Response(JSON.stringify({ workflow_runs: [
        { id: 91, name: 'Post-release smoke', display_title: 'v4.0.3 published', head_branch: 'v4.0.3', html_url: 'https://github.test/actions/91', artifacts_url: 'https://api.github.test/actions/91/artifacts', status: 'completed', conclusion: 'success', created_at: '2026-08-21T12:00:00Z', updated_at: '2026-08-21T12:05:00Z' },
      ] }), { headers: { 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '4987', 'x-ratelimit-used': '13', 'x-ratelimit-reset': '1900000000' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'main', protected: true, commit: { sha: 'abc' } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ enabled: true, enforced_by_owner: false })))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 7, name: 'Protect main', target: 'branch', enforcement: 'active', _links: { html: { href: 'https://github.test/rules/7' } } }])))
      .mockResolvedValueOnce(new Response(JSON.stringify({ workflow_runs: [] })))
      .mockResolvedValueOnce(canaryResponse('Public release attestation canary', 100))
      .mockResolvedValueOnce(canaryResponse('Dependency update canary', 101))
      .mockResolvedValueOnce(canaryResponse('Portable runtime cache canary', 102))
      .mockResolvedValueOnce(canaryResponse('TypeScript and Node types next-major canary', 103))
      .mockResolvedValueOnce(new Response(JSON.stringify({ check_runs: [{ name: 'windows', status: 'completed', conclusion: 'success', details_url: 'https://github.test/check/1' }] })));
    const service = new ReleaseReadinessService('4.0.3', evidence, published, cache, 'surakage/THSV-StreamBridge', fetcher);
    expect(await service.status(false)).toMatchObject({ summary: { lifecycleReady: true, checksGreen: false, canariesFresh: false } });
    const refreshed = await service.status(true);
    expect(refreshed).toMatchObject({ pullRequest: { available: true, number: 9, sha: 'abc', promotionAttestationUrl: 'https://github.com/surakage/THSV-StreamBridge/attestations/12345' }, repositoryProtection: { mainProtected: true, immutableReleases: true, activeRulesetCount: 1 }, releaseHandoff: { tag: 'v4.0.3', expectedMainSha: 'abc', exactMainReady: true }, postReleaseSmoke: { available: true, conclusion: 'success', evidenceUrl: 'https://github.test/actions/91#artifacts' }, summary: { lifecycleReady: true, checksGreen: true, canariesFresh: true, postReleaseVerified: true, repositoryProtectionsReady: true, readyForCreatorReview: true } });
    expect(refreshed.canaries).toHaveLength(4);
    expect(refreshed.githubApi).toMatchObject({ source: 'live', cacheAgeMinutes: 0, limit: 5000, remaining: 4987, used: 13, rateLimitAvailable: true });
    expect(fetcher).toHaveBeenCalledTimes(11);
    for (const workflow of ['public-attestation-canary.yml', 'dependency-canary.yml', 'runtime-cache-canary.yml', 'toolchain-major-canary.yml']) expect(fetcher.mock.calls.some(([url]) => (typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).includes(`/actions/workflows/${workflow}/runs?per_page=20`))).toBe(true);
    expect(JSON.stringify(refreshed)).not.toContain('token');
    const offline = new ReleaseReadinessService('4.0.3', evidence, published, cache, 'surakage/THSV-StreamBridge', vi.fn<typeof fetch>());
    await expect(offline.status(false)).resolves.toMatchObject({ githubStatusSource: 'cache', usingCachedGitHubStatus: true, githubApi: { source: 'cache', rateLimitAvailable: true }, pullRequest: { number: 9 }, summary: { checksGreen: true, canariesFresh: true } });
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

  it('keeps creator review blocked when the newest canary failed despite a recent earlier success', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-release-canaries-')); roots.push(root);
    const now = new Date().toISOString();
    const recentSuccess = new Date(Date.now() - 60 * 60_000).toISOString();
    const publicRuns = [canaryRun('Public release attestation canary', 199, 'failure', now), canaryRun('Public release attestation canary', 198, 'success', recentSuccess)];
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('[]'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ workflow_runs: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'main', protected: true, commit: { sha: 'abc' } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ enabled: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1, name: 'Protect main', target: 'branch', enforcement: 'active' }])))
      .mockResolvedValueOnce(new Response(JSON.stringify({ workflow_runs: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ workflow_runs: publicRuns })))
      .mockResolvedValueOnce(canaryResponse('Dependency update canary', 201))
      .mockResolvedValueOnce(canaryResponse('Portable runtime cache canary', 202))
      .mockResolvedValueOnce(canaryResponse('TypeScript and Node types next-major canary', 203));
    const service = new ReleaseReadinessService('4.0.9', join(root, 'lifecycle.json'), join(root, 'published.json'), join(root, 'cache.json'), 'surakage/THSV-StreamBridge', fetcher);
    const result = await service.status(true) as { canaries: Array<Record<string, unknown>>; summary: Record<string, unknown> };
    expect(result.canaries[0]).toMatchObject({ name: 'Public release attestation canary', latestConclusion: 'failure', fresh: true, incident: { state: 'active', failureCount: 1 }, recentRuns: [{ id: 199, conclusion: 'failure' }, { id: 198, conclusion: 'success' }] });
    expect(result.summary).toMatchObject({ canariesFresh: false, readyForCreatorReview: false });
  });

  it('reports the duration and recovery run for a resolved canary incident', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-release-recovery-')); roots.push(root);
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('[]'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ workflow_runs: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'main', protected: true, commit: { sha: 'abc' } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ enabled: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1, name: 'Protect main', target: 'branch', enforcement: 'active' }])))
      .mockResolvedValueOnce(new Response(JSON.stringify({ workflow_runs: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ workflow_runs: [
        canaryRun('Public release attestation canary', 303, 'success', '2026-08-28T06:00:00.000Z'),
        canaryRun('Public release attestation canary', 302, 'failure', '2026-08-28T04:00:00.000Z'),
        canaryRun('Public release attestation canary', 301, 'failure', '2026-08-28T03:00:00.000Z'),
      ] })))
      .mockResolvedValueOnce(canaryResponse('Dependency update canary', 304))
      .mockResolvedValueOnce(canaryResponse('Portable runtime cache canary', 305))
      .mockResolvedValueOnce(canaryResponse('TypeScript and Node types next-major canary', 306));
    const service = new ReleaseReadinessService('4.0.9', join(root, 'lifecycle.json'), join(root, 'published.json'), join(root, 'cache.json'), 'surakage/THSV-StreamBridge', fetcher);
    const result = await service.status(true) as { canaries: Array<Record<string, unknown>> };
    expect(result.canaries[0]).toMatchObject({ latestConclusion: 'success', incident: { state: 'recovered', failureCount: 2, startedAt: '2026-08-28T03:00:00.000Z', recoveredAt: '2026-08-28T06:00:00.000Z', durationHours: 3 } });
  });

  it('surfaces certificate-preflight age and expiry state without exposing certificate identity', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-release-signing-')); roots.push(root); const updatedAt = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith('/pulls?state=open&per_page=30')) return new Response('[]');
      if (url.endsWith('/actions/runs?per_page=100')) return new Response(JSON.stringify({ workflow_runs: [] }));
      if (url.endsWith('/branches/main')) return new Response(JSON.stringify({ name: 'main', protected: true, commit: { sha: 'abc' } }));
      if (url.endsWith('/immutable-releases')) return new Response(JSON.stringify({ enabled: true }));
      if (url.includes('/rulesets?')) return new Response(JSON.stringify([{ id: 1, name: 'Protect main', target: 'branch', enforcement: 'active' }]));
      if (url.includes('windows-signing-certificate-preflight.yml')) return new Response(JSON.stringify({ workflow_runs: [{ ...canaryRun('Windows signing certificate preflight', 400, 'success', updatedAt), artifacts_url: 'https://api.github.test/actions/400/artifacts' }] }));
      if (url.endsWith('/actions/400/artifacts')) return new Response(JSON.stringify({ artifacts: [{ id: 401, name: 'windows-signing-preflight-warning-45-400', expired: false, digest: `sha256:${'d'.repeat(64)}` }] }));
      if (url.includes('/actions/workflows/')) return new Response(JSON.stringify({ workflow_runs: [] }));
      return new Response('{}', { status: 404 });
    });
    const service = new ReleaseReadinessService('4.0.9', join(root, 'lifecycle.json'), join(root, 'published.json'), join(root, 'cache.json'), 'surakage/THSV-StreamBridge', fetcher);
    const result = await service.status(true);
    expect(result).toMatchObject({ signingCertificatePreflight: { available: true, fresh: true, expiryState: 'warning', daysRemaining: 45, ageHours: 2, evidenceAvailable: true } });
    expect(JSON.stringify(result)).not.toMatch(/thumbprint|subject/iu);
  });

  it('treats a fresh intentional unsigned-mode preflight as ready', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-release-unsigned-')); roots.push(root); const updatedAt = new Date(Date.now() - 3_600_000).toISOString();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith('/pulls?state=open&per_page=30')) return new Response('[]');
      if (url.endsWith('/actions/runs?per_page=100')) return new Response(JSON.stringify({ workflow_runs: [] }));
      if (url.endsWith('/branches/main')) return new Response(JSON.stringify({ name: 'main', protected: true, commit: { sha: 'abc' } }));
      if (url.endsWith('/immutable-releases')) return new Response(JSON.stringify({ enabled: true }));
      if (url.includes('/rulesets?')) return new Response(JSON.stringify([]));
      if (url.includes('windows-signing-certificate-preflight.yml')) return new Response(JSON.stringify({ workflow_runs: [{ ...canaryRun('Windows signing certificate preflight', 410, 'success', updatedAt), artifacts_url: 'https://api.github.test/actions/410/artifacts' }] }));
      if (url.endsWith('/actions/410/artifacts')) return new Response(JSON.stringify({ artifacts: [{ id: 411, name: 'windows-signing-preflight-unsigned-0-410', expired: false, digest: `sha256:${'e'.repeat(64)}` }] }));
      if (url.includes('/actions/workflows/')) return new Response(JSON.stringify({ workflow_runs: [] }));
      return new Response('{}', { status: 404 });
    });
    const service = new ReleaseReadinessService('4.0.9', join(root, 'lifecycle.json'), join(root, 'published.json'), join(root, 'cache.json'), 'surakage/THSV-StreamBridge', fetcher);
    const result = await service.status(true);
    expect(result).toMatchObject({ signingCertificatePreflight: { available: true, fresh: true, signingMode: 'unsigned', expiryState: 'not-applicable', evidenceAvailable: true } });
    expect(JSON.stringify(result)).toContain('intentionally disabled');
  });

  it('recalculates cached canary age instead of trusting a stale fresh flag', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-release-cache-age-')); roots.push(root); const cache = join(root, 'cache.json');
    const canaries = ['Public release attestation canary', 'Dependency update canary', 'Portable runtime cache canary', 'TypeScript and Node types next-major canary'].map((name) => ({ name, latestConclusion: 'success', lastSuccessAt: '2020-01-01T00:00:00.000Z', maximumAgeHours: 240, ageHours: 0, fresh: true }));
    await writeFile(cache, JSON.stringify({ schemaVersion: 1, version: '4.0.9', remote: { checkedAt: '2020-01-01T00:00:00.000Z', checks: [], canaries } }));
    const service = new ReleaseReadinessService('4.0.9', join(root, 'lifecycle.json'), join(root, 'published.json'), cache, 'surakage/THSV-StreamBridge', vi.fn<typeof fetch>());
    const result = await service.status(false) as { githubStatusSource: string; summary: Record<string, unknown>; canaries: Array<Record<string, unknown>> };
    expect(result).toMatchObject({ githubStatusSource: 'cache', summary: { canariesFresh: false, readyForCreatorReview: false } });
    expect(result.canaries[0]?.['fresh']).toBe(false);
  });

  it('reuses persisted ETag bodies on 304 responses and reports conditional cache hits', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-release-etag-')); roots.push(root); const cache = join(root, 'cache.json'); const repository = 'surakage/THSV-StreamBridge';
    const urls = [
      `https://api.github.com/repos/${repository}/pulls?state=open&per_page=30`,
      `https://api.github.com/repos/${repository}/actions/runs?per_page=100`,
      `https://api.github.com/repos/${repository}/branches/main`,
      `https://api.github.com/repos/${repository}/immutable-releases`,
      `https://api.github.com/repos/${repository}/rulesets?targets=branch,tag`,
      `https://api.github.com/repos/${repository}/actions/workflows/windows-signing-certificate-preflight.yml/runs?per_page=20`,
      ...['public-attestation-canary.yml', 'dependency-canary.yml', 'runtime-cache-canary.yml', 'toolchain-major-canary.yml'].map((workflow) => `https://api.github.com/repos/${repository}/actions/workflows/${workflow}/runs?per_page=20`),
    ];
    const bodies: unknown[] = [[], { workflow_runs: [] }, { name: 'main', protected: true, commit: { sha: 'abc' } }, { enabled: true }, [{ id: 1, name: 'Protect main', target: 'branch', enforcement: 'active' }], { workflow_runs: [] }, ...Array.from({ length: 4 }, () => ({ workflow_runs: [] }))];
    const httpCache = Object.fromEntries(urls.map((url, index) => [url, { etag: `"etag-${String(index)}"`, body: bodies[index] }]));
    await writeFile(cache, JSON.stringify({ schemaVersion: 2, version: '4.0.9', remote: { checkedAt: new Date().toISOString(), checks: [] }, httpCache }));
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
      expect(new Headers(options?.headers).get('if-none-match')).toMatch(/^"etag-\d+"$/u);
      return new Response(null, { status: 304, headers: { 'x-ratelimit-limit': '60', 'x-ratelimit-remaining': '51' } });
    });
    const service = new ReleaseReadinessService('4.0.9', join(root, 'lifecycle.json'), join(root, 'published.json'), cache, repository, fetcher);
    await expect(service.status(true)).resolves.toMatchObject({ githubStatusSource: 'live', githubApi: { conditionalCacheHits: 10, remaining: 51 } });
    expect(fetcher).toHaveBeenCalledTimes(10);
  });

  it('honors a persisted GitHub rate-limit backoff without making another request', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-release-backoff-')); roots.push(root); const cache = join(root, 'cache.json'); const backoffUntil = new Date(Date.now() + 30 * 60_000).toISOString();
    await writeFile(cache, JSON.stringify({ schemaVersion: 2, version: '4.0.9', remote: { checkedAt: new Date().toISOString(), checks: [] }, httpCache: {}, backoffUntil }));
    const fetcher = vi.fn<typeof fetch>();
    const service = new ReleaseReadinessService('4.0.9', join(root, 'lifecycle.json'), join(root, 'published.json'), cache, 'surakage/THSV-StreamBridge', fetcher);
    await expect(service.status(true)).resolves.toMatchObject({ githubStatusSource: 'cache', usingCachedGitHubStatus: true, githubApi: { backoffUntil } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('persists a newly received rate-limit backoff for the next Wizard process', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-release-new-backoff-')); roots.push(root); const cache = join(root, 'cache.json');
    const limited = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 429, headers: { 'retry-after': '600', 'x-ratelimit-remaining': '0' } }));
    const service = new ReleaseReadinessService('4.0.9', join(root, 'lifecycle.json'), join(root, 'published.json'), cache, 'surakage/THSV-StreamBridge', limited);
    const limitedResult = await service.status(true);
    expect(limitedResult).toMatchObject({ githubStatusSource: 'unavailable' });
    expect(typeof (limitedResult['githubApi'] as Record<string, unknown>)['backoffUntil']).toBe('string');
    const persistedValue: unknown = JSON.parse(await readFile(cache, 'utf8'));
    if (typeof persistedValue !== 'object' || persistedValue === null || Array.isArray(persistedValue)) throw new Error('Persisted GitHub cache fixture is invalid.');
    const persisted = persistedValue as Record<string, unknown>;
    expect(persisted['schemaVersion']).toBe(2); expect(typeof persisted['backoffUntil']).toBe('string');
    const blockedFetcher = vi.fn<typeof fetch>();
    const restarted = new ReleaseReadinessService('4.0.9', join(root, 'lifecycle.json'), join(root, 'published.json'), cache, 'surakage/THSV-StreamBridge', blockedFetcher);
    await expect(restarted.status(true)).resolves.toMatchObject({ githubStatusSource: 'cache', githubApi: { backoffUntil: persisted['backoffUntil'] } });
    expect(blockedFetcher).not.toHaveBeenCalled();
  });
});

function canaryRun(name: string, id: number, conclusion: string, updatedAt = new Date().toISOString()): Record<string, unknown> {
  return { id, name, display_title: name, head_branch: 'main', html_url: `https://github.test/actions/${String(id)}`, artifacts_url: '', status: 'completed', conclusion, created_at: updatedAt, updated_at: updatedAt };
}

function canaryResponse(name: string, id: number): Response { return new Response(JSON.stringify({ workflow_runs: [canaryRun(name, id, 'success')] })); }
