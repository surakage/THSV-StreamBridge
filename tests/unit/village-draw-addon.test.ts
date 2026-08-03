import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-on entrypoints are intentionally plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import villageDraw, { administerVillageDraw, buyTickets, chooseWinner, stateFor } from '../../addons/village-draw/dist/index.js';
import type { NormalizedEvent } from '../../schemas/event.js';

function command(name: string, args: string[] = [], simulated = false, userId = 'viewer-1'): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: `${name}-${userId}-${args.join('-') || 'none'}`, eventType: 'command.received', platform: 'twitch',
    source: { adapter: 'test', eventId: `source-${name}-${userId}`, eventName: 'Command' }, receivedAt: '2026-07-31T12:00:00.000Z',
    channel: { id: 'channel-1', name: 'Example Channel' },
    user: { id: userId, name: userId, displayName: userId === 'viewer-1' ? 'Viewer One' : 'Viewer Two', actorType: 'human', roles: [] },
    payload: { command: name, invokedAs: name, arguments: args, rawInput: `!${name} ${args.join(' ')}`.trim(), prefix: '!', minimumRole: 'viewer', allowBots: false },
    metadata: { simulated },
  };
}

function chatCommand(message: string, userId = 'viewer-1', roles: string[] = [], receivedAt = '2026-07-31T12:00:00.000Z'): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: `chat-${userId}-${message}`, eventType: 'chat.message', platform: 'twitch',
    source: { adapter: 'test', eventId: `source-chat-${userId}-${message}`, eventName: 'Chat Message' }, receivedAt,
    channel: { id: 'channel-1', name: 'Example Channel' },
    user: { id: userId, name: userId, displayName: userId === 'viewer-1' ? 'Viewer One' : 'Viewer Two', actorType: 'human', roles },
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
  const balances = new Map([['viewer-one', 1_000], ['viewer-two', 1_000]]);
  const accountIds = new Map([['viewer-1', 'viewer-one'], ['viewer-2', 'viewer-two']]);
  const mutations = new Map<string, Record<string, unknown>>();
  const scheduled: Array<() => Promise<unknown>> = [];
  const chat: Array<Record<string, unknown>> = [];
  const overlays: Array<{ topic: string; payload: Record<string, unknown> }> = [];
  let failSpend = settings['testFailSpend'] === true;
  const context = {
    settings: { enabled: true, giveawayName: 'Cozy Draw', description: 'A friendly test draw.', prizeItem: 'Cozy Key', announcementPlatforms: ['twitch'], ...settings },
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
    const entries = Array.from({ length: 80 }, (_, index) => ({
      viewerId: `viewer-${String(index).padStart(2, '0')}`,
      displayName: `Viewer ${String(index)} ${'x'.repeat(68)}`,
      platform: 'twitch', tickets: 100, pointsSpent: 1_000_000, refundedPoints: 0, firstAt: stamp, lastAt: stamp,
    }));
    const pendingPurchases = Array.from({ length: 20 }, (_, index) => ({
      viewerId: `pending-${String(index).padStart(2, '0')}`,
      idempotencyKey: `purchase-${String(index)}-${'x'.repeat(110)}`,
      displayName: `Pending ${String(index)} ${'x'.repeat(67)}`,
      platform: 'youtube', tickets: 100, amount: 1_000_000, createdAt: stamp,
    }));
    const receipt = { giveawayId: `draw-${'x'.repeat(95)}`, selectedTicket: 50_000, totalTickets: 50_000, entrantCount: 80, snapshotDigest: 'a'.repeat(64), drawnAt: stamp };
    const history = Array.from({ length: 20 }, (_, index) => ({
      id: `history-${String(index)}-${'x'.repeat(90)}`, winner: `Winner ${String(index)} ${'x'.repeat(68)}`,
      entrantCount: 80, totalTickets: 50_000, drawnAt: stamp, receipt,
    }));
    const bounded = stateFor({
      version: 1, sequence: 1_000_000_000, history,
      active: {
        id: `draw-${'x'.repeat(95)}`, status: 'canceling', name: 'n'.repeat(100), description: 'd'.repeat(500), prize: 'p'.repeat(160),
        imageUrl: `https://example.com/${'i'.repeat(2000)}`, entryMode: 'points-multiple', ticketCost: 10_000,
        maxTicketsPerViewer: 100, maximumEntrants: 80, maximumTotalTickets: 50_000, eligiblePlatforms: ['twitch', 'youtube', 'kick', 'tiktok'],
        createdAt: stamp, openedAt: stamp, closedAt: stamp, drawnAt: stamp, entries, pendingPurchases,
        pendingRefunds: entries.map((entry) => entry.viewerId), winner: entries[0], receipt,
      },
    });
    expect(bounded.active?.entries).toHaveLength(80);
    expect(bounded.active?.pendingPurchases).toHaveLength(5);
    expect(bounded.history).toHaveLength(5);
    expect(Buffer.byteLength(JSON.stringify(bounded), 'utf8')).toBeLessThanOrEqual(65_536);
  });
});
