import { beforeEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- executable add-on helpers are verified plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import discordChatArchive, { matchesIgnoredViewer, renderArchiveLine, resetDiscordChatArchiveRuntime, selectArchiveBatch, selectChatMessage } from '../../addons/discord-chat-archive/dist/index.js';

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
      discordArchiveContent: expect.stringContaining('Hello chat'),
      discordArchiveSimulated: false,
    }));

    const requestId = runApprovedAction.mock.calls[0]?.[1].discordArchiveRequestId;
    await discordChatArchive.onEvent({
      eventType: 'addon.thsv.discord-chat-archive.delivery-received',
      payload: { requestId, succeeded: true },
    }, context);
    await discordChatArchive.stop(context);
  });
});
