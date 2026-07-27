import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- verified executable add-on exports are intentionally loaded from plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import liveBeacon from '../../addons/live-beacon/dist/index.js';

function event(platform: 'twitch' | 'youtube', id: string) { return { eventType: 'stream.online', platform, receivedAt: '2026-07-27T12:00:00.000Z', source: { eventId: id }, metadata: { simulated: false }, channel: { name: platform === 'twitch' ? 'creator' : 'Creator Channel' }, payload: { streamId: id, title: 'Community night', categoryName: 'Gaming' } }; }

describe('Live Beacon add-on', () => {
  it('coalesces verified platform starts into one approved Discord dispatch', async () => {
    let scheduled: (() => Promise<void>) | undefined; const runApprovedAction = vi.fn(async () => {});
    const context = { settings: { enabled: true, platforms: ['twitch', 'youtube'], destinationMode: 'channel', coalesceSeconds: 15, webhookName: 'Beacon', roleMentionId: '', messageTemplate: '{platforms} live: {links}', twitchLogin: 'creator', youtubeChannelUrl: 'https://youtube.com/@creator', kickLogin: '', tiktokLogin: '' }, streamerbot: { runApprovedAction }, schedule: { after: vi.fn((_delay, task) => { scheduled = task; return 'task'; }), cancel: vi.fn() }, state: { read: vi.fn(async () => ({})), write: vi.fn() } };
    await liveBeacon.start(); await liveBeacon.onEvent(event('twitch', 'twitch-1'), context); await liveBeacon.onEvent(event('youtube', 'youtube-1'), context); await scheduled?.();
    expect(runApprovedAction).toHaveBeenCalledOnce();
    expect(runApprovedAction).toHaveBeenCalledWith('b99f5eae-d962-4b71-b2c5-64c19917189f', expect.objectContaining({ liveBeaconDestinationMode: 'channel', liveBeaconMessage: expect.stringContaining('twitch: https://twitch.tv/creator') }));
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
});
