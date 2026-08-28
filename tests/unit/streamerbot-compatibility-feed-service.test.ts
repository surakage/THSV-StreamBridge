import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StreamerBotCompatibilityFeedService } from '../../bridge/services/streamerbot-compatibility-feed-service.js';
import { silentLogger } from '../helpers.js';

describe('StreamerBotCompatibilityFeedService', () => {
  it('exposes the checked official source and safe embedded fallback state', async () => {
    const fetcher = async (): Promise<Response> => Response.json([]);
    const service = new StreamerBotCompatibilityFeedService(silentLogger, fetcher);
    expect(service.status()).toMatchObject({ state: 'checking', available: false });
    const refreshed = await service.refresh();
    expect(refreshed).toMatchObject({ state: 'embedded', available: false, provenanceVerified: false });
    expect(String(refreshed['source'])).toContain('/releases');
    expect(typeof refreshed['checkedAt']).toBe('string');
    expect(service.status()).toMatchObject({ state: 'embedded' });
    expect(String(service.status()['reason'])).toContain('No published');
  });

  it('persists an authenticated cache, reloads it offline, and rejects release rollback', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-compat-cache-'));
    const cachePath = join(root, 'compatibility.json');
    const feed = Buffer.from(JSON.stringify({ schemaVersion: 1, versions: [{ version: '1.1.0-alpha.4', baseVersion: '1.1.0-alpha.4' }] }), 'utf8');
    const release = { tag_name: 'streamerbot-compat-1.1.0-alpha.4', published_at: '2026-08-27T12:00:00.000Z', assets: [{ name: 'THSV-StreamBridge-StreamerBot-Compatibility.json', browser_download_url: 'https://assets.invalid/feed' }] };
    const fetcher = async (input: string | URL | Request): Promise<Response> => {
      const url = requestUrl(input);
      if (url.includes('/releases')) return Response.json([release]);
      if (url.includes('/attestations/')) return Response.json({ attestations: [{ bundle: { signed: true } }] });
      return new Response(feed);
    };
    const verified: string[] = [];
    const verifier = async (_bundles: readonly unknown[], digest: string): Promise<void> => { verified.push(digest); };
    const service = new StreamerBotCompatibilityFeedService(silentLogger, fetcher, cachePath, verifier, () => new Date('2026-08-28T12:00:00.000Z'));
    await expect(service.refresh()).resolves.toMatchObject({ state: 'verified', provenanceVerified: true });
    expect(JSON.parse(await readFile(cachePath, 'utf8'))).toMatchObject({ schemaVersion: 1, tag: release.tag_name });

    const rollbackFetcher = async (input: string | URL | Request): Promise<Response> => {
      if (requestUrl(input).includes('/releases')) return Response.json([{ ...release, tag_name: 'streamerbot-compat-older', published_at: '2026-08-26T12:00:00.000Z' }]);
      throw new Error('Rollback must be rejected before downloading assets.');
    };
    const restarted = new StreamerBotCompatibilityFeedService(silentLogger, rollbackFetcher, cachePath, verifier, () => new Date('2026-08-28T12:00:00.000Z'));
    await restarted.start();
    expect(restarted.status()).toMatchObject({ state: 'verified-cache', provenanceVerified: true, tag: release.tag_name });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(restarted.status()).toMatchObject({ state: 'verified-cache', provenanceVerified: true, refreshError: 'Compatibility release rollback was rejected.' });
    expect(verified).toHaveLength(2);
  });

  it('warns seven days before a verified offline cache expires', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-compat-expiry-'));
    const cachePath = join(root, 'compatibility.json');
    const feed = Buffer.from(JSON.stringify({ schemaVersion: 1, versions: [{ version: '1.1.0-alpha.4', baseVersion: '1.1.0-alpha.4' }] }), 'utf8');
    const release = { tag_name: 'streamerbot-compat-1.1.0-alpha.4', published_at: '2026-08-01T00:00:00.000Z', assets: [{ name: 'THSV-StreamBridge-StreamerBot-Compatibility.json', browser_download_url: 'https://assets.invalid/feed' }] };
    const online = async (input: string | URL | Request): Promise<Response> => requestUrl(input).includes('/releases') ? Response.json([release]) : requestUrl(input).includes('/attestations/') ? Response.json({ attestations: [{ bundle: { signed: true } }] }) : new Response(feed);
    const verifier = async (): Promise<void> => undefined;
    await new StreamerBotCompatibilityFeedService(silentLogger, online, cachePath, verifier, () => new Date('2026-08-01T00:00:00.000Z')).refresh();
    const offline = async (): Promise<Response> => { throw new Error('offline'); };
    const service = new StreamerBotCompatibilityFeedService(silentLogger, offline, cachePath, verifier, () => new Date('2026-08-25T00:00:00.000Z'));
    await service.start();
    expect(service.status()).toMatchObject({ state: 'verified-cache', expiryState: 'warning', daysRemaining: 6 });
    expect(String(service.status()['warning'])).toContain('expires in 6 days');
  });
});

function requestUrl(input: string | URL | Request): string { return typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url; }
