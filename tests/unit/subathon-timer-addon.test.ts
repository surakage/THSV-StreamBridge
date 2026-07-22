import { describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- verified executable add-on exports are intentionally loaded from plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import { applyElapsed, awardForEvent, formatRemaining, sanitizeState } from '../../addons/subathon-timer/dist/index.js';

const settings = {
  enabledPlatforms: ['twitch', 'youtube', 'kick', 'tiktok'], followSeconds: 30, subscriptionSeconds: 300,
  membershipSeconds: 300, giftSubscriptionSecondsEach: 180, giftSecondsEach: 15,
  raidBaseSeconds: 300, raidPerViewerSeconds: 5, minimumRaidViewers: 2,
  likeThreshold: 100, likeThresholdAwardSeconds: 45,
};

describe('Subathon Timer helpers', () => {
  it('formats long timers without wrapping days into a clock', () => {
    expect(formatRemaining(90_061)).toBe('25:01:01');
  });

  it('decrements only running state and stops cleanly at zero', () => {
    const state = sanitizeState({ initialized: true, remainingSeconds: 5, running: true, updatedAt: 1_000 });
    expect(applyElapsed(state, 4_000)).toMatchObject({ remainingSeconds: 2, running: true, updatedAt: 4_000 });
    expect(applyElapsed(state, 10_000)).toMatchObject({ remainingSeconds: 0, running: false, lastReason: 'expired' });
  });

  it('awards bounded event quantities and ignores raids below the creator threshold', () => {
    const state = sanitizeState({ thresholds: [] });
    expect(awardForEvent({ eventType: 'channel.follow', platform: 'twitch', payload: {} }, settings, state)).toMatchObject({ seconds: 30, reason: 'follow' });
    expect(awardForEvent({ eventType: 'channel.gift-subscription', platform: 'kick', payload: { quantity: 5 } }, settings, state)).toMatchObject({ seconds: 900 });
    expect(awardForEvent({ eventType: 'channel.raid', platform: 'twitch', payload: { quantity: 1 } }, settings, state)).toMatchObject({ seconds: 0 });
    expect(awardForEvent({ eventType: 'channel.raid', platform: 'twitch', payload: { quantity: 10 } }, settings, state)).toMatchObject({ seconds: 350, reason: 'raid' });
  });

  it('adds TikTok-like time only when a new full threshold is crossed', () => {
    const state = sanitizeState({ thresholds: [{ key: 'tiktok:likes', buckets: 1 }] });
    expect(awardForEvent({ eventType: 'engagement.milestone', platform: 'tiktok', payload: { metric: 'likes', value: 199 } }, settings, state)).toMatchObject({ seconds: 0 });
    expect(awardForEvent({ eventType: 'engagement.milestone', platform: 'tiktok', payload: { metric: 'likes', value: 305 } }, settings, state)).toMatchObject({ seconds: 90, thresholdBuckets: 3 });
  });
});
