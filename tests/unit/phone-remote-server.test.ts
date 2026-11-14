import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HostedPagesService } from '../../bridge/services/hosted-pages-service.js';
import { isPrivateAddress, PhoneRemoteServer, PhoneRemoteService } from '../../bridge/services/phone-remote-server.js';
import { silentLogger } from '../helpers.js';

const TOKEN = 'control-token-that-never-leaves-the-pc';

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, '127.0.0.1', done));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((done) => probe.close(() => done()));
  return port;
}

interface Answer { readonly status: number; readonly body: string; readonly headers: Record<string, unknown> }
async function call(port: number, path: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Answer> {
  return await new Promise((done, fail) => {
    const outgoing = httpRequest({ host: '127.0.0.1', port, path, method: options.method ?? 'GET', headers: { host: `127.0.0.1:${String(port)}`, ...(options.body === undefined ? {} : { 'content-type': 'application/json' }), ...options.headers } }, (answer) => {
      const chunks: Buffer[] = [];
      answer.on('data', (chunk: Buffer) => chunks.push(chunk));
      answer.on('end', () => done({ status: answer.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8'), headers: answer.headers }));
    });
    outgoing.on('error', fail);
    outgoing.end(options.body);
  });
}

describe('Phone Control Panel', () => {
  let root: string | undefined; let bridge: Server | undefined; let phone: PhoneRemoteService | undefined;
  afterEach(async () => {
    await phone?.stop(); phone = undefined;
    if (bridge !== undefined) await new Promise<void>((done) => bridge?.close(() => done()));
    bridge = undefined;
    if (root !== undefined) await rm(root, { recursive: true, force: true });
  });

  async function setUp(): Promise<{ port: number; devices: HostedPagesService; seen: { path: string; authorization: string | undefined; body: string }[] }> {
    root = await mkdtemp(join(tmpdir(), 'thsv-phone-'));
    const seen: { path: string; authorization: string | undefined; body: string }[] = [];
    bridge = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => { seen.push({ path: request.url ?? '', authorization: request.headers.authorization, body: Buffer.concat(chunks).toString('utf8') }); response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ tabs: [] })); });
    });
    await new Promise<void>((done) => bridge?.listen(0, '127.0.0.1', done));
    const bridgePort = (bridge.address() as AddressInfo).port;
    const port = await freePort();
    const devices = new HostedPagesService(join(root, 'phone-remote.json'), Date.now, { turnOn: 'Turn on the Phone Control Panel first.', devices: 'phones', device: 'Phone' });
    phone = new PhoneRemoteService(devices, new PhoneRemoteServer({ devices, port, bridgePort, controlToken: TOKEN, logger: silentLogger, wizardDirectory: resolve('wizard', 'browser') }), port, silentLogger);
    await phone.start();
    return { port, devices, seen };
  }

  it('stays off until the creator turns it on, and stops listening when turned off', async () => {
    const { port } = await setUp();
    expect(phone?.status()).toMatchObject({ enabled: false, listening: false, phones: [] });
    await expect(call(port, '/')).rejects.toThrow();
    expect(await phone?.setEnabled(true)).toMatchObject({ enabled: true, listening: true });
    expect((await call(port, '/')).status).toBe(200);
    expect(await phone?.setEnabled(false)).toMatchObject({ enabled: false, listening: false });
    await expect(call(port, '/')).rejects.toThrow();
  });

  it('serves only the Control Panel, with the phone script added', async () => {
    const { port } = await setUp(); await phone?.setEnabled(true);
    const page = await call(port, '/');
    expect(page.body).toContain('<script src="/wizard/phone.js"></script><script src="/wizard/control-panel.js">');
    expect(page.body).toContain('data-phone="1"');
    expect(page.body).toContain('/manifest.webmanifest');
    expect(page.headers['content-security-policy']).toContain("script-src 'self'");
    expect((await call(port, '/wizard/phone.js')).status).toBe(200);
    expect((await call(port, '/manifest.webmanifest')).status).toBe(200);
    for (const path of ['/wizard', '/wizard/', '/wizard/app.js', '/wizard/index.html', '/wizard/api/config', '/wizard/api/unlock-local', '/wizard/api/phone-remote', '/overlay', '/health']) expect((await call(port, path)).status, path).toBe(404);
  });

  it('needs a paired phone for every call, and swaps its key for the control token', async () => {
    const { port, seen } = await setUp(); await phone?.setEnabled(true);
    expect((await call(port, '/wizard/api/control-panel')).status).toBe(401);
    expect((await call(port, '/wizard/api/control-panel', { headers: { authorization: `Bearer ${TOKEN}` } })).status).toBe(401);
    expect((await call(port, '/wizard/api/control-panel', { method: 'DELETE' })).status).toBe(405);
    expect(seen).toHaveLength(0);

    const { code } = phone?.createCode() ?? { code: '' };
    expect((await call(port, '/phone/pair', { method: 'POST', body: JSON.stringify({ code: '000000' === code ? '111111' : '000000' }) })).status).toBe(401);
    const paired = await call(port, '/phone/pair', { method: 'POST', body: JSON.stringify({ code, name: 'iPhone' }) });
    expect(paired.status).toBe(201);
    const { key } = JSON.parse(paired.body) as { key: string };
    expect(phone?.status().phones.map((entry) => entry.name)).toEqual(['iPhone']);

    const answer = await call(port, '/wizard/api/control-panel/status', { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: JSON.stringify({ moduleId: 'x' }) });
    expect(answer.status).toBe(200);
    expect(seen).toEqual([{ path: '/wizard/api/control-panel/status', authorization: `Bearer ${TOKEN}`, body: '{"moduleId":"x"}' }]);
    expect(answer.body).not.toContain(TOKEN);

    await phone?.unpair(phone.status().phones[0]?.id ?? '');
    expect((await call(port, '/wizard/api/control-panel', { headers: { authorization: `Bearer ${key}` } })).status).toBe(401);
  });

  it('refuses other web pages and names', async () => {
    const { port } = await setUp(); await phone?.setEnabled(true);
    expect((await call(port, '/', { headers: { host: 'evil.example:1234' } })).status).toBe(421);
    expect((await call(port, '/phone/pair', { method: 'POST', headers: { origin: 'http://evil.example' }, body: '{}' })).status).toBe(403);
  });

  it('knows which addresses are home-network addresses', () => {
    for (const address of ['127.0.0.1', '::1', '10.0.0.5', '192.168.1.20', '172.16.0.1', '172.31.255.255']) expect(isPrivateAddress(address), address).toBe(true);
    for (const address of ['8.8.8.8', '172.32.0.1', '192.169.0.1', '100.64.0.1', 'fe80::1', '', '1.2.3']) expect(isPrivateAddress(address), address).toBe(false);
  });
});
