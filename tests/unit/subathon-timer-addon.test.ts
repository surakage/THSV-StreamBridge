import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import * as subathonModule from '../../addons/subathon-timer/dist/index.js';

type TimerState = Record<string, unknown>;
interface DeckView { title: string; status?: string; message?: string; sections: Array<{ title: string; fields?: Array<{ label: string; value: string }>; actions?: Array<{ operation: string; label: string; args?: Record<string, unknown>; confirm?: string }>; form?: { operation: string } }> }
interface TimerContext { settings: Record<string, unknown>; state: { read: () => Promise<TimerState>; write: (value: never) => Promise<void> }; overlay: { publish: () => Promise<void> }; schedule: { after: (delay: number, task: () => unknown) => string; cancel: () => void } }
const { default: subathon, applyElapsed, awardForEvent, formatRemaining, sanitizeState } = subathonModule as {
  default: { start: (context: TimerContext) => Promise<void>; stop: (context: TimerContext) => Promise<void>; controlDeck: (request: { operation: string; args?: Record<string, unknown> }, context: TimerContext) => Promise<DeckView> };
  applyElapsed: (state: TimerState, now: number) => TimerState;
  awardForEvent: (event: { eventType: string; platform: string; payload: Record<string, unknown> }, settings: Record<string, unknown>, state: TimerState) => TimerState;
  formatRemaining: (seconds: number) => string;
  sanitizeState: (value: TimerState) => TimerState;
};

const settings = {
  enabledPlatforms: ['twitch', 'youtube', 'kick', 'tiktok'], followSeconds: 30, subscriptionSeconds: 300,
  membershipSeconds: 300, giftSubscriptionSecondsEach: 180, giftSecondsEach: 15,
  raidBaseSeconds: 300, raidPerViewerSeconds: 5, minimumRaidViewers: 2,
  likeThreshold: 100, likeThresholdAwardSeconds: 45,
};

describe('Subathon Timer helpers', () => {
  it('returns from its scheduled callback without waiting for private timer I/O', async () => {
    let callback: (() => unknown) | undefined;
    let state = { initialized: true, remainingSeconds: 60, maximumSeconds: 60, running: true, updatedAt: Date.now(), livePlatforms: ['twitch'] };
    const context = { settings: { enabled: true, showOverlay: true }, state: { read: async()=>state, write: async(value: typeof state)=>{state=value;} }, overlay: { publish: async()=>{} }, schedule: { after: (_delay: number, task: () => unknown)=>{callback=task;return 'tick';}, cancel: ()=>{} } };
    await subathon.start(context);
    expect(callback).toBeDefined(); expect(callback?.()).toBeUndefined();
    await subathon.stop(context);
  });
  it('formats long timers without wrapping days into a clock', () => {
    expect(formatRemaining(90_061)).toBe('25:01:01');
  });

  it('decrements only running state and stops cleanly at zero', () => {
    const state = sanitizeState({ initialized: true, remainingSeconds: 5, running: true, updatedAt: 1_000 });
    expect(applyElapsed(state, 4_000)).toMatchObject({ remainingSeconds: 2, running: true, updatedAt: 4_000 });
    expect(applyElapsed(state, 10_000)).toMatchObject({ remainingSeconds: 0, running: false, lastReason: 'expired' });
  });

  it('awards bounded event quantities and ignores raids below the creator threshold', () => {
    const state = sanitizeState({ thresholds: [] });
    expect(awardForEvent({ eventType: 'channel.follow', platform: 'twitch', payload: {} }, settings, state)).toMatchObject({ seconds: 30, reason: 'follow' });
    expect(awardForEvent({ eventType: 'channel.gift-subscription', platform: 'kick', payload: { quantity: 5 } }, settings, state)).toMatchObject({ seconds: 900 });
    expect(awardForEvent({ eventType: 'channel.raid', platform: 'twitch', payload: { quantity: 1 } }, settings, state)).toMatchObject({ seconds: 0 });
    expect(awardForEvent({ eventType: 'channel.raid', platform: 'twitch', payload: { quantity: 10 } }, settings, state)).toMatchObject({ seconds: 350, reason: 'raid' });
  });

  it('adds TikTok-like time only when a new full threshold is crossed', () => {
    const state = sanitizeState({ thresholds: [{ key: 'tiktok:likes', buckets: 1 }] });
    expect(awardForEvent({ eventType: 'engagement.milestone', platform: 'tiktok', payload: { metric: 'likes', value: 199 } }, settings, state)).toMatchObject({ seconds: 0 });
    expect(awardForEvent({ eventType: 'engagement.milestone', platform: 'tiktok', payload: { metric: 'likes', value: 305 } }, settings, state)).toMatchObject({ seconds: 90, thresholdBuckets: 3 });
  });

  it('publishes the running timer every second but checkpoints private state every 30 seconds', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-08T20:00:00.000Z'));
    let state: TimerState = { initialized: true, remainingSeconds: 120, maximumSeconds: 120, running: true, updatedAt: Date.now(), livePlatforms: ['twitch'] };
    const writes: TimerState[] = []; const published: Array<Record<string, unknown>> = [];
    const context = { settings: { enabled: true, showOverlay: true }, state: { read: async () => state, write: async (value: TimerState) => { state = value; writes.push(value); } }, overlay: { publish: async (_topic: string, payload: Record<string, unknown>) => { published.push(payload); } }, schedule: { after: (delay: number, task: () => unknown) => String(setTimeout(task, delay)), cancel: (id: string) => clearTimeout(Number(id)) } };
    await subathon.start(context as unknown as TimerContext);
    const writesAfterStart = writes.length; const publishedAfterStart = published.length;
    await vi.advanceTimersByTimeAsync(29_000);
    expect(writes.length).toBe(writesAfterStart);
    expect(published.length - publishedAfterStart).toBe(29);
    expect(published.at(-1)).toMatchObject({ remainingSeconds: 91 });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(writes.length).toBe(writesAfterStart + 1); expect(state).toMatchObject({ remainingSeconds: 90, running: true });
    expect(applyElapsed(state, Date.now() + 10_000)).toMatchObject({ remainingSeconds: 80 });
    await vi.advanceTimersByTimeAsync(90_000);
    expect(state).toMatchObject({ remainingSeconds: 0, running: false, lastReason: 'expired' });
    await subathon.stop(context as unknown as TimerContext);
  });
});
describe('Subathon Timer Control Deck', () => {
  it('shows the timer and changes it through the same controls as Streamer.bot', async () => {
    let state: TimerState = { initialized: true, remainingSeconds: 600, running: false, updatedAt: Date.now(), livePlatforms: [] };
    const published: Array<Record<string, unknown>> = [];
    const context = { settings: { enabled: true, showOverlay: true, startingMinutes: 60, maximumMinutes: 120 }, state: { read: async () => state, write: async (value: TimerState) => { state = value; } }, overlay: { publish: async (_topic: string, payload: Record<string, unknown>) => { published.push(payload); } }, schedule: { after: () => 'tick', cancel: () => {} } };
    await subathon.start(context as unknown as TimerContext);
    const view = await subathon.controlDeck({ operation: 'view' }, context as unknown as TimerContext);
    expect(view).toMatchObject({ title: 'Subathon Timer', status: '00:10:00 left · paused' });
    expect(view.sections[0]?.actions?.map((action) => action.operation)).toEqual(['resume', 'reset']);
    expect(view.sections[0]?.actions?.[1]?.confirm).toContain('Reset the timer');
    expect(view.sections[1]?.actions?.map((action) => action.label)).toEqual(['+1 min', '+5 min', '+15 min']);
    const added = await subathon.controlDeck({ operation: 'add-time', args: { minutes: 5 } }, context as unknown as TimerContext);
    expect(added.message).toBe('Added 5 minutes.');
    expect(state).toMatchObject({ remainingSeconds: 900, lastReason: 'manual-add-time', lastAwardSeconds: 300 });
    expect(published.at(-1)).toMatchObject({ remainingSeconds: 900 });
    await subathon.controlDeck({ operation: 'change-time', args: { direction: 'remove', minutes: 20 } }, context as unknown as TimerContext);
    expect(state).toMatchObject({ remainingSeconds: 0, running: false, lastReason: 'manual-remove-time' });
    await expect(subathon.controlDeck({ operation: 'resume' }, context as unknown as TimerContext)).rejects.toThrow('no time left');
    await subathon.controlDeck({ operation: 'change-time', args: { direction: 'add', minutes: 500 } }, context as unknown as TimerContext);
    expect(state).toMatchObject({ remainingSeconds: 7_200 });
    const resumed = await subathon.controlDeck({ operation: 'resume' }, context as unknown as TimerContext);
    expect(resumed.status).toBe('02:00:00 left · running');
    await subathon.controlDeck({ operation: 'pause' }, context as unknown as TimerContext);
    expect(state).toMatchObject({ running: false });
    await subathon.controlDeck({ operation: 'reset' }, context as unknown as TimerContext);
    expect(state).toMatchObject({ remainingSeconds: 3_600, running: false, lastReason: 'manual-reset' });
    await expect(subathon.controlDeck({ operation: 'add-time', args: { minutes: -3 } }, context as unknown as TimerContext)).rejects.toThrow('whole number of minutes');
    await expect(subathon.controlDeck({ operation: 'self-destruct' }, context as unknown as TimerContext)).rejects.toThrow('does not know that control');
    await subathon.stop(context as unknown as TimerContext);
  });
});
afterEach(() => { vi.useRealTimers(); });
