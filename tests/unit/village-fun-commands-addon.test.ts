import { afterEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import villageFun, { CONTENT_EVENT, FALLBACKS } from '../../addons/village-fun-commands/dist/index.js';

function command(name: string, argumentsValue: string[] = [], platform = 'twitch') {
  return {
    schemaVersion: '1.0.0', eventId: `${name}-${platform}`, eventType: 'command.received', platform,
    source: { adapter: 'bridge', eventName: 'NormalizedCommand' }, receivedAt: new Date().toISOString(),
    user: { id: 'viewer-1', name: 'viewer', displayName: 'Village Viewer', actorType: 'human', roles: ['viewer'] },
    payload: { command: name, arguments: argumentsValue, rawInput: argumentsValue.join(' ') }, metadata: { simulated: false },
  };
}

function harness(settings: Record<string, unknown> = {}) {
  let state: Record<string, unknown> = {};
  const sent: Record<string, unknown>[] = [];
  const runs: Array<{ actionId: string; argumentsValue: Record<string, unknown> }> = [];
  const scheduled = new Map<string, () => Promise<void> | void>();
  let nextTask = 0;
  const context = {
    settings: { enabled: true, useOnlineProviders: false, globalCooldownSeconds: 1, viewerCooldownSeconds: 1, ...settings },
    state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) },
    chat: { send: vi.fn(async (request: Record<string, unknown>) => { sent.push(request); return []; }) },
    streamerbot: { runApprovedAction: vi.fn(async (actionId: string, argumentsValue: Record<string, unknown>) => { runs.push({ actionId, argumentsValue }); }) },
    schedule: {
      after: vi.fn((_delay: number, work: () => Promise<void> | void) => { const id = `task-${String(++nextTask)}`; scheduled.set(id, work); return id; }),
      cancel: vi.fn((id: string) => { scheduled.delete(id); }),
    },
  };
  return { context, scheduled, sent, runs, state: () => state };
}

afterEach(() => { vi.useRealTimers(); });

describe('Village Fun Commands', () => {
  it('uses bounded local fallbacks and replies only to the command source', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-04T12:00:00.000Z'));
    const { context, sent } = harness(); await villageFun.start(context);
    await villageFun.onEvent(command('slothfact', [], 'youtube'), context);
    expect(context.chat.send).toHaveBeenCalledWith(expect.objectContaining({
      routing: 'source', sourcePlatform: 'youtube', message: expect.any(String), overflow: 'reject',
    }));
    expect(FALLBACKS.sloth).toContain(sent[0]?.['message']);
    await villageFun.stop(context);
  });

  it('supports 8-Ball, deterministic ratings, and a persisted hug leaderboard', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-04T12:00:00.000Z'));
    const { context, sent, state } = harness(); await villageFun.start(context);
    await villageFun.onEvent(command('8ball', ['Will', 'this', 'work?']), context);
    vi.advanceTimersByTime(1_100); await villageFun.onEvent(command('rate', ['pineapple', 'pizza']), context);
    const firstRating = sent.at(-1)?.['message'];
    vi.advanceTimersByTime(1_100); await villageFun.onEvent(command('rate', ['pineapple', 'pizza']), context);
    expect(sent.at(-1)?.['message']).toBe(firstRating);
    vi.advanceTimersByTime(1_100); await villageFun.onEvent(command('hug', ['CozySloth']), context);
    vi.advanceTimersByTime(1_100); await villageFun.onEvent(command('hugs'), context);
    expect(sent.at(-1)?.['message']).toContain('#1 CozySloth (1)');
    expect(state()).toMatchObject({ hugs: [expect.objectContaining({ name: 'CozySloth', count: 1 })] });
    await villageFun.stop(context);
  });

  it('formats the configured streamer timezone locally and source-routes the response', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-04T18:30:00.000Z'));
    const { context, sent } = harness({ timezoneName: 'America/Chicago', timezoneLabel: 'Village time' });
    await villageFun.start(context);
    await villageFun.onEvent(command('timezone', [], 'kick'), context);
    expect(sent.at(-1)).toMatchObject({ routing: 'source', sourcePlatform: 'kick' });
    expect(sent.at(-1)?.['message']).toMatch(/^Village time: Tuesday, Aug 4, 1:30 PM CDT\.$/u);
    await villageFun.stop(context);
  });

  it('dispatches !followage only for the invoking Twitch viewer', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-04T18:30:00.000Z'));
    const { context, runs, sent } = harness();
    await villageFun.start(context);
    await villageFun.onEvent({ ...command('followage'), channel: { id: '98765', name: 'VillageChannel' } }, context);
    expect(runs).toEqual([expect.objectContaining({
      actionId: '9df94d73-b90c-4eeb-8992-1a902f99cc98',
      argumentsValue: expect.objectContaining({ villageFunViewerId: 'viewer-1', villageFunBroadcasterId: '98765', villageFunViewerName: 'Village Viewer' }),
    })]);
    expect(sent).toHaveLength(0);
    vi.advanceTimersByTime(1_100);
    await villageFun.onEvent(command('followage', [], 'youtube'), context);
    expect(runs).toHaveLength(1);
    await villageFun.stop(context);
  });

  it('answers broadcaster followage locally and continues after one failed command event', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-04T18:30:00.000Z'));
    const { context, sent, runs } = harness({ useOnlineProviders: true });
    await villageFun.start(context);
    await villageFun.onEvent({ ...command('followage'), channel: { id: 'viewer-1', name: 'VillageChannel' } }, context);
    expect(sent.at(-1)?.['message']).toBe('Village Viewer, you are the broadcaster of VillageChannel.');
    expect(runs).toHaveLength(0);

    vi.advanceTimersByTime(1_100);
    context.schedule.after.mockImplementationOnce(() => { throw new Error('scheduler unavailable'); });
    await expect(villageFun.onEvent(command('catfact'), context)).rejects.toThrow('scheduler unavailable');
    vi.advanceTimersByTime(1_100);
    await villageFun.onEvent(command('dice'), context);
    expect(sent.at(-1)?.['message']).toMatch(/^Village Viewer rolled \d+ on a 6-sided die\.$/u);
    await villageFun.stop(context);
  });

  it('correlates optional provider replies and falls back when a helper response times out', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-04T12:00:00.000Z'));
    const { context, scheduled, sent, runs } = harness({ useOnlineProviders: true }); await villageFun.start(context);
    await villageFun.onEvent(command('catfact'), context);
    expect(context.streamerbot.runApprovedAction).toHaveBeenCalledWith(
      '74e6fc7e-39cd-4de3-a9ad-4ed7ef049196', expect.objectContaining({ villageFunProvider: 'cat' }),
    );
    const requestId = String(runs[0]?.argumentsValue['villageFunRequestId']);
    await villageFun.onEvent({ schemaVersion: '1.0.0', eventId: 'foreign', eventType: CONTENT_EVENT, platform: 'system', receivedAt: new Date().toISOString(), payload: { requestId: 'wrong', succeeded: true, content: 'Foreign response' }, metadata: { simulated: false } }, context);
    expect(context.chat.send).not.toHaveBeenCalled();
    await villageFun.onEvent({ schemaVersion: '1.0.0', eventId: 'reply', eventType: CONTENT_EVENT, platform: 'system', receivedAt: new Date().toISOString(), payload: { requestId, succeeded: true, content: 'Cats can rotate each ear independently.' }, metadata: { simulated: false } }, context);
    expect(context.chat.send).toHaveBeenCalledWith(expect.objectContaining({ message: 'Cats can rotate each ear independently.' }));

    vi.advanceTimersByTime(1_100); await villageFun.onEvent(command('joke'), context);
    const timeout = [...scheduled.values()][0]; expect(timeout).toBeTypeOf('function');
    vi.advanceTimersByTime(20_000); await timeout?.();
    expect(FALLBACKS.joke).toContain(sent.at(-1)?.['message']);
    await villageFun.stop(context);
  });

  it('ignores direct native command duplicates, simulated events, and disabled commands', async () => {
    const { context } = harness({ jokeEnabled: false }); await villageFun.start(context);
    await villageFun.onEvent({ ...command('slothfact'), source: { adapter: 'native', eventName: 'TwitchCommand' } }, context);
    await villageFun.onEvent({ ...command('slothfact'), metadata: { simulated: true } }, context);
    await villageFun.onEvent(command('joke'), context);
    expect(context.chat.send).not.toHaveBeenCalled();
    await villageFun.stop(context);
  });
});
