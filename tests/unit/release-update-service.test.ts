import { describe, expect, it, vi } from 'vitest';
import { ReleaseUpdateService } from '../../bridge/services/release-update-service.js';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function requestUrl(input: string | URL | Request): string {
  return typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
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
      available: true, updateAvailable: true, latestVersion: '2.1.0',
      archive: { name: 'THSV-StreamBridge-2.1.0.zip' }, checksum: { name: 'THSV-StreamBridge-2.1.0.zip.sha256' },
    });
    expect(request).toHaveBeenCalledOnce();
    const [requestedUrl, requestInit] = request.mock.calls[0] ?? [];
    expect(requestedUrl).toBe('https://api.github.com/repos/surakage/THSV-StreamBridge/releases/latest');
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
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
    const archive = Buffer.from('trusted release bytes');
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
      if (url === archiveUrl) return new Response(archive);
      if (url === checksumUrl) return new Response(`${digest}  THSV-StreamBridge-2.1.0.zip\n`);
      throw new Error(`Unexpected URL: ${url}`);
    });
    const verifyProvenance = vi.fn(async () => ({ repository: 'surakage/THSV-StreamBridge', workflow: 'release.yml@v2.1.0' }));
    try {
      const service = new ReleaseUpdateService('2.0.0', undefined, request, root, verifyProvenance);
      await expect(service.stage({ version: '2.1.0', approvedByCreator: true })).resolves.toMatchObject({
        version: '2.1.0', sha256: digest, provenance: 'verified', repository: 'surakage/THSV-StreamBridge',
      });
      await expect(readFile(join(root, 'THSV-StreamBridge-2.1.0.zip'))).resolves.toEqual(archive);
      expect(verifyProvenance).toHaveBeenCalledOnce();
    } finally {
      await rm(root, { recursive: true, force: true });
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
