import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DiagnosticsServer } from '../../bridge/services/http-server.js';
import { HostedPagesService } from '../../bridge/services/hosted-pages-service.js';
import { WizardService } from '../../bridge/services/wizard-service.js';
import { createTestBridge, silentLogger, TEST_CONTROL_TOKEN, testConfig } from '../helpers.js';

const stops: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.allSettled(stops.splice(0).map((stop) => stop())); });

const SITE = 'https://app.slothbloom.com';
const local = { authorization: `Bearer ${TEST_CONTROL_TOKEN}`, 'content-type': 'application/json' };

async function start(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'thsv-hosted-http-'));
  const hosted = new HostedPagesService(join(root, 'hosted-pages.json')); await hosted.start();
  const config = await testConfig(); config.service.port = 0;
  const bridge = createTestBridge(config);
  const server = new DiagnosticsServer({ ...config.service, ...config.security }, bridge, silentLogger, TEST_CONTROL_TOKEN, undefined, undefined, new WizardService(undefined), 'data', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, hosted);
  await bridge.start(); await server.start();
  stops.push(async () => { await server.stop(); await bridge.stop(); await rm(root, { recursive: true, force: true }); });
  return `http://127.0.0.1:${String(server.port)}`;
}

describe('SlothBloom pages over HTTP', () => {
  it('answers nothing to the site while switched off', async () => {
    const base = await start();
    const preflight = await fetch(`${base}/wizard/api/hosted-pages/pair`, { method: 'OPTIONS', headers: { origin: SITE, 'access-control-request-method': 'POST' } });
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
    const pair = await fetch(`${base}/wizard/api/hosted-pages/pair`, { method: 'POST', headers: { origin: SITE, 'content-type': 'application/json' }, body: JSON.stringify({ code: '123456' }) });
    expect(pair.status).toBe(403);
    expect(await (await fetch(`${base}/wizard/api/hosted-pages`, { headers: local })).json()).toMatchObject({ enabled: false, browsers: [] });
    expect((await fetch(`${base}/wizard/api/hosted-pages`)).status).toBe(401);
  });

  it('pairs a browser from the site and keeps management on the PC', async () => {
    const base = await start();
    expect((await fetch(`${base}/wizard/api/hosted-pages`, { method: 'PUT', headers: local, body: JSON.stringify({ enabled: true }) })).status).toBe(403);
    expect((await fetch(`${base}/wizard/api/hosted-pages`, { method: 'PUT', headers: local, body: JSON.stringify({ enabled: true, approvedByCreator: true }) })).status).toBe(200);

    const preflight = await fetch(`${base}/wizard/api/hosted-pages/pair`, { method: 'OPTIONS', headers: { origin: SITE, 'access-control-request-method': 'POST' } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(SITE);
    expect(preflight.headers.get('access-control-allow-private-network')).toBe('true');
    const stranger = await fetch(`${base}/wizard/api/hosted-pages/pair`, { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
    expect(stranger.headers.get('access-control-allow-origin')).toBeNull();

    const { code } = await (await fetch(`${base}/wizard/api/hosted-pages/code`, { method: 'POST', headers: local })).json() as { code: string };
    const paired = await fetch(`${base}/wizard/api/hosted-pages/pair`, { method: 'POST', headers: { origin: SITE, 'content-type': 'application/json' }, body: JSON.stringify({ code, name: 'Laptop' }) });
    expect(paired.status).toBe(201);
    expect(paired.headers.get('access-control-allow-origin')).toBe(SITE);
    const { id, key } = await paired.json() as { id: string; key: string };
    const site = { origin: SITE, authorization: `Bearer ${key}`, 'content-type': 'application/json' };

    // The paired page cannot manage pairing, make codes, or use the key without the site address.
    expect((await fetch(`${base}/wizard/api/hosted-pages`, { headers: site })).status).toBe(403);
    expect((await fetch(`${base}/wizard/api/hosted-pages/code`, { method: 'POST', headers: site })).status).toBe(403);
    expect((await fetch(`${base}/wizard/api/access`, { method: 'PUT', headers: site, body: JSON.stringify({ mode: 'this-pc', approvedByCreator: true }) })).status).toBe(403);
    expect((await fetch(`${base}/wizard/api/hosted-pages`, { headers: { authorization: `Bearer ${key}` } })).status).toBe(401);
    expect((await fetch(`${base}/wizard/api/unlock-local`, { method: 'POST', headers: { origin: SITE, 'content-type': 'application/json', 'x-thsv-wizard-tab': 'tab' }, body: '{}' })).status).toBe(403);

    const removed = await (await fetch(`${base}/wizard/api/hosted-pages/browsers/${id}`, { method: 'DELETE', headers: local })).json() as { browsers: unknown[] };
    expect(removed.browsers).toEqual([]);
  });
});
