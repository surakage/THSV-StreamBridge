import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { WebsiteCompanionService } from '../../bridge/services/website-companion-service.js';

describe('WebsiteCompanionService', () => {
  it('pairs through an outbound S256 device flow without exposing its credential', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thsv-website-companion-'));
    const statePath = join(directory, 'private', 'website-companion.json');
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const pairedAt = new Date().toISOString();
    const configuration = { format: 'thsv.streambridge.wizard-configuration', version: 1, exportedAt: new Date().toISOString(), platforms: {}, filters: {} };
    const draft = { revision: '4b7c2c59-d229-46ce-aad0-739de7494af0', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), configuration };
    const responses = [
      new Response(JSON.stringify({ pairingId: 'pairing-id-with-enough-length', userCode: 'ABCD-EFGH', verificationUrl: 'https://www.slothbloom.com/tools/streambridge/pair', expiresAt, pollAfterSeconds: 5 }), { status: 200 }),
      new Response(JSON.stringify({ state: 'pending', expiresAt }), { status: 200 }),
      new Response(JSON.stringify({ state: 'paired', accessToken: 'a'.repeat(48), dashboardUrl: 'https://www.slothbloom.com/tools/streambridge/my-device', pairedAt }), { status: 200 }),
      new Response(JSON.stringify({ saved: true, savedAt: new Date().toISOString() }), { status: 200 }),
      new Response(JSON.stringify(draft), { status: 200 }),
      new Response(null, { status: 204 }),
    ];
    let startUrl = '';
    let startBody: Record<string, unknown> = {};
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      if (responses.length === 6) {
        startUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (typeof init?.body === 'string') startBody = JSON.parse(init.body) as Record<string, unknown>;
      }
      return responses.shift() ?? new Response(null, { status: 500 });
    });
    const fetcher = fetchMock as unknown as typeof fetch;
    const service = new WebsiteCompanionService(statePath, 'https://www.slothbloom.com', fetcher);

    await expect(service.status()).resolves.toMatchObject({ state: 'disconnected', websiteOrigin: 'https://www.slothbloom.com' });
    const pending = await service.start('4.0.1');
    expect(pending).toMatchObject({ state: 'pending', userCode: 'ABCD-EFGH', verificationUrl: 'https://www.slothbloom.com/tools/streambridge/pair' });
    expect(startUrl).toBe('https://www.slothbloom.com/api/streambridge/pairing/start');
    expect(startBody).toMatchObject({ version: '4.0.1', challengeMethod: 'S256' });
    expect(startBody['challenge']).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    await expect(service.check()).resolves.toMatchObject({ state: 'pending' });
    const connected = await service.check();
    expect(connected).toMatchObject({ state: 'connected', dashboardUrl: 'https://www.slothbloom.com/tools/streambridge/my-device' });
    expect(JSON.stringify(connected)).not.toContain('a'.repeat(48));
    expect(await readFile(statePath, 'utf8')).toContain('a'.repeat(48));
    await expect(service.pushConfiguration(configuration)).resolves.toMatchObject({ saved: true });
    await expect(service.pullDraft()).resolves.toMatchObject({ revision: draft.revision, configuration });
    const pushRequest = fetchMock.mock.calls[3];
    expect(pushRequest?.[0]).toBe('https://www.slothbloom.com/api/streambridge/device/configuration');
    expect(pushRequest?.[1]?.headers).toMatchObject({ authorization: `Bearer ${'a'.repeat(48)}` });
    await expect(service.disconnect()).resolves.toMatchObject({ state: 'disconnected' });
    expect(await readFile(statePath, 'utf8')).not.toContain('a'.repeat(48));
  });

  it('rejects website links that leave the configured trusted origin', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thsv-website-origin-'));
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ pairingId: 'pairing-id-with-enough-length', userCode: 'ABCD-EFGH', verificationUrl: 'https://example.com/steal', expiresAt: new Date(Date.now() + 60_000).toISOString(), pollAfterSeconds: 5 }), { status: 200 })) as unknown as typeof fetch;
    const service = new WebsiteCompanionService(join(directory, 'state.json'), 'https://www.slothbloom.com', fetcher);
    await expect(service.start('4.0.1')).rejects.toThrow('unexpected website');
    await expect(service.status()).resolves.toMatchObject({ state: 'disconnected' });
  });
});
