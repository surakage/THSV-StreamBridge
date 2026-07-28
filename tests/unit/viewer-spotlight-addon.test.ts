import { afterEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import viewerSpotlight, { administerViewerSpotlight, processViewerSpotlightEvent, resetViewerSpotlightRuntime, sanitizeViewerSpotlightState } from '../../addons/viewer-spotlight/dist/index.js';

function event(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'command-1', eventType: 'command.received', platform: 'twitch', source: { eventId: 'provider-1' }, receivedAt: '2026-07-26T12:00:00.000Z', channel: { name: 'channel' },
    user: { id: '123456', name: 'viewer_login', displayName: 'Viewer Name', avatarUrl: 'https://example.com/avatar.png', actorType: 'human', roles: [] },
    payload: { command: 'card', arguments: [] }, metadata: { simulated: false }, ...overrides,
  };
}

function runtime(settings: Record<string, unknown> = {}) {
  let state: Record<string, unknown> = {};
  const published: Array<{ topic: string; payload: Record<string, unknown> }> = [];
  const context = {
    settings: { enabled: true, disclosureAccepted: true, ...settings },
    state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) },
    schedule: { after: vi.fn(() => 'timer-1'), cancel: vi.fn(() => true) },
    overlay: { publish: vi.fn(async (topic: string, payload: Record<string, unknown>) => { published.push({ topic, payload }); }) },
    streamerbot: { runApprovedAction: vi.fn(async () => undefined) },
    viewerFoundation: { getProjection: vi.fn(async (query: Record<string, unknown>): Promise<Record<string, unknown>> => query.viewerId === undefined
      ? { contractVersion: '1.0.0', viewerId: 'viewer-one', linked: false, points: 245, level: 3, nextLevelAt: 300, latestAchievement: { id: 'first-steps', label: 'First Steps', points: 100 } }
      : { contractVersion: '1.0.0', viewerId: query.viewerId, linked: false, points: 245, level: 3, nextLevelAt: 300, latestAchievement: { id: 'first-steps', label: 'First Steps', points: 100 } }) },
    communityAnalytics: {
      getViewerProjection: vi.fn(async (viewerId: string): Promise<Record<string, unknown>> => ({ contractVersion: '1.0.0', viewerId, observed: true, firstSeenAt: 1, lastSeenAt: 2, sessions: 4, counters: { messages: 12, commands: 3, follows: 0, subscriptions: 0, memberships: 0, giftSubscriptions: 0, gifts: 0, cheers: 0, superChats: 0, raids: 0, rewardRedemptions: 0 }, activeSession: true, activeLastSeenAt: 2 })),
      getSessionProjection: vi.fn(async () => ({ contractVersion: '1.0.0', active: true, approximate: false, livePlatforms: ['twitch'], uniqueViewers: 12, counters: { messages: 40, commands: 4, follows: 2, subscriptions: 1, memberships: 0, giftSubscriptions: 0, gifts: 0, cheers: 0, superChats: 0, raids: 0, rewardRedemptions: 3 }, retainedSessionCount: 0 })),
    },
  };
  return { context, published, value: () => state };
}

afterEach(async () => { await viewerSpotlight.stop({ schedule: { cancel: () => true } }); resetViewerSpotlightRuntime(); });

describe('Viewer Spotlight add-on', () => {
  it('shows one self-requested card from re-read provider projections', async () => {
    const testRuntime = runtime({ showObservedMessages: true, showObservedSessions: true }); await viewerSpotlight.start(testRuntime.context);
    await expect(processViewerSpotlightEvent(event(), testRuntime.context, 1_000)).resolves.toMatchObject({ accepted: true, viewerId: 'viewer-one' });
    expect(testRuntime.context.viewerFoundation.getProjection).toHaveBeenCalledTimes(2); expect(testRuntime.context.communityAnalytics.getViewerProjection).toHaveBeenCalledWith('viewer-one');
    expect(testRuntime.published).toEqual([{ topic: 'thsv.viewer-spotlight.card.show', payload: expect.objectContaining({ title: 'Viewer Name • Twitch', text: '245 points • Level 3 • First Steps • 4 observed sessions • 12 observed messages', imageUrl: 'https://example.com/avatar.png', presentationMode: 'single' }) }]);
  });

  it('shows capped engagement score and rank only when Community Analytics supplies them', async () => {
    const testRuntime = runtime({ showEngagementScore: true, showSeasonRank: true });
    testRuntime.context.communityAnalytics.getViewerProjection.mockResolvedValue({ contractVersion: '1.0.0', viewerId: 'viewer-one', observed: true, firstSeenAt: 1, lastSeenAt: 2, sessions: 4, counters: { messages: 12, commands: 3, follows: 0, subscriptions: 0, memberships: 0, giftSubscriptions: 0, gifts: 0, cheers: 0, superChats: 0, raids: 0, rewardRedemptions: 0 }, activeSession: true, activeLastSeenAt: 2, scoreSeason: '2026-07', engagementScore: 88, seasonRank: 2, rankCohortSize: 12 });
    await viewerSpotlight.start(testRuntime.context); await processViewerSpotlightEvent(event(), testRuntime.context, 1_000);
    expect(testRuntime.published[0]?.payload.text).toContain('88 engagement score'); expect(testRuntime.published[0]?.payload.text).toContain('#2 of 12 this month');
  });

  it('rejects target arguments, simulations, and repeat requests during cooldown', async () => {
    const testRuntime = runtime(); await viewerSpotlight.start(testRuntime.context);
    await expect(processViewerSpotlightEvent(event({ payload: { command: 'card', arguments: ['someone-else'] } }), testRuntime.context, 1_000)).resolves.toEqual({ accepted: false, reason: 'self-only' });
    await expect(processViewerSpotlightEvent(event({ metadata: { simulated: true } }), testRuntime.context, 2_000)).resolves.toBeUndefined();
    await expect(processViewerSpotlightEvent(event(), testRuntime.context, 3_000)).resolves.toMatchObject({ accepted: true });
    await expect(processViewerSpotlightEvent(event({ eventId: 'command-2', source: { eventId: 'provider-2' } }), testRuntime.context, 4_000)).resolves.toEqual({ accepted: false, reason: 'viewer-cooldown' });
  });

  it('publishes a creator-approved aggregate Stream Score without viewer identity', async () => {
    const testRuntime = runtime({ displayMode: 'credits-scroll' }); await viewerSpotlight.start(testRuntime.context);
    await expect(administerViewerSpotlight({ operation: 'stream-score', approvedByCreator: false }, testRuntime.context, 1_000)).resolves.toMatchObject({ accepted: false, reason: 'creator-approval-required' });
    await expect(administerViewerSpotlight({ operation: 'stream-score', approvedByCreator: true }, testRuntime.context, 2_000)).resolves.toMatchObject({ accepted: true, uniqueViewers: 12, interactions: 50 });
    expect(testRuntime.published[0]).toMatchObject({ topic: 'thsv.viewer-spotlight.card.show', payload: { title: 'Stream Score', presentationMode: 'credits-scroll' } });
    expect(JSON.stringify(testRuntime.published[0])).not.toContain('viewer-one');
  });

  it('bounds its queue and persists only pseudonymous cooldown data', async () => {
    const testRuntime = runtime({ viewerCooldownMinutes: 1, maximumQueueSize: 1, globalCooldownSeconds: 60 }); await viewerSpotlight.start(testRuntime.context); await processViewerSpotlightEvent(event(), testRuntime.context, 1_000);
    testRuntime.context.viewerFoundation.getProjection.mockResolvedValue({ contractVersion: '1.0.0', viewerId: 'viewer-two', linked: false, points: 1, level: 1, nextLevelAt: 100 });
    await expect(processViewerSpotlightEvent(event({ eventId: 'command-2', source: { eventId: 'provider-2' }, user: { id: 'different', name: 'Private Name', displayName: 'Private Name', avatarUrl: 'https://example.com/private.png', actorType: 'human', roles: [] } }), testRuntime.context, 2_000)).resolves.toMatchObject({ accepted: true });
    testRuntime.context.viewerFoundation.getProjection.mockResolvedValue({ contractVersion: '1.0.0', viewerId: 'viewer-three', linked: false, points: 1, level: 1, nextLevelAt: 100 });
    await expect(processViewerSpotlightEvent(event({ eventId: 'command-3', source: { eventId: 'provider-3' }, user: { id: 'third', name: 'Third', actorType: 'human', roles: [] } }), testRuntime.context, 3_000)).resolves.toEqual({ accepted: false, reason: 'queue-full' });
    const serialized = JSON.stringify(testRuntime.value()); expect(serialized).toContain('viewer-two'); expect(serialized).not.toContain('Private Name'); expect(serialized).not.toContain('private.png'); expect(serialized).not.toContain('different');
  });

  it('sanitizes hostile saved state to bounded pseudonymous records', () => {
    const state = sanitizeViewerSpotlightState({ cooldowns: Object.fromEntries(Array.from({ length: 700 }, (_, index) => [`viewer-${String(index)}`, index])), lastShownAt: -1, cardsThisSession: 9999 });
    expect(Object.keys(state.cooldowns)).toHaveLength(500); expect(state.lastShownAt).toBe(0); expect(state.cardsThisSession).toBe(500);
  });

  it('queues an explicitly approved manual card without persisting presentation identity', async () => {
    const testRuntime = runtime(); await viewerSpotlight.start(testRuntime.context);
    await expect(administerViewerSpotlight({ operation: 'status' }, testRuntime.context, 1_000)).resolves.toMatchObject({ enabled: true, disclosureAccepted: true, queuedRequests: 0, cardsThisSession: 0 });
    await expect(administerViewerSpotlight({ operation: 'display', platform: 'twitch', userId: '123456', displayName: 'Manual Viewer', avatarUrl: 'https://example.com/manual.png', approvedByCreator: true }, testRuntime.context, 2_000)).resolves.toMatchObject({ operation: 'display', accepted: true, viewerId: 'viewer-one' });
    expect(testRuntime.published[0]).toMatchObject({ topic: 'thsv.viewer-spotlight.card.show', payload: { title: 'Manual Viewer • Twitch', imageUrl: 'https://example.com/manual.png' } });
    const serialized = JSON.stringify(testRuntime.value()); expect(serialized).not.toContain('Manual Viewer'); expect(serialized).not.toContain('manual.png'); expect(serialized).not.toContain('123456');
  });

  it('rejects manual display before queueing when Community Analytics has no viewer observation', async () => {
    const testRuntime = runtime(); testRuntime.context.communityAnalytics.getViewerProjection.mockResolvedValue({ contractVersion: '1.0.0', viewerId: 'viewer-one', observed: false, firstSeenAt: 0, lastSeenAt: 0, sessions: 0, counters: { messages: 0, commands: 0, follows: 0, subscriptions: 0, memberships: 0, giftSubscriptions: 0, gifts: 0, cheers: 0, superChats: 0, raids: 0, rewardRedemptions: 0 }, activeSession: false, activeLastSeenAt: 0 }); await viewerSpotlight.start(testRuntime.context);
    await expect(administerViewerSpotlight({ operation: 'display', platform: 'twitch', userId: '123456', displayName: 'Unobserved Viewer', approvedByCreator: true }, testRuntime.context, 1_000)).resolves.toEqual({ operation: 'display', accepted: false, reason: 'viewer-unobserved' });
    expect(testRuntime.published).toHaveLength(0); expect(JSON.stringify(testRuntime.value())).not.toContain('Unobserved Viewer');
  });

  it('accepts only the configured Twitch reward and settles after the overlay publication', async () => {
    const testRuntime = runtime({ rewardRequestsEnabled: true, rewardId: 'reward-123' }); await viewerSpotlight.start(testRuntime.context);
    const reward = event({ eventType: 'reward.redemption', payload: { rewardId: 'reward-123', redemptionId: 'redeem-1' } });
    await expect(processViewerSpotlightEvent(reward, testRuntime.context, 1_000)).resolves.toMatchObject({ accepted: true });
    expect(testRuntime.published).toHaveLength(1);
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenCalledWith('764a4658-e7fc-4b25-a792-e262759c76b7', { viewerSpotlightRewardOperation: 'fulfill', viewerSpotlightRewardId: 'reward-123', viewerSpotlightRedemptionId: 'redeem-1' });
    await expect(processViewerSpotlightEvent(event({ eventId: 'other', eventType: 'reward.redemption', payload: { rewardId: 'other', redemptionId: 'redeem-2' } }), testRuntime.context, 2_000)).resolves.toBeUndefined();
  });

  it('restores only pseudonymous cooldown state after restart and never replays the prior card', async () => {
    const testRuntime = runtime({ viewerCooldownMinutes: 15 }); await viewerSpotlight.start(testRuntime.context);
    await expect(processViewerSpotlightEvent(event(), testRuntime.context, 1_000)).resolves.toMatchObject({ accepted: true });
    expect(testRuntime.published).toHaveLength(1);
    await viewerSpotlight.stop(testRuntime.context); resetViewerSpotlightRuntime(); await viewerSpotlight.start(testRuntime.context);
    await expect(administerViewerSpotlight({ operation: 'status' }, testRuntime.context, 2_000)).resolves.toMatchObject({ activeCard: false, queuedRequests: 0, cardsThisSession: 1 });
    expect(testRuntime.published).toHaveLength(1);
    await expect(processViewerSpotlightEvent(event({ eventId: 'command-after-restart', source: { eventId: 'provider-after-restart' } }), testRuntime.context, 2_000)).resolves.toEqual({ accepted: false, reason: 'viewer-cooldown' });
  });
});
