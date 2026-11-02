import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiagnosticsServer } from '../../bridge/services/http-server.js';
import { WizardService } from '../../bridge/services/wizard-service.js';
import { ControlDeckError } from '../../bridge/contracts/v2/control-deck.js';
import { createTestBridge, silentLogger, TEST_CONTROL_TOKEN, testConfig } from '../helpers.js';

const stops: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.allSettled(stops.splice(0).map((stop) => stop())); vi.restoreAllMocks(); });

async function start() {
  const config = await testConfig(); config.service.port = 0;
  const bridge = createTestBridge(config);
  const server = new DiagnosticsServer({ ...config.service, ...config.security }, bridge, silentLogger, TEST_CONTROL_TOKEN, undefined, undefined, new WizardService(undefined));
  await bridge.start(); await server.start();
  stops.push(async () => { await server.stop(); await bridge.stop(); });
  return { base: `http://127.0.0.1:${String(server.port)}`, bridge };
}

const headers = { authorization: `Bearer ${TEST_CONTROL_TOKEN}`, 'content-type': 'application/json' };

describe('Control Deck HTTP surface', () => {
  it('serves the page with the Wizard security headers and no inline scripts', async () => {
    const { base } = await start();
    const page = await fetch(`${base}/wizard/control-deck?tab=thsv.prize-wheel`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    const policy = page.headers.get('content-security-policy') ?? '';
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("script-src 'self'");
    const html = await page.text();
    expect(html).toContain('Control Deck');
    expect(html).not.toMatch(/<script>(?!<\/script>)/u);
    expect(html).not.toMatch(/\son[a-z]+=/u);
    expect((await fetch(`${base}/wizard/control-deck.js`)).headers.get('content-type')).toContain('javascript');
    expect((await fetch(`${base}/wizard/control-deck.css`)).headers.get('content-type')).toContain('text/css');
  });

  it('needs the Wizard password for both routes and refuses other websites', async () => {
    const { base, bridge } = await start();
    const run = vi.spyOn(bridge, 'runControlDeck');
    expect((await fetch(`${base}/wizard/api/control-deck/tabs`)).status).toBe(401);
    expect((await fetch(`${base}/wizard/api/control-deck/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"moduleId":"thsv.prize-wheel","operation":"view"}' })).status).toBe(401);
    const foreign = await fetch(`${base}/wizard/api/control-deck/run`, { method: 'POST', headers: { ...headers, origin: 'https://example.com' }, body: '{"moduleId":"thsv.prize-wheel","operation":"view"}' });
    expect(foreign.status).toBe(403);
    const plain = await fetch(`${base}/wizard/api/control-deck/run`, { method: 'POST', headers: { ...headers, 'content-type': 'text/plain' }, body: '{}' });
    expect(plain.status).toBe(415);
    expect(run).not.toHaveBeenCalled();
  });

  it('returns the tabs, runs a control, and answers refusals and bad requests in plain words', async () => {
    const { base, bridge } = await start();
    const tabs = await fetch(`${base}/wizard/api/control-deck/tabs`, { headers });
    expect(tabs.status).toBe(200);
    const body = await tabs.json() as { tabs: Array<{ moduleId: string; enabled: boolean; reason?: string }> };
    expect(body.tabs).toHaveLength(18);
    expect(body.tabs[0]).toMatchObject({ moduleId: 'thsv.streamer-punishments', enabled: false, reason: 'Turn on Streamer Punishments in Extensions to use it here.' });
    const run = vi.spyOn(bridge, 'runControlDeck').mockImplementation(async (moduleId, request) => {
      if (request.operation === 'explode') throw new ControlDeckError(409, 'Prize Wheel does not have that control.');
      return { title: moduleId, message: request.operation, sections: [] };
    });
    const ok = await fetch(`${base}/wizard/api/control-deck/run`, { method: 'POST', headers, body: JSON.stringify({ moduleId: 'thsv.prize-wheel', operation: 'spin', args: { id: '2' } }) });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ moduleId: 'thsv.prize-wheel', view: { title: 'thsv.prize-wheel', message: 'spin', sections: [] } });
    expect(run).toHaveBeenCalledWith('thsv.prize-wheel', { operation: 'spin', args: { id: '2' } });
    const refused = await fetch(`${base}/wizard/api/control-deck/run`, { method: 'POST', headers, body: JSON.stringify({ moduleId: 'thsv.prize-wheel', operation: 'explode' }) });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: 'Prize Wheel does not have that control.' });
    const bad = await fetch(`${base}/wizard/api/control-deck/run`, { method: 'POST', headers, body: JSON.stringify({ moduleId: 'thsv.prize-wheel', operation: 'DROP TABLE' }) });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'That control could not be sent. Refresh the Control Deck and try again.' });
    const big = await fetch(`${base}/wizard/api/control-deck/run`, { method: 'POST', headers, body: JSON.stringify({ moduleId: 'thsv.prize-wheel', operation: 'view', args: { blob: 'x'.repeat(40_000) } }) });
    expect(big.status).toBe(413);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
