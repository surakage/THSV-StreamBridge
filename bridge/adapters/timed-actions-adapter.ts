import { readFile } from 'node:fs/promises';
import type { PlatformConfig, TimedActionDefinition, TimedActionsConfig } from '../../schemas/config.js';
import { buildNormalizedEvent } from './normalization.js';
import type { AdapterContext } from './adapter.js';
import { ManagedAdapter } from './adapter.js';
import { writeJsonAtomic } from '../services/atomic-state.js';

interface TimerState {
  lastScheduledAt?: string;
  remaining?: number[];
  lastSelected?: number;
  cycle?: number;
  pending?: { scheduledAt: string; index: number };
}
interface TimedActionState {
  session: { active: boolean; startedAt: string };
  timers: Record<string, TimerState>;
}
interface Selection { mode: 'fixed' | 'shuffle-container'; message: string; index?: number; cycle: number; position: number; size: number }
const MAX_TIMEOUT_MS = 2_147_000_000;

export class TimedActionsAdapter extends ManagedAdapter {
  private context: AdapterContext | undefined;
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private stateData: TimedActionState = { session: { active: false, startedAt: '' }, timers: {} };
  private writeChain: Promise<void> = Promise.resolve();
  private stopping = false;

  public constructor(name: string, config: PlatformConfig, private readonly timedActions: TimedActionsConfig, private readonly random: () => number = Math.random) { super(name, config); }

  public async start(context: AdapterContext): Promise<void> {
    if (!this.config.enabled || !this.config.inputEnabled) { this.state = 'disabled'; return; }
    this.context = context; this.stopping = false;
    this.stateData = await loadState(this.timedActions.stateFile);
    if (!this.stateData.session.active) {
      this.stateData.session = { active: true, startedAt: new Date().toISOString() };
      for (const timer of Object.values(this.stateData.timers)) delete timer.lastScheduledAt;
      await this.persist();
    }
    this.state = 'connected'; this.lastError = undefined;
    for (const definition of this.timedActions.definitions) if (definition.enabled) await this.plan(definition);
    context.logger.info('Timed actions adapter started', { adapter: this.name, sessionStartedAt: this.stateData.session.startedAt, enabledDefinitions: this.timedActions.definitions.filter((item) => item.enabled).length });
  }

  public async stop(): Promise<void> {
    this.stopping = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.stateData.session.active = false;
    await this.persist();
    this.context = undefined; this.state = 'stopped';
  }

  private async plan(definition: TimedActionDefinition): Promise<void> {
    if (this.stopping) return;
    const timer = this.timerState(definition.id);
    const interval = definition.everyMinutes * 60_000;
    const firstDelay = (definition.firstRunAfterMinutes ?? definition.everyMinutes) * 60_000;
    const sessionStart = Date.parse(this.stateData.session.startedAt);
    const firstDue = sessionStart + firstDelay;
    let occurrence = timer.lastScheduledAt === undefined ? 1 : Math.floor((Date.parse(timer.lastScheduledAt) - firstDue) / interval) + 2;
    let due = firstDue + (occurrence - 1) * interval;
    const now = Date.now();
    if (due <= now) {
      const latestOccurrence = Math.floor((now - firstDue) / interval) + 1;
      const missedRuns = Math.max(0, latestOccurrence - occurrence);
      if (definition.missedRunPolicy === 'skip') {
        timer.lastScheduledAt = new Date(firstDue + (latestOccurrence - 1) * interval).toISOString();
        await this.persist();
        occurrence = latestOccurrence + 1; due = firstDue + (occurrence - 1) * interval;
        this.arm(definition, new Date(due).toISOString(), occurrence, 0); return;
      }
      occurrence = latestOccurrence; due = firstDue + (occurrence - 1) * interval;
      this.arm(definition, new Date(due).toISOString(), occurrence, missedRuns); return;
    }
    this.arm(definition, new Date(due).toISOString(), occurrence, 0);
  }

  private arm(definition: TimedActionDefinition, scheduledAt: string, occurrence: number, missedRuns: number): void {
    const delay = Math.max(0, Math.min(Date.parse(scheduledAt) - Date.now(), MAX_TIMEOUT_MS));
    this.timers.set(definition.id, setTimeout(() => void this.fire(definition, scheduledAt, occurrence, missedRuns), delay));
  }

  private async fire(definition: TimedActionDefinition, scheduledAt: string, occurrence: number, missedRuns: number): Promise<void> {
    if (this.stopping || this.context === undefined) return;
    this.timers.delete(definition.id);
    if (Date.parse(scheduledAt) > Date.now()) { this.arm(definition, scheduledAt, occurrence, missedRuns); return; }
    const selection = await this.select(definition, scheduledAt);
    const firedAt = new Date().toISOString();
    const event = buildNormalizedEvent({
      eventType: 'system.timed', platform: 'system', adapter: this.name, sourceEventName: 'timed-action.fired', sourceEventId: `${definition.id}:${scheduledAt}`,
      receivedAt: firedAt, channel: { id: 'local', name: 'local' }, payload: {
        timerId: definition.id, timerName: definition.name, scheduleType: 'session-interval', scheduledAt, firedAt, occurrence, missedRuns,
        lateByMs: Math.max(0, Date.parse(firedAt) - Date.parse(scheduledAt)), selectionMode: selection.mode, selectedMessage: selection.message,
        containerCycle: selection.cycle, containerPosition: selection.position, containerSize: selection.size, creatorPayload: definition.payload,
      },
    });
    try {
      await this.context.emit(event);
      this.lastEventAt = firedAt; this.lastError = undefined; this.state = 'connected';
      const timer = this.timerState(definition.id); timer.lastScheduledAt = scheduledAt;
      if (selection.index !== undefined) { timer.remaining = (timer.remaining ?? []).filter((index) => index !== selection.index); timer.lastSelected = selection.index; delete timer.pending; }
      await this.persist(); await this.plan(definition);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error); this.state = 'degraded';
      this.context.logger.warn('Timed action emission failed; retrying', { timerId: definition.id, scheduledAt, error });
      this.timers.set(definition.id, setTimeout(() => void this.fire(definition, scheduledAt, occurrence, missedRuns), 1_000));
    }
  }

  private async select(definition: TimedActionDefinition, scheduledAt: string): Promise<Selection> {
    if (definition.selection.mode === 'fixed') return { mode: 'fixed', message: '', cycle: 0, position: 0, size: 0 };
    const timer = this.timerState(definition.id); const messages = definition.selection.messages;
    if (timer.remaining === undefined || timer.remaining.length === 0) {
      timer.remaining = messages.map((_, index) => index); timer.cycle = (timer.cycle ?? 0) + 1;
    }
    let index = timer.pending?.scheduledAt === scheduledAt ? timer.pending.index : -1;
    if (!timer.remaining.includes(index)) {
      const candidates = timer.remaining.length > 1 && timer.lastSelected !== undefined ? timer.remaining.filter((item) => item !== timer.lastSelected) : timer.remaining;
      index = candidates[Math.min(candidates.length - 1, Math.floor(this.random() * candidates.length))] ?? timer.remaining[0] ?? 0;
      timer.pending = { scheduledAt, index }; await this.persist();
    }
    return { mode: 'shuffle-container', message: messages[index] ?? '', index, cycle: timer.cycle ?? 1, position: messages.length - timer.remaining.length + 1, size: messages.length };
  }

  private timerState(id: string): TimerState { return this.stateData.timers[id] ??= {}; }
  private async persist(): Promise<void> { this.writeChain = this.writeChain.then(() => writeJsonAtomic(this.timedActions.stateFile, this.stateData)); await this.writeChain; }
}

async function loadState(path: string): Promise<TimedActionState> {
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as Partial<TimedActionState>;
    if (value.session !== undefined && value.timers !== undefined) return value as TimedActionState;
    return { session: { active: false, startedAt: '' }, timers: {} };
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { session: { active: false, startedAt: '' }, timers: {} }; throw error; }
}
