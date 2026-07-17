import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CompanionActionName, CompanionConfig } from '../../schemas/config.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { CompanionStore } from '../services/companion-store.js';
import { projectMultiCommand } from './multi-commands.js';
import { InsufficientViewerPointsError, type ViewerProgressionAdjustmentResult, type ViewerProgressionEngine } from './viewer-progression.js';

const statsSchema = z.object({ happiness: z.number().int().min(0).max(100), fullness: z.number().int().min(0).max(100), energy: z.number().int().min(0).max(100) }).strict();
const stateSchema = z.object({
  version: z.literal(1),
  stats: statsSchema,
  totalInteractions: z.number().int().nonnegative(),
  cooldowns: z.record(z.string(), z.number().int().nonnegative()),
  updatedAt: z.iso.datetime(),
}).strict();

type CompanionState = z.infer<typeof stateSchema>;
export type CompanionRejectionCode = 'unauthorized' | 'simulated-disabled' | 'missing-viewer' | 'cooldown' | 'insufficient-points' | 'disabled';
export type CompanionProcessResult =
  | { readonly status: 'ignored' }
  | { readonly status: 'rejected'; readonly action: CompanionActionName; readonly code: CompanionRejectionCode; readonly message: string }
  | { readonly status: 'accepted'; readonly action: CompanionActionName; readonly event: NormalizedEvent; readonly remainingPoints: number };

export interface CompanionAdministrativeAction { readonly action: CompanionActionName; readonly performedBy: string; readonly reason: string; }
export class CompanionUnavailableError extends Error {}

export class CompanionEngine {
  private state: CompanionState;
  private operationChain: Promise<unknown> = Promise.resolve();
  private runtimeError: string | undefined;
  private readonly byCommand = new Map<string, CompanionActionName>();

  public constructor(private readonly config: CompanionConfig, private readonly store: CompanionStore, private readonly wallet: ViewerProgressionEngine) {
    this.state = { version: 1, stats: { ...config.initialState }, totalInteractions: 0, cooldowns: {}, updatedAt: new Date(0).toISOString() };
    for (const [action, reward] of Object.entries(config.rewards)) if (reward.enabled) this.byCommand.set(reward.command, action as CompanionActionName);
  }

  public async start(): Promise<void> {
    if (!this.config.enabled) return;
    this.runtimeError = undefined;
    const stored = await this.store.load();
    if (stored === undefined) return;
    const parsed = stateSchema.safeParse(stored);
    if (!parsed.success) throw new Error(`Companion state is invalid: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
    this.state = parsed.data;
    this.pruneCooldowns();
  }

  public async stop(): Promise<void> { await this.store.flush(); }

  public process(event: NormalizedEvent): Promise<CompanionProcessResult> {
    const operation = this.operationChain.then(() => this.processInternal(event));
    this.operationChain = operation.catch(() => undefined);
    return operation;
  }

  public triggerAdministrative(input: CompanionAdministrativeAction): Promise<NormalizedEvent> {
    const operation = this.operationChain.then(() => this.triggerAdministrativeInternal(input));
    this.operationChain = operation.catch(() => undefined);
    return operation;
  }

  public degrade(error: unknown): void { if (this.config.enabled) this.runtimeError = formatError(error); }

  public status(): Readonly<Record<string, unknown>> {
    const state = !this.config.enabled ? 'disabled' : this.runtimeError === undefined ? 'active' : 'degraded';
    return { enabled: this.config.enabled, active: state === 'active', state, stats: { ...this.state.stats }, totalInteractions: this.state.totalInteractions, trackedCooldowns: Object.keys(this.state.cooldowns).length, ...(this.runtimeError === undefined ? {} : { lastError: this.runtimeError }), persistence: this.store.status() };
  }

  private async processInternal(event: NormalizedEvent): Promise<CompanionProcessResult> {
    if (!this.config.enabled || this.runtimeError !== undefined) return { status: 'ignored' };
    const command = projectMultiCommand(event);
    if (command === undefined) return { status: 'ignored' };
    const action = this.byCommand.get(command.command);
    if (action === undefined) return { status: 'ignored' };
    const reward = this.config.rewards[action];
    if (!reward.enabled) return { status: 'rejected', action, code: 'disabled', message: `${action} is disabled.` };
    if (!command.authorized) return { status: 'rejected', action, code: 'unauthorized', message: command.authorizationReason };
    if (command.simulated && !this.config.includeSimulated) return { status: 'rejected', action, code: 'simulated-disabled', message: 'Simulated companion rewards are disabled.' };
    if (command.viewerId === undefined) return { status: 'rejected', action, code: 'missing-viewer', message: 'Companion rewards require a bridge-resolved viewer ID.' };
    const now = Date.now();
    const lastAny = this.state.cooldowns[`${command.viewerId}:*`] ?? 0;
    const lastAction = this.state.cooldowns[`${command.viewerId}:${action}`] ?? 0;
    const waitMs = Math.max(this.config.minimumActionIntervalMs - (now - lastAny), reward.cooldownMs - (now - lastAction), 0);
    if (waitMs > 0) return { status: 'rejected', action, code: 'cooldown', message: `Try again in ${String(Math.ceil(waitMs / 1000))} seconds.` };

    let spending: ViewerProgressionAdjustmentResult;
    try { spending = await this.wallet.spend(command.viewerId, reward.cost); }
    catch (error) {
      if (error instanceof InsufficientViewerPointsError) return { status: 'rejected', action, code: 'insufficient-points', message: error.message };
      throw error;
    }
    const previousState = this.state;
    const nextStats = applyEffects(this.state.stats, reward);
    this.state = { version: 1, stats: nextStats, totalInteractions: this.state.totalInteractions + 1, cooldowns: { ...this.state.cooldowns, [`${command.viewerId}:*`]: now, [`${command.viewerId}:${action}`]: now }, updatedAt: new Date(now).toISOString() };
    this.pruneCooldowns();
    try { await this.store.save(this.state); }
    catch (error) {
      this.state = previousState;
      if (reward.cost > 0) await this.wallet.adjust({ viewerId: command.viewerId, operation: 'add', amount: reward.cost, performedBy: 'companion-engine', reason: 'Automatic refund after companion state persistence failure' });
      throw error;
    }
    const eventId = `companion-${createHash('sha256').update(`${event.eventId}\u0000${action}`).digest('hex').slice(0, 40)}`;
    return { status: 'accepted', action, remainingPoints: spending.totalPoints, event: companionEvent(eventId, action, command.user.displayName, command.platform, command.channel, command.simulated, command.viewerId, reward.cost, spending.totalPoints, nextStats, event.eventId) };
  }

  private async triggerAdministrativeInternal(input: CompanionAdministrativeAction): Promise<NormalizedEvent> {
    if (!this.config.enabled || this.runtimeError !== undefined) throw new CompanionUnavailableError(this.runtimeError === undefined ? 'Companion is disabled.' : `Companion is degraded: ${this.runtimeError}`);
    const reward = this.config.rewards[input.action];
    if (!reward.enabled) throw new CompanionUnavailableError(`${input.action} is disabled.`);
    const now = Date.now();
    const previousState = this.state;
    this.state = { ...this.state, stats: applyEffects(this.state.stats, reward), totalInteractions: this.state.totalInteractions + 1, updatedAt: new Date(now).toISOString() };
    try { await this.store.save(this.state); }
    catch (error) { this.state = previousState; throw error; }
    return companionEvent(`companion-admin-${randomUUID()}`, input.action, input.performedBy, 'system', { name: 'Companion Control' }, true, undefined, 0, 0, this.state.stats, `admin:${input.reason}`);
  }

  private pruneCooldowns(): void {
    const entries = Object.entries(this.state.cooldowns).sort((a, b) => a[1] - b[1]);
    if (entries.length <= this.config.maxTrackedCooldowns) return;
    this.state.cooldowns = Object.fromEntries(entries.slice(-this.config.maxTrackedCooldowns));
  }
}

function companionEvent(eventId: string, action: CompanionActionName, actorName: string, platform: string, channel: NormalizedEvent['channel'], simulated: boolean, viewerId: string | undefined, cost: number, remainingPoints: number, stats: CompanionState['stats'], sourceEventId: string): NormalizedEvent {
  return { schemaVersion: '1.0.0', eventId, eventType: 'companion.action', platform, source: { adapter: 'companion', eventId, eventName: 'CompanionAction' }, receivedAt: new Date().toISOString(), channel, user: { name: actorName, displayName: actorName, roles: platform === 'system' ? ['operator'] : [], actorType: platform === 'system' ? 'system' : 'human' }, payload: { action, actorName, cost, remainingPoints, happiness: stats.happiness, fullness: stats.fullness, energy: stats.energy, sourceEventId }, metadata: { correlationId: sourceEventId, simulated, ...(viewerId === undefined ? {} : { viewerId }) } };
}

function applyEffects(stats: CompanionState['stats'], effects: { readonly happiness: number; readonly fullness: number; readonly energy: number }): CompanionState['stats'] {
  return { happiness: clamp(stats.happiness + effects.happiness), fullness: clamp(stats.fullness + effects.fullness), energy: clamp(stats.energy + effects.energy) };
}
function clamp(value: number): number { return Math.max(0, Math.min(100, value)); }
function formatError(error: unknown): string { return error instanceof Error ? error.message : String(error); }
