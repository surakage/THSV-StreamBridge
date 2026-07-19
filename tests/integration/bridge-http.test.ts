import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiagnosticsServer } from '../../bridge/services/http-server.js';
import { BrowserOverlayHub } from '../../bridge/services/browser-overlay-hub.js';
import { createTestBridge, fixture, silentLogger, TEST_CONTROL_TOKEN, testConfig } from '../helpers.js';
import type { StreamBridge } from '../../bridge/core/bridge.js';

const stops: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.allSettled(stops.splice(0).map((stop) => stop())); });

async function runningService(maxPayloadBytes = 262_144): Promise<{ bridge: StreamBridge; baseUrl: string }> {
  const config = await testConfig();
  config.service.port = 0;
  config.security.maxPayloadBytes = maxPayloadBytes;
  const bridge = createTestBridge(config);
  const server = new DiagnosticsServer({ ...config.service, ...config.security }, bridge, silentLogger, TEST_CONTROL_TOKEN);
  await bridge.start();
  await server.start();
  stops.push(async () => { await server.stop(); await bridge.stop(); });
  return { bridge, baseUrl: `http://127.0.0.1:${String(server.port)}` };
}

describe('bridge HTTP integration', () => {
  it('accepts a valid event, ignores its duplicate, and reports health and readiness', async () => {
    const { baseUrl } = await runningService();
    const body = JSON.stringify(await fixture());
    const options = { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TEST_CONTROL_TOKEN}` }, body };
    expect((await fetch(`${baseUrl}/simulate`, options)).status).toBe(202);
    const duplicate = await fetch(`${baseUrl}/simulate`, options);
    expect(duplicate.status).toBe(202);
    expect(await duplicate.json()).toMatchObject({ accepted: true, duplicate: true });
    expect(await fetch(`${baseUrl}/health`).then((response) => response.json())).toMatchObject({ status: 'healthy' });
    expect((await fetch(`${baseUrl}/ready`)).status).toBe(200);
  });

  it('publishes a financial alert only once when the same source event is ingested twice', async () => {
    const config = await testConfig();
    const bridge = createTestBridge(config);
    const hub = new BrowserOverlayHub(silentLogger, config.browserOverlay);
    bridge.subscribe((event) => hub.publish(event));
    await bridge.start();
    stops.push(async () => bridge.stop());
    const event = await fixture('youtube-super-chat.json');
    expect(await bridge.ingest(event)).toMatchObject({ accepted: true, duplicate: false });
    expect(await bridge.ingest(event)).toMatchObject({ accepted: true, duplicate: true });
    expect(hub.status()).toMatchObject({ published: 1 });
  });

  it('rejects invalid, oversized, unauthenticated, and browser-origin mutation requests', async () => {
    const { baseUrl } = await runningService(1_024);
    const headers = { authorization: `Bearer ${TEST_CONTROL_TOKEN}`, 'content-type': 'application/json' };
    expect((await fetch(`${baseUrl}/simulate`, { method: 'POST', headers, body: '{}' })).status).toBe(400);
    expect((await fetch(`${baseUrl}/simulate`, { method: 'POST', headers, body: JSON.stringify({ padding: 'x'.repeat(2_000) }) })).status).toBe(413);
    expect((await fetch(`${baseUrl}/simulate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(await fixture()) })).status).toBe(401);
    expect((await fetch(`${baseUrl}/simulate`, { method: 'POST', headers: { ...headers, origin: 'https://attacker.example' }, body: JSON.stringify(await fixture()) })).status).toBe(403);
    expect((await fetch(`${baseUrl}/simulate`, { method: 'POST', headers: { ...headers, 'content-encoding': 'gzip' }, body: '{}' })).status).toBe(415);
  });

  it('forces simulation provenance instead of trusting caller metadata', async () => {
    const { bridge, baseUrl } = await runningService();
    const observed: unknown[] = [];
    const unsubscribe = bridge.subscribe((event) => { observed.push(event); });
    const input = await fixture();
    const response = await fetch(`${baseUrl}/simulate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TEST_CONTROL_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ...input, source: { adapter: 'forged', eventName: 'ChatMessage' }, metadata: { simulated: false } }),
    });
    unsubscribe();
    expect(response.status).toBe(202);
    expect(observed[0]).toMatchObject({ source: { adapter: 'mock' }, metadata: { simulated: true } });
  });

  it('protects shutdown and timed-action controls with the control token', async () => {
    const config = await testConfig();
    config.service.port = 0;
    const bridge = createTestBridge(config);
    const shutdown = vi.fn();
    const server = new DiagnosticsServer({ ...config.service, ...config.security }, bridge, silentLogger, TEST_CONTROL_TOKEN, shutdown);
    await bridge.start();
    await server.start();
    stops.push(async () => { await server.stop(); await bridge.stop(); });
    const baseUrl = `http://127.0.0.1:${String(server.port)}`;
    expect((await fetch(`${baseUrl}/shutdown`, { method: 'POST' })).status).toBe(401);
    expect((await fetch(`${baseUrl}/shutdown`, { method: 'POST', headers: { authorization: `Bearer ${TEST_CONTROL_TOKEN}` } })).status).toBe(202);
    await expect.poll(() => shutdown).toHaveBeenCalledOnce();
    for (const operation of ['start', 'pause', 'resume', 'stop']) {
      expect((await fetch(`${baseUrl}/timed-actions/${operation}`, { method: 'POST', headers: { authorization: `Bearer ${TEST_CONTROL_TOKEN}` } })).status).toBe(200);
    }
  });

  it('does not expose archived progression, companion, or companion-overlay routes', async () => {
    const { baseUrl } = await runningService();
    expect((await fetch(`${baseUrl}/viewer-progression/adjust`, { method: 'POST' })).status).toBe(404);
    expect((await fetch(`${baseUrl}/companion/actions`, { method: 'POST' })).status).toBe(404);
    expect((await fetch(`${baseUrl}/overlay/companion`)).status).toBe(404);
  });

  it('serves the core browser surfaces and keeps unknown add-on overlays closed', async () => {
    const config = await testConfig();
    config.service.port = 0;
    const bridge = createTestBridge(config);
    const hub = new BrowserOverlayHub(silentLogger, config.browserOverlay);
    bridge.subscribe((event) => hub.publish(event));
    const server = new DiagnosticsServer({ ...config.service, ...config.security }, bridge, silentLogger, TEST_CONTROL_TOKEN, undefined, hub);
    await bridge.start();
    await server.start();
    stops.push(async () => { await server.stop(); await bridge.stop(); });
    const baseUrl = `http://127.0.0.1:${String(server.port)}`;
    for (const route of ['/overlay/', '/overlay/chat', '/overlay/chat/dock', '/overlay/alerts']) {
      const response = await fetch(`${baseUrl}${route}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
    }
    const source = await fetch(`${baseUrl}/overlay/app-1.4.0.js`).then((response) => response.text());
    expect(source).not.toContain('companion');
    expect((await fetch(`${baseUrl}/overlay/alert-queue-1.2.2.js`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/overlay/worker-1.3.1.js`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/overlay/styles-1.3.0.css`)).status).toBe(200);
    expect(await fetch(`${baseUrl}/overlay/config`).then((response) => response.json())).toEqual(config.browserOverlay);
    expect((await fetch(`${baseUrl}/overlay/addons/unknown.module`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/overlay/addons/host.js`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/overlay/addons/host.css`)).status).toBe(200);
  });
});
