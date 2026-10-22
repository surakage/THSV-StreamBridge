import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import punishments, { SET_FILTER_ACTION_ID, SWITCH_SCENE_ACTION_ID, manifest as runtimeManifest, parseEffect, parseExercise, settingsFor } from '../../addons/streamer-punishments/dist/index.js';

const SET_FILTER = SET_FILTER_ACTION_ID as string;
const SWITCH_SCENE = SWITCH_SCENE_ACTION_ID as string;
const EFFECTS = ['Blackout | Elgato | THSV Blackout | 15 | 100 | twitch-blackout'];
const ROLES: Record<string, string> = { '🔴 Starting Soon': 'starting', '🔴 Gameplay': 'live', '🔴 Just Chatting': 'chatting', '🔴 Be Right Back': 'break' };

function plainJson(value: unknown): boolean {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(plainJson);
  return typeof value === 'object' && Object.values(value as Record<string, unknown>).every(plainJson);
}

function runtime(settings: Record<string, unknown> = {}, points = 1_000) {
  const timers: Array<{ delay: number; callback: () => unknown; cancelled: boolean }> = [];
  let saved: unknown;
  const context = {
    settings: { enabled: true, effects: EFFECTS, ...settings },
    chat: { send: vi.fn(async () => []) },
    streamerbot: { runApprovedAction: vi.fn(async () => ({})) },
    overlay: { publish: vi.fn(async () => undefined) },
    // Like StreamBridge, reject state that is not plain JSON (for example a field set to undefined).
    state: { read: vi.fn(async () => saved), write: vi.fn(async (value: unknown) => { if (!plainJson(value)) throw new Error('Private add-on state must be a JSON object containing bounded JSON values.'); saved = JSON.parse(JSON.stringify(value)); }) },
    scenes: { resolve: (value: string) => (value === 'role:chatting' ? '🔴 Just Chatting' : value), roleOf: (name: string) => ROLES[name] },
    viewerFoundation: {
      getProjection: vi.fn(async () => ({ viewerId: 'vf-1', points, currencyName: 'Sloth Coins' })),
      mutate: vi.fn(async () => ({})),
    },
    schedule: {
      after: vi.fn((delay: number, callback: () => unknown) => { const timer = { delay, callback, cancelled: false }; timers.push(timer); return timer; }),
      cancel: vi.fn((timer: { cancelled: boolean }) => { timer.cancelled = true; }),
    },
  };
  const fire = async () => { const timer = timers.filter((entry) => !entry.cancelled).pop(); if (!timer) throw new Error('no timer'); timer.cancelled = true; await timer.callback(); };
  return { context, timers, fire, state: () => saved as { active?: { startsAt: number }; owed: unknown[]; monthReps: Record<string, number> } };
}

let sequence = 0;
function event(eventType: string, payload: Record<string, unknown> = {}, options: { platform?: string; roles?: string[] } = {}) {
  sequence += 1;
  return {
    schemaVersion: '1.0.0', eventId: `event-${String(sequence)}`, eventType, platform: options.platform ?? 'youtube', receivedAt: new Date().toISOString(),
    source: { adapter: 'test', eventId: `source-${String(sequence)}` }, channel: { name: 'channel' },
    user: { id: 'viewer-1', name: 'viewer', displayName: 'Viewer One', actorType: 'human', roles: options.roles ?? [] },
    payload, metadata: { simulated: false },
  };
}
const buy = (name: string, platform = 'youtube') => event('command.received', { command: 'buy', arguments: [name] }, { platform });
const mod = (commandName: string, args: string[] = []) => event('command.received', { command: commandName, arguments: args }, { roles: ['moderator'] });
const scene = (sceneName: string) => event('stream.scene-changed', { sceneName }, { platform: 'twitch' });
async function start(test: ReturnType<typeof runtime>, sceneName = '🔴 Gameplay') {
  await punishments.stop(test.context); await punishments.start(test.context);
  await punishments.onEvent(event('stream.online', {}, { platform: 'youtube' }), test.context);
  await punishments.onEvent(scene(sceneName), test.context);
}
const actionCalls = (test: ReturnType<typeof runtime>) => test.context.streamerbot.runApprovedAction.mock.calls as unknown as Array<[string, Record<string, string>]>;

afterEach(() => { vi.useRealTimers(); });

describe('Streamer Punishments extension', () => {
  it('ships three effects and three exercises with the agreed defaults and parses each row format', () => {
    const settings = settingsFor({ settings: {} });
    expect(settings.enabled).toBe(false);
    expect(settings.items.map((item: { name: string }) => item.name)).toEqual(['Blackout', 'Pixelate', 'Barrel roll', 'Pushups', 'Situps', 'Squats']);
    expect(settings.items.filter((item: { kind: string }) => item.kind === 'exercise').map((item: { reps: number }) => item.reps)).toEqual([10, 15, 15]);
    expect(settings).toMatchObject({ graceSeconds: 30, maximumPerStream: 5, exerciseCooldownMinutes: 10, safeSceneName: 'role:chatting' });
    expect([...settings.buyPlatforms]).toEqual(['youtube', 'tiktok', 'facebook']);
    expect(parseEffect('Blackout | Elgato | THSV Blackout | 15 | 100 | tw-1, kick-1')).toEqual({ kind: 'effect', name: 'Blackout', sourceName: 'Elgato', filterName: 'THSV Blackout', seconds: 15, cost: 100, rewardIds: ['tw-1', 'kick-1'] });
    expect(parseExercise('Pushups | 10 | 250 |')).toEqual({ kind: 'exercise', name: 'Pushups', reps: 10, cost: 250, rewardIds: [] });
    // Twitch and Kick reward IDs have separate boxes.
    expect(parseEffect('Blackout | Elgato | THSV Blackout | 15 | 100 | tw-1 | kick-1')?.rewardIds).toEqual(['tw-1', 'kick-1']);
    expect(parseExercise('Pushups | 10 | 250 | tw-2 | kick-2')?.rewardIds).toEqual(['tw-2', 'kick-2']);
    expect(parseExercise('Pushups | 10 | 250 | | kick-only')?.rewardIds).toEqual(['kick-only']);
    expect(parseExercise(' | 10')).toBeUndefined();
  });

  it('charges points, turns the filter on, and turns it off when the seconds are up', async () => {
    const test = runtime();
    await start(test);
    await punishments.onEvent(buy('blackout'), test.context);
    expect(test.context.viewerFoundation.mutate).toHaveBeenCalledWith(expect.objectContaining({ viewerId: 'vf-1', operation: 'spend', amount: 100 }));
    expect(actionCalls(test).at(-1)).toEqual([SET_FILTER, { punishmentSourceName: 'Elgato', punishmentFilterName: 'THSV Blackout', punishmentFilterEnabled: 'true', punishmentConnectionIndex: '0' }]);
    expect(test.timers.at(-1)?.delay).toBe(15_000);
    await test.fire();
    expect(actionCalls(test).at(-1)?.[1]).toMatchObject({ punishmentFilterName: 'THSV Blackout', punishmentFilterEnabled: 'false' });
  });

  it('refunds points when Streamer.bot refuses the effect and rejects viewers without enough points', async () => {
    const test = runtime();
    await start(test);
    test.context.streamerbot.runApprovedAction.mockRejectedValueOnce(new Error('not approved'));
    await punishments.onEvent(buy('blackout'), test.context);
    expect(test.context.viewerFoundation.mutate).toHaveBeenLastCalledWith(expect.objectContaining({ operation: 'refund', amount: 100 }));
    const poor = runtime({}, 20);
    await start(poor);
    await punishments.onEvent(buy('blackout'), poor.context);
    expect(poor.context.viewerFoundation.mutate).not.toHaveBeenCalled();
    expect(poor.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'Viewer One, Blackout costs 100 Sloth Coins. You have 20.' }));
  });

  it('runs an exercise: grace countdown, safe scene, done by a mod, back to the previous scene, monthly total', async () => {
    const test = runtime();
    await start(test);
    await punishments.onEvent(buy('pushups'), test.context);
    expect(test.context.viewerFoundation.mutate).toHaveBeenCalledWith(expect.objectContaining({ operation: 'spend', amount: 250 }));
    expect(test.context.overlay.publish).toHaveBeenLastCalledWith('thsv.streamer-punishments.timer.update', expect.objectContaining({ label: '10 PUSHUPS IN', remainingSeconds: 30 }), { lane: 'timer' });
    expect(test.timers.at(-1)?.delay).toBe(30_000);
    Object.assign(test.state().active ?? {}, { startsAt: 0 });
    await test.fire();
    expect(actionCalls(test).at(-1)).toEqual([SWITCH_SCENE, { punishmentSceneName: '🔴 Just Chatting', punishmentConnectionIndex: '0' }]);
    await punishments.onEvent(scene('🔴 Just Chatting'), test.context);
    // Viewers cannot mark it done.
    await punishments.onEvent(event('command.received', { command: 'done' }), test.context);
    expect(test.state().active).toBeDefined();
    await punishments.onEvent(mod('done', ['pushups']), test.context);
    expect(actionCalls(test).at(-1)).toEqual([SWITCH_SCENE, { punishmentSceneName: '🔴 Gameplay', punishmentConnectionIndex: '0' }]);
    expect(test.state().active).toBeUndefined();
    expect(test.state().monthReps).toEqual({ pushups: 10 });
    await punishments.onEvent(event('command.received', { command: 'punishments' }), test.context);
    expect(test.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'Pushups: 10 this month | Situps: 0 this month | Squats: 0 this month' }));
  });

  it('enforces the per-stream limit and cooldown for points, but always accepts paid channel point rewards', async () => {
    const test = runtime({ exercises: ['Pushups | 10 | 250 | tw-push'], maximumPerStream: 1, exerciseCooldownMinutes: 0 });
    await start(test);
    await punishments.onEvent(buy('pushup'), test.context);
    await punishments.onEvent(buy('pushups'), test.context);
    expect(test.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'Viewer One, Pushups is maxed out for this stream (1). Try another punishment.' }));
    await punishments.onEvent(event('reward.redemption', { rewardId: 'tw-push', verifiedTransport: true }, { platform: 'twitch' }), test.context);
    expect(test.state().owed).toHaveLength(1);
    expect(test.context.viewerFoundation.mutate).toHaveBeenCalledTimes(1);
    const cooling = runtime({ exerciseCooldownMinutes: 10 });
    await start(cooling);
    await punishments.onEvent(buy('squats'), cooling.context);
    await punishments.onEvent(buy('squats'), cooling.context);
    expect(cooling.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'Viewer One, Squats is cooling down. Try again in 10 min.' }));
  });

  it('enforces the exercise limit and cooldowns on Kick rewards, which have none of their own', async () => {
    const test = runtime({ effects: ['Blackout | Elgato | THSV Blackout | 15 | 100 | tw-black | kick-black'], exercises: ['Pushups | 10 | 250 | tw-push | kick-push'], maximumPerStream: 1, exerciseCooldownMinutes: 0 });
    await start(test);
    const kick = (rewardId: string) => event('reward.redemption', { rewardId, verifiedTransport: true }, { platform: 'kick' });
    await punishments.onEvent(kick('kick-push'), test.context);
    await punishments.onEvent(kick('kick-push'), test.context);
    expect(test.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'Viewer One, Pushups is maxed out for this stream (1). Try another punishment. A mod can refund your Kick points.' }));
    await punishments.onEvent(event('reward.redemption', { rewardId: 'tw-push', verifiedTransport: true }, { platform: 'twitch' }), test.context);
    expect((test.state() as unknown as { streamBought: Record<string, number> }).streamBought).toEqual({ pushups: 2 });
    expect(test.context.viewerFoundation.mutate).not.toHaveBeenCalled();
    await punishments.onEvent(kick('kick-black'), test.context);
    const filterCalls = () => actionCalls(test).filter(([id, args]) => id === SET_FILTER && String(args['punishmentFilterEnabled']) === 'true').length;
    expect(filterCalls()).toBe(1);
    await punishments.onEvent(kick('kick-black'), test.context);
    expect(test.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'Viewer One, Blackout is cooling down. Try again in 1 min. A mod can refund your Kick points.' }));
    expect(filterCalls()).toBe(1);
    // Twitch enforces its own cooldown, so this redemption queues behind the running effect without a reply.
    const replies = test.context.chat.send.mock.calls.length;
    await punishments.onEvent(event('reward.redemption', { rewardId: 'tw-black', verifiedTransport: true }, { platform: 'twitch' }), test.context);
    expect(test.context.chat.send.mock.calls.length).toBe(replies);
  });

  it('shares one exercise limit across every exercise and platform, says what is left, and refuses at the limit', async () => {
    const test = runtime({ exercises: ['Pushups | 10 | 250 | tw-push | kick-push', 'Situps | 15 | 200 |'], exerciseLimitPerStream: 3, exerciseCooldownMinutes: 0 });
    await start(test);
    const messages = () => test.context.chat.send.mock.calls.map((call) => (call as unknown as [{ message: string; sourcePlatform: string }])[0]);
    const reward = (rewardId: string, platform: string) => event('reward.redemption', { rewardId, verifiedTransport: true }, { platform });
    await punishments.onEvent(buy('pushups'), test.context);
    expect(messages().at(-1)).toMatchObject({ message: '2 of 3 exercises left this stream.', sourcePlatform: 'youtube' });
    await punishments.onEvent(reward('tw-push', 'twitch'), test.context);
    expect(messages().at(-1)).toMatchObject({ message: '1 of 3 exercises left this stream.', sourcePlatform: 'twitch' });
    await punishments.onEvent(reward('kick-push', 'kick'), test.context);
    expect(messages().at(-1)).toMatchObject({ message: '0 of 3 exercises left this stream.', sourcePlatform: 'kick' });
    expect((test.state() as unknown as { streamExercises: number }).streamExercises).toBe(3);
    const spends = test.context.viewerFoundation.mutate.mock.calls.length;
    // At the limit: !buy spends nothing, and channel point redemptions point to a mod for the refund.
    await punishments.onEvent(event('stream.online', {}, { platform: 'tiktok' }), test.context);
    await punishments.onEvent(buy('situps', 'tiktok'), test.context);
    expect(messages().at(-1)).toMatchObject({ message: 'No exercises left this stream (3 of 3 used).', sourcePlatform: 'tiktok' });
    expect(test.context.viewerFoundation.mutate.mock.calls.length).toBe(spends);
    await punishments.onEvent(reward('tw-push', 'twitch'), test.context);
    expect(messages().at(-1)).toMatchObject({ message: 'No exercises left this stream (3 of 3 used). A mod can refund your channel points.', sourcePlatform: 'twitch' });
    await punishments.onEvent(reward('kick-push', 'kick'), test.context);
    expect(messages().at(-1)).toMatchObject({ message: 'No exercises left this stream (3 of 3 used). A mod can refund your Kick points.', sourcePlatform: 'kick' });
    expect(test.state().owed.length + (test.state().active ? 1 : 0)).toBe(3);
    expect(plainJson(test.state())).toBe(true);
    // A new stream (after the 30-minute same-stream window) starts the count again.
    for (const platform of ['youtube', 'twitch', 'kick', 'tiktok']) await punishments.onEvent(event('stream.offline', {}, { platform }), test.context);
    (test.state() as unknown as { lastOfflineAt: number }).lastOfflineAt = 1;
    await punishments.onEvent(event('stream.online', {}, { platform: 'youtube' }), test.context);
    expect((test.state() as unknown as { streamExercises: number }).streamExercises).toBe(0);
    await punishments.onEvent(buy('situps'), test.context);
    expect(messages().at(-1)).toMatchObject({ message: '2 of 3 exercises left this stream.' });
  });

  it('keeps the per-exercise limit alongside the shared limit, and 0 turns the shared limit off', async () => {
    expect(settingsFor({ settings: {} })).toMatchObject({ exerciseLimitPerStream: 5, exercisesLeftMessage: '{remaining} of {limit} exercises left this stream.' });
    const test = runtime({ maximumPerStream: 1, exerciseLimitPerStream: 5, exerciseCooldownMinutes: 0 });
    await start(test);
    await punishments.onEvent(buy('pushups'), test.context);
    await punishments.onEvent(buy('pushups'), test.context);
    expect(test.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'Viewer One, Pushups is maxed out for this stream (1). Try another punishment.' }));
    await punishments.onEvent(buy('squats'), test.context);
    expect(test.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: '3 of 5 exercises left this stream.' }));
    const unlimited = runtime({ exerciseLimitPerStream: 0, exerciseCooldownMinutes: 0 });
    await start(unlimited);
    for (let index = 0; index < 7; index += 1) await punishments.onEvent(buy(['pushups', 'situps', 'squats'][index % 3] ?? 'pushups'), unlimited.context);
    expect(unlimited.state().owed.length + (unlimited.state().active ? 1 : 0)).toBe(7);
    expect(unlimited.context.chat.send.mock.calls.some((call) => (call as unknown as [{ message: string }])[0].message.includes('exercises left'))).toBe(false);
  });

  it('holds exercises during Starting Soon and breaks, and keeps owed exercises when the stream ends', async () => {
    const test = runtime();
    await start(test, '🔴 Starting Soon');
    await punishments.onEvent(buy('situps'), test.context);
    expect(test.state().active).toBeUndefined();
    expect(test.state().owed).toHaveLength(1);
    await punishments.onEvent(scene('🔴 Gameplay'), test.context);
    expect(test.state().active).toMatchObject({ name: 'Situps', phase: 'grace' });
    await punishments.onEvent(event('stream.offline', {}, { platform: 'youtube' }), test.context);
    expect(test.state().active).toBeUndefined();
    expect(test.state().owed).toEqual([expect.objectContaining({ name: 'Situps', reps: 15 })]);
  });

  it('spins the Bean Boozled wheel for bits and tips, reveals nice or nasty, and puts the bean on the owed list', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const test = runtime({ beanEnabled: true });
    await start(test);
    const spins = () => test.context.overlay.publish.mock.calls.filter((call) => (call as unknown[])[0] === 'thsv.streamer-punishments.wheel.spin');
    // 1,500 bits is three spins (500 each), the most one cheer can give.
    await punishments.onEvent(event('engagement.cheer', { quantity: 1500 }, { platform: 'twitch' }), test.context);
    await test.fire();
    expect(spins()).toHaveLength(1);
    const wheel = (spins()[0] as unknown[])[1] as { options: string[]; winnerIndex: number; winner: string; style: { wheelColors: string[] } };
    expect(wheel.options).toHaveLength(10);
    expect(wheel).toMatchObject({ winnerIndex: 1, winner: 'Yellow spotted' });
    expect(wheel.style.wheelColors[0]).toBe('#1c1c1c');
    expect(test.context.overlay.publish).toHaveBeenLastCalledWith('thsv.streamer-punishments.card.show', expect.objectContaining({ title: 'NASTY!', text: 'Yellow spotted: Wet Dog' }), { lane: 'foreground' });
    await test.fire();
    expect(test.context.chat.send).toHaveBeenCalledWith(expect.objectContaining({ message: 'Viewer One spun the Bean Boozled wheel and landed on Yellow spotted... it is NASTY: Wet Dog!' }));
    expect(test.state().active).toMatchObject({ kind: 'bean', flavor: 'Wet Dog', phase: 'grace' });
    expect(test.context.overlay.publish).toHaveBeenLastCalledWith('thsv.streamer-punishments.timer.update', expect.objectContaining({ label: 'BEAN BOOZLED IN', contextText: 'Wet Dog from Viewer One' }), { lane: 'timer' });
    for (let index = 0; index < 4; index += 1) await test.fire();
    expect(spins()).toHaveLength(3);
    expect(test.state().owed).toHaveLength(2);
    await punishments.onEvent(mod('done'), test.context);
    expect(test.state().monthReps).toEqual({ beans: 1 });
    expect(test.context.chat.send).toHaveBeenCalledWith(expect.objectContaining({ message: 'Wet Dog bean eaten! Beans this month: 1.' }));

    // Tips: $12 in the right currency is two spins; other currencies and unverified tips do not spin.
    const tips = runtime({ beanEnabled: true });
    await start(tips);
    const tipSpins = () => tips.context.overlay.publish.mock.calls.filter((call) => (call as unknown[])[0] === 'thsv.streamer-punishments.wheel.spin').length;
    await punishments.onEvent(event('engagement.donation', { amount: '20.00', currency: 'EUR' }, { platform: 'twitch' }), tips.context);
    await punishments.onEvent({ ...event('engagement.donation', { amount: '20.00', currency: 'USD' }, { platform: 'twitch' }), metadata: { simulated: false, unverifiedFields: ['source.eventId'] } }, tips.context);
    expect(tips.timers).toHaveLength(0);
    await punishments.onEvent(event('engagement.donation', { amount: '12.00', currency: 'USD' }, { platform: 'twitch' }), tips.context);
    for (let index = 0; index < 4; index += 1) await tips.fire();
    expect(tipSpins()).toBe(2);
    random.mockRestore();
  });

  it('spins the wheel for TikTok gifts, adding up small gifts from the same viewer', async () => {
    const test = runtime({ beanEnabled: true });
    await start(test);
    const spinCount = () => test.context.overlay.publish.mock.calls.filter((call) => (call as unknown[])[0] === 'thsv.streamer-punishments.wheel.spin').length;
    // 300 coins is not a spin yet; another 300 from the same viewer makes one, with 100 left over.
    await punishments.onEvent(event('engagement.gift', { itemName: 'Gift', quantity: 1, coins: 300 }, { platform: 'tiktok' }), test.context);
    expect(test.timers).toHaveLength(0);
    await punishments.onEvent(event('engagement.gift', { itemName: 'Gift', quantity: 1, coins: 300 }, { platform: 'tiktok' }), test.context);
    await test.fire();
    expect(spinCount()).toBe(1);
    // Gifts outside TikTok and gifts without a coin value never spin.
    const other = runtime({ beanEnabled: true });
    await start(other);
    await punishments.onEvent(event('engagement.gift', { itemName: 'Gift', quantity: 1, coins: 5000 }, { platform: 'twitch' }), other.context);
    await punishments.onEvent(event('engagement.gift', { itemName: 'Rose', quantity: 1 }, { platform: 'tiktok' }), other.context);
    expect(other.timers).toHaveLength(0);
    const off = runtime({ beanEnabled: true, beanCoinsPerSpin: 0 });
    await start(off);
    await punishments.onEvent(event('engagement.gift', { itemName: 'Gift', quantity: 1, coins: 5000 }, { platform: 'tiktok' }), off.context);
    expect(off.timers).toHaveLength(0);
  });

  it('keeps the tracker panel up to date with what is owed and this month\'s totals', async () => {
    const test = runtime({ beanEnabled: true, trackerPosition: 'top-right' });
    await start(test);
    const trackers = () => test.context.overlay.publish.mock.calls.filter((call) => (call as unknown[])[0] === 'thsv.streamer-punishments.tracker.update').map((call) => (call as unknown[])[1] as { visible: boolean; position: string; rows: Array<{ name: string; owed: number; month: number }>; now: string });
    // Hidden until something is owed.
    expect(trackers().at(-1)).toMatchObject({ visible: false, position: 'top-right', now: '' });
    expect(trackers().at(-1)?.rows.map((row) => row.name)).toEqual(['Pushups', 'Situps', 'Squats', 'Beans']);
    await punishments.onEvent(mod('punish', ['bean']), test.context);
    await test.fire(); await test.fire();
    expect(trackers().at(-1)).toMatchObject({ visible: true });
    expect(trackers().at(-1)?.rows.at(-1)).toMatchObject({ name: 'Beans', owed: 1, month: 0 });
    const always = runtime({ trackerOnlyWhileOwed: false });
    await start(always);
    expect(always.context.overlay.publish).toHaveBeenLastCalledWith('thsv.streamer-punishments.tracker.update', expect.objectContaining({ visible: true }), { lane: 'persistent' });
    const off = runtime({ trackerEnabled: false });
    await start(off);
    expect(off.context.overlay.publish).toHaveBeenLastCalledWith('thsv.streamer-punishments.tracker.update', expect.objectContaining({ visible: false }), { lane: 'persistent' });
  });

  it('keeps the wheel off until it is enabled and lets a moderator spin a test bean', async () => {
    const off = runtime();
    await start(off);
    await punishments.onEvent(event('engagement.cheer', { quantity: 5000 }, { platform: 'twitch' }), off.context);
    expect(off.timers).toHaveLength(0);
    const test = runtime({ beanEnabled: true });
    await start(test);
    await punishments.onEvent(mod('punish', ['bean']), test.context);
    await test.fire();
    expect(test.context.overlay.publish.mock.calls.some((call) => (call as unknown[])[0] === 'thsv.streamer-punishments.wheel.spin')).toBe(true);
  });

  it('only sells punishments on the allowed scenes, before any points are spent', async () => {
    const test = runtime({ allowedScenes: ['🔴 Just Chatting'], exercises: ['Pushups | 10 | 250 | | kick-push'] });
    await start(test);
    await punishments.onEvent(buy('pushups'), test.context);
    expect(test.context.viewerFoundation.mutate).not.toHaveBeenCalled();
    expect(test.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'Viewer One, punishments only work during 🔴 Just Chatting.' }));
    await punishments.onEvent(event('reward.redemption', { rewardId: 'kick-push', verifiedTransport: true }, { platform: 'kick' }), test.context);
    expect(test.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ sourcePlatform: 'kick', message: 'Viewer One, punishments only work during 🔴 Just Chatting. A mod can refund your Kick points.' }));
    await punishments.onEvent(scene('🔴 Just Chatting'), test.context);
    await punishments.onEvent(buy('pushups'), test.context);
    expect(test.context.viewerFoundation.mutate).toHaveBeenCalledWith(expect.objectContaining({ operation: 'spend', amount: 250 }));
  });

  it('resets monthly totals at the first stream in a new month and keeps the old month in history', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 30, 20));
    const test = runtime({ exerciseCooldownMinutes: 0 });
    await start(test);
    await punishments.onEvent(buy('squats'), test.context);
    Object.assign(test.state().active ?? {}, { startsAt: 0 });
    await test.fire();
    await punishments.onEvent(mod('done'), test.context);
    expect(test.state()).toMatchObject({ month: '2026-10', monthReps: { squats: 15 } });
    await punishments.onEvent(event('stream.offline', {}, { platform: 'youtube' }), test.context);
    vi.setSystemTime(new Date(2026, 10, 3, 20));
    await punishments.onEvent(event('stream.online', {}, { platform: 'youtube' }), test.context);
    expect(test.state()).toMatchObject({ month: '2026-11', monthReps: {}, history: [{ month: '2026-10', reps: { squats: 15 } }] });
  });

  it('lists punishments for an unknown name and ignores viewers while offline', async () => {
    const test = runtime();
    await punishments.stop(test.context); await punishments.start(test.context);
    await punishments.onEvent(buy('blackout'), test.context);
    expect(test.context.streamerbot.runApprovedAction).not.toHaveBeenCalled();
    await punishments.onEvent(buy('pizza'), test.context);
    expect(test.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'Punishments: Blackout 100, Pushups 250, Situps 200, Squats 200. Use !buy <name>.' }));
  });
});

describe('Streamer Punishments package files', () => {
  it('ships triggerless Set Filter and Switch Scene broker actions matching the runtime', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/streamer-punishments/manifest.json', 'utf8')) as { actions: Array<{ id: string; name: string; importFile: string }> };
    expect(manifest.actions.map((action) => action.id)).toEqual([SET_FILTER, SWITCH_SCENE]);
    expect(manifest.actions.every((action) => action.name.startsWith('THSV Extension - Streamer Punishments - '))).toBe(true);
    const decoded = Buffer.from((await readFile(`packages/streamerbot/streamer-punishments/${manifest.actions[0]?.importFile ?? ''}`, 'utf8')).trim(), 'base64');
    expect(decoded.subarray(0, 4).toString('ascii')).toBe('SBAE');
    const exported = JSON.parse(gunzipSync(decoded.subarray(4)).toString('utf8')) as { data: { actions: Array<{ triggers: unknown[] }> } };
    expect(exported.data.actions.map((action) => action.triggers)).toEqual([[], []]);
    expect(await readFile('packages/streamerbot/streamer-punishments/src/SetFilter.cs', 'utf8')).toContain('"SetSourceFilterEnabled"');
    expect(await readFile('packages/streamerbot/streamer-punishments/src/SwitchScene.cs', 'utf8')).toContain('CPH.ObsSetScene(scene, connection)');
  });

  it('keeps the descriptor manifest identical to the runtime manifest', async () => {
    const descriptor = JSON.parse(await readFile('addons/streamer-punishments/module-package.json', 'utf8')) as { manifest: unknown };
    expect(descriptor.manifest).toEqual(JSON.parse(JSON.stringify(runtimeManifest)));
  });
});
