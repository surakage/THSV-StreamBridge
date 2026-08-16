import { describe, expect, it, vi } from 'vitest';
import { ReleaseUpdateService } from '../../bridge/services/release-update-service.js';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

describe('ReleaseUpdateService', () => {
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

  it('falls back to GitHub discovery when the SlothBloom release feed is unavailable', async () => {
    const release = {
      tag_name: 'v2.1.0', html_url: 'https://github.com/surakage/THSV-StreamBridge/releases/tag/v2.1.0', draft: false, prerelease: false, assets: [],
    };
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('temporarily unavailable', { status: 503 }))
      .mockResolvedValueOnce(response(release));
    await expect(new ReleaseUpdateService('2.0.0', undefined, request).check()).resolves.toMatchObject({
      available: true, latestVersion: '2.1.0', discoverySource: 'github',
    });
    expect(request.mock.calls.map(([url]) => requestUrl(url))).toEqual([
      'https://www.slothbloom.com/api/streambridge/releases/latest',
      'https://api.github.com/repos/surakage/THSV-StreamBridge/releases/latest',
    ]);
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
});
