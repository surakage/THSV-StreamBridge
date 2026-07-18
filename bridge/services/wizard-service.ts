import { randomUUID } from 'node:crypto';
import type {
  StreamerBotActionSummary,
  StreamerBotCommandSummary,
  StreamerBotInspectionAuditEntry,
} from '../adapters/streamerbot-adapter.js';
import { WizardConfigurationError, type WizardConfigurationDraft, type WizardConfigurationExport, type WizardConfigurationGateway } from './wizard-configuration.js';

export interface StreamerBotInspector {
  inspectActions(): Promise<readonly StreamerBotActionSummary[]>;
  inspectCommands(): Promise<readonly StreamerBotCommandSummary[]>;
  inspectionRequests(): readonly StreamerBotInspectionAuditEntry[];
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
  readonly commands: readonly (StreamerBotCommandSummary & { readonly owned: boolean })[];
  readonly requests: readonly StreamerBotInspectionAuditEntry[];
  readonly commandCollisions: readonly {
    readonly commandName: string;
    readonly streamBotCommand: { readonly id: string; readonly name: string };
  }[];
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
];

export class WizardService {
  private readonly transactions = new Map<string, WizardTransaction>();
  private lastInspection: WizardInspection | undefined;

  public constructor(private readonly inspector: StreamerBotInspector | undefined, private readonly configuration?: WizardConfigurationGateway) {}

  public async overview(): Promise<Readonly<Record<string, unknown>>> {
    return {
      version: '2.0.0-preview.1',
      stage: 4,
      mode: this.configuration === undefined ? 'read-only-inspection' : 'configuration-management',
      authenticated: true,
      mutationSupport: this.configuration !== undefined,
      navigation: ['Overview', 'Platforms', 'Blockers', 'Commands', 'Streamer.bot', 'Ownership', 'Diagnostics'],
      ownership: PACKAGE_OWNERSHIP,
      transactions: [...this.transactions.values()],
      lastInspection: this.lastInspection,
      ...(this.configuration === undefined ? {} : { configuration: await this.configuration.snapshot() }),
    };
  }

  public async inspect(): Promise<WizardInspection> {
    if (this.inspector === undefined) {
      const result: WizardInspection = {
        inspectedAt: new Date().toISOString(), available: false, actions: [], commands: [], requests: [], error: 'Streamer.bot output is not configured.', commandCollisions: [],
      };
      this.lastInspection = result;
      return result;
    }
    try {
      const [actions, commands, snapshot] = await Promise.all([
        this.inspector.inspectActions(),
        this.inspector.inspectCommands(),
        this.configuration?.snapshot(),
      ]);
      const commandCollisions = findCommandCollisions(snapshot, commands);
      const result: WizardInspection = {
        inspectedAt: new Date().toISOString(),
        available: true,
        actions: actions.map((action) => ({ ...action, owned: isOwned('action', action.id, action.name) })),
        commands: commands.map((command) => ({ ...command, owned: isOwned('command', command.id, command.name) })),
        commandCollisions,
        requests: this.inspector.inspectionRequests(),
      };
      this.lastInspection = result;
      return result;
    } catch (error) {
      const result: WizardInspection = {
        inspectedAt: new Date().toISOString(), available: false, actions: [], commands: [], requests: this.inspector.inspectionRequests(), error: error instanceof Error ? error.message : String(error),
        commandCollisions: [],
      };
      this.lastInspection = result;
      return result;
    }
  }

  public async beginTransaction(): Promise<WizardTransaction | WizardConfigurationDraft> {
    if (this.configuration !== undefined) return this.configuration.begin();
    const transaction: WizardTransaction = { id: randomUUID(), status: 'draft', createdAt: new Date().toISOString(), stagedChanges: [] };
    this.transactions.set(transaction.id, transaction);
    return transaction;
  }

  public cancelTransaction(id: string): WizardTransaction {
    if (this.configuration !== undefined) return this.configuration.cancel(id) as unknown as WizardTransaction;
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

function findCommandCollisions(snapshot: Readonly<Record<string, unknown>> | undefined, commands: readonly StreamerBotCommandSummary[]): Array<{ commandName: string; streamBotCommand: { id: string; name: string } }> {
  const definitions = readCommandDefinitions(snapshot);
  if (definitions.length === 0 || commands.length === 0) return [];
  const commandNameByNormalized = new Map<string, { id: string; name: string }>();
  for (const command of commands) {
    const normalized = normalizeCommandName(command.name);
    if (normalized.length === 0) continue;
    commandNameByNormalized.set(normalized, { id: command.id, name: command.name });
  }
  const collisions: Array<{ commandName: string; streamBotCommand: { id: string; name: string } }> = [];
  for (const definition of definitions) {
    const normalized = normalizeCommandName(definition);
    const match = normalized.length > 0 ? commandNameByNormalized.get(normalized) : undefined;
    if (match !== undefined) collisions.push({ commandName: definition, streamBotCommand: match });
  }
  return collisions;
}

function readCommandDefinitions(snapshot: Readonly<Record<string, unknown>> | undefined): string[] {
  const commandsValue = snapshot?.commands;
  if (commandsValue === undefined || typeof commandsValue !== 'object' || commandsValue === null || Array.isArray(commandsValue)) return [];
  const definitionsValue = (commandsValue as { definitions?: unknown }).definitions;
  if (!Array.isArray(definitionsValue)) return [];
  const names: string[] = [];
  for (const definition of definitionsValue) {
    if (definition === null || typeof definition !== 'object' || Array.isArray(definition)) continue;
    const typed = definition as { name?: unknown; aliases?: unknown };
    const name = typeof typed.name === 'string' ? typed.name : '';
    if (name.trim().length > 0) names.push(name.trim());
    if (Array.isArray(typed.aliases)) {
      for (const alias of typed.aliases) {
        if (typeof alias === 'string' && alias.trim().length > 0) names.push(alias.trim());
      }
    }
  }
  return names;
}

function normalizeCommandName(value: string): string {
  return value.trim().toLowerCase().replace(/^\s*!/u, '').replace(/\s+$/u, '');
}
