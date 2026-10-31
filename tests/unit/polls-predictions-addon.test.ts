import { afterEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- executable add-on entrypoints are intentionally plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import pollsPredictions, { cardFrom, resetForTests, settingsFor, sourceFor } from '../../addons/polls-predictions/dist/index.js';
import type { NormalizedEvent } from '../../schemas/event.js';

interface Card { readonly key: string; readonly kind: string; readonly phase: string; readonly total: number; readonly winners: readonly number[]; readonly choices: ReadonlyArray<{ readonly title: string; readonly count: number; readonly percentage: number; readonly color?: string }> }
interface Board { readonly cards: readonly Card[]; readonly style: Record<string, unknown> }
interface Published { readonly topic: string; readonly payload: Board; readonly lane: string | undefined }

function event(eventType: string, platform: string, payload: Record<string, unknown>): NormalizedEvent {
  return { schemaVersion: '1.0.0', eventId: `${eventType}-${String(Math.random())}`, eventType, platform, source: { adapter: 'streamerbot-polls', eventName: 'test' }, receivedAt: '2026-10-31T12:00:00.000Z', channel: { name: 'Twitch' }, payload, metadata: { simulated: false } } as NormalizedEvent;
}
const poll = (id: string, phase: string, votes: number[], platform = 'twitch') => event('engagement.poll', platform, { kind: 'poll', provider: platform, id, phase, title: `Poll ${id}`, options: votes.map((count, index) => ({ title: `Option ${String(index + 1)}`, votes: count })), totalVotes: votes.reduce((sum, count) => sum + count, 0), winnerIndexes: phase === 'ended' ? [votes.indexOf(Math.max(...votes))] : [], endsAt: '2026-10-31T12:02:00.000Z' });
const prediction = (id: string, phase: string, winnerIndex = -1) => event('engagement.prediction', 'twitch', { kind: 'prediction', provider: 'twitch', id, phase, title: `Prediction ${id}`, outcomes: [{ title: 'Yes', users: 2, points: 300, color: 'blue' }, { title: 'No', users: 1, points: 100, color: 'pink' }], winnerIndex });

function harness(settings: Record<string, unknown> = {}) {
  const overlays: Published[] = [];
  return { context: { settings, overlay: { publish: async (topic: string, payload: Board, options?: { lane?: string }) => { overlays.push({ topic, payload, lane: options?.lane }); } } }, overlays };
}
function last<T>(items: readonly T[]): T { const item = items.at(-1); if (item === undefined) throw new Error('No overlay was published.'); return item; }

describe('Polls & Predictions add-on', () => {
  afterEach(async () => { await pollsPredictions.stop(); resetForTests(); vi.useRealTimers(); });

  it('defaults to every source and filters by the creator\'s choice', () => {
    const all = settingsFor({ settings: {} });
    expect(all).toMatchObject({ enabled: true, maximumCards: 2, hideAfterResult: true, resultSeconds: 15, position: 'top-right' });
    expect(sourceFor(poll('a', 'open', [1]), all)).toBe('twitch-polls');
    const youtubeOnly = settingsFor({ settings: { sources: ['youtube-polls', 'bogus'] } });
    expect(youtubeOnly.sources).toEqual(['youtube-polls']);
    expect(sourceFor(poll('a', 'open', [1]), youtubeOnly)).toBeUndefined();
    expect(sourceFor(poll('a', 'open', [1], 'youtube'), youtubeOnly)).toBe('youtube-polls');
  });

  it('builds cards with percentages, points and the winner', () => {
    const card = cardFrom(prediction('p1', 'resolved', 0)) as Card;
    expect(card).toMatchObject({ key: 'prediction:twitch:p1', kind: 'prediction', phase: 'resolved', total: 400, winners: [0] });
    expect(card.choices).toEqual([{ title: 'Yes', count: 300, people: 2, color: 'blue', percentage: 75 }, { title: 'No', count: 100, people: 1, color: 'pink', percentage: 25 }]);
  });

  it('shows a poll and a prediction together and updates the same card as votes arrive', async () => {
    const { context, overlays } = harness();
    await pollsPredictions.start(context);
    await pollsPredictions.onEvent(poll('a', 'open', [1, 0]), context);
    await pollsPredictions.onEvent(prediction('b', 'open'), context);
    await pollsPredictions.onEvent(poll('a', 'open', [3, 1]), context);
    const board = last(overlays);
    expect(board).toMatchObject({ topic: 'thsv.polls-predictions.polls.update', lane: 'persistent' });
    expect(board.payload.cards.map((card) => [card.key, card.total])).toEqual([['poll:twitch:a', 4], ['prediction:twitch:b', 400]]);
  });

  it('hides a finished card after the result time and keeps open ones ahead of finished ones', async () => {
    vi.useFakeTimers();
    const { context, overlays } = harness({ maximumCards: 1, resultSeconds: 5 });
    await pollsPredictions.start(context);
    await pollsPredictions.onEvent(poll('a', 'ended', [5, 2]), context);
    expect(last(overlays).payload.cards[0]).toMatchObject({ phase: 'ended', winners: [0] });
    await pollsPredictions.onEvent(poll('b', 'open', [0, 0]), context);
    expect(last(overlays).payload.cards.map((card) => card.key)).toEqual(['poll:twitch:b']);
    await pollsPredictions.onEvent(poll('b', 'ended', [1, 0]), context);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(last(overlays).topic).toBe('thsv.polls-predictions.polls.hide');
  });

  it('removes an archived poll at once and ignores disabled sources', async () => {
    const { context, overlays } = harness({ sources: ['twitch-polls'], hideAfterResult: false });
    await pollsPredictions.start(context);
    await pollsPredictions.onEvent(prediction('x', 'open'), context);
    expect(overlays).toHaveLength(0);
    await pollsPredictions.onEvent(poll('a', 'open', [1]), context);
    await pollsPredictions.onEvent(poll('a', 'removed', [1]), context);
    expect(last(overlays).topic).toBe('thsv.polls-predictions.polls.hide');
  });
});
