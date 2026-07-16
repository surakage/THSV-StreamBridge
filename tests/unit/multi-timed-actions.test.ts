import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlatformConfig, TimedActionsConfig } from '../../schemas/config.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import { TimedActionsAdapter } from '../../bridge/adapters/timed-actions-adapter.js';
import { projectMultiTimedAction } from '../../bridge/core/multi-timed-actions.js';
import { createTestBridge, fixture, silentLogger, testConfig } from '../helpers.js';

const platform: PlatformConfig = { enabled: true, inputEnabled: true, outputEnabled: false, adapter: 'timed-actions', capabilities: ['timedActions'], reconnect: { enabled: false, initialDelayMs: 10, maxDelayMs: 10, maxAttempts: 0 } };
afterEach(() => { vi.useRealTimers(); });

describe('Multi-Timed Actions', () => {
  it('projects session timing and shuffle-container selection', async () => {
    const event = JSON.parse(await readFile('tests/fixtures/system-timed.json', 'utf8')) as NormalizedEvent;
    expect(projectMultiTimedAction({ ...event, metadata: { ...event.metadata, bridgeSequence: 9 } })).toMatchObject({
      contractVersion: '1.0.0', timerId: 'hydration-reminder', scheduleType: 'session-interval', occurrence: 3,
      lateByMs: 250, selectionMode: 'shuffle-container', selectedMessage: 'Remember to drink some water!', containerPosition: 3, containerSize: 4,
    });
  });

  it('ignores unrelated events and rejects malformed timer semantics', async () => {
    const event = JSON.parse(await readFile('tests/fixtures/system-timed.json', 'utf8')) as NormalizedEvent;
    expect(projectMultiTimedAction({ ...event, eventType: 'chat.message' })).toBeUndefined();
    expect(() => projectMultiTimedAction({ ...event, payload: { ...event.payload, occurrence: 0 } })).toThrow('occurrence');
  });

  it('sends every container message once before repeating and persists the bag', async () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-07-16T16:00:00.000Z');
    const directory = await mkdtemp(join(tmpdir(), 'streambridge-shuffle-'));
    const config: TimedActionsConfig = { stateFile: join(directory, 'state.json'), definitions: [{
      id: 'rotation', name: 'Rotation', enabled: true, everyMinutes: 1, firstRunAfterMinutes: 0, missedRunPolicy: 'fire-once', payload: {},
      selection: { mode: 'shuffle-container', messages: ['A', 'B', 'C'] },
    }] };
    const events: NormalizedEvent[] = [];
    const adapter = new TimedActionsAdapter('timers', platform, config, () => 0);
    await adapter.start({ logger: silentLogger, emit: (event) => { events.push(event as NormalizedEvent); return Promise.resolve({ accepted: true }); } });
    await adapter.control('start');
    await vi.advanceTimersByTimeAsync(0); await vi.waitFor(() => expect(events).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(60_000); await vi.waitFor(() => expect(events).toHaveLength(2));
    await vi.advanceTimersByTimeAsync(60_000); await vi.waitFor(() => expect(events).toHaveLength(3));
    await vi.advanceTimersByTimeAsync(60_000); await vi.waitFor(() => expect(events).toHaveLength(4));
    expect(events.map((event) => event.payload['selectedMessage'])).toEqual(['A', 'B', 'C', 'A']);
    expect(new Set(events.slice(0, 3).map((event) => event.payload['selectedMessage'])).size).toBe(3);
    await adapter.control('stop'); await adapter.stop();
    expect(JSON.parse(await readFile(config.stateFile, 'utf8'))).toMatchObject({ session: { active: false }, timers: { rotation: { lastSelected: 0, cycle: 2 } } });
  });

  it('lets independent fixed and container timers use different minute intervals', async () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-07-16T16:00:00.000Z');
    const directory = await mkdtemp(join(tmpdir(), 'streambridge-independent-'));
    const config: TimedActionsConfig = { stateFile: join(directory, 'state.json'), definitions: [
      { id: 'fast', name: 'Fast', enabled: true, everyMinutes: 5, missedRunPolicy: 'fire-once', payload: { kind: 'fixed' }, selection: { mode: 'fixed' } },
      { id: 'slow', name: 'Slow', enabled: true, everyMinutes: 15, missedRunPolicy: 'fire-once', payload: {}, selection: { mode: 'shuffle-container', messages: ['One', 'Two'] } },
    ] };
    const events: NormalizedEvent[] = [];
    const adapter = new TimedActionsAdapter('timers', platform, config, () => 0);
    await adapter.start({ logger: silentLogger, emit: (event) => { events.push(event as NormalizedEvent); return Promise.resolve({ accepted: true }); } });
    await adapter.control('start');
    await vi.advanceTimersByTimeAsync(5 * 60_000); await vi.waitFor(() => expect(events).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(5 * 60_000); await vi.waitFor(() => expect(events).toHaveLength(2));
    await vi.advanceTimersByTimeAsync(5 * 60_000); await vi.waitFor(() => expect(events).toHaveLength(4));
    expect(events.filter((event) => event.payload['timerId'] === 'fast')).toHaveLength(3);
    expect(events.filter((event) => event.payload['timerId'] === 'slow')).toHaveLength(1);
    await adapter.stop();
  });

  it('stays dormant until start and pause freezes the remaining interval', async () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-07-16T16:00:00.000Z');
    const directory = await mkdtemp(join(tmpdir(), 'streambridge-pause-'));
    const config: TimedActionsConfig = { stateFile: join(directory, 'state.json'), definitions: [{ id: 'promo', name: 'Promo', enabled: true, everyMinutes: 10, missedRunPolicy: 'skip', payload: {}, selection: { mode: 'fixed' } }] };
    const events: NormalizedEvent[] = []; const adapter = new TimedActionsAdapter('timers', platform, config);
    await adapter.start({ logger: silentLogger, emit: (event) => { events.push(event as NormalizedEvent); return Promise.resolve({ accepted: true }); } });
    await vi.advanceTimersByTimeAsync(20 * 60_000); expect(events).toHaveLength(0);
    await adapter.control('start'); await vi.advanceTimersByTimeAsync(5 * 60_000); await adapter.control('pause');
    await vi.advanceTimersByTimeAsync(20 * 60_000); expect(events).toHaveLength(0);
    await adapter.control('resume'); await vi.advanceTimersByTimeAsync(5 * 60_000); await vi.waitFor(() => expect(events).toHaveLength(1));
    await adapter.control('stop'); await adapter.stop();
  });

  it('starts on the first live platform and stops only after every live platform is offline', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'streambridge-live-session-'));
    const config = await testConfig();
    config.timedActions.stateFile = join(directory, 'state.json');
    const bridge = createTestBridge(config);
    await bridge.start();
    const template = await fixture();
    const lifecycleEvent = (platformName: string, eventType: 'stream.online' | 'stream.offline', suffix: string): NormalizedEvent => ({
      ...template,
      eventId: `lifecycle-${suffix}`,
      eventType,
      platform: platformName,
      source: { ...template.source, eventId: `lifecycle-source-${suffix}` },
      user: undefined,
      payload: {},
    });

    await bridge.ingest(lifecycleEvent('twitch', 'stream.online', 'twitch-online'));
    expect(bridge.diagnostics()['timedActions']).toMatchObject({ active: true, paused: false });
    await bridge.ingest(lifecycleEvent('youtube', 'stream.online', 'youtube-online'));
    await bridge.ingest(lifecycleEvent('twitch', 'stream.offline', 'twitch-offline'));
    expect(bridge.diagnostics()['timedActions']).toMatchObject({ active: true, paused: false });
    await bridge.ingest(lifecycleEvent('youtube', 'stream.offline', 'youtube-offline'));
    expect(bridge.diagnostics()['timedActions']).toMatchObject({ active: false, paused: false });
    await bridge.stop();
  });

  it('keeps the persisted session anchor when online state is announced after a bridge restart', async () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-07-16T16:00:00.000Z');
    const directory = await mkdtemp(join(tmpdir(), 'streambridge-restart-session-'));
    const config = await testConfig();
    config.timedActions.stateFile = join(directory, 'state.json');
    const template = await fixture();
    const onlineEvent = (suffix: string): NormalizedEvent => ({
      ...template,
      eventId: `restart-online-${suffix}`,
      eventType: 'stream.online',
      source: { ...template.source, eventId: `restart-online-source-${suffix}` },
      user: undefined,
      payload: {},
    });

    const firstBridge = createTestBridge(config);
    await firstBridge.start();
    await firstBridge.ingest(onlineEvent('first'));
    const originalStart = (firstBridge.diagnostics()['timedActions'] as Record<string, unknown>)['startedAt'];
    await firstBridge.stop();
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    const restartedBridge = createTestBridge(config);
    await restartedBridge.start();
    await restartedBridge.ingest(onlineEvent('restart'));
    expect((restartedBridge.diagnostics()['timedActions'] as Record<string, unknown>)['startedAt']).toBe(originalStart);
    await restartedBridge.controlTimedActions('stop');
    await restartedBridge.stop();
  });
});
