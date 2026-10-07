import { afterEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import countdown, { applyElapsed, configuredDurationSeconds, formatRemaining, sanitizeState, sceneShouldStart } from '../../addons/starting-soon-countdown/dist/index.js';

function runtime() {
  let state: Record<string, unknown> = {};
  const context = {
    settings: { enabled: true, durationHours: 0, durationMinutes: 1, durationSeconds: 0, automaticSceneNames: ['📁 Starting Soon'], stopOutsideAutomaticScenes: true, showOverlay: true },
    approvedActionIds: [],
    state: { read: vi.fn(async () => state), write: vi.fn(async (next: Record<string, unknown>) => { state = next; }) },
    overlay: { publish: vi.fn(async (_topic: string, payload: Record<string, unknown>) => {
      const rejectUndefined = (value: unknown): void => {
        if (value === undefined) throw new Error('Overlay payload must contain JSON values');
        if (value && typeof value === 'object') for (const child of Object.values(value)) rejectUndefined(child);
      };
      rejectUndefined(payload);
    }) },
    streamerbot: { runApprovedAction: vi.fn(async () => undefined) },
    schedule: { after: vi.fn((ms: number, callback: () => unknown) => setTimeout(callback, ms)), cancel: vi.fn((timer: ReturnType<typeof setTimeout>) => clearTimeout(timer)) },
  };
  const control = (action: string, seconds?: number) => ({ eventType: 'addon.thsv.starting-soon-countdown.control', payload: { action, ...(seconds === undefined ? {} : { seconds }) } });
  return { context, state: () => state, control };
}

afterEach(async () => { await countdown.stop({ schedule: { cancel: vi.fn() } }); vi.useRealTimers(); });

describe('Stream Launch Countdown add-on', () => {
  it('shows the full duration on scene entry and waits two seconds after a real platform goes live', async () => {
    vi.useFakeTimers();
    const test = runtime(); await countdown.start(test.context);
    await countdown.onEvent({ eventType: 'system.broadcast-started', platform: 'system', payload: { provider: 'obs', sceneName: '📁 Starting Soon' } }, test.context);
    expect(test.state()).toMatchObject({ remainingSeconds: 60, running: false, visible: true, waitingForLive: true });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(test.state().remainingSeconds).toBe(60);
    await countdown.onEvent({ eventType: 'stream.online', platform: 'twitch', payload: {} }, test.context);
    await vi.advanceTimersByTimeAsync(1999);
    expect(test.state().running).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(test.state()).toMatchObject({ remainingSeconds: 60, running: true, visible: true });
    await vi.advanceTimersByTimeAsync(1000);
    // Stored state is remainingSeconds as of updatedAt; ticks no longer rewrite it every second.
    expect(applyElapsed(test.state()).state.remainingSeconds).toBe(59);
    const updates = test.context.overlay.publish.mock.calls.filter(([topic]) => topic.endsWith('.timer.update'));
    expect(updates.at(-1)?.[1]).toMatchObject({ running: true, remainingSeconds: 59 });
    expect(test.context.overlay.publish.mock.results.every(result => result.type === 'return')).toBe(true);
    for (const result of test.context.overlay.publish.mock.results) if (result.type === 'return') await expect(result.value).resolves.toBeUndefined();
    await countdown.onEvent({ eventType: 'system.broadcast-stopped', platform: 'system', payload: {} }, test.context);
    expect(test.state()).toMatchObject({ remainingSeconds: 60, running: false, visible: true });
  });
  it('starts a fresh countdown on first online and preserves it for other platforms', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-04T01:00:00Z'));
    const test = runtime(); await countdown.start(test.context);
    await countdown.onEvent({ eventType: 'stream.scene-changed', payload: { sceneName: '📁 Starting Soon' } }, test.context);
    vi.setSystemTime(new Date('2026-10-04T01:00:20Z'));
    await countdown.onEvent({ eventType: 'stream.online', platform: 'twitch', payload: {} }, test.context);
    expect(test.state().remainingSeconds).toBe(60);
    await vi.advanceTimersByTimeAsync(2000);
    const startedAt = test.state().updatedAt;
    vi.setSystemTime(new Date('2026-10-04T01:00:25Z'));
    await countdown.onEvent({ eventType: 'stream.online', platform: 'youtube', payload: {} }, test.context);
    expect(test.state().updatedAt).toBe(startedAt);
  });
  it('builds a bounded duration and formats short or long countdowns', () => {
    expect(configuredDurationSeconds({ durationHours: 1, durationMinutes: 2, durationSeconds: 3 })).toBe(3_723);
    expect(configuredDurationSeconds({ durationHours: 0, durationMinutes: 0, durationSeconds: 0 })).toBe(1);
    expect(formatRemaining(90)).toBe('01:30');
    expect(formatRemaining(3_723)).toBe('01:02:03');
  });

  it('completes once, stops at zero, and increments the tone sequence', () => {
    const state = sanitizeState({ initialized: true, remainingSeconds: 3, maximumSeconds: 10, running: true, visible: true, updatedAt: 1_000, completionSequence: 4 }, 10);
    const result = applyElapsed(state, 5_000);
    expect(result.completedNow).toBe(true);
    expect(result.state).toMatchObject({ remainingSeconds: 0, running: false, visible: true, completed: true, completionSequence: 5, lastReason: 'completed' });
    expect(applyElapsed(result.state, 10_000).completedNow).toBe(false);
  });

  it('does not reset for duplicate Start or a Studio Mode stop-start cycle', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-08T20:00:00.000Z'));
    const test = runtime(); await countdown.start(test.context);
    await countdown.onEvent(test.control('start'), test.context);
    vi.setSystemTime(new Date('2026-08-08T20:00:08.000Z'));
    await countdown.onEvent(test.control('start'), test.context);
    expect(test.state()).toMatchObject({ remainingSeconds: 52, maximumSeconds: 60, running: true, lastReason: 'duplicate-start-ignored' });

    await countdown.onEvent(test.control('stop'), test.context);
    await countdown.onEvent(test.control('start'), test.context);
    expect(test.state()).toMatchObject({ remainingSeconds: 52, maximumSeconds: 60, running: true, visible: true, lastReason: 'start-resumed' });
  });

  it('uses Set & Start as the explicit running countdown override', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-08T20:00:00.000Z'));
    const test = runtime(); await countdown.start(test.context);
    await countdown.onEvent(test.control('start'), test.context);
    vi.setSystemTime(new Date('2026-08-08T20:00:05.000Z'));
    await countdown.onEvent(test.control('set-and-start', 120), test.context);
    expect(test.state()).toMatchObject({ remainingSeconds: 120, maximumSeconds: 120, running: true, lastReason: 'set-and-start' });
  });

  it('matches exact configured program scenes and never resets on duplicate scene events', async () => {
    expect(sceneShouldStart('📁 STARTING SOON', ['📁 Starting Soon'])).toBe(true);
    expect(sceneShouldStart('Starting Soon', ['📁 Starting Soon'])).toBe(false);
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-08T20:00:00.000Z'));
    const test = runtime(); await countdown.start(test.context);
    await countdown.onEvent({ eventType: 'stream.scene-changed', payload: { sceneName: '📁 Starting Soon' } }, test.context);
    await countdown.onEvent({ eventType: 'stream.online', platform: 'kick', payload: {} }, test.context);
    await vi.advanceTimersByTimeAsync(2000);
    vi.setSystemTime(new Date('2026-08-08T20:00:10.000Z'));
    await vi.advanceTimersByTimeAsync(1000);
    await countdown.onEvent({ eventType: 'stream.scene-changed', payload: { sceneName: '📁 Starting Soon' } }, test.context);
    expect(applyElapsed(test.state()).state).toMatchObject({ remainingSeconds: 51, running: true, visible: true });
    await countdown.onEvent({ eventType: 'stream.scene-changed', payload: { sceneName: '📁 Gaming' } }, test.context);
    expect(test.state()).toMatchObject({ remainingSeconds: 51, running: false, visible: false, lastReason: 'stop' });
  });

  it('cancels a pending start on scene exit or all platforms offline and ignores simulated live events', async () => {
    vi.useFakeTimers();
    const test = runtime(); await countdown.start(test.context);
    const scene = (sceneName: string) => ({ eventType: 'stream.scene-changed', payload: { sceneName } });
    await countdown.onEvent(scene('📁 Starting Soon'), test.context);
    await countdown.onEvent({ eventType: 'stream.online', platform: 'twitch', metadata: { simulated: true }, payload: {} }, test.context);
    await vi.advanceTimersByTimeAsync(3000);
    expect(test.state().running).toBe(false);
    await countdown.onEvent({ eventType: 'stream.online', platform: 'youtube', payload: {} }, test.context);
    await countdown.onEvent(scene('📁 Gaming'), test.context);
    await vi.advanceTimersByTimeAsync(3000);
    expect(test.state()).toMatchObject({ running: false, visible: false });
    await countdown.onEvent(scene('📁 Starting Soon'), test.context);
    await countdown.onEvent({ eventType: 'stream.offline', platform: 'youtube', payload: {} }, test.context);
    await vi.advanceTimersByTimeAsync(3000);
    expect(test.state()).toMatchObject({ running: false, visible: true, remainingSeconds: 60, automaticStartAt: 0 });
  });

  it('can keep a manually started countdown running outside automatic scenes', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-08T20:00:00.000Z'));
    const test = runtime();
    test.context.settings.stopOutsideAutomaticScenes = false;
    await countdown.start(test.context);
    await countdown.onEvent(test.control('start'), test.context);
    await countdown.onEvent({ eventType: 'stream.scene-changed', payload: { sceneName: '📁 Gaming' } }, test.context);
    expect(test.state()).toMatchObject({ remainingSeconds: 60, running: true, visible: true, lastReason: 'start' });
  });

  it('publishes every second but checkpoints private state only on changes and every 30 seconds', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-08T20:00:00.000Z'));
    const test = runtime(); test.context.settings.durationMinutes = 2; await countdown.start(test.context);
    await countdown.onEvent(test.control('start'), test.context);
    const writesAfterStart = test.context.state.write.mock.calls.length;
    const updates = () => test.context.overlay.publish.mock.calls.filter(([topic]) => topic.endsWith('.timer.update'));
    const updatesAfterStart = updates().length;
    await vi.advanceTimersByTimeAsync(29_000);
    expect(test.context.state.write.mock.calls.length).toBe(writesAfterStart);
    expect(updates().length - updatesAfterStart).toBe(29);
    expect(updates().at(-1)?.[1]).toMatchObject({ remainingSeconds: 91, running: true });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(test.context.state.write.mock.calls.length).toBe(writesAfterStart + 1);
    expect(test.state()).toMatchObject({ remainingSeconds: 90, running: true });
    // A Bridge restart resumes from the stored pair without losing elapsed time.
    await vi.advanceTimersByTimeAsync(5_000);
    await countdown.stop(test.context); await countdown.start(test.context);
    expect(applyElapsed(test.state()).state.remainingSeconds).toBe(85);
    await countdown.onEvent(test.control('start'), test.context);
    expect(test.state()).toMatchObject({ remainingSeconds: 85, running: true });
    // Completion is always written immediately.
    await vi.advanceTimersByTimeAsync(85_000);
    expect(test.state()).toMatchObject({ remainingSeconds: 0, completed: true, running: false });
  });
});
