import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import rewardTimers, { findTimer, formatDuration, manifest, parseCommand, parseTimer, settingsFor, stateFor } from '../../addons/reward-timers/dist/index.js';
import { addOnOverlayPreviewTopic, buildAddOnOverlayPreview } from '../../bridge/services/http-server.js';

const TIMERS = ['on | Streamer muted | 5 | minutes | Mute the streamer', 'on | No swearing | 10 | minutes | No Swearing!', 'off | Hat on | 30 | seconds | Hat time'];

function runtime(settings: Record<string, unknown> = {}, saved: Record<string, unknown> = {}) {
  let state: Record<string, unknown> = saved;
  const context = {
    settings: { enabled: true, timers: TIMERS, ...settings },
    state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) },
    chat: { send: vi.fn(async () => []) },
    overlay: { publish: vi.fn(async () => undefined) },
  };
  return { context, state: () => state as { timers: Array<{ label: string; endsAt: number; startedAt: number; viewer: string; avatarUrl: string; platform: string }> } };
}

let sequence = 0;
function redeem(title: string, extra: { platform?: string; simulated?: boolean; verified?: boolean; avatarUrl?: string; name?: string } = {}) {
  sequence += 1;
  return {
    eventId: `reward-${String(sequence)}`, eventType: 'reward.redemption', platform: extra.platform ?? 'twitch',
    user: { id: 'viewer-1', name: 'sloth', displayName: extra.name ?? 'Sloth', roles: [], avatarUrl: extra.avatarUrl ?? 'https://static-cdn.jtvnw.net/sloth.png' },
    payload: { rewardId: 'abc', rewardTitle: title, redemptionId: `r-${String(sequence)}`, verifiedTransport: extra.verified ?? true },
    metadata: { simulated: extra.simulated ?? false },
  };
}
function command(args: string[], roles: string[] = ['moderator'], platform = 'twitch') {
  sequence += 1;
  return { eventId: `command-${String(sequence)}`, eventType: 'command.received', platform, user: { id: 'mod-1', name: 'mod', displayName: 'Mod', roles }, payload: { command: 'timer', arguments: args }, metadata: { simulated: false } };
}
const lastView = (test: ReturnType<typeof runtime>) => test.context.overlay.publish.mock.calls.at(-1) as unknown as [string, { timers?: Array<{ label: string; endsAt: number; startedAt: number; avatarUrl: string }> }, unknown];

describe('Reward Timers extension', () => {
  afterEach(async () => { await rewardTimers.stop(); vi.useRealTimers(); });

  it('matches a reward by its ID first, so renaming the reward never breaks the timer', () => {
    const settings = settingsFor({ settings: { enabled: true, timers: ['on | Streamer muted | 5 | minutes | Mute the streamer | twitch-id-1 | kick-id-1', 'on | No swearing | 10 | minutes | No Swearing!'] } });
    const event = (platform: string, rewardId: string, rewardTitle: string) => ({ platform, payload: { rewardId, rewardTitle } });
    expect(findTimer(settings, event('twitch', 'twitch-id-1', 'Shush the Sloth (5 min)'))?.label).toBe('Streamer muted');
    expect(findTimer(settings, event('kick', 'kick-id-1', 'Renamed on Kick'))?.label).toBe('Streamer muted');
    // A timer with an ID for this platform no longer matches by title, so an unrelated reward reusing the name cannot start it.
    expect(findTimer(settings, event('twitch', 'other-id', 'Mute the streamer'))).toBeUndefined();
    // Timers without an ID still match by title.
    expect(findTimer(settings, event('twitch', 'any', 'no swearing!'))?.label).toBe('No swearing');
    expect(findTimer(settings, event('kick', 'twitch-id-1', 'nothing'))).toBeUndefined();
  });

  it('reads timer rows with bounds and ships two example timers with no reward title', () => {
    expect(parseTimer('on | Streamer muted | 5 | minutes | Mute the streamer')).toEqual({ enabled: true, label: 'Streamer muted', key: 'streamer muted', seconds: 300, rewardTitle: 'Mute the streamer', twitchRewardId: '', kickRewardId: '' });
    expect(parseTimer('on | Streamer muted | 5 | minutes | Mute the streamer | e93fe2f3-eded-4ee3-8797-f59834be2b68 | 01KICKREWARD')).toMatchObject({ twitchRewardId: 'e93fe2f3-eded-4ee3-8797-f59834be2b68', kickRewardId: '01KICKREWARD' });
    expect(parseTimer('off | Quick | 1 | seconds |')).toMatchObject({ enabled: false, seconds: 5 });
    expect(parseTimer('on | Forever | 9999 | minutes |')).toMatchObject({ seconds: 180 * 60 });
    expect(parseTimer('on |  | 5 | minutes |')).toBeUndefined();
    const defaults = settingsFor({ settings: {} });
    expect(defaults.timers.map((timer: { label: string; seconds: number; rewardTitle: string }) => [timer.label, timer.seconds, timer.rewardTitle])).toEqual([['Streamer muted', 300, ''], ['No swearing', 600, '']]);
    expect(defaults).toMatchObject({ enabled: false, repeatMode: 'add', command: 'timer', position: 'top-right', maxOnScreen: 4 });
    expect(formatDuration(300_000)).toBe('5:00');
    expect(formatDuration(44_100)).toBe('0:45');
    expect(formatDuration(3_723_000)).toBe('1:02:03');
  });

  it('starts a timer from a reward title (any capitals), with the viewer picture and end time on the overlay', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-04T12:00:00Z') });
    const test = runtime();
    await rewardTimers.start(test.context);
    await rewardTimers.onEvent(redeem('mute THE streamer'), test.context);
    const [topic, view, options] = lastView(test);
    expect(topic).toBe('thsv.reward-timers.timers.update');
    expect(options).toEqual({ lane: 'persistent' });
    expect(view.timers).toEqual([expect.objectContaining({ label: 'Streamer muted', startedAt: Date.now(), endsAt: Date.now() + 300_000, avatarUrl: 'https://static-cdn.jtvnw.net/sloth.png' })]);
    expect(test.state().timers[0]).toMatchObject({ label: 'Streamer muted', endsAt: Date.now() + 300_000, platform: 'twitch' });
    expect(test.context.chat.send).toHaveBeenCalledWith({ message: '⏳ Sloth started Streamer muted for 5:00!', routing: 'source', sourcePlatform: 'twitch', overflow: 'truncate' });
  });

  it('ignores simulated, unverified, unknown and switched-off rewards, and plain http pictures', async () => {
    const test = runtime();
    await rewardTimers.start(test.context);
    test.context.overlay.publish.mockClear();
    for (const event of [redeem('Mute the streamer', { simulated: true }), redeem('Mute the streamer', { verified: false }), redeem('Something else'), redeem('Hat time')]) await rewardTimers.onEvent(event, test.context);
    expect(test.context.overlay.publish).not.toHaveBeenCalled();
    await rewardTimers.onEvent(redeem('No Swearing!', { avatarUrl: 'http://example.com/a.png' }), test.context);
    expect(lastView(test)[1].timers?.[0]).toMatchObject({ label: 'No swearing', avatarUrl: '' });
  });

  it('adds time when a running timer is redeemed again, or restarts it when set to restart', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-04T12:00:00Z') });
    const added = runtime();
    await rewardTimers.start(added.context);
    const start = Date.now();
    await rewardTimers.onEvent(redeem('Mute the streamer'), added.context);
    vi.setSystemTime(start + 60_000);
    await rewardTimers.onEvent(redeem('Mute the streamer', { name: 'Otter' }), added.context);
    expect(added.state().timers).toEqual([expect.objectContaining({ startedAt: start, endsAt: start + 600_000, viewer: 'Otter' })]);
    await rewardTimers.stop();

    vi.setSystemTime(start);
    const restarted = runtime({ repeatMode: 'restart' });
    await rewardTimers.start(restarted.context);
    await rewardTimers.onEvent(redeem('Mute the streamer'), restarted.context);
    vi.setSystemTime(start + 60_000);
    await rewardTimers.onEvent(redeem('Mute the streamer'), restarted.context);
    expect(restarted.state().timers).toEqual([expect.objectContaining({ startedAt: start + 60_000, endsAt: start + 360_000 })]);
  });

  it('ends a timer on time, hides the panel and posts the end message in the chat it came from', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-04T12:00:00Z') });
    const test = runtime({ timers: ['on | Hat on | 30 | seconds | Hat time'] });
    await rewardTimers.start(test.context);
    await rewardTimers.onEvent(redeem('Hat time', { platform: 'kick' }), test.context);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(test.state().timers).toEqual([]);
    expect(lastView(test)[0]).toBe('thsv.reward-timers.timers.hide');
    expect(test.context.chat.send).toHaveBeenLastCalledWith({ message: '⏰ Hat on is over!', routing: 'source', sourcePlatform: 'kick', overflow: 'truncate' });
  });

  it('keeps running timers across a restart and drops ones that ended meanwhile', async () => {
    const now = Date.now();
    const test = runtime({}, { timers: [
      { label: 'Streamer muted', startedAt: now - 60_000, endsAt: now + 240_000, viewer: 'Sloth', avatarUrl: 'https://a.example/p.png', platform: 'twitch' },
      { label: 'No swearing', startedAt: now - 700_000, endsAt: now - 100_000, viewer: 'Otter', avatarUrl: '', platform: 'kick' },
    ] });
    await rewardTimers.start(test.context);
    expect(test.state().timers.map((timer) => timer.label)).toEqual(['Streamer muted']);
    expect(lastView(test)).toEqual(['thsv.reward-timers.timers.update', expect.objectContaining({ visible: true, timers: [expect.objectContaining({ label: 'Streamer muted', endsAt: now + 240_000 })] }), { lane: 'persistent' }]);
    expect(stateFor({ timers: [{ label: 'Old', endsAt: now - 1 }, 'junk'] }, now)).toEqual({ timers: [] });
  });

  it('lets moderators start, stop and clear timers with the chat command, and ignores everyone else', async () => {
    expect(parseCommand(['Streamer', 'muted', 'START'])).toEqual({ action: 'start', label: 'Streamer muted' });
    expect(parseCommand(['clear'])).toEqual({ action: 'clear', label: '' });
    expect(parseCommand(['muted'])).toBeUndefined();
    const test = runtime();
    await rewardTimers.start(test.context);
    await rewardTimers.onEvent(command(['Streamer', 'muted', 'start'], []), test.context);
    expect(test.state().timers).toEqual([]);
    await rewardTimers.onEvent(command(['Streamer', 'muted', 'start']), test.context);
    await rewardTimers.onEvent(command(['no', 'swearing', 'start'], ['broadcaster']), test.context);
    expect(test.state().timers.map((timer) => timer.label)).toEqual(['Streamer muted', 'No swearing']);
    await rewardTimers.onEvent(command(['streamer', 'muted', 'stop']), test.context);
    expect(test.state().timers.map((timer) => timer.label)).toEqual(['No swearing']);
    expect(test.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'Streamer muted stopped.' }));
    await rewardTimers.onEvent(command(['clear']), test.context);
    expect(test.state().timers).toEqual([]);
    expect(lastView(test)[0]).toBe('thsv.reward-timers.timers.hide');
    await rewardTimers.onEvent(command(['Nope', 'start']), test.context);
    expect(test.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'No timer called Nope. Timers: Streamer muted, No swearing.' }));
  });

  it('runs Control Panel start, stop and clear buttons', async () => {
    const test = runtime();
    await rewardTimers.start(test.context);
    const started = await rewardTimers.controlPanel({ operation: 'action', action: 'start', values: { label: 'No swearing' } }, test.context);
    expect(started.message).toBe('No swearing: 10:00 left.');
    expect(started.lists[0].items.map((item: { title: string }) => item.title)).toEqual(['No swearing: 10:00 left']);
    expect(test.context.chat.send).not.toHaveBeenCalled();
    await rewardTimers.controlPanel({ operation: 'action', action: 'clear' }, test.context);
    expect(test.state().timers).toEqual([]);
  });

  it('hides the panel when switched off and builds a wizard preview with sample end times', async () => {
    const off = runtime({ enabled: false });
    await rewardTimers.start(off.context);
    expect(off.context.overlay.publish).toHaveBeenCalledWith('thsv.reward-timers.timers.hide', {}, { lane: 'persistent' });
    expect(addOnOverlayPreviewTopic('thsv.reward-timers')).toBe('thsv.reward-timers.timers.update');
    const preview = buildAddOnOverlayPreview({ moduleId: 'thsv.reward-timers', name: 'Reward Timers', settings: { timers: TIMERS, position: 'bottom-left', maxOnScreen: 2 } }) as { timers: Array<{ label: string; endsAt: number }> };
    expect(preview).toMatchObject({ cardKind: 'reward-timers', position: 'bottom-left', maxOnScreen: 2, templatePreview: true });
    expect(preview.timers.map((timer) => timer.label)).toEqual(['Streamer muted', 'No swearing']);
    expect(preview.timers[0]?.endsAt).toBeGreaterThan(Date.now());
  });

  it('ships a package manifest that matches the runtime manifest', async () => {
    const descriptor = JSON.parse(await readFile('addons/reward-timers/module-package.json', 'utf8')) as { manifest: unknown; permissions: string[] };
    expect(descriptor.manifest).toEqual(manifest);
    expect(descriptor.permissions).toEqual(['events.subscribe', 'state.private', 'chat.send', 'overlay.publish']);
  });
});
