import type { JsonValueV2 } from './common.js';
import type { AddOnPermissionV2 } from './addon-package.js';

export const CORE_RECEIVER_ACTION_ID = '143fce1d-c5b0-4108-b766-ee2d0249e2d4';
export const PROTECTED_FRAMEWORK_ACTION_IDS = new Set([
  CORE_RECEIVER_ACTION_ID,
  '99e202ab-0ee9-58d1-b22c-95b30fdc702e',
  '9481fb18-98a4-5db2-b826-d89db463f490',
  '2a52e02b-fefe-5c89-8aeb-067aa773d621',
  'f021d77f-7eb8-55d8-87dd-d681c439dfef',
  '7d107c29-1127-5bb1-ae8b-6f04d89a71d4',
  '5b43c53a-1e4b-5608-b343-5f88c2884677',
  '38df4ccc-2d85-5a9d-8fa6-6711f513c2bd',
  'a6b02419-c344-5853-8166-eb6b6adb02d7',
  '9f37f61d-f2d6-50cc-bbca-3b1d951ef9ee',
  'ab0e5f0a-e714-516c-82ee-1f476a516f7e',
  '6bd402de-117e-56f4-8855-308e2894e66c',
  'b2ee7599-75b5-5c88-8ef2-4d715885c610',
  '23332128-445d-52ee-837a-0c79579e3c04',
  '4e9f0946-f33d-5309-b376-a16df5612b32',
  '04ca0087-578d-5c2e-9e06-249dc072e9f8',
  'c1d3a9e2-0f4b-4b78-91c2-7a65d8e309f1',
  'f5b716a8-eb6e-54d3-8e25-d7dd80f6baf2',
  '8d8e3667-fd96-510f-b2ae-a8affe5b789a',
  '18bdc91c-64eb-4787-8be9-6a921b272943',
].map((value) => value.toLowerCase()));

export function isProtectedFrameworkActionId(actionId: string): boolean { return PROTECTED_FRAMEWORK_ACTION_IDS.has(actionId.toLowerCase()); }

export type AddOnActionArgumentsV2 = Readonly<Record<string, JsonValueV2>>;
export type AddOnPrivateStateV2 = Readonly<Record<string, JsonValueV2>>;
export type AddOnScheduledTaskV2 = () => void | Promise<void>;

export interface AddOnStateCapabilityV2 {
  read(): Promise<AddOnPrivateStateV2>;
  write(value: AddOnPrivateStateV2): Promise<void>;
}

export interface AddOnStreamerBotCapabilityV2 {
  runApprovedAction(actionId: string, argumentsValue?: AddOnActionArgumentsV2): Promise<void>;
}

export interface AddOnScheduleCapabilityV2 {
  after(delayMs: number, task: AddOnScheduledTaskV2): string;
  cancel(taskId: string): boolean;
}

export interface AddOnOverlayCapabilityV2 {
  publish(topic: string, payload: Readonly<Record<string, JsonValueV2>>, options?: AddOnOverlayPublishOptionsV2): Promise<void>;
  onLifecycle(listener: (event: AddOnOverlayLifecycleV2) => void): () => void;
}

export type AddOnOverlayPresentationLaneV2 = 'foreground' | 'media' | 'timer' | 'persistent' | 'preview' | 'independent';

export interface AddOnOverlayPublishOptionsV2 {
  readonly lane: AddOnOverlayPresentationLaneV2;
}

export interface AddOnOverlayLifecycleV2 {
  readonly playbackId: string;
  readonly phase: 'loading' | 'started' | 'heartbeat' | 'ended' | 'stopped' | 'failed' | 'timeout';
  readonly occurredAt: string;
  readonly currentTime?: number;
  readonly duration?: number;
  readonly error?: string;
}

export interface AddOnMediaSlotStateV2 {
  readonly ownerModuleId?: string;
  readonly leaseId?: string;
  readonly priority?: number;
  readonly expiresAt?: string;
}

export interface AddOnMediaSlotRequestV2 {
  readonly durationMs: number;
  readonly priority: number;
}

export type AddOnMediaSlotLeaseV2 =
  | (AddOnMediaSlotStateV2 & { readonly acquired: false })
  | {
      readonly acquired: true;
      readonly ownerModuleId: string;
      readonly leaseId: string;
      readonly priority: number;
      readonly expiresAt: string;
    };

export interface AddOnMediaSlotCapabilityV2 {
  /** Returns the current exclusive video owner without exposing add-on state or media payloads. */
  current(): AddOnMediaSlotStateV2;
  /** Claims the single shared video slot for a bounded period. Higher-priority claims may preempt lower-priority owners. */
  acquire(request: AddOnMediaSlotRequestV2): Promise<AddOnMediaSlotLeaseV2>;
  /** Releases only a lease created by this module. */
  release(leaseId: string): Promise<boolean>;
  /** Notifies video add-ons when they should yield or may resume. */
  onChange(listener: (state: AddOnMediaSlotStateV2) => void | Promise<void>): () => void;
}

export interface AddOnMediaCacheCapabilityV2 {
  /** Caches one temporary Twitch CDN clip for no more than 24 hours and returns a loopback overlay URL. */
  fetch(request: { readonly sourceUrl: string; readonly cacheKey: string; readonly ttlSeconds: number; readonly maximumBytes: number }): Promise<{ readonly url: string; readonly cacheHit: boolean; readonly bytes: number; readonly expiresAt: string }>;
}

export type AddOnCoordinationModeV2 = 'exclusive' | 'queueable' | 'independent' | 'background';
export type AddOnCoordinationStatusV2 = 'queued' | 'active' | 'completed' | 'cancelled' | 'timed-out' | 'skipped';

export interface AddOnCoordinationRequestV2 {
  /** A shared dotted resource such as media.playback or alerts.presentation. */
  readonly resource: string;
  readonly mode: AddOnCoordinationModeV2;
  readonly priority?: number;
  readonly timeoutMs?: number;
  readonly cooldownMs?: number;
  /** Queueable work may be skipped when its bounded wait expires. */
  readonly skippable?: boolean;
}

export interface AddOnCoordinationGrantV2 {
  readonly requestId: string;
  readonly leaseId: string;
  readonly resource: string;
  readonly mode: AddOnCoordinationModeV2;
  readonly priority: number;
  readonly startedAt: string;
  readonly expiresAt: string;
}

export interface AddOnCoordinationTicketV2 {
  readonly requestId: string;
  readonly status: 'queued' | 'active';
  readonly ready: Promise<AddOnCoordinationGrantV2>;
}

export interface AddOnCoordinationSnapshotV2 {
  readonly resource: string;
  readonly active: readonly Readonly<{ moduleId: string; leaseId: string; mode: AddOnCoordinationModeV2; priority: number; expiresAt: string }>[];
  readonly queued: readonly Readonly<{ moduleId: string; requestId: string; mode: AddOnCoordinationModeV2; priority: number }>[];
}

export interface AddOnCoordinationCapabilityV2 {
  request(request: AddOnCoordinationRequestV2): AddOnCoordinationTicketV2;
  release(leaseId: string): Promise<boolean>;
  cancel(requestId: string): Promise<boolean>;
  current(resource: string): AddOnCoordinationSnapshotV2;
  onChange(listener: (snapshot: AddOnCoordinationSnapshotV2) => void | Promise<void>): () => void;
}

export type AddOnOutboundPlatformV2 = 'twitch' | 'youtube' | 'kick' | 'tiktok' | 'facebook';

export interface AddOnOutboundMessageRequestV2 {
  readonly message: string;
  readonly routing: 'source' | 'selected';
  readonly sourcePlatform?: AddOnOutboundPlatformV2;
  readonly selectedPlatforms?: readonly AddOnOutboundPlatformV2[];
  readonly overflow?: 'reject' | 'split';
}

export interface AddOnOutboundMessageDeliveryV2 {
  readonly platform: AddOnOutboundPlatformV2;
  readonly accepted: boolean;
  readonly parts: number;
  readonly error?: string;
}

export interface AddOnChatCapabilityV2 {
  send(request: AddOnOutboundMessageRequestV2): Promise<readonly AddOnOutboundMessageDeliveryV2[]>;
}

/** A webhook from the creator's shared Discord webhook list. Add-ons see its ID and name, never its URL. */
export interface AddOnDiscordWebhookV2 {
  readonly id: string;
  readonly name: string;
}

export interface AddOnDiscordPostRequestV2 {
  /** The ID of a webhook in the creator's Discord webhook list, usually picked in the add-on's settings. */
  readonly webhookId: string;
  readonly content?: string;
  /** Replaces the webhook's own name for this post. */
  readonly username?: string;
  /** An https image link that replaces the webhook's picture for this post. */
  readonly avatarUrl?: string;
  /** Up to ten Discord embed objects. */
  readonly embeds?: readonly Readonly<Record<string, JsonValueV2>>[];
  /** Posts into an existing thread or forum post. */
  readonly threadId?: string;
  /** Starts a new forum post with this title. The webhook must belong to a forum channel. */
  readonly threadName?: string;
  /** Up to five forum tag IDs for a new forum post. */
  readonly forumTagIds?: readonly string[];
  /** Up to three Discord role IDs the creator chose to ping. No other mention ever pings. */
  readonly mentionRoleIds?: readonly string[];
}

export interface AddOnDiscordPostResultV2 {
  readonly ok: boolean;
  readonly messageId?: string;
  /** The thread or forum post the message landed in, when one was used or created. */
  readonly threadId?: string;
  readonly error?: string;
}

export interface AddOnDiscordCapabilityV2 {
  /** Webhooks that are turned on and ready, by ID and name. */
  webhooks(): readonly AddOnDiscordWebhookV2[];
  /** Posts one message. Mentions are always disabled. Resolves with ok false instead of throwing when Discord refuses. */
  post(request: AddOnDiscordPostRequestV2): Promise<AddOnDiscordPostResultV2>;
}

export interface AddOnProviderDonationRequestV2 {
  readonly sourceEventId: string;
  readonly sourceEventType: string;
  readonly receivedAt: string;
  readonly channelName: string;
  readonly supporterName: string;
  readonly amount: string;
  readonly currency: string;
  readonly message?: string;
  readonly simulated: boolean;
}

export interface AddOnProviderCapabilityV2 {
  /** Publishes only the provider event types assigned to this installed module. Core constructs and validates the normalized event. */
  publishDonation(request: AddOnProviderDonationRequestV2): Promise<void>;
}

export interface ViewerFoundationProjectionV1 {
  readonly contractVersion: '1.0.0';
  readonly viewerId: string;
  readonly linked: boolean;
  /** Creator-configured display name for this points balance. Older providers may omit it. */
  readonly currencyName?: string;
  readonly points: number;
  readonly level: number;
  readonly nextLevelAt: number;
  readonly achievements?: readonly Readonly<{ id: string; label: string; points: number }>[];
  readonly latestAchievement?: Readonly<{ id: string; label: string; points: number }>;
}

export interface ViewerFoundationProjectionQueryV1 {
  readonly viewerId?: string;
  readonly platform?: 'twitch' | 'youtube' | 'kick' | 'tiktok' | 'facebook';
  readonly userId?: string;
}

export interface ViewerFoundationMutationRequestV1 {
  readonly viewerId: string;
  readonly operation: 'add' | 'spend' | 'refund';
  readonly amount: number;
  readonly reason: string;
  readonly idempotencyKey: string;
}

export interface ViewerFoundationMutationResultV1 extends ViewerFoundationProjectionV1 {
  readonly operation: 'add' | 'spend' | 'refund';
  readonly amount: number;
  readonly previousPoints: number;
  readonly duplicate: boolean;
}

export interface ViewerFoundationAdminRequestV1 {
  readonly operation: 'status' | 'search' | 'export' | 'correct' | 'undo-correction' | 'delete' | 'audit' | 'link-audit' | 'import-legacy';
  readonly viewerId?: string;
  readonly platform?: 'twitch' | 'youtube' | 'kick' | 'tiktok' | 'facebook';
  readonly userId?: string;
  readonly adjustment?: 'add' | 'remove' | 'reset';
  readonly amount?: number;
  readonly reason?: string;
  readonly auditId?: string;
  readonly limit?: number;
  readonly linkAction?: 'add' | 'remove';
  readonly approvedByCreator?: boolean;
  readonly migrationDigest?: string;
  readonly legacyViewers?: readonly Readonly<{ viewerId: string; points: number; lastAwardAt: Readonly<Record<string, number>> }>[];
}

export type ViewerFoundationAdminResultV1 = Readonly<Record<string, JsonValueV2>>;

export interface CommunityAnalyticsAdminRequestV1 {
  readonly operation: 'status' | 'export' | 'delete' | 'report';
  readonly viewerId?: string;
  readonly approvedByCreator?: boolean;
  readonly reportKind?: 'session-json' | 'viewers-csv';
}

export type CommunityAnalyticsAdminResultV1 = Readonly<Record<string, JsonValueV2>>;

export type QuoteVaultAdminRequestV1 =
  | { readonly operation: 'status' }
  | { readonly operation: 'sync-import'; readonly approvedByCreator: true }
  | { readonly operation: 'add'; readonly quotedName: string; readonly text: string; readonly sourcePlatform: 'twitch' | 'youtube' | 'kick' | 'tiktok' | 'facebook'; readonly approvedByCreator: true }
  | { readonly operation: 'edit'; readonly quoteId: number; readonly quotedName: string; readonly text: string; readonly approvedByCreator: true }
  | { readonly operation: 'approve'; readonly quoteId: number; readonly approvedByCreator: true }
  | { readonly operation: 'delete'; readonly quoteId: number; readonly approvedByCreator: true }
  | { readonly operation: 'restore'; readonly quoteId: number; readonly approvedByCreator: true };

export type QuoteVaultAdminResultV1 = Readonly<Record<string, JsonValueV2>>;

export type ViewerSpotlightAdminRequestV1 =
  | { readonly operation: 'status' }
  | { readonly operation: 'stream-score'; readonly approvedByCreator: true }
  | { readonly operation: 'display'; readonly platform: 'twitch' | 'youtube' | 'kick' | 'tiktok' | 'facebook'; readonly userId: string; readonly displayName: string; readonly avatarUrl?: string; readonly sendDiscord?: boolean; readonly approvedByCreator: true };

export type ViewerSpotlightAdminResultV1 = Readonly<Record<string, JsonValueV2>>;

export type ChatGuardAdminRequestV1 =
  | { readonly operation: 'status' }
  | { readonly operation: 'incidents'; readonly platform?: 'twitch' | 'youtube' | 'kick' | 'tiktok' | 'facebook'; readonly rule?: 'ban-term' | 'blocked-term' | 'blocked-domain' | 'unapproved-domain' | 'excessive-links' | 'excessive-caps' | 'repeated-characters' | 'long-message' | 'repeated-message'; readonly review?: 'unreviewed' | 'confirmed' | 'false-positive'; readonly enforcementStatus?: 'none' | 'dispatched' | 'succeeded' | 'failed' | 'unsupported'; readonly offset?: number; readonly limit?: number }
  | { readonly operation: 'test'; readonly message: string; readonly priorMatchingMessages: number }
  | { readonly operation: 'trust-add'; readonly platform: 'twitch' | 'youtube' | 'kick' | 'tiktok' | 'facebook'; readonly userId: string; readonly label: string; readonly approvedByCreator: true }
  | { readonly operation: 'trust-remove'; readonly accountKey: string; readonly approvedByCreator: true }
  | { readonly operation: 'permit'; readonly platform: 'twitch' | 'youtube' | 'kick' | 'tiktok' | 'facebook'; readonly userId: string; readonly durationMinutes: number; readonly maximumUses: number; readonly approvedByCreator: true }
  | { readonly operation: 'clear-permits'; readonly approvedByCreator: true }
  | { readonly operation: 'review'; readonly incidentId: string; readonly decision: 'confirmed' | 'false-positive'; readonly approvedByCreator: true }
  | { readonly operation: 'clear'; readonly approvedByCreator: true };

export type ChatGuardAdminResultV1 = Readonly<Record<string, JsonValueV2>>;

export type VillageDrawAdminRequestV1 =
  | { readonly operation: 'status' }
  | { readonly operation: 'open'; readonly approvedByCreator: true }
  | { readonly operation: 'pause'; readonly approvedByCreator: true }
  | { readonly operation: 'resume'; readonly approvedByCreator: true }
  | { readonly operation: 'close'; readonly approvedByCreator: true }
  | { readonly operation: 'draw'; readonly approvedByCreator: true }
  | { readonly operation: 'confirm'; readonly approvedByCreator: true }
  | { readonly operation: 'redraw'; readonly approvedByCreator: true }
  | { readonly operation: 'cancel'; readonly approvedByCreator: true }
  | { readonly operation: 'reset'; readonly approvedByCreator: true };

export type VillageDrawAdminResultV1 = Readonly<Record<string, JsonValueV2>>;

export type FollowerPulseAdminRequestV1 =
  | { readonly operation: 'status' }
  | { readonly operation: 'reconcile'; readonly approvedByCreator: true };

export type FollowerPulseAdminResultV1 = Readonly<Record<string, JsonValueV2>>;

export interface ViewerFoundationProviderV1 {
  getProjection(query: ViewerFoundationProjectionQueryV1): Promise<ViewerFoundationProjectionV1 | undefined>;
  mutate(request: ViewerFoundationMutationRequestV1 & { readonly callerModuleId: string }): Promise<ViewerFoundationMutationResultV1>;
  /** Host-only administration. This method is never exposed through an add-on runtime context. */
  administer(request: ViewerFoundationAdminRequestV1): Promise<ViewerFoundationAdminResultV1>;
}

export interface AddOnViewerFoundationCapabilityV2 {
  /** Registers the one official provider. Only thsv.viewer-foundation may receive the provide permission. */
  provide(provider: ViewerFoundationProviderV1): () => void;
  /** Returns a frozen, schema-bounded projection; private state and installation salt are never exposed. */
  getProjection(query: ViewerFoundationProjectionQueryV1): Promise<ViewerFoundationProjectionV1 | undefined>;
  /** Performs an idempotent, audited point mutation through the foundation authority. */
  mutate(request: ViewerFoundationMutationRequestV1): Promise<ViewerFoundationMutationResultV1>;
  /** Provider-only privacy signal containing only the deleted pseudonymous Viewer Foundation ID. */
  notifyDeleted(viewerId: string): Promise<void>;
  /** Removes consumer-owned caches and projections as soon as Viewer Foundation deletes a viewer. */
  onDeleted(listener: (viewerId: string) => void | Promise<void>): () => void;
}

export interface CommunityAnalyticsCountersV1 {
  readonly messages: number;
  readonly commands: number;
  readonly follows: number;
  readonly subscriptions: number;
  readonly memberships: number;
  readonly giftSubscriptions: number;
  readonly gifts: number;
  readonly cheers: number;
  readonly superChats: number;
  readonly raids: number;
  readonly rewardRedemptions: number;
}

export interface CommunityAnalyticsViewerProjectionV1 {
  readonly contractVersion: '1.0.0';
  readonly viewerId: string;
  readonly observed: boolean;
  readonly firstSeenAt?: number;
  readonly lastSeenAt?: number;
  readonly sessions: number;
  readonly counters: CommunityAnalyticsCountersV1;
  readonly activeSession: boolean;
  readonly activeLastSeenAt?: number;
  readonly scoreSeason?: string;
  readonly engagementScore?: number;
  readonly seasonRank?: number;
  readonly rankCohortSize?: number;
}

export interface CommunityAnalyticsSessionProjectionV1 {
  readonly contractVersion: '1.0.0';
  readonly active: boolean;
  readonly startedAt?: number;
  readonly approximate: boolean;
  readonly livePlatforms: readonly ('twitch' | 'youtube' | 'kick' | 'tiktok' | 'facebook')[];
  readonly uniqueViewers: number;
  readonly counters: CommunityAnalyticsCountersV1;
  readonly retainedSessionCount: number;
}

/** A stream phase the creator maps to one of their own broadcast-app scenes in the setup wizard. */
export type AddOnSceneRoleV2 = 'starting' | 'live' | 'chatting' | 'break' | 'ending';

/**
 * Read-only scene roles. Add-ons accept a scene setting such as "role:break" so shipped defaults
 * never name one creator's scenes. Read from the active configuration on every call; needs no permission.
 */
export interface AddOnScenesV2 {
  /** The creator's exact scene name for a role, or '' when that role is not mapped. */
  sceneFor(role: AddOnSceneRoleV2): string;
  /** The role whose mapped scene matches this name (ignoring case, surrounding spaces and leading emoji), if any. */
  roleOf(sceneName: string): AddOnSceneRoleV2 | undefined;
  /** Expands a "role:<role>" setting value to the mapped scene ('' when unmapped); any other value is returned trimmed. */
  resolve(value: string): string;
}

export interface CommunityAnalyticsProviderV1 {
  getViewerProjection(viewerId: string): Promise<CommunityAnalyticsViewerProjectionV1>;
  getSessionProjection(): Promise<CommunityAnalyticsSessionProjectionV1>;
}

export interface AddOnCommunityAnalyticsCapabilityV2 {
  /** Registers the official provider. Only thsv.community-analytics may receive the provide permission. */
  provide(provider: CommunityAnalyticsProviderV1): () => void;
  /** Returns one bounded pseudonymous viewer projection; names, accounts, raw events, and state are never exposed. */
  getViewerProjection(viewerId: string): Promise<CommunityAnalyticsViewerProjectionV1>;
  /** Returns only the active aggregate session projection. */
  getSessionProjection(): Promise<CommunityAnalyticsSessionProjectionV1>;
}

/** The creator's community, as add-ons should name it in viewer-facing text. */
export interface AddOnCommunityV2 {
  /**
   * Never blank. Resolved on every read: the creator's configured community name, else the
   * broadcaster channel name most recently seen on a live (non-simulated) platform event,
   * else the generic "the community". Add-ons expand a `{community}` token in their messages
   * from this value so shared installs never speak for another creator's community.
   */
  readonly name: string;
}

export interface ModuleRuntimeContextV2 {
  readonly moduleId: string;
  readonly grantedPermissions: readonly AddOnPermissionV2[];
  readonly approvedActionIds: readonly string[];
  has(permission: AddOnPermissionV2): boolean;
  /** The add-on's own creator-saved settings, already validated against its configurationSchema with defaults applied. Empty for a declarative package or one with no schema properties. */
  readonly settings: Readonly<Record<string, unknown>>;
  /** The creator's scene-role mapping; see {@link AddOnScenesV2}. */
  readonly scenes: AddOnScenesV2;
  readonly state: AddOnStateCapabilityV2;
  readonly streamerbot: AddOnStreamerBotCapabilityV2;
  readonly schedule: AddOnScheduleCapabilityV2;
  readonly overlay: AddOnOverlayCapabilityV2;
  readonly mediaSlot: AddOnMediaSlotCapabilityV2;
  readonly mediaCache: AddOnMediaCacheCapabilityV2;
  readonly coordination: AddOnCoordinationCapabilityV2;
  readonly chat: AddOnChatCapabilityV2;
  readonly discord: AddOnDiscordCapabilityV2;
  readonly provider: AddOnProviderCapabilityV2;
  readonly viewerFoundation: AddOnViewerFoundationCapabilityV2;
  readonly communityAnalytics: AddOnCommunityAnalyticsCapabilityV2;
  /** The creator's community name for viewer-facing text; see {@link AddOnCommunityV2}. Needs no permission. */
  readonly community: AddOnCommunityV2;
}
