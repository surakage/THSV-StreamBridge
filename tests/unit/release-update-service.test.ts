import { beforeEach, describe, expect, it, vi } from 'vitest';
import { manualDispatchResolvesTagCommit, ReleaseUpdateService, verifyGitHubArtifactProvenance } from '../../bridge/services/release-update-service.js';
import { githubApiBlockedUntil, resetGitHubApiRateLimit } from '../../bridge/services/github-release-discovery.js';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function requestUrl(input: string | URL | Request): string {
  return typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
}

function releaseArchive(version = '2.1.0'): Uint8Array {
  return zipSync({
    'release-manifest.json': strToU8(JSON.stringify({ product: 'THSV StreamBridge', layoutVersion: 2, version })),
    'runtime/node.exe': strToU8('runtime'),
    'installer/install.mjs': strToU8('installer'),
    'installer/apply-update.mjs': strToU8('helper'),
  });
}

const SLOTHBLOOM_FEED = 'https://www.slothbloom.com/api/streambridge/releases/latest';
const LATEST_PAGE = 'https://github.com/surakage/THSV-StreamBridge/releases/latest';
const DOWNLOADS = 'https://github.com/surakage/THSV-StreamBridge/releases/download/v2.1.0';
const API_LATEST = 'https://api.github.com/repos/surakage/THSV-StreamBridge/releases/latest';

/** github.com answers without the REST API: a redirect to the tag, a checksum file, and a ranged archive. */
function githubPages(overrides: Record<string, () => Response> = {}): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = requestUrl(input);
    const override = overrides[url];
    if (override !== undefined) return override();
    if (url === SLOTHBLOOM_FEED) return new Response('temporarily unavailable', { status: 503 });
    if (url === LATEST_PAGE) {
      expect(init?.redirect).toBe('manual');
      return new Response(null, { status: 302, headers: { location: 'https://github.com/surakage/THSV-StreamBridge/releases/tag/v2.1.0' } });
    }
    if (url === `${DOWNLOADS}/THSV-StreamBridge-2.1.0.zip.sha256`) return new Response(`${'b'.repeat(64)}  THSV-StreamBridge-2.1.0.zip\n`);
    if (url === `${DOWNLOADS}/THSV-StreamBridge-2.1.0.zip`) {
      expect(new Headers(init?.headers).get('range')).toBe('bytes=0-0');
      return new Response('P', { status: 206, headers: { 'content-range': 'bytes 0-0/37575292' } });
    }
    return new Response('not found', { status: 404 });
  });
}

function rateLimited(resetSeconds: number): Response {
  return new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(resetSeconds) } });
}

describe('ReleaseUpdateService', () => {
  beforeEach(() => { resetGitHubApiRateLimit(); });

  it('reports a newer verified GitHub release and its companion artifacts', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response({
      tag_name: 'v2.1.0', name: 'THSV StreamBridge 2.1.0', html_url: 'https://github.com/surakage/THSV-StreamBridge/releases/tag/v2.1.0',
      body: 'Safer add-on updates.', draft: false, prerelease: false, published_at: '2026-07-19T12:00:00Z',
      assets: [
        { name: 'THSV-StreamBridge-AddOn-thsv.sample-2.1.0.zip', browser_download_url: 'https://github.com/surakage/THSV-StreamBridge/releases/download/v2.1.0/THSV-StreamBridge-AddOn-thsv.sample-2.1.0.zip', size: 1_000 },
        { name: 'THSV-StreamBridge-2.1.0.zip', browser_download_url: 'https://github.com/surakage/THSV-StreamBridge/releases/download/v2.1.0/THSV-StreamBridge-2.1.0.zip', size: 40_000_000 },
        { name: 'THSV-StreamBridge-2.1.0.zip.sha256', browser_download_url: 'https://github.com/surakage/THSV-StreamBridge/releases/download/v2.1.0/THSV-StreamBridge-2.1.0.zip.sha256', size: 100 },
        { name: 'THSV-StreamBridge-v2.1.0.cdx.json', browser_download_url: 'https://github.com/surakage/THSV-StreamBridge/releases/download/v2.1.0/THSV-StreamBridge-v2.1.0.cdx.json', size: 5_000 },
      ],
    }));
    await expect(new ReleaseUpdateService('2.0.0', undefined, request).check()).resolves.toMatchObject({
      available: true, updateAvailable: true, latestVersion: '2.1.0', discoverySource: 'slothbloom',
      archive: { name: 'THSV-StreamBridge-2.1.0.zip' }, checksum: { name: 'THSV-StreamBridge-2.1.0.zip.sha256' },
    });
    expect(request).toHaveBeenCalledOnce();
    const [requestedUrl, requestInit] = request.mock.calls[0] ?? [];
    expect(requestedUrl).toBe('https://www.slothbloom.com/api/streambridge/releases/latest');
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it('falls back to github.com release pages, not the rate-limited API, when the SlothBloom feed is unavailable', async () => {
    const request = githubPages();
    await expect(new ReleaseUpdateService('2.0.0', undefined, request).check()).resolves.toMatchObject({
      available: true, updateAvailable: true, latestVersion: '2.1.0', discoverySource: 'github',
      releaseUrl: 'https://github.com/surakage/THSV-StreamBridge/releases/tag/v2.1.0',
      archive: { name: 'THSV-StreamBridge-2.1.0.zip', url: `${DOWNLOADS}/THSV-StreamBridge-2.1.0.zip`, size: 37_575_292 },
      checksum: { name: 'THSV-StreamBridge-2.1.0.zip.sha256', url: `${DOWNLOADS}/THSV-StreamBridge-2.1.0.zip.sha256` },
    });
    const urls = request.mock.calls.map(([url]) => requestUrl(url));
    expect(urls).toEqual([SLOTHBLOOM_FEED, LATEST_PAGE, `${DOWNLOADS}/THSV-StreamBridge-2.1.0.zip.sha256`, `${DOWNLOADS}/THSV-StreamBridge-2.1.0.zip`]);
    expect(urls.some((url) => url.startsWith('https://api.github.com/'))).toBe(false);
  });

  it('finds the windows-x64 archive name and reports a release without a core archive', async () => {
    const x64 = githubPages({
      [`${DOWNLOADS}/THSV-StreamBridge-2.1.0-windows-x64.zip.sha256`]: () => new Response(`${'c'.repeat(64)}  THSV-StreamBridge-2.1.0-windows-x64.zip\n`),
      [`${DOWNLOADS}/THSV-StreamBridge-2.1.0-windows-x64.zip`]: () => new Response('P', { status: 206, headers: { 'content-range': 'bytes 0-0/1234' } }),
      [`${DOWNLOADS}/THSV-StreamBridge-2.1.0.zip.sha256`]: () => new Response('missing', { status: 404 }),
    });
    await expect(new ReleaseUpdateService('2.0.0', undefined, x64).check()).resolves.toMatchObject({ archive: { name: 'THSV-StreamBridge-2.1.0-windows-x64.zip', size: 1_234 } });
    const bare = githubPages({ [`${DOWNLOADS}/THSV-StreamBridge-2.1.0.zip.sha256`]: () => new Response('missing', { status: 404 }) });
    const status = await new ReleaseUpdateService('2.0.0', undefined, bare).check();
    expect(status).toMatchObject({ available: true, updateAvailable: true, latestVersion: '2.1.0' });
    expect(status.archive).toBeUndefined();
  });

  it('uses the REST API only when the release pages cannot answer', async () => {
    const release = { tag_name: 'v2.1.0', html_url: 'https://github.com/surakage/THSV-StreamBridge/releases/tag/v2.1.0', draft: false, prerelease: false, assets: [] };
    const request = githubPages({
      [LATEST_PAGE]: () => new Response('<html></html>', { status: 200 }),
      [API_LATEST]: () => response(release),
    });
    await expect(new ReleaseUpdateService('2.0.0', undefined, request).check()).resolves.toMatchObject({ available: true, latestVersion: '2.1.0', discoverySource: 'github' });
    expect(request.mock.calls.map(([url]) => requestUrl(url))).toEqual([SLOTHBLOOM_FEED, LATEST_PAGE, API_LATEST]);
    const prerelease = githubPages({
      [LATEST_PAGE]: () => new Response(null, { status: 302, headers: { location: 'https://github.com/surakage/THSV-StreamBridge/releases/tag/v2.1.0-rc.1' } }),
      [API_LATEST]: () => response(release),
    });
    await expect(new ReleaseUpdateService('2.0.0', undefined, prerelease).check()).resolves.toMatchObject({ latestVersion: '2.1.0' });
    expect(prerelease.mock.calls.map(([url]) => requestUrl(url))).toContain(API_LATEST);
  });

  it('explains a GitHub rate limit with its reset time and does not ask the API again before then', async () => {
    const reset = Math.floor(Date.now() / 1_000) + 1_800;
    const request = githubPages({ [LATEST_PAGE]: () => new Response('busy', { status: 503 }), [API_LATEST]: () => rateLimited(reset) });
    const service = new ReleaseUpdateService('2.0.0', undefined, request);
    const status = await service.check(true);
    expect(status).toMatchObject({ available: false, error: expect.stringContaining("GitHub's hourly limit for update checks was reached") as unknown });
    expect(status.error).toContain(new Date(reset * 1_000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    expect(githubApiBlockedUntil()).toBe(reset * 1_000);
    // A routine check reuses the answer until the reset; nothing is sent.
    request.mockClear();
    await expect(service.check()).resolves.toBe(status);
    expect(request).not.toHaveBeenCalled();
    // An explicit check still tries SlothBloom and the release pages, but never the API.
    await expect(service.check(true)).resolves.toMatchObject({ available: false, error: expect.stringContaining('hourly limit') as unknown });
    expect(request.mock.calls.map(([url]) => requestUrl(url))).toEqual([SLOTHBLOOM_FEED, LATEST_PAGE]);
    // Another service in the same process shares the gate.
    const other = githubPages({ [LATEST_PAGE]: () => new Response('busy', { status: 503 }) });
    await new ReleaseUpdateService('2.0.0', undefined, other).check();
    expect(other.mock.calls.map(([url]) => requestUrl(url))).not.toContain(API_LATEST);

    resetGitHubApiRateLimit();
    const forbidden = githubPages({ [LATEST_PAGE]: () => new Response('busy', { status: 503 }), [API_LATEST]: () => new Response('{}', { status: 403 }) });
    await expect(new ReleaseUpdateService('2.0.0', undefined, forbidden).check(true)).resolves.toMatchObject({ error: 'GitHub release check returned HTTP 403.' });
    expect(githubApiBlockedUntil()).toBeUndefined();
  });

  it('reuses recent answers for routine, repeated, and concurrent checks', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-21T12:00:00Z'), toFake: ['Date'] });
    try {
      const request = githubPages();
      const service = new ReleaseUpdateService('2.0.0', undefined, request);
      const [first, concurrent] = await Promise.all([service.check(true), service.check(true)]);
      expect(concurrent).toBe(first);
      expect(request).toHaveBeenCalledTimes(4);
      await expect(service.check(true)).resolves.toBe(first);
      vi.setSystemTime(Date.parse('2026-10-21T15:00:00Z'));
      await expect(service.check()).resolves.toBe(first);
      expect(request).toHaveBeenCalledTimes(4);
      await service.check(true);
      expect(request).toHaveBeenCalledTimes(8);
      vi.setSystemTime(Date.parse('2026-10-21T21:00:01Z'));
      await service.check();
      expect(request).toHaveBeenCalledTimes(12);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries a failed routine check after 15 minutes', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-21T12:00:00Z'), toFake: ['Date'] });
    try {
      const request = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
      const service = new ReleaseUpdateService('2.0.0', undefined, request);
      const failed = await service.check();
      const calls = request.mock.calls.length;
      await expect(service.check()).resolves.toBe(failed);
      expect(request).toHaveBeenCalledTimes(calls);
      vi.setSystemTime(Date.parse('2026-10-21T12:15:01Z'));
      await service.check();
      expect(request.mock.calls.length).toBeGreaterThan(calls);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not send provenance lookups while the API rate limit is in effect', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-provenance-'));
    const reset = Math.floor(Date.now() / 1_000) + 600;
    const request = vi.fn<typeof fetch>().mockResolvedValue(rateLimited(reset));
    try {
      const options = { repository: 'surakage/THSV-StreamBridge', version: '2.1.0', archiveName: 'THSV-StreamBridge-2.1.0.zip', sha256: 'a'.repeat(64), request, userAgentVersion: '2.0.0', cacheRoot: root };
      await expect(verifyGitHubArtifactProvenance(new Uint8Array([1]), options)).rejects.toThrow("GitHub's hourly limit");
      expect(request).toHaveBeenCalledOnce();
      await expect(verifyGitHubArtifactProvenance(new Uint8Array([1]), options)).rejects.toThrow("GitHub's hourly limit");
      expect(request).toHaveBeenCalledOnce();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails closed for untrusted asset URLs and network failures', async () => {
    const untrusted = vi.fn<typeof fetch>().mockResolvedValue(response({
      tag_name: 'v2.1.0', html_url: 'https://github.com/surakage/THSV-StreamBridge/releases/tag/v2.1.0', draft: false, prerelease: false,
      assets: [{ name: 'THSV-StreamBridge-2.1.0.zip', browser_download_url: 'https://evil.example/update.zip', size: 100 }],
    }));
    await expect(new ReleaseUpdateService('2.0.0', undefined, untrusted).check()).resolves.toMatchObject({ available: false, updateAvailable: false, error: expect.stringContaining('untrusted') as unknown });
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
    await expect(new ReleaseUpdateService('2.0.0', undefined, offline).check()).resolves.toMatchObject({ available: false, error: 'offline' });
  });

  it('stages only an explicitly approved archive whose checksum and provenance both verify', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-update-'));
    const archive = releaseArchive();
    const digest = createHash('sha256').update(archive).digest('hex');
    const archiveUrl = 'https://github.com/surakage/THSV-StreamBridge/releases/download/v2.1.0/THSV-StreamBridge-2.1.0.zip';
    const checksumUrl = `${archiveUrl}.sha256`;
    const release = {
      tag_name: 'v2.1.0', html_url: 'https://github.com/surakage/THSV-StreamBridge/releases/tag/v2.1.0', draft: false, prerelease: false,
      assets: [
        { name: 'THSV-StreamBridge-2.1.0.zip', browser_download_url: archiveUrl, size: archive.byteLength },
        { name: 'THSV-StreamBridge-2.1.0.zip.sha256', browser_download_url: checksumUrl, size: 100 },
      ],
    };
    const request = vi.fn<typeof fetch>(async (input) => {
      const url = requestUrl(input);
      if (url.endsWith('/releases/latest')) return response(release);
      if (url === archiveUrl) return new Response(Buffer.from(archive));
      if (url === checksumUrl) return new Response(`${digest}  THSV-StreamBridge-2.1.0.zip\n`);
      throw new Error(`Unexpected URL: ${url}`);
    });
    const verifyProvenance = vi.fn(async () => ({ repository: 'surakage/THSV-StreamBridge', workflow: 'release.yml@v2.1.0' }));
    try {
      const service = new ReleaseUpdateService('2.0.0', undefined, request, root, verifyProvenance);
      await expect(service.stage({ version: '2.1.0', approvedByCreator: true })).resolves.toMatchObject({
        version: '2.1.0', sha256: digest, provenance: 'verified', repository: 'surakage/THSV-StreamBridge', applyReady: true,
      });
      await expect(readFile(join(root, 'THSV-StreamBridge-2.1.0.zip'))).resolves.toEqual(Buffer.from(archive));
      await expect(readFile(join(root, 'prepared-2.1.0', 'installer', 'apply-update.mjs'), 'utf8')).resolves.toBe('helper');
      expect(verifyProvenance).toHaveBeenCalledOnce();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('deletes the staged archive and unpacked folder only after the installed version is running', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-update-'));
    const archive = releaseArchive();
    const digest = createHash('sha256').update(archive).digest('hex');
    const archiveUrl = 'https://github.com/surakage/THSV-StreamBridge/releases/download/v2.1.0/THSV-StreamBridge-2.1.0.zip';
    const request = vi.fn<typeof fetch>(async (input) => {
      const url = requestUrl(input);
      if (url.endsWith('/releases/latest')) return response({ tag_name: 'v2.1.0', html_url: 'https://github.com/surakage/THSV-StreamBridge/releases/tag/v2.1.0', draft: false, prerelease: false, assets: [
        { name: 'THSV-StreamBridge-2.1.0.zip', browser_download_url: archiveUrl, size: archive.byteLength },
        { name: 'THSV-StreamBridge-2.1.0.zip.sha256', browser_download_url: `${archiveUrl}.sha256`, size: 100 },
      ] });
      if (url === archiveUrl) return new Response(Buffer.from(archive));
      if (url === `${archiveUrl}.sha256`) return new Response(`${digest}  THSV-StreamBridge-2.1.0.zip\n`);
      throw new Error(`Unexpected URL: ${url}`);
    });
    const verifyProvenance = vi.fn(async () => ({ repository: 'surakage/THSV-StreamBridge', workflow: 'release.yml@v2.1.0' }));
    try {
      await expect(new ReleaseUpdateService('2.1.0', undefined, request, root).cleanupInstalledUpdate()).resolves.toEqual({ removed: [], pending: false });
      const before = new ReleaseUpdateService('2.0.0', undefined, request, root, verifyProvenance);
      await before.stage({ version: '2.1.0', approvedByCreator: true });
      await writeFile(join(root, 'last-update.log'), 'kept\n');
      // The previous version still needs the staged files to retry the update.
      await expect(before.cleanupInstalledUpdate()).resolves.toEqual({ removed: [], pending: false });
      await expect(readFile(join(root, 'THSV-StreamBridge-2.1.0.zip'))).resolves.toEqual(Buffer.from(archive));
      const after = new ReleaseUpdateService('2.1.0', undefined, request, root);
      await expect(after.cleanupInstalledUpdate()).resolves.toEqual({ removed: ['THSV-StreamBridge-2.1.0.zip', 'THSV-StreamBridge-2.1.0.zip.sha256', 'prepared-2.1.0'], pending: false });
      expect((await readdir(root)).sort()).toEqual(['last-update.log']);
      await expect(after.cleanupInstalledUpdate()).resolves.toEqual({ removed: [], pending: false });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('sweeps orphaned update files for the running version or older and keeps newer ones', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-orphaned-update-'));
    try {
      // Left behind by an update installed before cleanup existed: no staged record names them.
      await mkdir(join(root, 'prepared-1.9.0', 'runtime'), { recursive: true });
      await writeFile(join(root, 'prepared-1.9.0', 'runtime', 'node.exe'), 'old runtime');
      await writeFile(join(root, 'THSV-StreamBridge-1.9.0.zip'), 'old archive');
      await writeFile(join(root, 'THSV-StreamBridge-1.9.0.zip.sha256'), 'old checksum');
      await mkdir(join(root, 'prepared-2.2.0'));
      await writeFile(join(root, 'THSV-StreamBridge-2.2.0.zip'), 'newer archive');
      for (const kept of ['last-update.log', 'automatic-update-status.json', 'streamerbot-compatibility-feed-cache.json']) await writeFile(join(root, kept), 'kept');
      await mkdir(join(root, 'sigstore-tuf'));
      const result = await new ReleaseUpdateService('2.1.0', undefined, undefined, root).cleanupInstalledUpdate();
      expect(result).toEqual({ removed: ['THSV-StreamBridge-1.9.0.zip', 'THSV-StreamBridge-1.9.0.zip.sha256', 'prepared-1.9.0'], pending: false });
      expect((await readdir(root)).sort()).toEqual(['THSV-StreamBridge-2.2.0.zip', 'automatic-update-status.json', 'last-update.log', 'prepared-2.2.0', 'sigstore-tuf', 'streamerbot-compatibility-feed-cache.json']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('starts only a matching prepared update from a managed offline installation', async () => {
    const installRoot = await mkdtemp(join(tmpdir(), 'thsv-managed-update-'));
    const root = join(installRoot, 'data', 'updates');
    const archive = releaseArchive();
    const digest = createHash('sha256').update(archive).digest('hex');
    const archiveUrl = 'https://github.com/surakage/THSV-StreamBridge/releases/download/v2.1.0/THSV-StreamBridge-2.1.0.zip';
    const request = vi.fn<typeof fetch>(async (input) => {
      const url = requestUrl(input);
      if (url.endsWith('/releases/latest')) return response({ tag_name: 'v2.1.0', html_url: 'https://github.com/surakage/THSV-StreamBridge/releases/tag/v2.1.0', draft: false, prerelease: false, assets: [
        { name: 'THSV-StreamBridge-2.1.0.zip', browser_download_url: archiveUrl, size: archive.byteLength },
        { name: 'THSV-StreamBridge-2.1.0.zip.sha256', browser_download_url: `${archiveUrl}.sha256`, size: 100 },
      ] });
      if (url === archiveUrl) return new Response(Buffer.from(archive));
      if (url === `${archiveUrl}.sha256`) return new Response(`${digest}  THSV-StreamBridge-2.1.0.zip\n`);
      throw new Error(`Unexpected URL: ${url}`);
    });
    const launcher = vi.fn(() => 4321);
    try {
      await mkdir(join(installRoot, 'data', 'runtime'), { recursive: true });
      await writeFile(join(installRoot, 'data', 'runtime', 'install-manifest.json'), JSON.stringify({ product: 'THSV StreamBridge', layoutVersion: 2, activeVersion: '2.0.0', installRoot }));
      const service = new ReleaseUpdateService('2.0.0', undefined, request, root, vi.fn(async () => ({ repository: 'surakage/THSV-StreamBridge', workflow: 'release.yml@v2.1.0' })), launcher);
      await service.stage({ version: '2.1.0', approvedByCreator: true });
      await expect(service.apply({ version: '2.1.0', approvedByCreator: true })).resolves.toMatchObject({ accepted: true, version: '2.1.0', installRoot });
      expect(launcher).toHaveBeenCalledWith(join(root, 'prepared-2.1.0', 'runtime', 'node.exe'), [join(root, 'prepared-2.1.0', 'installer', 'apply-update.mjs'), '--install-root', installRoot], join(root, 'prepared-2.1.0'));
      await expect(service.apply({ version: '2.1.0', approvedByCreator: false })).rejects.toThrow('explicit creator approval');
    } finally {
      await rm(installRoot, { recursive: true, force: true });
    }
  });

  it('fails closed before staging when approval or the published checksum is invalid', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-update-'));
    const archiveUrl = 'https://github.com/surakage/THSV-StreamBridge/releases/download/v2.1.0/THSV-StreamBridge-2.1.0.zip';
    const checksumUrl = `${archiveUrl}.sha256`;
    const request = vi.fn<typeof fetch>(async (input) => {
      const url = requestUrl(input);
      if (url.endsWith('/releases/latest')) return response({
        tag_name: 'v2.1.0', html_url: 'https://github.com/surakage/THSV-StreamBridge/releases/tag/v2.1.0', draft: false, prerelease: false,
        assets: [
          { name: 'THSV-StreamBridge-2.1.0.zip', browser_download_url: archiveUrl, size: 8 },
          { name: 'THSV-StreamBridge-2.1.0.zip.sha256', browser_download_url: checksumUrl, size: 100 },
        ],
      });
      if (url === archiveUrl) return new Response('tampered');
      if (url === checksumUrl) return new Response(`${'a'.repeat(64)}  THSV-StreamBridge-2.1.0.zip\n`);
      throw new Error(`Unexpected URL: ${url}`);
    });
    try {
      const service = new ReleaseUpdateService('2.0.0', undefined, request, root, vi.fn());
      await expect(service.stage({ version: '2.1.0', approvedByCreator: false })).rejects.toThrow('explicit creator approval');
      await expect(service.stage({ version: '2.1.0', approvedByCreator: true })).rejects.toThrow('does not match');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('accepts manual release provenance only when it resolves the exact repository tag commit', () => {
    const commit = 'a'.repeat(40);
    const buildDefinition = { resolvedDependencies: [{ uri: 'git+https://github.com/surakage/THSV-StreamBridge@refs/heads/main', digest: { gitCommit: commit } }] };
    expect(manualDispatchResolvesTagCommit(buildDefinition, 'surakage/THSV-StreamBridge', commit)).toBe(true);
    expect(manualDispatchResolvesTagCommit(buildDefinition, 'surakage/THSV-StreamBridge', 'b'.repeat(40))).toBe(false);
    expect(manualDispatchResolvesTagCommit(buildDefinition, 'attacker/THSV-StreamBridge', commit)).toBe(false);
    expect(manualDispatchResolvesTagCommit({ resolvedDependencies: [] }, 'surakage/THSV-StreamBridge', commit)).toBe(false);
  });
});
