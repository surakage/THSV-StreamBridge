import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-on entrypoints are intentionally plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import villageDraw, { administerVillageDraw, buyTickets, chooseWinner, drawPanel, runDeadlines, stateFor } from '../../addons/village-draw/dist/index.js';
import type { NormalizedEvent } from '../../schemas/event.js';

const displayNames: Record<string, string> = { 'viewer-1': 'Viewer One', 'viewer-2': 'Viewer Two', 'viewer-3': 'Viewer Three' };

function command(name: string, args: string[] = [], simulated = false, userId = 'viewer-1', roles: string[] = []): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: `${name}-${userId}-${args.join('-') || 'none'}`, eventType: 'command.received', platform: 'twitch',
    source: { adapter: 'test', eventId: `source-${name}-${userId}`, eventName: 'Command' }, receivedAt: '2026-07-31T12:00:00.000Z',
    channel: { id: 'channel-1', name: 'Example Channel' },
    user: { id: userId, name: userId, displayName: displayNames[userId] ?? userId, actorType: 'human', roles },
    payload: { command: name, invokedAs: name, arguments: args, rawInput: `!${name} ${args.join(' ')}`.trim(), prefix: '!', minimumRole: 'viewer', allowBots: false },
    metadata: { simulated },
  };
}

function chatCommand(message: string, userId = 'viewer-1', roles: string[] = [], receivedAt = '2026-07-31T12:00:00.000Z'): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: `chat-${userId}-${message}`, eventType: 'chat.message', platform: 'twitch',
    source: { adapter: 'test', eventId: `source-chat-${userId}-${message}`, eventName: 'Chat Message' }, receivedAt,
    channel: { id: 'channel-1', name: 'Example Channel' },
    user: { id: userId, name: userId, displayName: displayNames[userId] ?? userId, actorType: 'human', roles },
    payload: { message }, metadata: { simulated: false },
  };
}

function streamEvent(eventType: 'stream.online' | 'stream.offline', platform: 'twitch' | 'youtube'): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: `${eventType}-${platform}`, eventType, platform,
    source: { adapter: 'test', eventId: `source-${eventType}-${platform}`, eventName: eventType }, receivedAt: '2026-07-31T12:00:00.000Z',
    channel: { id: 'channel-1', name: 'Example Channel' }, payload: {}, metadata: { simulated: false },
  };
}

function harness(settings: Record<string, unknown> = {}) {
  let state: unknown;
  const balances = new Map([['viewer-one', 1_000], ['viewer-two', 1_000], ['viewer-three', 1_000]]);
  const accountIds = new Map([['viewer-1', 'viewer-one'], ['viewer-2', 'viewer-two'], ['viewer-3', 'viewer-three']]);
  const mutations = new Map<string, Record<string, unknown>>();
  const scheduled: Array<() => Promise<unknown>> = [];
  const chat: Array<Record<string, unknown>> = [];
  const overlays: Array<{ topic: string; payload: Record<string, unknown> }> = [];
  let failSpend = settings['testFailSpend'] === true;
  const context = {
    settings: { enabled: true, giveawayName: 'Cozy Draw', description: 'A friendly test draw.', prizeItem: 'Cozy Key', announcementPlatforms: ['twitch'], reminderMinutes: 0, claimSeconds: 0, ...settings },
    state: { read: vi.fn(async () => state), write: vi.fn(async (value: unknown) => { state = structuredClone(value); }) },
    schedule: { after: vi.fn((_delay: number, task: () => Promise<unknown>) => { scheduled.push(task); return `task-${String(scheduled.length)}`; }), cancel: vi.fn(() => true) },
    chat: { send: vi.fn(async (request: Record<string, unknown>) => { chat.push(request); return [{ platform: 'twitch', accepted: true, parts: 1, error: undefined as string | undefined }]; }) },
    overlay: { publish: vi.fn(async (topic: string, payload: Record<string, unknown>) => { overlays.push({ topic, payload }); }) },
    viewerFoundation: {
      getProjection: vi.fn(async (query: Record<string, unknown>) => {
        const viewerId = typeof query['viewerId'] === 'string' ? query['viewerId'] : accountIds.get(String(query['userId']));
        return viewerId ? { contractVersion: '1.0.0', viewerId, linked: true, points: balances.get(viewerId) ?? 0, level: 1, nextLevelAt: 100 } : undefined;
      }),
      mutate: vi.fn(async (request: Record<string, unknown>) => {
        const key = String(request['idempotencyKey']); const duplicate = mutations.has(key); const viewerId = String(request['viewerId']); const previousPoints = balances.get(viewerId) ?? 0;
        if (!duplicate) {
          const amount = Number(request['amount']); const operation = String(request['operation']);
          if (operation === 'spend' && failSpend) throw new Error('Temporary points provider failure.');
          if (operation === 'spend' && previousPoints < amount) throw new Error('Insufficient points.');
          balances.set(viewerId, operation === 'spend' ? previousPoints - amount : previousPoints + amount);
          mutations.set(key, { viewerId, operation, amount, previousPoints });
        }
        const record = mutations.get(key) ?? {}; return { contractVersion: '1.0.0', viewerId, linked: true, points: balances.get(viewerId), level: 1, nextLevelAt: 100, ...record, duplicate };
      }),
      onDeleted: vi.fn(() => vi.fn()),
    },
  };
  return { context, scheduled, chat, overlays, state: () => state, points: (id: string) => balances.get(id), setFailSpend: (value: boolean) => { failSpend = value; } };
}

describe('Village Draw add-on', () => {
  it('runs a free single-entry lifecycle and records the server-selected ticket receipt', async () => {
    const runtime = harness({ entryMode: 'free-single' });
    await villageDraw.start(runtime.context);
    await administerVillageDraw({ operation: 'open', approvedByCreator: true }, runtime.context, 1_000);
    expect(await buyTickets(command('enter'), runtime.context, stateFor(runtime.state()), 1)).toMatchObject({ accepted: true, tickets: 1 });
    expect(await buyTickets(command('enter'), runtime.context, stateFor(runtime.state()), 1)).toMatchObject({ accepted: false, reason: 'viewer-limit' });
    await administerVillageDraw({ operation: 'close', approvedByCreator: true }, runtime.context, 2_000);
    const result = await administerVillageDraw({ operation: 'draw', approvedByCreator: true }, runtime.context, 3_000, () => 0);
    expect(result).toMatchObject({ status: 'drawn', winner: 'Viewer One', entrantCount: 1, totalTickets: 1 });
    expect(result.receipt).toMatchObject({ selectedTicket: 1, totalTickets: 1, entrantCount: 1 });
    expect(String((result.receipt as Record<string, unknown>)['snapshotDigest'])).toMatch(/^[a-f0-9]{64}$/u);
    expect(runtime.overlays.at(-1)?.topic).toBe('thsv.village-draw.card.show');
    await villageDraw.stop(runtime.context);
  });

  it('spends Viewer Foundation points for weighted tickets and refunds in a persisted background batch', async () => {
    const runtime = harness({ entryMode: 'points-multiple', ticketCost: 50, maxTicketsPerViewer: 10 });
    await villageDraw.start(runtime.context);
    await villageDraw.administerVillageDraw({ operation: 'open', approvedByCreator: true }, runtime.context);
    expect(await buyTickets(command('tickets', ['3']), runtime.context, stateFor(runtime.state()), 3)).toMatchObject({ accepted: true, tickets: 3, points: 850 });
    expect(runtime.points('viewer-one')).toBe(850);
    const canceling = await villageDraw.administerVillageDraw({ operation: 'cancel', approvedByCreator: true }, runtime.context);
    expect(canceling).toMatchObject({ status: 'canceling', totalPointsSpent: 150 });
    expect(runtime.scheduled).toHaveLength(1);
    await runtime.scheduled[0]?.();
    expect(runtime.points('viewer-one')).toBe(1_000);
    expect(stateFor(runtime.state()).active).toMatchObject({ status: 'canceled', pendingRefunds: [] });
    await villageDraw.stop(runtime.context);
  });

  it('reads commands directly from normalized chat and deduplicates the derived command copy', async () => {
    const runtime = harness({ entryMode: 'free-single', commandPrefix: '?' });
    await villageDraw.start(runtime.context);
    await villageDraw.onEvent(chatCommand('?giveaway open', 'viewer-2', ['broadcaster']), runtime.context);
    const receivedAt = '2026-07-31T12:01:00.000Z';
    await villageDraw.onEvent(chatCommand('?enter', 'viewer-1', [], receivedAt), runtime.context);
    expect(runtime.chat).toHaveLength(3);
    const derived = command('enter'); derived.receivedAt = receivedAt; derived.payload = { ...derived.payload, rawInput: '?enter', prefix: '?' };
    await villageDraw.onEvent(derived, runtime.context);
    expect(stateFor(runtime.state()).active).toMatchObject({ status: 'open', entries: [expect.objectContaining({ viewerId: 'viewer-one', tickets: 1 })] });
    expect(runtime.chat).toHaveLength(3);
    await villageDraw.stop(runtime.context);
  });

  it('waits for every live platform to end before applying the stream-end close rule', async () => {
    const runtime = harness({ entryMode: 'free-single', streamEndBehavior: 'close' });
    await villageDraw.start(runtime.context); await villageDraw.administerVillageDraw({ operation: 'open', approvedByCreator: true }, runtime.context);
    await villageDraw.onEvent(streamEvent('stream.online', 'twitch'), runtime.context);
    await villageDraw.onEvent(streamEvent('stream.online', 'youtube'), runtime.context);
    await villageDraw.onEvent(streamEvent('stream.offline', 'twitch'), runtime.context);
    expect(stateFor(runtime.state()).active?.status).toBe('open');
    await villageDraw.onEvent(streamEvent('stream.offline', 'youtube'), runtime.context);
    expect(stateFor(runtime.state()).active?.status).toBe('closed');
    await villageDraw.stop(runtime.context);
  });

  it('blocks a frozen draw while a purchase is unresolved and refunds it safely after cancellation', async () => {
    const runtime = harness({ entryMode: 'points-multiple', ticketCost: 50, testFailSpend: true });
    await villageDraw.start(runtime.context); await villageDraw.administerVillageDraw({ operation: 'open', approvedByCreator: true }, runtime.context, 1_000);
    const state = stateFor(runtime.state());
    state.active?.pendingPurchases.push({ viewerId: 'viewer-one', idempotencyKey: 'purchase-recovery-test', displayName: 'Viewer One', platform: 'twitch', tickets: 1, amount: 50, createdAt: '2026-07-31T12:00:00.000Z' });
    await runtime.context.state.write(state);
    await expect(villageDraw.administerVillageDraw({ operation: 'close', approvedByCreator: true }, runtime.context)).rejects.toThrow('pending ticket purchase');
    expect(stateFor(runtime.state()).active?.status).toBe('open');
    await expect(villageDraw.administerVillageDraw({ operation: 'cancel', approvedByCreator: true }, runtime.context)).resolves.toMatchObject({ status: 'canceling', pendingPurchases: 1 });
    runtime.setFailSpend(false);
    await runtime.scheduled[0]?.();
    await runtime.scheduled[1]?.();
    expect(stateFor(runtime.state()).active).toMatchObject({ status: 'canceled', entries: [], pendingPurchases: [] });
    expect(runtime.points('viewer-one')).toBe(1_000);
    await villageDraw.stop(runtime.context);
  });

  it('records an actionable warning when every selected chat delivery is rejected', async () => {
    const runtime = harness();
    runtime.context.chat.send.mockResolvedValue([{ platform: 'twitch', accepted: false, parts: 0, error: 'not connected' }]);
    await villageDraw.start(runtime.context); await villageDraw.administerVillageDraw({ operation: 'open', approvedByCreator: true }, runtime.context);
    await expect(villageDraw.administerVillageDraw({ operation: 'status' }, runtime.context)).resolves.toMatchObject({ deliveryWarning: expect.stringContaining('not connected') });
    await villageDraw.stop(runtime.context);
  });

  it('keeps simulations side-effect free and ships only bounded broker permissions', async () => {
    const runtime = harness(); await villageDraw.start(runtime.context); const before = JSON.stringify(runtime.state());
    await villageDraw.onEvent(command('enter', [], true), runtime.context);
    expect(JSON.stringify(runtime.state())).toBe(before);
    expect(runtime.overlays).toHaveLength(1); expect(runtime.chat).toHaveLength(0);
    expect(chooseWinner([{ viewerId: 'a', tickets: 1 }, { viewerId: 'b', tickets: 3 }], () => 3)?.entry.viewerId).toBe('b');
    const descriptor = JSON.parse(await readFile('addons/village-draw/module-package.json', 'utf8')) as { permissions: string[]; manifest: { dependencies: string[]; actionsProvided: unknown[] } };
    expect(descriptor.permissions).toEqual(['events.subscribe', 'state.private', 'schedule.bounded', 'chat.send', 'overlay.publish', 'viewer.foundation.read', 'viewer.foundation.mutate']);
    expect(descriptor.manifest.dependencies).toEqual(['thsv.viewer-foundation']); expect(descriptor.manifest.actionsProvided).toEqual([]);
    await villageDraw.stop(runtime.context);
  });

  it('keeps hostile maximum persisted state within the private-state broker budget', () => {
    const stamp = '2026-07-31T12:00:00.000Z';
    const entries = Array.from({ length: 1_000 }, (_, index) => ({
      viewerId: `viewer-${String(index).padStart(4, '0')}`,
      displayName: `Viewer ${String(index)} ${'x'.repeat(68)}`,
      platform: 'twitch', userId: 'u'.repeat(256), luck: 5, tickets: 100, pointsSpent: 1_000_000, refundedPoints: 0, firstAt: stamp, lastAt: stamp,
    }));
    const pendingPurchases = Array.from({ length: 20 }, (_, index) => ({
      viewerId: `pending-${String(index).padStart(2, '0')}`,
      idempotencyKey: `purchase-${String(index)}-${'x'.repeat(110)}`,
      displayName: `Pending ${String(index)} ${'x'.repeat(67)}`,
      platform: 'youtube', tickets: 100, amount: 1_000_000, createdAt: stamp,
    }));
    const receipt = { giveawayId: `draw-${'x'.repeat(95)}`, selectedTicket: 50_000, totalTickets: 50_000, entrantCount: 1_000, snapshotDigest: 'a'.repeat(64), drawnAt: stamp };
    const history = Array.from({ length: 20 }, (_, index) => ({
      id: `history-${String(index)}-${'x'.repeat(90)}`, winner: `Winner ${String(index)} ${'x'.repeat(68)}`,
      entrantCount: 1_000, totalTickets: 50_000, drawnAt: stamp, receipt, winners: Array.from({ length: 10 }, () => 'w'.repeat(80)), winnerIds: Array.from({ length: 10 }, (_, item) => `winner-${String(item)}`),
    }));
    const bounded = stateFor({
      version: 1, sequence: 1_000_000_000, history,
      active: {
        id: `draw-${'x'.repeat(95)}`, status: 'canceling', name: 'n'.repeat(100), description: 'd'.repeat(500), prize: 'p'.repeat(160),
        imageUrl: `https://example.com/${'i'.repeat(2000)}`, entryMode: 'points-multiple', ticketCost: 10_000,
        maxTicketsPerViewer: 100, maximumEntrants: 1_000, maximumTotalTickets: 50_000, eligiblePlatforms: ['twitch', 'youtube', 'kick', 'tiktok'],
        createdAt: stamp, openedAt: stamp, closedAt: stamp, drawnAt: stamp, entries, pendingPurchases,
        pendingRefunds: entries.map((entry) => entry.viewerId), winners: Array.from({ length: 60 }, (_, index) => ({ ...entries[index], state: 'skipped', receipt, drawnAt: stamp })), excludedViewerIds: entries.map((entry) => entry.viewerId),
      },
    });
    expect(bounded.active?.entries).toHaveLength(1_000);
    expect(bounded.active?.winners).toHaveLength(50);
    expect(bounded.active?.pendingPurchases).toHaveLength(5);
    expect(bounded.history).toHaveLength(20);
    expect(Buffer.byteLength(JSON.stringify(bounded), 'utf8')).toBeLessThanOrEqual(786_432);
  });
  it('draws several winners, redraws one who is away, and ends with a saved history', async () => {
    const runtime = harness({ entryMode: 'free-single', winnerCount: 2 });
    await villageDraw.start(runtime.context);
    await administerVillageDraw({ operation: 'open', approvedByCreator: true }, runtime.context, 1_000);
    for (const id of ['viewer-1', 'viewer-2', 'viewer-3']) await buyTickets(command('enter', [], false, id), runtime.context, stateFor(runtime.state()), 1);
    // Drawing straight from an open giveaway closes entries first.
    const first = await administerVillageDraw({ operation: 'draw', approvedByCreator: true }, runtime.context, 2_000, () => 0);
    expect(first).toMatchObject({ status: 'drawn', winner: 'Viewer One', winnerCount: 2 });
    expect(runtime.chat.some((message) => String(message['message']).includes('are closed'))).toBe(true);
    const redrawn = await administerVillageDraw({ operation: 'redraw', approvedByCreator: true }, runtime.context, 3_000, () => 0);
    expect(redrawn).toMatchObject({ winner: 'Viewer Two' });
    expect((redrawn.winners as Array<Record<string, unknown>>).map((winner) => winner['state'])).toEqual(['skipped', 'pending']);
    await administerVillageDraw({ operation: 'confirm', approvedByCreator: true }, runtime.context, 4_000);
    expect(stateFor(runtime.state()).active?.status).toBe('drawn');
    await administerVillageDraw({ operation: 'draw', approvedByCreator: true }, runtime.context, 5_000, () => 0);
    const ended = await administerVillageDraw({ operation: 'confirm', approvedByCreator: true }, runtime.context, 6_000);
    expect(ended).toMatchObject({ status: 'ended', historyCount: 1 });
    expect(stateFor(runtime.state()).history.at(-1)).toMatchObject({ winners: ['Viewer Two', 'Viewer Three'], winnerIds: ['viewer-two', 'viewer-three'], entrantCount: 3 });
    expect(String(runtime.chat.at(-1)?.['message'])).toContain('Viewer Two, Viewer Three');
    await villageDraw.onEvent(chatCommand('!winners', 'viewer-1'), runtime.context);
    expect(String(runtime.chat.at(-1)?.['message'])).toContain('Viewer Two, Viewer Three');
    await expect(administerVillageDraw({ operation: 'draw', approvedByCreator: true }, runtime.context, 7_000)).rejects.toThrow();
    await villageDraw.stop(runtime.context);
  });

  it('lets the winner claim by chatting and redraws by itself when a winner never answers', async () => {
    const runtime = harness({ entryMode: 'free-single', claimSeconds: 30, noClaimAction: 'redraw', drawAnimationSeconds: 2 });
    await villageDraw.start(runtime.context);
    await administerVillageDraw({ operation: 'open', approvedByCreator: true }, runtime.context, 1_000);
    for (const id of ['viewer-1', 'viewer-2']) await buyTickets(command('enter', [], false, id), runtime.context, stateFor(runtime.state()), 1);
    await administerVillageDraw({ operation: 'draw', approvedByCreator: true }, runtime.context, 10_000, () => 0);
    expect(String(runtime.chat.at(-1)?.['message'])).toContain('within 30 seconds');
    expect(stateFor(runtime.state()).active?.winners[0]).toMatchObject({ state: 'pending', claimDeadline: 42_000 });
    // Nobody answered: the claim time runs out and someone else is drawn.
    await runDeadlines(runtime.context, 42_000, () => 0);
    const afterTimeout = stateFor(runtime.state()).active;
    expect(afterTimeout?.winners.map((winner: { state: string; displayName: string }) => [winner.displayName, winner.state])).toEqual([['Viewer One', 'skipped'], ['Viewer Two', 'pending']]);
    expect(runtime.chat.some((message) => String(message['message']).includes('Viewer One did not claim in time'))).toBe(true);
    // The new winner says anything in chat and claims the prize.
    await villageDraw.onEvent(chatCommand('hello I am here', 'viewer-2'), runtime.context);
    expect(stateFor(runtime.state()).active?.winners[1]).toMatchObject({ state: 'claimed', claimDeadline: 0 });
    expect(String(runtime.chat.at(-1)?.['message'])).toContain('Viewer Two claimed Cozy Key');
    expect(runtime.overlays.at(-1)?.payload).toMatchObject({ phase: 'claimed' });
    await villageDraw.stop(runtime.context);
  });

  it('only accepts the claim command when that is required', async () => {
    const runtime = harness({ entryMode: 'free-single', claimSeconds: 60, claimMode: 'claim-command' });
    await villageDraw.start(runtime.context);
    await administerVillageDraw({ operation: 'open', approvedByCreator: true }, runtime.context, 1_000);
    await buyTickets(command('enter'), runtime.context, stateFor(runtime.state()), 1);
    await administerVillageDraw({ operation: 'draw', approvedByCreator: true }, runtime.context, 2_000, () => 0);
    await villageDraw.onEvent(chatCommand('hi', 'viewer-1'), runtime.context);
    expect(stateFor(runtime.state()).active?.winners[0]?.state).toBe('pending');
    await villageDraw.onEvent(chatCommand('!claim', 'viewer-1', [], '2026-07-31T12:05:00.000Z'), runtime.context);
    expect(stateFor(runtime.state()).active?.winners[0]?.state).toBe('claimed');
    await villageDraw.stop(runtime.context);
  });

  it('closes by itself after the set minutes, with reminders and a last call before that', async () => {
    const runtime = harness({ entryMode: 'free-single', autoCloseMinutes: 10, reminderMinutes: 4 });
    await villageDraw.start(runtime.context);
    await administerVillageDraw({ operation: 'open', approvedByCreator: true }, runtime.context, 0);
    expect(stateFor(runtime.state()).active).toMatchObject({ closesAt: 600_000, nextReminderAt: 240_000 });
    expect(runtime.scheduled.length).toBeGreaterThan(0);
    await buyTickets(command('enter'), runtime.context, stateFor(runtime.state()), 1);
    await runDeadlines(runtime.context, 240_000);
    expect(String(runtime.chat.at(-1)?.['message'])).toContain('is still open');
    expect(String(runtime.chat.at(-1)?.['message'])).toContain('1 entered so far');
    await runDeadlines(runtime.context, 540_000);
    expect(String(runtime.chat.at(-1)?.['message'])).toContain('Last call');
    await runDeadlines(runtime.context, 600_000);
    expect(stateFor(runtime.state()).active).toMatchObject({ status: 'closed', closesAt: 0 });
    expect(String(runtime.chat.at(-1)?.['message'])).toContain('are closed');
    await villageDraw.stop(runtime.context);
  });

  it('applies who-can-enter, extra luck, recent-winner skipping, and the max ticket shortcut', async () => {
    const runtime = harness({ entryMode: 'points-multiple', ticketCost: 100, maxTicketsPerViewer: 20, entryRoles: ['subscribers', 'vips'], subscriberLuck: 3 });
    await villageDraw.start(runtime.context);
    await administerVillageDraw({ operation: 'open', approvedByCreator: true }, runtime.context, 1_000);
    expect(await buyTickets(command('tickets', ['1'], false, 'viewer-1'), runtime.context, stateFor(runtime.state()), 1)).toMatchObject({ accepted: false, reason: 'role-not-eligible' });
    expect(await buyTickets(command('tickets', ['max'], false, 'viewer-1', ['subscriber']), runtime.context, stateFor(runtime.state()), 'max')).toMatchObject({ accepted: true, tickets: 10, points: 0 });
    expect(stateFor(runtime.state()).active?.entries[0]).toMatchObject({ luck: 3, tickets: 10 });
    expect(chooseWinner([{ viewerId: 'a', tickets: 1, luck: 1 }, { viewerId: 'b', tickets: 1, luck: 3 }], () => 1)?.entry.viewerId).toBe('b');
    await administerVillageDraw({ operation: 'draw', approvedByCreator: true }, runtime.context, 2_000, () => 0);
    await administerVillageDraw({ operation: 'end', approvedByCreator: true }, runtime.context, 3_000);
    Object.assign(runtime.context.settings, { entryRoles: ['everyone'], skipRecentWinners: 1, entryMode: 'free-single' });
    await administerVillageDraw({ operation: 'open', approvedByCreator: true }, runtime.context, 4_000);
    expect(await buyTickets(command('enter', [], false, 'viewer-1'), runtime.context, stateFor(runtime.state()), 1)).toMatchObject({ accepted: false, reason: 'recent-winner' });
    expect(await buyTickets(command('enter', [], false, 'viewer-2'), runtime.context, stateFor(runtime.state()), 1)).toMatchObject({ accepted: true });
    await villageDraw.stop(runtime.context);
  });

  it('removes an entrant with a refund and refuses to end a paid giveaway without a winner', async () => {
    const runtime = harness({ entryMode: 'points-single', ticketCost: 40 });
    await villageDraw.start(runtime.context);
    await administerVillageDraw({ operation: 'open', approvedByCreator: true }, runtime.context, 1_000);
    await buyTickets(command('enter', [], false, 'viewer-1'), runtime.context, stateFor(runtime.state()), 1);
    await buyTickets(command('enter', [], false, 'viewer-2'), runtime.context, stateFor(runtime.state()), 1);
    expect(runtime.points('viewer-one')).toBe(960);
    await administerVillageDraw({ operation: 'remove', approvedByCreator: true, viewerId: 'viewer-one' }, runtime.context, 2_000);
    expect(runtime.points('viewer-one')).toBe(1_000);
    expect(stateFor(runtime.state()).active?.entries.map((entry: { viewerId: string }) => entry.viewerId)).toEqual(['viewer-two']);
    await expect(administerVillageDraw({ operation: 'end', approvedByCreator: true }, runtime.context, 3_000)).rejects.toThrow('Cancel and refund');
    await villageDraw.stop(runtime.context);
  });

  it('shows the Control Panel tab with entries, remove buttons, winners and past giveaways', async () => {
    const runtime = harness({ entryMode: 'free-single', claimSeconds: 60 });
    await villageDraw.start(runtime.context);
    let panel = await drawPanel({ operation: 'action', action: 'open' }, runtime.context, 1_000);
    expect(panel.message).toBe('Giveaway started.');
    await buyTickets(command('enter', [], false, 'viewer-1'), runtime.context, stateFor(runtime.state()), 1);
    await buyTickets(command('enter', [], false, 'viewer-2'), runtime.context, stateFor(runtime.state()), 1);
    panel = await drawPanel({ operation: 'status' }, runtime.context, 2_000);
    const entries = panel.lists.find((list: { title: string }) => list.title === 'Entries');
    expect(entries.items).toHaveLength(2);
    expect(entries.items[0].actions[0]).toMatchObject({ action: 'remove', values: { viewerId: expect.any(String) } });
    expect(entries.items[0].detail).toContain('50%');
    panel = await drawPanel({ operation: 'action', action: 'draw' }, runtime.context, 3_000);
    expect(panel.actions.map((action: { action: string }) => action.action)).toEqual(['confirm', 'redraw', 'end', 'cancel']);
    const winners = panel.lists.find((list: { title: string }) => list.title === 'Winners');
    expect(winners.items[0].detail).toContain('left');
    panel = await drawPanel({ operation: 'action', action: 'confirm' }, runtime.context, 4_000);
    expect(panel.message).toBe('Giveaway ended and saved to the history.');
    expect(panel.lists.find((list: { title: string }) => list.title === 'Past giveaways').items).toHaveLength(1);
    expect(panel.actions.map((action: { action: string }) => action.action)).toEqual(['open']);
    await villageDraw.stop(runtime.context);
  });

  it('keeps a giveaway saved by an older version working', async () => {
    const stamp = '2026-07-31T12:00:00.000Z';
    const legacy = stateFor({ version: 1, sequence: 3, history: [{ id: 'old', winner: 'Old Winner', entrantCount: 4, totalTickets: 4, drawnAt: stamp }],
      active: { id: 'draw-3', status: 'drawn', name: 'Old', prize: 'Thing', entryMode: 'free-single', entries: [{ viewerId: 'viewer-one', displayName: 'Viewer One', platform: 'twitch', tickets: 1, pointsSpent: 0, refundedPoints: 0, firstAt: stamp, lastAt: stamp }],
        winner: { viewerId: 'viewer-one', displayName: 'Viewer One', platform: 'twitch', tickets: 1, pointsSpent: 0, refundedPoints: 0, firstAt: stamp, lastAt: stamp }, drawnAt: stamp } });
    expect(legacy.active?.winners).toEqual([expect.objectContaining({ displayName: 'Viewer One', state: 'pending' })]);
    expect(legacy.history[0]).toMatchObject({ winners: ['Old Winner'], endedAt: stamp });
  });
});
