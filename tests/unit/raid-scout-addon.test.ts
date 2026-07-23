import { afterEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import raidScout, { CONTROLLER_ACTION_ID, filterCandidates, sanitizeState, selectCandidate } from '../../addons/raid-scout/dist/index.js';

const settings = {
  enabled: true,
  preferredChannels: ['alpha', 'beta'],
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
  showSuggestionCard: false,
  showConfirmedCard: true,
  cardSeconds: 20,
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
  return {
    value: () => state,
    context: {
      settings: {
        enabled: true,
        preferredChannels: 'alpha\nbeta',
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
        showSuggestionCard: false,
        showConfirmedCard: true,
        cardSeconds: 20,
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
      chat: { send: vi.fn(async () => []) },
      overlay: { publish: vi.fn(async () => {}) },
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
});
