import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type {
  StreamerBotActionSummary,
  StreamerBotCommandSummary,
  StreamerBotInspectionAuditEntry,
} from '../adapters/streamerbot-adapter.js';
import { WizardConfigurationError, type WizardConfigurationDraft, type WizardConfigurationExport, type WizardConfigurationGateway } from './wizard-configuration.js';
import { reconcileCommandSync, type CommandSyncStore } from './command-sync-store.js';
import type { SyncedCommand } from '../contracts/v2/command-sync.js';
import { CORE_CONTRACT_VERSION } from '../contracts/v2/common.js';
import {
  createCommandDesigns,
  findAllCommandCollisions,
  generateCommandsPackage,
  parseCommandDesignsInput,
  InvalidCommandDesignError,
  type BatchCommandCollision,
  type CommandDesign,
} from '../core/command-generation.js';
import {
  createCommandAdministrationRequest,
  parseCommandAdministrationInput,
  type CommandAdministrationRequest,
} from '../core/command-administration.js';
import { rewardAdministrationRequestSchema, type RewardAdministrationRequest } from '../core/reward-administration.js';
import type { AddOnAcceptanceEntry, AddOnWizardService, DiscoveredAddOnSummary, FeatureMigrationCandidate, TrustedAddOnPublisher, WizardAddOnSummary, WizardCommunityAnalyticsIntegration, WizardKofiDonationsIntegration, WizardViewerFoundationIntegration } from './addon-wizard-service.js';
import type { AppliedReleaseUpdate, ReleaseUpdateService, ReleaseUpdateStatus, StagedReleaseUpdate } from './release-update-service.js';
import type { AddOnUpdateService, AddOnUpdateStatus } from './addon-update-service.js';
import { STREAMBRIDGE_VERSION } from '../version.js';
import { REWARD_BLUEPRINTS, REWARD_PLATFORM_POLICY } from '../core/reward-blueprints.js';
import type { StreamerBotLauncherService } from './streamerbot-launcher-service.js';
import type { AutomaticUpdateMonitor } from './automatic-update-monitor.js';
import type { StreamerBotUniversalImportService, UniversalImportCatalogue, UniversalImportResult } from './streamerbot-universal-import-service.js';
import { WebsiteCompanionError, type WebsiteCompanionService, type WebsiteCompanionStatus } from './website-companion-service.js';
import type { LiveAcceptanceConfirmation, LiveAcceptanceService } from './live-acceptance-service.js';
import type { BuildProvenance } from './build-provenance-service.js';
import type { ObsSourceInventoryService } from './obs-source-inventory-service.js';
import type { ReleaseReadinessService } from './release-readiness-service.js';
import type { SceneCatalogService } from './scene-catalog-service.js';
import type { StreamerBotTriggerAssuranceService } from './streamerbot-trigger-assurance-service.js';
import type { OperationalReliabilityService } from './operational-reliability-service.js';
import type { BroadcastConnectionVaultService } from './broadcast-connection-vault-service.js';
import { DirectSceneConnectionError, type DirectSceneConnectionManager } from './direct-scene-connection-manager.js';
import type { ScheduledReliabilityPreflightService } from './scheduled-reliability-preflight-service.js';

export interface StreamerBotInspector {
  inspectActions(): Promise<readonly StreamerBotActionSummary[]>;
  inspectCommands(): Promise<readonly StreamerBotCommandSummary[]>;
  inspectionRequests(): readonly StreamerBotInspectionAuditEntry[];
  // Optional because only the real adapter (never the read-only test fakes most Stage 3/4 tests
  // still use) actually dispatches Tier 1 requests — WizardService treats its absence the same
  // as "Streamer.bot output is not configured" rather than requiring every caller to implement
  // a method they have no way to exercise.
  requestCommandAdministration?(request: CommandAdministrationRequest): Promise<void>;
  requestRewardAdministration?(request: RewardAdministrationRequest): Promise<void>;
}

export interface WizardOwnedObject {
  readonly kind: 'action' | 'command';
  readonly id: string;
  readonly name: string;
  readonly packageId: string;
}

export interface WizardTransaction {
  readonly id: string;
  readonly status: 'draft' | 'cancelled';
  readonly createdAt: string;
  readonly cancelledAt?: string;
  readonly stagedChanges: readonly never[];
}

export interface WizardInspection {
  readonly inspectedAt: string;
  readonly available: boolean;
  readonly actions: readonly (StreamerBotActionSummary & { readonly owned: boolean })[];
  readonly commands: readonly (StreamerBotCommandSummary & { readonly owned: boolean; readonly managed: boolean })[];
  readonly requests: readonly StreamerBotInspectionAuditEntry[];
  readonly error?: string;
}

export interface CommandSyncResult {
  readonly syncedAt: string;
  readonly available: boolean;
  readonly commands: readonly SyncedCommand[];
  readonly error?: string;
}

export interface CommandGenerationResult {
  readonly generatedAt: string;
  readonly available: boolean;
  readonly designs?: readonly CommandDesign[];
  readonly collisions?: readonly BatchCommandCollision[];
  readonly package?: {
    readonly filename: string;
    readonly contentBase64: string;
    readonly commands: readonly { readonly name: string; readonly actionId: string; readonly commandId: string; readonly sourceCode: string }[];
  };
  readonly error?: string;
}

export interface CommandVerificationEntryInput {
  readonly commandId: string;
  readonly name: string;
  readonly aliases?: readonly string[];
}

export interface CommandVerificationResult {
  readonly verifiedAt: string;
  readonly available: boolean;
  readonly verified: boolean;
  readonly verifiedCommandIds?: readonly string[];
  readonly notFoundCommandIds?: readonly string[];
  readonly commands?: readonly SyncedCommand[];
  readonly error?: string;
}

export interface CommandAdministrationResult {
  readonly requestedAt: string;
  readonly available: boolean;
  readonly operation?: 'enable' | 'disable';
  readonly commandId?: string;
  readonly error?: string;
}

export interface RewardAdministrationResult {
  readonly requestedAt: string;
  readonly available: boolean;
  readonly platform?: RewardAdministrationRequest['platform'];
  readonly operation?: RewardAdministrationRequest['operation'];
  readonly rewardId?: string;
  readonly error?: string;
}

const PACKAGE_OWNERSHIP: readonly WizardOwnedObject[] = [
  { kind: 'action', id: '143fce1d-c5b0-4108-b766-ee2d0249e2d4', name: 'THSV StreamBridge - Receive Event', packageId: 'core-receiver' },
  { kind: 'action', id: '99e202ab-0ee9-58d1-b22c-95b30fdc702e', name: 'THSV StreamBridge - Multi-Chat', packageId: 'multi-chat' },
  { kind: 'action', id: '9481fb18-98a4-5db2-b826-d89db463f490', name: 'THSV StreamBridge - Multi-Commands', packageId: 'multi-commands' },
  { kind: 'action', id: '2a52e02b-fefe-5c89-8aeb-067aa773d621', name: 'THSV StreamBridge - Multi-Alerts', packageId: 'multi-alerts' },
  { kind: 'action', id: 'f021d77f-7eb8-55d8-87dd-d681c439dfef', name: 'THSV StreamBridge - Multi-Timed Actions', packageId: 'multi-timed-actions' },
  { kind: 'action', id: '7d107c29-1127-5bb1-ae8b-6f04d89a71d4', name: 'THSV StreamBridge - Send Timed Message', packageId: 'timed-message-output' },
  { kind: 'action', id: '5b43c53a-1e4b-5608-b343-5f88c2884677', name: 'THSV Twitch - Intake', packageId: 'native-platform-intake' },
  { kind: 'action', id: '38df4ccc-2d85-5a9d-8fa6-6711f513c2bd', name: 'THSV YouTube - Intake', packageId: 'native-platform-intake' },
  { kind: 'action', id: 'a6b02419-c344-5853-8166-eb6b6adb02d7', name: 'THSV Kick - Intake', packageId: 'native-platform-intake' },
  { kind: 'action', id: '9f37f61d-f2d6-50cc-bbca-3b1d951ef9ee', name: 'THSV TikTok - Chat', packageId: 'tikfinity-intake' },
  { kind: 'action', id: 'ab0e5f0a-e714-516c-82ee-1f476a516f7e', name: 'THSV TikTok - Follow', packageId: 'tikfinity-intake' },
  { kind: 'action', id: '6bd402de-117e-56f4-8855-308e2894e66c', name: 'THSV TikTok - Gift', packageId: 'tikfinity-intake' },
  { kind: 'action', id: 'b2ee7599-75b5-5c88-8ef2-4d715885c610', name: 'THSV TikTok - Like', packageId: 'tikfinity-intake' },
  { kind: 'action', id: '23332128-445d-52ee-837a-0c79579e3c04', name: 'THSV TikTok - Subscription', packageId: 'tikfinity-intake' },
  { kind: 'action', id: '4e9f0946-f33d-5309-b376-a16df5612b32', name: 'THSV StreamBridge - Open Setup Wizard', packageId: 'wizard-launcher' },
  { kind: 'action', id: '04ca0087-578d-5c2e-9e06-249dc072e9f8', name: 'THSV StreamBridge - Command Administration', packageId: 'command-administration' },
  { kind: 'action', id: 'c1d3a9e2-0f4b-4b78-91c2-7a65d8e309f1', name: 'THSV StreamBridge - Reward Administration', packageId: 'reward-administration' },
  { kind: 'action', id: 'f5b716a8-eb6e-54d3-8e25-d7dd80f6baf2', name: 'THSV StreamBridge - Launch Bridge', packageId: 'bridge-launcher' },
  { kind: 'action', id: '8d8e3667-fd96-510f-b2ae-a8affe5b789a', name: 'THSV StreamBridge - Shutdown Bridge', packageId: 'bridge-launcher' },
  { kind: 'action', id: '76bc0f01-c3b5-5a6b-b692-f5aa89d8d803', name: 'THSV StreamBridge - Refresh Scene Catalog', packageId: 'scene-catalog' },
];

export class WizardService {
  private readonly transactions = new Map<string, WizardTransaction>();
  private lastInspection: WizardInspection | undefined;
  private inspectionInFlight: Promise<WizardInspection> | undefined;
  private lastCommandSync: CommandSyncResult | undefined;

  public constructor(
    private readonly inspector: StreamerBotInspector | undefined,
    private readonly configuration?: WizardConfigurationGateway,
    private readonly commandSyncStore?: CommandSyncStore,
    private readonly addOns?: AddOnWizardService,
    private readonly updates?: ReleaseUpdateService,
    private readonly addOnUpdates?: AddOnUpdateService,
    private readonly streamerBotLauncher?: StreamerBotLauncherService,
    private readonly automaticUpdates?: AutomaticUpdateMonitor,
    private readonly universalImports?: StreamerBotUniversalImportService,
    private readonly websiteCompanion?: WebsiteCompanionService,
    private readonly liveAcceptance?: LiveAcceptanceService,
    private readonly obsSourceInventory?: ObsSourceInventoryService,
    private readonly buildProvenance?: BuildProvenance,
    private readonly releaseReadiness?: ReleaseReadinessService,
    private readonly sceneCatalog?: SceneCatalogService,
    private readonly triggerAssurance?: StreamerBotTriggerAssuranceService,
    private readonly operationalReliability?: OperationalReliabilityService,
    private readonly broadcastConnections?: BroadcastConnectionVaultService,
    private readonly directSceneConnections?: DirectSceneConnectionManager,
    private readonly scheduledReliabilityPreflight?: ScheduledReliabilityPreflightService,
    private readonly overlayStatus?: () => Readonly<Record<string, unknown>>,
    private readonly compatibilityFeedStatus?: () => Readonly<Record<string, unknown>>,
    private readonly logLifecycleStatus?: () => Promise<Readonly<Record<string, unknown>>>,
  ) {}

  public async installedStateDrift(): Promise<Readonly<Record<string, unknown>>> {
    if (this.operationalReliability === undefined) throw new WizardTransactionError(503, 'Installed-state drift inspection is unavailable in this installation.');
    return this.operationalReliability.driftStatus();
  }

  public async repairInstalledState(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.operationalReliability === undefined) throw new WizardTransactionError(503, 'Installed-state repair is unavailable in this installation.');
    return this.operationalReliability.repair(input);
  }

  public async runOperationalRehearsal(): Promise<Readonly<Record<string, unknown>>> {
    if (this.operationalReliability === undefined) throw new WizardTransactionError(503, 'Operational rehearsal is unavailable in this installation.');
    return this.operationalReliability.rehearsal();
  }

  public async streamingToolsPreflight(): Promise<Readonly<Record<string, unknown>>> {
    if (this.streamerBotLauncher === undefined) throw new WizardTransactionError(503, 'Streaming-tool preflight is unavailable in this installation.');
    const [launcher, rehearsal, configurationBackups, inspection, installedAddOns] = await Promise.all([
      this.streamerBotLauncher.preflight(),
      this.operationalReliability?.rehearsal() ?? Promise.resolve({ available: false, ready: false, steps: [] }),
      this.configuration?.backups() ?? Promise.resolve({ backups: [] }),
      this.inspect(),
      this.addOns?.list() ?? Promise.resolve([]),
    ]);
    const launcherStatus = launcher['launcher'] as Readonly<Record<string, unknown>>;
    const optionalApps = launcherStatus['optionalApps'] as Readonly<Record<string, Readonly<Record<string, unknown>>>> | undefined;
    const sceneRefreshes = await Promise.all(['obs', 'meld', 'streamlabs'].map(async (provider) => {
      const application = optionalApps?.[provider] ?? {};
      if (application['enabled'] !== true || application['running'] !== true || this.sceneCatalog === undefined) return { provider, attempted: false, reason: application['enabled'] !== true ? 'disabled' : 'not-running' };
      const previous = this.sceneCatalogStatus()['providers'] as Readonly<Record<string, Readonly<Record<string, unknown>>>>;
      const providerState = previous[provider] ?? {};
      const connections = Array.isArray(providerState['connections']) ? providerState['connections'] as readonly unknown[] : [];
      const attempts = Math.max(1, connections.length);
      const results = await Promise.allSettled(Array.from({ length: attempts }, async (_, connectionIndex) => await this.sceneCatalog?.refresh({ provider, connectionIndex })));
      return { provider, attempted: true, refreshed: results.filter((result) => result.status === 'fulfilled').length, failed: results.filter((result) => result.status === 'rejected').length };
    }));
    const sceneCatalog = this.sceneCatalogStatus();
    const providers = sceneCatalog['providers'] as Readonly<Record<string, Readonly<Record<string, unknown>>>> | undefined;
    const broadcastAutomation = Object.fromEntries(['obs', 'meld', 'streamlabs'].map((provider) => {
      const application = optionalApps?.[provider] ?? {};
      const catalog = providers?.[provider] ?? {};
      const connections = Array.isArray(catalog['connections']) ? catalog['connections'] as Readonly<Record<string, unknown>>[] : [];
      const automationReady = connections.some((connection) => connection['complete'] === true && typeof connection['error'] !== 'string' && typeof connection['updatedAt'] === 'string' && Date.now() - Date.parse(connection['updatedAt']) <= 5 * 60_000);
      const enabled = application['enabled'] === true;
      const running = application['running'] === true;
      return [provider, { enabled, running, automationReady, ready: !enabled || running && automationReady, sceneCount: Array.isArray(catalog['scenes']) ? catalog['scenes'].length : 0, source: catalog['source'] ?? 'unavailable', updatedAt: catalog['updatedAt'], detail: !enabled ? 'Automatic startup is off; automation readiness is optional.' : !running ? 'The selected application is not running.' : automationReady ? 'The application is running and its scene automation channel reported within five minutes.' : 'The application is running, but no complete scene automation response was received within five minutes.' }];
    }));
    const requiredBroadcastReady = Object.values(broadcastAutomation).every((value) => (value as Readonly<Record<string, unknown>>)['ready'] === true);
    const broadcastConnectionGate = (this.directSceneConnections?.status()['strictGate'] ?? { enabled: false, ready: true }) as Readonly<Record<string, unknown>>;
    const addOnActionReadiness = await inspectAddOnActionReadiness(installedAddOns, inspection.actions, inspection.available);
    const sceneConfiguration = inspectSceneConfiguration(installedAddOns, sceneCatalog, broadcastAutomation);
    const criticalOverlays = inspectCriticalOverlayReadiness(installedAddOns, this.overlayStatus?.() ?? {});
    const timedActionCanary = inspectTimedActionCanary(rehearsal, inspection.actions, inspection.available);
    const speakerBotReadiness = inspectSpeakerBotReadiness(installedAddOns, optionalApps?.['speakerbot']);
    const endingFlow = endingFlowChecklist(installedAddOns, addOnActionReadiness, sceneConfiguration);
    const ready = launcher['ready'] === true && rehearsal['ready'] === true && requiredBroadcastReady && broadcastConnectionGate['ready'] === true && addOnActionReadiness.ready === true && sceneConfiguration.ready === true && criticalOverlays.ready === true && timedActionCanary.ready === true && speakerBotReadiness.ready === true;
    const coreReady = launcher['ready'] === true && inspection.available;
    const issues = [
      ...(!coreReady ? [{ area: 'core', fix: !inspection.available ? 'Start Streamer.bot, enable its WebSocket server Auto Start, then run the check again.' : 'Open Streaming tools and repair the exact launcher item shown.' }] : []),
      ...(requiredBroadcastReady ? [] : Object.entries(broadcastAutomation).filter(([, value]) => (value as Readonly<Record<string, unknown>>)['ready'] !== true).map(([provider, value]) => { const detail = (value as Readonly<Record<string, unknown>>)['detail']; return { area: provider, fix: typeof detail === 'string' ? detail : 'Start the app and refresh its scenes.' }; })),
      ...(sceneConfiguration.ready === true ? [] : [{ area: 'scenes', fix: 'Open Included features, refresh scenes, and choose a detected exact scene name for each enabled scene feature.' }]),
      ...(addOnActionReadiness.ready === true ? [] : [{ area: 'actions', fix: 'Open Included features and restore the exact missing Streamer.bot action approvals.' }]),
      ...(criticalOverlays.ready === true ? [] : [{ area: 'overlays', fix: 'Open Overlays and connect each enabled critical browser source before going live.' }]),
      ...(timedActionCanary.ready === true ? [] : [{ area: 'timed-actions', fix: 'Open Timed actions, enable at least one valid schedule, then rerun the safe canary.' }]),
      ...(speakerBotReadiness.ready === true ? [] : [{ area: 'speakerbot', fix: typeof speakerBotReadiness.detail === 'string' ? speakerBotReadiness.detail : 'Start Speaker.bot or disable voice delivery in the affected feature.' }]),
    ];
    const compatibilityFeed = this.compatibilityFeedStatus?.() ?? { state: 'embedded', available: false, provenanceVerified: false, installed: [], reason: 'Compatibility feed status is unavailable.' };
    const logLifecycle = await this.logLifecycleStatus?.().catch((error: unknown) => ({ available: false, state: 'unavailable', error: error instanceof Error ? error.message : String(error) })) ?? { available: false, state: 'unavailable' };
    return {
      generatedAt: new Date().toISOString(), mutationFree: true,
      ready,
      readinessSummary: { state: !coreReady ? 'core-needs-attention' : ready ? 'ready-to-stream' : 'optional-attention', coreReady, readyToStream: ready, optionalAttention: coreReady && !ready, issues },
      launcher, rehearsal, configurationBackups, sceneRefreshes, sceneCatalog, broadcastAutomation, broadcastConnectionGate, addOnActionReadiness, sceneConfiguration, criticalOverlays, timedActionCanary, speakerBotReadiness, endingFlow, compatibilityFeed, logLifecycle,
    };
  }

  public async launcherSupportSnapshot(): Promise<Readonly<Record<string, unknown>>> {
    return this.streamerBotLauncher?.supportSnapshot() ?? { available: false };
  }

  public operationalHealth(): Readonly<Record<string, unknown>> {
    return this.operationalReliability?.healthStatus() ?? { available: false, ready: false, error: 'Operational health is unavailable in this installation.' };
  }

  public operationalTimeline(limit?: number): Readonly<Record<string, unknown>> {
    return this.operationalReliability?.timelineStatus(limit) ?? { retainedMinutes: 30, redacted: true, total: 0, events: [] };
  }

  public replayOperationalTimelineEvent(eventId: string, input: unknown): Readonly<Record<string, unknown>> {
    if (this.operationalReliability === undefined) throw new WizardTransactionError(503, 'Operational timeline replay is unavailable in this installation.');
    return this.operationalReliability.replay(eventId, input);
  }

  public latestPostStreamReport(): Readonly<Record<string, unknown>> {
    return this.operationalReliability?.latestReport() ?? { available: false, message: 'Post-stream reports are unavailable in this installation.' };
  }

  public async triggerAssuranceStatus(): Promise<Readonly<Record<string, unknown>>> {
    return this.triggerAssurance?.status() ?? { available: false, ready: false, canSave: false, error: 'Trigger assurance is unavailable in this installation.' };
  }

  public async reconcileStreamerBotTriggers(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.triggerAssurance === undefined) throw new WizardTransactionError(503, 'Trigger assurance is unavailable in this installation.');
    return await this.triggerAssurance.reconcile(input);
  }

  public async streamerBotTriggerBackups(): Promise<Readonly<Record<string, unknown>>> {
    return this.triggerAssurance?.backups() ?? { backups: [] };
  }

  public async restoreStreamerBotTriggerBackup(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.triggerAssurance === undefined) throw new WizardTransactionError(503, 'Trigger assurance is unavailable in this installation.');
    return await this.triggerAssurance.restore(input);
  }

  public liveAcceptanceStatus(): Readonly<Record<string, unknown>> {
    if (this.liveAcceptance === undefined) throw new WizardTransactionError(503, 'Live acceptance tracking is unavailable in this installation.');
    return this.liveAcceptance.status();
  }

  public liveAcceptanceAttentionSummary(): ReturnType<LiveAcceptanceService['attentionSummary']> | undefined {
    return this.liveAcceptance?.attentionSummary();
  }

  public confirmLiveAcceptance(checkId: string, input: unknown): LiveAcceptanceConfirmation {
    if (this.liveAcceptance === undefined) throw new WizardTransactionError(503, 'Live acceptance tracking is unavailable in this installation.');
    return this.liveAcceptance.confirm(checkId, input);
  }

  public setLiveAcceptanceReminder(input: unknown): Readonly<Record<string, unknown>> {
    if (this.liveAcceptance === undefined) throw new WizardTransactionError(503, 'Live acceptance tracking is unavailable in this installation.');
    return this.liveAcceptance.setReminder(input);
  }

  public obsInventoryStatus(overlay?: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    if (this.obsSourceInventory === undefined) return { configured: false, ready: false, requiredCount: 0, readyRequiredCount: 0, sources: [] };
    return this.obsSourceInventory.status(overlay);
  }

  public saveObsInventory(input: unknown, overlay?: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    if (this.obsSourceInventory === undefined) throw new WizardTransactionError(503, 'Expected OBS source inventory is unavailable in this installation.');
    this.obsSourceInventory.replace(input);
    return this.obsSourceInventory.status(overlay);
  }

  public sceneCatalogStatus(): Readonly<Record<string, unknown>> {
    return this.sceneCatalog?.status() ?? { version: 1, refreshAvailable: false, providers: { obs: { scenes: [], connections: [] }, streamlabs: { scenes: [], connections: [] }, meld: { scenes: [], connections: [] } } };
  }

  public async refreshSceneCatalog(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.sceneCatalog === undefined) throw new WizardTransactionError(503, 'Scene catalog is unavailable in this installation.');
    return this.sceneCatalog.refresh(input);
  }

  public broadcastConnectionStatus(): Readonly<Record<string, unknown>> {
    if (this.broadcastConnections === undefined) return { supported: false, credentialProtection: 'unavailable', connections: [], subscriptionsActive: false };
    return { ...this.broadcastConnections.status(), runtime: this.directSceneConnections?.status() ?? { subscriptionsActive: false, connections: [] } };
  }

  public broadcastConnectionMetadataExport(): Readonly<Record<string, unknown>> {
    if (this.broadcastConnections === undefined) throw new WizardTransactionError(503, 'Secure direct broadcast connections are unavailable in this installation.');
    return this.broadcastConnections.exportMetadata();
  }

  public validateBroadcastConnectionMetadataImport(input: unknown): Readonly<Record<string, unknown>> {
    if (this.broadcastConnections === undefined) throw new WizardTransactionError(503, 'Secure direct broadcast connections are unavailable in this installation.');
    return this.broadcastConnections.validateMetadataImport(input);
  }

  public async importBroadcastConnectionMetadata(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const request = approvedLauncherRequest(input);
    if (this.broadcastConnections === undefined || this.directSceneConnections === undefined) throw new WizardTransactionError(503, 'Secure direct broadcast connections are unavailable in this installation.');
    await this.broadcastConnections.importMetadata(request);
    await this.directSceneConnections.reload();
    this.sceneCatalog?.reconcileActiveDirectConnections(await this.directSceneConnections.activeProfiles());
    return this.broadcastConnectionStatus();
  }

  public async saveBroadcastConnection(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const request = approvedLauncherRequest(input);
    if (this.broadcastConnections === undefined || this.directSceneConnections === undefined) throw new WizardTransactionError(503, 'Secure direct broadcast connections are unavailable in this installation.');
    const candidate = await this.broadcastConnections.candidate(request);
    const saveTest = candidate.enabled ? await this.directSceneConnections.testCandidate(candidate) : { available: true, skipped: true, message: 'Connection testing was skipped because this profile is disabled.' };
    if (saveTest['available'] !== true) throw new DirectSceneConnectionError(400, `The proposed connection was not saved. ${typeof saveTest['message'] === 'string' ? saveTest['message'] : 'Its native test failed.'}`);
    await this.broadcastConnections.save({ ...request, id: candidate.id }, candidate.hasCredential && saveTest['skipped'] !== true ? new Date().toISOString() : undefined);
    await this.directSceneConnections.reload();
    this.sceneCatalog?.reconcileActiveDirectConnections(await this.directSceneConnections.activeProfiles());
    return { ...this.broadcastConnectionStatus(), saveTest };
  }

  public async removeBroadcastConnection(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const request = approvedLauncherRequest(input);
    if (this.broadcastConnections === undefined || this.directSceneConnections === undefined) throw new WizardTransactionError(503, 'Secure direct broadcast connections are unavailable in this installation.');
    await this.broadcastConnections.remove(request);
    await this.directSceneConnections.reload();
    this.sceneCatalog?.reconcileActiveDirectConnections(await this.directSceneConnections.activeProfiles());
    return this.broadcastConnectionStatus();
  }

  public async testBroadcastConnection(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.directSceneConnections === undefined) throw new WizardTransactionError(503, 'Direct broadcast connection testing is unavailable in this installation.');
    return this.directSceneConnections.test(input);
  }

  public async discoverBroadcastConnections(input?: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.directSceneConnections === undefined) throw new WizardTransactionError(503, 'Direct broadcast endpoint discovery is unavailable in this installation.');
    return await this.directSceneConnections.discover(input);
  }

  public async broadcastConnectionAssistant(): Promise<Readonly<Record<string, unknown>>> {
    if (this.directSceneConnections === undefined) throw new WizardTransactionError(503, 'Broadcast connection conflict assistance is unavailable in this installation.');
    return await this.directSceneConnections.conflictAssistant();
  }
  public async suggestBroadcastConnectionPorts(input: unknown): Promise<Readonly<Record<string, unknown>>> { if (this.directSceneConnections === undefined) throw new WizardTransactionError(503, 'Unused-port suggestions are unavailable in this installation.'); return await this.directSceneConnections.suggestUnusedPorts(input); }

  public async approveBroadcastAcceptanceBaseline(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const request = approvedLauncherRequest(input);
    if (this.directSceneConnections === undefined) throw new WizardTransactionError(503, 'Broadcast acceptance baselines are unavailable in this installation.');
    return await this.directSceneConnections.approveAcceptanceBaseline(request);
  }

  public async saveBroadcastReliabilityPolicy(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const request = approvedLauncherRequest(input);
    if (this.broadcastConnections === undefined) throw new WizardTransactionError(503, 'Broadcast reliability policy is unavailable in this installation.');
    await this.broadcastConnections.saveReliabilityPolicy(request);
    return this.broadcastConnectionStatus();
  }

  public async setBroadcastConnectionMaintenance(input: unknown): Promise<Readonly<Record<string, unknown>>> { const request = approvedLauncherRequest(input); if (this.broadcastConnections === undefined || this.directSceneConnections === undefined) throw new WizardTransactionError(503, 'Connection maintenance controls are unavailable in this installation.'); await this.broadcastConnections.setMaintenance(request); await this.directSceneConnections.reload(); return this.broadcastConnectionStatus(); }
  public async cloneBroadcastConnection(input: unknown): Promise<Readonly<Record<string, unknown>>> { const request = approvedLauncherRequest(input); if (this.broadcastConnections === undefined || this.directSceneConnections === undefined) throw new WizardTransactionError(503, 'Guided profile cloning is unavailable in this installation.'); await this.broadcastConnections.cloneProfile(request); await this.directSceneConnections.reload(); this.sceneCatalog?.reconcileActiveDirectConnections(await this.directSceneConnections.activeProfiles()); return this.broadcastConnectionStatus(); }
  public scheduledReliabilityPreflightStatus(): Readonly<Record<string, unknown>> { return this.scheduledReliabilityPreflight?.status() ?? { schedule: { enabled: false, usualStreamTime: '19:00', leadMinutes: 30, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }, history: [], mutationFree: true, available: false }; }
  public async saveScheduledReliabilityPreflight(input: unknown): Promise<Readonly<Record<string, unknown>>> { if (this.scheduledReliabilityPreflight === undefined) throw new WizardTransactionError(503, 'Scheduled reliability preflight is unavailable in this installation.'); return await this.scheduledReliabilityPreflight.save(input); }
  public async runScheduledReliabilityPreflightNow(): Promise<Readonly<Record<string, unknown>>> { if (this.scheduledReliabilityPreflight === undefined) throw new WizardTransactionError(503, 'Scheduled reliability preflight is unavailable in this installation.'); return await this.scheduledReliabilityPreflight.runNow(); }

  public async broadcastReliabilityReport(format: 'json' | 'csv'): Promise<Readonly<Record<string, unknown>>> { const status = this.broadcastConnectionStatus(); const runtime = status['runtime'] as Readonly<Record<string, unknown>> | undefined; const profiles = Array.isArray(runtime?.['connections']) ? runtime['connections'] as Readonly<Record<string, unknown>>[] : []; const acceptance = runtime?.['acceptance'] as Readonly<Record<string, unknown>> | undefined; const latest = acceptance?.['latest'] as Readonly<Record<string, unknown>> | undefined; const results = Array.isArray(latest?.['results']) ? latest['results'] as Readonly<Record<string, unknown>>[] : []; const snapshot = await this.directSceneConnections?.captureReliabilitySnapshot() ?? { comparison: { available: false, summary: 'Reliability history is unavailable.' } }; const report = { format: 'thsv-broadcast-reliability-report-v1', generatedAt: new Date().toISOString(), redacted: true, strictGate: runtime?.['strictGate'], comparison: snapshot['comparison'], profiles: profiles.map((profile) => ({ name: profile['name'], provider: profile['provider'], state: profile['state'], maintenanceUntil: profile['maintenanceUntil'], reconnectCount: profile['reconnectCount'], lastLatencyMs: profile['lastLatencyMs'], reliability: profile['reliability'] })), acceptance: { checkedAt: latest?.['checkedAt'], results: results.map((result) => ({ provider: result['provider'], outcome: result['outcome'], sceneCount: result['sceneCount'], latencyMs: result['latencyMs'] })) } }; const content = format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : reliabilityCsv(report.profiles); return { filename: `thsv-broadcast-reliability-${new Date().toISOString().replaceAll(/[:.]/gu, '-')}.${format}`, mimeType: format === 'json' ? 'application/json' : 'text/csv', contentBase64: Buffer.from(content, 'utf8').toString('base64'), redacted: true, comparison: snapshot['comparison'] }; }

  public broadcastReliabilityHistory(): Readonly<Record<string, unknown>> { return this.directSceneConnections?.reliabilityHistory() ?? { redacted: true, snapshotCount: 0, snapshots: [] }; }

  public async trayNotificationHistory(): Promise<Readonly<Record<string, unknown>>> { return await this.streamerBotLauncher?.trayNotificationHistory() ?? { entries: [] }; }
  public async recordTrayNotification(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const request = approvedLauncherRequest(input);
    if (this.streamerBotLauncher === undefined) throw new WizardTransactionError(503, 'Tray notification history is unavailable in this installation.');
    return await this.streamerBotLauncher.recordTrayNotification(request);
  }

  public async acceptInstalledBroadcastVendors(): Promise<Readonly<Record<string, unknown>>> {
    if (this.directSceneConnections === undefined || this.streamerBotLauncher === undefined) throw new WizardTransactionError(503, 'Installed broadcast vendor acceptance is unavailable in this installation.');
    const launcher = await this.streamerBotLauncher.status(); const profiles = await this.directSceneConnections.activeProfiles(); const results: Readonly<Record<string, unknown>>[] = [];
    for (const provider of ['obs', 'meld', 'streamlabs'] as const) {
      const application = launcher.optionalApps[provider]; const selected = profiles.filter((profile) => profile.provider === provider);
      if (!application.configured || !application.executableExists) { results.push({ provider, outcome: 'not-installed', message: `${application.label} has no valid executable selected.` }); continue; }
      if (!application.running) { results.push({ provider, outcome: application.state === 'different-installation-running' ? 'different-installation-running' : 'not-running', expectedExecutable: application.executable === undefined ? undefined : basename(application.executable), differentInstallationProcessId: application.differentInstallationProcessId, message: application.message }); continue; }
      if (selected.length === 0) { results.push({ provider, outcome: 'no-profile', processId: application.processId, message: `${application.label} is running, but no enabled native profile is available.` }); continue; }
      const tested = await this.directSceneConnections.test({ provider, connectionIndex: 0 }); results.push({ provider, outcome: tested['available'] === true ? 'passed' : 'failed', processId: application.processId, executable: application.executable === undefined ? undefined : basename(application.executable), sceneCount: tested['sceneCount'], latencyMs: tested['latencyMs'], message: tested['message'] });
    }
    const history = await this.directSceneConnections.recordAcceptance(results);
    return { checkedAt: new Date().toISOString(), mutationFree: true, results, history };
  }

  public provenance(): Readonly<BuildProvenance> | Readonly<Record<string, unknown>> {
    return this.buildProvenance ?? { version: STREAMBRIDGE_VERSION, coreContractVersion: CORE_CONTRACT_VERSION, installation: 'local-development' };
  }

  public async releaseReadinessStatus(refresh = false): Promise<Readonly<Record<string, unknown>>> {
    if (this.releaseReadiness === undefined) throw new WizardTransactionError(503, 'Release readiness is unavailable in this installation.');
    return this.releaseReadiness.status(refresh);
  }

  public async websiteCompanionStatus(): Promise<WebsiteCompanionStatus> {
    if (this.websiteCompanion === undefined) throw new WizardTransactionError(503, 'Website pairing is unavailable in this installation. Repair or update StreamBridge.');
    return this.websiteCompanion.status();
  }

  public async startWebsitePairing(): Promise<WebsiteCompanionStatus> {
    if (this.websiteCompanion === undefined) throw new WizardTransactionError(503, 'Website pairing is unavailable in this installation. Repair or update StreamBridge.');
    try { return await this.websiteCompanion.start(STREAMBRIDGE_VERSION); }
    catch (error) { throw websiteCompanionWizardError(error); }
  }

  public async checkWebsitePairing(): Promise<WebsiteCompanionStatus> {
    if (this.websiteCompanion === undefined) throw new WizardTransactionError(503, 'Website pairing is unavailable in this installation. Repair or update StreamBridge.');
    try { return await this.websiteCompanion.check(); }
    catch (error) { throw websiteCompanionWizardError(error); }
  }

  public async disconnectWebsiteCompanion(): Promise<WebsiteCompanionStatus> {
    if (this.websiteCompanion === undefined) throw new WizardTransactionError(503, 'Website pairing is unavailable in this installation. Repair or update StreamBridge.');
    try { return await this.websiteCompanion.disconnect(); }
    catch (error) { throw websiteCompanionWizardError(error); }
  }

  public async publishWebsiteConfiguration(): Promise<Readonly<{ saved: true; savedAt: string }>> {
    if (this.websiteCompanion === undefined) throw new WizardTransactionError(503, 'Website pairing is unavailable in this installation. Repair or update StreamBridge.');
    if (this.configuration === undefined) throw new WizardTransactionError(409, 'Configuration export is not available.');
    try { return await this.websiteCompanion.pushConfiguration(await this.configuration.export()); }
    catch (error) { throw websiteCompanionWizardError(error); }
  }

  public async stageWebsiteConfigurationDraft(leaseOwner = ''): Promise<WizardConfigurationDraft> {
    if (this.websiteCompanion === undefined) throw new WizardTransactionError(503, 'Website pairing is unavailable in this installation. Repair or update StreamBridge.');
    if (this.configuration === undefined) throw new WizardTransactionError(409, 'Configuration mutations are not available.');
    try {
      const websiteDraft = await this.websiteCompanion.pullDraft();
      if (websiteDraft === null) throw new WizardTransactionError(404, 'No website draft is waiting. Save a draft on SlothBloom, then try again.');
      const localDraft = await this.configuration.begin(leaseOwner);
      try { return this.configuration.stageImport(localDraft.id, websiteDraft.configuration, leaseOwner); }
      catch (error) { this.configuration.cancel(localDraft.id, leaseOwner); throw error; }
    } catch (error) {
      if (error instanceof WizardTransactionError || error instanceof WizardConfigurationError) throw error;
      throw websiteCompanionWizardError(error);
    }
  }

  public async streamerBotImportCatalogue(): Promise<UniversalImportCatalogue> {
    if (this.universalImports === undefined) throw new WizardTransactionError(503, 'Universal Streamer.bot import generation is unavailable in this installation. Repair or update StreamBridge.');
    return this.universalImports.catalogue(await this.listAddOns());
  }

  public async generateStreamerBotImport(input: unknown): Promise<UniversalImportResult> {
    if (this.universalImports === undefined) throw new WizardTransactionError(503, 'Universal Streamer.bot import generation is unavailable in this installation. Repair or update StreamBridge.');
    if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new WizardTransactionError(400, 'Choose at least one feature before creating the Streamer.bot import.');
    const selected = (input as Record<string, unknown>)['packages'];
    if (!Array.isArray(selected) || selected.some((value) => typeof value !== 'string')) throw new WizardTransactionError(400, 'The selected Streamer.bot feature list is invalid. Refresh the wizard and try again.');
    try { return await this.universalImports.build(selected as string[], await this.listAddOns()); }
    catch (error) { throw new WizardTransactionError(400, error instanceof Error ? error.message : String(error)); }
  }

  public async overview(): Promise<Readonly<Record<string, unknown>>> {
    return {
      version: STREAMBRIDGE_VERSION,
      contractVersion: CORE_CONTRACT_VERSION,
      stage: 8,
      mode: this.configuration === undefined ? 'read-only-inspection' : 'configuration-management',
      authenticated: true,
      mutationSupport: this.configuration !== undefined,
      navigation: ['Overview', 'Platforms', 'Streamer.bot', 'Commands', 'Timed Actions', 'Chat Overlay', 'Alerts', 'Viewer Foundation', 'Community Analytics', 'Extensions', 'Add-ons', 'Blockers', 'Ownership', 'Diagnostics'],
      ownership: PACKAGE_OWNERSHIP,
      rewardManifest: { platforms: REWARD_PLATFORM_POLICY, blueprints: REWARD_BLUEPRINTS },
      transactions: this.configuration === undefined ? [...this.transactions.values()] : (this.configuration.diagnostics()['transactions'] ?? []),
      lastInspection: this.lastInspection,
      lastCommandSync: this.lastCommandSync,
      automaticUpdates: this.automaticUpdates?.snapshot(),
      ...(this.configuration === undefined ? {} : { configuration: await this.configuration.snapshot() }),
    };
  }

  public async configurationActivation(): Promise<Readonly<{ state: string; restartRequired: boolean; activatedAt?: string }>> {
    if (this.configuration === undefined) return { state: 'unavailable', restartRequired: false };
    return this.configuration.activationStatus();
  }

  public inspect(): Promise<WizardInspection> {
    if (this.inspectionInFlight !== undefined) return this.inspectionInFlight;
    const pending = this.performInspection();
    this.inspectionInFlight = pending;
    void pending.finally(() => {
      if (this.inspectionInFlight === pending) this.inspectionInFlight = undefined;
    }).catch(() => {});
    return pending;
  }

  private async performInspection(): Promise<WizardInspection> {
    if (this.inspector === undefined) {
      const result: WizardInspection = {
        inspectedAt: new Date().toISOString(), available: false, actions: [], commands: [], requests: [], error: 'Streamer.bot output is not configured.',
      };
      this.lastInspection = result;
      return result;
    }
    try {
      const [actions, commands, commandSyncState] = await Promise.all([
        this.inspector.inspectActions(),
        this.inspector.inspectCommands(),
        this.commandSyncStore?.load() ?? Promise.resolve(undefined),
      ]);
      const managedCommandIds = new Set(commandSyncState?.commands.map((command) => command.streamerBotId) ?? []);
      const result: WizardInspection = {
        inspectedAt: new Date().toISOString(),
        available: true,
        actions: actions.map((action) => ({ ...action, owned: isOwned('action', action.id, action.name) })),
        commands: commands.map((command) => ({
          ...command,
          owned: isOwned('command', command.id, command.name),
          managed: managedCommandIds.has(command.id),
        })),
        requests: this.inspector.inspectionRequests(),
      };
      this.lastInspection = result;
      return result;
    } catch (error) {
      const result: WizardInspection = {
        inspectedAt: new Date().toISOString(), available: false, actions: [], commands: [], requests: this.inspector.inspectionRequests(), error: error instanceof Error ? error.message : String(error),
      };
      this.lastInspection = result;
      return result;
    }
  }

  // Reconciles the bridge's command mirror against a fresh live inspection. This never adds an
  // entry for a command the mirror was not already tracking (framework or wizard-generated) —
  // Streamer.bot stays the sole source of truth for what commands exist, this only updates the
  // bridge's own record of the ones it has a reason to track.
  public async syncCommands(): Promise<CommandSyncResult> {
    if (this.inspector === undefined || this.commandSyncStore === undefined) {
      const result: CommandSyncResult = {
        syncedAt: new Date().toISOString(), available: false, commands: [],
        error: 'Command sync requires both Streamer.bot output and command sync storage to be configured.',
      };
      this.lastCommandSync = result;
      return result;
    }
    try {
      const [observed, state] = await Promise.all([this.inspector.inspectCommands(), this.commandSyncStore.load()]);
      const now = new Date().toISOString();
      const reconciled = reconcileCommandSync(state.commands, observed, now);
      this.commandSyncStore.scheduleSave({ version: 1, commands: reconciled });
      const result: CommandSyncResult = { syncedAt: now, available: true, commands: reconciled };
      this.lastCommandSync = result;
      return result;
    } catch (error) {
      const result: CommandSyncResult = { syncedAt: new Date().toISOString(), available: false, commands: [], error: error instanceof Error ? error.message : String(error) };
      this.lastCommandSync = result;
      return result;
    }
  }

  // Tier 2: generate-and-verify, for command creation and deletion that no documented
  // Streamer.bot API level (C# or WebSocket) supports. Always runs a fresh live collision check
  // immediately before generating anything — a batch is never generated against a stale
  // inspection from an earlier call. The whole batch is rejected if any design collides (with
  // live Streamer.bot state, or with another design in the same batch) — a partially-generated
  // batch would be confusing to reason about, so the creator fixes the offending name(s) and
  // resubmits the whole batch rather than getting a package with some designs silently dropped.
  public async generateCommands(input: unknown): Promise<CommandGenerationResult> {
    const generatedAt = new Date().toISOString();
    if (this.inspector === undefined) {
      return { generatedAt, available: false, error: 'Command generation requires Streamer.bot output to be configured for a fresh collision check.' };
    }
    let designs: readonly CommandDesign[];
    try {
      designs = createCommandDesigns(parseCommandDesignsInput(input));
    } catch (error) {
      return { generatedAt, available: false, error: error instanceof Error ? error.message : String(error) };
    }
    try {
      const [actions, commands, prefix] = await Promise.all([
        this.inspector.inspectActions(),
        this.inspector.inspectCommands(),
        this.configuration?.commandPrefix() ?? Promise.resolve('!'),
      ]);
      const collisions = findAllCommandCollisions(designs, { actions, commands });
      if (collisions.length > 0) return { generatedAt, available: true, designs, collisions };
      const generated = generateCommandsPackage(designs, prefix);
      return {
        generatedAt,
        available: true,
        designs,
        package: { filename: generated.filename, contentBase64: generated.contentBase64, commands: generated.commands },
      };
    } catch (error) {
      return { generatedAt, available: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  // The wizard never marks a generated command as owned or synced until this re-inspects and
  // confirms the generated ID is actually present in Streamer.bot. Entries that aren't found yet
  // are simply left unverified — nothing is persisted for them — so a partially-completed import
  // (some commands bound and enabled, others not yet) is handled correctly: whatever is
  // confirmed live gets tracked, whatever isn't stays untouched until the creator checks again.
  public async verifyGeneratedCommands(rawInput: unknown): Promise<CommandVerificationResult> {
    const verifiedAt = new Date().toISOString();
    if (this.inspector === undefined || this.commandSyncStore === undefined) {
      return { verifiedAt, available: false, verified: false, error: 'Command verification requires both Streamer.bot output and command sync storage to be configured.' };
    }
    let inputs: readonly CommandVerificationEntryInput[];
    try {
      inputs = parseCommandVerificationInputs(rawInput);
    } catch (error) {
      return { verifiedAt, available: false, verified: false, error: error instanceof Error ? error.message : String(error) };
    }
    try {
      const observed = await this.inspector.inspectCommands();
      const state = await this.commandSyncStore.load();
      const verifiedCommandIds: string[] = [];
      const notFoundCommandIds: string[] = [];
      const verifiedEntries = new Map<string, SyncedCommand>();
      for (const input of inputs) {
        const found = observed.find((command) => command.id === input.commandId);
        if (found === undefined) {
          notFoundCommandIds.push(input.commandId);
          continue;
        }
        verifiedCommandIds.push(input.commandId);
        verifiedEntries.set(input.commandId, {
          contractVersion: CORE_CONTRACT_VERSION,
          streamerBotId: input.commandId,
          name: found.name,
          aliases: [...(input.aliases ?? [])],
          source: 'wizard-generated',
          lastSeenAt: verifiedAt,
          driftStatus: found.name === input.name ? 'in-sync' : 'renamed',
        });
      }
      const commands = [...state.commands.filter((existing) => !verifiedEntries.has(existing.streamerBotId)), ...verifiedEntries.values()];
      if (verifiedEntries.size > 0) {
        this.commandSyncStore.scheduleSave({ version: 1, commands });
        this.lastCommandSync = { syncedAt: verifiedAt, available: true, commands };
      }
      return { verifiedAt, available: true, verified: verifiedEntries.size > 0, verifiedCommandIds, notFoundCommandIds, commands };
    } catch (error) {
      return { verifiedAt, available: false, verified: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  // Tier 1: live enable/disable via the documented C# CPH.EnableCommand/DisableCommand methods,
  // dispatched through the reviewed Command Administration package (see
  // packages/streamerbot/command-administration). The creator-approval gate is enforced inside
  // createCommandAdministrationRequest itself, before this ever reaches the adapter. The command
  // must also be present in the persisted sync mirror, so inventory inspection cannot turn this
  // into a general-purpose control for unrelated creator commands.
  public async administerCommand(input: unknown): Promise<CommandAdministrationResult> {
    const requestedAt = new Date().toISOString();
    if (this.inspector === undefined || this.inspector.requestCommandAdministration === undefined) {
      return { requestedAt, available: false, error: 'Command administration requires Streamer.bot output to be configured.' };
    }
    let request: CommandAdministrationRequest;
    try {
      request = createCommandAdministrationRequest(parseCommandAdministrationInput(input));
    } catch (error) {
      return { requestedAt, available: false, error: error instanceof Error ? error.message : String(error) };
    }
    try {
      if (this.commandSyncStore === undefined) {
        return { requestedAt, available: false, error: 'Command administration requires command sync storage to verify ownership.' };
      }
      const state = await this.commandSyncStore.load();
      if (!state.commands.some((command) => command.streamerBotId === request.commandId)) {
        return { requestedAt, available: false, error: 'Command administration is limited to commands tracked by THSV StreamBridge.' };
      }
      await this.inspector.requestCommandAdministration(request);
      return { requestedAt, available: true, operation: request.operation, commandId: request.commandId };
    } catch (error) {
      return { requestedAt, available: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  public async administerReward(input: unknown): Promise<RewardAdministrationResult> {
    const requestedAt = new Date().toISOString();
    if (this.inspector?.requestRewardAdministration === undefined) return { requestedAt, available: false, error: 'Reward administration requires Streamer.bot output and the reviewed Reward Administration package.' };
    const parsed = rewardAdministrationRequestSchema.safeParse(input);
    if (!parsed.success) return { requestedAt, available: false, error: parsed.error.issues.map((issue) => issue.message).join(' ') };
    try {
      await this.inspector.requestRewardAdministration(parsed.data);
      return { requestedAt, available: true, platform: parsed.data.platform, operation: parsed.data.operation, rewardId: parsed.data.rewardId };
    } catch (error) {
      return { requestedAt, available: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  public async beginTransaction(leaseOwner = ''): Promise<WizardTransaction | WizardConfigurationDraft> {
    if (this.configuration !== undefined) return this.configuration.begin(leaseOwner);
    const transaction: WizardTransaction = { id: randomUUID(), status: 'draft', createdAt: new Date().toISOString(), stagedChanges: [] };
    this.transactions.set(transaction.id, transaction);
    return transaction;
  }

  public cancelTransaction(id: string,leaseOwner = ''): WizardTransaction | WizardConfigurationDraft {
    if (this.configuration !== undefined) return this.configuration.cancel(id,leaseOwner);
    const current = this.transactions.get(id);
    if (current === undefined) throw new WizardTransactionError(404, 'Wizard transaction was not found.');
    if (current.status === 'cancelled') return current;
    const cancelled: WizardTransaction = { ...current, status: 'cancelled', cancelledAt: new Date().toISOString(), stagedChanges: [] };
    this.transactions.set(id, cancelled);
    return cancelled;
  }

  public stageTransaction(id: string, change: unknown,leaseOwner = ''): WizardConfigurationDraft {
    if (this.configuration === undefined) throw new WizardTransactionError(409, 'Configuration mutations are not available.');
    return this.configuration.stage(id, change,leaseOwner);
  }

  public stageImport(id: string, input: unknown,leaseOwner = ''): WizardConfigurationDraft {
    if (this.configuration === undefined) throw new WizardTransactionError(409, 'Configuration mutations are not available.');
    return this.configuration.stageImport(id, input,leaseOwner);
  }

  public async commitTransaction(id: string,leaseOwner = ''): Promise<WizardConfigurationDraft> {
    if (this.configuration === undefined) throw new WizardTransactionError(409, 'Configuration mutations are not available.');
    return this.configuration.commit(id,leaseOwner);
  }

  public async exportConfiguration(): Promise<WizardConfigurationExport> {
    if (this.configuration === undefined) throw new WizardTransactionError(409, 'Configuration export is not available.');
    return this.configuration.export();
  }

  public async configurationBackups(): Promise<Readonly<Record<string, unknown>>> {
    if (this.configuration === undefined) throw new WizardTransactionError(409, 'Configuration backups are unavailable.');
    return this.configuration.backups();
  }

  public async restoreConfigurationBackup(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.configuration === undefined) throw new WizardTransactionError(409, 'Configuration restore is unavailable.');
    return this.configuration.restoreBackup(input);
  }

  public async streamerBotLauncherStatus(): Promise<Readonly<Record<string, unknown>>> {
    if (this.streamerBotLauncher === undefined) throw new WizardTransactionError(503, 'Safe Streamer.bot launch is not configured.');
    return { ...await this.streamerBotLauncher.status() };
  }

  public async detectStreamerBotLauncher(): Promise<Readonly<Record<string, unknown>>> {
    if (this.streamerBotLauncher === undefined) throw new WizardTransactionError(503, 'Safe Streamer.bot launch is not configured.');
    return this.streamerBotLauncher.detect();
  }

  public async saveStreamerBotLauncher(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const request = approvedLauncherRequest(input);
    if (this.streamerBotLauncher === undefined) throw new WizardTransactionError(503, 'Safe Streamer.bot launch is not configured.');
    if (typeof request['executable'] !== 'string' || request['executable'].trim().length === 0) throw new WizardTransactionError(400, 'A Streamer.bot.exe path is required.');
    return { ...await this.streamerBotLauncher.save(request['executable']) };
  }

  public async chooseStreamerBotLauncher(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    approvedLauncherRequest(input);
    if (this.streamerBotLauncher === undefined) throw new WizardTransactionError(503, 'Safe Streamer.bot launch is not configured.');
    return { ...await this.streamerBotLauncher.choose() };
  }

  public async saveOptionalStreamingApplication(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const request = approvedLauncherRequest(input);
    if (this.streamerBotLauncher === undefined) throw new WizardTransactionError(503, 'Safe Streamer.bot launch is not configured.');
    const application = optionalStreamingApplication(request['application']);
    if (typeof request['executable'] !== 'string' || request['executable'].trim().length === 0) throw new WizardTransactionError(400, 'An application executable path is required.');
    return { ...await this.streamerBotLauncher.saveOptionalApplication(application, request['executable'], request['enabled'] !== false) };
  }

  public async chooseOptionalStreamingApplication(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const request = approvedLauncherRequest(input);
    if (this.streamerBotLauncher === undefined) throw new WizardTransactionError(503, 'Safe Streamer.bot launch is not configured.');
    return { ...await this.streamerBotLauncher.chooseOptionalApplication(optionalStreamingApplication(request['application'])) };
  }

  public async enableOptionalStreamingApplication(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const request = approvedLauncherRequest(input);
    if (this.streamerBotLauncher === undefined) throw new WizardTransactionError(503, 'Safe Streamer.bot launch is not configured.');
    if (typeof request['enabled'] !== 'boolean') throw new WizardTransactionError(400, 'enabled must be true or false.');
    return { ...await this.streamerBotLauncher.setOptionalApplicationEnabled(optionalStreamingApplication(request['application']), request['enabled']) };
  }

  public async resetOptionalStreamingApplicationCircuit(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const request = approvedLauncherRequest(input);
    if (this.streamerBotLauncher === undefined) throw new WizardTransactionError(503, 'Safe Streamer.bot launch is not configured.');
    return { ...await this.streamerBotLauncher.resetOptionalApplicationCircuit(optionalStreamingApplication(request['application'])) };
  }

  public async startStreamerBotSafely(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    approvedLauncherRequest(input);
    if (this.streamerBotLauncher === undefined) throw new WizardTransactionError(503, 'Safe Streamer.bot launch is not configured.');
    return this.streamerBotLauncher.start();
  }

  public async startAllStreamingTools(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    approvedLauncherRequest(input);
    if (this.streamerBotLauncher === undefined) throw new WizardTransactionError(503, 'Safe Streamer.bot launch is not configured.');
    return this.streamerBotLauncher.startAllStreamingTools();
  }

  public async restartStreamBridge(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    approvedLauncherRequest(input);
    if (this.streamerBotLauncher === undefined) throw new WizardTransactionError(503, 'Safe StreamBridge restart is not configured.');
    return this.streamerBotLauncher.restartStreamBridge();
  }

  public async createStreamerBotDesktopShortcut(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    approvedLauncherRequest(input);
    if (this.streamerBotLauncher === undefined) throw new WizardTransactionError(503, 'Safe Streamer.bot launch is not configured.');
    return this.streamerBotLauncher.createDesktopShortcut();
  }

  public openStreamBridgeInstallFolder(input: unknown): Readonly<Record<string, unknown>> {
    approvedLauncherRequest(input);
    if (this.streamerBotLauncher === undefined) throw new WizardTransactionError(503, 'Safe Streamer.bot launch is not configured.');
    return this.streamerBotLauncher.openInstallFolder();
  }

  public async listAddOns(): Promise<readonly WizardAddOnSummary[]> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Add-on management is not configured.');
    return this.addOns.list();
  }

  public async viewerFoundation(): Promise<WizardViewerFoundationIntegration> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Viewer Foundation management is not configured.');
    return this.addOns.viewerFoundation();
  }

  public async saveViewerFoundationSettings(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Viewer Foundation management is not configured.');
    return this.addOns.saveViewerFoundationSettings(input);
  }

  public async communityAnalytics(): Promise<WizardCommunityAnalyticsIntegration> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Community Analytics management is not configured.');
    return this.addOns.communityAnalytics();
  }

  public async saveCommunityAnalyticsSettings(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Community Analytics management is not configured.');
    return this.addOns.saveCommunityAnalyticsSettings(input);
  }

  public async kofiDonations(): Promise<WizardKofiDonationsIntegration> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Ko-fi Donations management is not configured.');
    return this.addOns.kofiDonations();
  }

  public async saveKofiDonationsSettings(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Ko-fi Donations management is not configured.');
    return this.addOns.saveKofiDonationsSettings(input);
  }

  public async listFeatureMigrations(): Promise<readonly FeatureMigrationCandidate[]> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Add-on management is not configured.');
    return this.addOns.listFeatureMigrations();
  }

  public async applyFeatureMigration(moduleId: string, input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Add-on management is not configured.');
    return this.addOns.applyFeatureMigration(moduleId, input);
  }

  public async discoverAddOns(): Promise<readonly DiscoveredAddOnSummary[]> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Add-on management is not configured.');
    return this.addOns.discover();
  }

  public async installDiscoveredAddOn(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Add-on management is not configured.');
    return this.addOns.installDiscovered(input);
  }

  public async checkForUpdates(): Promise<ReleaseUpdateStatus> {
    if (this.updates === undefined) throw new WizardTransactionError(503, 'Release update checks are not configured.');
    return this.updates.check(true);
  }

  public async stageReleaseUpdate(input: unknown): Promise<StagedReleaseUpdate> {
    if (this.updates === undefined) throw new WizardTransactionError(503, 'Release update checks are not configured.');
    return this.updates.stage(input);
  }

  public async applyReleaseUpdate(input: unknown): Promise<AppliedReleaseUpdate> {
    if (this.updates === undefined) throw new WizardTransactionError(503, 'Release updates are not configured.');
    return this.updates.apply(input);
  }

  public async checkForAddOnUpdates(): Promise<AddOnUpdateStatus> {
    if (this.addOns === undefined || this.addOnUpdates === undefined) throw new WizardTransactionError(503, 'Add-on update checks are not configured.');
    return this.addOnUpdates.check(await this.addOns.list(), true);
  }

  public async stageAddOnUpdate(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.addOns === undefined || this.addOnUpdates === undefined) throw new WizardTransactionError(503, 'Add-on updates are not configured.');
    const verified = await this.addOnUpdates.stage(await this.addOns.list(), input);
    return this.addOns.stageVerifiedOfficialUpdate(verified);
  }

  public async installAddOnUpdate(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.addOns === undefined || this.addOnUpdates === undefined) throw new WizardTransactionError(503, 'Add-on updates are not configured.');
    const verified = await this.addOnUpdates.stage(await this.addOns.list(), input);
    const staged = await this.addOns.stageVerifiedOfficialUpdate(verified);
    const installed = await this.addOns.installDiscovered({ filename: verified.filename, sha256: verified.sha256, approvedByCreator: true });
    return { ...staged, ...installed, provenance: verified.provenance, updateApplied: true, restartRequired: true };
  }

  public async listTrustedAddOnPublishers(): Promise<readonly TrustedAddOnPublisher[]> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Add-on management is not configured.');
    return this.addOns.listTrustedPublishers();
  }

  public async saveTrustedAddOnPublisher(input: unknown): Promise<TrustedAddOnPublisher> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Add-on management is not configured.');
    return this.addOns.saveTrustedPublisher(input);
  }

  public async removeTrustedAddOnPublisher(publisherId: string, input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Add-on management is not configured.');
    return this.addOns.removeTrustedPublisher(publisherId, input);
  }

  public async checkTrustedPublisherAddOnUpdates(input: unknown): Promise<AddOnUpdateStatus> {
    if (this.addOns === undefined || this.addOnUpdates === undefined) throw new WizardTransactionError(503, 'Add-on updates are not configured.');
    const publisher = await this.trustedPublisherFromInput(input, false);
    const installed = (await this.addOns.list()).filter((addOn) => addOn.trust.publisherId === publisher.publisherId);
    if (installed.length === 0) throw new WizardTransactionError(404, 'No installed add-ons declare this trusted publisher ID.');
    return this.addOnUpdates.forRepository(publisher.repository).check(installed);
  }

  public async stageTrustedPublisherAddOnUpdate(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.addOns === undefined || this.addOnUpdates === undefined) throw new WizardTransactionError(503, 'Add-on updates are not configured.');
    const publisher = await this.trustedPublisherFromInput(input, true);
    const installed = (await this.addOns.list()).filter((addOn) => addOn.trust.publisherId === publisher.publisherId);
    const verified = await this.addOnUpdates.forRepository(publisher.repository).stage(installed, input);
    return this.addOns.stageVerifiedPublisherUpdate(verified, publisher);
  }

  public async installTrustedPublisherAddOnUpdate(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.addOns === undefined || this.addOnUpdates === undefined) throw new WizardTransactionError(503, 'Add-on updates are not configured.');
    const publisher = await this.trustedPublisherFromInput(input, true);
    const installedAddOns = (await this.addOns.list()).filter((addOn) => addOn.trust.publisherId === publisher.publisherId);
    if (installedAddOns.length === 0) throw new WizardTransactionError(404, 'No installed add-ons declare this trusted publisher ID.');
    const verified = await this.addOnUpdates.forRepository(publisher.repository).stage(installedAddOns, input);
    const staged = await this.addOns.stageVerifiedPublisherUpdate(verified, publisher);
    const installed = await this.addOns.installDiscovered({ filename: verified.filename, sha256: verified.sha256, approvedByCreator: true });
    return { ...staged, ...installed, provenance: verified.provenance, updateApplied: true, restartRequired: true };
  }

  private async trustedPublisherFromInput(input: unknown, requireApproval: boolean): Promise<TrustedAddOnPublisher> {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new WizardTransactionError(400, 'Trusted publisher request must be an object.');
    const record = input as Record<string, unknown>;
    if (requireApproval && record['approvedByCreator'] !== true) throw new WizardTransactionError(403, 'Downloading a third-party update requires explicit creator approval.');
    const publisherId = typeof record['publisherId'] === 'string' ? record['publisherId'] : '';
    const publisher = (await this.listTrustedAddOnPublishers()).find((entry) => entry.publisherId === publisherId);
    if (publisher === undefined) throw new WizardTransactionError(404, 'Trusted publisher not found.');
    return publisher;
  }

  public async installAddOn(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Add-on management is not configured.');
    return this.addOns.install(input);
  }

  public async previewAddOnRecovery(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Add-on recovery is not configured.');
    return this.addOns.recoveryPreview(input);
  }

  public async recoverMissingAddOns(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Add-on recovery is not configured.');
    return this.addOns.recoverMissing(input);
  }

  public async setAddOnEnabled(moduleId: string, input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Add-on management is not configured.');
    return this.addOns.setEnabled(moduleId, input);
  }

  public async setFeatureFamilyEnabled(featureId: string, input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Extension management is not configured.');
    return this.addOns.setFeatureFamilyEnabled(featureId, input);
  }

  public async setAddOnApprovedActions(moduleId: string, input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Add-on management is not configured.');
    return this.addOns.setApprovedActions(moduleId, input);
  }

  public async reconcileAddOnActionGrants(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Add-on management is not configured.');
    if (!isRecordValue(input) || input['approvedByCreator'] !== true) throw new WizardTransactionError(403, 'Recovering add-on action approvals requires explicit creator approval.');
    const [installedAddOns, inspection] = await Promise.all([this.addOns.list(), this.inspect()]);
    const readiness = await inspectAddOnActionReadiness(installedAddOns, inspection.actions, inspection.available);
    const missing = (Array.isArray(readiness['actions']) ? readiness['actions'] : []).filter(isRecordValue).filter((action) =>
      action['issue'] === 'Action is not approved for this add-on.' && action['installed'] === true && action['enabled'] === true && action['brokerDispatched'] === true && action['mustRemainTriggerless'] === true && action['triggerless'] === true,
    );
    const plans = [...new Set(missing.map((action) => action['moduleId']).filter((moduleId): moduleId is string => typeof moduleId === 'string'))].map((moduleId) => {
      const addOn = installedAddOns.find((candidate) => candidate.moduleId === moduleId);
      if (addOn === undefined) throw new WizardTransactionError(409, `The ${moduleId} add-on changed during recovery. Refresh and try again.`);
      const addedActionIds = missing.filter((action) => action['moduleId'] === moduleId).map((action) => action['actionId']).filter((actionId): actionId is string => typeof actionId === 'string');
      return { moduleId, before: [...addOn.approvedActionIds], actionIds: [...new Set([...addOn.approvedActionIds, ...addedActionIds])], addedActionIds };
    });
    const changed: typeof plans = [];
    try {
      for (const plan of plans) {
        await this.addOns.setApprovedActions(plan.moduleId, { actionIds: plan.actionIds, approvedByCreator: true });
        changed.push(plan);
      }
    } catch (error) {
      const rollbackErrors: string[] = [];
      for (const plan of changed.toReversed()) {
        try { await this.addOns.setApprovedActions(plan.moduleId, { actionIds: plan.before, approvedByCreator: true }); }
        catch (rollbackError) { rollbackErrors.push(`${plan.moduleId}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`); }
      }
      throw new WizardTransactionError(502, `Add-on action approval recovery failed and ${rollbackErrors.length === 0 ? 'all changes were rolled back' : `rollback needs attention (${rollbackErrors.join('; ')})`}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { recovered: true, changedModules: plans.length, changedActions: plans.reduce((total, plan) => total + plan.addedActionIds.length, 0), restartRequired: plans.length > 0, modules: plans.map(({ moduleId, addedActionIds }) => ({ moduleId, addedActionIds })) };
  }

  public async removeAddOn(moduleId: string, input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Add-on management is not configured.');
    return this.addOns.remove(moduleId, input);
  }

  public async saveAddOnSettings(moduleId: string, input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Add-on management is not configured.');
    return this.addOns.saveSettings(moduleId, input);
  }

  public async previewAddOnSettings(moduleId: string, input: unknown): Promise<WizardAddOnSummary> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Add-on management is not configured.');
    return this.addOns.previewSettings(moduleId, input);
  }

  public async listAddOnAcceptance(): Promise<Readonly<Record<string, AddOnAcceptanceEntry>>> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Add-on management is not configured.');
    return this.addOns.listAcceptance();
  }

  public async saveAddOnAcceptance(moduleId: string, input: unknown): Promise<AddOnAcceptanceEntry> {
    if (this.addOns === undefined) throw new WizardTransactionError(503, 'Add-on management is not configured.');
    return this.addOns.saveAcceptance(moduleId, input);
  }

  public diagnostics(): Readonly<Record<string, unknown>> {
    return {
      mode: this.configuration === undefined ? 'read-only-inspection' : 'configuration-management',
      documentedRequestsOnly: true,
      supportedRequests: ['GetActions', 'GetCommands'],
      mutationRequestsSent: 0,
      inspectionRequests: this.inspector?.inspectionRequests() ?? [],
      activeTransactions: [...this.transactions.values()].filter((transaction) => transaction.status === 'draft').length,
      configuration: this.configuration?.diagnostics(),
      commandSync: this.commandSyncStore?.status(),
      addOns: this.addOns?.diagnostics(),
      updates: { configured: this.updates !== undefined, addOnsConfigured: this.addOnUpdates !== undefined },
      automaticUpdates: this.automaticUpdates?.snapshot(),
      streamerBotLauncher: { configured: this.streamerBotLauncher !== undefined },
      liveAcceptance: { configured: this.liveAcceptance !== undefined },
      obsSourceInventory: { configured: this.obsSourceInventory !== undefined },
      buildProvenance: this.provenance(),
    };
  }
}

function websiteCompanionWizardError(error: unknown): WizardTransactionError {
  if (error instanceof WebsiteCompanionError) return new WizardTransactionError(error.statusCode, error.message);
  return new WizardTransactionError(502, error instanceof Error ? error.message : 'The SlothBloom website companion did not return a valid response.');
}

export class WizardTransactionError extends Error {
  public constructor(public readonly statusCode: number, message: string) { super(message); }
}

export async function inspectAddOnActionReadiness(addOns: readonly WizardAddOnSummary[], actions: readonly (StreamerBotActionSummary & { readonly owned?: boolean })[], inspectionAvailable: boolean): Promise<Readonly<Record<string, unknown>>> {
  const results: Record<string, unknown>[] = [];
  for (const addOn of addOns.filter((item) => item.enabled && item.health === 'installed' && item.permissions.includes('streamerbot.run-approved-action'))) {
    let manifest: Record<string, unknown> | undefined;
    try { manifest = JSON.parse(await readFile(resolve('packages', 'streamerbot', addOn.moduleId.replace(/^thsv\./u, ''), 'manifest.json'), 'utf8')) as Record<string, unknown>; }
    catch { /* An add-on without a bundled Streamer.bot package has no fixed action contract. */ }
    const expected = Array.isArray(manifest?.['actions']) ? (manifest['actions'] as unknown[]).filter(isRecordValue).filter((action) => action['brokerDispatched'] === true) : [];
    for (const contract of expected) {
      const actionId = typeof contract['id'] === 'string' ? contract['id'] : '';
      const installed = actions.find((action) => action.id === actionId);
      const approved = addOn.approvedActionIds.includes(actionId);
      const mustRemainTriggerless = contract['mustRemainTriggerless'] === true;
      const triggerless = installed?.triggerCount === 0;
      const ready = inspectionAvailable && installed !== undefined && installed.enabled && approved && (!mustRemainTriggerless || triggerless);
      results.push({ moduleId: addOn.moduleId, actionId, name: contract['name'], ready, installed: installed !== undefined, enabled: installed?.enabled === true, approved, triggerless, triggerCount: installed?.triggerCount, brokerDispatched: true, mustRemainTriggerless,
        issue: !inspectionAvailable ? 'Streamer.bot action inspection is unavailable.' : installed === undefined ? 'Action is not installed.' : !installed.enabled ? 'Action is disabled.' : !approved ? 'Action is not approved for this add-on.' : mustRemainTriggerless && !triggerless ? installed.triggerCount === undefined ? 'Streamer.bot did not report a trigger count.' : 'Broker-dispatched action must remain triggerless.' : undefined });
    }
  }
  return { checkedAt: new Date().toISOString(), inspectionAvailable, ready: results.length === 0 || inspectionAvailable && results.every((item) => item['ready'] === true), requiredCount: results.length, readyCount: results.filter((item) => item['ready'] === true).length, actions: results };
}

export function inspectSpeakerBotReadiness(addOns: readonly WizardAddOnSummary[], application?: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const modules = addOns.filter((addOn) => addOn.enabled && addOn.health === 'installed' && (
    addOn.moduleId === 'thsv.voice-relay' || addOn.moduleId === 'thsv.village-hydration-station' && addOn.settings['speakerEnabled'] === true
  )).map((addOn) => addOn.moduleId);
  const required = modules.length > 0;
  const configured = application?.['configured'] === true;
  const enabled = application?.['enabled'] === true;
  const running = application?.['running'] === true;
  const executableExists = application?.['executableExists'] !== false;
  const willStartAutomatically = required && configured && enabled && executableExists && !running;
  const ready = !required || configured && enabled && running;
  return {
    required, ready, configured, enabled, running, executableExists, willStartAutomatically, modules,
    detail: !required ? 'No enabled feature currently requires Speaker.bot.' : !configured ? 'An enabled voice feature requires a selected Speaker.bot executable.' : !executableExists ? 'The saved Speaker.bot executable is missing; choose its current location.' : !enabled ? 'An enabled voice feature requires Speaker.bot automatic startup.' : !running ? 'Speaker.bot is ready to be started automatically by Start THSV Streaming Tools.' : 'Speaker.bot is running for every enabled voice feature.',
  };
}

export function inspectSceneConfiguration(addOns: readonly WizardAddOnSummary[], sceneCatalog: Readonly<Record<string, unknown>>, broadcastAutomation: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const providers = isRecordValue(sceneCatalog['providers']) ? sceneCatalog['providers'] : {};
  const enabledProviders = new Set(Object.entries(broadcastAutomation).filter(([, value]) => !isRecordValue(value) || value['enabled'] === true || value['automationReady'] === true).map(([provider]) => provider));
  if (enabledProviders.size === 0) enabledProviders.add('obs');
  const sceneSets = new Map<string, Set<string>>();
  const providerHealth = new Map<string, { fresh: boolean; complete: boolean; updatedAt?: string; ageSeconds?: number; issue?: string }>();
  const maximumAgeMs = 15 * 60_000;
  for (const [provider, raw] of Object.entries(providers)) {
    const record = isRecordValue(raw) ? raw : {};
    sceneSets.set(provider, new Set((Array.isArray(record['scenes']) ? record['scenes'] : []).flatMap((scene) => typeof scene === 'string' ? [normalizeScene(scene)] : [])));
    const updatedAt = typeof record['updatedAt'] === 'string' ? record['updatedAt'] : undefined;
    const parsed = updatedAt === undefined ? Number.NaN : Date.parse(updatedAt);
    const ageMs = Number.isFinite(parsed) ? Math.max(0, Date.now() - parsed) : Number.POSITIVE_INFINITY;
    const connections = Array.isArray(record['connections']) ? record['connections'].filter(isRecordValue) : [];
    const complete = record['complete'] === true && connections.length > 0 && connections.every((connection) => connection['complete'] === true && typeof connection['error'] !== 'string');
    const fresh = complete && ageMs <= maximumAgeMs;
    providerHealth.set(provider, { fresh, complete, ...(updatedAt === undefined ? {} : { updatedAt }), ...(Number.isFinite(ageMs) ? { ageSeconds: Math.round(ageMs / 1_000) } : {}), ...(complete && fresh ? {} : { issue: !complete ? 'Scene catalogue is incomplete or contains a connection error.' : 'Scene catalogue is older than 15 minutes; refresh it before going live.' }) });
  }
  const checks: Record<string, unknown>[] = [];
  for (const addOn of addOns.filter((item) => item.enabled && item.health === 'installed')) {
    const configured = Array.isArray(addOn.settings['automaticSceneNames']) ? addOn.settings['automaticSceneNames'].filter((scene): scene is string => typeof scene === 'string' && scene.trim().length > 0) : [];
    for (const sceneName of configured) {
      const matches = [...enabledProviders].filter((provider) => providerHealth.get(provider)?.fresh === true && sceneSets.get(provider)?.has(normalizeScene(sceneName)) === true);
      const staleMatches = [...enabledProviders].filter((provider) => sceneSets.get(provider)?.has(normalizeScene(sceneName)) === true && providerHealth.get(provider)?.fresh !== true);
      checks.push({ moduleId: addOn.moduleId, setting: 'automaticSceneNames', sceneName, providers: matches, staleProviders: staleMatches, ready: matches.length > 0, issue: matches.length > 0 ? undefined : staleMatches.length > 0 ? 'Exact scene exists only in a stale or incomplete catalogue; refresh scenes before going live.' : 'Exact scene was not found in any enabled broadcast-app catalogue.' });
    }
    if (addOn.moduleId === 'thsv.raid-scout' && addOn.settings['autoStartSceneEnabled'] === true) {
      const provider = typeof addOn.settings['autoStartProvider'] === 'string' ? addOn.settings['autoStartProvider'] : 'obs';
      const sceneName = typeof addOn.settings['autoStartSceneName'] === 'string' ? addOn.settings['autoStartSceneName'] : '';
      const exists = sceneSets.get(provider)?.has(normalizeScene(sceneName)) === true;
      const ready = enabledProviders.has(provider) && providerHealth.get(provider)?.fresh === true && exists;
      checks.push({ moduleId: addOn.moduleId, setting: 'autoStartSceneName', provider, sceneName, ready, issue: ready ? undefined : !enabledProviders.has(provider) ? 'The selected ending-scene app is not enabled.' : exists ? 'Exact ending scene exists only in a stale or incomplete catalogue; refresh scenes before going live.' : 'Exact ending scene was not found in the selected app catalogue.' });
    }
  }
  return { ready: checks.every((item) => item['ready'] === true), maximumCatalogAgeMinutes: 15, enabledProviders: [...enabledProviders], providers: Object.fromEntries(providerHealth), checks };
}

export function inspectCriticalOverlayReadiness(addOns: readonly WizardAddOnSummary[], overlay: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const clientCounts = isRecordValue(overlay['addOnClients']) ? overlay['addOnClients'] : {};
  const requiresOverlay = (addOn: WizardAddOnSummary): boolean => {
    if (!addOn.enabled || addOn.health !== 'installed') return false;
    if (addOn.moduleId === 'thsv.starting-soon-countdown') return addOn.settings['enabled'] !== false && addOn.settings['showOverlay'] !== false;
    if (addOn.moduleId === 'thsv.ad-break-companion') return true;
    if (addOn.moduleId === 'thsv.random-clip-player') return Array.isArray(addOn.settings['automaticSceneNames']) && addOn.settings['automaticSceneNames'].length > 0;
    if (addOn.moduleId === 'thsv.raid-scout') return addOn.settings['showSearchProgress'] !== false || addOn.settings['showSuggestionCard'] !== false || addOn.settings['showConfirmedCard'] !== false;
    return false;
  };
  const checks = addOns.filter(requiresOverlay).map((addOn) => {
    const rawClients = clientCounts[addOn.moduleId];
    const clients = typeof rawClients === 'number' ? rawClients : 0;
    return { moduleId: addOn.moduleId, ready: overlay['enabled'] === true && clients > 0, clients, issue: overlay['enabled'] !== true ? 'Browser overlays are disabled in StreamBridge.' : clients < 1 ? 'Enabled critical overlay has no connected browser source.' : undefined };
  });
  return { ready: checks.every((check) => check.ready), requiredCount: checks.length, connectedCount: checks.filter((check) => check.ready).length, checks };
}

export function inspectTimedActionCanary(rehearsal: Readonly<Record<string, unknown>>, actions: readonly StreamerBotActionSummary[], inspectionAvailable: boolean): Readonly<Record<string, unknown>> {
  const raw = isRecordValue(rehearsal['timedActionCanary']) ? rehearsal['timedActionCanary'] : { ready: false, definitions: [] };
  const definitions = (Array.isArray(raw['definitions']) ? raw['definitions'] : []).filter(isRecordValue).map((definition) => {
    const target = isRecordValue(definition['target']) ? definition['target'] : {};
    if (target['provider'] !== 'run-existing-action') return { ...definition, targetReady: true };
    const actionId = typeof target['actionId'] === 'string' ? target['actionId'] : '';
    const installed = actions.find((action) => action.id === actionId);
    const targetReady = target['creatorApproved'] === true && inspectionAvailable && installed?.enabled === true;
    return { ...definition, targetReady, targetInstalled: installed !== undefined, targetEnabled: installed?.enabled === true, issue: target['creatorApproved'] !== true ? 'Timed action target is not creator-approved.' : !inspectionAvailable ? 'Streamer.bot action inspection is unavailable.' : installed === undefined ? 'Timed action target is not installed.' : !installed.enabled ? 'Timed action target is disabled.' : undefined };
  });
  return { ...raw, ready: raw['ready'] === true && definitions.every((definition) => definition['targetReady']), inspectionAvailable, definitions };
}

function endingFlowChecklist(addOns: readonly WizardAddOnSummary[], actionReadiness: Readonly<Record<string, unknown>>, sceneConfiguration: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const raidScout = addOns.find((item) => item.moduleId === 'thsv.raid-scout' && item.enabled);
  if (raidScout === undefined) return { applicable: false, ready: true, steps: [] };
  const actions = Array.isArray(actionReadiness['actions']) ? actionReadiness['actions'].filter(isRecordValue).filter((item) => item['moduleId'] === raidScout.moduleId) : [];
  const sceneChecks = Array.isArray(sceneConfiguration['checks']) ? sceneConfiguration['checks'].filter(isRecordValue).filter((item) => item['moduleId'] === raidScout.moduleId && item['setting'] === 'autoStartSceneName') : [];
  const settings = raidScout.settings;
  const stopEnabled = settings['endBroadcastAfterRaid'] === true;
  const steps = [
    { id: 'ending-scene', ready: settings['autoStartSceneEnabled'] !== true || sceneChecks.every((item) => item['ready'] === true), detail: 'Ending scene is selected from the active app catalogue.' },
    { id: 'raid-search', ready: actions.some((item) => item['ready'] === true), detail: 'Raid Scout controller is installed, enabled, approved, and triggerless.' },
    { id: 'ending-ad', ready: settings['endBroadcastTiming'] !== 'after-ad' || actions.some((item) => item['name'] === 'THSV Addon - Raid Scout - Run Ending Ad' && item['ready'] === true), detail: 'Ending ad controller is ready when after-ad mode is selected.' },
    { id: 'clip-preview', ready: settings['previewClipBeforeRaid'] !== true || actions.every((item) => item['ready'] === true), detail: 'Raid clip preview uses the approved controller path.' },
    { id: 'raid-attempt', ready: actions.some((item) => item['ready'] === true), detail: 'Confirmed raid dispatch path is ready.' },
    { id: 'outputs-stopped', ready: !stopEnabled || typeof settings['endBroadcastActionId'] === 'string' && raidScout.approvedActionIds.includes(settings['endBroadcastActionId']), detail: 'Automatic broadcast stop remains separately approved.' },
    { id: 'offline-cleanup', ready: true, detail: 'Final offline cleanup is lifecycle-managed and included in the safe rehearsal.' },
  ];
  return { applicable: true, ready: steps.every((step) => step.ready), steps };
}

function normalizeScene(value: string): string { return value.trim().toLocaleLowerCase('en-US'); }
function isRecordValue(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

export { WizardConfigurationError };

function isOwned(kind: WizardOwnedObject['kind'], id: string, name: string): boolean {
  return PACKAGE_OWNERSHIP.some((object) => object.kind === kind && object.id === id && object.name === name);
}

function parseCommandVerificationInputs(value: unknown): CommandVerificationEntryInput[] {
  if (typeof value !== 'object' || value === null) throw new InvalidCommandDesignError('Request body must be a JSON object.');
  const commands = (value as Record<string, unknown>)['commands'];
  if (!Array.isArray(commands)) throw new InvalidCommandDesignError('commands is required and must be an array.');
  return commands.map((entry) => parseCommandVerificationEntry(entry));
}

function approvedLauncherRequest(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new WizardTransactionError(400, 'Safe launcher request must be a JSON object.');
  const record = input as Record<string, unknown>;
  if (record['approvedByCreator'] !== true) throw new WizardTransactionError(403, 'This launcher change requires explicit creator approval.');
  return record;
}

function optionalStreamingApplication(value: unknown): 'obs' | 'meld' | 'streamlabs' | 'speakerbot' {
  if (value !== 'obs' && value !== 'meld' && value !== 'streamlabs' && value !== 'speakerbot') throw new WizardTransactionError(400, 'application must be obs, meld, streamlabs, or speakerbot.');
  return value;
}

function reliabilityCsv(profiles: readonly Readonly<Record<string, unknown>>[]): string { const quote = (value: unknown): string => { const text = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''; return `"${text.replaceAll('"', '""')}"`; }; const rows = profiles.map((profile) => { const reliability = profile['reliability'] as Readonly<Record<string, unknown>> | undefined; return [profile['name'], profile['provider'], profile['state'], profile['maintenanceUntil'], profile['reconnectCount'], profile['lastLatencyMs'], reliability?.['score'], reliability?.['label'], Array.isArray(reliability?.['factors']) ? reliability['factors'].join('; ') : ''].map(quote).join(','); }); return `name,provider,state,maintenance_until,reconnects,last_latency_ms,reliability_score,reliability_label,factors\n${rows.join('\n')}\n`; }

function parseCommandVerificationEntry(value: unknown): CommandVerificationEntryInput {
  if (typeof value !== 'object' || value === null) throw new InvalidCommandDesignError('Each entry in commands must be a JSON object.');
  const record = value as Record<string, unknown>;
  if (typeof record['commandId'] !== 'string' || record['commandId'].trim().length === 0) {
    throw new InvalidCommandDesignError('commandId is required and must be a string.');
  }
  if (typeof record['name'] !== 'string' || record['name'].trim().length === 0) {
    throw new InvalidCommandDesignError('name is required and must be a string.');
  }
  const aliases = record['aliases'];
  if (aliases !== undefined && (!Array.isArray(aliases) || !aliases.every((item) => typeof item === 'string'))) {
    throw new InvalidCommandDesignError('aliases must be an array of strings.');
  }
  return { commandId: record['commandId'], name: record['name'], ...(aliases === undefined ? {} : { aliases }) };
}
