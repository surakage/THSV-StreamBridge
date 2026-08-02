import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import creatorUtility from '../../addons/creator-utility-pack/dist/index.js';

function event(command: string, args: string[] = [], moderator = false) {
  return { schemaVersion: '1.0.0', eventId: `${command}-${args.join('-')}`, eventType: 'command.received', platform: 'twitch', receivedAt: new Date().toISOString(), user: { id: moderator ? 'mod-id' : 'viewer-id', name: moderator ? 'Mod' : 'Viewer', displayName: moderator ? 'Mod' : 'Viewer', actorType: 'human', roles: moderator ? ['moderator'] : [] }, payload: { command, arguments: args }, metadata: { simulated: false } };
}

describe('Creator Utility Pack', () => {
  it('keeps bounded counters and polls while leaving giveaways exclusively to Village Draw', async () => {
    let state: Record<string, unknown> = {};
    const context: { settings: Record<string, unknown>; state: { read: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> }; chat: { send: ReturnType<typeof vi.fn> }; overlay: { publish: ReturnType<typeof vi.fn> } } = { settings: { enabled: true }, state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) }, chat: { send: vi.fn(async () => []) }, overlay: { publish: vi.fn(async () => {}) } };
    await creatorUtility.start(context);
    await creatorUtility.onEvent(event('counter', ['wins', '+1'], true), context);
    await creatorUtility.onEvent(event('giveaway', ['open'], true), context);
    await creatorUtility.onEvent(event('enter'), context);
    await creatorUtility.onEvent(event('poll', ['open', 'Best?', '|', 'One', '|', 'Two'], true), context);
    await creatorUtility.onEvent(event('vote', ['1']), context);
    await creatorUtility.onEvent(event('poll', ['close'], true), context);
    expect(state).toMatchObject({ counters: { wins: 1 }, poll: { open: false } });
    expect(state).not.toHaveProperty('giveawayOpen');
    expect(context.overlay.publish).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(state)).not.toContain('viewer-id');
    await creatorUtility.stop();
  });

  it('rejects malformed counter operations and non-moderator poll controls', async () => {
    let state: Record<string, unknown> = {};
    const send = vi.fn(async (request: { message: string }) => { void request; return []; });
    const context = { settings: { enabled: true }, state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) }, chat: { send }, overlay: { publish: vi.fn(async () => {}) } };
    await creatorUtility.start(context);
    await creatorUtility.onEvent(event('counter', ['wins', 'erase'], true), context);
    await creatorUtility.onEvent(event('poll', ['open', 'Question', '|', 'Yes', '|', 'No']), context);
    expect(state).toMatchObject({ counters: {} });
    expect(send.mock.calls.map((call) => call[0].message)).toEqual(expect.arrayContaining([expect.stringContaining('Usage:'), expect.stringContaining('Only a moderator')]));
    await creatorUtility.stop();
  });

  it('ignores simulated commands, disables colliding commands, and closes only after every platform is offline', async () => {
    let state: Record<string, unknown> = { poll: { open: true, question: 'Still live?', options: ['Yes', 'No'], votes: {} } };
    const context: { settings: Record<string, unknown>; state: { read: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> }; chat: { send: ReturnType<typeof vi.fn> }; overlay: { publish: ReturnType<typeof vi.fn> } } = { settings: { enabled: true }, state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) }, chat: { send: vi.fn(async () => []) }, overlay: { publish: vi.fn(async () => {}) } };
    await creatorUtility.start(context);
    await creatorUtility.onEvent({ eventType: 'stream.online', platform: 'twitch', metadata: { simulated: false } }, context);
    await creatorUtility.onEvent({ eventType: 'stream.online', platform: 'youtube', metadata: { simulated: false } }, context);
    await creatorUtility.onEvent({ ...event('counter', ['wins', '+1'], true), metadata: { simulated: true } }, context);
    expect(state).not.toHaveProperty('counters.wins');
    await creatorUtility.onEvent({ eventType: 'stream.offline', platform: 'twitch', metadata: { simulated: false } }, context);
    expect((state.poll as { open: boolean }).open).toBe(true);
    await creatorUtility.onEvent({ eventType: 'stream.offline', platform: 'youtube', metadata: { simulated: false } }, context);
    expect((state.poll as { open: boolean }).open).toBe(false);
    context.settings = { enabled: true, counterCommand: 'same', pollCommand: 'same', voteCommand: 'vote' };
    await creatorUtility.onEvent(event('same', ['wins', '+1'], true), context);
    expect(state).not.toHaveProperty('counters.wins');
    await creatorUtility.stop();
  });
});
