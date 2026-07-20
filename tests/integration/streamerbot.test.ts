import { createServer } from 'node:net';
import { WebSocketServer } from 'ws';
import { describe, expect, it } from 'vitest';
import { StreamerBotAdapter } from '../../bridge/adapters/streamerbot-adapter.js';
import { fixture, silentLogger, testConfig } from '../helpers.js';
import { StreamerBotEventRelay } from '../../bridge/adapters/streamerbot-event-relay.js';
import { createCommandAdministrationRequest } from '../../bridge/core/command-administration.js';

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

describe('Streamer.bot adapter', () => {
  it('rejects a challenge-free Hello when a peer password is configured', async () => {
    const config = await testConfig();
    const port = await unusedPort();
    const previous = process.env[config.streamerbot.passwordEnv];
    process.env[config.streamerbot.passwordEnv] = 'configured-peer-password';
    const observed: string[] = [];
    const server = new WebSocketServer({ host: '127.0.0.1', port });
    server.on('connection', (socket) => {
      socket.send(JSON.stringify({ request: 'Hello', info: {} }));
      socket.on('message', (data) => observed.push(Buffer.from(data as Buffer).toString('utf8')));
    });
    const adapter = new StreamerBotAdapter({
      ...config.streamerbot, testMode: false, url: `ws://127.0.0.1:${String(port)}`,
      acknowledgementTimeoutMs: 250, reconnect: { enabled: false, initialDelayMs: 10, maxDelayMs: 10, maxAttempts: 0 },
    }, silentLogger);
    try {
      await adapter.start();
      await expect.poll(() => adapter.status()['state']).toBe('error');
      expect(adapter.status()['lastError']).toContain('challenge-free Hello');
      expect(observed).toEqual([]);
    } finally {
      await adapter.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (previous === undefined) Reflect.deleteProperty(process.env, config.streamerbot.passwordEnv); else process.env[config.streamerbot.passwordEnv] = previous;
    }
  });

  it('isolates a synchronous relay subscriber failure from the adapter process', async () => {
    const config = await testConfig();
    const relay = new StreamerBotEventRelay();
    relay.subscribe(() => { throw new Error('subscriber failed'); });
    const warnings: Array<{ readonly message: string; readonly fields?: Readonly<Record<string, unknown>> }> = [];
    const warn = (message: string, fields?: Readonly<Record<string, unknown>>): void => { warnings.push({ message, ...(fields === undefined ? {} : { fields }) }); };
    const adapter = new StreamerBotAdapter(config.streamerbot, { ...silentLogger, warn }, 'streamerbot', relay);
    const handleMessage = (adapter as unknown as { handleMessage(raw: string): void }).handleMessage.bind(adapter);
    expect(() => handleMessage(JSON.stringify({ type: 'thsv.platform', platform: 'twitch' }))).not.toThrow();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toBe('Ignored Streamer.bot relay subscriber failure');
    expect(warnings[0]?.fields?.['error']).toBeInstanceOf(Error);
  });

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

  it('dispatches a broker-approved action by exact ID with only the supplied JSON arguments', async () => {
    const config = await testConfig(); const port = await unusedPort();
    const server = new WebSocketServer({ host: '127.0.0.1', port });
    let requestValue: { action?: { id?: string; name?: string }; args?: Record<string, unknown> } | undefined;
    server.on('connection', (socket) => {
      socket.send(JSON.stringify({ request: 'Hello', info: {} }));
      socket.on('message', (data) => {
        const request = JSON.parse(Buffer.from(data as Buffer).toString('utf8')) as { id: string; request: string; action?: { id?: string; name?: string }; args?: Record<string, unknown> };
        if (request.request !== 'DoAction') return;
        requestValue = request;
        socket.send(JSON.stringify({ id: request.id, status: 'ok' }));
      });
    });
    const adapter = new StreamerBotAdapter({ ...config.streamerbot, testMode: false, url: `ws://127.0.0.1:${String(port)}`, acknowledgementTimeoutMs: 500, reconnect: { enabled: false, initialDelayMs: 10, maxDelayMs: 10, maxAttempts: 0 } }, silentLogger);
    await adapter.start();
    await expect.poll(() => adapter.status()['state'], { timeout: 2_000 }).toBe('connected');
    const actionId = '11111111-1111-4111-8111-111111111111';
    await adapter.runApprovedAction(actionId, { clipId: 'clip-123', sequence: 4 });
    expect(requestValue).toEqual(expect.objectContaining({ action: { id: actionId }, args: { clipId: 'clip-123', sequence: 4 } }));
    expect(requestValue?.action?.name).toBeUndefined();
    await adapter.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('cancels a pending approved action request without closing the shared WebSocket', async () => {
    const config = await testConfig(); const port = await unusedPort();
    const server = new WebSocketServer({ host: '127.0.0.1', port });
    server.on('connection', (socket) => socket.send(JSON.stringify({ request: 'Hello', info: {} })));
    const adapter = new StreamerBotAdapter({ ...config.streamerbot, testMode: false, url: `ws://127.0.0.1:${String(port)}`, acknowledgementTimeoutMs: 2_000, reconnect: { enabled: false, initialDelayMs: 10, maxDelayMs: 10, maxAttempts: 0 } }, silentLogger);
    await adapter.start();
    await expect.poll(() => adapter.status()['state'], { timeout: 2_000 }).toBe('connected');
    const controller = new AbortController();
    const pending = adapter.runApprovedAction('11111111-1111-4111-8111-111111111111', {}, controller.signal);
    controller.abort(new Error('cancelled by test'));
    await expect(pending).rejects.toThrow('cancelled by test');
    expect(adapter.status()).toMatchObject({ state: 'connected', pendingRequests: 0 });
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
    let subscription: { readonly events?: { readonly General?: readonly string[] } } | undefined;
    server.on('connection', (socket) => {
      socket.send(JSON.stringify({ request: 'Hello', info: {} }));
      socket.on('message', (data) => {
        const raw = Buffer.isBuffer(data) ? data.toString('utf8') : Buffer.from(data as ArrayBuffer).toString('utf8');
        const request = JSON.parse(raw) as { readonly id: string; readonly request: string; readonly events?: { readonly General?: readonly string[] } };
        if (request.request !== 'Subscribe') return;
        subscription = request;
        socket.send(JSON.stringify({ id: request.id, status: 'ok', events: request.events }));
        socket.send(JSON.stringify({ event: { source: 'General', type: 'Custom' }, data: { type: 'unrelated' } }));
        socket.send(JSON.stringify({ event: { source: 'General', type: 'Custom' }, data: { type: 'thsv.tikfinity', version: '1.0.0', kind: 'follow' } }));
        socket.send(JSON.stringify({ event: { source: 'General', type: 'Custom' }, data: { type: 'thsv.platform', version: '1.0.0', platform: 'twitch' } }));
      });
    });
    await adapter.start();
    await expect.poll(() => received.length).toBe(2);
    expect(subscription?.events?.General).toEqual(['Custom']);
    expect(received[0]).toMatchObject({ type: 'thsv.tikfinity', kind: 'follow' });
    expect(received[1]).toMatchObject({ type: 'thsv.platform', platform: 'twitch' });
    await adapter.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('uses only documented read requests for wizard inspection and returns response data', async () => {
    const config = await testConfig();
    const port = await unusedPort();
    const adapter = new StreamerBotAdapter({
      ...config.streamerbot, testMode: false, url: `ws://127.0.0.1:${String(port)}`,
      reconnect: { enabled: false, initialDelayMs: 10, maxDelayMs: 10, maxAttempts: 0 },
    }, silentLogger);
    const observed: string[] = [];
    const server = new WebSocketServer({ host: '127.0.0.1', port });
    server.on('connection', (socket) => {
      socket.send(JSON.stringify({ request: 'Hello', info: {} }));
      socket.on('message', (data) => {
        const request = JSON.parse(Buffer.from(data as Buffer).toString('utf8')) as { id: string; request: string };
        observed.push(request.request);
        if (request.request === 'GetActions') socket.send(JSON.stringify({ id: request.id, status: 'ok', actions: [{ id: 'action-1', name: 'Action', group: 'Group', enabled: true }] }));
        if (request.request === 'GetCommands') socket.send(JSON.stringify({ id: request.id, status: 'ok', commands: [{ id: 'command-1', name: '!test', enabled: false }] }));
      });
    });
    await adapter.start();
    expect(await adapter.inspectActions()).toEqual([{ id: 'action-1', name: 'Action', group: 'Group', enabled: true }]);
    expect(await adapter.inspectCommands()).toEqual([{ id: 'command-1', name: '!test', enabled: false }]);
    expect(observed).toEqual(['GetActions', 'GetCommands']);
    expect(adapter.inspectionRequests().map((entry) => entry.request)).toEqual(observed);
    await adapter.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('captures trigger-phrase aliases from GetCommands when present, without requiring them', async () => {
    const config = await testConfig();
    const port = await unusedPort();
    const adapter = new StreamerBotAdapter({
      ...config.streamerbot, testMode: false, url: `ws://127.0.0.1:${String(port)}`,
      reconnect: { enabled: false, initialDelayMs: 10, maxDelayMs: 10, maxAttempts: 0 },
    }, silentLogger);
    const server = new WebSocketServer({ host: '127.0.0.1', port });
    server.on('connection', (socket) => {
      socket.send(JSON.stringify({ request: 'Hello', info: {} }));
      socket.on('message', (data) => {
        const request = JSON.parse(Buffer.from(data as Buffer).toString('utf8')) as { id: string; request: string };
        if (request.request === 'GetCommands') {
          socket.send(JSON.stringify({
            id: request.id, status: 'ok',
            commands: [
              { id: 'command-1', name: 'so', enabled: true, commands: ['so', 'shoutout'] },
              { id: 'command-2', name: 'hello', enabled: true },
            ],
          }));
        }
      });
    });
    await adapter.start();
    expect(await adapter.inspectCommands()).toEqual([
      { id: 'command-1', name: 'so', enabled: true, aliases: ['so', 'shoutout'] },
      { id: 'command-2', name: 'hello', enabled: true },
    ]);
    await adapter.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('dispatches an approved command administration request to its own action, separate from the receiver', async () => {
    const config = await testConfig();
    const port = await unusedPort();
    const adapter = new StreamerBotAdapter({
      ...config.streamerbot, testMode: false, url: `ws://127.0.0.1:${String(port)}`,
      reconnect: { enabled: false, initialDelayMs: 10, maxDelayMs: 10, maxAttempts: 0 },
    }, silentLogger);
    let doAction: { readonly action?: { readonly name?: string }; readonly args?: Record<string, unknown> } | undefined;
    const server = new WebSocketServer({ host: '127.0.0.1', port });
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
    await adapter.start();
    await expect.poll(() => adapter.status()['state'], { timeout: 2_000 }).toBe('connected');
    const request = createCommandAdministrationRequest({ operation: 'disable', commandId: 'sb-command-1', approvedByCreator: true, requestId: 'admin-req-1' });
    await expect(adapter.requestCommandAdministration(request)).resolves.toBeUndefined();
    expect(doAction?.action?.name).toBe(config.streamerbot.commandAdministrationActionAlias);
    expect(doAction?.action?.name).not.toBe(config.streamerbot.actionAlias);
    expect(doAction?.args).toEqual({ commandAdminOperation: 'disable', commandAdminCommandId: 'sb-command-1', commandAdminApproved: true, commandAdminRequestId: 'admin-req-1' });
    await adapter.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('fails a command administration request safely when Streamer.bot is unavailable', async () => {
    const config = await testConfig();
    const port = await unusedPort();
    const adapter = new StreamerBotAdapter({ ...config.streamerbot, testMode: false, url: `ws://127.0.0.1:${String(port)}`, reconnect: { enabled: false, initialDelayMs: 10, maxDelayMs: 10, maxAttempts: 0 } }, silentLogger);
    await adapter.start();
    const request = createCommandAdministrationRequest({ operation: 'enable', commandId: 'sb-command-1', approvedByCreator: true });
    await expect(adapter.requestCommandAdministration(request)).rejects.toThrow('unavailable');
    await adapter.stop();
  });
});
