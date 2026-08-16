import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import hydration, { dayKey, millisecondsUntilNextLocalDay, parseOunces, settingsFor } from '../../addons/village-hydration-station/dist/index.js';

function runtime(settings: Record<string, unknown> = {}, initialState: Record<string, unknown> = {}) {
  let state: Record<string, unknown> = initialState;
  const timers: Array<() => unknown> = [];
  const context = {
    settings: { enabled: true, ...settings },
    state: { read: vi.fn(async () => state), write: vi.fn(async (next: Record<string, unknown>) => { state = next; }) },
    overlay: { publish: vi.fn(async () => undefined) }, chat: { send: vi.fn(async () => []) },
    streamerbot: { runApprovedAction: vi.fn(async () => ({})) },
    schedule: { after: vi.fn((_delay: number, callback: () => void) => { timers.push(callback); return callback; }), cancel: vi.fn() },
  };
  return { context, state: () => state, timers };
}

function event(eventType: string, platform = 'twitch', payload: Record<string, unknown> = {}, roles: string[] = []) {
  return { schemaVersion: '1.0.0', eventId: `${eventType}-${String(Math.random())}`, eventType, platform, receivedAt: new Date().toISOString(), source: { adapter: 'test', eventId: 'source' }, channel: { name: 'channel' }, user: { id: 'viewer-1', name: 'viewer', displayName: 'Viewer One', actorType: 'human', roles }, payload, metadata: { simulated: false } };
}

describe('Village Hydration Station add-on', () => {
  it('parses numeral and spoken ounce amounts', () => {
    expect(parseOunces('8 oz')).toBe(8);
    expect(parseOunces('twenty four ounces')).toBe(24);
    expect(parseOunces('no amount', 6)).toBe(6);
  });

  it('defaults to daily reset and uses the computer local calendar day', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 8, 23, 59, 30));
    const yesterday = new Date(2026, 7, 7, 12, 0, 0);
    const test = runtime({}, { totalOunces: 32, dateKey: dayKey(yesterday), entries: [{ amount: 32, at: yesterday.getTime(), source: 'test' }] });
    expect(settingsFor(test.context).resetMode).toBe('daily');
    expect(dayKey()).toBe('2026-08-08');
    expect(millisecondsUntilNextLocalDay()).toBe(30_050);
    await hydration.start(test.context);
    expect(test.state()).toMatchObject({ totalOunces: 0, dateKey: '2026-08-08', entries: [] });
    expect(test.context.overlay.publish).toHaveBeenCalledWith('thsv.village-hydration-station.hydration.hide', expect.any(Object));
    await hydration.stop(test.context); vi.useRealTimers();
  });

  it('resets an active total when local midnight arrives without another event', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 8, 23, 59, 30));
    const today = new Date(2026, 7, 8, 12, 0, 0);
    const test = runtime({ resetMode: 'daily' }, { totalOunces: 24, dateKey: dayKey(today), entries: [{ amount: 24, at: today.getTime(), source: 'test' }] });
    await hydration.start(test.context);
    expect(test.state().totalOunces).toBe(24);
    vi.setSystemTime(new Date(2026, 7, 9, 0, 0, 0, 100));
    await test.timers[0]?.();
    expect(test.state()).toMatchObject({ totalOunces: 0, dateKey: '2026-08-09', entries: [] });
    await hydration.stop(test.context); vi.useRealTimers();
  });

  it('starts reminders only after a verified live signal and viewer reminders never add ounces', async () => {
    const test = runtime({ viewerCommandPlatforms: ['youtube'], viewerGlobalCooldownMinutes: 10 });
    await hydration.start(test.context);
    await hydration.onEvent(event('command.received', 'youtube', { command: 'hydrate', arguments: [] }), test.context);
    expect(test.state().totalOunces).toBe(0);
    await hydration.onEvent(event('stream.online', 'youtube'), test.context);
    expect(test.context.overlay.publish).toHaveBeenCalledTimes(1);
    await hydration.onEvent(event('command.received', 'youtube', { command: 'hydrate', arguments: [] }), test.context);
    expect(test.state()).toMatchObject({ totalOunces: 0, remindersThisStream: 1 });
    expect(test.context.overlay.publish).toHaveBeenLastCalledWith('thsv.village-hydration-station.hydration.update', expect.objectContaining({ totalOunces: 0, live: true, durationMs: expect.any(Number), notice: expect.objectContaining({ kind: 'viewer' }) }), { lane: 'foreground' });
    const publishCalls = test.context.overlay.publish.mock.calls as unknown as Array<[string, { durationMs?: number }]>;
    const update = publishCalls.at(-1)?.[1];
    expect(update?.durationMs).toBeGreaterThanOrEqual(11_900);
    expect(update?.durationMs).toBeLessThanOrEqual(12_000);
    await hydration.stop(test.context);
  });

  it('recovers missed live state from the exact verified native hydration reward only', async () => {
    const test = runtime({ twitchRewardId: 'hydrate-reward', viewerGlobalCooldownMinutes: 0, viewerCooldownMinutes: 0 });
    await hydration.start(test.context);
    await hydration.onEvent(event('reward.redemption', 'twitch', { rewardId: 'hydrate-reward', redemptionId: 'redeem-1', verifiedTransport: true }), test.context);
    expect(test.state()).toMatchObject({ totalOunces: 0, remindersThisStream: 1, sessionKey: expect.stringMatching(/^recovered:/u), nextReminderAt: expect.any(Number) });
    expect(test.context.overlay.publish).toHaveBeenLastCalledWith('thsv.village-hydration-station.hydration.update', expect.objectContaining({ live: true, livePlatforms: ['twitch'], notice: expect.objectContaining({ kind: 'viewer' }) }), { lane: 'foreground' });
    await hydration.stop(test.context);
  });

  it('does not let delayed rewards or scheduled reminders revive hydration after offline', async () => {
    const test = runtime({ twitchRewardId: 'hydrate-reward', speakerEnabled: true, voiceAlias: 'Hydration' });
    await hydration.start(test.context);
    await hydration.onEvent(event('stream.online', 'twitch'), test.context);
    const reminder = test.timers.at(-1);
    await hydration.onEvent(event('stream.offline', 'twitch'), test.context);
    expect(test.state()).toMatchObject({ nextReminderAt: 0, notice: { kind: '', expiresAt: 0 } });
    expect(test.context.overlay.publish).toHaveBeenLastCalledWith('thsv.village-hydration-station.hydration.hide', expect.any(Object));

    await reminder?.();
    await hydration.onEvent(event('reward.redemption', 'twitch', { rewardId: 'hydrate-reward', redemptionId: 'late-redemption', verifiedTransport: true }), test.context);

    expect(test.state()).toMatchObject({ nextReminderAt: 0, remindersThisStream: 0, notice: { kind: '' } });
    expect(test.context.streamerbot.runApprovedAction).not.toHaveBeenCalled();
    expect(test.context.overlay.publish).toHaveBeenCalledTimes(2);
    await hydration.stop(test.context);
  });

  it('allows only the broadcaster to log water and resets once when a new stream starts', async () => {
    const test = runtime({ goalOunces: 64, creatorCommand: 'water' });
    await hydration.start(test.context);
    await hydration.onEvent(event('command.received', 'twitch', { command: 'water', arguments: ['8'] }), test.context);
    expect(test.state().totalOunces).toBe(0);
    await hydration.onEvent(event('stream.online', 'twitch'), test.context);
    await hydration.onEvent(event('command.received', 'twitch', { command: 'water', arguments: ['log', '12'] }, ['broadcaster']), test.context);
    expect(test.state().totalOunces).toBe(12);
    expect(test.context.overlay.publish).toHaveBeenCalledTimes(1);
    await hydration.onEvent(event('stream.online', 'youtube'), test.context);
    expect(test.state().totalOunces).toBe(12);
    expect(test.context.overlay.publish).toHaveBeenCalledTimes(1);
    await hydration.stop(test.context);
  });

  it('ignores legacy microphone dictation events', async () => {
    const test = runtime({ goalOunces: 64 });
    await hydration.start(test.context);
    await hydration.onEvent(event('addon.thsv.village-hydration-station.voice', 'system', { wakeWord: 'water', amountText: 'eight', confidence: 0.68 }), test.context);
    expect(test.state()).toMatchObject({ totalOunces: 0, entries: [] });
    await hydration.stop(test.context);
  });
});
