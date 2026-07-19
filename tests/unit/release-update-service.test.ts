import { describe, expect, it, vi } from 'vitest';
import { ReleaseUpdateService } from '../../bridge/services/release-update-service.js';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('ReleaseUpdateService', () => {
  it('reports a newer verified GitHub release and its companion artifacts', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response({
      tag_name: 'v2.1.0', name: 'THSV StreamBridge 2.1.0', html_url: 'https://github.com/surakage/THSV-StreamBridge/releases/tag/v2.1.0',
      body: 'Safer add-on updates.', draft: false, prerelease: false, published_at: '2026-07-19T12:00:00Z',
      assets: [
        { name: 'THSV-StreamBridge-2.1.0-windows-x64.zip', browser_download_url: 'https://github.com/surakage/THSV-StreamBridge/releases/download/v2.1.0/THSV-StreamBridge-2.1.0-windows-x64.zip', size: 40_000_000 },
        { name: 'THSV-StreamBridge-2.1.0-windows-x64.zip.sha256', browser_download_url: 'https://github.com/surakage/THSV-StreamBridge/releases/download/v2.1.0/THSV-StreamBridge-2.1.0-windows-x64.zip.sha256', size: 100 },
        { name: 'THSV-StreamBridge-v2.1.0.cdx.json', browser_download_url: 'https://github.com/surakage/THSV-StreamBridge/releases/download/v2.1.0/THSV-StreamBridge-v2.1.0.cdx.json', size: 5_000 },
      ],
    }));
    await expect(new ReleaseUpdateService('2.0.0', undefined, request).check()).resolves.toMatchObject({
      available: true, updateAvailable: true, latestVersion: '2.1.0',
      archive: { name: 'THSV-StreamBridge-2.1.0-windows-x64.zip' }, checksum: { name: 'THSV-StreamBridge-2.1.0-windows-x64.zip.sha256' },
    });
    expect(request).toHaveBeenCalledOnce();
    const [requestedUrl, requestInit] = request.mock.calls[0] ?? [];
    expect(requestedUrl).toBe('https://api.github.com/repos/surakage/THSV-StreamBridge/releases/latest');
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it('fails closed for untrusted asset URLs and network failures', async () => {
    const untrusted = vi.fn<typeof fetch>().mockResolvedValue(response({
      tag_name: 'v2.1.0', html_url: 'https://github.com/surakage/THSV-StreamBridge/releases/tag/v2.1.0', draft: false, prerelease: false,
      assets: [{ name: 'THSV-StreamBridge-2.1.0-windows-x64.zip', browser_download_url: 'https://evil.example/update.zip', size: 100 }],
    }));
    await expect(new ReleaseUpdateService('2.0.0', undefined, untrusted).check()).resolves.toMatchObject({ available: false, updateAvailable: false, error: expect.stringContaining('untrusted') as unknown });
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
    await expect(new ReleaseUpdateService('2.0.0', undefined, offline).check()).resolves.toMatchObject({ available: false, error: 'offline' });
  });
});
