import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import freeGameCheck, { stateFor } from '../../addons/free-game-check/dist/index.js';

function lifecycle(eventType: 'stream.online' | 'stream.offline', platform: string) {
  return { schemaVersion: '1.0.0', eventId: `${eventType}-${platform}`, eventType, platform, receivedAt: new Date().toISOString(), payload: {}, metadata: { simulated: false } };
}
function reward(platform: 'twitch' | 'kick', id: string) {
  return { schemaVersion: '1.0.0', eventId: `reward-${platform}-${id}`, eventType: 'reward.redemption', platform, receivedAt: new Date().toISOString(), metadata: { simulated: false }, user: { id: 'viewer-1', name: 'viewer', displayName: 'Village Viewer' }, payload: { rewardId: `${platform}-free-games`, redemptionId: id, verifiedTransport: true } };
}
function command(platform: 'youtube' | 'tiktok', id: string) {
  return { schemaVersion: '1.0.0', eventId: id, eventType: 'command.received', platform, receivedAt: new Date().toISOString(), metadata: { simulated: false }, user: { id: 'viewer-2', name: 'viewer', displayName: 'Point Viewer' }, payload: { command: 'freegames', arguments: [] } };
}
function results(requestId: string, games: unknown[]) {
  return { schemaVersion: '1.0.0', eventId: `results-${requestId}`, eventType: 'addon.thsv.free-game-check.results', platform: 'system', receivedAt: new Date().toISOString(), payload: { requestId, games }, metadata: { simulated: false } };
}
function runtime(overrides: Record<string, unknown> = {}) {
  let state: Record<string, unknown> = {};
  const runApprovedAction = vi.fn(async (actionId: string, argumentsValue: Record<string, unknown>) => { void actionId; void argumentsValue; });
  const mutations: Record<string, unknown>[] = [];
  const context = {
    settings: {
      enabled: true, rewardId: 'twitch-free-games', kickRewardId: 'kick-free-games', commandName: 'freegames', pointsCost: 75,
      discordInviteUrl: 'https://discord.gg/village', guideMessage: '{name}, games are ready: {discord}', noGamesMessage: '{name}, no free games are available.',
      unavailableMessage: '{name}, lookup failed.', discordEnabled: true, maximumPostsPerRefresh: 2, ...overrides,
    },
    state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) },
    schedule: { after: vi.fn(() => 'request-timeout'), cancel: vi.fn() },
    streamerbot: { runApprovedAction }, chat: { send: vi.fn(async () => []) },
    viewerFoundation: {
      getProjection: vi.fn(async () => ({ viewerId: 'foundation-viewer', currencyName: 'Village Points' })),
      mutate: vi.fn(async (request: Record<string, unknown>) => { mutations.push(request); return { applied: true }; }),
    },
  };
  return { context, runApprovedAction, mutations, state: () => state };
}

describe('Free Game Check', () => {
  it('does not schedule or fetch games until a valid live redemption arrives', async () => {
    const run = runtime();
    await freeGameCheck.start(run.context);
    expect(run.context.schedule.after).not.toHaveBeenCalled();
    expect(run.runApprovedAction).not.toHaveBeenCalled();
    await freeGameCheck.onEvent(reward('twitch', 'offline'), run.context);
    expect(run.runApprovedAction).not.toHaveBeenCalled();
    await freeGameCheck.onEvent(lifecycle('stream.online', 'twitch'), run.context);
    await freeGameCheck.onEvent(reward('twitch', 'live'), run.context);
    expect(run.runApprovedAction).toHaveBeenCalledWith('1f8e660b-3ee9-4a9a-9390-68d7e5257c11', expect.objectContaining({ freeGameCheckRequestId: expect.any(String) }));
    expect(run.context.schedule.after).toHaveBeenCalledTimes(1);
    await freeGameCheck.stop(run.context);
  });

  it('guides the source chat, fulfills Twitch, and posts only new games to Discord', async () => {
    const run = runtime();
    await freeGameCheck.start(run.context); await freeGameCheck.onEvent(lifecycle('stream.online', 'twitch'), run.context); await freeGameCheck.onEvent(reward('twitch', 'redeem-1'), run.context);
    const requestId = String(run.runApprovedAction.mock.calls[0]?.[1]?.freeGameCheckRequestId);
    await freeGameCheck.onEvent(results(requestId, [{ id: 'game-1', title: 'Game One', url: 'https://www.gamerpower.com/open/game-1/', platforms: 'PC' }]), run.context);
    expect(run.context.chat.send).toHaveBeenCalledWith(expect.objectContaining({ routing: 'source', sourcePlatform: 'twitch', message: 'Village Viewer, games are ready: https://discord.gg/village' }));
    expect(run.runApprovedAction).toHaveBeenCalledWith('7e9b4db8-5d33-4ed2-a8d1-11f8d04ab662', expect.objectContaining({ freeGameDiscordTitle: 'Game One' }));
    expect(run.runApprovedAction).toHaveBeenCalledWith('d12e5b98-4dc5-5f0c-b54d-85cfe3a4f7b2', expect.objectContaining({ freeGameRewardOperation: 'fulfill', freeGameRedemptionId: 'redeem-1' }));
    await freeGameCheck.stop(run.context);
  });

  it('reports no games and refunds a Twitch redemption', async () => {
    const run = runtime();
    await freeGameCheck.start(run.context); await freeGameCheck.onEvent(lifecycle('stream.online', 'twitch'), run.context); await freeGameCheck.onEvent(reward('twitch', 'empty-twitch'), run.context);
    const requestId = String(run.runApprovedAction.mock.calls[0]?.[1]?.freeGameCheckRequestId);
    await freeGameCheck.onEvent(results(requestId, []), run.context);
    expect(run.context.chat.send).toHaveBeenCalledWith(expect.objectContaining({ sourcePlatform: 'twitch', message: 'Village Viewer, no free games are available. Your points were refunded.' }));
    expect(run.runApprovedAction).toHaveBeenCalledWith('d12e5b98-4dc5-5f0c-b54d-85cfe3a4f7b2', expect.objectContaining({ freeGameRewardOperation: 'refund', freeGameRedemptionId: 'empty-twitch' }));
    await freeGameCheck.stop(run.context);
  });

  it.each(['youtube', 'tiktok'] as const)('spends %s Viewer Foundation points and refunds them when no games exist', async (platform) => {
    const run = runtime();
    await freeGameCheck.start(run.context); await freeGameCheck.onEvent(lifecycle('stream.online', platform), run.context); await freeGameCheck.onEvent(command(platform, `empty-${platform}`), run.context);
    expect(run.mutations[0]).toMatchObject({ operation: 'spend', amount: 75, viewerId: 'foundation-viewer' });
    const requestId = String(run.runApprovedAction.mock.calls[0]?.[1]?.freeGameCheckRequestId);
    await freeGameCheck.onEvent(results(requestId, []), run.context);
    expect(run.mutations[1]).toMatchObject({ operation: 'refund', amount: 75, viewerId: 'foundation-viewer' });
    expect(run.context.chat.send).toHaveBeenCalledWith(expect.objectContaining({ sourcePlatform: platform, message: 'Point Viewer, no free games are available. Your points were refunded.' }));
    await freeGameCheck.stop(run.context);
  });

  it('reports no games for Kick without claiming an unsupported automatic refund', async () => {
    const run = runtime();
    await freeGameCheck.start(run.context); await freeGameCheck.onEvent(lifecycle('stream.online', 'kick'), run.context); await freeGameCheck.onEvent(reward('kick', 'empty-kick'), run.context);
    const requestId = String(run.runApprovedAction.mock.calls[0]?.[1]?.freeGameCheckRequestId);
    await freeGameCheck.onEvent(results(requestId, []), run.context);
    expect(run.context.chat.send).toHaveBeenCalledWith(expect.objectContaining({ sourcePlatform: 'kick', message: 'Village Viewer, no free games are available.' }));
    expect(run.runApprovedAction.mock.calls.some(([id]) => id === 'd12e5b98-4dc5-5f0c-b54d-85cfe3a4f7b2')).toBe(false);
    await freeGameCheck.stop(run.context);
  });

  it('rejects unsafe provider links and refunds supported payment paths', async () => {
    const run = runtime();
    await freeGameCheck.start(run.context); await freeGameCheck.onEvent(lifecycle('stream.online', 'youtube'), run.context); await freeGameCheck.onEvent(command('youtube', 'unsafe'), run.context);
    const requestId = String(run.runApprovedAction.mock.calls[0]?.[1]?.freeGameCheckRequestId);
    await freeGameCheck.onEvent(results(requestId, [{ id: 'bad', title: 'Bad', url: 'https://evil.example/game' }]), run.context);
    expect(run.mutations.at(-1)).toMatchObject({ operation: 'refund' });
    expect(run.state().lastError).toContain('safe GamerPower links');
    await freeGameCheck.stop(run.context);
  });

  it('treats pre-upgrade seen games as the Discord baseline', () => {
    expect(stateFor({ initialized: true, seenIds: ['old-one', 'old-two'] }).discordDeliveredIds).toEqual(['old-one', 'old-two']);
  });
});
