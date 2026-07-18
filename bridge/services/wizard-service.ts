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

export interface StreamerBotInspector {
  inspectActions(): Promise<readonly StreamerBotActionSummary[]>;
  inspectCommands(): Promise<readonly StreamerBotCommandSummary[]>;
  inspectionRequests(): readonly StreamerBotInspectionAuditEntry[];
  // Optional because only the real adapter (never the read-only test fakes most Stage 3/4 tests
  // still use) actually dispatches Tier 1 requests — WizardService treats its absence the same
  // as "Streamer.bot output is not configured" rather than requiring every caller to implement
  // a method they have no way to exercise.
  requestCommandAdministration?(request: CommandAdministrationRequest): Promise<void>;
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

const PACKAGE_OWNERSHIP: readonly WizardOwnedObject[] = [
  { kind: 'action', id: '143fce1d-c5b0-4108-b766-ee2d0249e2d4', name: 'THSV StreamBridge - Receive Event', packageId: 'core-receiver' },
  { kind: 'action', id: '99e202ab-0ee9-58d1-b22c-95b30fdc702e', name: 'THSV StreamBridge - Multi-Chat', packageId: 'multi-chat' },
  { kind: 'action', id: '9481fb18-98a4-5db2-b826-d89db463f490', name: 'THSV StreamBridge - Multi-Commands', packageId: 'multi-commands' },
  { kind: 'action', id: '2a52e02b-fefe-5c89-8aeb-067aa773d621', name: 'THSV StreamBridge - Multi-Alerts', packageId: 'multi-alerts' },
  { kind: 'action', id: 'f021d77f-7eb8-55d8-87dd-d681c439dfef', name: 'THSV StreamBridge - Multi-Timed Actions', packageId: 'multi-timed-actions' },
  { kind: 'action', id: '5b43c53a-1e4b-5608-b343-5f88c2884677', name: 'THSV Twitch - Intake', packageId: 'native-platform-intake' },
  { kind: 'action', id: '38df4ccc-2d85-5a9d-8fa6-6711f513c2bd', name: 'THSV YouTube - Intake', packageId: 'native-platform-intake' },
  { kind: 'action', id: 'a6b02419-c344-5853-8166-eb6b6adb02d7', name: 'THSV Kick - Intake', packageId: 'native-platform-intake' },
  { kind: 'action', id: '9f37f61d-f2d6-50cc-bbca-3b1d951ef9ee', name: 'THSV TikTok - Chat', packageId: 'tikfinity-intake' },
  { kind: 'action', id: 'ab0e5f0a-e714-516c-82ee-1f476a516f7e', name: 'THSV TikTok - Follow', packageId: 'tikfinity-intake' },
  { kind: 'action', id: '6bd402de-117e-56f4-8855-308e2894e66c', name: 'THSV TikTok - Gift', packageId: 'tikfinity-intake' },
  { kind: 'action', id: 'b2ee7599-75b5-5c88-8ef2-4d715885c610', name: 'THSV TikTok - Like', packageId: 'tikfinity-intake' },
  { kind: 'action', id: '4e9f0946-f33d-5309-b376-a16df5612b32', name: 'THSV StreamBridge - Open Setup Wizard', packageId: 'wizard-launcher' },
  { kind: 'action', id: '04ca0087-578d-5c2e-9e06-249dc072e9f8', name: 'THSV StreamBridge - Command Administration', packageId: 'command-administration' },
  { kind: 'action', id: 'f5b716a8-eb6e-54d3-8e25-d7dd80f6baf2', name: 'THSV StreamBridge - Launch Bridge', packageId: 'bridge-launcher' },
  { kind: 'action', id: '8d8e3667-fd96-510f-b2ae-a8affe5b789a', name: 'THSV StreamBridge - Shutdown Bridge', packageId: 'bridge-launcher' },
];

export class WizardService {
  private readonly transactions = new Map<string, WizardTransaction>();
  private lastInspection: WizardInspection | undefined;
  private lastCommandSync: CommandSyncResult | undefined;

  public constructor(
    private readonly inspector: StreamerBotInspector | undefined,
    private readonly configuration?: WizardConfigurationGateway,
    private readonly commandSyncStore?: CommandSyncStore,
  ) {}

  public async overview(): Promise<Readonly<Record<string, unknown>>> {
    return {
      version: '2.0.0-preview.1',
      stage: 6,
      mode: this.configuration === undefined ? 'read-only-inspection' : 'configuration-management',
      authenticated: true,
      mutationSupport: this.configuration !== undefined,
      navigation: ['Overview', 'Platforms', 'Blockers', 'Streamer.bot', 'Command Sync', 'Timed Actions', 'Ownership', 'Diagnostics'],
      ownership: PACKAGE_OWNERSHIP,
      transactions: this.configuration === undefined ? [...this.transactions.values()] : (this.configuration.diagnostics()['transactions'] ?? []),
      lastInspection: this.lastInspection,
      lastCommandSync: this.lastCommandSync,
      ...(this.configuration === undefined ? {} : { configuration: await this.configuration.snapshot() }),
    };
  }

  public async inspect(): Promise<WizardInspection> {
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

  public async beginTransaction(): Promise<WizardTransaction | WizardConfigurationDraft> {
    if (this.configuration !== undefined) return this.configuration.begin();
    const transaction: WizardTransaction = { id: randomUUID(), status: 'draft', createdAt: new Date().toISOString(), stagedChanges: [] };
    this.transactions.set(transaction.id, transaction);
    return transaction;
  }

  public cancelTransaction(id: string): WizardTransaction | WizardConfigurationDraft {
    if (this.configuration !== undefined) return this.configuration.cancel(id);
    const current = this.transactions.get(id);
    if (current === undefined) throw new WizardTransactionError(404, 'Wizard transaction was not found.');
    if (current.status === 'cancelled') return current;
    const cancelled: WizardTransaction = { ...current, status: 'cancelled', cancelledAt: new Date().toISOString(), stagedChanges: [] };
    this.transactions.set(id, cancelled);
    return cancelled;
  }

  public stageTransaction(id: string, change: unknown): WizardConfigurationDraft {
    if (this.configuration === undefined) throw new WizardTransactionError(409, 'Configuration mutations are not available.');
    return this.configuration.stage(id, change);
  }

  public stageImport(id: string, input: unknown): WizardConfigurationDraft {
    if (this.configuration === undefined) throw new WizardTransactionError(409, 'Configuration mutations are not available.');
    return this.configuration.stageImport(id, input);
  }

  public async commitTransaction(id: string): Promise<WizardConfigurationDraft> {
    if (this.configuration === undefined) throw new WizardTransactionError(409, 'Configuration mutations are not available.');
    return this.configuration.commit(id);
  }

  public async exportConfiguration(): Promise<WizardConfigurationExport> {
    if (this.configuration === undefined) throw new WizardTransactionError(409, 'Configuration export is not available.');
    return this.configuration.export();
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
    };
  }
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
