import { readFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlatformConfig, TimedActionsConfig } from '../../schemas/config.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import { TimedActionsAdapter } from '../../bridge/adapters/timed-actions-adapter.js';
import { projectMultiTimedAction } from '../../bridge/core/multi-timed-actions.js';
import { silentLogger } from '../helpers.js';

const platform: PlatformConfig = {
  enabled: true, inputEnabled: true, outputEnabled: false, adapter: 'timed-actions', capabilities: ['timedActions'],
  reconnect: { enabled: false, initialDelayMs: 10, maxDelayMs: 10, maxAttempts: 0 },
};

afterEach(() => { vi.useRealTimers(); });

describe('Multi-Timed Actions', () => {
  it('projects a stable timed-event contract and derives lateness', async () => {
    const event = JSON.parse(await readFile('tests/fixtures/system-timed.json', 'utf8')) as NormalizedEvent;
    const projected = projectMultiTimedAction({ ...event, metadata: { ...event.metadata, bridgeSequence: 9 } });
    expect(projected).toMatchObject({
      contractVersion: '1.0.0', eventId: 'sim-system-timed-001', timerId: 'hydration-reminder',
      scheduleType: 'interval', occurrence: 3, missedRuns: 0, lateByMs: 250, bridgeSequence: 9,
      creatorPayload: { category: 'wellness', messageKey: 'hydrate' },
    });
  });

  it('ignores unrelated events and rejects malformed timer semantics', async () => {
    const event = JSON.parse(await readFile('tests/fixtures/system-timed.json', 'utf8')) as NormalizedEvent;
    expect(projectMultiTimedAction({ ...event, eventType: 'chat.message' })).toBeUndefined();
    expect(() => projectMultiTimedAction({ ...event, payload: { ...event.payload, occurrence: 0 } })).toThrow('occurrence');
  });

  it('collapses missed interval occurrences once and persists the completed occurrence', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-16T16:05:30.000Z');
    const directory = await mkdtemp(join(tmpdir(), 'streambridge-timed-'));
    const config: TimedActionsConfig = { stateFile: join(directory, 'state.json'), definitions: [{
      id: 'rotation', name: 'Rotation', enabled: true, missedRunPolicy: 'fire-once', payload: { category: 'scene' },
      schedule: { type: 'interval', anchorAt: '2026-07-16T16:00:00.000Z', everyMs: 60_000 },
    }] };
    const events: NormalizedEvent[] = [];
    const adapter = new TimedActionsAdapter('timers', platform, config);
    await adapter.start({ logger: silentLogger, emit: (event) => { events.push(event as NormalizedEvent); return Promise.resolve({ accepted: true }); } });
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({ occurrence: 6, missedRuns: 5, scheduledAt: '2026-07-16T16:05:00.000Z' });
    await adapter.stop();
    expect(JSON.parse(await readFile(config.stateFile, 'utf8'))).toMatchObject({ completed: { rotation: '2026-07-16T16:05:00.000Z' } });
  });

  it('skips missed occurrences and fires the next exact interval', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-16T16:05:30.000Z');
    const directory = await mkdtemp(join(tmpdir(), 'streambridge-timed-skip-'));
    const config: TimedActionsConfig = { stateFile: join(directory, 'state.json'), definitions: [{
      id: 'reminder', name: 'Reminder', enabled: true, missedRunPolicy: 'skip', payload: {},
      schedule: { type: 'interval', anchorAt: '2026-07-16T16:00:00.000Z', everyMs: 60_000 },
    }] };
    const events: NormalizedEvent[] = [];
    const adapter = new TimedActionsAdapter('timers', platform, config);
    await adapter.start({ logger: silentLogger, emit: (event) => { events.push(event as NormalizedEvent); return Promise.resolve({ accepted: true }); } });
    expect(events).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(events[0]?.payload).toMatchObject({ occurrence: 7, missedRuns: 0, scheduledAt: '2026-07-16T16:06:00.000Z' });
    await adapter.stop();
  });

  it('fires a one-shot schedule exactly once across restart', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-16T16:00:00.000Z');
    const directory = await mkdtemp(join(tmpdir(), 'streambridge-timed-once-'));
    const config: TimedActionsConfig = { stateFile: join(directory, 'state.json'), definitions: [{
      id: 'one-shot', name: 'One Shot', enabled: true, missedRunPolicy: 'fire-once', payload: {},
      schedule: { type: 'once', at: '2026-07-16T16:00:01.000Z' },
    }] };
    const firstEvents: NormalizedEvent[] = [];
    const first = new TimedActionsAdapter('timers', platform, config);
    await first.start({ logger: silentLogger, emit: (event) => { firstEvents.push(event as NormalizedEvent); return Promise.resolve({ accepted: true }); } });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(firstEvents).toHaveLength(1);
    await first.stop();

    const restartEvents: NormalizedEvent[] = [];
    const restart = new TimedActionsAdapter('timers', platform, config);
    await restart.start({ logger: silentLogger, emit: (event) => { restartEvents.push(event as NormalizedEvent); return Promise.resolve({ accepted: true }); } });
    await vi.advanceTimersByTimeAsync(0);
    expect(restartEvents).toHaveLength(0);
    await restart.stop();
  });
});
