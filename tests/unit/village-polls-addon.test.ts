import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import villagePolls from '../../addons/village-polls/dist/index.js';

function event(command: string, args: string[] = [], moderator = false, platform = 'twitch', userId?: string) {
  return { schemaVersion: '1.0.0', eventId: `${platform}-${command}-${args.join('-')}`, eventType: 'command.received', platform, receivedAt: new Date().toISOString(), user: { id: userId ?? (moderator ? 'mod-id' : 'viewer-id'), name: moderator ? 'Mod' : 'Viewer', displayName: moderator ? 'Mod' : 'Viewer', actorType: 'human', roles: moderator ? ['moderator'] : [] }, payload: { command, arguments: args }, metadata: { simulated: false } };
}

function chat(message: string, moderator = false, platform = 'twitch', userId?: string, receivedAt = new Date().toISOString()) {
  return { schemaVersion: '1.0.0', eventId: `${platform}-chat-${message}`, eventType: 'chat.message', platform, receivedAt, user: { id: userId ?? (moderator ? 'mod-id' : 'viewer-id'), name: moderator ? 'Mod' : 'Viewer', displayName: moderator ? 'Mod' : 'Viewer', actorType: 'human', roles: moderator ? ['moderator'] : [] }, payload: { message }, metadata: { simulated: false } };
}

describe('Village Polls', () => {
  it('runs one cross-platform poll while leaving counters and giveaways to their dedicated add-ons', async () => {
    let state: Record<string, unknown> = {};
    const context: { settings: Record<string, unknown>; state: { read: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> }; chat: { send: ReturnType<typeof vi.fn> }; overlay: { publish: ReturnType<typeof vi.fn> } } = { settings: { enabled: true }, state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) }, chat: { send: vi.fn(async () => []) }, overlay: { publish: vi.fn(async () => {}) } };
    await villagePolls.start(context);
    await villagePolls.onEvent(event('counter', ['wins', '+1'], true), context);
    await villagePolls.onEvent(event('giveaway', ['open'], true), context);
    await villagePolls.onEvent(event('enter'), context);
    await villagePolls.onEvent(event('poll', ['open', 'Best?', '|', 'One', '|', 'Two'], true), context);
    await villagePolls.onEvent(event('vote', ['1']), context);
    await villagePolls.onEvent(event('poll', ['close'], true), context);
    expect(state).toMatchObject({ poll: { open: false } });
    expect(state).not.toHaveProperty('counters');
    expect(state).not.toHaveProperty('giveawayOpen');
    expect(context.overlay.publish).toHaveBeenCalledTimes(1);
    expect(context.overlay.publish).toHaveBeenCalledWith('thsv.village-polls.result.show', expect.objectContaining({ title: 'Best?' }));
    expect(JSON.stringify(state)).not.toContain('viewer-id');
    await villagePolls.stop();
  });

  it('rejects non-moderator poll controls and does not publish an empty result', async () => {
    let state: Record<string, unknown> = {};
    const send = vi.fn(async (request: { message: string }) => { void request; return []; });
    const context = { settings: { enabled: true }, state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) }, chat: { send }, overlay: { publish: vi.fn(async () => {}) } };
    await villagePolls.start(context);
    await villagePolls.onEvent(event('poll', ['open', 'Question', '|', 'Yes', '|', 'No']), context);
    await villagePolls.onEvent(event('poll', ['close'], true), context);
    expect(send.mock.calls.map((call) => call[0].message)).toEqual(expect.arrayContaining([expect.stringContaining('Only a moderator'), 'No poll is configured.']));
    expect(context.overlay.publish).not.toHaveBeenCalled();
    await villagePolls.stop();
  });

  it('ignores simulated commands, disables colliding poll commands, and closes only after every platform is offline', async () => {
    let state: Record<string, unknown> = { poll: { open: true, question: 'Still live?', options: ['Yes', 'No'], votes: {} } };
    const context: { settings: Record<string, unknown>; state: { read: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> }; chat: { send: ReturnType<typeof vi.fn> }; overlay: { publish: ReturnType<typeof vi.fn> } } = { settings: { enabled: true }, state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) }, chat: { send: vi.fn(async () => []) }, overlay: { publish: vi.fn(async () => {}) } };
    await villagePolls.start(context);
    await villagePolls.onEvent({ eventType: 'stream.online', platform: 'twitch', metadata: { simulated: false } }, context);
    await villagePolls.onEvent({ eventType: 'stream.online', platform: 'youtube', metadata: { simulated: false } }, context);
    await villagePolls.onEvent({ ...event('vote', ['1']), metadata: { simulated: true } }, context);
    expect((state.poll as { votes: Record<string, number> }).votes).toEqual({});
    await villagePolls.onEvent({ eventType: 'stream.offline', platform: 'twitch', metadata: { simulated: false } }, context);
    expect((state.poll as { open: boolean }).open).toBe(true);
    await villagePolls.onEvent({ eventType: 'stream.offline', platform: 'youtube', metadata: { simulated: false } }, context);
    expect((state.poll as { open: boolean }).open).toBe(false);
    expect(context.overlay.publish).toHaveBeenCalledWith('thsv.village-polls.result.show', expect.objectContaining({ title: 'Still live?' }));
    context.settings = { enabled: true, pollCommand: 'same', voteCommand: 'same' };
    await villagePolls.onEvent(event('same', ['1']), context);
    expect((state.poll as { votes: Record<string, number> }).votes).toEqual({});
    await villagePolls.stop();
  });

  it('caps a poll at 5,000 unique voters', async () => {
    const votes = Object.fromEntries(Array.from({ length: 5_000 }, (_item, index) => [index.toString(16).padStart(64, '0'), 0]));
    let state: Record<string, unknown> = { accountSalt: 'a'.repeat(48), poll: { open: true, question: 'Pick?', options: ['One', 'Two'], votes } };
    const send = vi.fn(async (request: { message: string }) => { void request; return []; });
    const context = { settings: { enabled: true }, state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) }, chat: { send }, overlay: { publish: vi.fn(async () => {}) } };
    await villagePolls.start(context);
    await villagePolls.onEvent(event('vote', ['2']), context);
    expect(Object.keys((state.poll as { votes: Record<string, number> }).votes)).toHaveLength(5_000);
    expect(send.mock.calls.at(-1)?.[0].message).toBe('This poll has reached its voter limit.');
    await villagePolls.stop();
  });

  it('announces one universal poll and combines votes from every supported platform', async () => {
    let state: Record<string, unknown> = {};
    const send = vi.fn(async (request: { message: string; routing: string; selectedPlatforms?: string[] }) => request.selectedPlatforms?.map((platform) => ({ platform, accepted: true })) ?? []);
    const context = { settings: { enabled: true }, state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) }, chat: { send }, overlay: { publish: vi.fn(async () => {}) } };
    await villagePolls.start(context);
    await villagePolls.onEvent(event('poll', ['open', 'Best snack?', '|', 'Fruit', '|', 'Chips'], true), context);
    await villagePolls.onEvent(event('vote', ['1'], false, 'twitch', 'twitch-viewer'), context);
    await villagePolls.onEvent(event('vote', ['2'], false, 'youtube', 'youtube-viewer'), context);
    await villagePolls.onEvent(event('vote', ['1'], false, 'kick', 'kick-viewer'), context);
    await villagePolls.onEvent(event('vote', ['2'], false, 'tiktok', 'tiktok-viewer'), context);
    await villagePolls.onEvent(event('poll', ['close'], true), context);
    expect(Object.keys((state.poll as { votes: Record<string, number> }).votes)).toHaveLength(4);
    const announcements = send.mock.calls.map((call) => call[0]).filter((request) => request.routing === 'selected');
    expect(announcements).toHaveLength(2);
    expect(announcements[0]?.selectedPlatforms).toEqual(['twitch', 'youtube', 'kick', 'tiktok']);
    expect(announcements[1]?.message).toContain('Fruit: 2');
    expect(announcements[1]?.message).toContain('Chips: 2');
    await villagePolls.stop();
  });

  it('reads commands directly from normalized chat, supports a custom prefix, and suppresses a derived duplicate', async () => {
    let state: Record<string, unknown> = {};
    const send = vi.fn(async (request: { routing: string; selectedPlatforms?: string[]; sourcePlatform?: string }) => request.routing === 'selected'
      ? request.selectedPlatforms?.map((platform) => ({ platform, accepted: true, parts: 1 })) ?? []
      : [{ platform: request.sourcePlatform ?? 'twitch', accepted: true, parts: 1 }]);
    const context = { settings: { enabled: true, commandPrefix: '?' }, state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) }, chat: { send }, overlay: { publish: vi.fn(async () => {}) } };
    const receivedAt = '2026-08-02T20:00:00.000Z';
    await villagePolls.start(context);
    await villagePolls.onEvent(chat('?poll open Best color? | Blue | Green', true, 'twitch', 'mod-id', receivedAt), context);
    await villagePolls.onEvent(chat('?vote 2', false, 'kick', 'kick-viewer', receivedAt), context);
    await villagePolls.onEvent({ ...event('vote', ['2'], false, 'kick', 'kick-viewer'), receivedAt, payload: { command: 'vote', arguments: ['2'], rawInput: '?vote 2' } }, context);
    expect(Object.keys((state.poll as { votes: Record<string, number> }).votes)).toHaveLength(1);
    expect(send.mock.calls.filter((call) => call[0].routing === 'source')).toHaveLength(1);
    await villagePolls.onEvent(chat('?poll close', true, 'twitch', 'mod-id', '2026-08-02T20:00:01.000Z'), context);
    expect(context.overlay.publish).toHaveBeenCalledWith('thsv.village-polls.result.show', expect.objectContaining({ title: 'Best color?' }));
    await villagePolls.stop();
  });

  it('surfaces a complete source-chat delivery failure instead of silently doing nothing', async () => {
    let state: Record<string, unknown> = { accountSalt: 'a'.repeat(48), poll: { open: true, question: 'Pick?', options: ['One', 'Two'], votes: {} } };
    const context = { settings: { enabled: true }, state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) }, chat: { send: vi.fn(async () => [{ platform: 'twitch', accepted: false, parts: 0, error: 'Streamer.bot action unavailable' }]) }, overlay: { publish: vi.fn(async () => {}) } };
    await villagePolls.start(context);
    await expect(villagePolls.onEvent(chat('!vote 1'), context)).rejects.toThrow('Streamer.bot action unavailable');
    await villagePolls.stop();
  });
});
