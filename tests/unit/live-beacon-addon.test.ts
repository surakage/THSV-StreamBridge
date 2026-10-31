import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- verified executable add-on exports are intentionally loaded from plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import liveBeacon, { buildEmbed, enrichFromActiveStreams } from '../../addons/live-beacon/dist/index.js';

function event(platform: 'twitch' | 'youtube', id: string) { return { eventType: 'stream.online', platform, receivedAt: '2026-07-27T12:00:00.000Z', source: { eventId: id }, metadata: { simulated: false }, channel: { name: platform === 'twitch' ? 'creator' : 'Creator Channel' }, payload: { streamId: id, title: 'Community night', categoryName: 'Gaming', startedAt: '2026-07-27T11:59:00.000Z' } }; }

type Post = { webhookId: string; content?: string; username?: string; avatarUrl?: string; threadId?: string; threadName?: string; mentionRoleIds?: string[]; embeds: Array<{ title: string; url: string; color: number; timestamp?: string; footer: { text: string }; fields: Array<{ name: string; value: string }> }> };
function discord(result: Record<string, unknown> = { ok: true, messageId: 'message-1' }) {
  const posts: Post[] = [];
  const post = vi.fn(async (request: Post) => { posts.push(request); return result; });
  return { post, posts };
}
const field = (request: Post | undefined, name: string) => request?.embeds[0]?.fields.find((entry) => entry.name === name)?.value;
// The scheduled flush starts the Discord posts without awaiting them, so let them finish.
async function runTask(task: (() => unknown) | undefined) { await task?.(); await new Promise((resolve) => { setTimeout(resolve, 0); }); }

describe('Live Beacon add-on', () => {
  it('fills TikTok missing metadata from active Twitch while retaining native links and timestamps', () => {
    const entry = { platform: 'tiktok', title: '', category: '', url: 'https://www.tiktok.com/@creator/live', startedAt: '2026-10-05T12:00:00Z' };
    const streams = new Map([['kick', { platform: 'kick', title: 'Kick title', category: 'Art' }], ['twitch', { platform: 'twitch', title: 'Twitch title', category: 'Palworld', categoryArtUrl: 'https://example.com/art.png', thumbnailUrl: 'https://example.com/live.jpg', profileImageUrl: 'https://example.com/profile.png' }]]);
    expect(enrichFromActiveStreams(entry, streams)).toMatchObject({ title: 'Twitch title', category: 'Palworld', categoryArtUrl: 'https://example.com/art.png', thumbnailUrl: 'https://example.com/live.jpg', metadataSource: 'twitch', url: entry.url, startedAt: entry.startedAt });
    expect(enrichFromActiveStreams({ ...entry, title: 'My TikTok title', category: 'Art' }, streams)).toMatchObject({ title: 'My TikTok title', category: 'Art' });
    expect(enrichFromActiveStreams({ ...entry, category: 'Art' }, streams).thumbnailUrl).toBeUndefined();
    expect(enrichFromActiveStreams(entry, streams, false)).toEqual(entry);
    expect(enrichFromActiveStreams(entry, new Map())).toEqual(entry);
  });

  it('shares later online metadata with a pending TikTok fallback and removes offline donors', async () => {
    let scheduled: (() => Promise<void>) | undefined; const { post, posts } = discord();
    const context = { settings: { enabled: true, webhookId: 'beacon', platforms: ['tiktok'], fallbackPlatforms: ['tiktok'], tiktokLogin: 'creator' }, discord: { post }, schedule: { after: vi.fn((_delay, task) => { scheduled = task; return 'task'; }), cancel: vi.fn() }, state: { read: vi.fn(async () => ({})), write: vi.fn() } };
    await liveBeacon.start();
    await liveBeacon.onEvent({ eventType: 'addon.thsv.live-beacon.broadcast-control', metadata: { simulated: false }, receivedAt: '2026-10-05T12:00:00Z', payload: { action: 'online' } }, context);
    await liveBeacon.onEvent(event('twitch', 'twitch-live'), context); await runTask(scheduled);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.embeds[0]).toMatchObject({ title: '🔴 LIVE · TikTok', timestamp: '2026-10-05T12:00:00.000Z', footer: { text: 'THSV Live Beacon · Shared details from Twitch' } });
    expect(field(posts[0], 'Stream title')).toBe('Community night');
    expect(field(posts[0], 'Game / Category')).toBe('Gaming');
    await liveBeacon.onEvent({ eventType: 'stream.offline', platform: 'twitch', metadata: { simulated: false } }, context);
    await liveBeacon.onEvent({ eventType: 'addon.thsv.live-beacon.broadcast-control', metadata: { simulated: false }, receivedAt: '2026-10-05T13:00:00Z', payload: { action: 'online' } }, context); await runTask(scheduled);
    expect(posts).toHaveLength(2);
    expect(posts[1]?.embeds[0]?.footer.text).toBe('THSV Live Beacon');
    expect(field(posts[1], 'Stream title')).toBe('Not supplied by the connected platforms');
    await liveBeacon.stop(context);
  });

  it('drops a pending live notification when its platform goes offline during coalescing', async () => {
    let scheduled: (() => Promise<void>) | undefined; const { post } = discord();
    const context = { settings: { enabled: true, webhookId: 'beacon', platforms: ['twitch'] }, discord: { post }, schedule: { after: vi.fn((_delay, task) => { scheduled = task; return 'task'; }), cancel: vi.fn() }, state: { read: vi.fn(async () => ({})), write: vi.fn() } };
    await liveBeacon.start(); await liveBeacon.onEvent(event('twitch', 'short-stream'), context);
    await liveBeacon.onEvent({ eventType: 'stream.offline', platform: 'twitch', metadata: { simulated: false } }, context); await runTask(scheduled);
    expect(post).not.toHaveBeenCalled(); await liveBeacon.stop(context);
  });

  it('announces Facebook only when selected, using the associated video and confirmed deduplication', async () => {
    let scheduled: (() => Promise<void>) | undefined; let stored: Record<string, unknown> = {};
    const { post, posts } = discord({ ok: true, messageId: 'message-1', threadId: '123456789' });
    const context = { settings: { enabled: true, webhookId: 'beacon', platforms: ['twitch'], facebookPageUrl: 'https://www.facebook.com/123/live', destinationMode: 'forum', forumPostSetupMode: 'existing', facebookForumPostSetupMode: 'create' }, discord: { post }, schedule: { after: vi.fn((_delay, task) => { scheduled = task; return 'task'; }), cancel: vi.fn() }, state: { read: vi.fn(async () => stored), write: vi.fn(async value => { stored = value; }) } };
    const online = { eventType: 'stream.online', platform: 'facebook', source: { eventName: 'Facebook.BroadcastStatus' }, receivedAt: '2026-10-05T12:00:00.000Z', channel: { id: '123', name: 'The Hidden Sloth Village' }, metadata: { simulated: false }, payload: { streamId: '456', videoId: '789', streamUrl: 'https://www.facebook.com/watch/?v=789', title: 'Village live' } };
    await liveBeacon.start(); await liveBeacon.onEvent(online, context); expect(scheduled).toBeUndefined();
    context.settings.platforms.push('facebook');
    await liveBeacon.onEvent(online, context); await runTask(scheduled);
    expect(posts[0]).toMatchObject({ webhookId: 'beacon', threadName: 'Facebook Live Notifications', content: expect.stringContaining('Facebook') as string });
    expect(posts[0]?.embeds[0]?.url).toBe('https://www.facebook.com/watch/?v=789');
    expect(field(posts[0], 'Stream title')).toBe('Village live');
    expect(stored['managedForumThreads']).toMatchObject({ facebook: '123456789' });
    await liveBeacon.onEvent(online, context); await runTask(scheduled); expect(post).toHaveBeenCalledTimes(1);
    await liveBeacon.stop(context);
  });

  it('uses a Facebook Page fallback for missing video metadata and rejects foreign or credentialed URLs', async () => {
    let scheduled: (() => Promise<void>) | undefined; const { post, posts } = discord();
    const context = { settings: { enabled: true, webhookId: 'beacon', platforms: ['facebook'], facebookPageUrl: 'https://www.facebook.com/123/live' }, discord: { post }, schedule: { after: vi.fn((_delay, task) => { scheduled = task; return 'task'; }), cancel: vi.fn() }, state: { read: vi.fn(async () => ({})), write: vi.fn() } };
    await liveBeacon.start();
    const online = { ...event('twitch', 'fb-live'), platform: 'facebook', payload: { streamId: '123', streamUrl: 'https://facebook.com.evil.example/video' } };
    await liveBeacon.onEvent(online, context); await runTask(scheduled);
    expect(posts[0]?.embeds[0]?.url).toBe('https://www.facebook.com/123/live');
    await liveBeacon.stop(context); scheduled = undefined; context.settings.facebookPageUrl = 'https://user:password@facebook.com/page/live'; await liveBeacon.start();
    await liveBeacon.onEvent(online, context); expect(scheduled).toBeUndefined(); await liveBeacon.stop(context);
  });

  it('waits for nearby starts and then posts one Discord embed per platform to its chosen webhook', async () => {
    let scheduled: (() => Promise<void>) | undefined; const { post, posts } = discord();
    const context = { settings: { enabled: true, webhookId: 'beacon', youtubeWebhookId: 'youtube-only', platforms: ['twitch', 'youtube'], destinationMode: 'channel', twitchDestinationMode: 'forum', youtubeDestinationMode: 'channel', twitchForumThreadId: '123456789012345678', coalesceSeconds: 15, webhookName: 'Beacon', roleMentionId: '', messageTemplate: '{platform} live: {url}', twitchLogin: 'creator', youtubeChannelUrl: 'https://youtube.com/@creator', kickLogin: '', tiktokLogin: '' }, discord: { post }, schedule: { after: vi.fn((_delay, task) => { scheduled = task; return 'task'; }), cancel: vi.fn() }, state: { read: vi.fn(async () => ({})), write: vi.fn() } };
    await liveBeacon.start(); await liveBeacon.onEvent(event('twitch', 'twitch-1'), context); await liveBeacon.onEvent(event('youtube', 'youtube-1'), context); await runTask(scheduled);
    expect(post).toHaveBeenCalledTimes(2);
    expect(posts[0]).toMatchObject({ webhookId: 'beacon', username: 'Beacon', threadId: '123456789012345678' });
    expect(posts[0]?.embeds[0]).toMatchObject({ title: '🔴 LIVE · Twitch', url: 'https://www.twitch.tv/creator', timestamp: '2026-07-27T11:59:00.000Z' });
    expect(field(posts[0], 'Stream title')).toBe('Community night');
    expect(posts[1]).toMatchObject({ webhookId: 'youtube-only' });
    expect(posts[1]).not.toHaveProperty('threadId');
    expect(posts[1]).not.toHaveProperty('threadName');
    expect(posts[1]?.embeds[0]?.url).toBe('https://www.youtube.com/watch?v=youtube-1');
    await liveBeacon.stop(context);
  });

  it('pings only the chosen role and allows only that mention', async () => {
    let scheduled: (() => Promise<void>) | undefined; const { post, posts } = discord();
    const context = { settings: { enabled: true, webhookId: 'beacon', platforms: ['twitch'], roleMentionId: '222222222222222222', twitchLogin: 'creator' }, discord: { post }, schedule: { after: vi.fn((_delay, task) => { scheduled = task; return 'task'; }), cancel: vi.fn() }, state: { read: vi.fn(async () => ({})), write: vi.fn() } };
    await liveBeacon.start(); await liveBeacon.onEvent(event('twitch', 'ping'), context); await runTask(scheduled);
    expect(posts[0]).toMatchObject({ content: '<@&222222222222222222>', mentionRoleIds: ['222222222222222222'] });
    await liveBeacon.stop(context);
  });

  it('suppresses simulations and unverified stream identities', async () => {
    const context = { settings: { enabled: true, webhookId: 'beacon', platforms: ['twitch'] }, discord: { post: vi.fn() }, schedule: { after: vi.fn(), cancel: vi.fn() }, state: { read: vi.fn(async () => ({})), write: vi.fn() } };
    await liveBeacon.start();
    await liveBeacon.onEvent({ ...event('twitch', 'one'), metadata: { simulated: true } }, context);
    await liveBeacon.onEvent({ ...event('twitch', 'two'), metadata: { simulated: false, unverifiedFields: ['source.eventId'] }, payload: {} }, context);
    expect(context.schedule.after).not.toHaveBeenCalled(); await liveBeacon.stop(context);
  });

  it('persists deduplication only after Discord confirms the post', async () => {
    let scheduled: (() => Promise<void>) | undefined; let stored: Record<string, unknown> = {};
    const { post } = discord({ ok: false, error: 'Discord is rate limiting this webhook.' });
    const context = { settings: { enabled: true, webhookId: 'beacon', platforms: ['twitch'], twitchLogin: 'creator' }, discord: { post }, schedule: { after: vi.fn((_delay, task) => { scheduled = task; return 'task'; }), cancel: vi.fn() }, state: { read: vi.fn(async () => stored), write: vi.fn(async (value) => { stored = value; }) } };
    await liveBeacon.start(); await liveBeacon.onEvent(event('twitch', 'stream-1'), context); await runTask(scheduled);
    expect(stored['notified']).toEqual([]);
    expect(stored['lastDelivery']).toMatchObject({ success: false, error: 'Discord is rate limiting this webhook.' });
    post.mockResolvedValue({ ok: true, messageId: '123456789', threadId: '' });
    await liveBeacon.onEvent(event('twitch', 'stream-1'), context); await runTask(scheduled);
    expect((stored['notified'] as unknown[])).toHaveLength(1);
    expect(stored['lastDelivery']).toMatchObject({ messageId: '123456789', success: true });
    await liveBeacon.onEvent(event('twitch', 'stream-1'), context); await runTask(scheduled);
    expect(post).toHaveBeenCalledTimes(2);
    await liveBeacon.stop(context);
  });

  it('records a readable error instead of posting when no webhook is chosen', async () => {
    let scheduled: (() => Promise<void>) | undefined; let stored: Record<string, unknown> = {}; const { post } = discord();
    const context = { settings: { enabled: true, platforms: ['twitch'], twitchLogin: 'creator' }, discord: { post }, schedule: { after: vi.fn((_delay, task) => { scheduled = task; return 'task'; }), cancel: vi.fn() }, state: { read: vi.fn(async () => stored), write: vi.fn(async (value) => { stored = value; }) } };
    await liveBeacon.start(); await liveBeacon.onEvent(event('twitch', 'no-hook'), context); await runTask(scheduled);
    expect(post).not.toHaveBeenCalled();
    expect(stored['lastDelivery']).toMatchObject({ success: false, error: 'Choose a Discord webhook in Live Beacon settings.' });
    await liveBeacon.stop(context);
  });

  it('creates one managed forum post with a welcome message and reuses its confirmed thread ID', async () => {
    let scheduled: (() => Promise<void>) | undefined; let stored: Record<string, unknown> = {};
    const { post, posts } = discord({ ok: true, messageId: 'message-1', threadId: '123456789012345678' });
    const context = {
      settings: { enabled: true, webhookId: 'beacon', platforms: ['twitch'], destinationMode: 'forum', forumPostSetupMode: 'create', twitchLogin: 'creator', twitchForumWelcome: 'Welcome {channel}!', coalesceSeconds: 1 },
      discord: { post },
      schedule: { after: vi.fn((_delay, task) => { scheduled = task; return 'task'; }), cancel: vi.fn() },
      state: { read: vi.fn(async () => stored), write: vi.fn(async (value) => { stored = value; }) },
    };
    await liveBeacon.start();
    await liveBeacon.onEvent(event('twitch', 'first-stream'), context); await runTask(scheduled);
    expect(posts[0]).toMatchObject({ threadName: 'Twitch Live Notifications', content: 'Welcome creator!' });
    expect(posts[0]).not.toHaveProperty('threadId');
    expect(stored['managedForumThreads']).toMatchObject({ twitch: '123456789012345678' });
    await liveBeacon.onEvent(event('twitch', 'second-stream'), context); await runTask(scheduled);
    expect(posts[1]).toMatchObject({ threadId: '123456789012345678' });
    expect(posts[1]).not.toHaveProperty('content');
    expect(posts[1]).not.toHaveProperty('threadName');
    await liveBeacon.stop(context);
  });

  it('normalizes full Twitch and Kick channel URLs and creates direct YouTube and TikTok live links', async () => {
    let scheduled: (() => Promise<void>) | undefined; const { post, posts } = discord();
    const context = { settings: { enabled: true, webhookId: 'beacon', platforms: ['twitch', 'youtube', 'kick', 'tiktok'], destinationMode: 'channel', coalesceSeconds: 1, twitchLogin: 'https://www.twitch.tv/suraruisuh', youtubeChannelUrl: 'https://www.youtube.com/@TheHiddenSlothVillage', kickLogin: 'https://kick.com/suraruisuh', tiktokLogin: 'https://www.tiktok.com/@surakage' }, discord: { post }, schedule: { after: vi.fn((_delay, task) => { scheduled = task; return 'task'; }), cancel: vi.fn() }, state: { read: vi.fn(async () => ({})), write: vi.fn() } };
    await liveBeacon.start();
    await liveBeacon.onEvent(event('twitch', 'twitch-stream'), context);
    await liveBeacon.onEvent({ ...event('youtube', 'youtube-video-id'), payload: { title: 'Live now' } }, context);
    await liveBeacon.onEvent({ ...event('twitch', 'kick-stream'), platform: 'kick', channel: { name: 'ignored' } }, context);
    await liveBeacon.onEvent({ ...event('twitch', 'tiktok-stream'), platform: 'tiktok', channel: { name: 'ignored' } }, context);
    await runTask(scheduled);
    expect(posts.map((request) => request.embeds[0]?.url)).toEqual([
      'https://www.twitch.tv/suraruisuh',
      'https://www.youtube.com/@TheHiddenSlothVillage/live',
      'https://kick.com/suraruisuh',
      'https://www.tiktok.com/@surakage/live',
    ]);
    await liveBeacon.stop(context);
  });

  it('uses a real broadcast-app control only for selected fallback platforms and suppresses its simulated test', async () => {
    let scheduled: (() => Promise<void>) | undefined; const { post, posts } = discord();
    const context = { settings: { enabled: true, webhookId: 'beacon', platforms: ['twitch', 'tiktok'], fallbackPlatforms: ['tiktok'], coalesceSeconds: 1, twitchLogin: 'creator', tiktokLogin: '@surakage' }, discord: { post }, schedule: { after: vi.fn((_delay, task) => { scheduled = task; return 'task'; }), cancel: vi.fn() }, state: { read: vi.fn(async () => ({})), write: vi.fn() } };
    await liveBeacon.start();
    const control = { eventType: 'addon.thsv.live-beacon.broadcast-control', receivedAt: '2026-07-27T12:00:00.000Z', metadata: { simulated: false }, payload: { action: 'online', startedAt: '2026-07-27T12:00:00.000Z' } };
    await liveBeacon.onEvent({ ...control, metadata: { simulated: true } }, context);
    expect(context.schedule.after).not.toHaveBeenCalled();
    await liveBeacon.onEvent(control, context); await runTask(scheduled);
    expect(post).toHaveBeenCalledOnce();
    expect(posts[0]?.embeds[0]).toMatchObject({ title: '🔴 LIVE · TikTok', url: 'https://www.tiktok.com/@surakage/live', timestamp: '2026-07-27T12:00:00.000Z' });
    await liveBeacon.stop(context);
  });

  it('builds the platform-colored embed with artwork only when allowed', () => {
    const entry = { platform: 'twitch', url: 'https://www.twitch.tv/creator', title: 'Night', category: 'Art', channelName: 'Creator', startedAt: '2026-07-27T12:00:00.000Z', profileImageUrl: 'https://example.com/p.png', categoryArtUrl: 'https://example.com/a.png', thumbnailUrl: 'https://example.com/t.jpg' };
    expect(buildEmbed(entry, 'Twitch live', true)).toMatchObject({ color: 9529087, author: { name: 'Creator · Join the stream', icon_url: 'https://example.com/p.png' }, thumbnail: { url: 'https://example.com/a.png' }, image: { url: 'https://example.com/t.jpg' } });
    expect(buildEmbed(entry, 'Twitch live', false)).not.toHaveProperty('image');
  });
});
