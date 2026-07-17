import { createServer } from 'node:net';
import { WebSocketServer } from 'ws';
import { describe, expect, it } from 'vitest';
import { StreamerBotAdapter } from '../../bridge/adapters/streamerbot-adapter.js';
import { fixture, silentLogger, testConfig } from '../helpers.js';
import { StreamerBotEventRelay } from '../../bridge/adapters/streamerbot-event-relay.js';

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

describe('Streamer.bot adapter', () => {
  it('fails safely when Streamer.bot is unavailable', async () => {
    const config = await testConfig();
    const port = await unusedPort();
    const adapter = new StreamerBotAdapter({ ...config.streamerbot, testMode: false, url: `ws://127.0.0.1:${String(port)}`, reconnect: { enabled: false, initialDelayMs: 10, maxDelayMs: 10, maxAttempts: 0 } }, silentLogger);
    await adapter.start();
    expect(['error', 'connecting']).toContain(adapter.status()['state']);
    await expect(adapter.sendEvent(await fixture())).rejects.toThrow('unavailable');
    await adapter.stop();
  });

  it('reconnects and receives a DoAction acknowledgement', async () => {
    const config = await testConfig();
    const port = await unusedPort();
    const adapter = new StreamerBotAdapter({ ...config.streamerbot, testMode: false, url: `ws://127.0.0.1:${String(port)}`, acknowledgementTimeoutMs: 500, reconnect: { enabled: true, initialDelayMs: 100, maxDelayMs: 100, maxAttempts: 3 } }, silentLogger);
    await adapter.start();
    const server = new WebSocketServer({ host: '127.0.0.1', port });
    let doAction: { readonly action?: { readonly name?: string }; readonly args?: Record<string, unknown> } | undefined;
    server.on('connection', (socket) => {
      socket.send(JSON.stringify({ request: 'Hello', info: {} }));
      socket.on('message', (data) => {
        const raw = Buffer.isBuffer(data) ? data.toString('utf8') : Buffer.from(data as ArrayBuffer).toString('utf8');
        const request = JSON.parse(raw) as { id: string; request: string; action?: { name?: string }; args?: Record<string, unknown> };
        if (request.request === 'DoAction') {
          doAction = request;
          socket.send(JSON.stringify({ id: request.id, status: 'ok' }));
        }
      });
    });
    await expect.poll(() => adapter.status()['state'], { timeout: 2_000 }).toBe('connected');
    const event = await fixture();
    await expect(adapter.sendEvent(event)).resolves.toBeUndefined();
    expect(doAction?.action?.name).toBe(config.streamerbot.actionAlias);
    expect(Object.keys(doAction?.args ?? {})).toEqual(['streamBridgeEvent']);
    expect(JSON.parse(String(doAction?.args?.['streamBridgeEvent']))).toEqual(event);
    await adapter.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('bounds outstanding acknowledgement requests', async () => {
    const config = await testConfig();
    const port = await unusedPort();
    const adapter = new StreamerBotAdapter({
      ...config.streamerbot,
      testMode: false,
      url: `ws://127.0.0.1:${String(port)}`,
      maxPendingRequests: 1,
      acknowledgementTimeoutMs: 2_000,
      reconnect: { enabled: false, initialDelayMs: 10, maxDelayMs: 10, maxAttempts: 0 },
    }, silentLogger);
    const server = new WebSocketServer({ host: '127.0.0.1', port });
    server.on('connection', (socket) => socket.send(JSON.stringify({ request: 'Hello', info: {} })));
    await adapter.start();
    const first = adapter.sendEvent(await fixture());
    const firstRejection = expect(first).rejects.toThrow('stopped');
    await expect(adapter.sendEvent(await fixture('kick-follow.json'))).rejects.toThrow('pending request capacity');
    await adapter.stop();
    await firstRejection;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('shares allowlisted TikFinity broadcasts without opening another WebSocket', async () => {
    const config = await testConfig();
    const port = await unusedPort();
    const relay = new StreamerBotEventRelay();
    const received: Readonly<Record<string, unknown>>[] = [];
    relay.subscribe((message) => received.push(message));
    const adapter = new StreamerBotAdapter({
      ...config.streamerbot,
      testMode: false,
      url: `ws://127.0.0.1:${String(port)}`,
      reconnect: { enabled: false, initialDelayMs: 10, maxDelayMs: 10, maxAttempts: 0 },
    }, silentLogger, 'streamerbot', relay);
    const server = new WebSocketServer({ host: '127.0.0.1', port });
    server.on('connection', (socket) => {
      socket.send(JSON.stringify({ request: 'Hello', info: {} }));
      socket.send(JSON.stringify({ type: 'unrelated' }));
      socket.send(JSON.stringify({ type: 'thsv.tikfinity', version: '1.0.0', kind: 'follow' }));
    });
    await adapter.start();
    await expect.poll(() => received.length).toBe(1);
    expect(received[0]).toMatchObject({ type: 'thsv.tikfinity', kind: 'follow' });
    await adapter.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
