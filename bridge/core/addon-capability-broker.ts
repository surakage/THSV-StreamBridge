import { createHash, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { z } from 'zod';
import { jsonValueV2Schema } from '../contracts/v2/common.js';
import { addOnPermissionV2Schema, type AddOnPermissionV2 } from '../contracts/v2/addon-package.js';
import { isProtectedFrameworkActionId, type AddOnActionArgumentsV2, type AddOnCoordinationGrantV2, type AddOnCoordinationRequestV2, type AddOnCoordinationSnapshotV2, type AddOnCoordinationTicketV2, type AddOnMediaSlotLeaseV2, type AddOnMediaSlotRequestV2, type AddOnMediaSlotStateV2, type AddOnOutboundMessageDeliveryV2, type AddOnOutboundMessageRequestV2, type AddOnOverlayLifecycleV2, type AddOnOverlayPublishOptionsV2, type AddOnPrivateStateV2, type AddOnProviderDonationRequestV2, type AddOnScheduledTaskV2, type CommunityAnalyticsProviderV1, type CommunityAnalyticsSessionProjectionV1, type CommunityAnalyticsViewerProjectionV1, type ModuleRuntimeContextV2, type ViewerFoundationAdminRequestV1, type ViewerFoundationAdminResultV1, type ViewerFoundationMutationRequestV1, type ViewerFoundationMutationResultV1, type ViewerFoundationProjectionQueryV1, type ViewerFoundationProjectionV1, type ViewerFoundationProviderV1 } from '../contracts/v2/addon-capability.js';
import type { ClipMediaCacheRequest, ClipMediaCacheResult } from '../services/clip-media-cache.js';
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
const MINIMUM_MEDIA_LEASE_MS = 1_000;
const MAXIMUM_MEDIA_LEASE_MS = 600_000;
const MAXIMUM_MEDIA_PRIORITY = 100;
const MEDIA_LISTENER_TIMEOUT_MS = 2_000;
const COORDINATION_RESOURCE = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){0,3}$/u;
const MAXIMUM_COORDINATION_TIMEOUT_MS = 600_000;
const MAXIMUM_COORDINATION_COOLDOWN_MS = 86_400_000;
const MAXIMUM_COORDINATION_QUEUE = 100;
const COORDINATION_LISTENER_TIMEOUT_MS = 2_000;
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
const mediaSlotRequestSchema = z.object({ durationMs: z.number().int().min(MINIMUM_MEDIA_LEASE_MS).max(MAXIMUM_MEDIA_LEASE_MS), priority: z.number().int().min(0).max(MAXIMUM_MEDIA_PRIORITY) }).strict();
const coordinationRequestSchema = z.object({
  resource: z.string().regex(COORDINATION_RESOURCE),
  mode: z.enum(['exclusive', 'queueable', 'independent', 'background']),
  priority: z.number().int().min(0).max(100).default(50),
  timeoutMs: z.number().int().min(1_000).max(MAXIMUM_COORDINATION_TIMEOUT_MS).default(60_000),
  cooldownMs: z.number().int().min(0).max(MAXIMUM_COORDINATION_COOLDOWN_MS).default(0),
  skippable: z.boolean().default(false),
}).strict();
const overlayPublishOptionsSchema = z.object({ lane: z.enum(['foreground', 'media', 'timer', 'persistent', 'preview', 'independent']) }).strict();
const mediaCacheRequestSchema = z.object({ sourceUrl: z.url(), cacheKey: z.string().trim().min(1).max(200), ttlSeconds: z.number().int().min(60).max(86_400), maximumBytes: z.number().int().min(1_048_576).max(52_428_800) }).strict();
const TRUSTED_TWITCH_CLIP_ASSET = /^clips-media-assets\d*\.twitch\.tv$/u;
const TRUSTED_TWITCH_CLIP_CLOUDFRONT = /^d1ndex63qxojbr\.cloudfront\.net$/u;
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
const viewerProjectionSchema = z.object({ contractVersion: z.literal('1.0.0'), viewerId: viewerIdSchema, linked: z.boolean(), currencyName: z.string().min(1).max(40).optional(), points: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), level: z.number().int().positive().max(1_000_000), nextLevelAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), achievements: z.array(achievementSchema).max(20).optional(), latestAchievement: achievementSchema.optional() }).strict();
const viewerMutationSchema = z.object({ viewerId: viewerIdSchema, operation: z.enum(['add', 'spend', 'refund']), amount: z.number().int().min(1).max(1_000_000), reason: z.string().trim().min(1).max(200), idempotencyKey: z.string().trim().min(1).max(128) }).strict();
const viewerMutationResultSchema = viewerProjectionSchema.extend({ operation: z.enum(['add', 'spend', 'refund']), amount: z.number().int().min(1).max(1_000_000), previousPoints: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), duplicate: z.boolean() }).strict();
function parsedViewerProjection(value: unknown): ViewerFoundationProjectionV1 {
  const parsed = viewerProjectionSchema.parse(value);
  return Object.freeze({ contractVersion: parsed.contractVersion, viewerId: parsed.viewerId, linked: parsed.linked, ...(parsed.currencyName === undefined ? {} : { currencyName: parsed.currencyName }), points: parsed.points, level: parsed.level, nextLevelAt: parsed.nextLevelAt, ...(parsed.achievements === undefined ? {} : { achievements: Object.freeze(parsed.achievements.map((item) => Object.freeze(item))) }), ...(parsed.latestAchievement === undefined ? {} : { latestAchievement: Object.freeze(parsed.latestAchievement) }) });
}
function parsedViewerMutation(value: unknown): ViewerFoundationMutationResultV1 {
  const parsed = viewerMutationResultSchema.parse(value); const projection = parsedViewerProjection({ contractVersion: parsed.contractVersion, viewerId: parsed.viewerId, linked: parsed.linked, ...(parsed.currencyName === undefined ? {} : { currencyName: parsed.currencyName }), points: parsed.points, level: parsed.level, nextLevelAt: parsed.nextLevelAt, ...(parsed.achievements === undefined ? {} : { achievements: parsed.achievements }), ...(parsed.latestAchievement === undefined ? {} : { latestAchievement: parsed.latestAchievement }) });
  return Object.freeze({ ...projection, operation: parsed.operation, amount: parsed.amount, previousPoints: parsed.previousPoints, duplicate: parsed.duplicate });
}
const viewerAdminSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('status') }).strict(),
  z.object({ operation: z.literal('search'), viewerId: viewerIdSchema.optional(), platform: z.enum(['twitch', 'youtube', 'kick', 'tiktok']).optional(), userId: z.string().trim().min(1).max(256).optional() }).strict()
    .superRefine((value, context) => {
      const byViewer = value.viewerId !== undefined;
      const byAccount = value.platform !== undefined && value.userId !== undefined;
      if (byViewer === byAccount || ((value.platform === undefined) !== (value.userId === undefined))) context.addIssue({ code: 'custom', message: 'Search by exactly one Viewer Foundation ID or one platform/stable-user-ID pair.' });
    }),
  z.object({ operation: z.literal('export'), viewerId: viewerIdSchema }).strict(),
  z.object({ operation: z.literal('delete'), viewerId: viewerIdSchema, approvedByCreator: z.literal(true) }).strict(),
  z.object({ operation: z.literal('correct'), viewerId: viewerIdSchema, adjustment: z.enum(['add', 'remove', 'reset']), amount: z.number().int().min(1).max(1_000_000).optional(), reason: z.string().trim().min(3).max(200), approvedByCreator: z.literal(true) }).strict()
    .superRefine((value, context) => {
      if (value.adjustment !== 'reset' && value.amount === undefined) context.addIssue({ code: 'custom', message: 'Add and remove corrections require an amount.' });
      if (value.adjustment === 'reset' && value.amount !== undefined) context.addIssue({ code: 'custom', message: 'Reset corrections must not include an amount.' });
    }),
  z.object({ operation: z.literal('undo-correction'), auditId: z.string().regex(/^[a-f0-9]{32}$/u), reason: z.string().trim().min(3).max(200), approvedByCreator: z.literal(true) }).strict(),
  z.object({ operation: z.literal('audit'), limit: z.number().int().min(1).max(100).optional() }).strict(),
  z.object({ operation: z.literal('link-audit'), linkAction: z.enum(['add', 'remove']), viewerId: viewerIdSchema, platform: z.enum(['twitch', 'youtube', 'kick', 'tiktok']), userId: z.string().trim().min(1).max(256), reason: z.string().trim().min(3).max(200), approvedByCreator: z.literal(true) }).strict(),
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
  readonly publishOverlay?: (moduleId: string, topic: string, payload: Readonly<Record<string, unknown>>, options?: AddOnOverlayPublishOptionsV2) => Promise<void>;
  readonly subscribeOverlayLifecycle?: (moduleId: string, listener: (event: AddOnOverlayLifecycleV2) => void) => () => void;
  readonly routeOutboundMessage?: (request: AddOnOutboundMessageRequestV2, signal: AbortSignal) => Promise<readonly AddOnOutboundMessageDeliveryV2[]>;
  readonly publishProviderEvent?: (event: NormalizedEvent) => Promise<void>;
  readonly cacheClipMedia?: (moduleId: string, request: ClipMediaCacheRequest, signal: AbortSignal) => Promise<ClipMediaCacheResult>;
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
interface MediaSlotListener { readonly grant: ActiveModuleCapabilityGrant; readonly listener: (state: AddOnMediaSlotStateV2) => void | Promise<void> }
interface MediaSlotLease { readonly grant: ActiveModuleCapabilityGrant; readonly leaseId: string; readonly priority: number; readonly expiresAt: number; readonly timer: NodeJS.Timeout }
interface CoordinationEntry {
  readonly grant: ActiveModuleCapabilityGrant;
  readonly requestId: string;
  readonly request: z.infer<typeof coordinationRequestSchema>;
  readonly queuedAt: number;
  readonly resolve: (grant: AddOnCoordinationGrantV2) => void;
  readonly reject: (error: Error) => void;
  queueTimer?: NodeJS.Timeout;
}
interface CoordinationLease {
  readonly entry: CoordinationEntry;
  readonly leaseId: string;
  readonly startedAt: number;
  readonly expiresAt: number;
  readonly timer: NodeJS.Timeout;
}
interface CoordinationListener { readonly grant: ActiveModuleCapabilityGrant; readonly listener: (snapshot: AddOnCoordinationSnapshotV2) => void | Promise<void> }

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
  private mediaSlotLease: MediaSlotLease | undefined;
  private readonly mediaSlotListeners = new Map<string, Set<MediaSlotListener>>();
  private readonly coordinationQueues = new Map<string, CoordinationEntry[]>();
  private readonly coordinationLeases = new Map<string, CoordinationLease>();
  private readonly coordinationListeners = new Map<string, Set<CoordinationListener>>();
  private readonly coordinationCooldowns = new Map<string, number>();

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
        publish: (topic: string, payload: Readonly<Record<string, z.infer<typeof jsonValueV2Schema>>>, options?: AddOnOverlayPublishOptionsV2) => this.publishOverlay(grant, topic, payload, options),
        onLifecycle: (listener: (event: AddOnOverlayLifecycleV2) => void) => this.subscribeOverlayLifecycle(grant, listener),
      }),
      mediaSlot: Object.freeze({
        current: () => this.currentMediaSlot(grant),
        acquire: (request: AddOnMediaSlotRequestV2) => this.acquireMediaSlot(grant, request),
        release: (leaseId: string) => this.releaseMediaSlot(grant, leaseId),
        onChange: (listener: (state: AddOnMediaSlotStateV2) => void | Promise<void>) => this.subscribeMediaSlot(grant, listener),
      }),
      mediaCache: Object.freeze({ fetch: (request: ClipMediaCacheRequest) => this.cacheMedia(grant, request) }),
      coordination: Object.freeze({
        request: (request: AddOnCoordinationRequestV2) => this.requestCoordination(grant, request),
        release: (leaseId: string) => this.releaseCoordination(grant, leaseId, 'completed'),
        cancel: (requestId: string) => this.cancelCoordination(grant, requestId),
        current: (resource: string) => this.currentCoordination(grant, resource),
        onChange: (listener: (snapshot: AddOnCoordinationSnapshotV2) => void | Promise<void>) => this.subscribeCoordination(grant, listener),
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
    this.mediaSlotListeners.delete(moduleId);
    if (this.mediaSlotLease?.grant.moduleId === moduleId) {
      clearTimeout(this.mediaSlotLease.timer); this.mediaSlotLease = undefined;
      void this.notifyMediaSlotChanged();
    }
    this.cleanupCoordination(moduleId);
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
      mediaSlot: this.mediaSlotSnapshot(),
      coordination: Object.fromEntries([...new Set([...this.coordinationQueues.keys(), ...[...this.coordinationLeases.values()].map((lease) => lease.entry.request.resource)])].map((resource) => [resource, this.coordinationSnapshot(resource)])),
      limits: { maximumJsonBytes: MAXIMUM_JSON_BYTES, maximumRecordKeys: MAXIMUM_RECORD_KEYS, maximumArguments: MAXIMUM_ARGUMENTS, minimumDelayMs: MINIMUM_DELAY_MS, maximumDelayMs: MAXIMUM_DELAY_MS, maximumTimersPerModule: MAXIMUM_TIMERS_PER_MODULE, taskTimeoutMs: TASK_TIMEOUT_MS, maximumPendingActionsPerModule: MAXIMUM_PENDING_ACTIONS_PER_MODULE, maximumActionsPerMinute: MAXIMUM_ACTIONS_PER_MINUTE, maximumOutboundRequestsPerMinute: MAXIMUM_OUTBOUND_REQUESTS_PER_MINUTE, maximumProviderEventsPerMinute: MAXIMUM_PROVIDER_EVENTS_PER_MINUTE },
      modules: Object.fromEntries([...this.audits.entries()].map(([moduleId, audit]) => [moduleId, { ...audit }])),
    };
  }

  /** Host-only emergency recovery. This is never exposed to add-on code. */
  public resetCoordination(resource?: string): Readonly<Record<string, unknown>> {
    if (resource !== undefined && !COORDINATION_RESOURCE.test(resource)) throw new Error('Invalid coordination resource.');
    const resources = resource === undefined
      ? new Set([...this.coordinationQueues.keys(), ...[...this.coordinationLeases.values()].map((lease) => lease.entry.request.resource)])
      : new Set([resource]);
    let cancelledQueued = 0; let cancelledActive = 0;
    for (const currentResource of resources) {
      const queue = this.coordinationQueues.get(currentResource) ?? [];
      this.coordinationQueues.delete(currentResource);
      for (const entry of queue) {
        if (entry.queueTimer !== undefined) clearTimeout(entry.queueTimer);
        entry.reject(new Error(`Coordination resource ${currentResource} was reset by the creator.`));
        cancelledQueued += 1;
      }
      for (const lease of [...this.coordinationLeases.values()]) {
        if (lease.entry.request.resource !== currentResource) continue;
        clearTimeout(lease.timer); this.coordinationLeases.delete(lease.leaseId); cancelledActive += 1;
      }
      void this.notifyCoordinationChanged(currentResource);
    }
    for (const key of [...this.coordinationCooldowns.keys()]) {
      if (resource === undefined || key.endsWith(`:${resource}`)) this.coordinationCooldowns.delete(key);
    }
    const mediaSlotCleared = this.mediaSlotLease !== undefined;
    if (this.mediaSlotLease !== undefined) { clearTimeout(this.mediaSlotLease.timer); this.mediaSlotLease = undefined; void this.notifyMediaSlotChanged(); }
    this.logger.warn('Add-on coordination reset by creator', { resource: resource ?? 'all', cancelledQueued, cancelledActive, mediaSlotCleared });
    return Object.freeze({ reset: true, resource: resource ?? 'all', cancelledQueued, cancelledActive, mediaSlotCleared });
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

  private async cacheMedia(grant: ActiveModuleCapabilityGrant, request: ClipMediaCacheRequest): Promise<ClipMediaCacheResult> {
    this.require(grant, 'media.cache', 'media.cache.fetch');
    const parsed = mediaCacheRequestSchema.parse(request);
    const host = new URL(parsed.sourceUrl).hostname.toLowerCase();
    if (!(host === 'twitchcdn.net' || host.endsWith('.twitchcdn.net') || host === 'ttvnw.net' || host.endsWith('.ttvnw.net') || TRUSTED_TWITCH_CLIP_ASSET.test(host) || TRUSTED_TWITCH_CLIP_CLOUDFRONT.test(host))) { this.record(grant.moduleId, 'media.cache.fetch', 'denied'); throw new CapabilityDeniedError(grant.moduleId, 'media.cache', 'Media cache accepts only Twitch CDN URLs.'); }
    if (this.dependencies.cacheClipMedia === undefined) { this.record(grant.moduleId, 'media.cache.fetch', 'failed'); throw new Error('Clip media caching is not available yet.'); }
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(new Error('Clip media cache request timed out.')), 35_000);
    try { const result = await this.dependencies.cacheClipMedia(grant.moduleId, parsed, controller.signal); this.record(grant.moduleId, 'media.cache.fetch', 'granted'); return Object.freeze(result); }
    catch (error) { this.record(grant.moduleId, 'media.cache.fetch', 'failed'); throw error; }
    finally { clearTimeout(timeout); }
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
    this.logger.info('Add-on Streamer.bot action dispatch started', { moduleId: grant.moduleId, actionId });
    try {
      await this.dependencies.runStreamerBotAction(actionId, { ...parsed, thsvAddonRelayToken: relayToken }, controller.signal);
      this.record(grant.moduleId, 'streamerbot.run-approved-action', 'granted');
      this.logger.info('Add-on Streamer.bot action dispatch accepted', { moduleId: grant.moduleId, actionId });
    }
    catch (error) {
      this.record(grant.moduleId, 'streamerbot.run-approved-action', 'failed');
      this.logger.error('Add-on Streamer.bot action dispatch failed', { moduleId: grant.moduleId, actionId, error });
      throw error;
    }
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

  private async publishOverlay(grant: ActiveModuleCapabilityGrant, topic: string, payload: Readonly<Record<string, unknown>>, options?: AddOnOverlayPublishOptionsV2): Promise<void> {
    this.require(grant, 'overlay.publish', 'overlay.publish');
    const suffix = topic.startsWith(`${grant.moduleId}.`) ? topic.slice(grant.moduleId.length + 1) : '';
    if (!OVERLAY_TOPIC_SUFFIX.test(suffix)) throw new Error(`Overlay topic must begin with ${grant.moduleId}. and use dotted identifiers.`);
    const parsed = parseRecord(payload, 'Overlay payload'); assertBoundedJson(parsed, 'Overlay payload');
    const parsedOptions = options === undefined ? undefined : overlayPublishOptionsSchema.parse(options);
    if (this.dependencies.publishOverlay === undefined) return this.deny(grant.moduleId, 'overlay.publish', 'overlay.publish', 'The hosted add-on overlay contract is not available yet.');
    try {
      if (parsedOptions === undefined) await this.dependencies.publishOverlay(grant.moduleId, topic, parsed);
      else await this.dependencies.publishOverlay(grant.moduleId, topic, parsed, parsedOptions);
      this.record(grant.moduleId, 'overlay.publish', 'granted');
    }
    catch (error) { this.record(grant.moduleId, 'overlay.publish', 'failed'); throw error; }
  }

  private requestCoordination(grant: ActiveModuleCapabilityGrant, request: AddOnCoordinationRequestV2): AddOnCoordinationTicketV2 {
    this.require(grant, 'coordination.use', 'coordination.request');
    const parsed = coordinationRequestSchema.parse(request);
    const cooldownUntil = this.coordinationCooldowns.get(`${grant.moduleId}:${parsed.resource}`) ?? 0;
    if (cooldownUntil > Date.now()) return this.deny(grant.moduleId, 'coordination.use', 'coordination.request', `Coordination resource ${parsed.resource} is cooling down for this add-on.`);
    const queuedCount = [...this.coordinationQueues.values()].reduce((total, entries) => total + entries.length, 0);
    if (queuedCount >= MAXIMUM_COORDINATION_QUEUE) return this.deny(grant.moduleId, 'coordination.use', 'coordination.request', 'The shared coordination queue is full.');
    const requestId = randomUUID();
    let resolveReady!: (value: AddOnCoordinationGrantV2) => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<AddOnCoordinationGrantV2>((resolvePromise, rejectPromise) => { resolveReady = resolvePromise; rejectReady = rejectPromise; });
    const entry: CoordinationEntry = { grant, requestId, request: parsed, queuedAt: Date.now(), resolve: resolveReady, reject: rejectReady };
    const blocking = this.blockingCoordinationLease(parsed.resource);
    const immediate = parsed.mode === 'independent' || parsed.mode === 'background' || blocking === undefined;
    if (immediate) {
      this.activateCoordination(entry);
      this.record(grant.moduleId, 'coordination.request', 'granted');
      return Object.freeze({ requestId, status: 'active' as const, ready });
    }
    if (parsed.priority > blocking.entry.request.priority) {
      this.endCoordinationLease(blocking, 'skipped', false);
      this.activateCoordination(entry);
      this.record(grant.moduleId, 'coordination.request', 'granted');
      return Object.freeze({ requestId, status: 'active' as const, ready });
    }
    const queue = this.coordinationQueues.get(parsed.resource) ?? [];
    queue.push(entry);
    queue.sort((left, right) => right.request.priority - left.request.priority || left.queuedAt - right.queuedAt);
    this.coordinationQueues.set(parsed.resource, queue);
    entry.queueTimer = setTimeout(() => {
      const activeQueue = this.coordinationQueues.get(parsed.resource) ?? [];
      const index = activeQueue.findIndex((candidate) => candidate.requestId === requestId);
      if (index < 0) return;
      activeQueue.splice(index, 1);
      if (activeQueue.length === 0) this.coordinationQueues.delete(parsed.resource);
      entry.reject(new Error(parsed.skippable ? `Skippable coordination request ${requestId} expired in the queue.` : `Coordination request ${requestId} timed out in the queue.`));
      this.record(grant.moduleId, 'coordination.timeout', 'failed');
      void this.notifyCoordinationChanged(parsed.resource);
    }, parsed.timeoutMs);
    this.record(grant.moduleId, 'coordination.request', 'granted');
    void this.notifyCoordinationChanged(parsed.resource);
    return Object.freeze({ requestId, status: 'queued' as const, ready });
  }

  private activateCoordination(entry: CoordinationEntry): void {
    if (entry.queueTimer !== undefined) clearTimeout(entry.queueTimer);
    const leaseId = randomUUID();
    const startedAt = Date.now();
    const expiresAt = startedAt + entry.request.timeoutMs;
    const timer = setTimeout(() => {
      const lease = this.coordinationLeases.get(leaseId);
      if (lease !== undefined) this.endCoordinationLease(lease, 'timed-out');
    }, entry.request.timeoutMs);
    const lease: CoordinationLease = { entry, leaseId, startedAt, expiresAt, timer };
    this.coordinationLeases.set(leaseId, lease);
    entry.resolve(Object.freeze({ requestId: entry.requestId, leaseId, resource: entry.request.resource, mode: entry.request.mode, priority: entry.request.priority, startedAt: new Date(startedAt).toISOString(), expiresAt: new Date(expiresAt).toISOString() }));
    void this.notifyCoordinationChanged(entry.request.resource);
  }

  private async releaseCoordination(grant: ActiveModuleCapabilityGrant, leaseId: string, result: 'completed' | 'cancelled'): Promise<boolean> {
    this.require(grant, 'coordination.use', 'coordination.release');
    if (!ACTION_ID.test(leaseId)) throw new Error('Coordination leaseId must be a UUID.');
    const lease = this.coordinationLeases.get(leaseId);
    if (lease === undefined || lease.entry.grant.moduleId !== grant.moduleId) return false;
    this.endCoordinationLease(lease, result);
    this.record(grant.moduleId, 'coordination.release', 'granted');
    return true;
  }

  private async cancelCoordination(grant: ActiveModuleCapabilityGrant, requestId: string): Promise<boolean> {
    this.require(grant, 'coordination.use', 'coordination.cancel');
    if (!ACTION_ID.test(requestId)) throw new Error('Coordination requestId must be a UUID.');
    for (const [resource, queue] of this.coordinationQueues) {
      const index = queue.findIndex((entry) => entry.requestId === requestId && entry.grant.moduleId === grant.moduleId);
      if (index < 0) continue;
      const [entry] = queue.splice(index, 1);
      if (entry?.queueTimer !== undefined) clearTimeout(entry.queueTimer);
      entry?.reject(new Error(`Coordination request ${requestId} was cancelled.`));
      if (queue.length === 0) this.coordinationQueues.delete(resource);
      this.record(grant.moduleId, 'coordination.cancel', 'granted');
      await this.notifyCoordinationChanged(resource);
      return true;
    }
    const lease = [...this.coordinationLeases.values()].find((candidate) => candidate.entry.requestId === requestId && candidate.entry.grant.moduleId === grant.moduleId);
    if (lease === undefined) return false;
    this.endCoordinationLease(lease, 'cancelled');
    this.record(grant.moduleId, 'coordination.cancel', 'granted');
    return true;
  }

  private currentCoordination(grant: ActiveModuleCapabilityGrant, resource: string): AddOnCoordinationSnapshotV2 {
    this.require(grant, 'coordination.use', 'coordination.current');
    if (!COORDINATION_RESOURCE.test(resource)) throw new Error('Invalid coordination resource.');
    this.record(grant.moduleId, 'coordination.current', 'granted');
    return this.coordinationSnapshot(resource);
  }

  private subscribeCoordination(grant: ActiveModuleCapabilityGrant, listener: (snapshot: AddOnCoordinationSnapshotV2) => void | Promise<void>): () => void {
    this.require(grant, 'coordination.use', 'coordination.onChange');
    if (typeof listener !== 'function') throw new Error('Coordination listener must be a function.');
    const entry: CoordinationListener = { grant, listener };
    const listeners = this.coordinationListeners.get(grant.moduleId) ?? new Set<CoordinationListener>();
    listeners.add(entry); this.coordinationListeners.set(grant.moduleId, listeners);
    this.record(grant.moduleId, 'coordination.onChange', 'granted');
    let active = true;
    return () => { if (!active) return; active = false; listeners.delete(entry); if (listeners.size === 0) this.coordinationListeners.delete(grant.moduleId); };
  }

  private coordinationSnapshot(resource: string): AddOnCoordinationSnapshotV2 {
    const active = [...this.coordinationLeases.values()].filter((lease) => lease.entry.request.resource === resource).map((lease) => Object.freeze({ moduleId: lease.entry.grant.moduleId, leaseId: lease.leaseId, mode: lease.entry.request.mode, priority: lease.entry.request.priority, expiresAt: new Date(lease.expiresAt).toISOString() }));
    const queued = (this.coordinationQueues.get(resource) ?? []).map((entry) => Object.freeze({ moduleId: entry.grant.moduleId, requestId: entry.requestId, mode: entry.request.mode, priority: entry.request.priority }));
    return Object.freeze({ resource, active: Object.freeze(active), queued: Object.freeze(queued) });
  }

  private blockingCoordinationLease(resource: string): CoordinationLease | undefined {
    return [...this.coordinationLeases.values()].find((lease) => lease.entry.request.resource === resource && (lease.entry.request.mode === 'exclusive' || lease.entry.request.mode === 'queueable'));
  }

  private endCoordinationLease(lease: CoordinationLease, _result: 'completed' | 'cancelled' | 'timed-out' | 'skipped', processQueue = true): void {
    clearTimeout(lease.timer);
    this.coordinationLeases.delete(lease.leaseId);
    if (lease.entry.request.cooldownMs > 0) this.coordinationCooldowns.set(`${lease.entry.grant.moduleId}:${lease.entry.request.resource}`, Date.now() + lease.entry.request.cooldownMs);
    if (processQueue) this.processCoordinationQueue(lease.entry.request.resource);
    void this.notifyCoordinationChanged(lease.entry.request.resource);
  }

  private processCoordinationQueue(resource: string): void {
    if (this.blockingCoordinationLease(resource) !== undefined) return;
    const queue = this.coordinationQueues.get(resource);
    if (queue === undefined || queue.length === 0) return;
    const entry = queue.shift();
    if (queue.length === 0) this.coordinationQueues.delete(resource);
    if (entry !== undefined && this.isActive(entry.grant)) this.activateCoordination(entry);
    else if (entry !== undefined) { if (entry.queueTimer !== undefined) clearTimeout(entry.queueTimer); entry.reject(new Error(`Add-on ${entry.grant.moduleId} stopped while waiting for coordination.`)); this.processCoordinationQueue(resource); }
  }

  private cleanupCoordination(moduleId: string): void {
    const affected = new Set<string>();
    this.coordinationListeners.delete(moduleId);
    for (const [resource, queue] of this.coordinationQueues) {
      const removed = queue.filter((entry) => entry.grant.moduleId === moduleId);
      if (removed.length === 0) continue;
      affected.add(resource);
      for (const entry of removed) { if (entry.queueTimer !== undefined) clearTimeout(entry.queueTimer); entry.reject(new Error(`Add-on ${moduleId} stopped while waiting for coordination.`)); }
      const remaining = queue.filter((entry) => entry.grant.moduleId !== moduleId);
      if (remaining.length === 0) this.coordinationQueues.delete(resource); else this.coordinationQueues.set(resource, remaining);
    }
    for (const lease of [...this.coordinationLeases.values()]) {
      if (lease.entry.grant.moduleId !== moduleId) continue;
      affected.add(lease.entry.request.resource); this.endCoordinationLease(lease, 'cancelled', false);
    }
    for (const key of [...this.coordinationCooldowns.keys()]) if (key.startsWith(`${moduleId}:`)) this.coordinationCooldowns.delete(key);
    for (const resource of affected) { this.processCoordinationQueue(resource); void this.notifyCoordinationChanged(resource); }
  }

  private async notifyCoordinationChanged(resource: string): Promise<void> {
    const snapshot = this.coordinationSnapshot(resource);
    for (const listeners of this.coordinationListeners.values()) for (const entry of [...listeners]) {
      if (!this.isActive(entry.grant)) continue;
      try { await withTimeout(Promise.resolve(entry.listener(snapshot)), COORDINATION_LISTENER_TIMEOUT_MS, `Coordination listener for ${entry.grant.moduleId}`); }
      catch (error) { this.record(entry.grant.moduleId, 'coordination.onChange', 'failed'); this.logger.warn('Add-on coordination listener failed', { moduleId: entry.grant.moduleId, resource, error }); }
    }
  }

  private currentMediaSlot(grant: ActiveModuleCapabilityGrant): AddOnMediaSlotStateV2 {
    this.require(grant, 'media.exclusive', 'mediaSlot.current');
    this.expireMediaSlotIfNeeded();
    this.record(grant.moduleId, 'mediaSlot.current', 'granted');
    return this.mediaSlotSnapshot();
  }

  private async acquireMediaSlot(grant: ActiveModuleCapabilityGrant, request: AddOnMediaSlotRequestV2): Promise<AddOnMediaSlotLeaseV2> {
    this.require(grant, 'media.exclusive', 'mediaSlot.acquire');
    const parsed = mediaSlotRequestSchema.parse(request);
    this.expireMediaSlotIfNeeded();
    const current = this.mediaSlotLease;
    if (current !== undefined && current.grant.moduleId !== grant.moduleId && current.priority >= parsed.priority) {
      this.record(grant.moduleId, 'mediaSlot.acquire', 'denied');
      return Object.freeze({ acquired: false, ...this.mediaSlotSnapshot() });
    }
    if (current !== undefined) clearTimeout(current.timer);
    const leaseId = randomUUID(); const expiresAt = Date.now() + parsed.durationMs;
    const timer = setTimeout(() => {
      if (this.mediaSlotLease?.leaseId !== leaseId) return;
      this.mediaSlotLease = undefined;
      void this.notifyMediaSlotChanged();
    }, parsed.durationMs);
    this.mediaSlotLease = { grant, leaseId, priority: parsed.priority, expiresAt, timer };
    this.record(grant.moduleId, 'mediaSlot.acquire', 'granted');
    await this.notifyMediaSlotChanged();
    return Object.freeze({ acquired: true, ownerModuleId: grant.moduleId, leaseId, priority: parsed.priority, expiresAt: new Date(expiresAt).toISOString() });
  }

  private async releaseMediaSlot(grant: ActiveModuleCapabilityGrant, leaseId: string): Promise<boolean> {
    this.require(grant, 'media.exclusive', 'mediaSlot.release');
    if (!ACTION_ID.test(leaseId)) throw new Error('Media slot leaseId must be a UUID.');
    const current = this.mediaSlotLease;
    if (current === undefined || current.grant.moduleId !== grant.moduleId || current.leaseId !== leaseId) return false;
    clearTimeout(current.timer); this.mediaSlotLease = undefined;
    this.record(grant.moduleId, 'mediaSlot.release', 'granted');
    await this.notifyMediaSlotChanged();
    return true;
  }

  private subscribeMediaSlot(grant: ActiveModuleCapabilityGrant, listener: (state: AddOnMediaSlotStateV2) => void | Promise<void>): () => void {
    this.require(grant, 'media.exclusive', 'mediaSlot.onChange');
    if (typeof listener !== 'function') throw new Error('Media slot listener must be a function.');
    const entry: MediaSlotListener = { grant, listener };
    const listeners = this.mediaSlotListeners.get(grant.moduleId) ?? new Set<MediaSlotListener>();
    listeners.add(entry); this.mediaSlotListeners.set(grant.moduleId, listeners);
    this.record(grant.moduleId, 'mediaSlot.onChange', 'granted');
    let active = true;
    return () => { if (!active) return; active = false; listeners.delete(entry); if (listeners.size === 0) this.mediaSlotListeners.delete(grant.moduleId); };
  }

  private mediaSlotSnapshot(): AddOnMediaSlotStateV2 {
    const lease = this.mediaSlotLease;
    return lease === undefined ? Object.freeze({}) : Object.freeze({ ownerModuleId: lease.grant.moduleId, leaseId: lease.leaseId, priority: lease.priority, expiresAt: new Date(lease.expiresAt).toISOString() });
  }

  private expireMediaSlotIfNeeded(): void {
    if (this.mediaSlotLease === undefined || this.mediaSlotLease.expiresAt > Date.now()) return;
    clearTimeout(this.mediaSlotLease.timer); this.mediaSlotLease = undefined;
    void this.notifyMediaSlotChanged();
  }

  private async notifyMediaSlotChanged(): Promise<void> {
    const snapshot = this.mediaSlotSnapshot();
    for (const listeners of this.mediaSlotListeners.values()) {
      for (const entry of [...listeners]) {
        if (!this.isActive(entry.grant)) continue;
        try { await withTimeout(Promise.resolve(entry.listener(snapshot)), MEDIA_LISTENER_TIMEOUT_MS, `Media slot listener for ${entry.grant.moduleId}`); }
        catch (error) { this.record(entry.grant.moduleId, 'mediaSlot.onChange', 'failed'); this.logger.warn('Add-on media slot listener failed', { moduleId: entry.grant.moduleId, error }); }
      }
    }
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
    const messageDigest = createHash('sha256').update(request.message).digest('hex').slice(0, 16);
    const routing = { moduleId: grant.moduleId, routing: request.routing, sourcePlatform: request.sourcePlatform, selectedPlatforms: request.selectedPlatforms, messageBytes: Buffer.byteLength(request.message, 'utf8'), messageDigest };
    this.logger.info('Add-on outbound chat dispatch started', routing);
    try {
      const result = await this.dependencies.routeOutboundMessage(request, controller.signal);
      this.record(grant.moduleId, 'chat.send', 'granted');
      this.logger.info('Add-on outbound chat dispatch completed', { ...routing, deliveries: result });
      return result;
    }
    catch (error) {
      this.record(grant.moduleId, 'chat.send', 'failed');
      this.logger.error('Add-on outbound chat dispatch failed', { ...routing, error });
      throw error;
    }
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
