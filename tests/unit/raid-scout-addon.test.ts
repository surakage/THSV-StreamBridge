import { afterEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import raidScout, { CONTROLLER_ACTION_ID, filterCandidates, sanitizeState, selectCandidate } from '../../addons/raid-scout/dist/index.js';

const END_BROADCAST_ACTION_ID = '30c8f99d-884b-45f4-8840-cd384e7bddbe';
const RUN_ENDING_AD_ACTION_ID = '18a8de7c-1c5f-4a1e-8d58-7944c74060d5';

const settings = {
  enabled: true,
  autoStartSceneEnabled: false,
  autoStartSceneName: 'Stream Ending',
  preferredChannels: ['alpha', 'beta'],
  viewerSuggestionsEnabled: false,
  viewerSuggestionRewardId: '',
  maximumViewerSuggestions: 20,
  oneViewerSuggestionPerStream: true,
  announceViewerSuggestions: true,
  viewerSuggestionAcceptedMessage: '{viewer}, added {channel}.',
  viewerSuggestionRejectedMessage: '{viewer}, rejected {channel}.',
  usePreferred: true,
  useFollowed: true,
  useCategory: true,
  sourceOrder: ['preferred', 'followed', 'category'],
  maximumPreferredLookups: 20,
  maximumFollowedResults: 25,
  maximumFollowedPages: 2,
  maximumCategoryResults: 25,
  minimumViewers: 1,
  maximumViewers: 1_000,
  allowViewerRangeFallback: true,
  currentAudienceEstimate: 0,
  preferSimilarSize: true,
  minimumAudienceRatio: 0.25,
  maximumAudienceRatio: 2,
  preferredLanguage: 'en',
  requireMatchingLanguage: true,
  excludedChannels: new Set(['blocked']),
  excludedCategories: ['casino'],
  excludedTags: ['spoiler'],
  recentRaidStreams: 7,
  confirmationMode: 'required',
  suggestionExpiryMinutes: 15,
  announceConfirmedRaid: true,
  confirmedRaidMessage: 'Raiding {displayName} in {category}: https://twitch.tv/{login}',
  announceNoCandidate: false,
  noCandidateMessage: 'No destination.',
  showSearchProgress: true,
  showSuggestionCard: false,
  showConfirmedCard: true,
  cardSeconds: 20,
  previewClipBeforeRaid: false,
  pauseOtherVideoOverlays: true,
  clipLookupCount: 20,
  clipPreviewMuted: false,
  clipPreviewVolume: 0.8,
  endBroadcastAfterRaid: false,
  endBroadcastActionId: '',
  endBroadcastTiming: 'after-ad',
  endBroadcastDelaySeconds: 10,
  endBroadcastAdDurationSeconds: 180,
  endBroadcastAdWaitSeconds: 45,
  endBroadcastAdEndBufferSeconds: 3,
  endBroadcastAcknowledged: false,
  overlayBackgroundMode: 'glass',
  overlayBackgroundColor: '#17122b',
  overlayBackgroundOpacity: 0.94,
  overlayAccentColor: '#9146ff',
  overlayTextColor: '#ffffff',
  overlayFontFamily: 'display',
};

function candidate(userId: string, source = 'preferred', overrides: Record<string, unknown> = {}) {
  return {
    userId,
    login: userId,
    displayName: userId.toUpperCase(),
    source,
    category: 'Art',
    title: 'A safe stream',
    viewerCount: 50,
    startedAt: '2026-07-22T12:00:00.000Z',
    language: 'en',
    tags: ['Cozy'],
    thumbnailUrl: 'https://example.com/thumb.jpg',
    profileImageUrl: 'https://example.com/avatar.jpg',
    ...overrides,
  };
}

function runtime(overrides: Record<string, unknown> = {}, initialState: Record<string, unknown> = {}) {
  let state: Record<string, unknown> = initialState;
  let lifecycleListener: ((event: Record<string, unknown>) => void) | undefined;
  let taskSequence = 0;
  const scheduled = new Map<string, () => unknown>();
  let mediaOwner: Record<string, unknown> = {};
  return {
    value: () => state,
    lifecycle: (event: Record<string, unknown>) => lifecycleListener?.(event),
    runScheduled: async () => {
      const tasks = [...scheduled.values()]; scheduled.clear();
      for (const task of tasks) await task();
      // Production timers enqueue I/O work and return immediately so the capability broker's
      // five-second callback budget is never consumed by Twitch or Streamer.bot latency.
      // Give that private promise queue one event-loop turn to settle in the test harness.
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    context: {
      settings: {
        enabled: true,
        autoStartSceneEnabled: false,
        autoStartSceneName: 'Stream Ending',
        preferredChannels: 'alpha\nbeta',
        viewerSuggestionsEnabled: false,
        viewerSuggestionRewardId: '',
        maximumViewerSuggestions: 20,
        oneViewerSuggestionPerStream: true,
        announceViewerSuggestions: true,
        viewerSuggestionAcceptedMessage: '{viewer}, added {channel}.',
        viewerSuggestionRejectedMessage: '{viewer}, rejected {channel}.',
        usePreferred: true,
        useFollowed: true,
        useCategory: true,
        sourceOrder: 'preferred-followed-category',
        maximumPreferredLookups: 20,
        maximumFollowedResults: 25,
        maximumFollowedPages: 2,
        maximumCategoryResults: 25,
        minimumViewers: 1,
        maximumViewers: 1_000,
        allowViewerRangeFallback: true,
        currentAudienceEstimate: 0,
        preferSimilarSize: true,
        minimumAudienceRatio: 0.25,
        maximumAudienceRatio: 2,
        preferredLanguage: 'en',
        requireMatchingLanguage: false,
        excludedChannels: '',
        excludedCategories: '',
        excludedTags: '',
        recentRaidStreams: 7,
        confirmationMode: 'required',
        suggestionExpiryMinutes: 15,
        announceConfirmedRaid: true,
        confirmedRaidMessage: 'Raiding {displayName} in {category}: https://twitch.tv/{login}',
        announceNoCandidate: false,
        noCandidateMessage: 'No destination.',
        showSearchProgress: true,
        showSuggestionCard: false,
        showConfirmedCard: true,
        cardSeconds: 20,
        previewClipBeforeRaid: false,
        pauseOtherVideoOverlays: true,
        clipLookupCount: 20,
        clipPreviewMuted: false,
        clipPreviewVolume: 0.8,
        endBroadcastAfterRaid: false,
        endBroadcastActionId: '',
        endBroadcastTiming: 'after-ad',
        endBroadcastDelaySeconds: 10,
        endBroadcastAdDurationSeconds: 180,
        endBroadcastAdWaitSeconds: 45,
        endBroadcastAdEndBufferSeconds: 3,
        endBroadcastAcknowledged: false,
        overlayBackgroundMode: 'glass',
        overlayBackgroundColor: '#17122b',
        overlayBackgroundOpacity: 0.94,
        overlayAccentColor: '#9146ff',
        overlayTextColor: '#ffffff',
        overlayFontFamily: 'display',
        ...overrides,
      },
      approvedActionIds: [CONTROLLER_ACTION_ID],
      state: { read: vi.fn(async () => state), write: vi.fn(async (value) => { state = value; }) },
      streamerbot: { runApprovedAction: vi.fn(async () => {}) },
      viewerFoundation: { getProjection: vi.fn(async () => ({ viewerId: 'viewer-points', currencyName: 'Village Points' })), mutate: vi.fn(async () => ({ applied: true })) },
      chat: { send: vi.fn(async () => []) },
      overlay: {
        publish: vi.fn(async () => {}),
        onLifecycle: vi.fn((listener) => { lifecycleListener = listener; return () => { lifecycleListener = undefined; }; }),
      },
      mediaSlot: {
        current: vi.fn(() => mediaOwner),
        acquire: vi.fn(async () => {
          mediaOwner = { ownerModuleId: 'thsv.raid-scout', leaseId: '11111111-1111-4111-8111-111111111111', priority: 100, expiresAt: new Date(Date.now() + 600_000).toISOString() };
          return { acquired: true, ...mediaOwner };
        }),
        release: vi.fn(async () => { mediaOwner = {}; return true; }),
        onChange: vi.fn(() => () => undefined),
      },
      mediaCache: {
        fetch: vi.fn(async () => ({ url: '/overlay/cache/raid-clip.mp4', cacheHit: false, bytes: 1024, expiresAt: new Date(Date.now() + 3_600_000).toISOString() })),
      },
      schedule: {
        after: vi.fn((_delay: number, task: () => unknown) => { const id = `task-${String(++taskSequence)}`; scheduled.set(id, task); return id; }),
        cancel: vi.fn((id: string) => scheduled.delete(id)),
      },
    },
  };
}

function control(action: string) {
  return {
    eventType: 'addon.thsv.raid-scout.control',
    platform: 'system',
    payload: { action },
    metadata: { simulated: false },
  };
}

function viewerSuggestionEvent(input: string, userId = 'viewer-1', skipsQueue = false) {
  return {
    eventId: `suggestion-${userId}-${input}`,
    eventType: 'reward.redemption',
    platform: 'twitch',
    source: { eventId: `redemption-${userId}-${input}` },
    user: { id: userId, name: userId, displayName: 'Viewer One', roles: [], actorType: 'human' },
    payload: {
      rewardId: 'raid-suggestion-reward', rewardTitle: 'Suggest a Raid', rewardCost: 500,
      redemptionId: `redemption-${userId}-${input}`, input, verifiedTransport: true, skipsQueue,
      supportedOperations: skipsQueue ? [] : ['fulfill', 'cancel'],
    },
    metadata: { simulated: false },
  };
}

afterEach(async () => {
  await raidScout.stop({});
});

describe('Raid Scout add-on', () => {
  it('filters own, blocked, recent, language, category, tag, and viewer mismatches', () => {
    const state = sanitizeState({
      streamCycle: 10,
      history: [{ candidate: candidate('recent'), at: new Date().toISOString(), status: 'confirmed', streamCycle: 8 }],
    });
    const eligible = filterCandidates([
      candidate('owner'),
      candidate('blocked'),
      candidate('recent'),
      candidate('offline-size', 'preferred', { viewerCount: 0 }),
      candidate('wrong-language', 'preferred', { language: 'fr' }),
      candidate('wrong-category', 'preferred', { category: 'Casino Slots' }),
      candidate('wrong-tag', 'preferred', { tags: ['Spoilers'] }),
      candidate('safe'),
    ], state, settings, { userId: 'owner', login: 'owner' });
    expect(eligible.map((item: { userId: string }) => item.userId)).toEqual(['safe']);
  });

  it('uses the first eligible tier and consumes a persisted shuffle bag without repeats', () => {
    const state = sanitizeState({ bags: { preferred: ['alpha', 'beta'], followed: [], category: [] } });
    const candidates = [candidate('alpha'), candidate('beta'), candidate('gamma', 'followed')];
    const first = selectCandidate(candidates, state, settings, 50);
    expect(first.candidate?.userId).toBe('alpha');
    const secondState = { ...state, bags: first.bags, suggestion: { candidate: first.candidate } };
    const second = selectCandidate(candidates, secondState, settings, 50);
    expect(second.candidate?.userId).toBe('beta');
  });

  it('keeps the normal viewer ceiling strict unless the bounded fallback is explicitly requested', () => {
    const state = sanitizeState({});
    const candidates = [
      candidate('nearby', 'category', { viewerCount: 35 }),
      candidate('wrong_language', 'category', { viewerCount: 36, language: 'fr' }),
      candidate('too_large', 'category', { viewerCount: 75 }),
    ];
    const strictSettings = { ...settings, maximumViewers: 30 };
    expect(filterCandidates(candidates, state, strictSettings, { userId: 'owner', login: 'owner' })).toEqual([]);
    expect(filterCandidates(candidates, state, strictSettings, { userId: 'owner', login: 'owner' }, { ignoreMaximumViewers: true })
      .map((item: { userId: string }) => item.userId)).toEqual(['nearby', 'too_large']);
  });

  it('uses the closest bounded viewer fallback and continues an automatic ending flow', async () => {
    const testRuntime = runtime({
      maximumViewers: 30,
      allowViewerRangeFallback: true,
      confirmationMode: 'automatic',
      showSearchProgress: false,
    });
    await raidScout.start(testRuntime.context);
    await raidScout.onEvent(control('suggest'), testRuntime.context);
    const discoverPending = testRuntime.value().pending as { requestId: string };
    await raidScout.onEvent({
      eventType: 'addon.thsv.raid-scout.controller-result', platform: 'system', metadata: { simulated: false },
      payload: {
        operation: 'discover', requestId: discoverPending.requestId, success: true,
        broadcasterUserId: 'owner', broadcasterLogin: 'owner', currentAudience: 7,
        candidates: [
          candidate('closest', 'category', { viewerCount: 35 }),
          candidate('also_close', 'category', { viewerCount: 39 }),
          candidate('too_large', 'category', { viewerCount: 75 }),
        ],
      },
    }, testRuntime.context);
    expect(testRuntime.value().suggestion).toMatchObject({ candidate: { userId: expect.stringMatching(/^(closest|also_close)$/) } });
    expect(testRuntime.value().pending).toMatchObject({ operation: 'raid' });
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenLastCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({ raidScoutOperation: 'raid' }));
    expect(testRuntime.context.overlay.publish).toHaveBeenCalledWith('thsv.raid-scout.card.show', expect.objectContaining({ title: 'CLOSEST SAFE MATCH' }), { lane: 'foreground' });
  });

  it('fulfills and adds a bounded viewer suggestion, searches it first, and clears it after stream offline', async () => {
    const testRuntime = runtime({
      viewerSuggestionsEnabled: true,
      viewerSuggestionRewardId: 'raid-suggestion-reward',
      announceViewerSuggestions: true,
    });
    await raidScout.start(testRuntime.context);
    await raidScout.onEvent(viewerSuggestionEvent('https://twitch.tv/suggested_channel'), testRuntime.context);
    const pending = (testRuntime.value().pendingViewerSuggestions as Array<{ requestId: string }>)[0];
    expect(testRuntime.value().viewerSuggestions).toEqual([]);
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({
      raidScoutOperation: 'redemption-fulfill',
      raidScoutRewardId: 'raid-suggestion-reward',
      raidScoutRedemptionId: 'redemption-viewer-1-https://twitch.tv/suggested_channel',
    }));

    await raidScout.onEvent({
      eventType: 'addon.thsv.raid-scout.controller-result', platform: 'system',
      payload: { operation: 'redemption-fulfill', requestId: pending?.requestId, success: true },
      metadata: { simulated: false },
    }, testRuntime.context);
    expect(testRuntime.value().viewerSuggestions).toEqual([expect.objectContaining({ login: 'suggested_channel', userId: 'twitch:viewer-1' })]);
    expect(testRuntime.context.chat.send).toHaveBeenCalledWith(expect.objectContaining({ message: 'Viewer One, added suggested_channel.' }));

    await raidScout.onEvent(control('suggest'), testRuntime.context);
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenLastCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({
      raidScoutOperation: 'discover', raidScoutPreferredChannels: 'suggested_channel,alpha,beta', raidScoutUsePreferred: true,
    }));

    await raidScout.onEvent({ eventType: 'stream.offline', platform: 'twitch', metadata: { simulated: false } }, testRuntime.context);
    expect(testRuntime.value().viewerSuggestions).toEqual([]);
    expect(testRuntime.value().pendingViewerSuggestions).toEqual([]);
  });

  it('refunds invalid or duplicate viewer suggestions without changing the stream list', async () => {
    const testRuntime = runtime({
      viewerSuggestionsEnabled: true,
      viewerSuggestionRewardId: 'raid-suggestion-reward',
      announceViewerSuggestions: false,
    });
    await raidScout.start(testRuntime.context);
    await raidScout.onEvent(viewerSuggestionEvent('not a twitch login'), testRuntime.context);
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({
      raidScoutOperation: 'redemption-cancel',
    }));
    expect(testRuntime.value().viewerSuggestions).toEqual([]);

    await raidScout.onEvent(viewerSuggestionEvent('alpha', 'viewer-2'), testRuntime.context);
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenLastCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({
      raidScoutOperation: 'redemption-cancel',
      raidScoutRedemptionId: 'redemption-viewer-2-alpha',
    }));
    expect(testRuntime.value().viewerSuggestions).toEqual([]);
  });

  it('accepts a Kick reward directly and spends points for a YouTube suggestion', async () => {
    const kickRuntime = runtime({ viewerSuggestionsEnabled: true, kickViewerSuggestionRewardId: 'kick-raid-suggestion' });
    await raidScout.start(kickRuntime.context);
    const kickBase = viewerSuggestionEvent('kick_creator', 'kick-viewer');
    await raidScout.onEvent({ ...kickBase, platform: 'kick', payload: { ...kickBase.payload, rewardId: 'kick-raid-suggestion', supportedOperations: [] } }, kickRuntime.context);
    expect(kickRuntime.value().viewerSuggestions).toEqual([expect.objectContaining({ login: 'kick_creator', userId: 'kick:kick-viewer' })]);
    expect(kickRuntime.context.streamerbot.runApprovedAction).not.toHaveBeenCalled();

    await raidScout.stop(kickRuntime.context);
    const youtubeRuntime = runtime({ viewerSuggestionsEnabled: true, viewerSuggestionCommand: 'raidsuggest', viewerSuggestionPointsCost: 50 });
    await raidScout.start(youtubeRuntime.context);
    await raidScout.onEvent({ eventId: 'youtube-raid-suggestion-1', eventType: 'command.received', platform: 'youtube', source: { eventId: 'youtube-raid-suggestion-1' }, user: { id: 'youtube-viewer', name: 'viewer', displayName: 'YouTube Viewer', roles: [], actorType: 'human' }, payload: { command: 'raidsuggest', arguments: ['youtube_creator'] }, metadata: { simulated: false } }, youtubeRuntime.context);
    expect(youtubeRuntime.value().viewerSuggestions).toEqual([expect.objectContaining({ login: 'youtube_creator', userId: 'youtube:youtube-viewer' })]);
    expect(youtubeRuntime.context.viewerFoundation.mutate).toHaveBeenCalledWith(expect.objectContaining({ operation: 'spend', amount: 50, viewerId: 'viewer-points' }));
  });

  it('suggests first, then starts only the correlated creator-confirmed target', async () => {
    const testRuntime = runtime();
    await raidScout.onEvent(control('suggest'), testRuntime.context);
    const discoverPending = testRuntime.value().pending as { requestId: string };
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({
      raidScoutOperation: 'discover',
      raidScoutPreferredChannels: 'alpha,beta',
      raidScoutMaximumFollowedPages: 2,
    }));

    await raidScout.onEvent({
      eventType: 'addon.thsv.raid-scout.controller-result',
      platform: 'system',
      payload: {
        operation: 'discover',
        requestId: discoverPending.requestId,
        success: true,
        broadcasterUserId: 'owner',
        broadcasterLogin: 'owner',
        currentAudience: 50,
        candidates: [candidate('alpha')],
      },
      metadata: { simulated: false },
    }, testRuntime.context);
    expect(testRuntime.value().suggestion).toMatchObject({ candidate: { userId: 'alpha', source: 'preferred' } });
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenCalledTimes(1);

    await raidScout.onEvent(control('confirm'), testRuntime.context);
    const raidPending = testRuntime.value().pending as { requestId: string };
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenLastCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({
      raidScoutOperation: 'raid',
      raidScoutTargetLogin: 'alpha',
      raidScoutTargetUserId: 'alpha',
    }));

    await raidScout.onEvent({
      eventType: 'addon.thsv.raid-scout.controller-result',
      platform: 'system',
      payload: { operation: 'raid', requestId: raidPending.requestId, success: true, error: '' },
      metadata: { simulated: false },
    }, testRuntime.context);
    expect(testRuntime.value().suggestion).toBeUndefined();
    expect(testRuntime.value().history).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'confirmed', candidate: expect.objectContaining({ userId: 'alpha' }) }),
    ]));
    expect(testRuntime.context.chat.send).toHaveBeenCalledWith(expect.objectContaining({
      sourcePlatform: 'twitch',
      message: 'Raiding ALPHA in Art: https://twitch.tv/alpha',
    }));
    expect(testRuntime.context.overlay.publish).toHaveBeenCalledWith('thsv.raid-scout.card.show', expect.objectContaining({
      title: 'NEXT STOP',
      imageUrl: 'https://example.com/avatar.jpg',
    }), { lane: 'foreground' });
  });

  it('runs the streamlined Finish Stream control through discovery and automatic confirmation', async () => {
    const testRuntime = runtime({ previewClipBeforeRaid: false, endBroadcastAfterRaid: false });
    await raidScout.start(testRuntime.context);
    await raidScout.onEvent(control('finish'), testRuntime.context);
    const discoverPending = testRuntime.value().pending as { requestId: string; autoConfirm: boolean };
    expect(discoverPending).toMatchObject({ autoConfirm: true });
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({ raidScoutOperation: 'discover' }));

    await raidScout.onEvent({
      eventType: 'addon.thsv.raid-scout.controller-result', platform: 'system', metadata: { simulated: false },
      payload: {
        operation: 'discover', requestId: discoverPending.requestId, success: true,
        broadcasterUserId: 'owner', broadcasterLogin: 'owner', currentAudience: 50,
        candidates: [candidate('finish_target')],
      },
    }, testRuntime.context);
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenLastCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({
      raidScoutOperation: 'raid', raidScoutTargetLogin: 'finish_target',
    }));
    expect(testRuntime.value().pending).toMatchObject({ operation: 'raid' });
  });

  it('starts the ending ad as Suggest begins and keeps discovery independent from the ad result', async () => {
    const initial = sanitizeState({ twitchLive: true });
    const testRuntime = runtime({
      endBroadcastAfterRaid: true,
      endBroadcastActionId: END_BROADCAST_ACTION_ID,
      endBroadcastTiming: 'after-ad',
      endBroadcastAdDurationSeconds: 180,
      endBroadcastAcknowledged: true,
    }, initial as Record<string, unknown>);
    testRuntime.context.approvedActionIds.push(RUN_ENDING_AD_ACTION_ID, END_BROADCAST_ACTION_ID);
    await raidScout.start(testRuntime.context);
    await raidScout.onEvent(control('suggest'), testRuntime.context);

    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenNthCalledWith(1, RUN_ENDING_AD_ACTION_ID, expect.objectContaining({
      raidScoutOperation: 'run-ending-ad', raidScoutAdDurationSeconds: 180,
    }));
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenNthCalledWith(2, CONTROLLER_ACTION_ID, expect.objectContaining({ raidScoutOperation: 'discover' }));
    const state = testRuntime.value() as { pending: { operation: string; requestId: string }; raidFlowAdRequestId: string };
    expect(state.pending.operation).toBe('discover');

    await raidScout.onEvent({
      eventType: 'addon.thsv.raid-scout.controller-result', platform: 'system', metadata: { simulated: false },
      payload: { operation: 'ending-ad-request', requestId: state.raidFlowAdRequestId, success: false, error: 'Commercial unavailable.' },
    }, testRuntime.context);
    expect(testRuntime.value()).toMatchObject({ pending: { operation: 'discover' }, raidFlowAdRequestFailed: true });
  });

  it('binds the real Suggest-time ad through confirmation and clip playback without requesting another ad', async () => {
    let now = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const testRuntime = runtime({
      confirmationMode: 'required', previewClipBeforeRaid: true, showSearchProgress: false,
      endBroadcastAfterRaid: true, endBroadcastActionId: END_BROADCAST_ACTION_ID,
      endBroadcastTiming: 'after-ad', endBroadcastAdDurationSeconds: 30, endBroadcastAcknowledged: true,
    }, sanitizeState({ twitchLive: true }) as Record<string, unknown>);
    testRuntime.context.approvedActionIds.push(RUN_ENDING_AD_ACTION_ID, END_BROADCAST_ACTION_ID);
    await raidScout.start(testRuntime.context);
    await raidScout.onEvent(control('suggest'), testRuntime.context);
    const discover = testRuntime.value().pending as { requestId: string };
    await raidScout.onEvent({ eventType: 'addon.thsv.ad-break-companion.started', platform: 'twitch', metadata: { simulated: false }, payload: { adLength: 30 } }, testRuntime.context);
    await raidScout.onEvent({
      eventType: 'addon.thsv.raid-scout.controller-result', platform: 'system', metadata: { simulated: false },
      payload: { operation: 'discover', requestId: discover.requestId, success: true, broadcasterUserId: 'owner', broadcasterLogin: 'owner', currentAudience: 50, candidates: [candidate('preflight_target')] },
    }, testRuntime.context);
    await raidScout.onEvent(control('confirm'), testRuntime.context);
    const clip = testRuntime.value().pending as { requestId: string };
    await raidScout.onEvent({
      eventType: 'addon.thsv.raid-scout.controller-result', platform: 'system', metadata: { simulated: false },
      payload: { operation: 'clip', requestId: clip.requestId, success: true, clips: [{ id: 'preflight-clip', embedUrl: 'https://clips.twitch.tv/embed?clip=preflight-clip', durationSeconds: 35 }] },
    }, testRuntime.context);
    const download = testRuntime.value().pending as { requestId: string };
    await raidScout.onEvent({
      eventType: 'addon.thsv.raid-scout.controller-result', platform: 'system', metadata: { simulated: false },
      payload: { operation: 'clip-download', requestId: download.requestId, success: true },
    }, testRuntime.context);
    const playback = testRuntime.value().pending as { playbackId: string };
    now += 35_000;
    testRuntime.lifecycle({ playbackId: playback.playbackId, phase: 'ended', occurredAt: new Date(now).toISOString() });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({ raidScoutOperation: 'raid' }));
    const approvedActionCalls = testRuntime.context.streamerbot.runApprovedAction.mock.calls as unknown as Array<[string, unknown]>;
    expect(approvedActionCalls.filter(([id]) => id === RUN_ENDING_AD_ACTION_ID)).toHaveLength(1);
  });

  it('recovers bounded controller timeouts without leaving Raid Scout stuck', async () => {
    const discovery = runtime();
    await raidScout.start(discovery.context);
    await raidScout.onEvent(control('suggest'), discovery.context);
    await discovery.runScheduled();
    expect(discovery.value().pending).toBeUndefined();
    expect(discovery.value().lastError).toContain('safety timeout');
    expect(discovery.context.overlay.publish).toHaveBeenCalledWith('thsv.raid-scout.card.show', expect.objectContaining({ title: 'SEARCH TIMED OUT' }), { lane: 'foreground' });

    await raidScout.stop(discovery.context);
    const clipInitial = sanitizeState({ suggestion: { candidate: candidate('clip_timeout'), suggestedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() } });
    const clip = runtime({ previewClipBeforeRaid: true }, clipInitial as Record<string, unknown>);
    await raidScout.start(clip.context);
    await raidScout.onEvent(control('confirm'), clip.context);
    await clip.runScheduled();
    expect(clip.context.streamerbot.runApprovedAction).toHaveBeenLastCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({ raidScoutOperation: 'raid' }));
    expect(clip.value().pending).toMatchObject({ operation: 'raid' });
  });

  it('starts one search per live stream when OBS enters the configured ending scene', async () => {
    const testRuntime = runtime({ autoStartSceneEnabled: true, autoStartSceneName: '📁 Stream Ending' });
    await raidScout.start(testRuntime.context);
    await raidScout.onEvent({ eventType: 'stream.online', platform: 'twitch', metadata: { simulated: false } }, testRuntime.context);
    await raidScout.onEvent({ eventType: 'stream.scene-changed', platform: 'system', payload: { provider: 'obs', sceneName: 'Gameplay' }, metadata: { simulated: false } }, testRuntime.context);
    expect(testRuntime.context.streamerbot.runApprovedAction).not.toHaveBeenCalled();

    const endingScene = { eventType: 'stream.scene-changed', platform: 'system', payload: { provider: 'obs', sceneName: '📁 Stream Ending' }, metadata: { simulated: false } };
    await raidScout.onEvent(endingScene, testRuntime.context);
    await raidScout.onEvent(endingScene, testRuntime.context);
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenCalledTimes(1);
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({ raidScoutOperation: 'discover' }));
    expect(testRuntime.value()).toMatchObject({ twitchLive: true, streamCycle: 1, autoSceneStartedCycle: 1, pending: { operation: 'discover' } });

    await raidScout.onEvent({ eventType: 'stream.offline', platform: 'twitch', metadata: { simulated: false } }, testRuntime.context);
    expect(testRuntime.value().twitchLive).toBe(false);
  });

  it('finishes a phased no-match search without treating card duration as a callback', async () => {
    const testRuntime = runtime({ showSearchProgress: true, announceNoCandidate: false });
    await raidScout.onEvent(control('suggest'), testRuntime.context);
    const discoverPending = testRuntime.value().pending as { requestId: string };
    await raidScout.onEvent({
      eventType: 'addon.thsv.raid-scout.controller-result', platform: 'system', metadata: { simulated: false },
      payload: {
        operation: 'discover', requestId: discoverPending.requestId, success: true,
        broadcasterUserId: 'owner', broadcasterLogin: 'owner', currentAudience: 50, candidates: [],
        sourceResults: [
          { source: 'preferred', status: 'none', candidateCount: 0 },
          { source: 'followed', status: 'none', candidateCount: 0 },
          { source: 'category', status: 'none', candidateCount: 0 },
        ],
      },
    }, testRuntime.context);
    await expect(testRuntime.runScheduled()).resolves.toBeUndefined();
    expect(testRuntime.context.overlay.publish).toHaveBeenCalledWith('thsv.raid-scout.card.show', expect.objectContaining({
      title: 'NO SAFE MATCH', durationMs: 5_000,
    }), { lane: 'foreground' });
  });

  it('does not dispatch simulated controls or confirm an expired suggestion', async () => {
    const expired = sanitizeState({
      suggestion: {
        candidate: candidate('alpha'),
        suggestedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-01-01T00:01:00.000Z',
      },
    });
    const testRuntime = runtime({}, expired as Record<string, unknown>);
    await raidScout.onEvent({ ...control('suggest'), metadata: { simulated: true } }, testRuntime.context);
    expect(testRuntime.context.streamerbot.runApprovedAction).not.toHaveBeenCalled();
    await raidScout.onEvent(control('confirm'), testRuntime.context);
    expect(testRuntime.context.streamerbot.runApprovedAction).not.toHaveBeenCalled();
    expect(testRuntime.value().lastError).toContain('expired');
  });

  it('plays one bounded clip after confirmation and raids when the preview completes', async () => {
    const initial = sanitizeState({
      suggestion: { candidate: candidate('alpha'), suggestedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() },
    });
    const testRuntime = runtime({ previewClipBeforeRaid: true, showSearchProgress: false }, initial as Record<string, unknown>);
    await raidScout.start(testRuntime.context);
    await raidScout.onEvent(control('confirm'), testRuntime.context);
    const clipPending = testRuntime.value().pending as { requestId: string };
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenLastCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({
      raidScoutOperation: 'clip', raidScoutTargetUserId: 'alpha', raidScoutClipLookupCount: 20,
    }));
    await raidScout.onEvent({
      eventType: 'addon.thsv.raid-scout.controller-result', platform: 'system', metadata: { simulated: false },
      payload: { operation: 'clip', requestId: clipPending.requestId, success: true, clips: [{ id: 'clip-1', embedUrl: 'https://clips.twitch.tv/embed?clip=clip-1', title: 'A clip', thumbnailUrl: 'https://example.com/clip.jpg', durationSeconds: 12 }] },
    }, testRuntime.context);
    const downloadPending = testRuntime.value().pending as { requestId: string };
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenLastCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({ raidScoutOperation: 'clip-download', raidScoutClipId: 'clip-1' }));
    await raidScout.onEvent({
      eventType: 'addon.thsv.raid-scout.controller-result', platform: 'system', metadata: { simulated: false },
      payload: { operation: 'clip-download', requestId: downloadPending.requestId, success: true, clipId: 'clip-1', landscapeUrl: 'https://clips-media-assets2.twitch.tv/clip-1.mp4' },
    }, testRuntime.context);
    const playback = testRuntime.value().pending as { playbackId: string; durationMs: number };
    expect(testRuntime.context.mediaCache.fetch).not.toHaveBeenCalled();
    expect(testRuntime.context.overlay.publish).toHaveBeenCalledWith('thsv.raid-scout.card.hide', {}, { lane: 'foreground' });
    expect(testRuntime.context.overlay.publish).toHaveBeenCalledWith('thsv.raid-scout.media.play', expect.objectContaining({ embedUrl: 'https://clips.twitch.tv/embed?clip=clip-1', durationMs: 12_000 }), { lane: 'media' });
    expect(testRuntime.context.mediaSlot.acquire).toHaveBeenCalledWith({ durationMs: 600_000, priority: 100 });
    expect(playback.durationMs).toBe(12_000);
    expect(testRuntime.context.schedule.after).toHaveBeenLastCalledWith(30_000, expect.any(Function));
    testRuntime.lifecycle({ playbackId: playback.playbackId, phase: 'started', occurredAt: new Date().toISOString() });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(testRuntime.context.streamerbot.runApprovedAction).not.toHaveBeenLastCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({ raidScoutOperation: 'raid' }));
    expect(testRuntime.context.schedule.after).toHaveBeenLastCalledWith(24_000, expect.any(Function));
    testRuntime.lifecycle({ playbackId: playback.playbackId, phase: 'ended', occurredAt: new Date().toISOString() });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenLastCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({ raidScoutOperation: 'raid', raidScoutTargetLogin: 'alpha' }));
  });

  it('uses the first returned Twitch embed when no direct download URL is available', async () => {
    const initial = sanitizeState({
      suggestion: { candidate: candidate('alpha'), suggestedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() },
    });
    const testRuntime = runtime({ previewClipBeforeRaid: true, showSearchProgress: false }, initial as Record<string, unknown>);
    await raidScout.start(testRuntime.context);
    await raidScout.onEvent(control('confirm'), testRuntime.context);
    const clipPending = testRuntime.value().pending as { requestId: string };
    await raidScout.onEvent({
      eventType: 'addon.thsv.raid-scout.controller-result', platform: 'system', metadata: { simulated: false },
      payload: { operation: 'clip', requestId: clipPending.requestId, success: true, clips: [
        { id: 'clip-a', embedUrl: 'https://clips.twitch.tv/embed?clip=clip-a', durationSeconds: 12 },
        { id: 'clip-b', embedUrl: 'https://clips.twitch.tv/embed?clip=clip-b', durationSeconds: 14 },
      ] },
    }, testRuntime.context);
    const first = testRuntime.value().pending as { requestId: string; clip: { id: string } };
    await raidScout.onEvent({
      eventType: 'addon.thsv.raid-scout.controller-result', platform: 'system', metadata: { simulated: false },
      payload: { operation: 'clip-download', requestId: first.requestId, success: false, clipId: first.clip.id, error: 'No playable URL.' },
    }, testRuntime.context);
    expect(testRuntime.context.overlay.publish).toHaveBeenCalledWith('thsv.raid-scout.media.play', expect.objectContaining({
      embedUrl: `https://clips.twitch.tv/embed?clip=${first.clip.id}`,
    }), { lane: 'media' });
    expect(testRuntime.value().pending).toMatchObject({ operation: 'clip-playback' });
  });

  it('prefers the Twitch embed over a derived thumbnail media URL when Streamer.bot returns no clip URL', async () => {
    const pending = {
      operation: 'clip-download', requestId: 'clip-download-fallback', startedAt: Date.now(), candidate: candidate('alpha'),
      clip: { id: 'clip-fallback', embedUrl: 'https://clips.twitch.tv/embed?clip=clip-fallback', durationSeconds: 12, thumbnailUrl: 'https://clips-media-assets2.twitch.tv/clip-fallback-preview-480x272.jpg' },
      remainingClips: [],
    };
    const testRuntime = runtime({ previewClipBeforeRaid: true }, sanitizeState({ pending }) as Record<string, unknown>);
    await raidScout.onEvent({
      eventType: 'addon.thsv.raid-scout.controller-result', platform: 'system', metadata: { simulated: false },
      payload: { operation: 'clip-download', requestId: pending.requestId, success: false, error: 'No playable URL.' },
    }, testRuntime.context);
    expect(testRuntime.context.mediaCache.fetch).not.toHaveBeenCalled();
    expect(testRuntime.context.overlay.publish).toHaveBeenCalledWith('thsv.raid-scout.media.play', expect.objectContaining({
      embedUrl: 'https://clips.twitch.tv/embed?clip=clip-fallback',
    }), { lane: 'media' });
    expect(testRuntime.value().pending).toMatchObject({ operation: 'clip-playback' });
  });

  it('falls back to Twitch clip embed playback for current VAP thumbnails', async () => {
    const pending = {
      operation: 'clip-download', requestId: 'clip-download-vap', startedAt: Date.now(), candidate: candidate('alpha'),
      clip: {
        id: 'clip-vap', embedUrl: 'https://clips.twitch.tv/embed?clip=clip-vap', durationSeconds: 28,
        thumbnailUrl: 'https://static-cdn.jtvnw.net/twitch-video-assets/twitch-vap-video-assets-prod-us-west-2/example/landscape/thumb/thumb-0000000000-480x272.jpg',
      },
      remainingClips: [],
    };
    const testRuntime = runtime({ previewClipBeforeRaid: true }, sanitizeState({ pending }) as Record<string, unknown>);
    await raidScout.onEvent({
      eventType: 'addon.thsv.raid-scout.controller-result', platform: 'system', metadata: { simulated: false },
      payload: { operation: 'clip-download', requestId: pending.requestId, success: false, error: 'No playable URL.' },
    }, testRuntime.context);
    expect(testRuntime.context.mediaCache.fetch).not.toHaveBeenCalled();
    expect(testRuntime.context.overlay.publish).toHaveBeenCalledWith('thsv.raid-scout.media.play', expect.objectContaining({
      embedUrl: 'https://clips.twitch.tv/embed?clip=clip-vap', durationMs: 28_000,
    }), { lane: 'media' });
    expect(testRuntime.value().pending).toMatchObject({ operation: 'clip-playback' });
  });

  it('waits for Twitch to confirm the ending ad before dispatching the confirmed raid', async () => {
    const initial = sanitizeState({
      suggestion: { candidate: candidate('gamma'), suggestedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() },
    });
    const testRuntime = runtime({
      previewClipBeforeRaid: false, endBroadcastAfterRaid: true, endBroadcastActionId: END_BROADCAST_ACTION_ID,
      endBroadcastTiming: 'after-ad', endBroadcastAdDurationSeconds: 180, endBroadcastAcknowledged: true,
    }, initial as Record<string, unknown>);
    testRuntime.context.approvedActionIds.push(RUN_ENDING_AD_ACTION_ID, END_BROADCAST_ACTION_ID);
    await raidScout.start(testRuntime.context);
    await raidScout.onEvent(control('confirm'), testRuntime.context);
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(RUN_ENDING_AD_ACTION_ID, expect.objectContaining({
      raidScoutOperation: 'run-ending-ad', raidScoutTargetLogin: 'gamma',
    }));
    expect(testRuntime.context.streamerbot.runApprovedAction).not.toHaveBeenCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({ raidScoutOperation: 'raid' }));
    await raidScout.onEvent({
      eventType: 'addon.thsv.ad-break-companion.started', platform: 'system', metadata: { simulated: false }, payload: { adLength: 180 },
    }, testRuntime.context);
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({
      raidScoutOperation: 'raid', raidScoutTargetLogin: 'gamma',
    }));
    expect(testRuntime.value()).toMatchObject({ lastAdStartedAt: expect.any(Number), pending: { operation: 'raid' } });
  });

  it('continues the raid immediately and leaves the broadcast live when Twitch rejects the ending ad request', async () => {
    const initial = sanitizeState({
      suggestion: { candidate: candidate('ad_fallback'), suggestedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() },
    });
    const testRuntime = runtime({
      previewClipBeforeRaid: false, endBroadcastAfterRaid: true, endBroadcastActionId: END_BROADCAST_ACTION_ID,
      endBroadcastTiming: 'after-ad', endBroadcastAcknowledged: true,
    }, initial as Record<string, unknown>);
    testRuntime.context.approvedActionIds.push(RUN_ENDING_AD_ACTION_ID, END_BROADCAST_ACTION_ID);
    await raidScout.start(testRuntime.context);
    await raidScout.onEvent(control('confirm'), testRuntime.context);
    const waiting = testRuntime.value().pending as { requestId: string };
    await raidScout.onEvent({
      eventType: 'addon.thsv.raid-scout.controller-result', platform: 'system', metadata: { simulated: false },
      payload: { operation: 'ending-ad-request', requestId: waiting.requestId, success: false, error: 'Twitch reported the channel offline.' },
    }, testRuntime.context);
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenLastCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({ raidScoutOperation: 'raid', raidScoutTargetLogin: 'ad_fallback' }));
    expect(testRuntime.value()).toMatchObject({ pending: { operation: 'raid' }, lastError: '' });
    expect(testRuntime.context.streamerbot.runApprovedAction).not.toHaveBeenCalledWith(END_BROADCAST_ACTION_ID, expect.anything());
  });

  it('requests its own ending ad when the prior ad had already finished before Raid Scout began', async () => {
    const now = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const initial = sanitizeState({
      lastAdStartedAt: now - 90_000,
      lastAdEndsAt: now - 30_000,
      suggestion: { candidate: candidate('gamma'), suggestedAt: new Date(now).toISOString(), expiresAt: new Date(now + 60_000).toISOString() },
    });
    const testRuntime = runtime({
      previewClipBeforeRaid: false, endBroadcastAfterRaid: true, endBroadcastActionId: END_BROADCAST_ACTION_ID,
      endBroadcastTiming: 'after-ad', endBroadcastAdDurationSeconds: 180, endBroadcastAcknowledged: true,
    }, initial as Record<string, unknown>);
    testRuntime.context.approvedActionIds.push(RUN_ENDING_AD_ACTION_ID, END_BROADCAST_ACTION_ID);
    await raidScout.start(testRuntime.context);
    await raidScout.onEvent(control('confirm'), testRuntime.context);
    expect(testRuntime.value()).toMatchObject({ raidFlowAdEndsAt: 0, pending: { operation: 'raid-waiting-for-ad' } });
    expect(testRuntime.context.streamerbot.runApprovedAction).not.toHaveBeenCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({ raidScoutOperation: 'raid' }));
    expect(testRuntime.context.schedule.after).toHaveBeenCalledWith(395_000, expect.any(Function));
    await testRuntime.runScheduled();
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(RUN_ENDING_AD_ACTION_ID, expect.objectContaining({
      raidScoutOperation: 'run-ending-ad', raidScoutTargetLogin: 'gamma',
    }));
  });

  it('reuses an ad that finished during clip playback and ends after the accepted raid without requesting another ad', async () => {
    let now = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const initial = sanitizeState({
      twitchLive: true,
      suggestion: { candidate: candidate('gamma'), suggestedAt: new Date(now).toISOString(), expiresAt: new Date(now + 60_000).toISOString() },
    });
    const testRuntime = runtime({
      previewClipBeforeRaid: true, showSearchProgress: false,
      endBroadcastAfterRaid: true, endBroadcastActionId: END_BROADCAST_ACTION_ID,
      endBroadcastTiming: 'after-ad', endBroadcastAdDurationSeconds: 30, endBroadcastAcknowledged: true,
    }, initial as Record<string, unknown>);
    testRuntime.context.approvedActionIds.push(RUN_ENDING_AD_ACTION_ID, END_BROADCAST_ACTION_ID);
    await raidScout.start(testRuntime.context);
    await raidScout.onEvent({ eventType: 'addon.thsv.ad-break-companion.started', platform: 'twitch', metadata: { simulated: false }, payload: { adLength: 30 } }, testRuntime.context);
    await raidScout.onEvent(control('confirm'), testRuntime.context);
    const clipPending = testRuntime.value().pending as { requestId: string };
    await raidScout.onEvent({
      eventType: 'addon.thsv.raid-scout.controller-result', platform: 'system', metadata: { simulated: false },
      payload: { operation: 'clip', requestId: clipPending.requestId, success: true, clips: [{ id: 'clip-ad', embedUrl: 'https://clips.twitch.tv/embed?clip=clip-ad', durationSeconds: 35 }] },
    }, testRuntime.context);
    const downloadPending = testRuntime.value().pending as { requestId: string };
    await raidScout.onEvent({
      eventType: 'addon.thsv.raid-scout.controller-result', platform: 'system', metadata: { simulated: false },
      payload: { operation: 'clip-download', requestId: downloadPending.requestId, success: true },
    }, testRuntime.context);
    const playback = testRuntime.value().pending as { playbackId: string };
    now += 35_000;
    testRuntime.lifecycle({ playbackId: playback.playbackId, phase: 'ended', occurredAt: new Date(now).toISOString() });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const raidPending = testRuntime.value().pending as { requestId: string };
    expect(raidPending).toMatchObject({ operation: 'raid' });
    expect(testRuntime.context.streamerbot.runApprovedAction).not.toHaveBeenCalledWith(RUN_ENDING_AD_ACTION_ID, expect.anything());

    await raidScout.onEvent({
      eventType: 'addon.thsv.raid-scout.controller-result', platform: 'system', metadata: { simulated: false },
      payload: { operation: 'raid', requestId: raidPending.requestId, success: true },
    }, testRuntime.context);
    expect(testRuntime.value().pending).toMatchObject({ operation: 'end-broadcast-countdown', executeAt: now });
    await testRuntime.runScheduled();
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(END_BROADCAST_ACTION_ID, expect.objectContaining({ raidScoutOperation: 'end-broadcast' }));
  });

  it('arms a cancelable broadcast-ending countdown only after Twitch accepts the raid', async () => {
    const raidRequestId = 'raid-accepted-request';
    const initial = sanitizeState({
      pending: { operation: 'raid', requestId: raidRequestId, startedAt: Date.now(), candidate: candidate('alpha') },
    });
    const testRuntime = runtime({
      endBroadcastAfterRaid: true,
      endBroadcastActionId: END_BROADCAST_ACTION_ID,
      endBroadcastTiming: 'countdown',
      endBroadcastDelaySeconds: 10,
      endBroadcastAcknowledged: true,
    }, initial as Record<string, unknown>);
    testRuntime.context.approvedActionIds.push(END_BROADCAST_ACTION_ID);
    await raidScout.start(testRuntime.context);
    await raidScout.onEvent({
      eventType: 'addon.thsv.raid-scout.controller-result', platform: 'system', metadata: { simulated: false },
      payload: { operation: 'raid', requestId: raidRequestId, success: true, error: '' },
    }, testRuntime.context);
    expect(testRuntime.value().pending).toMatchObject({ operation: 'end-broadcast-countdown', actionId: END_BROADCAST_ACTION_ID });
    expect(testRuntime.context.schedule.after).toHaveBeenLastCalledWith(10_000, expect.any(Function));
    expect(testRuntime.context.overlay.publish).toHaveBeenCalledWith('thsv.raid-scout.card.show', expect.objectContaining({
      title: 'RAID ACCEPTED', text: expect.stringContaining('Raid Scout Cancel'),
    }), { lane: 'foreground' });

    await raidScout.onEvent(control('cancel'), testRuntime.context);
    await testRuntime.runScheduled();
    expect(testRuntime.value().pending).toBeUndefined();
    expect(testRuntime.context.streamerbot.runApprovedAction).not.toHaveBeenCalledWith(END_BROADCAST_ACTION_ID, expect.anything());
    expect(testRuntime.context.overlay.publish).toHaveBeenCalledWith('thsv.raid-scout.card.show', expect.objectContaining({ title: 'AUTO END CANCELED' }), { lane: 'foreground' });
  });

  it('runs one approved stop action, waits for genuine provider confirmation, and never retries', async () => {
    const raidRequestId = 'raid-stop-request';
    const initial = sanitizeState({
      pending: { operation: 'raid', requestId: raidRequestId, startedAt: Date.now(), candidate: candidate('beta') },
    });
    const testRuntime = runtime({
      endBroadcastAfterRaid: true,
      endBroadcastActionId: END_BROADCAST_ACTION_ID,
      endBroadcastTiming: 'countdown',
      endBroadcastDelaySeconds: 5,
      endBroadcastAcknowledged: true,
    }, initial as Record<string, unknown>);
    testRuntime.context.approvedActionIds.push(END_BROADCAST_ACTION_ID);
    await raidScout.start(testRuntime.context);
    await raidScout.onEvent({
      eventType: 'addon.thsv.raid-scout.controller-result', platform: 'system', metadata: { simulated: false },
      payload: { operation: 'raid', requestId: raidRequestId, success: true, error: '' },
    }, testRuntime.context);
    await testRuntime.runScheduled();
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(END_BROADCAST_ACTION_ID, expect.objectContaining({
      raidScoutOperation: 'end-broadcast', raidScoutTargetLogin: 'beta',
    }));
    expect(testRuntime.value().pending).toMatchObject({ operation: 'end-broadcast-awaiting-stop' });

    await raidScout.onEvent({ ...control('broadcast-stopped'), metadata: { simulated: true } }, testRuntime.context);
    expect(testRuntime.value().pending).toMatchObject({ operation: 'end-broadcast-awaiting-stop' });
    await raidScout.onEvent(control('broadcast-stopped'), testRuntime.context);
    expect(testRuntime.value().pending).toBeUndefined();
    expect(testRuntime.context.mediaSlot.release).toHaveBeenCalledTimes(0);
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenCalledTimes(1);
  });

  it('waits for a genuine Twitch ad and ends only after its reported duration plus buffer', async () => {
    const now = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const raidRequestId = 'raid-ad-aware-stop';
    const initial = sanitizeState({ pending: { operation: 'raid', requestId: raidRequestId, startedAt: now, candidate: candidate('gamma') } });
    const testRuntime = runtime({
      endBroadcastAfterRaid: true, endBroadcastActionId: END_BROADCAST_ACTION_ID,
      endBroadcastTiming: 'after-ad', endBroadcastAdWaitSeconds: 300, endBroadcastAdEndBufferSeconds: 3,
      endBroadcastAcknowledged: true,
    }, initial as Record<string, unknown>);
    testRuntime.context.approvedActionIds.push(END_BROADCAST_ACTION_ID);
    testRuntime.context.approvedActionIds.push(RUN_ENDING_AD_ACTION_ID);
    await raidScout.start(testRuntime.context);
    await raidScout.onEvent({
      eventType: 'addon.thsv.raid-scout.controller-result', platform: 'system', metadata: { simulated: false },
      payload: { operation: 'raid', requestId: raidRequestId, success: true },
    }, testRuntime.context);
    expect(testRuntime.value().pending).toMatchObject({ operation: 'end-broadcast-waiting-for-ad' });
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(RUN_ENDING_AD_ACTION_ID, expect.objectContaining({
      raidScoutOperation: 'run-ending-ad', raidScoutAdDurationSeconds: 180,
    }));

    await raidScout.onEvent({
      eventType: 'addon.thsv.ad-break-companion.started', platform: 'twitch', metadata: { simulated: false }, payload: { adLength: 180 },
    }, testRuntime.context);
    expect(testRuntime.value().pending).toMatchObject({ operation: 'end-broadcast-countdown', executeAt: now + 183_000 });
    expect(testRuntime.context.schedule.after).toHaveBeenLastCalledWith(183_000, expect.any(Function));
    await testRuntime.runScheduled();
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(END_BROADCAST_ACTION_ID, expect.objectContaining({ raidScoutOperation: 'end-broadcast' }));
  });

  it('does not arm broadcast ending after a rejected raid or without the explicit safety acknowledgement', async () => {
    const rejectedId = 'raid-rejected-request';
    const rejected = runtime({ endBroadcastAfterRaid: true, endBroadcastActionId: END_BROADCAST_ACTION_ID, endBroadcastTiming: 'countdown', endBroadcastAcknowledged: true }, sanitizeState({
      pending: { operation: 'raid', requestId: rejectedId, startedAt: Date.now(), candidate: candidate('alpha') },
    }) as Record<string, unknown>);
    rejected.context.approvedActionIds.push(END_BROADCAST_ACTION_ID);
    await raidScout.start(rejected.context);
    await raidScout.onEvent({ eventType: 'addon.thsv.raid-scout.controller-result', platform: 'system', metadata: { simulated: false }, payload: { operation: 'raid', requestId: rejectedId, success: false, error: 'Raid rejected.' } }, rejected.context);
    expect(rejected.context.streamerbot.runApprovedAction).not.toHaveBeenCalledWith(END_BROADCAST_ACTION_ID, expect.anything());
    expect(rejected.value().pending).toBeUndefined();

    await raidScout.stop(rejected.context);
    const unacknowledgedId = 'raid-unacknowledged-request';
    const unacknowledged = runtime({ endBroadcastAfterRaid: true, endBroadcastActionId: END_BROADCAST_ACTION_ID, endBroadcastTiming: 'countdown', endBroadcastAcknowledged: false }, sanitizeState({
      pending: { operation: 'raid', requestId: unacknowledgedId, startedAt: Date.now(), candidate: candidate('beta') },
    }) as Record<string, unknown>);
    unacknowledged.context.approvedActionIds.push(END_BROADCAST_ACTION_ID);
    await raidScout.start(unacknowledged.context);
    await raidScout.onEvent({ eventType: 'addon.thsv.raid-scout.controller-result', platform: 'system', metadata: { simulated: false }, payload: { operation: 'raid', requestId: unacknowledgedId, success: true } }, unacknowledged.context);
    expect(unacknowledged.value().pending).toBeUndefined();
    expect(unacknowledged.value().lastError).toContain('acknowledgement');
  });

  it('times out an unconfirmed stop without retrying and clears stale stop requests on restart', async () => {
    const raidRequestId = 'raid-unconfirmed-stop';
    const initial = sanitizeState({
      pending: { operation: 'raid', requestId: raidRequestId, startedAt: Date.now(), candidate: candidate('alpha') },
    });
    const testRuntime = runtime({
      endBroadcastAfterRaid: true, endBroadcastActionId: END_BROADCAST_ACTION_ID,
      endBroadcastTiming: 'countdown', endBroadcastDelaySeconds: 5, endBroadcastAcknowledged: true,
    }, initial as Record<string, unknown>);
    testRuntime.context.approvedActionIds.push(END_BROADCAST_ACTION_ID);
    await raidScout.start(testRuntime.context);
    await raidScout.onEvent({ eventType: 'addon.thsv.raid-scout.controller-result', platform: 'system', metadata: { simulated: false }, payload: { operation: 'raid', requestId: raidRequestId, success: true } }, testRuntime.context);
    await testRuntime.runScheduled();
    await testRuntime.runScheduled();
    expect(testRuntime.value().pending).toBeUndefined();
    expect(testRuntime.value().lastError).toContain('will not retry');
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenCalledTimes(1);

    await raidScout.stop(testRuntime.context);
    const stale = sanitizeState({
      pending: {
        operation: 'end-broadcast-countdown', requestId: 'stale-stop', startedAt: Date.now(), candidate: candidate('beta'),
        actionId: END_BROADCAST_ACTION_ID, executeAt: Date.now() + 5_000,
      },
    });
    const restarted = runtime({}, stale as Record<string, unknown>);
    await raidScout.start(restarted.context);
    expect(restarted.value().pending).toBeUndefined();
    expect(restarted.value().lastError).toContain('will not resume');
    expect(restarted.context.streamerbot.runApprovedAction).not.toHaveBeenCalled();
  });
});
