import { createHash, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { z } from 'zod';
import { jsonValueV2Schema } from '../contracts/v2/common.js';
import { addOnPermissionV2Schema, type AddOnPermissionV2 } from '../contracts/v2/addon-package.js';
import { isProtectedFrameworkActionId, type AddOnActionArgumentsV2, type AddOnOutboundMessageDeliveryV2, type AddOnOutboundMessageRequestV2, type AddOnOverlayLifecycleV2, type AddOnPrivateStateV2, type AddOnProviderDonationRequestV2, type AddOnScheduledTaskV2, type CommunityAnalyticsProviderV1, type CommunityAnalyticsSessionProjectionV1, type CommunityAnalyticsViewerProjectionV1, type ModuleRuntimeContextV2, type ViewerFoundationAdminRequestV1, type ViewerFoundationAdminResultV1, type ViewerFoundationMutationRequestV1, type ViewerFoundationMutationResultV1, type ViewerFoundationProjectionQueryV1, type ViewerFoundationProjectionV1, type ViewerFoundationProviderV1 } from '../contracts/v2/addon-capability.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import { writeJsonAtomic } from '../services/atomic-state.js';
import type { Logger } from '../services/logger.js';
import { addOnRelayAuthorizer } from '../services/addon-relay-authorizer.js';

const MODULE_ID = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u;
const ACTION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const OVERLAY_TOPIC_SUFFIX = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){0,3}$/u;
const MAXIMUM_JSON_BYTES = 65_536;
const MAXIMUM_RECORD_KEYS = 100;
const MAXIMUM_ARGUMENTS = 50;
const MINIMUM_DELAY_MS = 1_000;
const MAXIMUM_DELAY_MS = 86_400_000;
const MAXIMUM_TIMERS_PER_MODULE = 16;
const TASK_TIMEOUT_MS = 5_000;
const MAXIMUM_PENDING_ACTIONS_PER_MODULE = 2;
const MAXIMUM_ACTIONS_PER_MINUTE = 30;
const MAXIMUM_OUTBOUND_REQUESTS_PER_MINUTE = 10;
const MAXIMUM_PROVIDER_EVENTS_PER_MINUTE = 120;
const VIEWER_FOUNDATION_MODULE_ID = 'thsv.viewer-foundation';
const COMMUNITY_ANALYTICS_MODULE_ID = 'thsv.community-analytics';
const VIEWER_PROVIDER_TIMEOUT_MS = 2_000;
const jsonRecordSchema = z.record(z.string().min(1).max(100), jsonValueV2Schema);
const providerDonationSchema = z.object({
  sourceEventId: z.string().trim().min(1).max(256),
  sourceEventType: z.string().trim().min(1).max(100),
  receivedAt: z.iso.datetime({ offset: true }),
  channelName: z.string().trim().min(1).max(256),
  supporterName: z.string().trim().min(1).max(256),
  amount: z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/u),
  currency: z.string().regex(/^[A-Z]{3}$/u),
  message: z.string().max(2_000).optional(),
  simulated: z.boolean(),
}).strict();
const PROVIDER_MODULES: Readonly<Record<string, string>> = Object.freeze({ 'thsv.kofi-donations': 'kofi' });
const viewerIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u);
const viewerProjectionQuerySchema = z.object({
  viewerId: viewerIdSchema.optional(),
  platform: z.enum(['twitch', 'youtube', 'kick', 'tiktok']).optional(),
  userId: z.string().trim().min(1).max(256).optional(),
}).strict().superRefine((query, context) => {
  const byViewer = query.viewerId !== undefined;
  const byAccount = query.platform !== undefined && query.userId !== undefined;
  if (byViewer === byAccount) context.addIssue({ code: 'custom', message: 'Supply exactly one viewerId or one platform/userId account pair.' });
  if ((query.platform === undefined) !== (query.userId === undefined)) context.addIssue({ code: 'custom', message: 'platform and userId must be supplied together.' });
});
const achievementSchema = z.object({ id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u), label: z.string().trim().min(1).max(80), points: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict();
const viewerProjectionSchema = z.object({ contractVersion: z.literal('1.0.0'), viewerId: viewerIdSchema, linked: z.boolean(), points: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), level: z.number().int().positive().max(1_000_000), nextLevelAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), achievements: z.array(achievementSchema).max(20).optional(), latestAchievement: achievementSchema.optional() }).strict();
const viewerMutationSchema = z.object({ viewerId: viewerIdSchema, operation: z.enum(['add', 'spend', 'refund']), amount: z.number().int().min(1).max(1_000_000), reason: z.string().trim().min(1).max(200), idempotencyKey: z.string().trim().min(1).max(128) }).strict();
const viewerMutationResultSchema = viewerProjectionSchema.extend({ operation: z.enum(['add', 'spend', 'refund']), amount: z.number().int().min(1).max(1_000_000), previousPoints: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), duplicate: z.boolean() }).strict();
function parsedViewerProjection(value: unknown): ViewerFoundationProjectionV1 {
  const parsed = viewerProjectionSchema.parse(value);
  return Object.freeze({ contractVersion: parsed.contractVersion, viewerId: parsed.viewerId, linked: parsed.linked, points: parsed.points, level: parsed.level, nextLevelAt: parsed.nextLevelAt, ...(parsed.achievements === undefined ? {} : { achievements: Object.freeze(parsed.achievements.map((item) => Object.freeze(item))) }), ...(parsed.latestAchievement === undefined ? {} : { latestAchievement: Object.freeze(parsed.latestAchievement) }) });
}
function parsedViewerMutation(value: unknown): ViewerFoundationMutationResultV1 {
  const parsed = viewerMutationResultSchema.parse(value); const projection = parsedViewerProjection({ contractVersion: parsed.contractVersion, viewerId: parsed.viewerId, linked: parsed.linked, points: parsed.points, level: parsed.level, nextLevelAt: parsed.nextLevelAt, ...(parsed.achievements === undefined ? {} : { achievements: parsed.achievements }), ...(parsed.latestAchievement === undefined ? {} : { latestAchievement: parsed.latestAchievement }) });
  return Object.freeze({ ...projection, operation: parsed.operation, amount: parsed.amount, previousPoints: parsed.previousPoints, duplicate: parsed.duplicate });
}
const viewerAdminSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('status') }).strict(),
  z.object({ operation: z.literal('export'), viewerId: viewerIdSchema }).strict(),
  z.object({ operation: z.literal('delete'), viewerId: viewerIdSchema, approvedByCreator: z.literal(true) }).strict(),
  z.object({ operation: z.literal('correct'), viewerId: viewerIdSchema, adjustment: z.enum(['add', 'remove', 'reset']), amount: z.number().int().min(1).max(1_000_000).optional(), reason: z.string().trim().min(3).max(200), approvedByCreator: z.literal(true) }).strict()
    .superRefine((value, context) => {
      if (value.adjustment !== 'reset' && value.amount === undefined) context.addIssue({ code: 'custom', message: 'Add and remove corrections require an amount.' });
      if (value.adjustment === 'reset' && value.amount !== undefined) context.addIssue({ code: 'custom', message: 'Reset corrections must not include an amount.' });
    }),
  z.object({ operation: z.literal('import-legacy'), migrationDigest: z.string().regex(/^[a-f0-9]{64}$/u), approvedByCreator: z.literal(true), legacyViewers: z.array(z.object({ viewerId: viewerIdSchema, points: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), lastAwardAt: z.record(z.string().regex(/^[a-z][a-z0-9.-]{0,63}$/u), z.number().int().nonnegative()).refine((value) => Object.keys(value).length <= 50) }).strict()).max(500) }).strict(),
]);
const analyticsCountersSchema = z.object({ messages: z.number().int().nonnegative(), commands: z.number().int().nonnegative(), follows: z.number().int().nonnegative(), subscriptions: z.number().int().nonnegative(), memberships: z.number().int().nonnegative(), giftSubscriptions: z.number().int().nonnegative(), gifts: z.number().int().nonnegative(), cheers: z.number().int().nonnegative(), superChats: z.number().int().nonnegative(), raids: z.number().int().nonnegative(), rewardRedemptions: z.number().int().nonnegative() }).strict();
const analyticsViewerProjectionSchema = z.object({ contractVersion: z.literal('1.0.0'), viewerId: viewerIdSchema, observed: z.boolean(), firstSeenAt: z.number().int().nonnegative().optional(), lastSeenAt: z.number().int().nonnegative().optional(), sessions: z.number().int().nonnegative(), counters: analyticsCountersSchema, activeSession: z.boolean(), activeLastSeenAt: z.number().int().nonnegative().optional(), scoreSeason: z.string().regex(/^\d{4}-\d{2}$/u).optional(), engagementScore: z.number().int().nonnegative().optional(), seasonRank: z.number().int().positive().optional(), rankCohortSize: z.number().int().nonnegative().optional() }).strict();
const analyticsSessionProjectionSchema = z.object({ contractVersion: z.literal('1.0.0'), active: z.boolean(), startedAt: z.number().int().nonnegative().optional(), approximate: z.boolean(), livePlatforms: z.array(z.enum(['twitch', 'youtube', 'kick', 'tiktok'])).max(4), uniqueViewers: z.number().int().nonnegative(), counters: analyticsCountersSchema, retainedSessionCount: z.number().int().nonnegative().max(100) }).strict();

export interface ModuleCapabilityGrant {
  readonly moduleId: string;
  readonly permissions: readonly AddOnPermissionV2[];
  readonly approvedActionIds: readonly string[];
}
interface ActiveModuleCapabilityGrant extends ModuleCapabilityGrant { readonly generation: number; readonly dependencies: readonly string[] }

export interface AddOnCapabilityBrokerDependencies {
  readonly runStreamerBotAction?: (actionId: string, argumentsValue: AddOnActionArgumentsV2, signal: AbortSignal) => Promise<void>;
  readonly publishOverlay?: (moduleId: string, topic: string, payload: Readonly<Record<string, unknown>>) => Promise<void>;
  readonly subscribeOverlayLifecycle?: (moduleId: string, listener: (event: AddOnOverlayLifecycleV2) => void) => () => void;
  readonly routeOutboundMessage?: (request: AddOnOutboundMessageRequestV2, signal: AbortSignal) => Promise<readonly AddOnOutboundMessageDeliveryV2[]>;
  readonly publishProviderEvent?: (event: NormalizedEvent) => Promise<void>;
}

interface CapabilityAudit {
  granted: number;
  denied: number;
  failed: number;
  lastOperation?: string;
  lastResult?: 'granted' | 'denied' | 'failed';
  lastAt?: string;
}

interface ScheduledEntry { readonly moduleId: string; readonly timer: NodeJS.Timeout }
interface ActionActivity { pending: number; readonly startedAt: number[]; readonly controllers: Set<AbortController> }
interface OutboundActivity { pending: number; readonly startedAt: number[]; readonly controllers: Set<AbortController> }
interface ViewerDeletionListener { readonly grant: ActiveModuleCapabilityGrant; readonly listener: (viewerId: string) => void | Promise<void> }

export class CapabilityDeniedError extends Error {
  public constructor(public readonly moduleId: string, public readonly permission: AddOnPermissionV2, message: string) {
    super(message); this.name = 'CapabilityDeniedError';
  }
}

export class AddOnCapabilityBroker {
  private readonly audits = new Map<string, CapabilityAudit>();
  private readonly scheduled = new Map<string, ScheduledEntry>();
  private readonly actionActivity = new Map<string, ActionActivity>();
  private readonly overlaySubscriptions = new Map<string, Set<() => void>>();
  private readonly outboundActivity = new Map<string, OutboundActivity>();
  private readonly providerEventStarts = new Map<string, number[]>();
  private readonly generations = new Map<string, number>();
  private viewerFoundationProvider: { readonly grant: ActiveModuleCapabilityGrant; readonly provider: ViewerFoundationProviderV1 } | undefined;
  private readonly viewerDeletionListeners = new Map<string, Set<ViewerDeletionListener>>();
  private communityAnalyticsProvider: { readonly grant: ActiveModuleCapabilityGrant; readonly provider: CommunityAnalyticsProviderV1 } | undefined;

  public constructor(private readonly logger: Logger, private readonly stateRoot: string, private readonly dependencies: AddOnCapabilityBrokerDependencies = {}) {}

  public contextFor(rawGrant: ModuleCapabilityGrant, settings: Readonly<Record<string, unknown>> = {}, dependencies: readonly string[] = []): ModuleRuntimeContextV2 {
    const validatedGrant = validateGrant(rawGrant);
    const generation = (this.generations.get(validatedGrant.moduleId) ?? 0) + 1;
    this.generations.set(validatedGrant.moduleId, generation);
    const grant: ActiveModuleCapabilityGrant = Object.freeze({ ...validatedGrant, generation, dependencies: Object.freeze([...dependencies]) });
    const permissions = Object.freeze([...grant.permissions]);
    const approvedActionIds = Object.freeze([...grant.approvedActionIds]);
    const has = (permission: AddOnPermissionV2): boolean => permissions.includes(permission);
    const context: ModuleRuntimeContextV2 = {
      moduleId: grant.moduleId,
      grantedPermissions: permissions,
      approvedActionIds,
      has,
      settings: Object.freeze({ ...settings }),
      state: Object.freeze({
        read: () => this.readState(grant),
        write: (value: AddOnPrivateStateV2) => this.writeState(grant, value),
      }),
      streamerbot: Object.freeze({
        runApprovedAction: (actionId: string, argumentsValue: AddOnActionArgumentsV2 = {}) => this.runAction(grant, actionId, argumentsValue),
      }),
      schedule: Object.freeze({
        after: (delayMs: number, task: AddOnScheduledTaskV2) => this.schedule(grant, delayMs, task),
        cancel: (taskId: string) => this.cancel(grant, taskId),
      }),
      overlay: Object.freeze({
        publish: (topic: string, payload: Readonly<Record<string, z.infer<typeof jsonValueV2Schema>>>) => this.publishOverlay(grant, topic, payload),
        onLifecycle: (listener: (event: AddOnOverlayLifecycleV2) => void) => this.subscribeOverlayLifecycle(grant, listener),
      }),
      chat: Object.freeze({ send: (request: AddOnOutboundMessageRequestV2) => this.sendChat(grant, request) }),
      provider: Object.freeze({ publishDonation: (request: AddOnProviderDonationRequestV2) => this.publishProviderDonation(grant, request) }),
      viewerFoundation: Object.freeze({
        provide: (provider: ViewerFoundationProviderV1) => this.provideViewerFoundation(grant, provider),
        getProjection: (query: ViewerFoundationProjectionQueryV1) => this.getViewerProjection(grant, query),
        mutate: (request: ViewerFoundationMutationRequestV1) => this.mutateViewerFoundation(grant, request),
        notifyDeleted: (viewerId: string) => this.notifyViewerDeleted(grant, viewerId),
        onDeleted: (listener: (viewerId: string) => void | Promise<void>) => this.subscribeViewerDeleted(grant, listener),
      }),
      communityAnalytics: Object.freeze({
        provide: (provider: CommunityAnalyticsProviderV1) => this.provideCommunityAnalytics(grant, provider),
        getViewerProjection: (viewerId: string) => this.getCommunityAnalyticsViewerProjection(grant, viewerId),
        getSessionProjection: () => this.getCommunityAnalyticsSessionProjection(grant),
      }),
    };
    return Object.freeze(context);
  }

  public cleanup(moduleId: string): void {
    this.generations.set(moduleId, (this.generations.get(moduleId) ?? 0) + 1);
    for (const [taskId, entry] of this.scheduled) {
      if (entry.moduleId !== moduleId) continue;
      clearTimeout(entry.timer); this.scheduled.delete(taskId);
    }
    const activity = this.actionActivity.get(moduleId);
    if (activity !== undefined) {
      for (const controller of activity.controllers) controller.abort(new Error(`Add-on ${moduleId} stopped before its Streamer.bot action completed.`));
      this.actionActivity.delete(moduleId);
    }
    for (const unsubscribe of this.overlaySubscriptions.get(moduleId) ?? []) unsubscribe();
    this.overlaySubscriptions.delete(moduleId);
    const outbound = this.outboundActivity.get(moduleId);
    if (outbound !== undefined) for (const controller of outbound.controllers) controller.abort(new Error(`Add-on ${moduleId} stopped before its outbound chat request completed.`));
    this.outboundActivity.delete(moduleId);
    this.providerEventStarts.delete(moduleId);
    this.viewerDeletionListeners.delete(moduleId);
    if (this.viewerFoundationProvider?.grant.moduleId === moduleId) this.viewerFoundationProvider = undefined;
    if (this.communityAnalyticsProvider?.grant.moduleId === moduleId) this.communityAnalyticsProvider = undefined;
  }

  public diagnostics(): Readonly<Record<string, unknown>> {
    return {
      stateRoot: resolve(this.stateRoot),
      scheduledTasks: this.scheduled.size,
      actionRequests: Object.fromEntries([...this.actionActivity.entries()].map(([moduleId, activity]) => [moduleId, { pending: activity.pending, startsInCurrentWindow: activity.startedAt.filter((startedAt) => startedAt >= Date.now() - 60_000).length }])),
      outboundRequests: Object.fromEntries([...this.outboundActivity.entries()].map(([moduleId, activity]) => [moduleId, { pending: activity.pending, startsInCurrentWindow: activity.startedAt.filter((time) => time >= Date.now() - 60_000).length }])),
      providerEvents: Object.fromEntries([...this.providerEventStarts.entries()].map(([moduleId, starts]) => [moduleId, { startsInCurrentWindow: starts.filter((time) => time >= Date.now() - 60_000).length }])),
      viewerFoundation: { available: this.viewerFoundationProvider !== undefined, providerModuleId: this.viewerFoundationProvider?.grant.moduleId },
      viewerDeletionSubscribers: this.viewerDeletionListeners.size,
      communityAnalytics: { available: this.communityAnalyticsProvider !== undefined, providerModuleId: this.communityAnalyticsProvider?.grant.moduleId },
      limits: { maximumJsonBytes: MAXIMUM_JSON_BYTES, maximumRecordKeys: MAXIMUM_RECORD_KEYS, maximumArguments: MAXIMUM_ARGUMENTS, minimumDelayMs: MINIMUM_DELAY_MS, maximumDelayMs: MAXIMUM_DELAY_MS, maximumTimersPerModule: MAXIMUM_TIMERS_PER_MODULE, taskTimeoutMs: TASK_TIMEOUT_MS, maximumPendingActionsPerModule: MAXIMUM_PENDING_ACTIONS_PER_MODULE, maximumActionsPerMinute: MAXIMUM_ACTIONS_PER_MINUTE, maximumOutboundRequestsPerMinute: MAXIMUM_OUTBOUND_REQUESTS_PER_MINUTE, maximumProviderEventsPerMinute: MAXIMUM_PROVIDER_EVENTS_PER_MINUTE },
      modules: Object.fromEntries([...this.audits.entries()].map(([moduleId, audit]) => [moduleId, { ...audit }])),
    };
  }

  private async readState(grant: ActiveModuleCapabilityGrant): Promise<AddOnPrivateStateV2> {
    this.require(grant, 'state.private', 'state.read');
    const path = this.statePath(grant.moduleId);
    try {
      const information = await stat(path);
      if (!information.isFile() || information.size > MAXIMUM_JSON_BYTES) throw new Error('Private add-on state is not a regular bounded file.');
      const parsed = parseRecord(JSON.parse(await readFile(path, 'utf8')) as unknown, 'Private add-on state');
      this.record(grant.moduleId, 'state.read', 'granted');
      return Object.freeze(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') { this.record(grant.moduleId, 'state.read', 'granted'); return Object.freeze({}); }
      this.record(grant.moduleId, 'state.read', 'failed'); throw error;
    }
  }

  private async writeState(grant: ActiveModuleCapabilityGrant, value: AddOnPrivateStateV2): Promise<void> {
    this.require(grant, 'state.private', 'state.write');
    const parsed = parseRecord(value, 'Private add-on state');
    assertBoundedJson(parsed, 'Private add-on state');
    try { await writeJsonAtomic(this.statePath(grant.moduleId), parsed); this.record(grant.moduleId, 'state.write', 'granted'); }
    catch (error) { this.record(grant.moduleId, 'state.write', 'failed'); throw error; }
  }

  private async runAction(grant: ActiveModuleCapabilityGrant, actionId: string, argumentsValue: AddOnActionArgumentsV2): Promise<void> {
    this.require(grant, 'streamerbot.run-approved-action', 'streamerbot.run-approved-action');
    if (!ACTION_ID.test(actionId) || !grant.approvedActionIds.includes(actionId)) return this.deny(grant.moduleId, 'streamerbot.run-approved-action', 'streamerbot.run-approved-action', 'The requested Streamer.bot action ID is not creator-approved for this add-on.');
    if (isProtectedFrameworkActionId(actionId)) return this.deny(grant.moduleId, 'streamerbot.run-approved-action', 'streamerbot.run-approved-action', 'Add-ons cannot dispatch StreamBridge framework actions.');
    const parsed = parseRecord(argumentsValue, 'Streamer.bot action arguments');
    if (Object.keys(parsed).length > MAXIMUM_ARGUMENTS) throw new Error(`Streamer.bot action arguments may contain at most ${String(MAXIMUM_ARGUMENTS)} keys.`);
    assertBoundedJson(parsed, 'Streamer.bot action arguments');
    if (this.dependencies.runStreamerBotAction === undefined) return this.deny(grant.moduleId, 'streamerbot.run-approved-action', 'streamerbot.run-approved-action', 'Streamer.bot action dispatch is unavailable.');
    const activity = this.actionActivity.get(grant.moduleId) ?? { pending: 0, startedAt: [], controllers: new Set<AbortController>() };
    const cutoff = Date.now() - 60_000;
    while ((activity.startedAt[0] ?? Number.POSITIVE_INFINITY) < cutoff) activity.startedAt.shift();
    if (activity.pending >= MAXIMUM_PENDING_ACTIONS_PER_MODULE) return this.deny(grant.moduleId, 'streamerbot.run-approved-action', 'streamerbot.run-approved-action', `The add-on already has ${String(MAXIMUM_PENDING_ACTIONS_PER_MODULE)} pending Streamer.bot actions.`);
    if (activity.startedAt.length >= MAXIMUM_ACTIONS_PER_MINUTE) return this.deny(grant.moduleId, 'streamerbot.run-approved-action', 'streamerbot.run-approved-action', `The add-on exceeded ${String(MAXIMUM_ACTIONS_PER_MINUTE)} Streamer.bot actions per minute.`);
    const controller = new AbortController(); activity.pending += 1; activity.startedAt.push(Date.now()); activity.controllers.add(controller); this.actionActivity.set(grant.moduleId, activity);
    const relayToken = addOnRelayAuthorizer.issue(grant.moduleId);
    try { await this.dependencies.runStreamerBotAction(actionId, { ...parsed, thsvAddonRelayToken: relayToken }, controller.signal); this.record(grant.moduleId, 'streamerbot.run-approved-action', 'granted'); }
    catch (error) { this.record(grant.moduleId, 'streamerbot.run-approved-action', 'failed'); throw error; }
    finally { activity.pending -= 1; activity.controllers.delete(controller); }
  }

  private schedule(grant: ActiveModuleCapabilityGrant, delayMs: number, task: () => void | Promise<void>): string {
    this.require(grant, 'schedule.bounded', 'schedule.after');
    if (!Number.isInteger(delayMs) || delayMs < MINIMUM_DELAY_MS || delayMs > MAXIMUM_DELAY_MS) throw new Error(`Scheduled delays must be integer milliseconds from ${String(MINIMUM_DELAY_MS)} through ${String(MAXIMUM_DELAY_MS)}.`);
    if (typeof task !== 'function') throw new Error('Scheduled task must be a function.');
    const active = [...this.scheduled.values()].filter((entry) => entry.moduleId === grant.moduleId).length;
    if (active >= MAXIMUM_TIMERS_PER_MODULE) return this.deny(grant.moduleId, 'schedule.bounded', 'schedule.after', `The add-on already has the maximum ${String(MAXIMUM_TIMERS_PER_MODULE)} scheduled tasks.`);
    const taskId = randomUUID();
    const timer = setTimeout(() => {
      this.scheduled.delete(taskId);
      void this.runScheduledTask(grant, taskId, task);
    }, delayMs);
    this.scheduled.set(taskId, { moduleId: grant.moduleId, timer });
    this.record(grant.moduleId, 'schedule.after', 'granted');
    return taskId;
  }

  private cancel(grant: ActiveModuleCapabilityGrant, taskId: string): boolean {
    this.require(grant, 'schedule.bounded', 'schedule.cancel');
    const moduleId = grant.moduleId;
    const entry = this.scheduled.get(taskId);
    if (entry === undefined || entry.moduleId !== moduleId) return false;
    clearTimeout(entry.timer); this.scheduled.delete(taskId); this.record(moduleId, 'schedule.cancel', 'granted'); return true;
  }

  private async runScheduledTask(grant: ActiveModuleCapabilityGrant, taskId: string, task: () => void | Promise<void>): Promise<void> {
    const moduleId = grant.moduleId;
    if (!this.isActive(grant)) return;
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        Promise.resolve().then(task),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`Scheduled add-on task ${taskId} exceeded ${String(TASK_TIMEOUT_MS)} ms.`)), TASK_TIMEOUT_MS); }),
      ]);
      this.record(moduleId, 'schedule.fire', 'granted');
    } catch (error) {
      this.record(moduleId, 'schedule.fire', 'failed');
      this.logger.error('Scheduled add-on task failed', { moduleId, taskId, error });
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }

  private async publishOverlay(grant: ActiveModuleCapabilityGrant, topic: string, payload: Readonly<Record<string, unknown>>): Promise<void> {
    this.require(grant, 'overlay.publish', 'overlay.publish');
    const suffix = topic.startsWith(`${grant.moduleId}.`) ? topic.slice(grant.moduleId.length + 1) : '';
    if (!OVERLAY_TOPIC_SUFFIX.test(suffix)) throw new Error(`Overlay topic must begin with ${grant.moduleId}. and use dotted identifiers.`);
    const parsed = parseRecord(payload, 'Overlay payload'); assertBoundedJson(parsed, 'Overlay payload');
    if (this.dependencies.publishOverlay === undefined) return this.deny(grant.moduleId, 'overlay.publish', 'overlay.publish', 'The hosted add-on overlay contract is not available yet.');
    try { await this.dependencies.publishOverlay(grant.moduleId, topic, parsed); this.record(grant.moduleId, 'overlay.publish', 'granted'); }
    catch (error) { this.record(grant.moduleId, 'overlay.publish', 'failed'); throw error; }
  }

  private subscribeOverlayLifecycle(grant: ActiveModuleCapabilityGrant, listener: (event: AddOnOverlayLifecycleV2) => void): () => void {
    this.require(grant, 'overlay.publish', 'overlay.lifecycle.subscribe');
    if (typeof listener !== 'function') throw new Error('Overlay lifecycle listener must be a function.');
    if (this.dependencies.subscribeOverlayLifecycle === undefined) return this.deny(grant.moduleId, 'overlay.publish', 'overlay.lifecycle.subscribe', 'Overlay lifecycle reports are unavailable.');
    const unsubscribeDependency = this.dependencies.subscribeOverlayLifecycle(grant.moduleId, listener);
    const subscriptions = this.overlaySubscriptions.get(grant.moduleId) ?? new Set<() => void>();
    let active = true;
    const unsubscribe = (): void => { if (!active) return; active = false; unsubscribeDependency(); subscriptions.delete(unsubscribe); };
    subscriptions.add(unsubscribe); this.overlaySubscriptions.set(grant.moduleId, subscriptions); this.record(grant.moduleId, 'overlay.lifecycle.subscribe', 'granted');
    return unsubscribe;
  }

  private async sendChat(grant: ActiveModuleCapabilityGrant, request: AddOnOutboundMessageRequestV2): Promise<readonly AddOnOutboundMessageDeliveryV2[]> {
    this.require(grant, 'chat.send', 'chat.send');
    if (this.dependencies.routeOutboundMessage === undefined) return this.deny(grant.moduleId, 'chat.send', 'chat.send', 'Outbound chat routing is unavailable.');
    const activity = this.outboundActivity.get(grant.moduleId) ?? { pending: 0, startedAt: [], controllers: new Set<AbortController>() };
    const cutoff = Date.now() - 60_000;
    while ((activity.startedAt[0] ?? Number.POSITIVE_INFINITY) < cutoff) activity.startedAt.shift();
    if (activity.pending >= MAXIMUM_PENDING_ACTIONS_PER_MODULE) return this.deny(grant.moduleId, 'chat.send', 'chat.send', `The add-on already has ${String(MAXIMUM_PENDING_ACTIONS_PER_MODULE)} pending outbound message requests.`);
    if (activity.startedAt.length >= MAXIMUM_OUTBOUND_REQUESTS_PER_MINUTE) return this.deny(grant.moduleId, 'chat.send', 'chat.send', `The add-on exceeded ${String(MAXIMUM_OUTBOUND_REQUESTS_PER_MINUTE)} outbound message requests per minute.`);
    const controller = new AbortController(); activity.pending += 1; activity.startedAt.push(Date.now()); activity.controllers.add(controller); this.outboundActivity.set(grant.moduleId, activity);
    try { const result = await this.dependencies.routeOutboundMessage(request, controller.signal); this.record(grant.moduleId, 'chat.send', 'granted'); return result; }
    catch (error) { this.record(grant.moduleId, 'chat.send', 'failed'); throw error; }
    finally { activity.pending -= 1; activity.controllers.delete(controller); }
  }

  private async publishProviderDonation(grant: ActiveModuleCapabilityGrant, request: AddOnProviderDonationRequestV2): Promise<void> {
    this.require(grant, 'provider.events.publish', 'provider.events.publishDonation');
    const platform = PROVIDER_MODULES[grant.moduleId];
    if (platform === undefined) return this.deny(grant.moduleId, 'provider.events.publish', 'provider.events.publishDonation', 'This add-on is not assigned a provider event namespace.');
    if (this.dependencies.publishProviderEvent === undefined) return this.deny(grant.moduleId, 'provider.events.publish', 'provider.events.publishDonation', 'Provider event ingestion is unavailable.');
    const parsed = providerDonationSchema.parse(request);
    const starts = this.providerEventStarts.get(grant.moduleId) ?? [];
    const cutoff = Date.now() - 60_000;
    while ((starts[0] ?? Number.POSITIVE_INFINITY) < cutoff) starts.shift();
    if (starts.length >= MAXIMUM_PROVIDER_EVENTS_PER_MINUTE) return this.deny(grant.moduleId, 'provider.events.publish', 'provider.events.publishDonation', `The provider exceeded ${String(MAXIMUM_PROVIDER_EVENTS_PER_MINUTE)} accepted events per minute.`);
    starts.push(Date.now()); this.providerEventStarts.set(grant.moduleId, starts);
    const sourceIdHash = createHash('sha256').update(`${platform}:${parsed.sourceEventId}`).digest('hex');
    const message = parsed.message?.replace(/[\p{Cc}\s]+/gu, ' ').trim();
    const event: NormalizedEvent = {
      schemaVersion: '1.0.0',
      eventId: `addon-provider-${platform}-${sourceIdHash}`,
      eventType: 'engagement.donation',
      platform,
      source: { adapter: `addon-provider-${platform}`, eventId: parsed.sourceEventId, eventName: parsed.sourceEventType },
      receivedAt: parsed.receivedAt,
      channel: { name: parsed.channelName },
      user: { name: parsed.supporterName, displayName: parsed.supporterName, actorType: 'human', roles: [] },
      payload: { amount: parsed.amount, currency: parsed.currency, ...(message === undefined || message === '' ? {} : { message }) },
      metadata: { simulated: parsed.simulated },
    };
    try { await this.dependencies.publishProviderEvent(event); this.record(grant.moduleId, 'provider.events.publishDonation', 'granted'); }
    catch (error) { this.record(grant.moduleId, 'provider.events.publishDonation', 'failed'); throw error; }
  }

  private provideViewerFoundation(grant: ActiveModuleCapabilityGrant, provider: ViewerFoundationProviderV1): () => void {
    this.require(grant, 'viewer.foundation.provide', 'viewer.foundation.provide');
    if (grant.moduleId !== VIEWER_FOUNDATION_MODULE_ID) return this.deny(grant.moduleId, 'viewer.foundation.provide', 'viewer.foundation.provide', 'Only thsv.viewer-foundation may provide the Viewer Foundation service.');
    if (typeof provider !== 'object' || typeof provider.getProjection !== 'function' || typeof provider.mutate !== 'function' || typeof provider.administer !== 'function') throw new Error('Viewer Foundation provider must implement getProjection, mutate, and administer.');
    if (this.viewerFoundationProvider !== undefined) throw new Error('Viewer Foundation already has an active provider.');
    const entry = { grant, provider: Object.freeze(provider) };
    this.viewerFoundationProvider = entry; this.record(grant.moduleId, 'viewer.foundation.provide', 'granted');
    return () => { if (this.viewerFoundationProvider === entry) this.viewerFoundationProvider = undefined; };
  }

  private async getViewerProjection(grant: ActiveModuleCapabilityGrant, query: ViewerFoundationProjectionQueryV1): Promise<ViewerFoundationProjectionV1 | undefined> {
    this.requireViewerConsumer(grant, 'viewer.foundation.read', 'viewer.foundation.getProjection');
    const parsedValue = viewerProjectionQuerySchema.parse(query);
    const parsed: ViewerFoundationProjectionQueryV1 = parsedValue.viewerId === undefined
      ? { platform: parsedValue.platform as 'twitch' | 'youtube' | 'kick' | 'tiktok', userId: parsedValue.userId as string }
      : { viewerId: parsedValue.viewerId };
    const provider = this.activeViewerProvider(grant);
    try {
      const result = await withTimeout(provider.getProjection(parsed), VIEWER_PROVIDER_TIMEOUT_MS, 'Viewer Foundation projection');
      this.record(grant.moduleId, 'viewer.foundation.getProjection', 'granted');
      return result === undefined ? undefined : parsedViewerProjection(result);
    } catch (error) { this.record(grant.moduleId, 'viewer.foundation.getProjection', 'failed'); throw error; }
  }

  private async mutateViewerFoundation(grant: ActiveModuleCapabilityGrant, request: ViewerFoundationMutationRequestV1): Promise<ViewerFoundationMutationResultV1> {
    this.requireViewerConsumer(grant, 'viewer.foundation.mutate', 'viewer.foundation.mutate');
    const parsed = viewerMutationSchema.parse(request);
    const provider = this.activeViewerProvider(grant);
    try {
      const result = await withTimeout(provider.mutate({ ...parsed, callerModuleId: grant.moduleId }), VIEWER_PROVIDER_TIMEOUT_MS, 'Viewer Foundation mutation');
      this.record(grant.moduleId, 'viewer.foundation.mutate', 'granted');
      return parsedViewerMutation(result);
    } catch (error) { this.record(grant.moduleId, 'viewer.foundation.mutate', 'failed'); throw error; }
  }

  private subscribeViewerDeleted(grant: ActiveModuleCapabilityGrant, listener: (viewerId: string) => void | Promise<void>): () => void {
    this.requireViewerConsumer(grant, 'viewer.foundation.read', 'viewer.foundation.onDeleted');
    if (typeof listener !== 'function') throw new Error('Viewer deletion listener must be a function.');
    const entry: ViewerDeletionListener = { grant, listener };
    const listeners = this.viewerDeletionListeners.get(grant.moduleId) ?? new Set<ViewerDeletionListener>();
    listeners.add(entry); this.viewerDeletionListeners.set(grant.moduleId, listeners);
    let active = true;
    const unsubscribe = (): void => {
      if (!active) return; active = false; listeners.delete(entry);
      if (listeners.size === 0) this.viewerDeletionListeners.delete(grant.moduleId);
    };
    this.record(grant.moduleId, 'viewer.foundation.onDeleted', 'granted');
    return unsubscribe;
  }

  private async notifyViewerDeleted(grant: ActiveModuleCapabilityGrant, viewerId: string): Promise<void> {
    this.require(grant, 'viewer.foundation.provide', 'viewer.foundation.notifyDeleted');
    if (grant.moduleId !== VIEWER_FOUNDATION_MODULE_ID) return this.deny(grant.moduleId, 'viewer.foundation.provide', 'viewer.foundation.notifyDeleted', 'Only thsv.viewer-foundation may publish viewer deletion notices.');
    const parsedViewerId = viewerIdSchema.parse(viewerId);
    for (const listeners of this.viewerDeletionListeners.values()) {
      for (const entry of [...listeners]) {
        if (!this.isActive(entry.grant)) continue;
        try {
          await withTimeout(Promise.resolve(entry.listener(parsedViewerId)), VIEWER_PROVIDER_TIMEOUT_MS, `Viewer deletion cleanup for ${entry.grant.moduleId}`);
          this.record(entry.grant.moduleId, 'viewer.foundation.deleteCleanup', 'granted');
        } catch (error) {
          this.record(entry.grant.moduleId, 'viewer.foundation.deleteCleanup', 'failed');
          this.logger.error('Viewer deletion cleanup failed in a dependent add-on', { moduleId: entry.grant.moduleId, error });
        }
      }
    }
    this.record(grant.moduleId, 'viewer.foundation.notifyDeleted', 'granted');
  }

  /** Authenticated core/wizard entry point. Add-on contexts intentionally receive no reference to it. */
  public async administerViewerFoundation(request: ViewerFoundationAdminRequestV1): Promise<ViewerFoundationAdminResultV1> {
    const parsed = viewerAdminSchema.parse(request) as ViewerFoundationAdminRequestV1;
    const entry = this.viewerFoundationProvider;
    if (entry === undefined || !this.isActive(entry.grant)) throw new Error('Viewer Foundation is unavailable. Enable it and restart StreamBridge.');
    const result = await withTimeout(entry.provider.administer(parsed), VIEWER_PROVIDER_TIMEOUT_MS, 'Viewer Foundation administration');
    const validated = jsonRecordSchema.parse(result);
    if (Buffer.byteLength(JSON.stringify(validated), 'utf8') > MAXIMUM_JSON_BYTES) throw new Error('Viewer Foundation administration result exceeded the safe response size.');
    this.record(VIEWER_FOUNDATION_MODULE_ID, `viewer.foundation.admin.${parsed.operation}`, 'granted');
    return Object.freeze(validated);
  }

  private requireViewerConsumer(grant: ActiveModuleCapabilityGrant, permission: 'viewer.foundation.read' | 'viewer.foundation.mutate', operation: string): void {
    this.require(grant, permission, operation);
    if (!grant.dependencies.includes(VIEWER_FOUNDATION_MODULE_ID)) this.deny(grant.moduleId, permission, operation, 'Viewer Foundation consumers must declare thsv.viewer-foundation as a module dependency.');
  }

  private activeViewerProvider(grant: ActiveModuleCapabilityGrant): ViewerFoundationProviderV1 {
    const entry = this.viewerFoundationProvider;
    if (entry === undefined || !this.isActive(entry.grant)) return this.deny(grant.moduleId, 'viewer.foundation.read', 'viewer.foundation.provider', 'Viewer Foundation is unavailable.');
    return entry.provider;
  }

  private provideCommunityAnalytics(grant: ActiveModuleCapabilityGrant, provider: CommunityAnalyticsProviderV1): () => void {
    this.require(grant, 'community.analytics.provide', 'community.analytics.provide');
    if (grant.moduleId !== COMMUNITY_ANALYTICS_MODULE_ID) return this.deny(grant.moduleId, 'community.analytics.provide', 'community.analytics.provide', 'Only thsv.community-analytics may provide the Community Analytics service.');
    if (typeof provider !== 'object' || typeof provider.getViewerProjection !== 'function' || typeof provider.getSessionProjection !== 'function') throw new Error('Community Analytics provider must implement viewer and session projections.');
    if (this.communityAnalyticsProvider !== undefined) throw new Error('Community Analytics already has an active provider.');
    const entry = { grant, provider: Object.freeze(provider) };
    this.communityAnalyticsProvider = entry; this.record(grant.moduleId, 'community.analytics.provide', 'granted');
    return () => { if (this.communityAnalyticsProvider === entry) this.communityAnalyticsProvider = undefined; };
  }

  private async getCommunityAnalyticsViewerProjection(grant: ActiveModuleCapabilityGrant, viewerId: string): Promise<CommunityAnalyticsViewerProjectionV1> {
    this.requireAnalyticsConsumer(grant, 'community.analytics.getViewerProjection'); const parsedViewerId = viewerIdSchema.parse(viewerId); const provider = this.activeAnalyticsProvider(grant);
    try { const result = await withTimeout(provider.getViewerProjection(parsedViewerId), VIEWER_PROVIDER_TIMEOUT_MS, 'Community Analytics viewer projection'); this.record(grant.moduleId, 'community.analytics.getViewerProjection', 'granted'); return Object.freeze(analyticsViewerProjectionSchema.parse(result)) as CommunityAnalyticsViewerProjectionV1; }
    catch (error) { this.record(grant.moduleId, 'community.analytics.getViewerProjection', 'failed'); throw error; }
  }

  private async getCommunityAnalyticsSessionProjection(grant: ActiveModuleCapabilityGrant): Promise<CommunityAnalyticsSessionProjectionV1> {
    this.requireAnalyticsConsumer(grant, 'community.analytics.getSessionProjection'); const provider = this.activeAnalyticsProvider(grant);
    try { const result = await withTimeout(provider.getSessionProjection(), VIEWER_PROVIDER_TIMEOUT_MS, 'Community Analytics session projection'); this.record(grant.moduleId, 'community.analytics.getSessionProjection', 'granted'); return Object.freeze(analyticsSessionProjectionSchema.parse(result)) as CommunityAnalyticsSessionProjectionV1; }
    catch (error) { this.record(grant.moduleId, 'community.analytics.getSessionProjection', 'failed'); throw error; }
  }

  private requireAnalyticsConsumer(grant: ActiveModuleCapabilityGrant, operation: string): void {
    this.require(grant, 'community.analytics.read', operation);
    if (!grant.dependencies.includes(COMMUNITY_ANALYTICS_MODULE_ID)) this.deny(grant.moduleId, 'community.analytics.read', operation, 'Community Analytics consumers must declare thsv.community-analytics as a module dependency.');
  }

  private activeAnalyticsProvider(grant: ActiveModuleCapabilityGrant): CommunityAnalyticsProviderV1 {
    const entry = this.communityAnalyticsProvider;
    if (entry === undefined || !this.isActive(entry.grant)) return this.deny(grant.moduleId, 'community.analytics.read', 'community.analytics.provider', 'Community Analytics is unavailable.');
    return entry.provider;
  }

  private statePath(moduleId: string): string {
    const root = resolve(this.stateRoot); const path = resolve(root, moduleId, 'runtime-state.json');
    if (!path.startsWith(root.replace(/[\\/]+$/u, '') + sep)) throw new Error('Add-on state path escaped its private root.');
    return path;
  }

  private require(grant: ActiveModuleCapabilityGrant, permission: AddOnPermissionV2, operation: string): void {
    if (!this.isActive(grant)) this.deny(grant.moduleId, permission, operation, `Add-on ${grant.moduleId} is no longer running.`);
    if (!grant.permissions.includes(permission)) this.deny(grant.moduleId, permission, operation, `Add-on ${grant.moduleId} was not granted ${permission}.`);
  }

  private isActive(grant: ActiveModuleCapabilityGrant): boolean { return this.generations.get(grant.moduleId) === grant.generation; }

  private deny(moduleId: string, permission: AddOnPermissionV2, operation: string, message: string): never {
    this.record(moduleId, operation, 'denied'); this.logger.warn('Add-on capability denied', { moduleId, permission, operation });
    throw new CapabilityDeniedError(moduleId, permission, message);
  }

  private record(moduleId: string, operation: string, result: 'granted' | 'denied' | 'failed'): void {
    const audit = this.audits.get(moduleId) ?? { granted: 0, denied: 0, failed: 0 };
    audit[result] += 1; audit.lastOperation = operation; audit.lastResult = result; audit.lastAt = new Date().toISOString(); this.audits.set(moduleId, audit);
  }
}

async function withTimeout<T>(pending: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try { return await Promise.race([pending, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${String(timeoutMs)} ms.`)), timeoutMs); })]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

function validateGrant(value: ModuleCapabilityGrant): ModuleCapabilityGrant {
  if (!MODULE_ID.test(value.moduleId)) throw new Error('Invalid add-on module ID for capability grant.');
  const permissions = z.array(addOnPermissionV2Schema).max(20).parse(value.permissions);
  if (new Set(permissions).size !== permissions.length) throw new Error('Capability permissions must be unique.');
  const approvedActionIds = z.array(z.string().regex(ACTION_ID)).max(50).parse(value.approvedActionIds);
  if (new Set(approvedActionIds).size !== approvedActionIds.length) throw new Error('Approved Streamer.bot action IDs must be unique.');
  if (approvedActionIds.some(isProtectedFrameworkActionId)) throw new Error('StreamBridge framework actions cannot be granted to an add-on.');
  return Object.freeze({ moduleId: value.moduleId, permissions: Object.freeze([...permissions]), approvedActionIds: Object.freeze([...approvedActionIds]) });
}

function parseRecord(value: unknown, label: string): Record<string, z.infer<typeof jsonValueV2Schema>> {
  const result = jsonRecordSchema.safeParse(value);
  if (!result.success) throw new Error(`${label} must be a JSON object containing bounded JSON values.`);
  if (Object.keys(result.data).length > MAXIMUM_RECORD_KEYS) throw new Error(`${label} may contain at most ${String(MAXIMUM_RECORD_KEYS)} keys.`);
  return result.data;
}

function assertBoundedJson(value: unknown, label: string): void {
  const bytes = Buffer.byteLength(JSON.stringify(value));
  if (bytes > MAXIMUM_JSON_BYTES) throw new Error(`${label} exceeds ${String(MAXIMUM_JSON_BYTES)} bytes.`);
}
