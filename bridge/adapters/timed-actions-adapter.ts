import { readFile } from 'node:fs/promises';
import type { PlatformConfig, TimedActionDefinition, TimedActionsConfig } from '../../schemas/config.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import { buildNormalizedEvent } from './normalization.js';
import type { AdapterContext } from './adapter.js';
import { ManagedAdapter } from './adapter.js';
import { writeJsonAtomic } from '../services/atomic-state.js';

interface TimerState {
  lastScheduledAt?: string;
  nextScheduledAt?: string;
  nextIntervalMinutes?: number;
  occurrence?: number;
  remaining?: number[];
  lastSelected?: number;
  cycle?: number;
  pending?: { scheduledAt: string; index: number };
  platformBags?: Record<string, { remaining: number[]; lastSelected?: number; cycle: number; pending?: { scheduledAt: string; index: number } }>;
}
interface TimedActionState {
  session: { active: boolean; paused: boolean; startedAt: string; pausedAt?: string };
  timers: Record<string, TimerState>;
}
interface Selection {
  mode: 'fixed' | 'shuffle-container' | 'platform-shuffle'; message: string; messages: Readonly<Record<string, string>>;
  index?: number; platformIndexes?: Readonly<Record<string, number>>; cycle: number; position: number; size: number;
}
const MAX_TIMEOUT_MS = 2_147_000_000;
const MAX_CHAT_ACTIVITY_ENTRIES = 10_000;

// Raised when a wizard test targets a timer the RUNNING bridge does not know about —
// typically a staged-but-uncommitted timer, or a committed one awaiting a restart.
export class UnknownTimedActionError extends Error {}

export class TimedActionsAdapter extends ManagedAdapter {
  private context: AdapterContext | undefined;
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private stateData: TimedActionState = { session: { active: false, paused: false, startedAt: '' }, timers: {} };
  private writeChain: Promise<void> = Promise.resolve();
  private stopping = false;
  private readonly livePlatforms = new Set<string>();
  private readonly chatActivity: Array<{ at: number; platform: string }> = [];
  private chatActivityHead = 0;
  private readonly activityRetentionMinutes: number;
  private currentScene: string | undefined;

  public constructor(name: string, config: PlatformConfig, private readonly timedActions: TimedActionsConfig, private readonly random: () => number = Math.random) {
    super(name, config);
    // Activity is shared by all timers, so retain only the longest configured gate window.
    // Timers without an activity gate do not cause chat timestamps to be retained.
    this.activityRetentionMinutes = Math.max(0, ...timedActions.definitions
      .filter((definition) => definition.gates.activity.minimumMessages > 0)
      .map((definition) => definition.gates.activity.windowMinutes));
  }

  public async start(context: AdapterContext): Promise<void> {
    if (!this.config.enabled || !this.config.inputEnabled) { this.state = 'disabled'; return; }
    this.context = context; this.stopping = false;
    this.stateData = await loadState(this.timedActions.stateFile);
    this.state = 'connected'; this.lastError = undefined;
    if (this.stateData.session.active && !this.stateData.session.paused) for (const definition of this.timedActions.definitions) if (definition.enabled) await this.plan(definition);
    context.logger.info('Timed actions adapter started', { adapter: this.name, sessionStartedAt: this.stateData.session.startedAt, enabledDefinitions: this.timedActions.definitions.filter((item) => item.enabled).length });
  }

  public async stop(): Promise<void> {
    this.stopping = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    await this.persist();
    this.context = undefined; this.state = 'stopped';
  }

  public async control(operation: 'start' | 'stop' | 'pause' | 'resume'): Promise<Readonly<Record<string, unknown>>> {
    if (operation === 'start') {
      this.clearTimers();
      this.stateData.session = { active: true, paused: false, startedAt: new Date().toISOString() };
      for (const timer of Object.values(this.stateData.timers)) {
        delete timer.lastScheduledAt; delete timer.nextScheduledAt; delete timer.nextIntervalMinutes; delete timer.occurrence; delete timer.pending;
      }
      await this.persist();
      for (const definition of this.timedActions.definitions) if (definition.enabled) await this.plan(definition);
    } else if (operation === 'stop') {
      this.clearTimers(); this.stateData.session = { active: false, paused: false, startedAt: '' }; await this.persist();
    } else if (operation === 'pause' && this.stateData.session.active && !this.stateData.session.paused) {
      this.clearTimers(); this.stateData.session.paused = true; this.stateData.session.pausedAt = new Date().toISOString(); await this.persist();
    } else if (operation === 'resume' && this.stateData.session.active && this.stateData.session.paused) {
      const shift = Date.now() - Date.parse(this.stateData.session.pausedAt ?? new Date().toISOString());
      this.stateData.session.startedAt = new Date(Date.parse(this.stateData.session.startedAt) + shift).toISOString();
      for (const timer of Object.values(this.stateData.timers)) {
        if (timer.lastScheduledAt !== undefined) timer.lastScheduledAt = new Date(Date.parse(timer.lastScheduledAt) + shift).toISOString();
        if (timer.nextScheduledAt !== undefined) timer.nextScheduledAt = new Date(Date.parse(timer.nextScheduledAt) + shift).toISOString();
      }
      this.stateData.session.paused = false; delete this.stateData.session.pausedAt; await this.persist();
      for (const definition of this.timedActions.definitions) if (definition.enabled) await this.plan(definition);
    }
    return this.controlStatus();
  }

  public controlStatus(): Readonly<Record<string, unknown>> { return { ...this.stateData.session, armedTimers: this.timers.size, activityEntries: this.chatActivity.length - this.chatActivityHead }; }
  public observe(event: NormalizedEvent): void {
    if (event.eventType === 'stream.online') this.livePlatforms.add(event.platform);
    if (event.eventType === 'stream.offline') this.livePlatforms.delete(event.platform);
    if (event.eventType === 'chat.message' && this.activityRetentionMinutes > 0) {
      const now = Date.now();
      this.chatActivity.push({ at: now, platform: event.platform });
      this.pruneActivity(now - this.activityRetentionMinutes * 60_000);
      const excess = this.chatActivity.length - this.chatActivityHead - MAX_CHAT_ACTIVITY_ENTRIES;
      if (excess > 0) this.chatActivityHead += excess;
      this.compactActivity();
    }
    if (event.eventType === 'stream.scene-changed' && typeof event.payload['sceneName'] === 'string') this.currentScene = event.payload['sceneName'];
  }
  public async test(id: string): Promise<Readonly<Record<string, unknown>>> {
    const definition = this.timedActions.definitions.find((candidate) => candidate.id === id);
    if (definition === undefined) throw new UnknownTimedActionError(`The running bridge has no timer "${id}". If you just created or changed it, commit the draft and restart StreamBridge, then test again.`);
    if (this.context === undefined) throw new Error('Timed actions adapter is not running');
    const now = new Date().toISOString();
    await this.emitDefinition(definition, now, (this.timerState(id).occurrence ?? 0) + 1, 0, true);
    return { accepted: true, timerId: id, simulated: true };
  }
  private clearTimers(): void { for (const timer of this.timers.values()) clearTimeout(timer); this.timers.clear(); }

  private async plan(definition: TimedActionDefinition): Promise<void> {
    if (this.stopping || !this.stateData.session.active || this.stateData.session.paused) return;
    const timer = this.timerState(definition.id);
    if (definition.intervalMode === 'random') {
      if (timer.nextScheduledAt === undefined) {
        const anchor = timer.lastScheduledAt === undefined ? Date.parse(this.stateData.session.startedAt) : Date.parse(timer.lastScheduledAt);
        const intervalMinutes = timer.lastScheduledAt === undefined && definition.firstRunAfterMinutes !== undefined
          ? definition.firstRunAfterMinutes
          : this.intervalMinutes(definition);
        timer.nextIntervalMinutes = intervalMinutes;
        timer.nextScheduledAt = new Date(anchor + intervalMinutes * 60_000).toISOString();
        timer.occurrence = (timer.occurrence ?? 0) + 1;
        await this.persist();
      }
      const due = Date.parse(timer.nextScheduledAt);
      if (due <= Date.now() && definition.missedRunPolicy === 'skip') {
        timer.lastScheduledAt = new Date().toISOString();
        delete timer.nextScheduledAt; delete timer.nextIntervalMinutes;
        await this.persist(); await this.plan(definition); return;
      }
      this.arm(definition, timer.nextScheduledAt, timer.occurrence ?? 1, due <= Date.now() ? 1 : 0);
      return;
    }
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
    const blockedReason = this.gateReason(definition);
    if (blockedReason !== undefined) {
      const timer = this.timerState(definition.id);
      timer.lastScheduledAt = scheduledAt; timer.occurrence = occurrence;
      delete timer.nextScheduledAt; delete timer.nextIntervalMinutes;
      await this.persist();
      this.context.logger.info('Timed action skipped by gate', { timerId: definition.id, reason: blockedReason });
      await this.plan(definition); return;
    }
    try {
      await this.emitDefinition(definition, scheduledAt, occurrence, missedRuns, false);
      const timer = this.timerState(definition.id); timer.lastScheduledAt = scheduledAt; timer.occurrence = occurrence;
      delete timer.nextScheduledAt; delete timer.nextIntervalMinutes;
      await this.persist(); await this.plan(definition);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error); this.state = 'degraded';
      this.context.logger.warn('Timed action emission failed; retrying', { timerId: definition.id, scheduledAt, error });
      this.timers.set(definition.id, setTimeout(() => void this.fire(definition, scheduledAt, occurrence, missedRuns), 1_000));
    }
  }

  private async emitDefinition(definition: TimedActionDefinition, scheduledAt: string, occurrence: number, missedRuns: number, simulated: boolean): Promise<void> {
    if (this.context === undefined) throw new Error('Timed actions adapter is not running');
    const selection = await this.select(definition, scheduledAt);
    const firedAt = new Date().toISOString();
    const event = buildNormalizedEvent({
      eventType: 'system.timed', platform: 'system', adapter: this.name, sourceEventName: simulated ? 'timed-action.test' : 'timed-action.fired', sourceEventId: `${definition.id}:${scheduledAt}:${simulated ? 'test' : 'live'}`,
      receivedAt: firedAt, channel: { id: 'local', name: 'local' }, payload: {
        timerId: definition.id, timerName: definition.name, scheduleType: 'session-interval', scheduledAt, firedAt, occurrence, missedRuns,
        lateByMs: Math.max(0, Date.parse(firedAt) - Date.parse(scheduledAt)), selectionMode: selection.mode, selectedMessage: selection.message, selectedMessages: selection.messages,
        containerCycle: selection.cycle, containerPosition: selection.position, containerSize: selection.size, creatorPayload: definition.payload,
        targetProvider: definition.target.provider,
        ...(definition.target.provider === 'run-existing-action' ? {
          targetActionId: definition.target.actionId, targetActionName: definition.target.actionName, targetActionApproved: true,
        } : {}),
        targetPlatforms: definition.gates.platforms,
        deliveryPlatforms: definition.target.provider === 'run-existing-action' ? definition.target.deliveryPlatforms : [],
      },
      simulated,
    });
    await this.context.emit(event);
    this.lastEventAt = firedAt; this.lastError = undefined; this.state = 'connected';
    const timer = this.timerState(definition.id);
    if (selection.index !== undefined && !simulated) { timer.remaining = (timer.remaining ?? []).filter((index) => index !== selection.index); timer.lastSelected = selection.index; delete timer.pending; }
    if (selection.platformIndexes !== undefined && !simulated) for (const [platform, index] of Object.entries(selection.platformIndexes)) {
      const bag = timer.platformBags?.[platform]; if (bag === undefined) continue;
      bag.remaining = bag.remaining.filter((candidate) => candidate !== index); bag.lastSelected = index; delete bag.pending;
    }
  }

  private intervalMinutes(definition: TimedActionDefinition): number {
    if (definition.intervalMode !== 'random') return definition.everyMinutes;
    const minimum = definition.minimumMinutes ?? definition.everyMinutes;
    const maximum = definition.maximumMinutes ?? minimum;
    return minimum + Math.floor(Math.min(1, Math.max(0, this.random())) * (maximum - minimum + 1));
  }

  private gateReason(definition: TimedActionDefinition): string | undefined {
    if (definition.gates.requireLive && this.livePlatforms.size === 0) return 'stream-offline';
    if (definition.gates.platforms.length > 0 && !definition.gates.platforms.some((platform) => this.livePlatforms.has(platform))) return 'target-platform-offline';
    if (definition.gates.scenes.length > 0 && (this.currentScene === undefined || !definition.gates.scenes.includes(this.currentScene))) return this.currentScene === undefined ? 'scene-unavailable' : 'scene-mismatch';
    const { minimumMessages, windowMinutes } = definition.gates.activity;
    if (minimumMessages > 0) {
      const threshold = Date.now() - windowMinutes * 60_000;
      let count = 0;
      for (let index = this.chatActivityHead; index < this.chatActivity.length && count < minimumMessages; index += 1) {
        const entry = this.chatActivity[index];
        if (entry !== undefined && entry.at >= threshold && (definition.gates.platforms.length === 0 || definition.gates.platforms.includes(entry.platform))) count += 1;
      }
      if (count < minimumMessages) return 'quiet-chat';
    }
    return undefined;
  }

  private pruneActivity(threshold: number): void {
    while ((this.chatActivity[this.chatActivityHead]?.at ?? Number.POSITIVE_INFINITY) < threshold) this.chatActivityHead += 1;
    this.compactActivity();
  }

  private compactActivity(): void {
    if (this.chatActivityHead < 1_024 && this.chatActivityHead * 2 < this.chatActivity.length) return;
    if (this.chatActivityHead > 0) this.chatActivity.splice(0, this.chatActivityHead);
    this.chatActivityHead = 0;
  }

  private async select(definition: TimedActionDefinition, scheduledAt: string): Promise<Selection> {
    if (definition.selection.mode === 'fixed') return { mode: 'fixed', message: '', messages: {}, cycle: 0, position: 0, size: 0 };
    if (definition.selection.mode === 'platform-shuffle') return this.selectPlatformMessages(definition, scheduledAt);
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
    return { mode: 'shuffle-container', message: messages[index] ?? '', messages: {}, index, cycle: timer.cycle ?? 1, position: messages.length - timer.remaining.length + 1, size: messages.length };
  }

  private async selectPlatformMessages(definition: TimedActionDefinition, scheduledAt: string): Promise<Selection> {
    if (definition.selection.mode !== 'platform-shuffle') throw new Error('Platform message selection requires platform-shuffle mode.');
    const timer = this.timerState(definition.id); timer.platformBags ??= {};
    const selectedMessages: Record<string, string> = {}; const platformIndexes: Record<string, number> = {};
    let firstCycle = 0; let firstPosition = 0; let firstSize = 0;
    for (const [platform, messages] of Object.entries(definition.selection.messagesByPlatform)) {
      if (messages === undefined || messages.length === 0) continue;
      const bag = timer.platformBags[platform] ??= { remaining: [], cycle: 0 };
      if (bag.remaining.length === 0 || bag.remaining.some((index) => index >= messages.length)) { bag.remaining = messages.map((_, index) => index); bag.cycle += 1; }
      let index = bag.pending?.scheduledAt === scheduledAt ? bag.pending.index : -1;
      if (!bag.remaining.includes(index)) {
        const candidates = bag.remaining.length > 1 && bag.lastSelected !== undefined ? bag.remaining.filter((candidate) => candidate !== bag.lastSelected) : bag.remaining;
        index = candidates[Math.min(candidates.length - 1, Math.floor(this.random() * candidates.length))] ?? bag.remaining[0] ?? 0;
        bag.pending = { scheduledAt, index };
      }
      selectedMessages[platform] = messages[index] ?? ''; platformIndexes[platform] = index;
      if (firstSize === 0) { firstCycle = bag.cycle; firstPosition = messages.length - bag.remaining.length + 1; firstSize = messages.length; }
    }
    await this.persist();
    return { mode: 'platform-shuffle', message: Object.values(selectedMessages)[0] ?? '', messages: selectedMessages, platformIndexes, cycle: firstCycle, position: firstPosition, size: firstSize };
  }

  private timerState(id: string): TimerState { return this.stateData.timers[id] ??= {}; }
  private async persist(): Promise<void> { this.writeChain = this.writeChain.then(() => writeJsonAtomic(this.timedActions.stateFile, this.stateData)); await this.writeChain; }
}

async function loadState(path: string): Promise<TimedActionState> {
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as Omit<Partial<TimedActionState>, 'session'> & { session?: Partial<TimedActionState['session']> };
    if (value.session !== undefined && value.session.paused === undefined) value.session.paused = false;
    if (value.session !== undefined && value.timers !== undefined) return value as TimedActionState;
    return { session: { active: false, paused: false, startedAt: '' }, timers: {} };
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { session: { active: false, paused: false, startedAt: '' }, timers: {} }; throw error; }
}

export function isTimedActionsController(value: unknown): value is TimedActionsAdapter { return value instanceof TimedActionsAdapter; }
