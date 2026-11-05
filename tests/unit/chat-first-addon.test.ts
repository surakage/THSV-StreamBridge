import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import chatFirst, { bump, cardView, learnOwnAccounts, manifest, settingsFor, skipped, stateFor } from '../../addons/chat-first/dist/index.js';
import { addOnOverlayPreviewTopic, buildAddOnOverlayPreview } from '../../bridge/services/http-server.js';

interface Entry { platform: string; name: string; count: number; avatarUrl: string }
interface View { visible: boolean; entries: Entry[]; latest: string; layout: string; hideAfterMs: number; shownAt: number }

function runtime(settings: Record<string, unknown> = {}, saved: Record<string, unknown> = {}) {
  let state: Record<string, unknown> = saved;
  const context = {
    settings: { enabled: true, ...settings },
    state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) },
    chat: { send: vi.fn(async () => []) },
    overlay: { publish: vi.fn(async () => undefined) },
  };
  return { context, state: () => state as { firsts: Record<string, { name: string; count: number }>; counts: Array<[string, number]> } };
}

let sequence = 0;
function chat(platform: string, user: string, extra: { roles?: string[]; actorType?: string; simulated?: boolean; avatarUrl?: string } = {}) {
  sequence += 1;
  return {
    eventId: `chat-${String(sequence)}`, eventType: 'chat.message', platform,
    user: { id: `${user.toLowerCase()}-id`, name: user.toLowerCase(), displayName: user, roles: extra.roles ?? [], actorType: extra.actorType ?? 'human', ...(extra.avatarUrl ? { avatarUrl: extra.avatarUrl } : {}) },
    payload: { message: 'hi' }, metadata: { simulated: extra.simulated ?? false },
  };
}
const online = (simulated = false) => ({ eventId: `online-${String(++sequence)}`, eventType: 'stream.online', platform: 'twitch', payload: {}, metadata: { simulated } });
const lastView = (test: ReturnType<typeof runtime>) => test.context.overlay.publish.mock.calls.at(-1) as unknown as [string, View, unknown];

describe('Chat First extension', () => {
  afterEach(async () => { await chatFirst.stop(); vi.useRealTimers(); });

  it('gives the first real chatter on each platform a spot, once per stream', async () => {
    const test = runtime();
    await chatFirst.start(test.context);
    await chatFirst.onEvent(chat('twitch', 'Sloth', { avatarUrl: 'https://static-cdn.jtvnw.net/sloth.png' }), test.context);
    await chatFirst.onEvent(chat('twitch', 'Otter'), test.context);
    await chatFirst.onEvent(chat('kick', 'Otter'), test.context);
    const [topic, view, options] = lastView(test);
    expect(topic).toBe('thsv.chat-first.firsts.update');
    expect(options).toEqual({ lane: 'persistent' });
    expect(view.latest).toBe('kick');
    expect(view.entries.map((entry) => [entry.platform, entry.name, entry.count])).toEqual([['twitch', 'Sloth', 1], ['kick', 'Otter', 1]]);
    expect(view.entries[0]?.avatarUrl).toBe('https://static-cdn.jtvnw.net/sloth.png');
    expect(test.context.chat.send).toHaveBeenCalledTimes(2);
    expect(test.context.chat.send).toHaveBeenNthCalledWith(1, { message: '🥇 Sloth is first in chat on Twitch! First 1 time so far.', routing: 'source', sourcePlatform: 'twitch', overflow: 'truncate' });
  });

  it('skips the creator\'s own accounts and bot accounts on every platform, even when chat does not mark them', async () => {
    const settings = settingsFor({ settings: {} });
    expect(skipped(chat('twitch', 'Sery_Bot'), settings)).toBe(true);
    expect(skipped(chat('youtube', 'suraruisuh_bot'), settings)).toBe(true);
    expect(skipped(chat('twitch', 'Abbott'), settings)).toBe(false);
    const marked = { ...chat('youtube', 'Helper'), payload: { message: 'hi', fromConnectedAccount: true } };
    expect(skipped(marked, settings)).toBe(true);
    const state = stateFor({});
    const kick = { ...chat('kick', 'Viewer'), channel: { id: 'k1', name: 'suraruisuh' } };
    const tiktok = { ...chat('tiktok', 'Viewer'), channel: { name: 'surakageohara' }, payload: { message: 'hi', connectedAccountNames: ['MyHelperAccount'] } };
    expect(learnOwnAccounts(kick, state)).toBe(true);
    expect(learnOwnAccounts(tiktok, state)).toBe(true);
    expect(learnOwnAccounts(kick, state)).toBe(false);
    expect(skipped(chat('kick', 'suraruisuh'), settings, state)).toBe(true);
    expect(skipped(chat('tiktok', "Surakage O'Hara"), settings, state)).toBe(true);
    expect(skipped(chat('twitch', 'MyHelperAccount'), settings, state)).toBe(true);
    expect(skipped(chat('kick', 'Viewer'), settings, state)).toBe(false);
    expect(stateFor(JSON.parse(JSON.stringify(state)))).toMatchObject({ ownNames: ['suraruisuh', 'surakageohara', 'myhelperaccount'] });
  });

  it('skips bots, the streamer, simulated chat, listed names, moderators when asked, and unticked platforms', async () => {
    const settings = settingsFor({ settings: { skipModerators: true, skipNames: 'Nightbot, @StreamElements' } });
    expect(skipped(chat('twitch', 'Helper', { actorType: 'bot' }), settings)).toBe(true);
    expect(skipped(chat('twitch', 'Owner', { roles: ['broadcaster'] }), settings)).toBe(true);
    expect(skipped(chat('twitch', 'Mod', { roles: ['moderator'] }), settings)).toBe(true);
    expect(skipped(chat('twitch', 'StreamElements'), settings)).toBe(true);
    expect(skipped(chat('twitch', 'Viewer'), settings)).toBe(false);
    const test = runtime({ platforms: ['twitch'], skipNames: 'Nightbot' });
    await chatFirst.start(test.context);
    test.context.overlay.publish.mockClear();
    for (const event of [chat('twitch', 'Nightbot'), chat('twitch', 'Owner', { roles: ['broadcaster'] }), chat('twitch', 'Test', { simulated: true }), chat('youtube', 'Viewer')]) await chatFirst.onEvent(event, test.context);
    expect(test.context.overlay.publish).not.toHaveBeenCalled();
    await chatFirst.onEvent(chat('twitch', 'Mod', { roles: ['moderator'] }), test.context);
    expect(lastView(test)[1].entries.map((entry) => entry.name)).toEqual(['Mod']);
  });

  it('resets on stream start and after the quiet hours, and counts times first across streams', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-04T12:00:00Z') });
    const test = runtime({ resetHours: 2, message: '{name} first on {platform}: {count} / {times}' });
    await chatFirst.start(test.context);
    await chatFirst.onEvent(chat('twitch', 'Sloth'), test.context);
    await chatFirst.onEvent(online(true), test.context);
    await chatFirst.onEvent(chat('twitch', 'Otter'), test.context);
    expect(test.state().firsts['twitch']?.name).toBe('Sloth');

    vi.setSystemTime(Date.now() + 3_600_000);
    await chatFirst.onEvent(online(), test.context);
    await chatFirst.onEvent(chat('twitch', 'Sloth'), test.context);
    expect(test.state().firsts['twitch']).toMatchObject({ name: 'Sloth', count: 2 });

    // Going live on a second platform soon after does not wipe this stream's firsts.
    await chatFirst.onEvent(online(), test.context);
    expect(test.state().firsts['twitch']?.name).toBe('Sloth');

    vi.setSystemTime(Date.now() + 3 * 3_600_000);
    await chatFirst.onEvent(chat('twitch', 'Sloth'), test.context);
    expect(test.state().firsts['twitch']).toMatchObject({ name: 'Sloth', count: 3 });
    expect(test.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'Sloth first on Twitch: 3 / 3 times' }));
    expect(lastView(test)[1].entries[0]).toMatchObject({ count: 3 });
  });

  it('keeps the all-time count list bounded to the most recent 5,000 viewers', () => {
    const state = stateFor({ counts: Array.from({ length: 5_000 }, (_, index) => [`twitch:id:${String(index)}`, 1]) });
    expect(bump(state, 'twitch:id:0')).toBe(2);
    expect(bump(state, 'kick:id:new')).toBe(1);
    expect(state.counts).toHaveLength(5_000);
    expect(state.counts.at(-1)).toEqual(['kick:id:new', 1]);
    expect(state.counts.some((pair: [string, number]) => pair[0] === 'twitch:id:1')).toBe(false);
    expect(stateFor({ counts: [['a', 0], ['b', 2], 'junk'], firsts: { twitch: { key: 'twitch:id:1', name: 'Sloth', avatarUrl: 'http://bad', count: 2 }, myspace: { key: 'x', name: 'y' } } })).toMatchObject({
      counts: [['b', 2]], firsts: { twitch: { name: 'Sloth', avatarUrl: '', count: 2 } },
    });
  });

  it('shows the card for a few seconds in timed mode and does not bring back an old card on start', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-04T12:00:00Z') });
    const test = runtime({ displayMode: 'timed', showSeconds: 10, layout: 'podium' });
    await chatFirst.start(test.context);
    await chatFirst.onEvent(chat('youtube', 'Sloth'), test.context);
    expect(lastView(test)[1]).toMatchObject({ layout: 'podium', hideAfterMs: 10_000, shownAt: Date.now(), visible: true });
    await chatFirst.stop();
    vi.setSystemTime(Date.now() + 20_000);
    await chatFirst.start(test.context);
    expect(lastView(test)[0]).toBe('thsv.chat-first.firsts.hide');
    expect(cardView(settingsFor(test.context), stateFor(test.state())).entries).toHaveLength(1);
  });

  it('turns off chat messages and hides the card when switched off', async () => {
    const quiet = runtime({ chatMessage: false });
    await chatFirst.start(quiet.context);
    await chatFirst.onEvent(chat('tiktok', 'Sloth'), quiet.context);
    expect(quiet.context.chat.send).not.toHaveBeenCalled();
    await chatFirst.stop();
    const off = runtime({ enabled: false });
    await chatFirst.start(off.context);
    expect(off.context.overlay.publish).toHaveBeenCalledWith('thsv.chat-first.firsts.hide', {}, { lane: 'persistent' });
  });

  it('resets from the Control Panel and builds a wizard preview from the ticked platforms', async () => {
    const test = runtime();
    await chatFirst.start(test.context);
    await chatFirst.onEvent(chat('twitch', 'Sloth'), test.context);
    const status = await chatFirst.controlPanel({ operation: 'status' }, test.context);
    expect(status.summary[0]).toEqual({ label: 'Twitch', value: 'Sloth (1 time)' });
    await chatFirst.controlPanel({ operation: 'action', action: 'reset' }, test.context);
    expect(test.state().firsts).toEqual({});
    expect(addOnOverlayPreviewTopic('thsv.chat-first')).toBe('thsv.chat-first.firsts.update');
    expect(buildAddOnOverlayPreview({ moduleId: 'thsv.chat-first', name: 'Chat First', settings: { platforms: ['kick', 'youtube'], layout: 'column' } })).toMatchObject({
      cardKind: 'chat-first', layout: 'column', templatePreview: true, entries: [{ platform: 'kick', name: 'Leaf Runner', count: 7 }, { platform: 'youtube', name: 'Canopy Friend', count: 1 }],
    });
  });

  it('ships a package manifest that matches the runtime manifest', async () => {
    const descriptor = JSON.parse(await readFile('addons/chat-first/module-package.json', 'utf8')) as { manifest: unknown; permissions: string[] };
    expect(descriptor.manifest).toEqual(manifest);
    expect(descriptor.permissions).toEqual(['events.subscribe', 'state.private', 'chat.send', 'overlay.publish']);
  });
});
