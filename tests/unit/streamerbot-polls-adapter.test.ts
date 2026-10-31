import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizedEventSchema } from '../../schemas/event.js';
import { StreamerBotEventRelay } from '../../bridge/adapters/streamerbot-event-relay.js';
import { StreamerBotPollsAdapter, isStreamerBotPollEnvelope, normalizeStreamerBotPollEvent } from '../../bridge/adapters/streamerbot-polls-adapter.js';

const NOW = new Date('2026-10-31T12:00:00.000Z');
function envelope(source: string, type: string, data: Record<string, unknown>): Record<string, unknown> {
  return { timeStamp: '2026-10-31T12:00:00.000Z', event: { source, type }, data };
}

describe('native Streamer.bot polls and predictions intake', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('turns a Twitch poll into a normalized poll with reward votes counted', () => {
    const event = normalizeStreamerBotPollEvent(envelope('Twitch', 'PollUpdated', {
      id: 'poll-1', title: 'Coffee or tea?', startedAt: '2026-10-31T11:59:00Z', duration: 120,
      choices: [{ id: 'a', title: 'Coffee', votes: 10, channelPointsVotes: 5 }, { id: 'b', title: 'Tea', totalVotes: 7 }],
    }), NOW);
    expect(normalizedEventSchema.safeParse(event).success).toBe(true);
    expect(event).toMatchObject({
      eventType: 'engagement.poll', platform: 'twitch', source: { adapter: 'streamerbot-polls', eventName: 'Twitch.PollUpdated' },
      payload: { kind: 'poll', provider: 'twitch', id: 'poll-1', phase: 'open', title: 'Coffee or tea?', totalVotes: 22, options: [{ title: 'Coffee', votes: 15 }, { title: 'Tea', votes: 7 }], winnerIndexes: [], endsAt: '2026-10-31T12:01:00.000Z' },
    });
  });

  it('reads snake_case and nested fields and marks the winner when a poll ends', () => {
    const event = normalizeStreamerBotPollEvent(envelope('Twitch', 'PollCompleted', {
      poll: { id: 'poll-2', title: 'Pick one', choices: [{ title: 'Left', votes: 3, channel_points_votes: 4 }, { title: 'Right', votes: 7 }] },
    }), NOW);
    expect(event.payload).toMatchObject({ phase: 'ended', options: [{ votes: 7 }, { votes: 7 }], winnerIndexes: [0, 1] });
  });

  it('normalizes a resolved Twitch prediction with its winning outcome', () => {
    const event = normalizeStreamerBotPollEvent(envelope('Twitch', 'PredictionCompleted', {
      id: 'pred-1', title: 'Boss first try?', winning_outcome_id: 'no',
      outcomes: [{ id: 'yes', title: 'Yes', users: 20, channel_points: 1200, color: 'BLUE' }, { id: 'no', title: 'No', users: 30, channel_points: 900, color: 'PINK' }],
    }), NOW);
    expect(normalizedEventSchema.safeParse(event).success).toBe(true);
    expect(event).toMatchObject({
      eventType: 'engagement.prediction',
      payload: { kind: 'prediction', phase: 'resolved', winnerIndex: 1, totalPoints: 2100, totalUsers: 50, outcomes: [{ title: 'Yes', points: 1200, users: 20, color: 'blue' }, { title: 'No', color: 'pink' }] },
    });
  });

  it('normalizes a YouTube poll by its question and keeps Streamer.bot test events simulated', () => {
    const data = { question: 'Best snack?', totalVotes: 9, options: [{ text: 'Popcorn', votes: 6 }, { text: 'Cookies', votes: 3 }], eventId: '', isTest: true };
    const started = normalizeStreamerBotPollEvent(envelope('YouTube', 'PollStarted', data), NOW);
    const closed = normalizeStreamerBotPollEvent(envelope('YouTube', 'PollClosed', data), NOW);
    expect(started).toMatchObject({ platform: 'youtube', metadata: { simulated: true }, payload: { provider: 'youtube', phase: 'open', options: [{ title: 'Popcorn', votes: 6 }, { title: 'Cookies', votes: 3 }] } });
    expect(closed.payload).toMatchObject({ id: started.payload['id'], phase: 'ended', winnerIndexes: [0] });
    expect(closed.eventId).not.toBe(started.eventId);
  });

  it('only accepts the poll and prediction events it subscribes to', () => {
    expect(isStreamerBotPollEnvelope(envelope('Twitch', 'PollArchived', {}))).toBe(true);
    expect(isStreamerBotPollEnvelope(envelope('Twitch', 'RaidSend', {}))).toBe(false);
    expect(isStreamerBotPollEnvelope(envelope('Kick', 'PollUpdated', {}))).toBe(false);
  });

  it('forwards at most one open update a second and always forwards the result', async () => {
    vi.useFakeTimers({ now: NOW });
    const relay = new StreamerBotEventRelay();
    const emitted: Array<{ payload: Record<string, unknown> }> = [];
    const adapter = new StreamerBotPollsAdapter('polls', { enabled: true, inputEnabled: true, outputEnabled: false, adapter: 'streamerbot-polls', capabilities: [], reconnect: { enabled: false, initialDelayMs: 10, maxDelayMs: 10, maxAttempts: 0 } }, relay, () => Date.now());
    const logger = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined };
    await adapter.start({ logger, emit: async (event: unknown) => { emitted.push(event as { payload: Record<string, unknown> }); return {}; } });
    const update = (votes: number, type = 'PollUpdated') => relay.publish(envelope('Twitch', type, { id: 'p', title: 'Q', choices: [{ title: 'A', votes }] }));
    update(1); update(2); update(3);
    await vi.advanceTimersByTimeAsync(0);
    expect(emitted.map((event) => event.payload['totalVotes'])).toEqual([1]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(emitted.map((event) => event.payload['totalVotes'])).toEqual([1, 3]);
    update(4); update(5, 'PollCompleted');
    await vi.advanceTimersByTimeAsync(0);
    expect(emitted.map((event) => [event.payload['totalVotes'], event.payload['phase']])).toEqual([[1, 'open'], [3, 'open'], [5, 'ended']]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(emitted).toHaveLength(3);
    await adapter.stop();
  });
});
