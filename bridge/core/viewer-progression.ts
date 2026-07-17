import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ViewerIdentityConfig } from '../../schemas/config.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { ViewerProgressionStore } from '../services/viewer-progression-store.js';

const viewerStateSchema = z.object({
  points: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  level: z.number().int().positive(),
  lastAwardAt: z.record(z.string(), z.number().int().nonnegative()),
}).strict();
const stateSchema = z.object({
  version: z.literal(1),
  viewers: z.record(z.string(), viewerStateSchema),
  processedEvents: z.array(z.object({ identity: z.string().length(64), processedAt: z.number().int().nonnegative() }).strict()),
}).strict();

type ProgressionState = z.infer<typeof stateSchema>;
export interface ResolvedViewerIdentity { readonly viewerId: string; readonly linked: boolean; }
export interface ViewerProgressionResult extends ResolvedViewerIdentity { readonly progressionEvent?: NormalizedEvent; }
export interface ViewerProgressionProjection {
  readonly viewerId: string;
  readonly linked: boolean;
  readonly sourceEventId: string;
  readonly sourceEventType: string;
  readonly pointsAwarded: number;
  readonly totalPoints: number;
  readonly previousLevel: number;
  readonly level: number;
  readonly leveledUp: boolean;
  readonly nextLevelAt: number | null;
}

export class ViewerProgressionEngine {
  private readonly accounts = new Map<string, string>();
  private state: ProgressionState = { version: 1, viewers: {}, processedEvents: [] };
  private operationChain: Promise<unknown> = Promise.resolve();

  public constructor(private readonly config: ViewerIdentityConfig, private readonly store: ViewerProgressionStore) {
    for (const link of config.links) for (const account of link.accounts) this.accounts.set(accountKey(account.platform, account.userId), link.viewerId);
  }

  public async start(): Promise<void> {
    if (!this.config.enabled) return;
    const stored = await this.store.load();
    if (stored === undefined) return;
    const parsed = stateSchema.safeParse(stored);
    if (!parsed.success) throw new Error(`Viewer progression state is invalid: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
    this.state = parsed.data;
    this.pruneProcessed(Date.now());
  }

  public async stop(): Promise<void> { await this.store.flush(); }

  public process(event: NormalizedEvent): Promise<ViewerProgressionResult | undefined> {
    const operation = this.operationChain.then(() => this.processInternal(event));
    this.operationChain = operation.catch(() => undefined);
    return operation;
  }

  public status(): Readonly<Record<string, unknown>> {
    return { enabled: this.config.enabled, linkedAccounts: this.accounts.size, trackedViewers: Object.keys(this.state.viewers).length, processedEvents: this.state.processedEvents.length, persistence: this.store.status() };
  }

  private async processInternal(event: NormalizedEvent): Promise<ViewerProgressionResult | undefined> {
    if (!this.config.enabled || event.user?.actorType !== 'human' || event.user.id === undefined) return undefined;
    const linkedId = this.accounts.get(accountKey(event.platform, event.user.id));
    const identity = { viewerId: linkedId ?? scopedViewerId(event.platform, event.user.id), linked: linkedId !== undefined };
    const configuredPoints = this.config.progression.points[event.eventType as keyof typeof this.config.progression.points];
    if (!this.config.progression.enabled || configuredPoints === undefined || configuredPoints <= 0 || (event.metadata.simulated && !this.config.includeSimulated)) return identity;

    const now = Date.now();
    this.pruneProcessed(now);
    const eventIdentity = progressionEventIdentity(event);
    if (this.state.processedEvents.some((entry) => entry.identity === eventIdentity)) return identity;

    const current = this.state.viewers[identity.viewerId] ?? { points: 0, level: 1, lastAwardAt: {} };
    const previousLevel = levelFor(current.points, this.config.progression.levelThresholds);
    const cooldown = this.config.progression.cooldownsMs[event.eventType as keyof typeof this.config.progression.cooldownsMs] ?? 0;
    const lastAwardAt = current.lastAwardAt[event.eventType] ?? 0;
    const canAward = now - lastAwardAt >= cooldown;
    const awarded = canAward ? configuredPoints : 0;
    const totalPoints = Math.min(Number.MAX_SAFE_INTEGER, current.points + awarded);
    const level = levelFor(totalPoints, this.config.progression.levelThresholds);
    const nextState: ProgressionState = {
      version: 1,
      viewers: {
        ...this.state.viewers,
        [identity.viewerId]: {
          points: totalPoints,
          level,
          lastAwardAt: canAward ? { ...current.lastAwardAt, [event.eventType]: now } : { ...current.lastAwardAt },
        },
      },
      processedEvents: [...this.state.processedEvents, { identity: eventIdentity, processedAt: now }],
    };
    if (nextState.processedEvents.length > this.config.maxProcessedEvents) nextState.processedEvents.splice(0, nextState.processedEvents.length - this.config.maxProcessedEvents);
    const previousState = this.state;
    this.state = nextState;
    if (awarded > 0) {
      try { await this.store.save(this.state); }
      catch (error) { this.state = previousState; throw error; }
    }
    else this.store.scheduleSave(this.state);
    if (awarded === 0) return identity;

    const nextLevelAt = this.config.progression.levelThresholds[level];
    return {
      ...identity,
      progressionEvent: {
        schemaVersion: '1.0.0',
        eventId: `progression-${eventIdentity.slice(0, 40)}`,
        eventType: 'viewer.progression',
        platform: event.platform,
        source: { adapter: 'viewer-progression', eventId: `progression-${eventIdentity}`, eventName: 'ViewerProgression' },
        receivedAt: new Date(now).toISOString(),
        channel: event.channel,
        payload: {
          viewerId: identity.viewerId,
          linked: identity.linked,
          sourceEventId: event.eventId,
          sourceEventType: event.eventType,
          pointsAwarded: awarded,
          totalPoints,
          previousLevel,
          level,
          leveledUp: level > previousLevel,
          nextLevelAt: nextLevelAt ?? null,
        },
        metadata: { correlationId: event.eventId, simulated: event.metadata.simulated, viewerId: identity.viewerId },
      },
    };
  }

  private pruneProcessed(now: number): void {
    const cutoff = now - this.config.processedEventTtlMs;
    this.state.processedEvents = this.state.processedEvents.filter((entry) => entry.processedAt > cutoff).slice(-this.config.maxProcessedEvents);
  }
}

export function projectViewerProgression(event: NormalizedEvent): ViewerProgressionProjection | undefined {
  if (event.eventType !== 'viewer.progression') return undefined;
  const viewerId = readString(event, 'viewerId');
  if (!/^[a-z][a-z0-9-]{0,63}$/u.test(viewerId)) throw new Error('viewer.progression payload.viewerId must be a lowercase identifier.');
  if (event.metadata.viewerId !== viewerId) throw new Error('viewer.progression metadata.viewerId must match payload.viewerId.');
  const projection = {
    viewerId,
    linked: readBoolean(event, 'linked'),
    sourceEventId: readString(event, 'sourceEventId'),
    sourceEventType: readString(event, 'sourceEventType'),
    pointsAwarded: readInteger(event, 'pointsAwarded', 1),
    totalPoints: readInteger(event, 'totalPoints', 0),
    previousLevel: readInteger(event, 'previousLevel', 1),
    level: readInteger(event, 'level', 1),
    leveledUp: readBoolean(event, 'leveledUp'),
    nextLevelAt: event.payload['nextLevelAt'] === null ? null : readInteger(event, 'nextLevelAt', 0),
  };
  if (projection.level < projection.previousLevel) throw new Error('viewer.progression level cannot decrease.');
  return projection;
}

function accountKey(platform: string, userId: string): string { return `${platform}\u0000${userId}`; }
function scopedViewerId(platform: string, userId: string): string { return `${platform}-${createHash('sha256').update(accountKey(platform, userId)).digest('hex').slice(0, 24)}`; }
function progressionEventIdentity(event: NormalizedEvent): string { return createHash('sha256').update(`${event.platform}\u0000${event.eventType}\u0000${event.source.eventId ?? event.eventId}`).digest('hex'); }
function levelFor(points: number, thresholds: readonly number[]): number {
  let level = 1;
  for (let index = 1; index < thresholds.length; index += 1) if (points >= (thresholds[index] ?? Number.MAX_SAFE_INTEGER)) level = index + 1;
  return level;
}
function readString(event: NormalizedEvent, key: string): string { const value = event.payload[key]; if (typeof value !== 'string' || value.length === 0) throw new Error(`viewer.progression payload.${key} must be a non-empty string.`); return value; }
function readBoolean(event: NormalizedEvent, key: string): boolean { const value = event.payload[key]; if (typeof value !== 'boolean') throw new Error(`viewer.progression payload.${key} must be a boolean.`); return value; }
function readInteger(event: NormalizedEvent, key: string, minimum: number): number { const value = event.payload[key]; if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw new Error(`viewer.progression payload.${key} must be a safe integer of at least ${String(minimum)}.`); return value; }
