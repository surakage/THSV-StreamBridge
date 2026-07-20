import { afterEach, describe, expect, it } from 'vitest';
import { DiagnosticsServer } from '../../bridge/services/http-server.js';
import { WizardService, type StreamerBotInspector } from '../../bridge/services/wizard-service.js';
import type { CommandSyncStore } from '../../bridge/services/command-sync-store.js';
import type { CommandSyncState } from '../../bridge/contracts/v2/command-sync.js';
import { createTestBridge, silentLogger, TEST_CONTROL_TOKEN, testConfig } from '../helpers.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import { AddOnWizardService } from '../../bridge/services/addon-wizard-service.js';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const stops: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.allSettled(stops.splice(0).map((stop) => stop())); });

describe('wizard HTTP surface', () => {
  it('protects the add-on inventory and mutation API with the local control token and creator approval', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-addon-http-'));
    const config = await testConfig(); config.service.port = 0;
    const bridge = createTestBridge(config);
    const addOns = new AddOnWizardService(join(root, 'packages'), join(root, 'state'));
    const server = new DiagnosticsServer({ ...config.service, ...config.security }, bridge, silentLogger, TEST_CONTROL_TOKEN, undefined, undefined, new WizardService(undefined, undefined, undefined, addOns));
    await bridge.start(); await server.start();
    stops.push(async () => { await server.stop(); await bridge.stop(); await rm(root, { recursive: true, force: true }); });
    const baseUrl = `http://127.0.0.1:${String(server.port)}`;
    expect((await fetch(`${baseUrl}/wizard/api/addons`)).status).toBe(401);
    const headers = { authorization: `Bearer ${TEST_CONTROL_TOKEN}`, 'content-type': 'application/json' };
    const inventory = await fetch(`${baseUrl}/wizard/api/addons`, { headers });
    expect(inventory.status).toBe(200);
    expect(await inventory.json()).toEqual({ addOns: [], discovered: [] });
    const install = await fetch(`${baseUrl}/wizard/api/addons/install`, { method: 'POST', headers, body: JSON.stringify({ filename: 'sample.thsv-addon', contentBase64: Buffer.from('not a zip').toString('base64'), approvedByCreator: false }) });
    expect(install.status).toBe(403);
    expect(await install.text()).toContain('approve');
    expect((await fetch(`${baseUrl}/wizard/api/addons/sample.missing/action-grants`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actionIds: [], approvedByCreator: true }) })).status).toBe(401);
    const grant = await fetch(`${baseUrl}/wizard/api/addons/sample.missing/action-grants`, { method: 'PUT', headers, body: JSON.stringify({ actionIds: [], approvedByCreator: false }) });
    expect(grant.status).toBe(403);
    expect(await grant.text()).toContain('explicit creator approval');
  });

  it('rejects non-canonical or content-type-confused overlay uploads before writing files', async () => {
    const config = await testConfig();
    config.service.port = 0;
    const bridge = createTestBridge(config);
    const server = new DiagnosticsServer({ ...config.service, ...config.security }, bridge, silentLogger, TEST_CONTROL_TOKEN, undefined, undefined, new WizardService(undefined));
    await bridge.start();
    await server.start();
    stops.push(async () => { await server.stop(); await bridge.stop(); });
    const baseUrl = `http://127.0.0.1:${String(server.port)}`;
    const headers = { authorization: `Bearer ${TEST_CONTROL_TOKEN}`, 'content-type': 'application/json' };
    const malformed = await fetch(`${baseUrl}/wizard/api/overlay-assets`, { method: 'POST', headers, body: JSON.stringify({ kind: 'background', contentType: 'image/png', contentBase64: '%%%%' }) });
    expect(malformed.status).toBe(400);
    expect(await malformed.text()).toContain('canonical base64');
    const disguised = await fetch(`${baseUrl}/wizard/api/overlay-assets`, { method: 'POST', headers, body: JSON.stringify({ kind: 'background', contentType: 'image/png', contentBase64: Buffer.from('not a png').toString('base64') }) });
    expect(disguised.status).toBe(400);
    expect(await disguised.text()).toContain('does not match');
  });

  it('stores uploaded overlay assets under the configured data root, not the process working directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-overlay-assets-'));
    const config = await testConfig();
    config.service.port = 0;
    const bridge = createTestBridge(config);
    const server = new DiagnosticsServer({ ...config.service, ...config.security }, bridge, silentLogger, TEST_CONTROL_TOKEN, undefined, undefined, new WizardService(undefined), root);
    await bridge.start();
    await server.start();
    stops.push(async () => { await server.stop(); await bridge.stop(); await rm(root, { recursive: true, force: true }); });
    const baseUrl = `http://127.0.0.1:${String(server.port)}`;
    const headers = { authorization: `Bearer ${TEST_CONTROL_TOKEN}`, 'content-type': 'application/json' };
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    const upload = await fetch(`${baseUrl}/wizard/api/overlay-assets`, { method: 'POST', headers, body: JSON.stringify({ kind: 'background', contentType: 'image/png', contentBase64: png.toString('base64') }) });
    expect(upload.status).toBe(201);
    const { url } = await upload.json() as { url: string };
    const stored = await stat(join(root, 'runtime', 'overlay-assets', url.split('/').pop() ?? ''));
    expect(stored.isFile()).toBe(true);
    await expect(stat(join('data', 'runtime', 'overlay-assets', url.split('/').pop() ?? ''))).rejects.toThrow();
    const fetched = await fetch(`${baseUrl}${url}`);
    expect(fetched.status).toBe(200);
    expect(Buffer.from(await fetched.arrayBuffer())).toEqual(png);
  });

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
    expect(shellMarkup).toContain('data-panel="addons"');
    expect(shellMarkup).toContain('/wizard/addons.js');
    const addOnClient = await fetch(`${baseUrl}/wizard/addons.js`);
    expect(addOnClient.status).toBe(200);
    expect(await addOnClient.text()).toContain('/wizard/api/addons');
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
    const store: CommandSyncStore = {
      load: () => Promise.resolve({
        version: 1,
        commands: [{
          contractVersion: '2.0.0-preview.1', streamerBotId: 'sb-command-1', name: 'managed-command', aliases: [],
          source: 'wizard-generated', lastSeenAt: '2026-07-18T00:00:00.000Z', driftStatus: 'in-sync',
        }],
      }),
      scheduleSave: () => {},
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

    const unrelated = await fetch(`${baseUrl}/wizard/api/commands/administer`, {
      method: 'POST', headers, body: JSON.stringify({ operation: 'disable', commandId: 'unrelated-command', approvedByCreator: true }),
    });
    expect(unrelated.status).toBe(200);
    expect(await unrelated.json()).toMatchObject({ available: false, error: expect.stringContaining('limited to commands tracked') as unknown });
    expect(dispatched).toEqual([{ operation: 'disable', commandId: 'sb-command-1' }]);
  });

  it('runs an authenticated saved timed-action test through the real bridge pipeline', async () => {
    const config = await testConfig();
    config.service.port = 0;
    config.timedActions.definitions = [{
      id: 'test-timer', name: 'Test timer', enabled: false, intervalMode: 'fixed', everyMinutes: 15, missedRunPolicy: 'skip', payload: {}, selection: { mode: 'fixed' },
      gates: { requireLive: true, platforms: [], scenes: [], activity: { minimumMessages: 0, windowMinutes: 5 } }, target: { provider: 'event-only' },
    }];
    const bridge = createTestBridge(config);
    const server = new DiagnosticsServer({ ...config.service, ...config.security }, bridge, silentLogger, TEST_CONTROL_TOKEN, undefined, undefined, new WizardService(undefined));
    await bridge.start(); await server.start();
    stops.push(async () => { await server.stop(); await bridge.stop(); });
    const baseUrl = `http://127.0.0.1:${String(server.port)}`;
    expect((await fetch(`${baseUrl}/wizard/api/timed-actions/test-timer/test`, { method: 'POST' })).status).toBe(401);
    const response = await fetch(`${baseUrl}/wizard/api/timed-actions/test-timer/test`, { method: 'POST', headers: { authorization: `Bearer ${TEST_CONTROL_TOKEN}` } });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ accepted: true, timerId: 'test-timer', simulated: true });
  });

  it('generates authenticated alert previews with forced simulated provenance', async () => {
    const config = await testConfig();
    config.service.port = 0;
    const bridge = createTestBridge(config);
    const observed: NormalizedEvent[] = [];
    bridge.subscribe((event) => { observed.push(event); });
    const server = new DiagnosticsServer({ ...config.service, ...config.security }, bridge, silentLogger, TEST_CONTROL_TOKEN, undefined, undefined, new WizardService(undefined));
    await bridge.start(); await server.start();
    stops.push(async () => { await server.stop(); await bridge.stop(); });
    const baseUrl = `http://127.0.0.1:${String(server.port)}`;
    expect((await fetch(`${baseUrl}/wizard/api/alerts/twitch/follow/preview`, { method: 'POST' })).status).toBe(401);
    const response = await fetch(`${baseUrl}/wizard/api/alerts/twitch/follow/preview`, { method: 'POST', headers: { authorization: `Bearer ${TEST_CONTROL_TOKEN}` } });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ contractVersion: '2.0.0-preview.1', accepted: true, simulated: true, platform: 'twitch', alertType: 'follow', visible: false });
    expect(observed[0]?.eventType).toBe('channel.follow');
    expect(observed[0]?.platform).toBe('twitch');
    expect(observed[0]?.source.adapter).toBe('mock');
    expect(observed[0]?.source.eventId).toMatch(/^wizard-/u);
    expect(observed[0]?.metadata.simulated).toBe(true);
    // A platform that never produces a given alert type is rejected, not silently defaulted.
    expect((await fetch(`${baseUrl}/wizard/api/alerts/twitch/super-chat/preview`, { method: 'POST', headers: { authorization: `Bearer ${TEST_CONTROL_TOKEN}` } })).status).toBe(400);
    expect((await fetch(`${baseUrl}/wizard/api/alerts/not-real/follow/preview`, { method: 'POST', headers: { authorization: `Bearer ${TEST_CONTROL_TOKEN}` } })).status).toBe(400);
  });

  it('authenticates reward administration and refuses unsupported Kick mutations', async () => {
    const config = await testConfig();
    config.service.port = 0;
    const dispatched: Array<{ platform: string; operation: string; rewardId: string }> = [];
    const inspector: StreamerBotInspector = {
      inspectActions: () => Promise.resolve([]),
      inspectCommands: () => Promise.resolve([]),
      inspectionRequests: () => [],
      requestRewardAdministration: (request) => {
        dispatched.push({ platform: request.platform, operation: request.operation, rewardId: request.rewardId });
        return Promise.resolve();
      },
    };
    const bridge = createTestBridge(config);
    const server = new DiagnosticsServer({ ...config.service, ...config.security }, bridge, silentLogger, TEST_CONTROL_TOKEN, undefined, undefined, new WizardService(inspector));
    await bridge.start(); await server.start();
    stops.push(async () => { await server.stop(); await bridge.stop(); });
    const baseUrl = `http://127.0.0.1:${String(server.port)}`;
    const headers = { authorization: `Bearer ${TEST_CONTROL_TOKEN}`, 'content-type': 'application/json' };
    const twitchRequest = { platform: 'twitch', operation: 'pause', rewardId: 'reward-1', approvedByCreator: true };

    expect((await fetch(`${baseUrl}/wizard/api/rewards/administer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(twitchRequest) })).status).toBe(401);
    const approved = await fetch(`${baseUrl}/wizard/api/rewards/administer`, { method: 'POST', headers, body: JSON.stringify(twitchRequest) });
    expect(approved.status).toBe(200);
    expect(await approved.json()).toMatchObject({ available: true, platform: 'twitch', operation: 'pause', rewardId: 'reward-1' });
    expect(dispatched).toEqual([{ platform: 'twitch', operation: 'pause', rewardId: 'reward-1' }]);

    const kick = await fetch(`${baseUrl}/wizard/api/rewards/administer`, {
      method: 'POST', headers, body: JSON.stringify({ ...twitchRequest, platform: 'kick' }),
    });
    expect(kick.status).toBe(200);
    expect(await kick.json()).toMatchObject({ available: false, error: expect.stringContaining('Kick reward mutation controls are unavailable') as unknown });
    expect(dispatched).toHaveLength(1);
  });
});
