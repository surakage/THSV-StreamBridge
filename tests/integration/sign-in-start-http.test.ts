import { afterEach, describe, expect, it } from 'vitest';
import { DiagnosticsServer } from '../../bridge/services/http-server.js';
import { SignInStartService } from '../../bridge/services/sign-in-start-service.js';
import { WizardService } from '../../bridge/services/wizard-service.js';
import { createTestBridge, silentLogger, TEST_CONTROL_TOKEN, testConfig } from '../helpers.js';

const stops: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.allSettled(stops.splice(0).map((stop) => stop())); });

const local = { authorization: `Bearer ${TEST_CONTROL_TOKEN}`, 'content-type': 'application/json' };

async function start(): Promise<{ base: string; values: Map<string, string> }> {
  const values = new Map<string, string>();
  const service = new SignInStartService('C:\\StreamBridge', (_file, args) => {
    const name = args[args.indexOf('/v') + 1] ?? '';
    if (args[0] === 'query') { const value = values.get(name); return value === undefined ? Promise.reject(new Error('not found')) : Promise.resolve(`${name} REG_SZ ${value}`); }
    if (args[0] === 'add') values.set(name, args[args.indexOf('/d') + 1] ?? ''); else values.delete(name);
    return Promise.resolve('');
  }, true);
  const config = await testConfig(); config.service.port = 0;
  const bridge = createTestBridge(config);
  const server = new DiagnosticsServer({ ...config.service, ...config.security }, bridge, silentLogger, TEST_CONTROL_TOKEN, undefined, undefined, new WizardService(undefined), 'data', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, service);
  await bridge.start(); await server.start();
  stops.push(async () => { await server.stop(); await bridge.stop(); });
  return { base: `http://127.0.0.1:${String(server.port)}`, values };
}

describe('Start with Windows over HTTP', () => {
  it('needs the control token and the creator approval, and switches on and off', async () => {
    const { base, values } = await start();
    const url = `${base}/wizard/api/sign-in-start`;
    expect((await fetch(url)).status).toBe(401);
    expect(await (await fetch(url, { headers: local })).json()).toEqual({ supported: true, enabled: false });
    expect((await fetch(url, { method: 'PUT', headers: local, body: JSON.stringify({ enabled: true }) })).status).toBe(403);
    expect((await fetch(url, { method: 'PUT', headers: local, body: JSON.stringify({ enabled: 'yes', approvedByCreator: true }) })).status).toBe(400);
    expect(values.size).toBe(0);
    expect(await (await fetch(url, { method: 'PUT', headers: local, body: JSON.stringify({ enabled: true, approvedByCreator: true }) })).json()).toEqual({ supported: true, enabled: true });
    expect(values.size).toBe(1);
    expect(await (await fetch(url, { method: 'PUT', headers: local, body: JSON.stringify({ enabled: false, approvedByCreator: true }) })).json()).toEqual({ supported: true, enabled: false });
    expect(values.size).toBe(0);
  });
});
