import { afterEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import quoteVault, { parseQuoteSubmission, resetQuoteVaultRuntime, sanitizeQuoteVaultState, selectQuote } from '../../addons/quote-vault/dist/index.js';

function chatEvent(platform = 'twitch', message = '!quotesubmit @Streamer | The sloth has spoken.', roles: string[] = [], id = 'event-1') {
  return {
    eventId: id,
    eventType: 'chat.message',
    platform,
    receivedAt: '2026-07-23T12:00:00.000Z',
    channel: { name: 'channel' },
    user: { id: `${platform}-viewer-1`, name: 'viewer', displayName: 'Viewer', actorType: 'human', roles },
    payload: { message },
    metadata: { simulated: false },
  };
}

function runtime(settings: Record<string, unknown> = {}, initialState: Record<string, unknown> = {}) {
  let state = initialState;
  return {
    value: () => state,
    context: {
      settings: { enabled: true, enabledPlatforms: ['twitch', 'youtube', 'kick', 'tiktok'], ...settings },
      approvedActionIds: [],
      state: {
        read: vi.fn(async () => state),
        write: vi.fn(async (value: Record<string, unknown>) => { state = value; }),
      },
      chat: { send: vi.fn(async () => []) },
    },
  };
}

afterEach(async () => {
  await quoteVault.stop();
  resetQuoteVaultRuntime();
  vi.restoreAllMocks();
});

describe('Quote Vault add-on', () => {
  it('parses explicit attribution and Twitch reply submissions without retaining unrelated chat', () => {
    expect(parseQuoteSubmission(chatEvent(), '@Bloom | Stay curious.', 240)).toEqual({ quotedName: 'Bloom', text: 'Stay curious.' });
    expect(parseQuoteSubmission({
      ...chatEvent(),
      payload: { message: '!quotesubmit', isReply: true, replyMessage: 'A replied quote', replyUserName: 'Quoted Viewer', replyUserId: 'quoted-1' },
    }, '', 240)).toEqual({ quotedName: 'Quoted Viewer', quotedUserId: 'quoted-1', text: 'A replied quote' });
  });

  it('accepts submissions from every supported platform into one pending library', async () => {
    const testRuntime = runtime({ moderatorBypassCooldowns: true });
    await quoteVault.start(testRuntime.context);
    for (const [index, platform] of ['twitch', 'youtube', 'kick', 'tiktok'].entries()) {
      await quoteVault.onEvent(chatEvent(platform, `!quotesubmit @Creator | Quote ${String(index)}`, [], `event-${platform}`), testRuntime.context);
      const state = testRuntime.value() as { lastCommandAt?: number };
      state.lastCommandAt = 0;
    }
    expect(testRuntime.value()).toMatchObject({
      nextId: 5,
      pending: [
        { id: 1, sourcePlatform: 'twitch', text: 'Quote 0' },
        { id: 2, sourcePlatform: 'youtube', text: 'Quote 1' },
        { id: 3, sourcePlatform: 'kick', text: 'Quote 2' },
        { id: 4, sourcePlatform: 'tiktok', text: 'Quote 3' },
      ],
    });
    expect(testRuntime.context.chat.send).toHaveBeenCalledTimes(4);
  });

  it('keeps viewer submissions pending until a moderator approves them', async () => {
    const testRuntime = runtime();
    await quoteVault.onEvent(chatEvent(), testRuntime.context);
    expect(testRuntime.value()).toMatchObject({ approved: [], pending: [{ id: 1, status: 'pending' }] });

    await quoteVault.onEvent(chatEvent('youtube', '!quoteapprove 1', ['moderator'], 'approve-1'), testRuntime.context);
    expect(testRuntime.value()).toMatchObject({
      approved: [{ id: 1, status: 'approved', approvedBy: { platform: 'youtube', name: 'Viewer' } }],
      pending: [],
    });
    expect(testRuntime.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({
      routing: 'source',
      sourcePlatform: 'youtube',
      message: 'Quote #1 was approved.',
    }));
  });

  it('routes retrieval only to the command source and avoids immediate random repeats', async () => {
    const state = sanitizeQuoteVaultState({
      nextId: 3,
      approved: [
        { id: 1, text: 'First quote', quotedName: 'Alpha', sourcePlatform: 'twitch', submittedBy: { platform: 'twitch', id: 'a', name: 'Alpha' }, submittedAt: '2026-07-23T00:00:00.000Z', status: 'approved' },
        { id: 2, text: 'Second quote', quotedName: 'Beta', sourcePlatform: 'kick', submittedBy: { platform: 'kick', id: 'b', name: 'Beta' }, submittedAt: '2026-07-23T00:00:00.000Z', status: 'approved' },
      ],
      lastShownId: 1,
    });
    expect(selectQuote(state, '', () => 0)).toMatchObject({ id: 2 });
    const testRuntime = runtime({}, state);
    await quoteVault.onEvent(chatEvent('kick', '!quote 2', ['moderator'], 'get-2'), testRuntime.context);
    expect(testRuntime.context.chat.send).toHaveBeenCalledWith(expect.objectContaining({
      sourcePlatform: 'kick',
      message: 'Quote #2: “Second quote” — Beta',
    }));
  });

  it('rejects duplicates, links, bots, simulations, and unauthorized direct additions', async () => {
    const testRuntime = runtime();
    await quoteVault.onEvent(chatEvent('twitch', '!quoteadd @Creator | Existing', ['moderator'], 'add-1'), testRuntime.context);
    await quoteVault.onEvent(chatEvent('youtube', '!quotesubmit @Creator | Existing', [], 'duplicate-1'), testRuntime.context);
    await quoteVault.onEvent(chatEvent('kick', '!quotesubmit @Creator | https://unsafe.example', [], 'link-1'), testRuntime.context);
    await quoteVault.onEvent(chatEvent('tiktok', '!quoteadd @Creator | Not allowed', [], 'unauthorized-1'), testRuntime.context);
    await quoteVault.onEvent({ ...chatEvent('twitch', '!quotesubmit Bot quote', [], 'bot-1'), user: { ...chatEvent().user, actorType: 'bot' } }, testRuntime.context);
    await quoteVault.onEvent({ ...chatEvent('twitch', '!quotesubmit Simulated', [], 'sim-1'), metadata: { simulated: true } }, testRuntime.context);
    expect(testRuntime.value()).toMatchObject({ approved: [{ id: 1, text: 'Existing' }], pending: [] });
  });

  it('soft-deletes and restores approved quotes with a bounded audit trail', async () => {
    const initial = sanitizeQuoteVaultState({
      nextId: 2,
      approved: [{ id: 1, text: 'Recover me', quotedName: 'Bloom', sourcePlatform: 'twitch', submittedBy: { platform: 'twitch', id: 'a', name: 'Alpha' }, submittedAt: '2026-07-23T00:00:00.000Z', status: 'approved' }],
    });
    const testRuntime = runtime({}, initial);
    await quoteVault.onEvent(chatEvent('twitch', '!quotedelete 1', ['moderator'], 'delete-1'), testRuntime.context);
    expect(testRuntime.value()).toMatchObject({ approved: [], deleted: [{ id: 1, status: 'deleted' }] });
    await quoteVault.onEvent(chatEvent('twitch', '!quoterestore 1', ['moderator'], 'restore-1'), testRuntime.context);
    expect(testRuntime.value()).toMatchObject({ approved: [{ id: 1, status: 'approved' }], deleted: [] });
    expect((testRuntime.value() as { audit: unknown[] }).audit).toHaveLength(2);
  });

  it('caps corrupted or oversized state collections before use', () => {
    const quote = { text: 'Quote', quotedName: 'Bloom', sourcePlatform: 'twitch', submittedBy: { platform: 'twitch', name: 'Viewer' }, submittedAt: '2026-07-23T00:00:00.000Z' };
    const sanitized = sanitizeQuoteVaultState({
      approved: Array.from({ length: 200 }, (_, index) => ({ ...quote, id: index + 1, status: 'approved' })),
      pending: Array.from({ length: 50 }, (_, index) => ({ ...quote, id: index + 201, status: 'pending' })),
      deleted: Array.from({ length: 50 }, (_, index) => ({ ...quote, id: index + 251, status: 'deleted' })),
    });
    expect(sanitized.approved).toHaveLength(150);
    expect(sanitized.pending).toHaveLength(30);
    expect(sanitized.deleted).toHaveLength(20);
    expect(sanitized.nextId).toBe(301);
  });
});
