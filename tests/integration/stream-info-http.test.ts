import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiagnosticsServer, type StreamInfoController } from '../../bridge/services/http-server.js';
import { WizardService } from '../../bridge/services/wizard-service.js';
import { StreamInfoError } from '../../bridge/services/stream-info-service.js';
import { createTestBridge, silentLogger, TEST_CONTROL_TOKEN, testConfig } from '../helpers.js';

const stops: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.allSettled(stops.splice(0).map((stop) => stop())); });

async function start(controller: StreamInfoController): Promise<string> {
  const config = await testConfig(); config.service.port = 0;
  const bridge = createTestBridge(config);
  const server = new DiagnosticsServer({ ...config.service, ...config.security }, bridge, silentLogger, TEST_CONTROL_TOKEN, undefined, undefined, new WizardService(undefined), 'data', undefined, undefined, undefined, undefined, undefined, undefined, controller);
  await bridge.start(); await server.start();
  stops.push(async () => { await server.stop(); await bridge.stop(); });
  return `http://127.0.0.1:${String(server.port)}`;
}

function controller(overrides: Partial<StreamInfoController> = {}): StreamInfoController {
  return {
    status: () => ({ streamerBotConnected: true }),
    apply: vi.fn(async () => ({ requestId: 'stream-info-00000000-0000-4000-8000-000000000000' })),
    result: vi.fn(() => ({ state: 'pending' })),
    consoleSignIns: async () => ({ xbox: { saved: true }, playstation: { saved: false } }),
    saveConsoleSignIns: vi.fn(async () => ({ xbox: { saved: true }, playstation: { saved: true } })),
    testConsole: async () => ({ ok: true, titleName: '' }),
    ...overrides,
  };
}

describe('Stream info pop-out HTTP surface', () => {
  it('serves the page with the Wizard security headers', async () => {
    const base = await start(controller());
    const page = await fetch(`${base}/wizard/stream-info`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    const policy = page.headers.get('content-security-policy') ?? '';
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toContain('unsafe-eval');
    expect(page.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await page.text()).toContain('Update all platforms');
    expect((await fetch(`${base}/wizard/stream-info.js`)).status).toBe(200);
    expect((await fetch(`${base}/wizard/stream-info-tools.js`)).status).toBe(200);
  });

  it('needs the Wizard password for every action and refuses other websites', async () => {
    const apply = vi.fn(async () => ({ requestId: 'x' }));
    const base = await start(controller({ apply }));
    expect((await fetch(`${base}/wizard/api/stream-info`)).status).toBe(401);
    expect((await fetch(`${base}/wizard/api/stream-info/apply`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(401);
    expect((await fetch(`${base}/wizard/api/console-presence`)).status).toBe(401);
    const foreign = await fetch(`${base}/wizard/api/stream-info/apply`, { method: 'POST', headers: { authorization: `Bearer ${TEST_CONTROL_TOKEN}`, 'content-type': 'application/json', origin: 'https://example.com' }, body: '{}' });
    expect(foreign.status).toBe(403);
    const plain = await fetch(`${base}/wizard/api/stream-info/apply`, { method: 'POST', headers: { authorization: `Bearer ${TEST_CONTROL_TOKEN}`, 'content-type': 'text/plain' }, body: '{}' });
    expect(plain.status).toBe(415);
    expect(apply).not.toHaveBeenCalled();
  });

  it('applies, reports results and shows refusals plainly', async () => {
    const result = vi.fn(() => ({ state: 'done', success: true, results: [{ platform: 'twitch', success: true }] }));
    let refuse = false;
    const apply = vi.fn(async (input: unknown) => { if (refuse) throw new StreamInfoError(409, 'Streamer.bot is not connected. Start Streamer.bot, then try again.'); return { requestId: 'stream-info-00000000-0000-4000-8000-000000000000', input }; });
    const base = await start(controller({ apply, result }));
    const headers = { authorization: `Bearer ${TEST_CONTROL_TOKEN}`, 'content-type': 'application/json' };
    const accepted = await fetch(`${base}/wizard/api/stream-info/apply`, { method: 'POST', headers, body: JSON.stringify({ profileId: 'profile-1' }) });
    expect(accepted.status).toBe(202);
    expect(apply).toHaveBeenCalledWith({ profileId: 'profile-1' });
    const done = await fetch(`${base}/wizard/api/stream-info/results/stream-info-00000000-0000-4000-8000-000000000000`, { headers });
    expect(await done.json()).toMatchObject({ state: 'done', success: true });
    expect((await fetch(`${base}/wizard/api/stream-info/results/../../health`, { headers })).status).not.toBe(200);
    refuse = true;
    const refused = await fetch(`${base}/wizard/api/stream-info/apply`, { method: 'POST', headers, body: '{}' });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: 'Streamer.bot is not connected. Start Streamer.bot, then try again.' });
  });

  it('never stores the Wizard password as a console sign-in', async () => {
    const saveConsoleSignIns = vi.fn(async () => ({}));
    const base = await start(controller({ saveConsoleSignIns }));
    const response = await fetch(`${base}/wizard/api/console-presence`, { method: 'PUT', headers: { authorization: `Bearer ${TEST_CONTROL_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ xboxApiKey: TEST_CONTROL_TOKEN }) });
    expect(response.status).toBe(400);
    expect(saveConsoleSignIns).not.toHaveBeenCalled();
    const status = await fetch(`${base}/wizard/api/console-presence`, { headers: { authorization: `Bearer ${TEST_CONTROL_TOKEN}` } });
    expect(await status.json()).toEqual({ xbox: { saved: true }, playstation: { saved: false } });
  });
});
