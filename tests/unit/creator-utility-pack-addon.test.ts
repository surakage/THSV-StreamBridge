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
    const context = { settings: { enabled: true }, state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) }, chat: { send: vi.fn(async () => []) }, overlay: { publish: vi.fn(async () => {}) } };
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
});
