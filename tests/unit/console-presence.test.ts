import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ConsolePresenceService, ConsolePresenceVault, PlayStationPresenceClient, XboxPresenceClient,
  consoleTitleKey, normalizeNpsso, playstationTitleFromPresence, xboxTitleFromPresence,
  type ConsolePresenceSettings,
} from '../../bridge/services/console-presence.js';

const NPSSO = 'a'.repeat(64);
const XBOX_KEY = 'b1c2d3e4-f5a6-7890-abcd-ef1234567890';
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fakeProtector = { protect: vi.fn(async (value: string) => `protected:${Buffer.from(value).toString('base64')}`), unprotect: vi.fn(async (value: string) => Buffer.from(value.slice('protected:'.length), 'base64').toString('utf8')) };
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function vault(): Promise<ConsolePresenceVault> { const root = await mkdtemp(join(tmpdir(), 'thsv-console-')); roots.push(root); const created = new ConsolePresenceVault(root, { protector: fakeProtector }); await created.start(); return created; }

describe('console presence parsing', () => {
  it('reads the foreground Xbox game and skips the dashboard and apps', () => {
    expect(xboxTitleFromPresence([{ xuid: '1', state: 'Online', devices: [{ type: 'Scarlett', titles: [
      { id: '750323071', name: 'Home', placement: 'Background', state: 'Active' },
      { id: '1', name: 'YouTube', placement: 'Snapped', state: 'Active' },
      { id: '2', name: 'Forza Horizon 5', placement: 'Full', state: 'Active' },
    ] }] }])).toBe('Forza Horizon 5');
    expect(xboxTitleFromPresence({ xuid: '1', state: 'Online', devices: [{ titles: [{ name: 'Home', placement: 'Full', state: 'Active' }] }] })).toBe('');
    expect(xboxTitleFromPresence({ xuid: '1', state: 'Offline' })).toBe('');
    expect(xboxTitleFromPresence('nonsense')).toBe('');
  });

  it('reads the PlayStation game title', () => {
    expect(playstationTitleFromPresence({ basicPresence: { availability: 'availableToPlay', gameTitleInfoList: [{ npTitleId: 'PPSA01521_00', titleName: 'Horizon Forbidden West', format: 'PS5' }] } })).toBe('Horizon Forbidden West');
    expect(playstationTitleFromPresence({ basicPresence: { availability: 'unavailable' } })).toBe('');
  });

  it('matches names whatever the case, spacing or trademark signs', () => {
    expect(consoleTitleKey('  Halo   Infinite™ ')).toBe(consoleTitleKey('halo infinite'));
  });

  it('accepts the whole answer from Sony\'s NPSSO page', () => {
    expect(normalizeNpsso(`{"npsso":"${NPSSO}"}`)).toBe(NPSSO);
    expect(() => normalizeNpsso('short')).toThrow(/NPSSO/u);
  });
});

describe('Xbox client', () => {
  it('sends the key only in the OpenXBL header and reports a refused key plainly', async () => {
    const fetcher = vi.fn(async () => json([{ devices: [{ titles: [{ name: 'Halo Infinite', placement: 'Full', state: 'Active' }] }] }]));
    await expect(new XboxPresenceClient(fetcher as unknown as typeof fetch).currentTitle(XBOX_KEY)).resolves.toBe('Halo Infinite');
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://xbl.io/api/v2/presence');
    expect((init.headers as Record<string, string>)['X-Authorization']).toBe(XBOX_KEY);
    const refused = vi.fn(async () => json({ error: 'nope' }, 401));
    await expect(new XboxPresenceClient(refused as unknown as typeof fetch).currentTitle(XBOX_KEY)).rejects.toThrow('OpenXBL refused the API key. Save a new key.');
  });
});

describe('PlayStation client', () => {
  function psnFetcher(): ReturnType<typeof vi.fn> {
    return vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/oauth/authorize')) return new Response(null, { status: 302, headers: { location: 'com.scee.psxandroid.scecompcall://redirect/?code=v3.CODE123&cid=x' } });
      if (url.endsWith('/oauth/token')) {
        const body = new URLSearchParams(init?.body as string);
        if (body.get('grant_type') === 'authorization_code') return json({ access_token: 'access-1', expires_in: 3600, refresh_token: 'refresh-1', refresh_token_expires_in: 5_184_000 });
        return json({ access_token: 'access-2', expires_in: 3600, refresh_token: 'refresh-2', refresh_token_expires_in: 5_184_000 });
      }
      return json({ basicPresence: { gameTitleInfoList: [{ titleName: 'Astro Bot' }] } });
    });
  }

  it('exchanges the NPSSO, reuses the token, then refreshes it when it expires', async () => {
    let now = 1_000_000;
    const fetcher = psnFetcher();
    const redact = vi.fn();
    const client = new PlayStationPresenceClient(fetcher as unknown as typeof fetch, () => now, redact);
    await expect(client.currentTitle(NPSSO)).resolves.toBe('Astro Bot');
    const authorize = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(authorize[0]).toContain('client_id=09515159-7237-4370-9b40-3806e67c0891');
    expect((authorize[1].headers as Record<string, string>)['cookie']).toBe(`npsso=${NPSSO}`);
    expect(authorize[1].redirect).toBe('manual');
    expect(new URLSearchParams((fetcher.mock.calls[1] as unknown as [string, RequestInit])[1].body as string).get('code')).toBe('v3.CODE123');
    expect(((fetcher.mock.calls[2] as unknown as [string, RequestInit])[1].headers as Record<string, string>)['authorization']).toBe('Bearer access-1');
    expect(redact).toHaveBeenCalledWith('access-1');
    expect(redact).toHaveBeenCalledWith('refresh-1');

    await client.currentTitle(NPSSO);
    expect(fetcher).toHaveBeenCalledTimes(4);

    now += 2 * 3_600_000;
    await client.currentTitle(NPSSO);
    const refresh = new URLSearchParams((fetcher.mock.calls[4] as unknown as [string, RequestInit])[1].body as string);
    expect(refresh.get('grant_type')).toBe('refresh_token');
    expect(refresh.get('refresh_token')).toBe('refresh-1');
    expect(((fetcher.mock.calls[5] as unknown as [string, RequestInit])[1].headers as Record<string, string>)['authorization']).toBe('Bearer access-2');
  });

  it('says when the NPSSO is no longer accepted', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://my.account.sony.com/central/signin/?error=login_required' } }));
    await expect(new PlayStationPresenceClient(fetcher as unknown as typeof fetch).currentTitle(NPSSO)).rejects.toThrow(/did not accept the NPSSO/u);
  });
});

describe('console sign-in vault', () => {
  it('stores secrets only in protected form and reports saved or not saved', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-console-')); roots.push(root);
    const redact = vi.fn();
    const created = new ConsolePresenceVault(root, { protector: fakeProtector, redact });
    expect(created.status()).toEqual({ xbox: { saved: false }, playstation: { saved: false } });
    await created.configure({ xboxApiKey: XBOX_KEY, playstationNpsso: NPSSO });
    expect(created.status()).toEqual({ xbox: { saved: true }, playstation: { saved: true } });
    const file = await readFile(join(root, 'secrets', 'console-presence.json'), 'utf8');
    expect(file).not.toContain(XBOX_KEY);
    expect(file).not.toContain(NPSSO);
    expect(redact).toHaveBeenCalledWith(XBOX_KEY);
    const reloaded = new ConsolePresenceVault(root, { protector: fakeProtector });
    await expect(reloaded.secret('playstation')).resolves.toBe(NPSSO);
    await reloaded.configure({ clear: ['xbox'] });
    expect(reloaded.status().xbox.saved).toBe(false);
    await expect(reloaded.configure({ xboxApiKey: 'bad key!' })).rejects.toThrow(/OpenXBL API key/u);
  });
});

describe('console presence service', () => {
  function service(options: { settings?: Partial<ConsolePresenceSettings>; live?: boolean; xbox?: ReturnType<typeof vi.fn> } = {}) {
    const timers: Array<{ callback: () => void; delayMs: number }> = [];
    const emit = vi.fn(async () => {});
    const xbox = options.xbox ?? vi.fn(async () => 'Forza Horizon 5');
    const settings: ConsolePresenceSettings = { enabled: true, requireLive: true, intervalSeconds: 20, xbox: true, playstation: false, ...options.settings };
    let live = options.live ?? true;
    return {
      emit, xbox, timers, setLive: (value: boolean) => { live = value; },
      create: (store: ConsolePresenceVault) => new ConsolePresenceService({
        vault: store, xbox: { currentTitle: xbox as unknown as (key: string) => Promise<string> }, playstation: { currentTitle: vi.fn(async () => '') },
        settings: () => settings, isLive: () => live, emit, logger,
        setTimer: (callback, delayMs) => { timers.push({ callback, delayMs }); return timers.length; }, clearTimer: () => undefined,
      }),
    };
  }

  it('checks only while live and hands each new game to Category Pilot once', async () => {
    const store = await vault(); await store.configure({ xboxApiKey: XBOX_KEY });
    const test = service({ live: false });
    const presence = test.create(store);
    presence.start();
    expect(test.timers).toHaveLength(0);
    test.setLive(true); presence.refresh();
    expect(test.timers).toHaveLength(1);
    await presence.tick('xbox');
    await presence.tick('xbox');
    expect(test.xbox).toHaveBeenCalledTimes(2);
    expect(test.xbox).toHaveBeenCalledWith(XBOX_KEY);
    expect(test.emit).toHaveBeenCalledOnce();
    expect(test.emit).toHaveBeenCalledWith({ platform: 'xbox', titleName: 'Forza Horizon 5' });
    expect(test.timers.at(-1)?.delayMs).toBe(30_000);
    expect(presence.status().xbox).toMatchObject({ saved: true, enabled: true, titleName: 'Forza Horizon 5' });
    expect(presence.status().playstation).toMatchObject({ saved: false, enabled: false });
    presence.stop();
  });

  it('does nothing without a saved key or with the platform switched off', async () => {
    const store = await vault();
    const test = service();
    const presence = test.create(store); presence.start();
    await presence.tick('xbox');
    expect(test.xbox).not.toHaveBeenCalled();
    await store.configure({ xboxApiKey: XBOX_KEY });
    const off = service({ settings: { xbox: false } }); const presenceOff = off.create(store); presenceOff.start();
    await presenceOff.tick('xbox');
    expect(off.xbox).not.toHaveBeenCalled();
  });

  it('backs off after errors and never logs the key', async () => {
    const store = await vault(); await store.configure({ xboxApiKey: XBOX_KEY });
    const failing = vi.fn(async () => { throw new Error(`network down for ${XBOX_KEY}`); });
    const test = service({ xbox: failing });
    const presence = test.create(store); presence.start();
    await presence.tick('xbox');
    expect(test.timers.at(-1)?.delayMs).toBe(60_000);
    await presence.tick('xbox');
    expect(test.timers.at(-1)?.delayMs).toBe(120_000);
    expect(presence.status().xbox.error).toBe('The check could not reach the service.');
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(XBOX_KEY);
    expect(test.emit).not.toHaveBeenCalled();
  });
});
