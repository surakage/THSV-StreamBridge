import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { HostedPagesError, HostedPagesService } from '../../bridge/services/hosted-pages-service.js';
import { MutableRequestGuard } from '../../bridge/services/request-guard.js';

function request(headers: Record<string, string>, method = 'GET'): IncomingMessage {
  return { method, headers: { host: '127.0.0.1:8787', ...headers }, socket: { remoteAddress: '127.0.0.1' } } as unknown as IncomingMessage;
}

describe('HostedPagesService', () => {
  let root: string | undefined;
  afterEach(async () => { if (root !== undefined) await rm(root, { recursive: true, force: true }); });

  it('stays off until turned on, and only ever accepts the SlothBloom addresses', async () => {
    root = await mkdtemp(join(tmpdir(), 'thsv-hosted-'));
    const service = new HostedPagesService(join(root, 'configuration', 'hosted-pages.json')); await service.start();
    expect(service.status()).toMatchObject({ enabled: false, browsers: [] });
    expect(service.allowsOrigin('https://app.slothbloom.com')).toBe(false);
    expect(() => service.createCode()).toThrow(HostedPagesError);
    await service.setEnabled(true);
    expect(service.allowsOrigin('https://app.slothbloom.com')).toBe(true);
    for (const origin of [undefined, 'https://slothbloom.com', 'https://www.slothbloom.com', 'http://app.slothbloom.com', 'https://app.slothbloom.com.evil.example', 'https://evil.example', 'null']) expect(service.allowsOrigin(origin), String(origin)).toBe(false);
  });

  it('pairs a browser with a one-time code, keeps only a hash of its key, and can remove it', async () => {
    root = await mkdtemp(join(tmpdir(), 'thsv-hosted-'));
    const path = join(root, 'configuration', 'hosted-pages.json');
    let now = Date.parse('2026-11-10T12:00:00Z');
    const service = new HostedPagesService(path, () => now); await service.start(); await service.setEnabled(true);
    const { code } = service.createCode();
    expect(code).toMatch(/^\d{6}$/u);
    const paired = await service.pair({ code, name: ' Laptop ' });
    expect(service.status().browsers).toEqual([{ id: paired.id, name: 'Laptop', pairedAt: '2026-11-10T12:00:00.000Z' }]);
    expect(await readFile(path, 'utf8')).not.toContain(paired.key);
    expect(service.authorizes(`Bearer ${paired.key}`)).toBe(true);
    expect(service.authorizes('Bearer wrong')).toBe(false);
    await expect(service.pair({ code })).rejects.toMatchObject({ statusCode: 401 });

    const restarted = new HostedPagesService(path, () => now); await restarted.start();
    expect(restarted.authorizes(`Bearer ${paired.key}`)).toBe(true);
    await restarted.unpair(paired.id);
    expect(restarted.authorizes(`Bearer ${paired.key}`)).toBe(false);

    const expiring = service.createCode();
    now += 5 * 60_000;
    await expect(service.pair({ code: expiring.code })).rejects.toMatchObject({ statusCode: 401 });
    await service.setEnabled(false);
    expect(service.authorizes(`Bearer ${paired.key}`)).toBe(false);
  });

  it('drops a code after five wrong tries', async () => {
    root = await mkdtemp(join(tmpdir(), 'thsv-hosted-'));
    const service = new HostedPagesService(join(root, 'hosted-pages.json')); await service.start(); await service.setEnabled(true);
    const { code } = service.createCode();
    const wrong = code === '000000' ? '000001' : '000000';
    for (let attempt = 0; attempt < 5; attempt += 1) await expect(service.pair({ code: wrong })).rejects.toMatchObject({ statusCode: 401 });
    await expect(service.pair({ code })).rejects.toMatchObject({ statusCode: 401 });
  });

  it('lets a SlothBloom page in with a paired key only, and never with the control token', async () => {
    root = await mkdtemp(join(tmpdir(), 'thsv-hosted-'));
    const service = new HostedPagesService(join(root, 'hosted-pages.json')); await service.start(); await service.setEnabled(true);
    const { key } = await service.pair({ code: service.createCode().code });
    const guard = new MutableRequestGuard('control-token', [], 60, 4, undefined, service);
    const origin = 'https://app.slothbloom.com';
    expect(() => guard.acquire(request({ origin, authorization: `Bearer ${key}` }), false)()).not.toThrow();
    expect(() => guard.acquire(request({ origin, authorization: 'Bearer control-token' }), false)).toThrow(/control token/u);
    // The key is useless anywhere but the SlothBloom pages.
    expect(() => guard.acquire(request({ authorization: `Bearer ${key}` }), false)).toThrow(/control token/u);
    expect(() => guard.acquire(request({ origin: 'https://evil.example', authorization: `Bearer ${key}` }), false)).toThrow(/origin/u);
    expect(() => guard.acquire(request({ authorization: 'Bearer control-token' }), false)()).not.toThrow();
    await service.setEnabled(false);
    expect(() => guard.acquire(request({ origin, authorization: `Bearer ${key}` }), false)).toThrow(/origin/u);
  });
});
