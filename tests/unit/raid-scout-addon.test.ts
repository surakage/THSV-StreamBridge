import { afterEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import raidScout, { CONTROLLER_ACTION_ID, filterCandidates, sanitizeState, selectCandidate } from '../../addons/raid-scout/dist/index.js';

const settings = {
  enabled: true,
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
    },
    context: {
      settings: {
        enabled: true,
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
    }));
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
    }));
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
    const playback = testRuntime.value().pending as { playbackId: string; durationMs: number };
    expect(testRuntime.context.overlay.publish).toHaveBeenCalledWith('thsv.raid-scout.media.play', expect.objectContaining({ embedUrl: 'https://clips.twitch.tv/embed?clip=clip-1', durationMs: 12_000 }));
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
});
