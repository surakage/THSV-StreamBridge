import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { LicenceService } from '../../bridge/services/licence-service.js';
import type { Logger } from '../../bridge/services/logger.js';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
const protector = { protect: async (value: string) => `sealed:${value}`, unprotect: async (value: string) => value.replace(/^sealed:/u, '') };
const KEY = '38B1460A-5104-4067-A91D-77B872934D51';

function reply(body: Record<string, unknown>, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }); }
const activated = { activated: true, error: null, license_key: { status: 'active', expires_at: null }, instance: { id: 'inst-1', name: 'PC' }, meta: { store_id: 7, product_id: 9, product_name: 'StreamBridge', customer_name: 'Sam' } };

async function service(fetcher: typeof fetch, now = () => new Date('2026-11-10T00:00:00Z'), storeIds: readonly number[] = [7]) {
  const root = await mkdtemp(join(tmpdir(), 'licence-'));
  return { root, licence: new LicenceService(root, { protector, logger, fetcher, now, instanceName: 'PC', storeIds }) };
}

describe('LicenceService', () => {
  it('reports beta with no licence', async () => {
    const { licence } = await service(vi.fn());
    await licence.start();
    expect(licence.status()).toEqual({ beta: true, licensed: false, state: 'none' });
  });

  it('shares only https buy, terms and privacy links that are set', async () => {
    const root = await mkdtemp(join(tmpdir(), 'licence-'));
    const licence = new LicenceService(root, { protector, logger, fetcher: vi.fn(), instanceName: 'PC', links: { buy: 'https://example.com/buy', terms: 'http://example.com/terms', privacy: '' } });
    await licence.start();
    expect(licence.status()).toEqual({ beta: true, licensed: false, state: 'none', links: { buy: 'https://example.com/buy' } });
  });

  it('activates a key, keeps it sealed on disk and never returns it', async () => {
    const fetcher = vi.fn(async () => reply(activated));
    const { root, licence } = await service(fetcher);
    const status = await licence.activate({ key: KEY });
    expect(status).toMatchObject({ licensed: true, state: 'active', keyHint: '…4D51', productName: 'StreamBridge', customerName: 'Sam' });
    expect(JSON.stringify(status)).not.toContain(KEY);
    const saved = await readFile(join(root, 'secrets', 'licence.json'), 'utf8');
    expect(saved).toContain(`sealed:${KEY}`);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.lemonsqueezy.com/v1/licenses/activate');
    expect(init.body).toBe(new URLSearchParams({ license_key: KEY, instance_name: 'PC' }).toString());
  });

  it('refuses keys from another store and releases that activation', async () => {
    const fetcher = vi.fn(async () => reply({ ...activated, meta: { ...activated.meta, store_id: 99 } }));
    const { licence } = await service(fetcher);
    await expect(licence.activate({ key: KEY })).rejects.toThrow('not a StreamBridge licence');
    expect(String((fetcher.mock.calls as unknown as unknown[][])[1]?.[0])).toContain('/deactivate');
    expect(licence.status().state).toBe('none');
  });

  it('explains a full activation limit', async () => {
    const { licence } = await service(vi.fn(async () => reply({ activated: false, error: 'This license key has reached the activation limit.' }, 400)));
    await expect(licence.activate({ key: KEY })).rejects.toThrow('already active on as many PCs');
  });

  it('keeps a licence through short outages and marks it unchecked after the grace period', async () => {
    let time = new Date('2026-11-10T00:00:00Z');
    const fetcher = vi.fn(async () => reply(activated));
    const { licence } = await service(fetcher, () => time);
    await licence.activate({ key: KEY });
    fetcher.mockRejectedValue(new Error('offline'));
    time = new Date('2026-11-15T00:00:00Z');
    await expect(licence.check()).rejects.toThrow('offline');
    expect(licence.status()).toMatchObject({ licensed: true, state: 'active', lastError: expect.stringContaining('could not be reached') as unknown });
    time = new Date('2026-12-01T00:00:00Z');
    expect(licence.status()).toMatchObject({ licensed: false, state: 'unchecked' });
  });

  it('follows an expired licence on the next check and removes it from the PC', async () => {
    const fetcher = vi.fn(async () => reply(activated));
    const { licence } = await service(fetcher);
    await licence.activate({ key: KEY });
    fetcher.mockResolvedValueOnce(reply({ valid: false, error: 'license_key expired', license_key: { status: 'expired' } }));
    await expect(licence.check()).resolves.toMatchObject({ licensed: false, state: 'expired', lastError: 'This licence has expired.' });
    fetcher.mockResolvedValueOnce(reply({ deactivated: true, error: null }));
    await expect(licence.deactivate()).resolves.toEqual({ beta: true, licensed: false, state: 'none' });
  });

  it('rejects text that is not a key without calling the server', async () => {
    const fetcher = vi.fn();
    const { licence } = await service(fetcher);
    await expect(licence.activate({ key: 'nope' })).rejects.toThrow('Paste the licence key');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
