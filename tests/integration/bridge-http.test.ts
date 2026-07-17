import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket, { type RawData } from 'ws';
import { DiagnosticsServer } from '../../bridge/services/http-server.js';
import { BrowserOverlayHub } from '../../bridge/services/browser-overlay-hub.js';
import { createTestBridge, fixture, silentLogger, TEST_CONTROL_TOKEN, testConfig } from '../helpers.js';
import type { StreamBridge } from '../../bridge/core/bridge.js';

const stops: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.allSettled(stops.splice(0).map((stop) => stop())); });

async function runningService(maxPayloadBytes = 262_144): Promise<{ bridge: StreamBridge; server: DiagnosticsServer; baseUrl: string }> {
  const config = await testConfig();
  config.service.port = 0;
  config.security.maxPayloadBytes = maxPayloadBytes;
  const bridge = createTestBridge(config);
  const server = new DiagnosticsServer({ ...config.service, ...config.security }, bridge, silentLogger, TEST_CONTROL_TOKEN);
  await bridge.start();
  await server.start();
  stops.push(async () => { await server.stop(); await bridge.stop(); });
  return { bridge, server, baseUrl: `http://127.0.0.1:${String(server.port)}` };
}

describe('bridge HTTP integration', () => {
  it('accepts a valid event, rejects its duplicate, and reports health', async () => {
    const { baseUrl } = await runningService();
    const event = await fixture();
    const options = { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TEST_CONTROL_TOKEN}` }, body: JSON.stringify(event) };
    const first = await fetch(`${baseUrl}/simulate`, options);
    const second = await fetch(`${baseUrl}/simulate`, options);
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    const health = await fetch(`${baseUrl}/health`).then((response) => response.json()) as { status: string; lastAcceptedEventAt?: string };
    const readiness = await fetch(`${baseUrl}/ready`);
    expect(health.status).toBe('healthy');
    expect(health.lastAcceptedEventAt).toBeTypeOf('string');
    expect(readiness.status).toBe(200);
  });

  it('rejects invalid and oversized payloads', async () => {
    const { baseUrl } = await runningService(1_024);
    const invalid = await fetch(`${baseUrl}/simulate`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TEST_CONTROL_TOKEN}` }, body: '{}' });
    const oversized = await fetch(`${baseUrl}/simulate`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TEST_CONTROL_TOKEN}` }, body: JSON.stringify({ padding: 'x'.repeat(2_000) }) });
    expect(invalid.status).toBe(400);
    expect(oversized.status).toBe(413);
  });

  it('rejects unauthenticated, non-JSON, and browser-origin mutation requests', async () => {
    const { baseUrl } = await runningService();
    const event = JSON.stringify(await fixture());
    const unauthorized = await fetch(`${baseUrl}/simulate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: event });
    const textPlain = await fetch(`${baseUrl}/simulate`, { method: 'POST', headers: { authorization: `Bearer ${TEST_CONTROL_TOKEN}`, 'content-type': 'text/plain' }, body: event });
    const browser = await fetch(`${baseUrl}/simulate`, { method: 'POST', headers: { authorization: `Bearer ${TEST_CONTROL_TOKEN}`, 'content-type': 'application/json', origin: 'https://attacker.example' }, body: event });
    expect(unauthorized.status).toBe(401);
    expect(textPlain.status).toBe(415);
    expect(browser.status).toBe(403);
    expect(browser.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('forces simulation identity instead of trusting caller metadata', async () => {
    const { bridge, baseUrl } = await runningService();
    let observed: Awaited<ReturnType<typeof fixture>> | undefined;
    const unsubscribe = bridge.subscribe((event) => { observed = event; });
    const event = { ...(await fixture()), source: { adapter: 'forged', eventName: 'ChatMessage' }, metadata: { simulated: false } };
    const response = await fetch(`${baseUrl}/simulate`, {
      method: 'POST', headers: { authorization: `Bearer ${TEST_CONTROL_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(event),
    });
    unsubscribe();
    expect(response.status).toBe(202);
    expect(observed?.metadata.simulated).toBe(true);
    expect(observed?.source.adapter).toBe('mock');
  });

  it('protects shutdown with the control token', async () => {
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
  });

  it('protects runtime timed-action start, pause, resume, and stop controls', async () => {
    const { baseUrl } = await runningService();
    expect((await fetch(`${baseUrl}/timed-actions/start`, { method: 'POST' })).status).toBe(401);
    for (const operation of ['start', 'pause', 'resume', 'stop']) {
      const response = await fetch(`${baseUrl}/timed-actions/${operation}`, { method: 'POST', headers: { authorization: `Bearer ${TEST_CONTROL_TOKEN}` } });
      expect(response.status).toBe(200);
    }
    const diagnostics = await fetch(`${baseUrl}/diagnostics`).then((response) => response.json()) as { timedActions: { active: boolean } };
    expect(diagnostics.timedActions.active).toBe(false);
  });

  it('serves a generic browser-source overlay and broadcasts projected public events over loopback WebSocket', async () => {
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
    const page = await fetch(`${baseUrl}/overlay/`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(page.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(page.headers.get('content-security-policy')).toContain("worker-src 'self'");
    for (const route of ['/overlay/chat', '/overlay/alerts']) {
      const section = await fetch(`${baseUrl}${route}`);
      expect(section.status).toBe(200);
      expect(section.headers.get('content-type')).toContain('text/html');
    }
    const meldChat = await fetch(`${baseUrl}/overlay/chat?layout=meld&canvasWidth=1920&canvasHeight=1080&verticalScale=0.402`);
    expect(meldChat.status).toBe(200);
    expect(meldChat.headers.get('cache-control')).toBe('no-store');
    expect(await meldChat.text()).toContain('/overlay/app-0.9.9.js');
    expect((await fetch(`${baseUrl}/overlay/styles-0.9.9.css`)).status).toBe(200);
    const worker = await fetch(`${baseUrl}/overlay/worker-0.9.9.js`);
    expect(worker.status).toBe(200);
    expect(worker.headers.get('content-type')).toContain('text/javascript');
    expect(await worker.text()).toContain('for (const port of ports)');
    expect(await fetch(`${baseUrl}/overlay/config`).then((response) => response.json())).toMatchObject({
      brandLabel: 'THE HIDDEN SLOTH VILLAGE', maxChatMessages: 8, maxAlertQueue: 20, alertDurationMs: 7000,
    });

    const messages: Array<Record<string, unknown>> = [];
    const socket = new WebSocket(`${baseUrl.replace('http:', 'ws:')}/overlay/events`);
    socket.on('message', (data) => messages.push(JSON.parse(rawDataText(data)) as Record<string, unknown>));
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    await bridge.simulate(await fixture());
    await expect.poll(() => messages.some((message) => message['kind'] === 'chat.add')).toBe(true);
    expect(hub.status()).toMatchObject({ clients: 1, published: 1 });
    socket.close();
  });

  it('rate-limits mutable requests', async () => {
    const config = await testConfig();
    config.service.port = 0;
    config.security.maxRequestsPerMinute = 1;
    const bridge = createTestBridge(config);
    const server = new DiagnosticsServer({ ...config.service, ...config.security }, bridge, silentLogger, TEST_CONTROL_TOKEN);
    await bridge.start();
    await server.start();
    stops.push(async () => { await server.stop(); await bridge.stop(); });
    const options = { method: 'POST', headers: { authorization: `Bearer ${TEST_CONTROL_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(await fixture()) };
    const baseUrl = `http://127.0.0.1:${String(server.port)}`;
    expect((await fetch(`${baseUrl}/simulate`, options)).status).toBe(202);
    expect((await fetch(`${baseUrl}/simulate`, options)).status).toBe(429);
  });

  it('stops cleanly', async () => {
    const { bridge, server } = await runningService();
    await server.stop();
    await bridge.stop();
    expect(bridge.health()['status']).toBe('stopped');
  });

  it('reports a clear port conflict', async () => {
    const first = await runningService();
    const config = await testConfig();
    config.service.port = first.server.port;
    const secondBridge = createTestBridge(config);
    const secondServer = new DiagnosticsServer({ ...config.service, ...config.security }, secondBridge, silentLogger, TEST_CONTROL_TOKEN);
    await secondBridge.start();
    stops.push(() => secondBridge.stop());
    await expect(secondServer.start()).rejects.toThrow('Port conflict');
  });
});

function rawDataText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}
