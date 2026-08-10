import { afterEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import firstFive, { addLeaderboardClaim, CONTROLLER_ACTION_ID, rankLeaderboard, rolloverMonth, sanitizeState } from '../../addons/first-five/dist/index.js';

const rewardIds = ['reward-1', 'reward-2', 'reward-3', 'reward-4', 'reward-5'];
const settings = {
  enabled: true,
  reward1Id: rewardIds[0], reward2Id: rewardIds[1], reward3Id: rewardIds[2], reward4Id: rewardIds[3], reward5Id: rewardIds[4],
  kickReward1Id: 'kick-reward-1', kickReward2Id: 'kick-reward-2', kickReward3Id: 'kick-reward-3', kickReward4Id: 'kick-reward-4', kickReward5Id: 'kick-reward-5',
  commandName: 'firstfive', pointsCost: 25,
  reward1Title: 'First Five: Claim 1st Place', reward2Title: 'First Five: Claim 2nd Place', reward3Title: 'First Five: Claim 3rd Place', reward4Title: 'First Five: Claim 4th Place', reward5Title: 'First Five: Claim 5th Place',
  claimedTitleTemplate: '{name} was {ordinal}', announceClaims: true, claimMessageTemplate: '{name} claimed {ordinal} place!',
  notifyRejectedClaims: false, rejectedMessageTemplate: '{name}, already claimed.', announceMonthlyWinner: true,
  monthlyWinnerMessageTemplate: '{name} won {month} with {points} points!', showLeaderboardCard: true, leaderboardCardSeconds: 30,
};

function rewardEvent(position: number, userId = 'user-1', displayName = 'Viewer', skipsQueue = false) {
  return {
    eventId: `event-${String(position)}-${userId}`,
    eventType: 'reward.redemption',
    platform: 'twitch',
    source: { eventId: `redemption-${String(position)}-${userId}` },
    receivedAt: '2026-07-22T12:00:00.000Z',
    channel: { name: 'channel' },
    user: { id: userId, name: displayName.toLowerCase(), displayName, roles: [], actorType: 'human' },
    payload: {
      rewardId: rewardIds[position - 1], rewardTitle: `Reward ${String(position)}`, rewardCost: 100,
      redemptionId: `redemption-${String(position)}-${userId}`, verifiedTransport: true, skipsQueue,
      supportedOperations: skipsQueue ? [] : ['fulfill', 'cancel'],
    },
    metadata: { simulated: false },
  };
}

function context() {
  let state: Record<string, unknown> = {};
  return {
    value: () => state,
    context: {
      settings,
      approvedActionIds: [CONTROLLER_ACTION_ID],
      state: { read: vi.fn(async () => state), write: vi.fn(async (value) => { state = value; }) },
      streamerbot: { runApprovedAction: vi.fn(async () => {}) },
      chat: { send: vi.fn(async () => []) },
      overlay: { publish: vi.fn(async () => {}) },
      viewerFoundation: { getProjection: vi.fn(async () => ({ viewerId: 'viewer-points', currencyName: 'Village Points' })), mutate: vi.fn(async () => ({ applied: true })) },
    },
  };
}

afterEach(async () => { await firstFive.stop(); });

describe('First Five add-on', () => {
  it('starts silently without displaying a leaderboard card', async () => {
    const runtime = context();
    await firstFive.start(runtime.context);
    expect(runtime.context.overlay.publish).not.toHaveBeenCalled();
    expect(runtime.context.streamerbot.runApprovedAction).not.toHaveBeenCalled();
  });

  it('scores placements 5 through 1 and ranks ties by first-place wins', () => {
    const claims = [
      { position: 2, userId: 'a', displayName: 'Alpha', claimedAt: '2026-07-01T00:00:00.000Z' },
      { position: 1, userId: 'b', displayName: 'Beta', claimedAt: '2026-07-02T00:00:00.000Z' },
    ];
    let entries: unknown[] = [];
    for (const claim of claims) entries = addLeaderboardClaim(entries, claim);
    expect(rankLeaderboard(entries).map((entry: { displayName: string; points: number }) => [entry.displayName, entry.points])).toEqual([['Beta', 5], ['Alpha', 4]]);
  });

  it('archives one monthly winner and starts a fresh leaderboard', () => {
    const state = sanitizeState({
      leaderboardMonth: '2026-06',
      leaderboard: [{ userId: 'viewer-1', displayName: 'Winner', placements: [2, 0, 0, 0, 0], firstScoredAt: '2026-06-01T00:00:00.000Z', lastClaimedAt: '2026-06-02T00:00:00.000Z' }],
    }, new Date('2026-06-15T00:00:00').getTime());
    const result = rolloverMonth(state, new Date('2026-07-01T00:00:00').getTime());
    expect(result.winner).toMatchObject({ displayName: 'Winner', points: 10 });
    expect(result.state).toMatchObject({ leaderboardMonth: '2026-07', leaderboard: [], previousMonth: { month: '2026-06' } });
  });

  it('reserves, confirms, and scores one real verified first-place claim', async () => {
    const runtime = context();
    await firstFive.onEvent(rewardEvent(1), runtime.context);
    const pending = runtime.value().pending as { requestId: string };
    expect(runtime.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({
      firstFiveOperation: 'claim', firstFiveRewardId: 'reward-1', firstFiveNextRewardId: 'reward-2', firstFiveClaimedTitle: 'Viewer was 1st',
    }));
    await firstFive.onEvent({
      eventType: 'addon.thsv.first-five.controller-result',
      payload: { operation: 'claim', requestId: pending.requestId, success: true, error: '' },
      metadata: { simulated: false },
    }, runtime.context);
    expect(runtime.value()).toMatchObject({
      placements: [{ position: 1, userId: 'twitch:user-1', displayName: 'Viewer' }],
      leaderboard: [{ userId: 'twitch:user-1', points: 5, placements: [1, 0, 0, 0, 0] }],
    });
    expect(runtime.context.chat.send).toHaveBeenCalledWith(expect.objectContaining({ message: 'Viewer claimed 1st place!', sourcePlatform: 'twitch' }));
    expect(runtime.context.overlay.publish).toHaveBeenCalled();
  });

  it('marks a queue-skipping redemption as already fulfilled instead of fulfilling it twice', async () => {
    const runtime = context();
    await firstFive.onEvent(rewardEvent(1, 'user-1', 'Viewer', true), runtime.context);
    expect(runtime.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({
      firstFiveOperation: 'claim', firstFiveRedemptionAlreadyFulfilled: true,
    }));
  });

  it('refunds a viewer who tries to claim a second placement in the same stream', async () => {
    const runtime = context();
    await firstFive.onEvent(rewardEvent(1), runtime.context);
    const pending = runtime.value().pending as { requestId: string };
    await firstFive.onEvent({ eventType: 'addon.thsv.first-five.controller-result', payload: { operation: 'claim', requestId: pending.requestId, success: true }, metadata: { simulated: false } }, runtime.context);
    await firstFive.onEvent(rewardEvent(2), runtime.context);
    expect(runtime.context.streamerbot.runApprovedAction).toHaveBeenLastCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({
      firstFiveOperation: 'cancel', firstFiveRewardId: 'reward-2', firstFiveRedemptionId: 'redemption-2-user-1',
    }));
    expect((runtime.value().placements as unknown[])).toHaveLength(1);
  });

  it('resets placements and reward order on a real Twitch stream-online event', async () => {
    const runtime = context();
    await firstFive.onEvent({
      eventId: 'online-1', eventType: 'stream.online', platform: 'twitch', source: { eventId: 'online-source-1' }, metadata: { simulated: false },
    }, runtime.context);
    const pending = runtime.value().pending as { requestId: string; operation: string };
    expect(pending.operation).toBe('reset');
    expect(runtime.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({
      firstFiveOperation: 'reset', firstFiveReward1Id: 'reward-1', firstFiveReward5Id: 'reward-5',
    }));
    await firstFive.onEvent({ eventType: 'addon.thsv.first-five.controller-result', payload: { operation: 'reset', requestId: pending.requestId, success: true }, metadata: { simulated: false } }, runtime.context);
    expect(runtime.value()).toMatchObject({ streamCycleId: 'online-source-1', placements: [] });
    expect(runtime.value().pending).toBeUndefined();
    expect(runtime.context.overlay.publish).not.toHaveBeenCalled();

    runtime.context.streamerbot.runApprovedAction.mockClear();
    await firstFive.onEvent({
      eventId: 'online-1-duplicate', eventType: 'stream.online', platform: 'twitch', source: { eventId: 'online-source-1' }, metadata: { simulated: false },
    }, runtime.context);
    expect(runtime.context.streamerbot.runApprovedAction).not.toHaveBeenCalled();
  });

  it('disables every placement reward when the Twitch stream ends', async () => {
    const runtime = context();
    await firstFive.onEvent({
      eventId: 'offline-1', eventType: 'stream.offline', platform: 'twitch', source: { eventId: 'offline-source-1' }, metadata: { simulated: false },
    }, runtime.context);
    expect(runtime.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({
      firstFiveOperation: 'deactivate', firstFiveReward1Id: 'reward-1', firstFiveReward5Id: 'reward-5',
    }));
  });

  it('does not clear stream placements until Streamer.bot confirms the reward reset', async () => {
    const runtime = context();
    await firstFive.onEvent(rewardEvent(1), runtime.context);
    const claimPending = runtime.value().pending as { requestId: string };
    await firstFive.onEvent({ eventType: 'addon.thsv.first-five.controller-result', payload: { operation: 'claim', requestId: claimPending.requestId, success: true }, metadata: { simulated: false } }, runtime.context);
    await firstFive.onEvent({ eventId: 'online-3', eventType: 'stream.online', platform: 'twitch', source: { eventId: 'online-source-3' }, metadata: { simulated: false } }, runtime.context);
    const resetPending = runtime.value().pending as { requestId: string };
    expect(runtime.value().placements as unknown[]).toHaveLength(1);
    await firstFive.onEvent({ eventType: 'addon.thsv.first-five.controller-result', payload: { operation: 'reset', requestId: resetPending.requestId, success: false }, metadata: { simulated: false } }, runtime.context);
    expect(runtime.value().placements as unknown[]).toHaveLength(1);
    expect(runtime.value().pending).toBeUndefined();
  });

  it('preserves the prior placement state when Streamer.bot rejects a reset dispatch', async () => {
    const runtime = context();
    await firstFive.onEvent(rewardEvent(1), runtime.context);
    const pending = runtime.value().pending as { requestId: string };
    await firstFive.onEvent({ eventType: 'addon.thsv.first-five.controller-result', payload: { operation: 'claim', requestId: pending.requestId, success: true }, metadata: { simulated: false } }, runtime.context);
    const beforeReset = runtime.value();
    runtime.context.streamerbot.runApprovedAction.mockRejectedValueOnce(new Error('Streamer.bot unavailable'));
    await firstFive.onEvent({
      eventId: 'online-2', eventType: 'stream.online', platform: 'twitch', source: { eventId: 'online-source-2' }, metadata: { simulated: false },
    }, runtime.context);
    expect(runtime.value()).toEqual(beforeReset);
  });

  it('never mutates rewards for a simulated redemption', async () => {
    const runtime = context();
    await firstFive.onEvent({ ...rewardEvent(1), metadata: { simulated: true } }, runtime.context);
    expect(runtime.context.streamerbot.runApprovedAction).not.toHaveBeenCalled();
    expect(runtime.value()).toEqual({});
  });

  it('accepts Kick rewards directly and spends points for TikTok commands', async () => {
    const kickRuntime = context();
    const kickBase = rewardEvent(1, 'kick-viewer', 'Kick Viewer');
    await firstFive.onEvent({ ...kickBase, platform: 'kick', payload: { ...kickBase.payload, rewardId: 'kick-reward-1', supportedOperations: [] } }, kickRuntime.context);
    expect(kickRuntime.value()).toMatchObject({ placements: [{ position: 1, userId: 'kick:kick-viewer' }] });
    expect(kickRuntime.context.streamerbot.runApprovedAction).not.toHaveBeenCalled();

    await firstFive.stop();
    const tiktokRuntime = context();
    await firstFive.onEvent({ eventId: 'tiktok-first-five-1', eventType: 'command.received', platform: 'tiktok', source: { eventId: 'tiktok-first-five-1' }, user: { id: 'tiktok-viewer', name: 'viewer', displayName: 'TikTok Viewer', actorType: 'human', roles: [] }, payload: { command: 'firstfive', arguments: [] }, metadata: { simulated: false } }, tiktokRuntime.context);
    expect(tiktokRuntime.value()).toMatchObject({ placements: [{ position: 1, userId: 'tiktok:tiktok-viewer' }] });
    expect(tiktokRuntime.context.viewerFoundation.mutate).toHaveBeenCalledWith(expect.objectContaining({ operation: 'spend', amount: 25, viewerId: 'viewer-points' }));
  });

  it('maintains an independent five-place board for each platform', async () => {
    const runtime = context();
    await firstFive.onEvent(rewardEvent(1, 'same-person', 'Same Viewer'), runtime.context);
    const pending = runtime.value().pending as { requestId: string };
    await firstFive.onEvent({ eventType: 'addon.thsv.first-five.controller-result', payload: { operation: 'claim', requestId: pending.requestId, success: true }, metadata: { simulated: false } }, runtime.context);

    const kickBase = rewardEvent(1, 'same-person', 'Same Viewer');
    await firstFive.onEvent({ ...kickBase, platform: 'kick', eventId: 'kick-independent-first', payload: { ...kickBase.payload, rewardId: 'kick-reward-1', redemptionId: 'kick-independent-first', supportedOperations: [] } }, runtime.context);
    expect(runtime.value().placements).toEqual(expect.arrayContaining([
      expect.objectContaining({ position: 1, userId: 'twitch:same-person' }),
      expect.objectContaining({ position: 1, userId: 'kick:same-person' }),
    ]));
    expect(runtime.context.overlay.publish).toHaveBeenLastCalledWith('thsv.first-five.card.show', expect.objectContaining({
      platform: 'kick', headline: 'Kick First Five', placements: [expect.objectContaining({ position: 1, platform: 'kick' })],
    }), { lane: 'foreground' });
  });
});
