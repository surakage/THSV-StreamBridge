import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- verified executable add-on exports are intentionally loaded from plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import creatorControls from '../../addons/creator-controls/dist/index.js';

const settings = {
  enabled: true, allowSimulatedControls: false,
  profile2Enabled: true, profile2Name: 'Gameplay', profile2Platforms: ['twitch', 'youtube', 'kick'], profile2Title: 'Playing now',
  profile2TwitchCategoryId: '12345', profile2YoutubeCategoryName: 'Gaming', profile2YoutubeBroadcastId: '', profile2KickCategoryName: 'Fortnite',
};

describe('Creator Controls add-on', () => {
  it('dispatches one validated saved profile through the shared stable controller', async () => {
    const runApprovedAction = vi.fn(async () => {});
    const context = { settings, streamerbot: { runApprovedAction }, state: { read: vi.fn(async () => ({})), write: vi.fn(async () => {}) } };
    await creatorControls.onEvent({ eventId: 'request-1', eventType: 'addon.thsv.creator-controls.control', metadata: { simulated: false }, payload: { profileId: 'profile-2' } }, context);
    expect(runApprovedAction).toHaveBeenCalledOnce();
    expect(runApprovedAction).toHaveBeenCalledWith('183afef4-fc53-4337-859f-c9fe6d1961e1', expect.objectContaining({
      providerControlPlatforms: 'twitch,youtube,kick', providerControlTitle: 'Playing now', providerControlTwitchCategoryId: '12345', providerControlKickCategoryName: 'Fortnite',
    }));
  });

  it('suppresses simulated profile requests and disabled profiles', async () => {
    const runApprovedAction = vi.fn(async () => {});
    const context = { settings, streamerbot: { runApprovedAction }, state: { read: vi.fn(), write: vi.fn() } };
    await creatorControls.onEvent({ eventId: 'test-1', eventType: 'addon.thsv.creator-controls.control', metadata: { simulated: true }, payload: { profileId: 'profile-2' } }, context);
    await creatorControls.onEvent({ eventId: 'disabled-1', eventType: 'addon.thsv.creator-controls.control', metadata: { simulated: false }, payload: { profileId: 'profile-1' } }, context);
    expect(runApprovedAction).not.toHaveBeenCalled();
  });

  it('retains only a bounded provider-result audit without titles or category values', async () => {
    let stored: Record<string, unknown> = {};
    const context = { settings, streamerbot: { runApprovedAction: vi.fn() }, state: { read: vi.fn(async () => stored), write: vi.fn(async (value) => { stored = value; }) } };
    for (let index = 0; index < 25; index += 1) await creatorControls.onEvent({ eventType: 'addon.thsv.creator-controls.result', receivedAt: `2026-07-27T00:00:${String(index).padStart(2, '0')}.000Z`, payload: { profileId: 'profile-2', success: index % 2 === 0, resultCount: 3, title: 'must-not-persist' } }, context);
    expect((stored['history'] as unknown[])).toHaveLength(20);
    expect(JSON.stringify(stored)).not.toContain('must-not-persist');
  });
});
