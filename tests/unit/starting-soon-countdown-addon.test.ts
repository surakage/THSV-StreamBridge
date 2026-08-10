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
    overlay: { publish: vi.fn(async () => undefined) },
    streamerbot: { runApprovedAction: vi.fn(async () => undefined) },
    schedule: { after: vi.fn(() => Symbol('timer')), cancel: vi.fn() },
  };
  const control = (action: string, seconds?: number) => ({ eventType: 'addon.thsv.starting-soon-countdown.control', payload: { action, ...(seconds === undefined ? {} : { seconds }) } });
  return { context, state: () => state, control };
}

afterEach(async () => { await countdown.stop({ schedule: { cancel: vi.fn() } }); vi.useRealTimers(); });

describe('Stream Launch Countdown add-on', () => {
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
    vi.setSystemTime(new Date('2026-08-08T20:00:08.000Z'));
    await countdown.onEvent({ eventType: 'stream.scene-changed', payload: { sceneName: '📁 Starting Soon' } }, test.context);
    expect(test.state()).toMatchObject({ remainingSeconds: 52, running: true, visible: true, lastReason: 'duplicate-start-ignored' });
    await countdown.onEvent({ eventType: 'stream.scene-changed', payload: { sceneName: '📁 Gaming' } }, test.context);
    expect(test.state()).toMatchObject({ remainingSeconds: 52, running: false, visible: false, lastReason: 'stop' });
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
});
