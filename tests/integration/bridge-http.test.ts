import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiagnosticsServer } from '../../bridge/services/http-server.js';
import { BrowserOverlayHub } from '../../bridge/services/browser-overlay-hub.js';
import { createTestBridge, fixture, silentLogger, TEST_CONTROL_TOKEN, testConfig } from '../helpers.js';
import type { StreamBridge } from '../../bridge/core/bridge.js';
import { ModuleRegistry } from '../../bridge/core/module-registry.js';
import { CommandDirectoryService } from '../../bridge/services/command-directory.js';

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
  it('serves the public command page and JSON but protects the portable export', async () => {
    const config = await testConfig();
    config.service.port = 0;
    config.commands = { enabled: true, prefix: '!', definitions: [{ name: 'hello', aliases: ['hi'], minimumRole: 'viewer', allowBots: false, source: 'manual' }] };
    const bridge = createTestBridge(config);
    const directory = new CommandDirectoryService(config, new ModuleRegistry([], silentLogger), { publishUrl: '', tokenFile: '' });
    const server = new DiagnosticsServer({ ...config.service, ...config.security }, bridge, silentLogger, TEST_CONTROL_TOKEN, undefined, undefined, undefined, 'data', directory);
    await bridge.start();
    await server.start();
    stops.push(async () => { await server.stop(); await bridge.stop(); });
    const baseUrl = `http://127.0.0.1:${String(server.port)}`;

    const page = await fetch(`${baseUrl}/commands`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('!hello');
    const catalogue = await fetch(`${baseUrl}/commands/catalog.json`);
    expect(catalogue.status).toBe(200);
    expect(await catalogue.json()).toMatchObject({ commandCount: 2, privacy: 'public-command-metadata-only' });
    expect((await fetch(`${baseUrl}/wizard/api/commands/directory`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/wizard/api/commands/directory/moderator`)).status).toBe(401);
    const directoryStatus = await fetch(`${baseUrl}/wizard/api/commands/directory`, { headers: { authorization: `Bearer ${TEST_CONTROL_TOKEN}` } });
    expect(directoryStatus.status).toBe(200);
    expect(await directoryStatus.json()).toMatchObject({ commandCount: 2, publishing: { enabled: false, state: 'disabled' } });
    const moderatorStatus = await fetch(`${baseUrl}/wizard/api/commands/directory/moderator`, { headers: { authorization: `Bearer ${TEST_CONTROL_TOKEN}` } });
    expect(moderatorStatus.status).toBe(200);
    expect(await moderatorStatus.json()).toMatchObject({ commandCount: 0, audience: 'moderator', privacy: 'authenticated-moderator-command-metadata-only' });
    for (const method of ['POST', 'DELETE']) {
      expect((await fetch(`${baseUrl}/wizard/api/commands/directory/publish`, { method })).status).toBe(401);
      expect((await fetch(`${baseUrl}/wizard/api/commands/directory/publish`, { method, headers: { authorization: `Bearer ${TEST_CONTROL_TOKEN}` } })).status).toBe(409);
    }
    expect((await fetch(`${baseUrl}/wizard/api/commands/directory/export`)).status).toBe(401);
    const exported = await fetch(`${baseUrl}/wizard/api/commands/directory/export`, { headers: { authorization: `Bearer ${TEST_CONTROL_TOKEN}` } });
    expect(exported.status).toBe(200);
    expect(exported.headers.get('content-disposition')).toContain('thsv-stream-commands.html');
  });

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
    expect((await fetch(`${baseUrl}/simulate`, { method: 'POST', headers, body: JSON.stringify({ eventType: 'system.timed' }) })).status).toBe(400);
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
    const source = await fetch(`${baseUrl}/overlay/app-1.4.8.js`).then((response) => response.text());
    expect(source).not.toContain('companion');
    expect((await fetch(`${baseUrl}/overlay/alert-queue-1.2.2.js`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/overlay/alert-queue-1.2.3.js`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/overlay/worker-1.3.1.js`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/overlay/worker-1.3.3.js`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/overlay/styles-1.3.7.css`)).status).toBe(200);
    expect(await fetch(`${baseUrl}/overlay/config`).then((response) => response.json())).toEqual(config.browserOverlay);
    expect((await fetch(`${baseUrl}/overlay/addons/unknown.module`)).status).toBe(404);
    const addOnHost = await fetch(`${baseUrl}/overlay/addons/host.js`);
    expect(addOnHost.status).toBe(200);
    expect(addOnHost.headers.get('content-security-policy')).toContain('frame-src https://clips.twitch.tv https://www.youtube.com https://www.youtube-nocookie.com');
    expect(addOnHost.headers.get('content-security-policy')).toContain("style-src 'self' 'unsafe-inline'");
    expect(addOnHost.headers.get('content-security-policy')).toContain("media-src 'self' blob:");
    expect((await fetch(`${baseUrl}/overlay/addons/host.css`)).status).toBe(200);
  });

  it('keeps dock sending local, session-bound, platform-scoped, and character-limited', async () => {
    const config = await testConfig();
    config.service.port = 0;
    const bridge = createTestBridge(config);
    const send = vi.fn(async () => [{ platform: 'twitch' as const, accepted: true, parts: 1 }]);
    const server = new DiagnosticsServer(
      { ...config.service, ...config.security }, bridge, silentLogger, TEST_CONTROL_TOKEN,
      undefined, undefined, undefined, 'data', undefined,
      { enabledPlatforms: ['twitch'], send },
    );
    await bridge.start();
    await server.start();
    stops.push(async () => { await server.stop(); await bridge.stop(); });
    const baseUrl = `http://127.0.0.1:${String(server.port)}`;
    expect((await fetch(`${baseUrl}/overlay/chat/dock/config`)).status).toBe(401);
    const dock = await fetch(`${baseUrl}/overlay/chat/dock`);
    const cookie = dock.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
    expect(cookie).toMatch(/^thsv_dock=/u);
    expect(await fetch(`${baseUrl}/overlay/chat/dock/config`, { headers: { cookie } }).then((response) => response.json())).toMatchObject({ enabled: true, platforms: ['twitch'] });
    const headers = { cookie, origin: baseUrl, 'content-type': 'application/json' };
    expect((await fetch(`${baseUrl}/overlay/chat/dock/send`, { method: 'POST', headers, body: JSON.stringify({ target: 'youtube', message: 'hi' }) })).status).toBe(400);
    expect((await fetch(`${baseUrl}/overlay/chat/dock/send`, { method: 'POST', headers: { ...headers, origin: 'https://attacker.example' }, body: JSON.stringify({ target: 'twitch', message: 'hi' }) })).status).toBe(403);
    const response = await fetch(`${baseUrl}/overlay/chat/dock/send`, { method: 'POST', headers, body: JSON.stringify({ target: 'all', message: 'Hello village' }) });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ accepted: true, deliveries: [{ platform: 'twitch', accepted: true }] });
    expect(send).toHaveBeenCalledWith({ message: 'Hello village', routing: 'selected', selectedPlatforms: ['twitch'], overflow: 'reject' });
  });
});
