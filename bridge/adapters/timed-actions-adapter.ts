import { readFile } from 'node:fs/promises';
import type { PlatformConfig, TimedActionDefinition, TimedActionsConfig } from '../../schemas/config.js';
import { buildNormalizedEvent } from './normalization.js';
import type { AdapterContext } from './adapter.js';
import { ManagedAdapter } from './adapter.js';
import { writeJsonAtomic } from '../services/atomic-state.js';

interface TimedActionState {
  readonly completed: Readonly<Record<string, string>>;
}

const MAX_TIMEOUT_MS = 2_147_000_000;

export class TimedActionsAdapter extends ManagedAdapter {
  private context: AdapterContext | undefined;
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private completed: Record<string, string> = {};
  private writeChain: Promise<void> = Promise.resolve();
  private stopping = false;

  public constructor(name: string, config: PlatformConfig, private readonly timedActions: TimedActionsConfig) {
    super(name, config);
  }

  public async start(context: AdapterContext): Promise<void> {
    if (!this.config.enabled || !this.config.inputEnabled) { this.state = 'disabled'; return; }
    this.context = context;
    this.stopping = false;
    this.completed = await loadState(this.timedActions.stateFile);
    this.state = 'connected';
    this.lastError = undefined;
    for (const definition of this.timedActions.definitions) if (definition.enabled) await this.plan(definition);
    context.logger.info('Timed actions adapter started', { adapter: this.name, enabledDefinitions: this.timedActions.definitions.filter((item) => item.enabled).length });
  }

  public async stop(): Promise<void> {
    this.stopping = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.context = undefined;
    await this.writeChain;
    this.state = 'stopped';
  }

  private async plan(definition: TimedActionDefinition): Promise<void> {
    if (this.stopping) return;
    const now = Date.now();
    const last = this.completed[definition.id];
    if (definition.schedule.type === 'once') {
      if (last === definition.schedule.at) return;
      const due = Date.parse(definition.schedule.at);
      if (due <= now && definition.missedRunPolicy === 'skip') {
        await this.complete(definition.id, definition.schedule.at);
        return;
      }
      this.arm(definition, definition.schedule.at, 1, 0);
      return;
    }

    const anchor = Date.parse(definition.schedule.anchorAt);
    const every = definition.schedule.everyMs;
    let occurrence = last === undefined ? 1 : Math.floor((Date.parse(last) - anchor) / every) + 2;
    let due = anchor + (occurrence - 1) * every;
    if (due <= now) {
      const latestOccurrence = Math.floor((now - anchor) / every) + 1;
      const missedRuns = Math.max(0, latestOccurrence - occurrence);
      if (definition.missedRunPolicy === 'skip') {
        const latest = new Date(anchor + (latestOccurrence - 1) * every).toISOString();
        await this.complete(definition.id, latest);
        occurrence = latestOccurrence + 1;
        due = anchor + (occurrence - 1) * every;
        this.arm(definition, new Date(due).toISOString(), occurrence, 0);
        return;
      }
      occurrence = latestOccurrence;
      due = anchor + (occurrence - 1) * every;
      this.arm(definition, new Date(due).toISOString(), occurrence, missedRuns);
      return;
    }
    this.arm(definition, new Date(due).toISOString(), occurrence, 0);
  }

  private arm(definition: TimedActionDefinition, scheduledAt: string, occurrence: number, missedRuns: number): void {
    const delay = Math.max(0, Math.min(Date.parse(scheduledAt) - Date.now(), MAX_TIMEOUT_MS));
    const timer = setTimeout(() => void this.fire(definition, scheduledAt, occurrence, missedRuns), delay);
    this.timers.set(definition.id, timer);
  }

  private async fire(definition: TimedActionDefinition, scheduledAt: string, occurrence: number, missedRuns: number): Promise<void> {
    if (this.stopping || this.context === undefined) return;
    this.timers.delete(definition.id);
    if (Date.parse(scheduledAt) > Date.now()) {
      this.arm(definition, scheduledAt, occurrence, missedRuns);
      return;
    }
    const firedAt = new Date().toISOString();
    const event = buildNormalizedEvent({
      eventType: 'system.timed', platform: 'system', adapter: this.name,
      sourceEventName: 'timed-action.fired', sourceEventId: `${definition.id}:${scheduledAt}`,
      receivedAt: firedAt, channel: { id: 'local', name: 'local' },
      payload: {
        timerId: definition.id,
        timerName: definition.name,
        scheduleType: definition.schedule.type,
        scheduledAt,
        firedAt,
        occurrence,
        missedRuns,
        lateByMs: Math.max(0, Date.parse(firedAt) - Date.parse(scheduledAt)),
        creatorPayload: definition.payload,
      },
    });
    try {
      await this.context.emit(event);
      this.lastEventAt = firedAt;
      this.lastError = undefined;
      this.state = 'connected';
      await this.complete(definition.id, scheduledAt);
      await this.plan(definition);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.state = 'degraded';
      this.context.logger.warn('Timed action emission failed; retrying', { timerId: definition.id, scheduledAt, error });
      const timer = setTimeout(() => void this.fire(definition, scheduledAt, occurrence, missedRuns), 1_000);
      this.timers.set(definition.id, timer);
    }
  }

  private async complete(id: string, scheduledAt: string): Promise<void> {
    this.completed[id] = scheduledAt;
    this.writeChain = this.writeChain.then(() => writeJsonAtomic(this.timedActions.stateFile, { completed: this.completed } satisfies TimedActionState));
    await this.writeChain;
  }
}

async function loadState(path: string): Promise<Record<string, string>> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<TimedActionState>;
    if (parsed.completed === undefined || typeof parsed.completed !== 'object') return {};
    return Object.fromEntries(Object.entries(parsed.completed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}
