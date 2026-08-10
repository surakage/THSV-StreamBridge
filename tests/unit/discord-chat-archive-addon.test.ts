import { beforeEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- executable add-on helpers are verified plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import discordChatArchive, { buildArchiveEmbeds, matchesIgnoredViewer, renderArchiveLine, resetDiscordChatArchiveRuntime, selectArchiveBatch, selectChatMessage } from '../../addons/discord-chat-archive/dist/index.js';

const DELIVERY_ACTION_ID = 'df40969d-5923-4432-bdca-ecdee451f150';
const settings = {
  enabled: true,
  enabledPlatforms: ['twitch', 'youtube', 'kick', 'tiktok'],
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

  it('waits for its batch window and dispatches only the approved delivery action', async () => {
    const callbacks: Array<() => unknown> = [];
    const runApprovedAction = vi.fn(async (actionId: string, actionArguments: Record<string, unknown>) => {
      void actionId;
      void actionArguments;
    });
    const context = {
      settings,
      approvedActionIds: [DELIVERY_ACTION_ID],
      streamerbot: { runApprovedAction },
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
    expect(runApprovedAction).not.toHaveBeenCalled();
    expect(context.schedule.after).toHaveBeenCalledWith(5_000, expect.any(Function));

    await callbacks[0]?.();
    expect(runApprovedAction).toHaveBeenCalledTimes(1);
    expect(runApprovedAction).toHaveBeenCalledWith(DELIVERY_ACTION_ID, expect.objectContaining({
      discordArchiveContent: expect.stringContaining('Village Stream Chat Archive'),
      discordArchiveEmbedsJson: expect.stringContaining('Hello chat'),
      discordArchiveDestinationMode: 'channel',
      discordArchiveThreadId: '',
      discordArchiveSimulated: false,
    }));

    const requestId = runApprovedAction.mock.calls[0]?.[1].discordArchiveRequestId;
    await discordChatArchive.onEvent({
      eventType: 'addon.thsv.discord-chat-archive.delivery-received',
      payload: { requestId, succeeded: true },
    }, context);
    await discordChatArchive.stop(context);
  });

  it('reuses one confirmed forum thread until the last live platform goes offline', async () => {
    const callbacks: Array<{ delay: number; callback: () => unknown }> = [];
    const runApprovedAction = vi.fn(async (actionId: string, actionArguments: Record<string, unknown>) => { void actionId; void actionArguments; });
    const context = {
      settings: { ...settings, destinationMode: 'forum' },
      approvedActionIds: [DELIVERY_ACTION_ID],
      streamerbot: { runApprovedAction },
      schedule: {
        after: vi.fn((delay: number, callback: () => unknown) => { callbacks.push({ delay, callback }); return `task-${String(callbacks.length)}`; }),
        cancel: vi.fn(() => true),
      },
    };

    await discordChatArchive.start(context);
    await discordChatArchive.onEvent({ eventType: 'stream.online', platform: 'twitch' }, context);
    await discordChatArchive.onEvent(event, context);
    await callbacks.find((entry) => entry.delay === 5_000)?.callback();
    const firstArguments = runApprovedAction.mock.calls[0]?.[1];
    expect(firstArguments).toBeDefined();
    if (firstArguments === undefined) throw new Error('The first forum delivery was not dispatched.');
    expect(firstArguments).toMatchObject({ discordArchiveDestinationMode: 'forum', discordArchiveThreadId: '' });
    await discordChatArchive.onEvent({ eventType: 'addon.thsv.discord-chat-archive.delivery-received', payload: { requestId: firstArguments.discordArchiveRequestId, succeeded: true, threadId: '987654321' } }, context);

    await discordChatArchive.onEvent({ ...event, eventId: 'chat-2' }, context);
    const flushes = callbacks.filter((entry) => entry.delay === 5_000);
    await flushes.at(-1)?.callback();
    expect(runApprovedAction.mock.calls[1]?.[1]).toMatchObject({ discordArchiveThreadId: '987654321' });
    const secondArguments = runApprovedAction.mock.calls[1]?.[1];
    await discordChatArchive.onEvent({ eventType: 'addon.thsv.discord-chat-archive.delivery-received', payload: { requestId: secondArguments?.discordArchiveRequestId, succeeded: true, threadId: '987654321' } }, context);

    await discordChatArchive.onEvent({ eventType: 'stream.offline', platform: 'twitch' }, context);
    await discordChatArchive.onEvent({ ...event, eventId: 'chat-3' }, context);
    await callbacks.filter((entry) => entry.delay === 5_000).at(-1)?.callback();
    expect(runApprovedAction.mock.calls[2]?.[1]).toMatchObject({ discordArchiveThreadId: '' });
    await discordChatArchive.stop(context);
  });

  it('waits for Discord to confirm the forum thread before sending the next batch', async () => {
    const callbacks: Array<{ delay: number; callback: () => unknown }> = [];
    const runApprovedAction = vi.fn(async (actionId: string, actionArguments: Record<string, unknown>) => { void actionId; void actionArguments; });
    const context = {
      settings: { ...settings, destinationMode: 'forum', maximumMessagesPerBatch: 1 },
      approvedActionIds: [DELIVERY_ACTION_ID], streamerbot: { runApprovedAction },
      schedule: { after: vi.fn((delay: number, callback: () => unknown) => { callbacks.push({ delay, callback }); return `task-${String(callbacks.length)}`; }), cancel: vi.fn(() => true) },
    };
    await discordChatArchive.start(context);
    await discordChatArchive.onEvent({ eventType: 'stream.online', platform: 'twitch', receivedAt: event.receivedAt }, context);
    await discordChatArchive.onEvent(event, context);
    await callbacks.find((entry) => entry.delay === 5_000)?.callback();
    await discordChatArchive.onEvent({ ...event, eventId: 'chat-waiting', payload: { message: 'Wait for the thread' } }, context);
    expect(runApprovedAction).toHaveBeenCalledTimes(1);
    const first = runApprovedAction.mock.calls[0]?.[1];
    await discordChatArchive.onEvent({ eventType: 'addon.thsv.discord-chat-archive.delivery-received', payload: { requestId: first?.discordArchiveRequestId, succeeded: true, threadId: '987654321' } }, context);
    await callbacks.filter((entry) => entry.delay === 5_000).at(-1)?.callback();
    expect(runApprovedAction).toHaveBeenCalledTimes(2);
    expect(runApprovedAction.mock.calls[1]?.[1]).toMatchObject({ discordArchiveThreadId: '987654321', discordArchiveContent: '', discordArchiveEmbedsJson: expect.stringContaining('Wait for the thread') });
    await discordChatArchive.stop(context);
  });
});
