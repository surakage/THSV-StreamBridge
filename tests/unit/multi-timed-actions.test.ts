import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlatformConfig, TimedActionsConfig } from '../../schemas/config.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import { TimedActionsAdapter } from '../../bridge/adapters/timed-actions-adapter.js';
import { projectMultiTimedAction } from '../../bridge/core/multi-timed-actions.js';
import { silentLogger } from '../helpers.js';

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
    await vi.advanceTimersByTimeAsync(0); await vi.waitFor(() => expect(events).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(60_000); await vi.waitFor(() => expect(events).toHaveLength(2));
    await vi.advanceTimersByTimeAsync(60_000); await vi.waitFor(() => expect(events).toHaveLength(3));
    await vi.advanceTimersByTimeAsync(60_000); await vi.waitFor(() => expect(events).toHaveLength(4));
    expect(events.map((event) => event.payload['selectedMessage'])).toEqual(['A', 'B', 'C', 'A']);
    expect(new Set(events.slice(0, 3).map((event) => event.payload['selectedMessage'])).size).toBe(3);
    await adapter.stop();
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
    await vi.advanceTimersByTimeAsync(5 * 60_000); await vi.waitFor(() => expect(events).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(5 * 60_000); await vi.waitFor(() => expect(events).toHaveLength(2));
    await vi.advanceTimersByTimeAsync(5 * 60_000); await vi.waitFor(() => expect(events).toHaveLength(4));
    expect(events.filter((event) => event.payload['timerId'] === 'fast')).toHaveLength(3);
    expect(events.filter((event) => event.payload['timerId'] === 'slow')).toHaveLength(1);
    await adapter.stop();
  });
});
