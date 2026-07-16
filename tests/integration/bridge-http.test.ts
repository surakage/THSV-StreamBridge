import { afterEach, describe, expect, it } from 'vitest';
import { StreamBridge } from '../../bridge/core/bridge.js';
import { DiagnosticsServer } from '../../bridge/services/http-server.js';
import { fixture, silentLogger, testConfig } from '../helpers.js';

const stops: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.allSettled(stops.splice(0).map((stop) => stop())); });

async function runningService(maxPayloadBytes = 262_144): Promise<{ bridge: StreamBridge; server: DiagnosticsServer; baseUrl: string }> {
  const config = await testConfig();
  config.service.port = 0;
  config.security.maxPayloadBytes = maxPayloadBytes;
  const bridge = new StreamBridge(config, silentLogger);
  const server = new DiagnosticsServer({ ...config.service, ...config.security }, bridge, silentLogger);
  await bridge.start();
  await server.start();
  stops.push(async () => { await server.stop(); await bridge.stop(); });
  return { bridge, server, baseUrl: `http://127.0.0.1:${String(server.port)}` };
}

describe('bridge HTTP integration', () => {
  it('accepts a valid event, rejects its duplicate, and reports health', async () => {
    const { baseUrl } = await runningService();
    const event = await fixture();
    const first = await fetch(`${baseUrl}/simulate`, { method: 'POST', body: JSON.stringify(event) });
    const second = await fetch(`${baseUrl}/simulate`, { method: 'POST', body: JSON.stringify(event) });
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    const health = await fetch(`${baseUrl}/health`).then((response) => response.json()) as { status: string; lastSuccessfulEventAt?: string };
    const readiness = await fetch(`${baseUrl}/ready`);
    expect(health.status).toBe('healthy');
    expect(health.lastSuccessfulEventAt).toBeTypeOf('string');
    expect(readiness.status).toBe(200);
  });

  it('rejects invalid and oversized payloads', async () => {
    const { baseUrl } = await runningService(1_024);
    const invalid = await fetch(`${baseUrl}/simulate`, { method: 'POST', body: '{}' });
    const oversized = await fetch(`${baseUrl}/simulate`, { method: 'POST', body: JSON.stringify({ padding: 'x'.repeat(2_000) }) });
    expect(invalid.status).toBe(400);
    expect(oversized.status).toBe(413);
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
    const secondBridge = new StreamBridge(config, silentLogger);
    const secondServer = new DiagnosticsServer({ ...config.service, ...config.security }, secondBridge, silentLogger);
    await secondBridge.start();
    stops.push(() => secondBridge.stop());
    await expect(secondServer.start()).rejects.toThrow('Port conflict');
  });
});
