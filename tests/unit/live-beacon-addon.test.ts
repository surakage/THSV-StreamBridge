import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- verified executable add-on exports are intentionally loaded from plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import liveBeacon from '../../addons/live-beacon/dist/index.js';

function event(platform: 'twitch' | 'youtube', id: string) { return { eventType: 'stream.online', platform, receivedAt: '2026-07-27T12:00:00.000Z', source: { eventId: id }, metadata: { simulated: false }, channel: { name: platform === 'twitch' ? 'creator' : 'Creator Channel' }, payload: { streamId: id, title: 'Community night', categoryName: 'Gaming', startedAt: '2026-07-27T11:59:00.000Z' } }; }

describe('Live Beacon add-on', () => {
  it('waits for nearby starts and then sends one approved Discord embed dispatch per platform', async () => {
    let scheduled: (() => Promise<void>) | undefined; const runApprovedAction = vi.fn(async () => {});
    const context = { settings: { enabled: true, platforms: ['twitch', 'youtube'], destinationMode: 'channel', twitchDestinationMode: 'forum', youtubeDestinationMode: 'channel', twitchForumThreadId: '123456789012345678', coalesceSeconds: 15, webhookName: 'Beacon', roleMentionId: '', messageTemplate: '{platform} live: {url}', twitchLogin: 'creator', youtubeChannelUrl: 'https://youtube.com/@creator', kickLogin: '', tiktokLogin: '' }, streamerbot: { runApprovedAction }, schedule: { after: vi.fn((_delay, task) => { scheduled = task; return 'task'; }), cancel: vi.fn() }, state: { read: vi.fn(async () => ({})), write: vi.fn() } };
    await liveBeacon.start(); await liveBeacon.onEvent(event('twitch', 'twitch-1'), context); await liveBeacon.onEvent(event('youtube', 'youtube-1'), context); await scheduled?.();
    expect(runApprovedAction).toHaveBeenCalledTimes(2);
    expect(runApprovedAction).toHaveBeenNthCalledWith(1, 'b99f5eae-d962-4b71-b2c5-64c19917189f', expect.objectContaining({ liveBeaconPlatform: 'twitch', liveBeaconUrl: 'https://www.twitch.tv/creator', liveBeaconDestinationMode: 'forum', liveBeaconThreadId: '123456789012345678', liveBeaconTitle: 'Community night', liveBeaconCategory: 'Gaming', liveBeaconStartedAt: '2026-07-27T11:59:00.000Z' }));
    expect(runApprovedAction).toHaveBeenNthCalledWith(2, 'b99f5eae-d962-4b71-b2c5-64c19917189f', expect.objectContaining({ liveBeaconPlatform: 'youtube', liveBeaconUrl: 'https://www.youtube.com/watch?v=youtube-1', liveBeaconDestinationMode: 'channel' }));
    await liveBeacon.stop(context);
  });

  it('suppresses simulations and unverified stream identities', async () => {
    const context = { settings: { enabled: true, platforms: ['twitch'] }, streamerbot: { runApprovedAction: vi.fn() }, schedule: { after: vi.fn(), cancel: vi.fn() }, state: { read: vi.fn(async () => ({})), write: vi.fn() } };
    await liveBeacon.start();
    await liveBeacon.onEvent({ ...event('twitch', 'one'), metadata: { simulated: true } }, context);
    await liveBeacon.onEvent({ ...event('twitch', 'two'), metadata: { simulated: false, unverifiedFields: ['source.eventId'] }, payload: {} }, context);
    expect(context.schedule.after).not.toHaveBeenCalled(); await liveBeacon.stop(context);
  });

  it('persists deduplication only after a confirmed result', async () => {
    let stored: Record<string, unknown> = {};
    const context = { settings: { enabled: true }, state: { read: vi.fn(async () => stored), write: vi.fn(async (value) => { stored = value; }) }, schedule: { cancel: vi.fn() } };
    await liveBeacon.start(); await liveBeacon.onEvent({ eventType: 'addon.thsv.live-beacon.delivery-result', receivedAt: '2026-07-27T12:00:15.000Z', payload: { deliveryId: 'twitch%7Cstream-1,youtube%7Cstream-2', success: true, messageId: '123456789', threadId: '987654321' } }, context);
    expect((stored['notified'] as unknown[])).toHaveLength(2);
    expect(stored['lastDelivery']).toMatchObject({ messageId: '123456789', threadId: '987654321', success: true });
    await liveBeacon.stop(context);
  });

  it('creates one managed forum post with a welcome message and reuses its confirmed thread ID', async () => {
    let scheduled: (() => Promise<void>) | undefined; let stored: Record<string, unknown> = {}; const runApprovedAction = vi.fn(async () => {});
    const context = {
      settings: { enabled: true, platforms: ['twitch'], destinationMode: 'forum', forumPostSetupMode: 'create', twitchLogin: 'creator', twitchForumWelcome: 'Welcome {channel}!', coalesceSeconds: 1 },
      streamerbot: { runApprovedAction },
      schedule: { after: vi.fn((_delay, task) => { scheduled = task; return 'task'; }), cancel: vi.fn() },
      state: { read: vi.fn(async () => stored), write: vi.fn(async (value) => { stored = value; }) },
    };
    await liveBeacon.start();
    await liveBeacon.onEvent(event('twitch', 'first-stream'), context); await scheduled?.();
    expect(runApprovedAction).toHaveBeenLastCalledWith('b99f5eae-d962-4b71-b2c5-64c19917189f', expect.objectContaining({
      liveBeaconDestinationMode: 'forum', liveBeaconThreadId: '', liveBeaconThreadName: 'Twitch Live Notifications', liveBeaconForumWelcome: 'Welcome creator!',
    }));
    await liveBeacon.onEvent({ eventType: 'addon.thsv.live-beacon.delivery-result', receivedAt: '2026-07-27T12:00:05.000Z', payload: { platform: 'twitch', deliveryId: 'twitch%7Cfirst-stream', success: true, messageId: 'message-1', threadId: '123456789012345678' } }, context);
    expect(stored['managedForumThreads']).toMatchObject({ twitch: '123456789012345678' });
    await liveBeacon.onEvent(event('twitch', 'second-stream'), context); await scheduled?.();
    expect(runApprovedAction).toHaveBeenLastCalledWith('b99f5eae-d962-4b71-b2c5-64c19917189f', expect.objectContaining({
      liveBeaconThreadId: '123456789012345678', liveBeaconForumWelcome: '',
    }));
    await liveBeacon.stop(context);
  });

  it('normalizes full Twitch and Kick channel URLs and creates direct YouTube and TikTok live links', async () => {
    let scheduled: (() => Promise<void>) | undefined; const runApprovedAction = vi.fn(async () => {});
    const context = { settings: { enabled: true, platforms: ['twitch', 'youtube', 'kick', 'tiktok'], destinationMode: 'channel', coalesceSeconds: 1, twitchLogin: 'https://www.twitch.tv/suraruisuh', youtubeChannelUrl: 'https://www.youtube.com/@TheHiddenSlothVillage', kickLogin: 'https://kick.com/suraruisuh', tiktokLogin: 'https://www.tiktok.com/@surakage' }, streamerbot: { runApprovedAction }, schedule: { after: vi.fn((_delay, task) => { scheduled = task; return 'task'; }), cancel: vi.fn() }, state: { read: vi.fn(async () => ({})), write: vi.fn() } };
    await liveBeacon.start();
    await liveBeacon.onEvent(event('twitch', 'twitch-stream'), context);
    await liveBeacon.onEvent({ ...event('youtube', 'youtube-video-id'), payload: { title: 'Live now' } }, context);
    await liveBeacon.onEvent({ ...event('twitch', 'kick-stream'), platform: 'kick', channel: { name: 'ignored' } }, context);
    await liveBeacon.onEvent({ ...event('twitch', 'tiktok-stream'), platform: 'tiktok', channel: { name: 'ignored' } }, context);
    await scheduled?.();
    const calls = runApprovedAction.mock.calls as unknown as [string, Record<string, string>][];
    expect(calls.map((call) => call[1]['liveBeaconUrl'])).toEqual([
      'https://www.twitch.tv/suraruisuh',
      'https://www.youtube.com/@TheHiddenSlothVillage/live',
      'https://kick.com/suraruisuh',
      'https://www.tiktok.com/@surakage/live',
    ]);
    await liveBeacon.stop(context);
  });

  it('uses a real broadcast-app control only for selected fallback platforms and suppresses its simulated test', async () => {
    let scheduled: (() => Promise<void>) | undefined; const runApprovedAction = vi.fn(async () => {});
    const context = { settings: { enabled: true, platforms: ['twitch', 'tiktok'], fallbackPlatforms: ['tiktok'], coalesceSeconds: 1, twitchLogin: 'creator', tiktokLogin: '@surakage' }, streamerbot: { runApprovedAction }, schedule: { after: vi.fn((_delay, task) => { scheduled = task; return 'task'; }), cancel: vi.fn() }, state: { read: vi.fn(async () => ({})), write: vi.fn() } };
    await liveBeacon.start();
    const control = { eventType: 'addon.thsv.live-beacon.broadcast-control', receivedAt: '2026-07-27T12:00:00.000Z', metadata: { simulated: false }, payload: { action: 'online', startedAt: '2026-07-27T12:00:00.000Z' } };
    await liveBeacon.onEvent({ ...control, metadata: { simulated: true } }, context);
    expect(context.schedule.after).not.toHaveBeenCalled();
    await liveBeacon.onEvent(control, context); await scheduled?.();
    expect(runApprovedAction).toHaveBeenCalledOnce();
    expect(runApprovedAction).toHaveBeenCalledWith('b99f5eae-d962-4b71-b2c5-64c19917189f', expect.objectContaining({ liveBeaconPlatform: 'tiktok', liveBeaconUrl: 'https://www.tiktok.com/@surakage/live', liveBeaconStartedAt: '2026-07-27T12:00:00.000Z' }));
    await liveBeacon.stop(context);
  });
});
