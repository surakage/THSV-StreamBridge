import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import freeGameCheck from '../../addons/free-game-check/dist/index.js';

function results(id: string, requestId: string, url = `https://www.gamerpower.com/open/${id}/`) {
  return { schemaVersion: '1.0.0', eventId: `games-${id}`, eventType: 'addon.thsv.free-game-check.results', platform: 'system', receivedAt: new Date().toISOString(), payload: { requestId, games: [{ id, title: `Game ${id}`, url, platforms: 'PC' }] }, metadata: { simulated: false } };
}

describe('Free Game Check', () => {
  it('correlates scans, rejects foreign links, and announces only newly observed later games', async () => {
    let state: Record<string, unknown> = {}; let scheduled: (() => Promise<void> | void) | undefined;
    const runApprovedAction = vi.fn(async (actionId: string, argumentsValue: Record<string, unknown>) => { void actionId; void argumentsValue; });
    const context = {
      settings: { enabled: true, announceInitial: false, deliveryPlatforms: ['twitch'], refreshMinutes: 180 },
      state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) },
      schedule: { after: vi.fn((_delay: number, work: () => Promise<void> | void) => { scheduled = work; return 'task'; }), cancel: vi.fn() },
      streamerbot: { runApprovedAction }, chat: { send: vi.fn(async () => []) },
    };
    await freeGameCheck.start(context); expect(scheduled).toBeTypeOf('function'); await scheduled?.();
    let requestId = String(runApprovedAction.mock.calls.at(-1)?.[1].freeGameCheckRequestId);
    await freeGameCheck.onEvent(results('stale', 'wrong'), context);
    expect(state).toEqual({ initialized: false, seenIds: [], guideCooldowns: {}, lastRefreshAt: '', lastError: '' });
    await freeGameCheck.onEvent(results('one', requestId, 'https://evil.example/game'), context);
    expect(context.chat.send).not.toHaveBeenCalled();
    expect(state).toMatchObject({ initialized: false, lastError: expect.stringContaining('safe GamerPower links') });
    await scheduled?.(); requestId = String(runApprovedAction.mock.calls.at(-1)?.[1].freeGameCheckRequestId);
    await freeGameCheck.onEvent(results('baseline', requestId), context);
    expect(context.chat.send).not.toHaveBeenCalled();
    await scheduled?.(); requestId = String(runApprovedAction.mock.calls.at(-1)?.[1].freeGameCheckRequestId);
    await freeGameCheck.onEvent(results('two', requestId), context);
    expect(context.chat.send).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Powered by GamerPower.com'), selectedPlatforms: ['twitch'] }));
    expect(JSON.stringify(state)).not.toContain('Game two');
    await freeGameCheck.stop(context);
  });

  it('dispatches optional Discord delivery once and records only a correlated result', async () => {
    let state: Record<string, unknown> = {}; let scheduled: (() => Promise<void> | void) | undefined;
    const runApprovedAction = vi.fn(async (actionId: string, argumentsValue: Record<string, unknown>) => { void actionId; void argumentsValue; });
    const context = {
      settings: { enabled: true, announceInitial: true, deliveryPlatforms: [], discordEnabled: true, discordDestinationMode: 'forum', discordThreadId: '1234567890', refreshMinutes: 180 },
      state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) },
      schedule: { after: vi.fn((_delay: number, work: () => Promise<void> | void) => { scheduled = work; return 'task'; }), cancel: vi.fn() },
      streamerbot: { runApprovedAction }, chat: { send: vi.fn(async () => []) },
    };
    await freeGameCheck.start(context); await scheduled?.();
    const requestId = String(runApprovedAction.mock.calls[0]?.[1]?.freeGameCheckRequestId);
    await freeGameCheck.onEvent(results('discord', requestId), context);
    expect(runApprovedAction).toHaveBeenCalledTimes(2);
    expect(runApprovedAction.mock.calls[1]?.[0]).toBe('7e9b4db8-5d33-4ed2-a8d1-11f8d04ab662');
    const deliveryId = String(runApprovedAction.mock.calls[1]?.[1]?.freeGameDiscordDeliveryId);
    await freeGameCheck.onEvent({ schemaVersion: '1.0.0', eventId: 'wrong', eventType: 'addon.thsv.free-game-check.discord-result', platform: 'system', receivedAt: new Date().toISOString(), payload: { deliveryId: 'wrong', success: true }, metadata: { simulated: false } }, context);
    expect(state).not.toHaveProperty('lastDiscordDelivery');
    await freeGameCheck.onEvent({ schemaVersion: '1.0.0', eventId: 'right', eventType: 'addon.thsv.free-game-check.discord-result', platform: 'system', receivedAt: new Date().toISOString(), payload: { deliveryId, success: true, messageId: '987' }, metadata: { simulated: false } }, context);
    expect(state).toMatchObject({ lastDiscordDelivery: { success: true, messageId: '987' } });
    await freeGameCheck.stop(context);
  });

  it('routes Twitch and Kick rewards plus YouTube and TikTok commands back only to their source chat', async () => {
    let state: Record<string, unknown> = {};
    const context = {
      settings: {
        enabled: true, rewardId: 'twitch-free-games', kickRewardId: 'kick-free-games', commandName: 'freegames',
        discordInviteUrl: 'https://discord.gg/village', guideMessage: '{name}, view the free-game list here: {discord}', guideCooldownMinutes: 10,
      },
      state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) },
      schedule: { after: vi.fn(() => 'task'), cancel: vi.fn() },
      streamerbot: { runApprovedAction: vi.fn(async () => {}) }, chat: { send: vi.fn(async (request: Record<string, unknown>) => { void request; return []; }) },
    };
    await freeGameCheck.start(context);
    const base = { schemaVersion: '1.0.0', receivedAt: new Date().toISOString(), metadata: { simulated: false }, user: { id: 'viewer-1', name: 'viewer', displayName: 'Village Viewer' } };
    await freeGameCheck.onEvent({ ...base, eventId: 'twitch-claim', eventType: 'reward.redemption', platform: 'twitch', payload: { rewardId: 'twitch-free-games', verifiedTransport: true } }, context);
    await freeGameCheck.onEvent({ ...base, eventId: 'kick-claim', eventType: 'reward.redemption', platform: 'kick', user: { ...base.user, id: 'viewer-2' }, payload: { rewardId: 'kick-free-games', verifiedTransport: true } }, context);
    await freeGameCheck.onEvent({ ...base, eventId: 'youtube-command', eventType: 'chat.message', platform: 'youtube', user: { ...base.user, id: 'viewer-3' }, payload: { message: '!freegames' } }, context);
    await freeGameCheck.onEvent({ ...base, eventId: 'tiktok-command', eventType: 'chat.message', platform: 'tiktok', user: { ...base.user, id: 'viewer-4' }, payload: { message: '!freegames please' } }, context);
    expect(context.chat.send.mock.calls.map(([request]) => request)).toEqual([
      expect.objectContaining({ routing: 'source', sourcePlatform: 'twitch', message: expect.stringContaining('https://discord.gg/village') }),
      expect.objectContaining({ routing: 'source', sourcePlatform: 'kick' }),
      expect.objectContaining({ routing: 'source', sourcePlatform: 'youtube' }),
      expect.objectContaining({ routing: 'source', sourcePlatform: 'tiktok' }),
    ]);
    await freeGameCheck.stop(context);
  });

  it('fails closed without an invite and applies a bounded per-viewer guide cooldown', async () => {
    let state: Record<string, unknown> = {};
    const context = {
      settings: { enabled: true, commandName: 'freegames', discordInviteUrl: '', guideCooldownMinutes: 10 },
      state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) },
      schedule: { after: vi.fn(() => 'task'), cancel: vi.fn() }, streamerbot: { runApprovedAction: vi.fn(async () => {}) }, chat: { send: vi.fn(async () => []) },
    };
    await freeGameCheck.start(context);
    const event = { schemaVersion: '1.0.0', eventId: 'command-1', eventType: 'command.received', platform: 'youtube', receivedAt: new Date().toISOString(), metadata: { simulated: false }, user: { id: 'viewer', name: 'viewer' }, payload: { command: 'freegames', arguments: [] } };
    await freeGameCheck.onEvent(event, context);
    expect(context.chat.send).not.toHaveBeenCalled();
    expect(state.lastError).toContain('valid Discord invite');
    context.settings.discordInviteUrl = 'https://discord.com/invite/village';
    await freeGameCheck.onEvent(event, context);
    await freeGameCheck.onEvent({ ...event, eventId: 'command-2' }, context);
    expect(context.chat.send).toHaveBeenCalledTimes(1);
    expect(Object.keys((state.guideCooldowns || {}) as Record<string, number>)).toHaveLength(1);
    await freeGameCheck.stop(context);
  });
});
