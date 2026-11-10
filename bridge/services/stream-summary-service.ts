import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { NormalizedEvent } from '../../schemas/event.js';

// A short recap of each stream for the Wizard's Start here page: how busy chat was on each platform, what
// viewers did, and whether anything went wrong. Only counts are kept. No names and no message text are stored;
// chatters are counted through a one-way hash that lives in memory for the stream only.

const MAXIMUM_SUMMARIES = 10;
const MAXIMUM_CHATTERS_PER_PLATFORM = 20_000;
const MAXIMUM_PROBLEMS = 5;

export interface StreamSummaryPlatform {
  readonly messages: number;
  readonly chatters: number;
}

export interface StreamSummary {
  readonly id: string;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly platforms: Readonly<Record<string, StreamSummaryPlatform>>;
  readonly follows: number;
  readonly subscriptions: number;
  readonly giftedSubscriptions: number;
  readonly support: number;
  readonly raids: number;
  readonly redemptions: number;
  readonly commands: number;
  readonly adBreaks: number;
  readonly warnings: number;
  readonly errors: number;
  readonly problems: readonly string[];
}

type MutableSummary = { -readonly [K in keyof StreamSummary]: StreamSummary[K] } & { platforms: Record<string, { messages: number; chatters: number }>; problems: string[] };

const SUPPORT_EVENTS = new Set(['engagement.gift', 'engagement.donation', 'engagement.cheer', 'engagement.super-chat', 'engagement.super-sticker']);

export class StreamSummaryService {
  private current: MutableSummary | undefined;
  private recent: StreamSummary[] = [];
  private readonly chatters = new Map<string, Set<string>>();
  private writes: Promise<void> = Promise.resolve();
  private lastSavedAt = 0;

  public constructor(private readonly path: string, private readonly now: () => number = Date.now) {}

  public async start(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as { summaries?: unknown; current?: unknown };
      if (Array.isArray(parsed.summaries)) this.recent = parsed.summaries.filter(validSummary).slice(0, MAXIMUM_SUMMARIES);
      // A stream that was running when the Bridge stopped carries on counting after a restart.
      if (validSummary(parsed.current) && parsed.current.endedAt === undefined) this.current = { ...parsed.current, platforms: Object.fromEntries(Object.entries(parsed.current.platforms).map(([id, value]) => [id, { ...value }])), problems: [...parsed.current.problems] };
    } catch { /* No recap has been saved yet. */ }
  }

  public observe(event: NormalizedEvent): void {
    if (event.metadata.simulated) return;
    if (event.eventType === 'system.broadcast-started') { this.begin(); return; }
    if (event.eventType === 'system.broadcast-stopped') { this.end(); return; }
    const summary = this.current;
    if (summary === undefined) return;
    if (event.eventType === 'chat.message') {
      if (event.user?.actorType !== undefined && event.user.actorType !== 'human') return;
      const platform = (summary.platforms[event.platform] ??= { messages: 0, chatters: 0 });
      platform.messages += 1;
      const identity = event.user?.id ?? event.user?.name;
      if (identity !== undefined) {
        const seen = this.chatters.get(event.platform) ?? new Set<string>();
        this.chatters.set(event.platform, seen);
        if (seen.size < MAXIMUM_CHATTERS_PER_PLATFORM) seen.add(createHash('sha256').update(`${summary.id}:${identity.toLowerCase()}`).digest('base64').slice(0, 16));
        platform.chatters = Math.max(platform.chatters, seen.size);
      }
    } else if (event.eventType === 'channel.follow') summary.follows += 1;
    else if (event.eventType === 'channel.subscription' || event.eventType === 'channel.membership') summary.subscriptions += 1;
    else if (event.eventType === 'channel.gift-subscription') summary.giftedSubscriptions += 1;
    else if (SUPPORT_EVENTS.has(event.eventType)) summary.support += 1;
    else if (event.eventType === 'channel.raid') summary.raids += 1;
    else if (event.eventType === 'reward.redemption') summary.redemptions += 1;
    else if (event.eventType === 'command.received') summary.commands += 1;
    else if (event.eventType === 'addon.thsv.ad-break-companion.started') summary.adBreaks += 1;
    else return;
    this.saveSoon();
  }

  /** Counts a warning or error that was logged while live, and keeps the first few distinct messages. */
  public observeProblem(level: 'warn' | 'error', message: string): void {
    const summary = this.current;
    if (summary === undefined) return;
    if (level === 'error') summary.errors += 1; else summary.warnings += 1;
    const text = message.slice(0, 160);
    if (summary.problems.length < MAXIMUM_PROBLEMS && !summary.problems.includes(text)) summary.problems.push(text);
    this.saveSoon();
  }

  public status(): Readonly<{ live: boolean; current?: StreamSummary; recent: readonly StreamSummary[] }> {
    return { live: this.current !== undefined, ...(this.current === undefined ? {} : { current: this.snapshot(this.current) }), recent: this.recent };
  }

  public async flush(): Promise<void> { this.save(); await this.writes; }

  private begin(): void {
    if (this.current !== undefined) return;
    this.chatters.clear();
    this.current = { id: randomUUID(), startedAt: new Date(this.now()).toISOString(), platforms: {}, follows: 0, subscriptions: 0, giftedSubscriptions: 0, support: 0, raids: 0, redemptions: 0, commands: 0, adBreaks: 0, warnings: 0, errors: 0, problems: [] };
    this.save();
  }

  private end(): void {
    if (this.current === undefined) return;
    const finished = { ...this.snapshot(this.current), endedAt: new Date(this.now()).toISOString() };
    this.current = undefined;
    this.chatters.clear();
    this.recent = [finished, ...this.recent].slice(0, MAXIMUM_SUMMARIES);
    this.save();
  }

  private snapshot(summary: MutableSummary): StreamSummary {
    return { ...summary, platforms: Object.fromEntries(Object.entries(summary.platforms).map(([id, value]) => [id, { ...value }])), problems: [...summary.problems] };
  }

  private saveSoon(): void {
    if (this.now() - this.lastSavedAt >= 60_000) this.save();
  }

  private save(): void {
    this.lastSavedAt = this.now();
    const encoded = `${JSON.stringify({ version: 1, ...(this.current === undefined ? {} : { current: this.snapshot(this.current) }), summaries: this.recent }, null, 2)}\n`;
    this.writes = this.writes.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.${randomUUID()}.tmp`;
      await writeFile(temporary, encoded, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, this.path);
    }).catch(() => undefined);
  }
}

function validSummary(value: unknown): value is StreamSummary {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (typeof item['id'] !== 'string' || typeof item['startedAt'] !== 'string' || !Number.isFinite(Date.parse(item['startedAt']))) return false;
  if (item['endedAt'] !== undefined && (typeof item['endedAt'] !== 'string' || !Number.isFinite(Date.parse(item['endedAt'])))) return false;
  if (typeof item['platforms'] !== 'object' || item['platforms'] === null || Array.isArray(item['platforms'])) return false;
  for (const platform of Object.values(item['platforms'] as Record<string, unknown>)) {
    if (typeof platform !== 'object' || platform === null) return false;
    const counts = platform as Record<string, unknown>;
    if (!Number.isSafeInteger(counts['messages']) || !Number.isSafeInteger(counts['chatters'])) return false;
  }
  for (const key of ['follows', 'subscriptions', 'giftedSubscriptions', 'support', 'raids', 'redemptions', 'commands', 'adBreaks', 'warnings', 'errors']) if (!Number.isSafeInteger(item[key])) return false;
  return Array.isArray(item['problems']) && item['problems'].every((entry) => typeof entry === 'string');
}
