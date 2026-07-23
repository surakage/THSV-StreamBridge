import { afterEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import fanCrown, { applyCapture, calculateNextCost, CONTROLLER_ACTION_ID, rankLeaderboard, resetSeasonState, sanitizeState } from '../../addons/fan-crown/dist/index.js';

const baseSettings = {
  enabled: true,
  rewardId: 'fan-crown-reward',
  baseRewardTitle: 'No. 1 Fan',
  holderTitleTemplate: '{name} is No. 1 Fan',
  pricingMode: 'fixed',
  baseCost: 500,
  fixedIncrease: 250,
  multiplier: 1.25,
  maximumCost: 10_000,
  roundingIncrement: 50,
  resetEachStream: false,
  blockCurrentHolder: true,
  userCooldownMinutes: 0,
  allowBroadcaster: true,
  allowModerators: true,
  announceCaptures: true,
  captureMessageTemplate: '{name} paid {cost}; next {nextCost}; captures {captures}.',
  notifyRejectedClaims: true,
  rejectedMessageTemplate: '{name}: {reason}.',
  announceMonthlyWinner: true,
  monthlyWinnerMessageTemplate: '{name} won {month} with {points}, {captures}, {longestReignMinutes}.',
  showCrownCard: true,
  crownCardSeconds: 20,
  overlayBackgroundMode: 'glass',
  overlayBackgroundColor: '#201335',
  overlayBackgroundOpacity: 0.94,
  overlayAccentColor: '#f4cc63',
  overlayTextColor: '#ffffff',
  overlayFontFamily: 'display',
};

function rewardEvent(userId = 'viewer-1', displayName = 'Viewer', redemptionId = `redeem-${userId}`, roles: string[] = []) {
  return {
    eventId: `event-${redemptionId}`,
    eventType: 'reward.redemption',
    platform: 'twitch',
    source: { eventId: redemptionId, eventName: 'TwitchRewardRedemption' },
    receivedAt: new Date().toISOString(),
    channel: { name: 'channel' },
    user: {
      id: userId,
      name: displayName.toLowerCase(),
      displayName,
      roles,
      actorType: 'human',
      avatarUrl: 'https://example.com/avatar.png',
    },
    payload: {
      rewardId: 'fan-crown-reward',
      rewardTitle: 'No. 1 Fan',
      rewardCost: 500,
      redemptionId,
      verifiedTransport: true,
      supportedOperations: ['fulfill', 'cancel'],
    },
    metadata: { simulated: false },
  };
}

function runtime(overrides: Record<string, unknown> = {}, initialState: Record<string, unknown> = {}) {
  let state: Record<string, unknown> = initialState;
  const schedule = { after: vi.fn(() => 'task-1'), cancel: vi.fn(() => true) };
  return {
    value: () => state,
    context: {
      settings: { ...baseSettings, ...overrides },
      approvedActionIds: [CONTROLLER_ACTION_ID],
      state: { read: vi.fn(async () => state), write: vi.fn(async (value) => { state = value; }) },
      streamerbot: { runApprovedAction: vi.fn(async () => {}) },
      chat: { send: vi.fn(async () => []) },
      overlay: { publish: vi.fn(async () => {}) },
      schedule,
    },
  };
}

afterEach(async () => {
  await fanCrown.stop({ schedule: { cancel: () => true } });
});

describe('Fan Crown add-on', () => {
  it('calculates rounded fixed and multiplier pricing with a hard maximum', () => {
    expect(calculateNextCost(500, { ...baseSettings, pricingMode: 'fixed' })).toBe(750);
    expect(calculateNextCost(550, { ...baseSettings, pricingMode: 'multiplier', multiplier: 1.25, roundingIncrement: 50 })).toBe(700);
    expect(calculateNextCost(9_900, { ...baseSettings, pricingMode: 'fixed', fixedIncrease: 500 })).toBe(10_000);
  });

  it('scores actual points, captures, and the previous holder reign', () => {
    const start = Date.parse('2026-07-22T12:00:00.000Z');
    let state = sanitizeState({}, 500, start);
    state = applyCapture(state, {
      userId: 'a', displayName: 'Alpha', avatarUrl: '', rewardId: 'fan-crown-reward', redemptionId: 'r1',
      claimedAt: new Date(start).toISOString(), paidCost: 500, nextCost: 750, rewardTitle: 'Alpha is No. 1 Fan',
    }, start);
    state = applyCapture(state, {
      userId: 'b', displayName: 'Beta', avatarUrl: '', rewardId: 'fan-crown-reward', redemptionId: 'r2',
      claimedAt: new Date(start + 90_000).toISOString(), paidCost: 750, nextCost: 1_000, rewardTitle: 'Beta is No. 1 Fan',
    }, start + 90_000);
    expect(rankLeaderboard(state.leaderboard).map((entry: { displayName: string; totalSpent: number }) => [entry.displayName, entry.totalSpent])).toEqual([
      ['Beta', 750],
      ['Alpha', 500],
    ]);
    expect(state.leaderboard.find((entry: { userId: string }) => entry.userId === 'a')).toMatchObject({
      totalReignSeconds: 90,
      longestReignSeconds: 90,
      captures: 1,
    });
  });

  it('archives the monthly winner and clears crown, price, and leaderboard', () => {
    const state = sanitizeState({
      seasonMonth: '2026-06',
      currentCost: 1_500,
      crown: { userId: 'winner', displayName: 'Winner', claimedAt: '2026-06-30T23:58:00.000Z' },
      leaderboard: [
        { userId: 'winner', displayName: 'Winner', totalSpent: 2_000, captures: 2, totalReignSeconds: 100, longestReignSeconds: 60, firstScoredAt: '2026-06-01T00:00:00.000Z', lastCapturedAt: '2026-06-30T23:58:00.000Z' },
      ],
    }, 500, Date.parse('2026-06-30T23:59:00.000Z'));
    const result = resetSeasonState(state, baseSettings, Date.parse('2026-07-01T12:00:00.000Z'));
    expect(result.winner).toMatchObject({ displayName: 'Winner', totalSpent: 2_000, captures: 2 });
    expect(result.state).toMatchObject({ seasonMonth: '2026-07', currentCost: 500, leaderboard: [], previousSeason: { month: '2026-06' } });
    expect(result.state.crown).toBeUndefined();
  });

  it('reserves a verified claim and commits it only after the correlated controller result', async () => {
    const testRuntime = runtime();
    await fanCrown.onEvent(rewardEvent(), testRuntime.context);
    const pending = testRuntime.value().pending as { requestId: string };
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({
      fanCrownOperation: 'claim',
      fanCrownRewardId: 'fan-crown-reward',
      fanCrownRedemptionId: 'redeem-viewer-1',
      fanCrownRewardTitle: 'Viewer is No. 1 Fan',
      fanCrownRewardCost: 750,
      fanCrownPreviousCost: 500,
    }));
    expect(testRuntime.value().leaderboard).toEqual([]);
    await fanCrown.onEvent({
      eventType: 'addon.thsv.fan-crown.controller-result',
      payload: { operation: 'claim', requestId: pending.requestId, success: true, error: '' },
      metadata: { simulated: false },
    }, testRuntime.context);
    expect(testRuntime.value()).toMatchObject({
      crown: { userId: 'viewer-1', displayName: 'Viewer' },
      currentCost: 750,
      leaderboard: [{ userId: 'viewer-1', totalSpent: 500, captures: 1 }],
    });
    expect(testRuntime.context.chat.send).toHaveBeenCalledWith(expect.objectContaining({ sourcePlatform: 'twitch', message: 'Viewer paid 500; next 750; captures 1.' }));
    expect(testRuntime.context.overlay.publish).toHaveBeenCalledWith('thsv.fan-crown.card.show', expect.objectContaining({
      imageUrl: 'https://example.com/avatar.png',
      style: expect.objectContaining({ backgroundColor: '#201335', fontFamily: 'display' }),
    }));
  });

  it('refunds the current holder instead of counting another capture', async () => {
    const initial = sanitizeState({
      currentCost: 750,
      crown: { userId: 'viewer-1', displayName: 'Viewer', claimedAt: new Date().toISOString() },
      leaderboard: [{ userId: 'viewer-1', displayName: 'Viewer', totalSpent: 500, captures: 1, totalReignSeconds: 0, longestReignSeconds: 0, firstScoredAt: new Date().toISOString(), lastCapturedAt: new Date().toISOString() }],
    }, 500);
    const testRuntime = runtime({}, initial as Record<string, unknown>);
    await fanCrown.onEvent(rewardEvent('viewer-1', 'Viewer', 'repeat-1'), testRuntime.context);
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({
      fanCrownOperation: 'cancel',
      fanCrownRedemptionId: 'repeat-1',
    }));
    expect((testRuntime.value().leaderboard as unknown[])).toHaveLength(1);
    expect(testRuntime.context.chat.send).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('current holder must be challenged'),
    }));
  });

  it('refunds the first stale-season redemption and requests a base reward reset', async () => {
    const stale = sanitizeState({ seasonMonth: '2000-01', currentCost: 5_000 }, 500, Date.parse('2000-01-15T12:00:00.000Z'));
    const testRuntime = runtime({}, stale as Record<string, unknown>);
    await fanCrown.onEvent(rewardEvent('new-viewer', 'New Viewer', 'new-month-1'), testRuntime.context);
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenNthCalledWith(1, CONTROLLER_ACTION_ID, expect.objectContaining({
      fanCrownOperation: 'cancel',
      fanCrownRedemptionId: 'new-month-1',
    }));
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenNthCalledWith(2, CONTROLLER_ACTION_ID, expect.objectContaining({
      fanCrownOperation: 'reset',
      fanCrownRewardCost: 500,
    }));
    expect(testRuntime.value().pending).toMatchObject({ operation: 'reset-month', announceWinner: true });
  });

  it('never dispatches a controller for a simulated redemption', async () => {
    const testRuntime = runtime();
    await fanCrown.onEvent({ ...rewardEvent(), metadata: { simulated: true } }, testRuntime.context);
    expect(testRuntime.context.streamerbot.runApprovedAction).not.toHaveBeenCalled();
    expect(testRuntime.value()).toEqual({});
  });
});
