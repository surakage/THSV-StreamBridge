import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import { AddOnUpdateService } from '../../bridge/services/addon-update-service.js';
import type { InstalledAddOnSummary } from '../../bridge/services/addon-package-manager.js';
import { resetGitHubApiRateLimit } from '../../bridge/services/github-release-discovery.js';

function installed(moduleId: string, version: string, publisherId = 'thsv.streambridge'): InstalledAddOnSummary {
  return {
    moduleId,
    name: moduleId,
    version,
    author: 'THSV Project',
    description: 'Test add-on',
    changelog: '',
    packageKind: 'executable',
    permissions: [],
    trust: { publisherId },
    enabled: true,
    approvedActionIds: [],
    health: 'installed',
    configurationSchema: { type: 'object', properties: {} },
    installationSteps: [],
    uninstallationSteps: [],
    healthChecks: [],
    commandsProvided: [],
    browserSourcesProvided: [],
  };
}

function index(packages: readonly Record<string, unknown>[], revoked: readonly string[] = []): Record<string, unknown> {
  return {
    schemaVersion: 1,
    product: 'THSV StreamBridge Add-ons',
    generatedAt: '2026-07-22T12:00:00Z',
    releaseUrl: 'https://github.com/surakage/THSV-StreamBridge/releases',
    packages,
    revoked,
  };
}

function published(moduleId: string, version: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    moduleId,
    name: moduleId,
    version,
    publisherId: 'thsv.streambridge',
    archiveName: `THSV-StreamBridge-AddOn-${moduleId}-${version}.zip`,
    sha256: 'a'.repeat(64),
    minimumCoreVersion: '2.0.0-preview.1',
    maximumTestedCoreVersion: '2.0.0-preview.1',
    permissions: [],
    revoked: false,
    ...overrides,
  };
}

function responses(indexBody: unknown): ReturnType<typeof vi.fn<typeof fetch>> {
  const encoded = JSON.stringify(indexBody);
  const publishedPackages = (indexBody as { packages?: Array<{ archiveName?: string }> }).packages ?? [];
  return vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify({
      tag_name: 'v2.0.0',
      html_url: 'https://github.com/surakage/THSV-StreamBridge/releases/tag/v2.0.0',
      draft: false,
      prerelease: false,
      assets: [
        {
          name: 'THSV-StreamBridge-AddOns-index.json',
          browser_download_url: 'https://github.com/surakage/THSV-StreamBridge/releases/download/v2.0.0/THSV-StreamBridge-AddOns-index.json',
          size: Buffer.byteLength(encoded),
        },
        ...publishedPackages.map((entry) => {
          if (typeof entry.archiveName !== 'string') throw new Error('Test package archive name is required.');
          return {
            name: entry.archiveName,
            browser_download_url: `https://github.com/surakage/THSV-StreamBridge/releases/download/v2.0.0/${entry.archiveName}`,
            size: 1024,
          };
        }),
      ],
    }), { status: 200 }))
    .mockResolvedValueOnce(new Response(encoded, { status: 200, headers: { 'content-length': String(Buffer.byteLength(encoded)) } }));
}

function requestUrl(input: string | URL | Request): string {
  return typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
}

describe('AddOnUpdateService', () => {
  beforeEach(() => { resetGitHubApiRateLimit(); });

  it('reports current, compatible update, newer-core, unlisted, and revoked states without installing anything', async () => {
    const request = responses(index([
      published('thsv.current', '1.0.0'),
      published('thsv.update', '1.2.0'),
      published('thsv.future', '2.0.0', { minimumCoreVersion: '3.0.0', maximumTestedCoreVersion: '3.0.0' }),
      published('thsv.revoked', '1.0.0', { revoked: true }),
    ]));
    const result = await new AddOnUpdateService('2.0.0-preview.1', undefined, request).check([
      installed('thsv.current', '1.0.0'),
      installed('thsv.update', '1.0.0'),
      installed('thsv.future', '1.0.0'),
      installed('thsv.unlisted', '1.0.0'),
      installed('thsv.revoked', '1.0.0'),
    ]);
    expect(result).toMatchObject({ available: true, updateCount: 1, revokedCount: 1, discoverySource: 'slothbloom' });
    expect(result.addOns).toEqual([
      expect.objectContaining({ moduleId: 'thsv.current', state: 'current' }),
      expect.objectContaining({
        moduleId: 'thsv.update',
        state: 'update-available',
        latestVersion: '1.2.0',
        downloadUrl: 'https://github.com/surakage/THSV-StreamBridge/releases/download/v2.0.0/THSV-StreamBridge-AddOn-thsv.update-1.2.0.zip',
      }),
      expect.objectContaining({ moduleId: 'thsv.future', state: 'requires-newer-core' }),
      expect.objectContaining({ moduleId: 'thsv.unlisted', state: 'not-listed' }),
      expect.objectContaining({ moduleId: 'thsv.revoked', state: 'revoked' }),
    ]);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('falls back to github.com release pages, not the rate-limited API, when the website feed is unavailable', async () => {
    const encoded = JSON.stringify(index([published('thsv.update', '1.2.0')]));
    const request = vi.fn<typeof fetch>(async (input) => {
      const url = requestUrl(input);
      if (url === 'https://github.com/surakage/THSV-StreamBridge/releases/latest') return new Response(null, { status: 302, headers: { location: 'https://github.com/surakage/THSV-StreamBridge/releases/tag/v2.0.0' } });
      if (url === 'https://github.com/surakage/THSV-StreamBridge/releases/download/v2.0.0/THSV-StreamBridge-AddOns-index.json') return new Response(encoded, { status: 200 });
      return new Response('temporarily unavailable', { status: 503 });
    });
    const service = new AddOnUpdateService('2.0.0-preview.1', undefined, request);
    const result = await service.check([installed('thsv.update', '1.0.0')]);
    expect(result).toMatchObject({
      available: true, discoverySource: 'github', updateCount: 1, releaseVersion: '2.0.0',
      releaseUrl: 'https://github.com/surakage/THSV-StreamBridge/releases/tag/v2.0.0',
      addOns: [expect.objectContaining({ downloadUrl: 'https://github.com/surakage/THSV-StreamBridge/releases/download/v2.0.0/THSV-StreamBridge-AddOn-thsv.update-1.2.0.zip' })],
    });
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls.some(([url]) => requestUrl(url).startsWith('https://api.github.com/'))).toBe(false);
    // Routine and back-to-back explicit checks reuse the answer.
    await expect(service.check([installed('thsv.update', '1.0.0')])).resolves.toBe(result);
    await expect(service.check([installed('thsv.update', '1.0.0')], true)).resolves.toBe(result);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('uses the REST API only as a last resort and stops at a rate limit until it resets', async () => {
    const reset = Math.floor(Date.now() / 1_000) + 1_200;
    const request = vi.fn<typeof fetch>(async (input) => {
      const url = requestUrl(input);
      if (url.startsWith('https://api.github.com/')) return new Response('{}', { status: 429, headers: { 'x-ratelimit-reset': String(reset) } });
      return new Response('temporarily unavailable', { status: 503 });
    });
    const service = new AddOnUpdateService('2.0.0-preview.1', undefined, request);
    const status = await service.check([], true);
    expect(status).toMatchObject({ available: false, error: expect.stringContaining("GitHub's hourly limit") as unknown });
    expect(request.mock.calls.map(([url]) => requestUrl(url))).toEqual([
      'https://www.slothbloom.com/api/streambridge/releases/latest',
      'https://github.com/surakage/THSV-StreamBridge/releases/latest',
      'https://api.github.com/repos/surakage/THSV-StreamBridge/releases/latest',
    ]);
    request.mockClear();
    await expect(service.check([])).resolves.toBe(status);
    expect(request).not.toHaveBeenCalled();
    await service.check([], true);
    expect(request.mock.calls.some(([url]) => requestUrl(url).startsWith('https://api.github.com/'))).toBe(false);
  });

  it('fails closed for publisher mismatches, untrusted assets, and malformed indexes', async () => {
    const mismatchRequest = responses(index([published('thsv.sample', '2.0.0', { publisherId: 'other.publisher' })]));
    await expect(new AddOnUpdateService('2.0.0-preview.1', undefined, mismatchRequest).check([installed('thsv.sample', '1.0.0')])).resolves.toMatchObject({
      available: true,
      updateCount: 0,
      addOns: [expect.objectContaining({ state: 'publisher-mismatch' })],
    });

    const missingPublisher = responses(index([published('thsv.sample', '2.0.0', { publisherId: '' })]));
    await expect(new AddOnUpdateService('2.0.0-preview.1', undefined, missingPublisher).check([installed('thsv.sample', '1.0.0')])).resolves.toMatchObject({
      available: true,
      updateCount: 0,
      addOns: [expect.objectContaining({ state: 'publisher-mismatch' })],
    });

    const untrusted = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      tag_name: 'v2.0.0',
      html_url: 'https://github.com/surakage/THSV-StreamBridge/releases/tag/v2.0.0', draft: false, prerelease: false,
      assets: [{ name: 'THSV-StreamBridge-AddOns-index.json', browser_download_url: 'https://evil.example/index.json', size: 100 }],
    }), { status: 200 }));
    await expect(new AddOnUpdateService('2.0.0-preview.1', undefined, untrusted).check([])).resolves.toMatchObject({ available: false, error: expect.stringContaining('untrusted') as unknown });

    const malformed = responses(index([published('thsv.sample', '1.0.0junk')]));
    await expect(new AddOnUpdateService('2.0.0-preview.1', undefined, malformed).check([])).resolves.toMatchObject({ available: false, error: expect.stringContaining('version') as unknown });
  });

  it('uses the product release boundary in addition to the stable API contract', async () => {
    const request = responses(index([
      published('thsv.future-host', '2.4.2', { minimumBridgeVersion: '2.4.2', maximumTestedBridgeVersion: '2.4.2' }),
    ]));
    const result = await new AddOnUpdateService('2.0.0-preview.1', undefined, request, '2.4.1').check([
      installed('thsv.future-host', '2.4.1'),
    ]);
    expect(result.addOns).toEqual([expect.objectContaining({ state: 'requires-newer-core', warning: expect.stringContaining('2.4.2') as unknown })]);
  });

  it('downloads and verifies both release layers before returning an inner package for staging', async () => {
    const inner = zipSync({ 'module-package.json': strToU8('{}') });
    const innerName = 'thsv.sample-2.0.0.thsv-addon';
    const innerSha256 = createHash('sha256').update(inner).digest('hex');
    const streamerBotImport = strToU8('verified-streamerbot-import');
    const streamerBotImportName = 'THSV-Sample-2.0.0.sb';
    const streamerBotImportSha256 = createHash('sha256').update(streamerBotImport).digest('hex');
    const outer = zipSync({
      [innerName]: inner,
      [`${innerName}.sha256`]: strToU8(`${innerSha256}  ${innerName}\n`),
      [`Streamer.bot/${streamerBotImportName}`]: streamerBotImport,
      [`Streamer.bot/${streamerBotImportName}.sha256`]: strToU8(`${streamerBotImportSha256}  ${streamerBotImportName}\n`),
      'README.md': strToU8('Setup guide'),
    });
    const outerSha256 = createHash('sha256').update(outer).digest('hex');
    const packageEntry = published('thsv.sample', '2.0.0', { sha256: outerSha256 });
    const indexBody = index([packageEntry]);
    const encodedIndex = JSON.stringify(indexBody);
    const outerName = String(packageEntry['archiveName']);
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        tag_name: 'v2.0.0',
        html_url: 'https://github.com/surakage/THSV-StreamBridge/releases/tag/v2.0.0',
        draft: false,
        prerelease: false,
        assets: [
          { name: 'THSV-StreamBridge-AddOns-index.json', browser_download_url: 'https://github.com/surakage/THSV-StreamBridge/releases/download/v2.0.0/THSV-StreamBridge-AddOns-index.json', size: Buffer.byteLength(encodedIndex) },
          { name: outerName, browser_download_url: `https://github.com/surakage/THSV-StreamBridge/releases/download/v2.0.0/${outerName}`, size: outer.byteLength },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(encodedIndex, { status: 200 }))
      .mockResolvedValueOnce(new Response(outer, { status: 200 }));
    const verifyProvenance = vi.fn().mockResolvedValue({ repository: 'surakage/THSV-StreamBridge', workflow: 'expected-workflow' });
    const service = new AddOnUpdateService('2.0.0-preview.1', undefined, request, '2.0.0', 'data/test-update-cache', verifyProvenance);

    await expect(service.stage([installed('thsv.sample', '1.0.0')], { moduleId: 'thsv.sample', version: '2.0.0', approvedByCreator: true })).resolves.toMatchObject({
      moduleId: 'thsv.sample',
      version: '2.0.0',
      filename: innerName,
      sha256: innerSha256,
      outerSha256,
      provenance: 'verified',
      streamerBotImports: [{ filename: streamerBotImportName, sha256: streamerBotImportSha256 }],
    });
    expect(verifyProvenance).toHaveBeenCalledWith(outer, expect.objectContaining({ version: '2.0.0', archiveName: outerName, sha256: outerSha256 }));
    await expect(service.stage([], { moduleId: 'thsv.sample', version: '2.0.0', approvedByCreator: false })).rejects.toThrow('explicit creator approval');
  });
});
