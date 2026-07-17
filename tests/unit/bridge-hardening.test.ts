import { describe, expect, it } from 'vitest';
import { createTestBridge, fixture, silentLogger, testConfig } from '../helpers.js';
import type { OutputAdapter } from '../../bridge/adapters/adapter.js';
import { createDefaultAdapterRegistry } from '../../bridge/adapters/registry.js';
import { StreamBridge } from '../../bridge/core/bridge.js';
import { NoopDeduplicationStore } from '../../bridge/services/deduplication-store.js';
import { ViewerProgressionEngine } from '../../bridge/core/viewer-progression.js';
import type { ViewerProgressionStore } from '../../bridge/services/viewer-progression-store.js';

class TestProgressionStore implements ViewerProgressionStore {
  public constructor(private readonly initial: unknown, private readonly failSave = false) {}
  public async load(): Promise<unknown> { return this.initial; }
  public async save(): Promise<void> { if (this.failSave) throw new Error('progression disk full'); }
  public scheduleSave(): void {}
  public async flush(): Promise<void> {}
  public status(): Readonly<Record<string, unknown>> { return { type: 'test' }; }
}

describe('StreamBridge hardening', () => {
  it('reports an accepted event even when post-acceptance state persistence fails', async () => {
    const config = await testConfig();
    const bridge = createTestBridge(config, () => Promise.reject(new Error('disk full')));
    await bridge.start();
    await expect(bridge.ingest(await fixture())).resolves.toMatchObject({ accepted: true, duplicate: false, delivery: 'queued' });
    expect(bridge.health()['statePersistenceError']).toBe('disk full');
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

  it('rejects malformed configured commands readably without poisoning deduplication', async () => {
    const bridge = createTestBridge(await testConfig());
    await bridge.start();
    const event = await fixture();
    await expect(bridge.simulate({ ...event, payload: { message: '!ping "open' } })).rejects.toThrow('Event validation failed');
    await expect(bridge.simulate({ ...event, payload: { message: '!ping fixed' } })).resolves.toMatchObject({
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

  it('starts healthy with viewer progression degraded when persisted state is corrupt', async () => {
    const config = await testConfig();
    config.viewerIdentity.enabled = true;
    const registry = createDefaultAdapterRegistry(config, silentLogger);
    const progression = new ViewerProgressionEngine(
      config.viewerIdentity,
      new TestProgressionStore({ version: 1, viewers: 'broken', processedEvents: [] }),
    );
    const bridge = new StreamBridge(config, silentLogger, {
      inputs: registry.createInputs(config.platforms),
      outputs: registry.createOutputs(config.outputs),
      deduplicationStore: new NoopDeduplicationStore(),
      viewerProgression: progression,
    });

    await expect(bridge.start()).resolves.toBeUndefined();
    expect(bridge.health()).toMatchObject({ status: 'healthy' });
    const viewerIdentity = bridge.diagnostics()['viewerIdentity'] as Readonly<Record<string, unknown>>;
    expect(viewerIdentity).toMatchObject({ enabled: true, active: false, state: 'degraded' });
    expect(typeof viewerIdentity['lastError']).toBe('string');
    expect(String(viewerIdentity['lastError'])).toContain('state is invalid');
    await expect(bridge.ingest(await fixture())).resolves.toMatchObject({ accepted: true, duplicate: false });
    await bridge.stop();
  });

  it('accepts an event and degrades viewer progression when its state write fails', async () => {
    const config = await testConfig();
    config.viewerIdentity.enabled = true;
    config.viewerIdentity.includeSimulated = true;
    config.viewerIdentity.progression.enabled = true;
    config.viewerIdentity.progression.points = { 'chat.message': 1 };
    config.viewerIdentity.progression.cooldownsMs = {};
    const registry = createDefaultAdapterRegistry(config, silentLogger);
    const progression = new ViewerProgressionEngine(config.viewerIdentity, new TestProgressionStore(undefined, true));
    const bridge = new StreamBridge(config, silentLogger, {
      inputs: registry.createInputs(config.platforms),
      outputs: registry.createOutputs(config.outputs),
      deduplicationStore: new NoopDeduplicationStore(),
      viewerProgression: progression,
    });

    await bridge.start();
    await expect(bridge.ingest(await fixture())).resolves.toMatchObject({ accepted: true, duplicate: false, delivery: 'queued' });
    expect(bridge.diagnostics()['viewerIdentity']).toMatchObject({ enabled: true, active: false, state: 'degraded', lastError: 'progression disk full' });
    await bridge.stop();
  });
});
