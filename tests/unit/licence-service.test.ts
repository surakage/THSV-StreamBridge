import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ALWAYS_FREE_MODULE_IDS, FREE_PLATFORM_LIMIT, PLAN_ENFORCED, PRO_MODULE_IDS, licencePlan, moduleAllowed, platformLimit, platformsForPlan, settingsForPlan, cleanFreePlatformChoice } from '../../bridge/services/licence-plan.js';
import { LicenceService } from '../../bridge/services/licence-service.js';
import type { Logger } from '../../bridge/services/logger.js';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
const protector = { protect: async (value: string) => `sealed:${value}`, unprotect: async (value: string) => value.replace(/^sealed:/u, '') };
const KEY = '38B1460A-5104-4067-A91D-77B872934D51';

const ORG = '11111111-1111-4111-8111-111111111111';
const BENEFIT = '22222222-2222-4222-8222-222222222222';
const BENEFITS = { [BENEFIT]: 'StreamBridge Pro Lifetime' };

function reply(body: unknown, status = 200): Response { return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }); }
const licenceKey = { id: 'lk-1', organization_id: ORG, benefit_id: BENEFIT, key: KEY, display_key: '****-4D51', status: 'granted', limit_activations: 2, usage: 0, limit_usage: null, validations: 0, last_validated_at: null, expires_at: null, customer: { id: 'c-1', name: 'Sam' } };
const activated = { id: 'act-1', license_key_id: 'lk-1', label: 'PC', meta: {}, created_at: '2026-11-10T00:00:00Z', modified_at: null, license_key: licenceKey };
const validated = { ...licenceKey, activation: { id: 'act-1', license_key_id: 'lk-1', label: 'PC', meta: {}, created_at: '2026-11-10T00:00:00Z', modified_at: null } };

async function service(fetcher: typeof fetch, now = () => new Date('2026-11-10T00:00:00Z'), benefits: Readonly<Record<string, string>> = BENEFITS) {
  const root = await mkdtemp(join(tmpdir(), 'licence-'));
  return { root, licence: new LicenceService(root, { protector, logger, fetcher, now, instanceName: 'PC', organizationId: ORG, benefits, links: {} }) };
}

function bodyOf(fetcher: ReturnType<typeof vi.fn>, call: number): Record<string, unknown> {
  return JSON.parse((fetcher.mock.calls[call] as unknown as [string, { body: string }])[1].body) as Record<string, unknown>;
}

describe('LicenceService', () => {
  it('reports beta with no licence', async () => {
    const { licence } = await service(vi.fn());
    await licence.start();
    expect(licence.status()).toEqual({ beta: true, licensed: false, state: 'none', plan: licencePlan(false), freePlatforms: [] });
  });

  it('shares only https buy, terms and privacy links that are set', async () => {
    const root = await mkdtemp(join(tmpdir(), 'licence-'));
    const licence = new LicenceService(root, { protector, logger, fetcher: vi.fn(), instanceName: 'PC', links: { buy: 'https://example.com/buy', terms: 'http://example.com/terms', privacy: '' } });
    await licence.start();
    expect(licence.status()).toEqual({ beta: true, licensed: false, state: 'none', plan: licencePlan(false), links: { buy: 'https://example.com/buy' }, freePlatforms: [] });
  });

  it('activates a key with Polar, keeps it sealed on disk and never returns it', async () => {
    const fetcher = vi.fn(async () => reply(activated));
    const { root, licence } = await service(fetcher);
    const status = await licence.activate({ key: KEY });
    expect(status).toMatchObject({ licensed: true, state: 'active', keyHint: '…4D51', productName: 'StreamBridge Pro Lifetime', customerName: 'Sam' });
    expect(JSON.stringify(status)).not.toContain(KEY);
    const saved = await readFile(join(root, 'secrets', 'licence.json'), 'utf8');
    expect(saved).toContain(`sealed:${KEY}`);
    expect(saved).toContain('"activationId": "act-1"');
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.polar.sh/v1/customer-portal/license-keys/activate');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(bodyOf(fetcher, 0)).toEqual({ key: KEY, label: 'PC', meta: { app: 'StreamBridge' }, organization_id: ORG });
  });

  it('validates with the saved activation', async () => {
    const fetcher = vi.fn(async () => reply(activated));
    const { licence } = await service(fetcher);
    await licence.activate({ key: KEY });
    fetcher.mockResolvedValueOnce(reply(validated));
    await expect(licence.check()).resolves.toMatchObject({ licensed: true, state: 'active' });
    expect((fetcher.mock.calls[1] as unknown as [string])[0]).toMatch(/\/validate$/u);
    expect(bodyOf(fetcher, 1)).toEqual({ key: KEY, activation_id: 'act-1', organization_id: ORG });
  });

  it('says licences are not on sale yet while no Polar organization is set', async () => {
    const root = await mkdtemp(join(tmpdir(), 'licence-'));
    const fetcher = vi.fn();
    const licence = new LicenceService(root, { protector, logger, fetcher, instanceName: 'PC', organizationId: '', links: {} });
    await expect(licence.activate({ key: KEY })).rejects.toThrow('not on sale yet');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('refuses keys for another product and releases that activation', async () => {
    const fetcher = vi.fn(async () => reply({ ...activated, license_key: { ...licenceKey, benefit_id: 'other' } }));
    const { licence } = await service(fetcher);
    await expect(licence.activate({ key: KEY })).rejects.toThrow('not a StreamBridge licence');
    expect(String((fetcher.mock.calls as unknown as unknown[][])[1]?.[0])).toContain('/deactivate');
    expect(bodyOf(fetcher, 1)).toEqual({ key: KEY, activation_id: 'act-1', organization_id: ORG });
    expect(licence.status().state).toBe('none');
  });

  it('explains a full activation limit and an unknown key', async () => {
    const full = await service(vi.fn(async () => reply({ error: 'NotPermitted', detail: 'License key activation limit reached' }, 403)));
    await expect(full.licence.activate({ key: KEY })).rejects.toThrow('already active on as many PCs');
    const unknown = await service(vi.fn(async () => reply({ error: 'ResourceNotFound', detail: 'Not found' }, 404)));
    await expect(unknown.licence.activate({ key: KEY })).rejects.toThrow('was not found');
  });

  it('keeps a licence through short outages and server errors, and marks it unchecked after the grace period', async () => {
    let time = new Date('2026-11-10T00:00:00Z');
    const fetcher = vi.fn(async () => reply(activated));
    const { licence } = await service(fetcher, () => time);
    await licence.activate({ key: KEY });
    fetcher.mockRejectedValueOnce(new Error('offline'));
    time = new Date('2026-11-15T00:00:00Z');
    await expect(licence.check()).rejects.toThrow('offline');
    expect(licence.status()).toMatchObject({ licensed: true, state: 'active', lastError: expect.stringContaining('could not be reached') as unknown });
    fetcher.mockResolvedValueOnce(reply({ detail: 'busy' }, 503));
    await expect(licence.check()).rejects.toThrow('refused');
    expect(licence.status()).toMatchObject({ licensed: true, state: 'active' });
    time = new Date('2026-12-01T00:00:00Z');
    expect(licence.status()).toMatchObject({ licensed: false, state: 'unchecked' });
  });

  it('follows an ended licence on the next check and removes it from the PC', async () => {
    const fetcher = vi.fn(async () => reply(activated));
    const { licence } = await service(fetcher);
    await licence.activate({ key: KEY });
    fetcher.mockResolvedValueOnce(reply({ error: 'ResourceNotFound', detail: 'License key expired' }, 404));
    await expect(licence.check()).resolves.toMatchObject({ licensed: false, state: 'expired', lastError: 'This licence has expired.' });
    fetcher.mockResolvedValueOnce(reply(undefined, 204));
    await expect(licence.deactivate()).resolves.toEqual({ beta: true, licensed: false, state: 'none', plan: licencePlan(false), freePlatforms: [] });
  });

  it('treats a key past its end date as expired', async () => {
    const fetcher = vi.fn(async () => reply({ ...activated, license_key: { ...licenceKey, expires_at: '2026-11-01T00:00:00Z' } }));
    const { licence } = await service(fetcher);
    await expect(licence.activate({ key: KEY })).resolves.toMatchObject({ licensed: false, state: 'expired' });
  });

  it('forgets a key whose activation Polar no longer knows', async () => {
    const fetcher = vi.fn(async () => reply(activated));
    const { licence } = await service(fetcher);
    await licence.activate({ key: KEY });
    fetcher.mockResolvedValueOnce(reply({ error: 'ResourceNotFound', detail: 'Not found' }, 404));
    await expect(licence.deactivate()).resolves.toMatchObject({ state: 'none' });
  });

  it('sets aside a Lemon Squeezy licence saved during the beta', async () => {
    const { root, licence } = await service(vi.fn());
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(join(root, 'secrets'), { recursive: true });
    await writeFile(join(root, 'secrets', 'licence.json'), JSON.stringify({ version: 1, protectedKey: 'x', keyHint: '…1234', instanceId: 'i', instanceName: 'PC', status: 'active', activatedAt: 'a', lastCheckedAt: 'b' }));
    await licence.start();
    expect(licence.status().state).toBe('none');
  });

  it('rejects text that is not a key without calling the server', async () => {
    const fetcher = vi.fn();
    const { licence } = await service(fetcher);
    await expect(licence.activate({ key: 'nope' })).rejects.toThrow('Paste the licence key');
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('the free and Pro plan', () => {
  it('locks nothing during the beta', async () => {
    expect(PLAN_ENFORCED).toBe(false);
    const plan = licencePlan(false);
    expect(plan).toMatchObject({ tier: 'free', enforced: false, freePlatformLimit: FREE_PLATFORM_LIMIT });
    for (const id of PRO_MODULE_IDS) expect(moduleAllowed(plan, id)).toBe(true);
    expect(platformLimit(plan)).toBeUndefined();
  });

  it('names only real extensions as Pro and never the safety ones', async () => {
    const { readdir, readFile: read } = await import('node:fs/promises');
    const ids = new Set<string>();
    for (const folder of await readdir('addons')) {
      try { ids.add((JSON.parse(await read(join('addons', folder, 'module-package.json'), 'utf8')) as { manifest: { moduleId: string } }).manifest.moduleId); } catch { /* not an extension folder */ }
    }
    expect(new Set(PRO_MODULE_IDS).size).toBe(PRO_MODULE_IDS.length);
    for (const id of [...PRO_MODULE_IDS, ...ALWAYS_FREE_MODULE_IDS]) expect(ids, id).toContain(id);
    for (const id of ALWAYS_FREE_MODULE_IDS) expect(PRO_MODULE_IDS).not.toContain(id);
  });

  it('would limit a free PC and open everything for Pro once it is switched on', () => {
    const free = licencePlan(false, true);
    expect(moduleAllowed(free, 'thsv.village-jukebox')).toBe(false);
    expect(moduleAllowed(free, 'thsv.chat-guard')).toBe(true);
    expect(platformLimit(free)).toBe(2);
    const pro = licencePlan(true, true);
    expect(moduleAllowed(pro, 'thsv.village-jukebox')).toBe(true);
    expect(platformLimit(pro)).toBeUndefined();
  });

  it('reports Pro for an active licence', async () => {
    const { licence } = await service(vi.fn(async () => reply(activated)));
    expect((await licence.activate({ key: KEY })).plan.tier).toBe('pro');
  });
});

describe('the SlothBloom store', () => {
  it('uses Polar, offers only slothbloom.com links and accepts any StreamBridge benefit once listed', async () => {
    const { LICENCE_API_BASE, LICENCE_LINKS, LICENCE_BENEFITS, LICENCE_ORGANIZATION_ID } = await import('../../bridge/services/licence-service.js');
    expect(LICENCE_API_BASE).toBe('https://api.polar.sh/v1/customer-portal/license-keys');
    expect(LICENCE_ORGANIZATION_ID).toMatch(/^(?:|[0-9a-f-]{36})$/u);
    for (const id of Object.keys(LICENCE_BENEFITS)) expect(id).toMatch(/^[0-9a-f-]{36}$/u);
    for (const link of Object.values(LICENCE_LINKS)) if (link !== '') expect(link).toMatch(/^https:\/\/(?:buy\.polar\.sh|polar\.sh|www\.slothbloom\.com)\//u);
    const anyBenefit = await service(vi.fn(async () => reply({ ...activated, license_key: { ...licenceKey, benefit_id: 'whatever' } })), undefined, {});
    await expect(anyBenefit.licence.activate({ key: KEY })).resolves.toMatchObject({ licensed: true });
  });
});

describe('the plan applied at start', () => {
  const settings = { language: 'en', platforms: { twitch: { enabled: true }, streamlabs: { enabled: true }, youtube: { enabled: true }, kick: { enabled: false }, tiktok: { enabled: true }, facebook: { enabled: true } } };

  it('changes nothing while the plan is not enforced, or for Pro', () => {
    expect(settingsForPlan(licencePlan(false), settings)).toEqual({ config: settings, withheldPlatforms: [] });
    expect(settingsForPlan(licencePlan(false), settings).config).toBe(settings);
    expect(settingsForPlan(licencePlan(true, true), settings).config).toBe(settings);
  });

  it('keeps the first two streaming platforms for a free PC and never counts donation sources', () => {
    const planned = settingsForPlan(licencePlan(false, true), settings);
    expect(planned.withheldPlatforms).toEqual(['tiktok', 'facebook']);
    expect(Object.entries(planned.config.platforms).filter(([, platform]) => platform.enabled).map(([id]) => id)).toEqual(['twitch', 'streamlabs', 'youtube']);
    expect(planned.config.language).toBe('en');
    // The saved settings are never touched, so buying Pro brings every platform back at the next start.
    expect(settings.platforms.tiktok.enabled).toBe(true);
    expect(platformsForPlan(licencePlan(false, true), ['kick'])).toEqual({ allowed: ['kick'], withheld: [] });
  });

  it('reports the plan a run started with next to the current licence', async () => {
    const { licence } = await service(vi.fn(async () => reply(activated)));
    await licence.start();
    expect(licence.status().startedWith).toBeUndefined();
    licence.noteStart({ tier: 'free', enforced: true, withheldPlatforms: ['tiktok'], withheldModules: ['thsv.village-jukebox'] });
    const status = await licence.activate({ key: KEY });
    expect(status.plan.tier).toBe('pro');
    expect(status.startedWith).toEqual({ tier: 'free', enforced: true, withheldPlatforms: ['tiktok'], withheldModules: ['thsv.village-jukebox'] });
  });

  it('keeps the two platforms the creator picked, and fills an unused pick with the next one turned on', () => {
    expect(settingsForPlan(licencePlan(false, true), settings, ['facebook', 'tiktok']).withheldPlatforms).toEqual(['twitch', 'youtube']);
    // Kick is picked but turned off, so its place goes to the first platform that is on.
    expect(settingsForPlan(licencePlan(false, true), settings, ['kick', 'tiktok']).withheldPlatforms).toEqual(['youtube', 'facebook']);
    expect(settingsForPlan(licencePlan(false), settings, ['facebook']).config).toBe(settings);
    expect(cleanFreePlatformChoice(['tiktok', 'tiktok', 'streamlabs', 'kick', 'youtube', 3])).toEqual(['tiktok', 'kick']);
    expect(cleanFreePlatformChoice('twitch')).toEqual([]);
  });

  it('saves the free-platform choice for the next start and refuses more than two', async () => {
    const { licence, root } = await service(vi.fn(async () => reply(activated)));
    await licence.start();
    expect(licence.status().freePlatforms).toEqual([]);
    expect((await licence.chooseFreePlatforms({ platforms: ['youtube', 'kick'] })).freePlatforms).toEqual(['youtube', 'kick']);
    await expect(licence.chooseFreePlatforms({ platforms: ['twitch', 'youtube', 'kick'] })).rejects.toThrow('Pick up to 2');
    await expect(licence.chooseFreePlatforms({ platforms: ['twitch', 'twitch'] })).rejects.toThrow('Pick up to 2');
    await expect(licence.chooseFreePlatforms({ platforms: ['streamlabs'] })).rejects.toThrow('Pick up to 2');
    const again = new LicenceService(root, { protector, logger, fetcher: vi.fn(), organizationId: ORG, links: {} });
    await again.start();
    expect(again.status().freePlatforms).toEqual(['youtube', 'kick']);
  });
});

