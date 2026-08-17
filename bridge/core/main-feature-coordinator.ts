import type { NormalizedEvent } from '../../schemas/event.js';
import { MAIN_FEATURE_FAMILIES, mainFeatureModuleIds } from './main-feature-registry.js';

const BROADCAST_COMPONENTS = mainFeatureModuleIds('broadcast-director');
const CLIP_COMPONENTS = mainFeatureModuleIds('clip-engine', true);
const REWARD_COMPONENTS = mainFeatureModuleIds('community-rewards');
const MESSAGING_COMPONENTS = mainFeatureModuleIds('community-messaging');
const INSIGHT_COMPONENTS = mainFeatureModuleIds('community-insights', true);
const PLAY_COMPONENTS = mainFeatureModuleIds('community-play');
const VOICE_LANGUAGE_COMPONENTS = mainFeatureModuleIds('voice-language');

type ModuleHealth = Readonly<{ readonly moduleId?: unknown; readonly status?: unknown; readonly failures?: unknown }>;

export class MainFeatureCoordinator {
  private readonly livePlatforms = new Set<string>();
  private currentScene = '';
  private adState: 'idle' | 'upcoming' | 'active' = 'idle';
  private adEndsAt = 0;
  private nextAdAt = '';
  private raidState: 'idle' | 'selecting' | 'selected' | 'raiding' | 'complete' | 'failed' = 'idle';
  private raidOperation = '';
  private raidError = '';
  private librarySize = 0;
  private libraryRefreshedAt = '';
  private randomClipResponses = 0;
  private lastClipActivityAt = '';
  private lastClipError = '';
  private rewardRedemptions = 0;
  private rewardOperations = 0;
  private rewardFailures = 0;
  private lastRewardComponent = '';
  private lastRewardActivityAt = '';
  private chatMessagesObserved = 0;
  private messagingOperations = 0;
  private messagingFailures = 0;
  private lastMessagingComponent = '';
  private lastMessagingActivityAt = '';
  private readonly extensionActivity = new Map<string, { operations: number; failures: number; lastComponent: string; lastActivityAt: string }>();

  public restoreLivePlatforms(platforms: readonly unknown[]): void {
    this.livePlatforms.clear();
    for (const platform of platforms) if (typeof platform === 'string' && platform.length > 0) this.livePlatforms.add(platform);
  }

  public observe(event: NormalizedEvent): void {
    if (event.metadata.simulated) return;
    const payload = event.payload as Readonly<Record<string, unknown>>;
    if (event.eventType === 'stream.online') {
      if (this.livePlatforms.size === 0) this.resetSessionActivity();
      this.livePlatforms.add(event.platform);
      if (this.raidState === 'complete' || this.raidState === 'failed') this.resetEndingState();
      return;
    }
    if (event.eventType === 'reward.redemption') {
      this.rewardRedemptions += 1;
      this.lastRewardComponent = 'core.rewards';
      this.lastRewardActivityAt = event.receivedAt;
    }
    if (event.eventType === 'chat.message') {
      this.chatMessagesObserved += 1;
      this.lastMessagingComponent = 'core.chat';
      this.lastMessagingActivityAt = event.receivedAt;
    }
    const addOnModuleId = moduleIdFromEventType(event.eventType);
    if (addOnModuleId !== '' && REWARD_COMPONENTS.includes(addOnModuleId)) {
      this.rewardOperations += 1;
      this.rewardFailures += failedResult(payload) ? 1 : 0;
      this.lastRewardComponent = addOnModuleId;
      this.lastRewardActivityAt = event.receivedAt;
    }
    if (addOnModuleId !== '' && MESSAGING_COMPONENTS.includes(addOnModuleId)) {
      this.messagingOperations += 1;
      this.messagingFailures += failedResult(payload) ? 1 : 0;
      this.lastMessagingComponent = addOnModuleId;
      this.lastMessagingActivityAt = event.receivedAt;
    }
    this.observeExtensionActivity(addOnModuleId, payload, event.receivedAt, 'communityInsights', INSIGHT_COMPONENTS);
    this.observeExtensionActivity(addOnModuleId, payload, event.receivedAt, 'communityPlay', PLAY_COMPONENTS);
    this.observeExtensionActivity(addOnModuleId, payload, event.receivedAt, 'voiceLanguage', VOICE_LANGUAGE_COMPONENTS);
    if (event.eventType === 'stream.offline') {
      this.livePlatforms.delete(event.platform);
      if (this.livePlatforms.size === 0) {
        this.adState = 'idle'; this.adEndsAt = 0; this.nextAdAt = '';
        if (this.raidState !== 'failed') this.raidState = 'complete';
      }
      return;
    }
    if (event.eventType === 'stream.scene-changed') {
      this.currentScene = bounded(payload['sceneName'], 160);
      return;
    }
    if (event.eventType === 'addon.thsv.ad-break-companion.upcoming') {
      this.adState = 'upcoming';
      this.nextAdAt = bounded(payload['nextAdAt'], 80);
      return;
    }
    if (event.eventType === 'addon.thsv.ad-break-companion.started') {
      const durationMs = positiveNumber(payload['adLengthMs']) || positiveNumber(payload['adLength']) * 1_000;
      const startedAt = Date.parse(event.receivedAt);
      this.adState = 'active'; this.adEndsAt = (Number.isFinite(startedAt) ? startedAt : Date.now()) + Math.min(durationMs || 180_000, 600_000);
      return;
    }
    if (event.eventType === 'addon.thsv.raid-scout.control') {
      const action = bounded(payload['action'], 40).toLowerCase();
      if (action === 'suggest') this.raidState = 'selecting';
      else if (action === 'confirm') this.raidState = 'selected';
      else if (action === 'cancel') this.resetEndingState();
      this.raidOperation = action; this.raidError = '';
      return;
    }
    if (event.eventType === 'addon.thsv.raid-scout.controller-result') {
      const operation = bounded(payload['operation'] ?? (event as unknown as Record<string, unknown>)['operation'], 60).toLowerCase();
      const success = payload['success'] === true || (event as unknown as Record<string, unknown>)['success'] === true;
      const error = bounded(payload['error'] ?? payload['controllerError'] ?? (event as unknown as Record<string, unknown>)['controllerError'], 240);
      this.raidOperation = operation;
      if (operation === 'discover' && success) this.raidState = 'selected';
      else if (operation === 'raid' && success) this.raidState = 'raiding';
      else if ((operation === 'end-stream' || operation === 'stop-broadcasts') && success) this.raidState = 'complete';
      else if (!success && operation !== 'clip-download') { this.raidState = 'failed'; this.raidError = error || 'Raid Scout operation failed.'; }
      if (operation === 'clip-download') {
        this.lastClipActivityAt = event.receivedAt;
        this.lastClipError = success ? '' : error || 'Raid clip download failed.';
      }
      return;
    }
    if (event.eventType === 'addon.thsv.clip-library-cache.snapshot' || event.eventType === 'addon.thsv.random-clip-player.clips-received') {
      const clips = payload['clips'];
      if (Array.isArray(clips)) this.librarySize = Math.max(this.librarySize, clips.length);
      this.libraryRefreshedAt = event.receivedAt;
      return;
    }
    if (event.eventType === 'addon.thsv.random-clip-player.clip-download-received') {
      this.randomClipResponses += 1; this.lastClipActivityAt = event.receivedAt;
      const hasUrl = bounded(payload['landscapeUrl'] ?? payload['portraitUrl'], 2_000).length > 0;
      this.lastClipError = hasUrl ? '' : bounded(payload['error'], 240) || 'Random clip response contained no playable URL.';
    }
  }

  public snapshot(moduleStatuses: readonly ModuleHealth[], capabilityDiagnostics: Readonly<Record<string, unknown>>, now = Date.now()): Readonly<Record<string, unknown>> {
    if (this.adState === 'active' && this.adEndsAt > 0 && now >= this.adEndsAt) { this.adState = 'idle'; this.adEndsAt = 0; }
    const broadcast = components(BROADCAST_COMPONENTS, moduleStatuses);
    const clips = components(CLIP_COMPONENTS, moduleStatuses);
    const rewards = components(REWARD_COMPONENTS, moduleStatuses);
    const messaging = components(MESSAGING_COMPONENTS, moduleStatuses);
    const insights = components(INSIGHT_COMPONENTS, moduleStatuses);
    const play = components(PLAY_COMPONENTS, moduleStatuses);
    const voiceLanguage = components(VOICE_LANGUAGE_COMPONENTS, moduleStatuses);
    const stage = this.livePlatforms.size === 0 ? 'offline' : ['selecting', 'selected', 'raiding'].includes(this.raidState) ? 'ending' : 'live';
    return Object.freeze({
      contractVersion: '1.0.0',
      privacy: 'Operational counts and component health only; no viewer identity, message text, reward text, clip identity, or credentials.',
      catalog: MAIN_FEATURE_FAMILIES,
      broadcastDirector: Object.freeze({
        status: broadcast.status, stage, livePlatforms: [...this.livePlatforms].sort(), currentScene: this.currentScene,
        ad: Object.freeze({ state: this.adState, nextAdAt: this.nextAdAt, endsAt: this.adEndsAt > 0 ? new Date(this.adEndsAt).toISOString() : '' }),
        raid: Object.freeze({ state: this.raidState, operation: this.raidOperation, error: this.raidError }),
        components: broadcast.items,
      }),
      clipEngine: Object.freeze({
        status: clips.status, librarySize: this.librarySize, libraryRefreshedAt: this.libraryRefreshedAt,
        randomClipResponses: this.randomClipResponses, lastActivityAt: this.lastClipActivityAt, lastError: this.lastClipError,
        media: capabilityDiagnostics['mediaSlot'] ?? {}, components: clips.items,
      }),
      communityRewards: Object.freeze({
        status: rewards.status, sessionActive: this.livePlatforms.size > 0, redemptions: this.rewardRedemptions, operations: this.rewardOperations,
        failures: this.rewardFailures, lastComponent: this.lastRewardComponent, lastActivityAt: this.lastRewardActivityAt,
        capabilityFailures: capabilityFailureCount(capabilityDiagnostics, REWARD_COMPONENTS), components: rewards.items,
      }),
      communityMessaging: Object.freeze({
        status: messaging.status, sessionActive: this.livePlatforms.size > 0, messagesObserved: this.chatMessagesObserved, operations: this.messagingOperations,
        failures: this.messagingFailures, lastComponent: this.lastMessagingComponent, lastActivityAt: this.lastMessagingActivityAt,
        outboundPending: pendingRequestCount(capabilityDiagnostics, 'outboundRequests', MESSAGING_COMPONENTS),
        capabilityFailures: capabilityFailureCount(capabilityDiagnostics, MESSAGING_COMPONENTS), components: messaging.items,
      }),
      communityInsights: this.extensionSnapshot('communityInsights', insights, INSIGHT_COMPONENTS, capabilityDiagnostics),
      communityPlay: this.extensionSnapshot('communityPlay', play, PLAY_COMPONENTS, capabilityDiagnostics),
      voiceLanguage: this.extensionSnapshot('voiceLanguage', voiceLanguage, VOICE_LANGUAGE_COMPONENTS, capabilityDiagnostics),
    });
  }

  private resetEndingState(): void { this.raidState = 'idle'; this.raidOperation = ''; this.raidError = ''; }

  private resetSessionActivity(): void {
    this.rewardRedemptions = 0; this.rewardOperations = 0; this.rewardFailures = 0; this.lastRewardComponent = ''; this.lastRewardActivityAt = '';
    this.chatMessagesObserved = 0; this.messagingOperations = 0; this.messagingFailures = 0; this.lastMessagingComponent = ''; this.lastMessagingActivityAt = '';
    this.extensionActivity.clear();
  }

  private observeExtensionActivity(moduleId: string, payload: Readonly<Record<string, unknown>>, receivedAt: string, key: string, components: readonly string[]): void {
    if (moduleId === '' || !components.includes(moduleId)) return;
    const current = this.extensionActivity.get(key) ?? { operations: 0, failures: 0, lastComponent: '', lastActivityAt: '' };
    current.operations += 1;
    current.failures += failedResult(payload) ? 1 : 0;
    current.lastComponent = moduleId;
    current.lastActivityAt = receivedAt;
    this.extensionActivity.set(key, current);
  }

  private extensionSnapshot(key: string, componentStatus: Readonly<{ status: string; items: readonly Readonly<Record<string, unknown>>[] }>, moduleIds: readonly string[], capabilityDiagnostics: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    const activity = this.extensionActivity.get(key) ?? { operations: 0, failures: 0, lastComponent: '', lastActivityAt: '' };
    return Object.freeze({
      status: componentStatus.status,
      sessionActive: this.livePlatforms.size > 0,
      operations: activity.operations,
      failures: activity.failures,
      lastComponent: activity.lastComponent,
      lastActivityAt: activity.lastActivityAt,
      outboundPending: pendingRequestCount(capabilityDiagnostics, 'outboundRequests', moduleIds),
      capabilityFailures: capabilityFailureCount(capabilityDiagnostics, moduleIds),
      components: componentStatus.items,
    });
  }
}

function components(ids: readonly string[], statuses: readonly ModuleHealth[]): Readonly<{ status: string; items: readonly Readonly<Record<string, unknown>>[] }> {
  const byId = new Map(statuses.map((entry) => [stringValue(entry.moduleId), entry]));
  const items = ids.map((moduleId) => {
    const entry = byId.get(moduleId);
    return Object.freeze({ moduleId, status: entry === undefined ? 'not-installed' : stringValue(entry.status, 'unknown'), failures: Array.isArray(entry?.failures) ? entry.failures.length : 0 });
  });
  const installed = items.filter((entry) => entry.status !== 'not-installed');
  const status = installed.length === 0 ? 'not-installed' : installed.some((entry) => entry.status !== 'healthy') ? 'needs-attention' : 'healthy';
  return Object.freeze({ status, items: Object.freeze(items) });
}

function bounded(value: unknown, maximum: number): string {
  if (typeof value !== 'string') return '';
  const printable = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? ' ' : character;
  }).join('');
  return Array.from(printable.replace(/\s+/gu, ' ').trim()).slice(0, maximum).join('');
}

function positiveNumber(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0; }

function stringValue(value: unknown, fallback = ''): string { return typeof value === 'string' ? value : fallback; }

function moduleIdFromEventType(eventType: string): string {
  if (!eventType.startsWith('addon.')) return '';
  const remainder = eventType.slice('addon.'.length);
  const namespaceSeparator = remainder.indexOf('.');
  const eventSeparator = namespaceSeparator < 0 ? -1 : remainder.indexOf('.', namespaceSeparator + 1);
  return eventSeparator < 0 ? '' : remainder.slice(0, eventSeparator);
}

function failedResult(payload: Readonly<Record<string, unknown>>): boolean {
  return payload['success'] === false || payload['succeeded'] === false || payload['status'] === 'failed';
}

function capabilityFailureCount(diagnostics: Readonly<Record<string, unknown>>, moduleIds: readonly string[]): number {
  const modules = recordValue(diagnostics['modules']);
  return moduleIds.reduce((total, moduleId) => total + nonnegativeNumber(recordValue(modules[moduleId])['failed']), 0);
}

function pendingRequestCount(diagnostics: Readonly<Record<string, unknown>>, key: string, moduleIds: readonly string[]): number {
  const requests = recordValue(diagnostics[key]);
  return moduleIds.reduce((total, moduleId) => total + nonnegativeNumber(recordValue(requests[moduleId])['pending']), 0);
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : {}; }

function nonnegativeNumber(value: unknown): number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0; }
