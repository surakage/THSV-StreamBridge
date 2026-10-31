import { createHash } from 'node:crypto';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { AdapterContext } from './adapter.js';
import { ManagedAdapter } from './adapter.js';
import type { StreamerBotEventRelay } from './streamerbot-event-relay.js';

type JsonRecord = Readonly<Record<string, unknown>>;

// Native Twitch polls and predictions and YouTube polls, read from Streamer.bot's own WebSocket
// events (Twitch.Poll*, Twitch.Prediction*, YouTube.Poll*). No trigger or import is needed: the
// bridge already holds the authenticated Streamer.bot connection. Field names are matched without
// regard to case or underscores because Streamer.bot does not publish these payload schemas.
export const STREAMERBOT_POLL_EVENTS = Object.freeze({
  Twitch: ['PollCreated', 'PollUpdated', 'PollCompleted', 'PollTerminated', 'PollArchived', 'PredictionCreated', 'PredictionUpdated', 'PredictionLocked', 'PredictionCompleted', 'PredictionCanceled'],
  YouTube: ['PollStarted', 'PollUpdated', 'PollClosed'],
} as const);

const PHASES: Readonly<Record<string, string>> = Object.freeze({
  'Twitch.PollCreated': 'open', 'Twitch.PollUpdated': 'open', 'Twitch.PollCompleted': 'ended', 'Twitch.PollTerminated': 'ended', 'Twitch.PollArchived': 'removed',
  'Twitch.PredictionCreated': 'open', 'Twitch.PredictionUpdated': 'open', 'Twitch.PredictionLocked': 'locked', 'Twitch.PredictionCompleted': 'resolved', 'Twitch.PredictionCanceled': 'canceled',
  'YouTube.PollStarted': 'open', 'YouTube.PollUpdated': 'open', 'YouTube.PollClosed': 'ended',
});
const MAXIMUM_CHOICES = 10;
// Vote updates can arrive many times a second; an open poll is forwarded at most this often.
const OPEN_UPDATE_INTERVAL_MS = 1_000;

export function isStreamerBotPollEnvelope(value: JsonRecord): boolean {
  const event = record(value['event']);
  return typeof event?.['source'] === 'string' && typeof event['type'] === 'string' && Object.hasOwn(PHASES, `${event['source']}.${event['type']}`) && record(value['data']) !== undefined;
}

export class StreamerBotPollsAdapter extends ManagedAdapter {
  private unsubscribe: (() => void) | undefined;
  private context: AdapterContext | undefined;
  private readonly pending = new Map<string, { event: NormalizedEvent; timer: NodeJS.Timeout }>();
  private readonly lastSent = new Map<string, number>();

  public constructor(name: string, config: ManagedAdapter['config'], private readonly relay: StreamerBotEventRelay, private readonly now: () => number = Date.now) { super(name, config); }

  public async start(context: AdapterContext): Promise<void> {
    if (!this.config.enabled) { this.state = 'disabled'; return; }
    this.context = context;
    this.unsubscribe = this.relay.subscribe((message) => { this.receive(message); });
    this.state = 'connected';
    this.lastError = undefined;
    context.logger.info('Native Streamer.bot polls and predictions intake started', { adapter: this.name });
  }

  public async stop(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    for (const { timer } of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    this.lastSent.clear();
    this.context = undefined;
    this.state = 'stopped';
  }

  private receive(message: JsonRecord): void {
    if (this.context === undefined || !isStreamerBotPollEnvelope(message)) return;
    let event: NormalizedEvent;
    try { event = normalizeStreamerBotPollEvent(message, new Date(this.now())); }
    catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.context.logger.warn('Native Streamer.bot poll or prediction rejected', { adapter: this.name, error });
      return;
    }
    const id = event.payload['id'];
    const key = `${event.eventType}:${typeof id === 'string' ? id : ''}`;
    const queued = this.pending.get(key);
    if (queued !== undefined) { clearTimeout(queued.timer); this.pending.delete(key); }
    const wait = (this.lastSent.get(key) ?? -Infinity) + OPEN_UPDATE_INTERVAL_MS - this.now();
    if (event.payload['phase'] !== 'open' || wait <= 0) { void this.forward(key, event); return; }
    this.pending.set(key, { event, timer: setTimeout(() => { this.pending.delete(key); void this.forward(key, event); }, wait) });
  }

  private async forward(key: string, event: NormalizedEvent): Promise<void> {
    const context = this.context;
    if (context === undefined) return;
    if (event.payload['phase'] === 'open') this.lastSent.set(key, this.now()); else this.lastSent.delete(key);
    try {
      await context.emit(event);
      this.lastEventAt = new Date().toISOString();
      this.lastError = undefined;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      context.logger.warn('Native Streamer.bot poll or prediction was not accepted', { adapter: this.name, eventType: event.eventType, error });
    }
  }
}

export function normalizeStreamerBotPollEvent(input: unknown, now = new Date()): NormalizedEvent {
  const envelope = record(input);
  if (envelope === undefined || !isStreamerBotPollEnvelope(envelope)) throw new Error('Expected a Streamer.bot poll or prediction event envelope.');
  const header = record(envelope['event']) ?? {};
  const eventName = `${String(header['source'])}.${String(header['type'])}`;
  const phase = PHASES[eventName] ?? 'open';
  const platform = header['source'] === 'YouTube' ? 'youtube' : 'twitch';
  const data = record(envelope['data']) ?? {};
  const prediction = eventName.startsWith('Twitch.Prediction');
  const body = record(field(data, prediction ? 'prediction' : 'poll')) ?? data;
  const simulated = field(data, 'isTest') === true || field(body, 'isTest') === true;
  const payload = prediction ? predictionPayload(body, phase, now) : pollPayload(body, phase, platform, now);
  const digest = createHash('sha256').update(JSON.stringify({ eventName, payload })).digest('hex').slice(0, 24);
  return {
    schemaVersion: '1.0.0',
    eventId: `streamerbot-${platform}-${prediction ? 'prediction' : 'poll'}-${digest}`,
    eventType: prediction ? 'engagement.prediction' : 'engagement.poll',
    platform,
    source: { adapter: 'streamerbot-polls', eventName },
    receivedAt: isoDate(envelope['timeStamp']) ?? now.toISOString(),
    channel: { name: platform === 'youtube' ? 'YouTube' : 'Twitch' },
    payload,
    metadata: { simulated },
  };
}

function pollPayload(body: JsonRecord, phase: string, platform: string, now: Date): Record<string, string | number | boolean | number[] | Array<Record<string, string | number>>> {
  const title = text(field(body, 'title') ?? field(body, 'question'), 200);
  const rawOptions = list(field(body, 'choices') ?? field(body, 'options'));
  const options = rawOptions.slice(0, MAXIMUM_CHOICES).map((option, index) => {
    const total = count(field(option, 'totalVotes'));
    const votes = total ?? (count(field(option, 'votes')) ?? 0) + (count(field(option, 'channelPointsVotes') ?? field(option, 'rewardVotes')) ?? 0) + (count(field(option, 'bitsVotes')) ?? 0);
    return { title: text(field(option, 'title') ?? field(option, 'text'), 120) || `Option ${String(index + 1)}`, votes };
  });
  const totalVotes = count(field(body, 'totalVotes')) ?? options.reduce((sum, option) => sum + option.votes, 0);
  // YouTube sends no poll id; one poll runs at a time per broadcast, so the question identifies it.
  const id = platform === 'youtube' ? `yt-${createHash('sha256').update(title).digest('hex').slice(0, 16)}` : text(field(body, 'id'), 100) || `tw-${createHash('sha256').update(title).digest('hex').slice(0, 16)}`;
  const top = Math.max(0, ...options.map((option) => option.votes));
  const winnerIndexes = phase === 'ended' && top > 0 ? options.flatMap((option, index) => option.votes === top ? [index] : []) : [];
  const endsAt = deadline(body, ['endsAt'], ['startedAt'], 'duration', now);
  return { kind: 'poll', provider: platform, id, phase, title: title || 'Poll', options, totalVotes, winnerIndexes, ...(endsAt === undefined ? {} : { endsAt }) };
}

function predictionPayload(body: JsonRecord, phase: string, now: Date): Record<string, string | number | Array<Record<string, string | number>>> {
  const title = text(field(body, 'title'), 200);
  const outcomes = list(field(body, 'outcomes')).slice(0, MAXIMUM_CHOICES).map((outcome, index) => ({
    id: text(field(outcome, 'id'), 100),
    title: text(field(outcome, 'title'), 120) || `Outcome ${String(index + 1)}`,
    users: count(field(outcome, 'users')) ?? 0,
    points: count(field(outcome, 'channelPoints') ?? field(outcome, 'points')) ?? 0,
    color: text(field(outcome, 'color'), 10).toLowerCase() === 'pink' ? 'pink' : 'blue',
  }));
  const winning = record(field(body, 'winningOutcome')) ?? {};
  const winnerId = text(field(body, 'winningOutcomeId'), 100) || text(field(winning, 'id'), 100);
  const winnerTitle = text(field(winning, 'title'), 120);
  const winnerIndex = phase !== 'resolved' ? -1 : outcomes.findIndex((outcome) => (winnerId !== '' && outcome.id === winnerId) || (winnerTitle !== '' && outcome.title === winnerTitle));
  const locksAt = deadline(body, ['locksAt'], ['createdAt', 'startedAt'], 'predictionWindow', now);
  return {
    kind: 'prediction', provider: 'twitch', id: text(field(body, 'id'), 100) || `tw-${createHash('sha256').update(title).digest('hex').slice(0, 16)}`, phase, title: title || 'Prediction',
    outcomes: outcomes.map(({ title: outcomeTitle, users, points, color }) => ({ title: outcomeTitle, users, points, color })),
    totalUsers: outcomes.reduce((sum, outcome) => sum + outcome.users, 0), totalPoints: outcomes.reduce((sum, outcome) => sum + outcome.points, 0), winnerIndex,
    ...(locksAt === undefined ? {} : { locksAt }),
  };
}

/** When voting closes: an explicit time, else start + duration in seconds, else now + the remaining milliseconds. */
function deadline(body: JsonRecord, explicit: readonly string[], starts: readonly string[], durationField: string, now: Date): string | undefined {
  for (const name of explicit) { const value = isoDate(field(body, name)); if (value !== undefined) return value; }
  const seconds = count(field(body, durationField));
  for (const name of starts) {
    const start = isoDate(field(body, name));
    if (start !== undefined && seconds !== undefined && seconds > 0) return new Date(Date.parse(start) + seconds * 1_000).toISOString();
  }
  const remaining = count(field(body, 'durationRemaining'));
  return remaining !== undefined && remaining > 0 ? new Date(now.getTime() + remaining).toISOString() : undefined;
}

/** Reads a field whatever its casing or underscores: endsAt, EndsAt and ends_at are the same field. */
function field(value: JsonRecord, name: string): unknown {
  if (Object.hasOwn(value, name)) return value[name];
  const wanted = name.replace(/_/gu, '').toLowerCase();
  for (const [key, entry] of Object.entries(value)) if (key.replace(/_/gu, '').toLowerCase() === wanted) return entry;
  return undefined;
}

function list(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.flatMap((entry) => { const item = record(entry); return item === undefined ? [] : [item]; }) : []; }
function count(value: unknown): number | undefined {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) && number >= 0 ? Math.min(Math.floor(number), 1_000_000_000) : undefined;
}
function text(value: unknown, maximum: number): string { return typeof value === 'string' ? Array.from(value.replace(/[\p{Cc}\s]+/gu, ' ').trim()).slice(0, maximum).join('') : ''; }
function isoDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '' || value.startsWith('0001-')) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}
function record(value: unknown): JsonRecord | undefined { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonRecord : undefined; }
