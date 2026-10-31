import { beforeEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- executable add-on helpers are verified plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import discordChatArchive, { archiveDiscordRequest, buildArchiveEmbeds, matchesIgnoredViewer, renderArchiveLine, resetDiscordChatArchiveRuntime, selectArchiveBatch, selectChatMessage } from '../../addons/discord-chat-archive/dist/index.js';

const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });
const settings = {
  enabled: true,
  webhookId: 'chat-archive',
  enabledPlatforms: ['twitch', 'youtube', 'kick', 'tiktok', 'facebook'],
  ignoreBots: true,
  ignoredUsers: [],
  ignoreCommands: false,
  commandPrefix: '!',
  includeSimulatedMessages: false,
  messageTemplate: '[{platform}] {displayName}: {message}',
  webhookDisplayName: 'THSV Chat Archive',
  destinationMode: 'channel',
  forumThreadName: 'Stream chat archive · {date}',
  forumTagIds: [],
  layoutStyle: 'clean-embeds',
  showSessionHeader: true,
  sessionHeaderTitle: 'Village Stream Chat Archive',
  showMessageTimes: true,
  twitchColor: '#9146ff',
  youtubeColor: '#ff0033',
  kickColor: '#53fc18',
  tiktokColor: '#25f4ee',
  facebookColor: '#1877f2',
  useViewerIdentityForSingleMessage: false,
  useViewerAvatarForSingleMessage: false,
  batchWindowSeconds: 5,
  maximumMessagesPerBatch: 10,
  maximumQueueMessages: 100,
  maximumMessageCharacters: 500,
  retryCount: 1,
  retryDelaySeconds: 10,
  showDroppedMessageNotice: true,
};
const event = {
  eventId: 'chat-1',
  eventType: 'chat.message',
  platform: 'twitch',
  receivedAt: '2026-07-23T12:00:00.000Z',
  channel: { id: 'channel-1', name: 'THSV' },
  user: { id: 'viewer-1', name: 'viewer', displayName: 'Viewer', actorType: 'human', avatarUrl: 'https://example.com/viewer.png' },
  payload: { message: 'Hello chat' },
  metadata: { simulated: false },
};

describe('Discord Chat Archive add-on', () => {
  beforeEach(() => resetDiscordChatArchiveRuntime());

  it('selects normalized public chat from every supported platform', () => {
    for (const platform of settings.enabledPlatforms) {
      expect(selectChatMessage({ ...event, eventId: `chat-${platform}`, platform }, settings)).toMatchObject({
        platform,
        message: 'Hello chat',
        user: { id: 'viewer-1', name: 'viewer', displayName: 'Viewer' },
      });
    }
  });

  it('fails closed for disabled platforms, bots, system actors, ignored viewers, commands, and simulations', () => {
    expect(selectChatMessage(event, { ...settings, enabledPlatforms: ['youtube'] })).toBeUndefined();
    expect(selectChatMessage({ ...event, user: { ...event.user, actorType: 'bot' } }, settings)).toBeUndefined();
    expect(selectChatMessage({ ...event, user: { ...event.user, actorType: 'system' } }, { ...settings, ignoreBots: false })).toBeUndefined();
    expect(selectChatMessage(event, { ...settings, ignoredUsers: ['TWITCH:ID:VIEWER-1'] })).toBeUndefined();
    expect(selectChatMessage({ ...event, payload: { message: '!help' } }, { ...settings, ignoreCommands: true })).toBeUndefined();
    expect(selectChatMessage({ ...event, metadata: { simulated: true } }, settings)).toBeUndefined();
  });

  it('supports exact global, platform-name, and stable platform-ID ignore rules', () => {
    expect(matchesIgnoredViewer('VIEWER', 'twitch', event.user)).toBe(true);
    expect(matchesIgnoredViewer('twitch:Viewer', 'twitch', event.user)).toBe(true);
    expect(matchesIgnoredViewer('twitch:id:VIEWER-1', 'twitch', event.user)).toBe(true);
    expect(matchesIgnoredViewer('youtube:viewer', 'twitch', event.user)).toBe(false);
    expect(matchesIgnoredViewer('view', 'twitch', event.user)).toBe(false);
  });

  it('archives Facebook in blue while honoring Page identity and platform opt-out filters', () => {
    const facebook = { ...event, platform: 'facebook', user: { ...event.user, name: 'The Hidden Sloth Village', displayName: 'The Hidden Sloth Village', id: 'page-123' } };
    expect(selectChatMessage(facebook, { ...settings, ignoredUsers: ['the hidden sloth village'] })).toBeUndefined();
    expect(selectChatMessage(facebook, { ...settings, ignoredUsers: ['facebook:id:page-123'] })).toBeUndefined();
    expect(selectChatMessage(facebook, { ...settings, enabledPlatforms: ['twitch'] })).toBeUndefined();
    const selected = selectChatMessage({ ...facebook, user: event.user, payload: { message: '@everyone hello' } }, settings);
    expect(buildArchiveEmbeds([selected], settings)).toEqual([expect.objectContaining({ title: 'Facebook chat', color: 0x1877f2, description: expect.stringContaining('@\u200beveryone') })]);
  });

  it('neutralizes Discord mentions and markdown from untrusted message values', () => {
    const selected = selectChatMessage({ ...event, payload: { message: '@everyone **hello** `code`' } }, settings);
    expect(selected).toBeDefined();
    const rendered = renderArchiveLine(settings.messageTemplate, selected);
    expect(rendered).toContain('@\u200beveryone');
    expect(rendered).toContain('\\*\\*hello\\*\\*');
    expect(rendered).toContain('\\`code\\`');
  });

  it('batches messages without exceeding the bounded Discord content limit', () => {
    const queue = Array.from({ length: 25 }, (_, index) => ({
      ...selectChatMessage({ ...event, eventId: `chat-${String(index)}`, payload: { message: `Message ${String(index)} ${'x'.repeat(300)}` } }, settings),
    }));
    const batch = selectArchiveBatch(queue, settings, 3);
    expect(batch?.count).toBeGreaterThan(0);
    expect(batch?.count).toBeLessThanOrEqual(10);
    expect([...(batch?.content ?? '')].length).toBeLessThanOrEqual(1900);
    expect(batch?.content).toContain('3 earlier messages omitted');
    expect(batch?.embeds[0]).toMatchObject({ title: 'Twitch chat', color: 0x9146ff, description: expect.stringContaining('Message 0') });
  });

  it('preserves conversation order in consecutive platform-colored groups', () => {
    const items = [
      selectChatMessage(event, settings),
      selectChatMessage({ ...event, eventId: 'chat-2', payload: { message: 'Second Twitch message' } }, settings),
      selectChatMessage({ ...event, eventId: 'chat-3', platform: 'youtube', payload: { message: 'YouTube message' } }, settings),
      selectChatMessage({ ...event, eventId: 'chat-4', platform: 'twitch', payload: { message: 'Back on Twitch' } }, settings),
    ].filter(Boolean);
    expect(buildArchiveEmbeds(items, settings)).toEqual([
      expect.objectContaining({ title: 'Twitch chat', color: 0x9146ff, description: expect.stringContaining('Second Twitch message') }),
      expect.objectContaining({ title: 'YouTube chat', color: 0xff0033, description: expect.stringContaining('YouTube message') }),
      expect.objectContaining({ title: 'Twitch chat', color: 0x9146ff, description: expect.stringContaining('Back on Twitch') }),
    ]);
  });

  it('waits for its batch window and posts once through the chosen Discord webhook', async () => {
    const callbacks: Array<() => unknown> = [];
    const post = vi.fn(async (request: Record<string, unknown>) => { void request; return { ok: true, messageId: '1' }; });
    const context = {
      settings,
      discord: { post },
      schedule: {
        after: vi.fn((_delay: number, callback: () => unknown) => {
          callbacks.push(callback);
          return `task-${String(callbacks.length)}`;
        }),
        cancel: vi.fn(() => true),
      },
    };

    await discordChatArchive.start(context);
    await discordChatArchive.onEvent(event, context);
    expect(post).not.toHaveBeenCalled();
    expect(context.schedule.after).toHaveBeenCalledWith(5_000, expect.any(Function));

    await callbacks[0]?.();
    await settle();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]?.[0]).toMatchObject({
      webhookId: 'chat-archive',
      content: expect.stringContaining('Village Stream Chat Archive'),
      embeds: [expect.objectContaining({ description: expect.stringContaining('Hello chat') })],
    });
    expect(post.mock.calls[0]?.[0]).not.toHaveProperty('threadName');
    await discordChatArchive.stop(context);
  });

  it('ignores chat until a webhook is chosen', async () => {
    const post = vi.fn(async () => ({ ok: true }));
    const context = { settings: { ...settings, webhookId: '' }, discord: { post }, schedule: { after: vi.fn(() => 'task'), cancel: vi.fn(() => true) } };
    await discordChatArchive.start(context);
    await discordChatArchive.onEvent(event, context);
    expect(context.schedule.after).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    await discordChatArchive.stop(context);
  });

  it('reuses one confirmed forum thread until the last live platform goes offline', async () => {
    const callbacks: Array<{ delay: number; callback: () => unknown }> = [];
    const post = vi.fn(async (request: Record<string, unknown>) => { void request; return { ok: true, messageId: '1', threadId: '987654321' }; });
    const context = {
      settings: { ...settings, destinationMode: 'forum' },
      discord: { post },
      schedule: {
        after: vi.fn((delay: number, callback: () => unknown) => { callbacks.push({ delay, callback }); return `task-${String(callbacks.length)}`; }),
        cancel: vi.fn(() => true),
      },
    };
    const flushLatest = async () => { await callbacks.filter((entry) => entry.delay === 5_000).at(-1)?.callback(); await settle(); };

    await discordChatArchive.start(context);
    await discordChatArchive.onEvent({ eventType: 'stream.online', platform: 'twitch' }, context);
    await discordChatArchive.onEvent({ eventType: 'stream.online', platform: 'facebook' }, context);
    await discordChatArchive.onEvent(event, context);
    await flushLatest();
    expect(post.mock.calls[0]?.[0]).toMatchObject({ threadName: expect.any(String) as string });
    expect(post.mock.calls[0]?.[0]).not.toHaveProperty('threadId');

    await discordChatArchive.onEvent({ ...event, eventId: 'chat-2' }, context);
    await flushLatest();
    expect(post.mock.calls[1]?.[0]).toMatchObject({ threadId: '987654321' });

    await discordChatArchive.onEvent({ eventType: 'stream.offline', platform: 'twitch' }, context);
    await discordChatArchive.onEvent({ ...event, platform: 'facebook', eventId: 'facebook-still-live' }, context);
    await flushLatest();
    expect(post.mock.calls[2]?.[0]).toMatchObject({ threadId: '987654321', embeds: [expect.objectContaining({ title: 'Facebook chat' })] });
    await discordChatArchive.onEvent({ eventType: 'stream.offline', platform: 'facebook' }, context);
    await discordChatArchive.onEvent({ ...event, eventId: 'chat-3' }, context);
    await flushLatest();
    expect(post.mock.calls[3]?.[0]).not.toHaveProperty('threadId');
    expect(post.mock.calls[3]?.[0]).toHaveProperty('threadName');
    await discordChatArchive.stop(context);
  });

  it('waits for Discord to confirm the forum thread before sending the next batch', async () => {
    const callbacks: Array<{ delay: number; callback: () => unknown }> = [];
    let confirm: (value: unknown) => void = () => undefined;
    const post = vi.fn((request: Record<string, unknown>) => {
      void request;
      return post.mock.calls.length === 1 ? new Promise((resolve) => { confirm = resolve; }) : Promise.resolve({ ok: true, threadId: '987654321' });
    });
    const context = {
      settings: { ...settings, destinationMode: 'forum', maximumMessagesPerBatch: 1 },
      discord: { post },
      schedule: { after: vi.fn((delay: number, callback: () => unknown) => { callbacks.push({ delay, callback }); return `task-${String(callbacks.length)}`; }), cancel: vi.fn(() => true) },
    };
    await discordChatArchive.start(context);
    await discordChatArchive.onEvent({ eventType: 'stream.online', platform: 'twitch', receivedAt: event.receivedAt }, context);
    await discordChatArchive.onEvent(event, context);
    await callbacks.find((entry) => entry.delay === 5_000)?.callback();
    await discordChatArchive.onEvent({ ...event, eventId: 'chat-waiting', payload: { message: 'Wait for the thread' } }, context);
    await settle();
    expect(post).toHaveBeenCalledTimes(1);
    confirm({ ok: true, messageId: '1', threadId: '987654321' });
    await settle();
    await callbacks.filter((entry) => entry.delay === 5_000).at(-1)?.callback();
    await settle();
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1]?.[0]).toMatchObject({ threadId: '987654321', embeds: [expect.objectContaining({ description: expect.stringContaining('Wait for the thread') })] });
    expect(post.mock.calls[1]?.[0]).not.toHaveProperty('content');
    await discordChatArchive.stop(context);
  });

  it('builds a forum request that starts a new post with tags only when no thread exists yet', () => {
    const delivery = { username: 'Chat', content: 'Hi', embeds: [], mode: 'forum' };
    expect(archiveDiscordRequest(delivery, { ...settings, forumTagIds: ['111111111111111111'] }, '', 'Archive')).toEqual({ webhookId: 'chat-archive', username: 'Chat', content: 'Hi', threadName: 'Archive', forumTagIds: ['111111111111111111'] });
    expect(archiveDiscordRequest(delivery, settings, '222222222222222222', 'Archive')).toEqual({ webhookId: 'chat-archive', username: 'Chat', content: 'Hi', threadId: '222222222222222222' });
  });
});
