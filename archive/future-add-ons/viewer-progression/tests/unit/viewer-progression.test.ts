import { describe, expect, it, vi } from 'vitest';
import { projectViewerProgression, ViewerProgressionEngine } from '../../bridge/core/viewer-progression.js';
import type { ViewerProgressionStore } from '../../bridge/services/viewer-progression-store.js';
import { bridgeConfigSchema, type ViewerIdentityConfig } from '../../schemas/config.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import { fixture } from '../helpers.js';

class MemoryStore implements ViewerProgressionStore {
  public value: unknown;
  public saves = 0;
  public constructor(initial?: unknown) { this.value = initial; }
  public async load(): Promise<unknown> { return this.value; }
  public async save(value: unknown): Promise<void> { this.value = structuredClone(value); this.saves += 1; }
  public scheduleSave(value: unknown): void { this.value = structuredClone(value); }
  public async flush(): Promise<void> { return Promise.resolve(); }
  public status(): Readonly<Record<string, unknown>> { return { type: 'memory' }; }
}

describe('viewer identity and progression', () => {
  it('unifies explicitly linked platform accounts and enforces one cross-platform chat cooldown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T20:00:00.000Z'));
    const config = viewerConfig();
    config.links = [{ viewerId: 'village-friend', accounts: [{ platform: 'twitch', userId: 'viewer-42' }, { platform: 'youtube', userId: 'youtube-42' }] }];
    const store = new MemoryStore();
    const engine = new ViewerProgressionEngine(config, store);
    await engine.start();

    const twitch = await event('twitch', 'viewer-42', 'twitch-one');
    const youtube = await event('youtube', 'youtube-42', 'youtube-one');
    const first = await engine.process(twitch);
    const second = await engine.process(youtube);

    expect(first).toMatchObject({ viewerId: 'village-friend', linked: true, progressionEvent: { payload: { pointsAwarded: 1, totalPoints: 1 } } });
    expect(second).toEqual({ viewerId: 'village-friend', linked: true });
    expect(store.saves).toBe(1);
    expect(projectViewerProgression(first?.progressionEvent as NormalizedEvent)).toMatchObject({ viewerId: 'village-friend', pointsAwarded: 1, totalPoints: 1, level: 1 });
    vi.useRealTimers();
  });

  it('uses stable pseudonymous platform-scoped identities without storing names or chat text', async () => {
    const config = viewerConfig();
    config.progression.cooldownsMs = {};
    const store = new MemoryStore();
    const engine = new ViewerProgressionEngine(config, store);
    await engine.start();
    const twitch = await engine.process(await event('twitch', 'same-id', 'one'));
    const youtube = await engine.process(await event('youtube', 'same-id', 'two'));
    expect(twitch?.viewerId).toMatch(/^twitch-[a-f0-9]{24}$/u);
    expect(youtube?.viewerId).toMatch(/^youtube-[a-f0-9]{24}$/u);
    expect(twitch?.viewerId).not.toBe(youtube?.viewerId);
    const persisted = JSON.stringify(store.value);
    expect(persisted).not.toContain('Example Viewer');
    expect(persisted).not.toContain('Hello from');
    expect(persisted).not.toContain('same-id');
  });

  it('suppresses replayed source identities even after the award cooldown expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T20:00:00.000Z'));
    const config = viewerConfig();
    const engine = new ViewerProgressionEngine(config, new MemoryStore());
    await engine.start();
    const source = await event('twitch', 'viewer-42', 'stable-source');
    expect((await engine.process(source))?.progressionEvent).toBeDefined();
    vi.setSystemTime(new Date('2026-07-16T20:02:00.000Z'));
    const replay = await engine.process({ ...source, eventId: 'retried-envelope' });
    expect(replay?.viewerId).toMatch(/^[a-z][a-z0-9-]+$/u);
    expect(replay?.progressionEvent).toBeUndefined();
    vi.useRealTimers();
  });

  it('excludes simulated events and non-human actors by default', async () => {
    const config = viewerConfig();
    const engine = new ViewerProgressionEngine(config, new MemoryStore());
    await engine.start();
    const simulated = { ...(await event('twitch', 'viewer-42', 'simulated')), metadata: { simulated: true } };
    expect((await engine.process(simulated))?.viewerId).toMatch(/^[a-z][a-z0-9-]+$/u);
    expect((await engine.process(simulated))?.progressionEvent).toBeUndefined();
    if (simulated.user === undefined) throw new Error('Fixture requires a user.');
    const bot = { ...simulated, metadata: { ...simulated.metadata, simulated: false }, user: { ...simulated.user, actorType: 'bot' as const } };
    expect(await engine.process(bot)).toBeUndefined();
  });

  it('refuses malformed persisted state instead of silently resetting progression', async () => {
    const engine = new ViewerProgressionEngine(viewerConfig(), new MemoryStore({ version: 1, viewers: 'broken', processedEvents: [] }));
    await expect(engine.start()).rejects.toThrow('Viewer progression state is invalid');
  });

  it('rejects duplicate links and non-increasing level thresholds at configuration load', () => {
    const base = bridgeConfigSchema.parse({
      configVersion: '1.0.0',
      service: { name: 'test', host: '127.0.0.1', port: 8787, allowNetworkAccess: false, shutdownTimeoutMs: 1000 },
      security: { maxPayloadBytes: 1024, preserveRawPayloads: false, allowedOrigins: [], maxRequestsPerMinute: 60, maxConcurrentRequests: 4 },
      logging: { level: 'info', directory: 'logs', maxFileBytes: 1024, backups: 1 },
      deduplication: { ttlMs: 1000, maxEntries: 10 },
      platforms: { mock: { enabled: true, inputEnabled: true, outputEnabled: false, adapter: 'mock', capabilities: [], reconnect: { enabled: false, initialDelayMs: 10, maxDelayMs: 10, maxAttempts: 0 } } },
      streamerbot: { enabled: false, url: 'ws://127.0.0.1:8080/', passwordEnv: 'STREAMERBOT_PASSWORD', actionAlias: 'Receive', acknowledgementTimeoutMs: 1000, testMode: true, reconnect: { enabled: false, initialDelayMs: 10, maxDelayMs: 10, maxAttempts: 0 } },
    });
    const invalid = { ...base, viewerIdentity: { ...base.viewerIdentity, links: [{ viewerId: 'one', accounts: [{ platform: 'twitch', userId: 'x' }] }, { viewerId: 'two', accounts: [{ platform: 'twitch', userId: 'x' }] }], progression: { ...base.viewerIdentity.progression, levelThresholds: [0, 100, 100] } } };
    expect(bridgeConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it('serializes bounded moderator add, remove, and reset adjustments', async () => {
    const store = new MemoryStore();
    const engine = new ViewerProgressionEngine(viewerConfig(), store);
    await engine.start();
    const base = { viewerId: 'village-friend', performedBy: 'surakage', reason: 'moderator correction' };
    expect(await engine.adjust({ ...base, operation: 'add', amount: 6 })).toMatchObject({ previousPoints: 0, totalPoints: 6, previousLevel: 1, level: 3 });
    expect(await engine.adjust({ ...base, operation: 'remove', amount: 2 })).toMatchObject({ previousPoints: 6, totalPoints: 4, level: 2 });
    expect(await engine.adjust({ ...base, operation: 'remove', amount: 100 })).toMatchObject({ previousPoints: 4, totalPoints: 0, level: 1 });
    expect(await engine.adjust({ ...base, operation: 'reset' })).toMatchObject({ previousPoints: 0, totalPoints: 0, amount: 0 });
    await expect(engine.adjust({ ...base, operation: 'add', amount: 1_000_001 })).rejects.toThrow('amount must be');
    expect(store.saves).toBe(4);
  });

  it('deletes a viewer record and active links inside the progression operation queue', async () => {
    const config = viewerConfig();
    config.links = [{ viewerId: 'village-friend', accounts: [{ platform: 'twitch', userId: 'viewer-42' }] }];
    config.progression.cooldownsMs = {};
    const store = new MemoryStore();
    const engine = new ViewerProgressionEngine(config, store);
    await engine.start();
    await engine.process(await event('twitch', 'viewer-42', 'before-delete'));
    const rollback = vi.fn(() => Promise.resolve());
    expect(await engine.deleteViewer('village-friend', async () => ({ removedLinks: 1, removedAccounts: 1, rollback }))).toEqual({
      viewerId: 'village-friend', recordRemoved: true, removedLinks: 1, removedAccounts: 1,
    });
    expect(JSON.stringify(store.value)).not.toContain('village-friend');
    expect((await engine.process(await event('twitch', 'viewer-42', 'after-delete')))?.linked).toBe(false);
    expect(rollback).not.toHaveBeenCalled();
  });
});

function viewerConfig(): ViewerIdentityConfig {
  return {
    enabled: true,
    stateFile: 'viewer-state.json',
    includeSimulated: false,
    processedEventTtlMs: 86_400_000,
    maxProcessedEvents: 10_000,
    links: [],
    progression: { enabled: true, points: { 'chat.message': 1 }, cooldownsMs: { 'chat.message': 60_000 }, levelThresholds: [0, 2, 5] },
  };
}

async function event(platform: string, userId: string, sourceEventId: string): Promise<NormalizedEvent> {
  const source = await fixture('twitch-chat.json');
  if (source.user === undefined) throw new Error('Fixture requires a user.');
  return {
    ...source,
    eventId: `event-${sourceEventId}`,
    platform,
    source: { ...source.source, eventId: sourceEventId },
    user: { ...source.user, id: userId, actorType: 'human' },
    metadata: { ...source.metadata, simulated: false },
  };
}
