import { afterEach, describe, expect, it } from 'vitest';
import { DiagnosticsServer } from '../../bridge/services/http-server.js';
import { WizardService, type StreamerBotInspector } from '../../bridge/services/wizard-service.js';
import type { CommandSyncStore } from '../../bridge/services/command-sync-store.js';
import type { CommandSyncState } from '../../bridge/contracts/v2/command-sync.js';
import { createTestBridge, silentLogger, TEST_CONTROL_TOKEN, testConfig } from '../helpers.js';

const stops: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.allSettled(stops.splice(0).map((stop) => stop())); });

describe('wizard HTTP surface', () => {
  it('serves a locked shell and authenticates every wizard API request', async () => {
    const config = await testConfig();
    config.service.port = 0;
    const requests: Array<{ request: 'GetActions' | 'GetCommands'; requestedAt: string }> = [];
    const inspector: StreamerBotInspector = {
      inspectActions: () => { requests.push({ request: 'GetActions', requestedAt: new Date().toISOString() }); return Promise.resolve([]); },
      inspectCommands: () => { requests.push({ request: 'GetCommands', requestedAt: new Date().toISOString() }); return Promise.resolve([]); },
      inspectionRequests: () => [...requests],
    };
    const bridge = createTestBridge(config);
    const wizard = new WizardService(inspector);
    const server = new DiagnosticsServer({ ...config.service, ...config.security }, bridge, silentLogger, TEST_CONTROL_TOKEN, undefined, undefined, wizard);
    await bridge.start();
    await server.start();
    stops.push(async () => { await server.stop(); await bridge.stop(); });
    const baseUrl = `http://127.0.0.1:${String(server.port)}`;
    const shell = await fetch(`${baseUrl}/wizard/`);
    expect(shell.status).toBe(200);
    expect(shell.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    const shellMarkup = await shell.text();
    expect(shellMarkup).toContain('id="inspection-state" class="notice" role="status" aria-live="polite" aria-atomic="true"');
    expect(shellMarkup).toContain('id="transaction-state" class="notice" role="status" aria-live="polite" aria-atomic="true"');
    expect(shellMarkup).toContain('id="diagnostics" role="status" aria-live="polite" aria-atomic="true"');
    const theme = await fetch(`${baseUrl}/wizard/styles.css`).then((response) => response.text());
    expect(theme).toContain('color-scheme:light dark');
    expect(theme).toContain('@media(prefers-color-scheme:light)');
    expect((await fetch(`${baseUrl}/wizard/api/overview`)).status).toBe(401);
    const headers = { authorization: `Bearer ${TEST_CONTROL_TOKEN}`, origin: baseUrl };
    expect((await fetch(`${baseUrl}/wizard/api/overview`, { headers })).status).toBe(200);
    const inspection = await fetch(`${baseUrl}/wizard/api/inspect`, { method: 'POST', headers });
    expect(inspection.status).toBe(200);
    expect(await inspection.json()).toMatchObject({ available: true, actions: [], commands: [] });
    expect(requests.map((entry) => entry.request).sort()).toEqual(['GetActions', 'GetCommands']);
  });

  it('creates and safely cancels an empty transaction', async () => {
    const config = await testConfig();
    config.service.port = 0;
    const bridge = createTestBridge(config);
    const server = new DiagnosticsServer({ ...config.service, ...config.security }, bridge, silentLogger, TEST_CONTROL_TOKEN, undefined, undefined, new WizardService(undefined));
    await bridge.start();
    await server.start();
    stops.push(async () => { await server.stop(); await bridge.stop(); });
    const baseUrl = `http://127.0.0.1:${String(server.port)}`;
    const headers = { authorization: `Bearer ${TEST_CONTROL_TOKEN}` };
    const draft = await fetch(`${baseUrl}/wizard/api/transactions`, { method: 'POST', headers }).then((response) => response.json()) as { id: string };
    const cancelled = await fetch(`${baseUrl}/wizard/api/transactions/${draft.id}/cancel`, { method: 'POST', headers });
    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toMatchObject({ status: 'cancelled', stagedChanges: [] });
  });

  it('syncs a tracked command against live inspection and reports drift over HTTP', async () => {
    const config = await testConfig();
    config.service.port = 0;
    const inspector: StreamerBotInspector = {
      inspectActions: () => Promise.resolve([]),
      inspectCommands: () => Promise.resolve([{ id: 'sb-command-1', name: 'shoutout-renamed', enabled: true }]),
      inspectionRequests: () => [],
    };
    let saved: CommandSyncState | undefined;
    const store: CommandSyncStore = {
      load: () => Promise.resolve({
        version: 1,
        commands: [{
          contractVersion: '2.0.0-preview.1', streamerBotId: 'sb-command-1', name: 'shoutout', aliases: [],
          source: 'wizard-generated', lastSeenAt: '2026-07-18T00:00:00.000Z', driftStatus: 'in-sync',
        }],
      }),
      scheduleSave: (state) => { saved = state; },
      flush: () => Promise.resolve(),
      status: () => ({ enabled: true }),
    };
    const bridge = createTestBridge(config);
    const server = new DiagnosticsServer({ ...config.service, ...config.security }, bridge, silentLogger, TEST_CONTROL_TOKEN, undefined, undefined, new WizardService(inspector, undefined, store));
    await bridge.start();
    await server.start();
    stops.push(async () => { await server.stop(); await bridge.stop(); });
    const baseUrl = `http://127.0.0.1:${String(server.port)}`;
    const headers = { authorization: `Bearer ${TEST_CONTROL_TOKEN}` };
    expect((await fetch(`${baseUrl}/wizard/api/commands/sync`, { method: 'POST' })).status).toBe(401);
    const response = await fetch(`${baseUrl}/wizard/api/commands/sync`, { method: 'POST', headers });
    expect(response.status).toBe(200);
    const result = await response.json() as { available: boolean; commands: Array<{ driftStatus: string; name: string }> };
    expect(result.available).toBe(true);
    expect(result.commands).toEqual([expect.objectContaining({ driftStatus: 'renamed', name: 'shoutout-renamed' }) as unknown]);
    expect(saved?.commands[0]).toMatchObject({ driftStatus: 'renamed', name: 'shoutout-renamed' });
  });

  it('generates a Tier 2 command package for a batch, refuses to sync until import is confirmed, then verifies what is live', async () => {
    const config = await testConfig();
    config.service.port = 0;
    let liveCommands: Array<{ id: string; name: string; enabled: boolean }> = [];
    const inspector: StreamerBotInspector = {
      inspectActions: () => Promise.resolve([]),
      inspectCommands: () => Promise.resolve(liveCommands),
      inspectionRequests: () => [],
    };
    let saved: CommandSyncState | undefined;
    const store: CommandSyncStore = {
      load: () => Promise.resolve(saved ?? { version: 1, commands: [] }),
      scheduleSave: (state) => { saved = state; },
      flush: () => Promise.resolve(),
      status: () => ({ enabled: true }),
    };
    const bridge = createTestBridge(config);
    const server = new DiagnosticsServer({ ...config.service, ...config.security }, bridge, silentLogger, TEST_CONTROL_TOKEN, undefined, undefined, new WizardService(inspector, undefined, store));
    await bridge.start();
    await server.start();
    stops.push(async () => { await server.stop(); await bridge.stop(); });
    const baseUrl = `http://127.0.0.1:${String(server.port)}`;
    const headers = { authorization: `Bearer ${TEST_CONTROL_TOKEN}`, 'content-type': 'application/json' };

    const generateResponse = await fetch(`${baseUrl}/wizard/api/commands/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ designs: [{ name: 'so', aliases: ['shoutout'], approvedByCreator: true }, { name: 'greet', approvedByCreator: true }] }),
    });
    expect(generateResponse.status).toBe(200);
    const generated = await generateResponse.json() as {
      available: boolean;
      package: { filename: string; contentBase64: string; commands: Array<{ name: string; commandId: string }> };
    };
    expect(generated.available).toBe(true);
    expect(generated.package.filename).toBe('thsv-generated-batch-2-commands.sb');
    expect(generated.package.commands.map((command) => command.name)).toEqual(['so', 'greet']);
    const soCommandId = generated.package.commands.find((command) => command.name === 'so')?.commandId;
    const greetCommandId = generated.package.commands.find((command) => command.name === 'greet')?.commandId;

    // Before the creator has actually imported the package into Streamer.bot, the generated
    // command IDs are not live yet — verification must refuse to mark either one synced.
    const tooEarly = await fetch(`${baseUrl}/wizard/api/commands/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ commands: [{ commandId: soCommandId, name: 'so' }, { commandId: greetCommandId, name: 'greet' }] }),
    });
    expect(tooEarly.status).toBe(200);
    expect(await tooEarly.json()).toMatchObject({ available: true, verified: false, verifiedCommandIds: [], notFoundCommandIds: [soCommandId, greetCommandId] });
    expect(saved).toBeUndefined();

    // Simulate the creator having imported and enabled only one of the two commands so far.
    liveCommands = [{ id: soCommandId ?? '', name: 'so', enabled: true }];
    const verified = await fetch(`${baseUrl}/wizard/api/commands/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ commands: [{ commandId: soCommandId, name: 'so', aliases: ['shoutout'] }, { commandId: greetCommandId, name: 'greet' }] }),
    });
    expect(verified.status).toBe(200);
    const verifiedBody = await verified.json() as {
      verified: boolean;
      verifiedCommandIds: string[];
      notFoundCommandIds: string[];
      commands: Array<{ streamerBotId: string; source: string }>;
    };
    expect(verifiedBody.verified).toBe(true);
    expect(verifiedBody.verifiedCommandIds).toEqual([soCommandId]);
    expect(verifiedBody.notFoundCommandIds).toEqual([greetCommandId]);
    expect(verifiedBody.commands).toEqual([expect.objectContaining({ streamerBotId: soCommandId, source: 'wizard-generated' }) as unknown]);
    expect(saved?.commands).toEqual(verifiedBody.commands);
  });

  it('dispatches a Tier 1 enable/disable request over HTTP and denies one missing creator approval', async () => {
    const config = await testConfig();
    config.service.port = 0;
    const dispatched: Array<{ operation: string; commandId: string }> = [];
    const inspector: StreamerBotInspector = {
      inspectActions: () => Promise.resolve([]),
      inspectCommands: () => Promise.resolve([]),
      inspectionRequests: () => [],
      requestCommandAdministration: (request) => { dispatched.push({ operation: request.operation, commandId: request.commandId }); return Promise.resolve(); },
    };
    const bridge = createTestBridge(config);
    const server = new DiagnosticsServer({ ...config.service, ...config.security }, bridge, silentLogger, TEST_CONTROL_TOKEN, undefined, undefined, new WizardService(inspector));
    await bridge.start();
    await server.start();
    stops.push(async () => { await server.stop(); await bridge.stop(); });
    const baseUrl = `http://127.0.0.1:${String(server.port)}`;
    const headers = { authorization: `Bearer ${TEST_CONTROL_TOKEN}`, 'content-type': 'application/json' };

    const denied = await fetch(`${baseUrl}/wizard/api/commands/administer`, {
      method: 'POST', headers, body: JSON.stringify({ operation: 'disable', commandId: 'sb-command-1', approvedByCreator: false }),
    });
    expect(denied.status).toBe(200);
    expect(await denied.json()).toMatchObject({ available: false, error: expect.stringContaining('explicit creator approval') as unknown });
    expect(dispatched).toEqual([]);

    const approved = await fetch(`${baseUrl}/wizard/api/commands/administer`, {
      method: 'POST', headers, body: JSON.stringify({ operation: 'disable', commandId: 'sb-command-1', approvedByCreator: true }),
    });
    expect(approved.status).toBe(200);
    expect(await approved.json()).toMatchObject({ available: true, operation: 'disable', commandId: 'sb-command-1' });
    expect(dispatched).toEqual([{ operation: 'disable', commandId: 'sb-command-1' }]);
  });
});
