import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable extensions intentionally export plain JavaScript */
// @ts-expect-error executable extension entrypoints are intentionally plain JavaScript
import guard, { automaticBreakIntervalMinutes, CONTROLLER_ACTION_ID, createSessionState, evaluate, nextBreakDeadline, sanitizeState } from '../../addons/stream-session-guard/dist/index.js';

function runtime(settings: Record<string, unknown> = {}) {
  let state: Record<string, unknown> = {};
  const scheduled: Array<{ delay: number; task: () => Promise<void> }> = [];
  const context = {
    settings: { enabled: true, provider: 'obs', connectionIndex: 0, breaksEnabled: true, breakScheduleMode: 'automatic', breakIntervalMinutes: 60, warningMinutes: 5, breakDurationMinutes: 5, breakSceneName: 'BRB', returnMode: 'previous', returnSceneName: '', streamLimitEnabled: true, maximumStreamMinutes: 240, endingSceneName: 'Stream Ending', showOverlayWarning: true, ...settings },
    approvedActionIds: [CONTROLLER_ACTION_ID],
    state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) },
    streamerbot: { runApprovedAction: vi.fn(async () => undefined) },
    overlay: { publish: vi.fn(async () => undefined) },
    schedule: { after: vi.fn((delay: number, task: () => Promise<void>) => { scheduled.push({ delay, task }); return `timer-${String(scheduled.length)}`; }), cancel: vi.fn(() => true) },
  };
  return { context, state: () => state, setState: (value: Record<string, unknown>) => { state = value; }, scheduled };
}

describe('Stream Break & End Guard extension', () => {
  it('derives a sensible automatic cadence from the planned stream length', () => {
    expect(automaticBreakIntervalMinutes(30)).toBe(15);
    expect(automaticBreakIntervalMinutes(60)).toBe(30);
    expect(automaticBreakIntervalMinutes(90)).toBe(45);
    expect(automaticBreakIntervalMinutes(120)).toBe(60);
    expect(automaticBreakIntervalMinutes(240)).toBe(60);
  });

  it('creates persisted session deadlines and rolls missed breaks forward', () => {
    const state = createSessionState(sanitizeState({}), { breaksEnabled: true, breakIntervalMinutes: 60, streamLimitEnabled: true, maximumStreamMinutes: 240 }, 1_000);
    expect(state).toMatchObject({ phase: 'live', nextBreakAt: 3_601_000, endAt: 14_401_000, sessionSequence: 1 });
    expect(nextBreakDeadline(7_201_000, 1_000, 60)).toBe(10_801_000);
  });

  it('warns five minutes before a break and switches at the deadline', async () => {
    const test = runtime();
    test.setState({ ...createSessionState(sanitizeState({ currentSceneName: 'Gameplay' }), test.context.settings, 1_000), livePlatforms: ['twitch'], currentSceneName: 'Gameplay' });
    await evaluate(test.context, 3_301_000);
    expect(test.context.overlay.publish).toHaveBeenCalledWith(expect.stringContaining('.timer.update'), expect.objectContaining({ label: 'BREAK IN', remainingSeconds: 300 }), { lane: 'timer' });
    await evaluate(test.context, 3_601_000);
    expect(test.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({ sessionGuardPurpose: 'break', sessionGuardSceneName: 'BRB' }));
    expect(test.state()).toMatchObject({ phase: 'break', previousSceneName: 'Gameplay' });
  });

  it('places a one-hour stream break at its midpoint for five minutes', async () => {
    const test = runtime({ maximumStreamMinutes: 60 });
    test.setState({ ...createSessionState(sanitizeState({ currentSceneName: 'Gameplay' }), test.context.settings, 1_000), livePlatforms: ['twitch'], currentSceneName: 'Gameplay' });
    expect(test.state()).toMatchObject({ nextBreakAt: 1_801_000, endAt: 3_601_000 });
    await evaluate(test.context, 1_801_000);
    expect(test.state()).toMatchObject({ phase: 'break', breakEndsAt: 2_101_000 });
  });

  it('restores the prior scene after a break', async () => {
    const test = runtime(); const state = createSessionState(sanitizeState({ currentSceneName: 'Gameplay' }), test.context.settings, 1_000);
    test.setState({ ...state, livePlatforms: ['twitch'], phase: 'break', previousSceneName: 'Gameplay', breakEndsAt: 10_000 });
    await evaluate(test.context, 10_000);
    expect(test.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({ sessionGuardPurpose: 'return', sessionGuardSceneName: 'Gameplay' }));
    expect(test.state()).toMatchObject({ phase: 'live', completedBreaks: 1 });
  });

  it('prioritizes the stream limit and never stops the broadcast', async () => {
    const test = runtime(); const state = createSessionState(sanitizeState({}), test.context.settings, 1_000);
    test.setState({ ...state, livePlatforms: ['twitch'], endAt: 20_000, nextBreakAt: 20_000 });
    await evaluate(test.context, 20_000);
    expect(test.context.streamerbot.runApprovedAction).toHaveBeenCalledOnce();
    expect(test.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({ sessionGuardPurpose: 'ending', sessionGuardSceneName: 'Stream Ending' }));
    expect(JSON.stringify(test.context.streamerbot.runApprovedAction.mock.calls)).not.toMatch(/stop.*stream/iu);
  });

  it('ignores simulated lifecycle events and clears safely when genuinely offline', async () => {
    const test = runtime(); await guard.start(test.context);
    await guard.onEvent({ eventType: 'stream.online', platform: 'twitch', receivedAt: new Date().toISOString(), metadata: { simulated: true }, payload: {} }, test.context);
    expect(test.state()).toMatchObject({ livePlatforms: [], phase: 'idle' });
    await guard.onEvent({ eventType: 'stream.online', platform: 'twitch', receivedAt: new Date().toISOString(), metadata: { simulated: false }, payload: {} }, test.context);
    expect(test.state()).toMatchObject({ livePlatforms: ['twitch'], phase: 'live' });
    await guard.onEvent({ eventType: 'stream.offline', platform: 'twitch', receivedAt: new Date().toISOString(), metadata: { simulated: false }, payload: {} }, test.context);
    expect(test.state()).toMatchObject({ livePlatforms: [], phase: 'idle', nextBreakAt: 0, endAt: 0 });
    await guard.stop(test.context);
  });
});
