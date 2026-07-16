import { describe, expect, it } from 'vitest';
import { createTestBridge, fixture, silentLogger, testConfig } from '../helpers.js';
import type { OutputAdapter } from '../../bridge/adapters/adapter.js';
import { createDefaultAdapterRegistry } from '../../bridge/adapters/registry.js';
import { StreamBridge } from '../../bridge/core/bridge.js';
import { NoopDeduplicationStore } from '../../bridge/services/deduplication-store.js';

describe('StreamBridge hardening', () => {
  it('reports an accepted event even when post-acceptance state persistence fails', async () => {
    const config = await testConfig();
    const bridge = createTestBridge(config, () => Promise.reject(new Error('disk full')));
    await bridge.start();
    await expect(bridge.ingest(await fixture())).resolves.toMatchObject({ accepted: true, duplicate: false, delivery: 'queued' });
    expect(bridge.health()['statePersistenceError']).toBe('disk full');
    await bridge.stop();
  });

  it('marks readiness false for an enabled placeholder adapter', async () => {
    const config = await testConfig();
    const twitch = config.platforms['twitch'];
    if (twitch === undefined) throw new Error('Missing Twitch test configuration');
    twitch.enabled = true;
    const bridge = createTestBridge(config);
    await bridge.start();
    expect(bridge.readiness()).toMatchObject({ ready: false, status: 'not-ready' });
    await bridge.stop();
  });

  it('aborts cancellable shutdown work at the configured timeout', async () => {
    const config = await testConfig();
    config.service.shutdownTimeoutMs = 100;
    let aborted = false;
    const output: OutputAdapter = {
      name: 'hanging-output',
      enabled: true,
      start: () => Promise.resolve(),
      stop: (signal) => new Promise<void>((resolve) => signal?.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true })),
      deliver: () => Promise.resolve(),
      status: () => ({ name: 'hanging-output', state: 'connected' }),
    };
    const registry = createDefaultAdapterRegistry(config, silentLogger);
    const bridge = new StreamBridge(config, silentLogger, {
      inputs: registry.createInputs(config.platforms),
      outputs: [output],
      deduplicationStore: new NoopDeduplicationStore(),
    });
    await bridge.start();
    await bridge.stop();
    await expect.poll(() => aborted).toBe(true);
  });
});
