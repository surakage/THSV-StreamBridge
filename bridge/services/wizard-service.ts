import { randomUUID } from 'node:crypto';
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
  ) {}

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

  public obsInventoryStatus(overlay?: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    if (this.obsSourceInventory === undefined) return { configured: false, ready: false, requiredCount: 0, readyRequiredCount: 0, sources: [] };
    return this.obsSourceInventory.status(overlay);
  }

  public saveObsInventory(input: unknown, overlay?: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    if (this.obsSourceInventory === undefined) throw new WizardTransactionError(503, 'Expected OBS source inventory is unavailable in this installation.');
    this.obsSourceInventory.replace(input);
    return this.obsSourceInventory.status(overlay);
  }

  public provenance(): Readonly<BuildProvenance> | Readonly<Record<string, unknown>> {
    return this.buildProvenance ?? { version: STREAMBRIDGE_VERSION, coreContractVersion: CORE_CONTRACT_VERSION, installation: 'local-development' };
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
