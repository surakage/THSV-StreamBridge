import { describe, expect, it } from 'vitest';
import { createTestBridge, fixture, silentLogger, testConfig } from '../helpers.js';
import type { OutputAdapter } from '../../bridge/adapters/adapter.js';
import { createDefaultAdapterRegistry } from '../../bridge/adapters/registry.js';
import { StreamBridge } from '../../bridge/core/bridge.js';
import { NoopDeduplicationStore } from '../../bridge/services/deduplication-store.js';
import type { DeliveryOutboxStore } from '../../bridge/services/delivery-outbox-store.js';

describe('StreamBridge hardening', () => {
  it('does not report acceptance or publish locally until the delivery obligation is durable', async () => {
    const config = await testConfig();
    const registry = createDefaultAdapterRegistry(config, silentLogger);
    const store: DeliveryOutboxStore = {
      load: () => Promise.resolve({ version: 1, pending: [], deadLetters: [] }),
      save: () => Promise.reject(new Error('outbox disk full')),
      status: () => ({ enabled: true, durable: true }),
    };
    const bridge = new StreamBridge(config, silentLogger, {
      inputs: registry.createInputs(config.platforms), outputs: registry.createOutputs(config.outputs),
      deduplicationStore: new NoopDeduplicationStore(), deliveryOutboxStore: store,
    });
    let published = false;
    bridge.subscribe(() => { published = true; });
    await bridge.start();
    await expect(bridge.ingest(await fixture())).rejects.toThrow('could not be persisted safely');
    expect(published).toBe(false);
    await bridge.stop();
  });

  it('reports an accepted event even when post-acceptance state persistence fails', async () => {
    const config = await testConfig();
    const bridge = createTestBridge(config, () => Promise.reject(new Error('disk full')));
    await bridge.start();
    await expect(bridge.ingest(await fixture())).resolves.toMatchObject({ accepted: true, duplicate: false, delivery: 'queued' });
    expect(bridge.health()['statePersistenceError']).toBe('Bridge status persistence is unavailable.');
    expect(JSON.stringify(bridge.diagnostics())).not.toContain('disk full');
    await bridge.stop();
  });

  it('serializes concurrent status snapshots and leaves the highest bridge sequence persisted', async () => {
    const config = await testConfig();
    let activeWrites = 0;
    let maximumActiveWrites = 0;
    const snapshots: Array<Record<string, unknown>> = [];
    const bridge = createTestBridge(config, async (_path, value) => {
      activeWrites += 1;
      maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites);
      await new Promise((resolve) => setTimeout(resolve, 2));
      snapshots.push(value as Record<string, unknown>);
      activeWrites -= 1;
    });
    await bridge.start();
    const template = await fixture();
    await Promise.all(Array.from({ length: 10 }, (_, index) => bridge.ingest({
      ...template,
      eventId: `concurrent-${String(index)}`,
      source: { ...template.source, eventId: `concurrent-source-${String(index)}` },
    })));

    expect(maximumActiveWrites).toBe(1);
    expect(snapshots.at(-1)?.['bridgeSequence']).toBe(10);
    await bridge.stop();
  });

  it('keeps malformed configured commands inert without discarding their public chat event', async () => {
    const bridge = createTestBridge(await testConfig());
    await bridge.start();
    const event = await fixture();
    const malformed = await bridge.simulate({ ...event, payload: { message: '!ping "open' } });
    expect(malformed).toMatchObject({
      duplicate: false,
      eventId: event.eventId,
    });
    expect(malformed.derivedEventIds).toBeUndefined();
    await expect(bridge.simulate({
      ...event,
      eventId: `${event.eventId}-fixed`,
      source: { ...event.source, eventId: `${event.source.eventId ?? event.eventId}-fixed` },
      payload: { message: '!ping fixed' },
    })).resolves.toMatchObject({
      duplicate: false,
      derivedEventIds: [expect.stringMatching(/^command-/)],
    });
    await bridge.stop();
  });

  it('marks readiness false for an enabled placeholder adapter', async () => {
    const config = await testConfig();
    const twitch = config.platforms['twitch'];
    if (twitch === undefined) throw new Error('Missing Twitch test configuration');
    twitch.enabled = true;
    twitch.adapter = 'twitch-placeholder';
    const bridge = createTestBridge(config);
    await bridge.start();
    expect(bridge.readiness()).toMatchObject({
      ready: false,
      status: 'not-ready',
      blockers: [expect.objectContaining({ kind: 'adapter', name: 'twitch', state: 'degraded', recovery: expect.stringContaining('Reconnect') as string })],
    });
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
