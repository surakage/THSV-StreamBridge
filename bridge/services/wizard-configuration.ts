import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { alertPresentationSchema, bridgeConfigSchema, filtersSchema, timedActionsSchema, type BridgeConfig } from '../../schemas/config.js';
import type { PlatformCapabilityReport } from '../contracts/v2/capability.js';

const wizardConfigurationChangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('platform'), platform: z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/), enabled: z.boolean(), inputEnabled: z.boolean(), outputEnabled: z.boolean() }).strict(),
  z.object({ kind: z.literal('filters'), filters: filtersSchema }).strict(),
  z.object({ kind: z.literal('timed-actions'), timedActions: timedActionsSchema }).strict(),
  z.object({ kind: z.literal('alerts'), alertSettings: z.object({
    maxAlertQueue: z.number().int().min(1).max(200),
    alertDurationMs: z.number().int().min(1_000).max(60_000),
    showSimulated: z.boolean(),
    alerts: alertPresentationSchema,
  }).strict() }).strict(),
]);

const wizardConfigurationImportSchema = z.object({
  format: z.literal('thsv.streambridge.wizard-configuration'),
  version: z.literal(1),
  exportedAt: z.iso.datetime({ offset: true }),
  platforms: z.record(z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), z.object({ enabled: z.boolean(), inputEnabled: z.boolean(), outputEnabled: z.boolean() }).strict()),
  filters: filtersSchema,
  timedActions: timedActionsSchema.optional(),
  alertSettings: z.object({ maxAlertQueue: z.number().int().min(1).max(200), alertDurationMs: z.number().int().min(1_000).max(60_000), showSimulated: z.boolean(), alerts: alertPresentationSchema }).strict().optional(),
}).strict();

export type WizardConfigurationChange = z.infer<typeof wizardConfigurationChangeSchema>;

export interface WizardConfigurationDraft {
  readonly id: string;
  readonly status: 'draft' | 'cancelled' | 'committed' | 'failed';
  readonly createdAt: string;
  readonly finishedAt?: string;
  readonly stagedChanges: readonly WizardConfigurationChange[];
  readonly restartRequired: boolean;
  readonly backupPath?: string;
  readonly error?: string;
}

interface InternalDraft {
  public: WizardConfigurationDraft;
  sourceHash: string;
  candidate: Record<string, unknown>;
}

export interface WizardConfigurationExport {
  readonly format: 'thsv.streambridge.wizard-configuration';
  readonly version: 1;
  readonly exportedAt: string;
  readonly platforms: Readonly<Record<string, Pick<BridgeConfig['platforms'][string], 'enabled' | 'inputEnabled' | 'outputEnabled'>>>;
  readonly filters: BridgeConfig['filters'];
  readonly timedActions: BridgeConfig['timedActions'];
  readonly alertSettings: Pick<BridgeConfig['browserOverlay'], 'maxAlertQueue' | 'alertDurationMs' | 'showSimulated' | 'alerts'>;
}

export class WizardConfigurationGateway {
  private readonly drafts = new Map<string, InternalDraft>();
  private mutationWrites = 0;
  private rollbackWrites = 0;

  public constructor(
    private readonly configPath: string,
    private readonly capabilitySource: (platforms: BridgeConfig['platforms']) => readonly PlatformCapabilityReport[],
    private readonly backupDirectory = resolve(dirname(configPath), '..', 'backups', 'wizard'),
  ) {}

  // Narrow accessor for Tier 2 command generation, which needs only the configured prefix to
  // build a Streamer.bot-native trigger phrase — not the full snapshot() shape.
  public async commandPrefix(): Promise<string> {
    const config = await this.readConfig();
    return config.commands.prefix;
  }

  public async snapshot(): Promise<Readonly<Record<string, unknown>>> {
    const config = await this.readConfig();
    return {
      configPath: resolve(this.configPath),
      restartRequiredAfterCommit: true,
      platforms: Object.fromEntries(Object.entries(config.platforms).map(([id, value]) => [id, {
        enabled: value.enabled, inputEnabled: value.inputEnabled, outputEnabled: value.outputEnabled, adapter: value.adapter,
      }])),
      filters: config.filters,
      timedActions: config.timedActions,
      alertSettings: pickAlertSettings(config),
      capabilities: this.capabilitySource(config.platforms),
    };
  }

  public async begin(): Promise<WizardConfigurationDraft> {
    if ([...this.drafts.values()].some((draft) => draft.public.status === 'draft')) throw new WizardConfigurationError(409, 'Another browser tab already holds the configuration mutation lease. Cancel or commit it first.');
    const raw = await readFile(this.configPath, 'utf8');
    const candidate = parseObject(raw);
    bridgeConfigSchema.parse(candidate);
    const publicDraft: WizardConfigurationDraft = { id: randomUUID(), status: 'draft', createdAt: new Date().toISOString(), stagedChanges: [], restartRequired: true };
    this.drafts.set(publicDraft.id, { public: publicDraft, sourceHash: hash(raw), candidate });
    return publicDraft;
  }

  public stage(id: string, input: unknown): WizardConfigurationDraft {
    const draft = this.requireDraft(id);
    const change = parseWithReadableError(wizardConfigurationChangeSchema, input, 'Staged configuration change');
    if (change.kind === 'platform') {
      const validated = bridgeConfigSchema.parse(draft.candidate);
      const current = validated.platforms[change.platform];
      if (current === undefined) throw new WizardConfigurationError(400, `Unknown configured platform: ${change.platform}`);
      const rawPlatforms = objectValue(draft.candidate['platforms']);
      draft.candidate = { ...draft.candidate, platforms: { ...rawPlatforms, [change.platform]: { ...objectValue(rawPlatforms[change.platform]), enabled: change.enabled, inputEnabled: change.inputEnabled, outputEnabled: change.outputEnabled } } };
    } else if (change.kind === 'filters') {
      draft.candidate = { ...draft.candidate, filters: change.filters };
    } else if (change.kind === 'timed-actions') {
      draft.candidate = { ...draft.candidate, timedActions: change.timedActions };
    } else {
      const current = bridgeConfigSchema.parse(draft.candidate).browserOverlay;
      draft.candidate = { ...draft.candidate, browserOverlay: { ...current, ...change.alertSettings } };
    }
    bridgeConfigSchema.parse(draft.candidate);
    draft.public = { ...draft.public, stagedChanges: [...draft.public.stagedChanges.filter((existing) => existing.kind !== change.kind || (change.kind === 'platform' && existing.kind === 'platform' && existing.platform !== change.platform)), change] };
    return draft.public;
  }

  public stageImport(id: string, input: unknown): WizardConfigurationDraft {
    const imported = parseImport(input);
    this.requireDraft(id);
    for (const [platform, flags] of Object.entries(imported.platforms)) {
      this.stage(id, { kind: 'platform', platform, ...flags });
    }
    let result = this.stage(id, { kind: 'filters', filters: imported.filters });
    if (imported.timedActions !== undefined) result = this.stage(id, { kind: 'timed-actions', timedActions: imported.timedActions });
    if (imported.alertSettings !== undefined) result = this.stage(id, { kind: 'alerts', alertSettings: imported.alertSettings });
    return result;
  }

  public async export(): Promise<WizardConfigurationExport> {
    const config = await this.readConfig();
    return {
      format: 'thsv.streambridge.wizard-configuration', version: 1, exportedAt: new Date().toISOString(),
      platforms: Object.fromEntries(Object.entries(config.platforms).map(([id, value]) => [id, { enabled: value.enabled, inputEnabled: value.inputEnabled, outputEnabled: value.outputEnabled }])),
      filters: config.filters,
      timedActions: config.timedActions,
      alertSettings: pickAlertSettings(config),
    };
  }

  public cancel(id: string): WizardConfigurationDraft {
    const draft = this.requireDraft(id);
    draft.public = { ...draft.public, status: 'cancelled', finishedAt: new Date().toISOString(), stagedChanges: [] };
    return draft.public;
  }

  public async commit(id: string): Promise<WizardConfigurationDraft> {
    const draft = this.requireDraft(id);
    const currentRaw = await readFile(this.configPath, 'utf8');
    if (hash(currentRaw) !== draft.sourceHash) throw new WizardConfigurationError(409, 'Configuration changed after this draft began. No files were written; start a new draft.');
    if (draft.public.stagedChanges.length === 0) throw new WizardConfigurationError(400, 'The draft has no staged changes.');
    bridgeConfigSchema.parse(draft.candidate);
    await mkdir(this.backupDirectory, { recursive: true });
    const backupPath = join(this.backupDirectory, `${new Date().toISOString().replace(/[:.]/gu, '-')}-${id}.json`);
    await writeFile(backupPath, currentRaw, { encoding: 'utf8', flag: 'wx' });
    try {
      await writeAtomic(this.configPath, `${JSON.stringify(draft.candidate, null, 2)}\n`);
      this.mutationWrites += 1;
      await this.readConfig();
      draft.public = { ...draft.public, status: 'committed', finishedAt: new Date().toISOString(), backupPath: resolve(backupPath) };
      return draft.public;
    } catch (error) {
      await writeAtomic(this.configPath, currentRaw);
      this.rollbackWrites += 1;
      draft.public = { ...draft.public, status: 'failed', finishedAt: new Date().toISOString(), backupPath: resolve(backupPath), error: error instanceof Error ? error.message : String(error) };
      throw new WizardConfigurationError(500, 'Configuration commit failed and the pre-commit backup was restored.');
    }
  }

  public diagnostics(): Readonly<Record<string, unknown>> {
    return {
      mutationWrites: this.mutationWrites,
      rollbackWrites: this.rollbackWrites,
      activeMutationLeases: [...this.drafts.values()].filter((draft) => draft.public.status === 'draft').length,
      transactions: [...this.drafts.values()].map((draft) => draft.public),
    };
  }

  private requireDraft(id: string): InternalDraft {
    const draft = this.drafts.get(id);
    if (draft === undefined) throw new WizardConfigurationError(404, 'Wizard transaction was not found.');
    if (draft.public.status !== 'draft') throw new WizardConfigurationError(409, `Wizard transaction is already ${draft.public.status}.`);
    return draft;
  }

  private async readConfig(): Promise<BridgeConfig> {
    return bridgeConfigSchema.parse(JSON.parse(await readFile(this.configPath, 'utf8')) as unknown);
  }
}

export class WizardConfigurationError extends Error {
  public constructor(public readonly statusCode: number, message: string) { super(message); }
}

function parseImport(input: unknown): z.infer<typeof wizardConfigurationImportSchema> {
  return parseWithReadableError(wizardConfigurationImportSchema, input, 'Imported configuration');
}

function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }

function pickAlertSettings(config: BridgeConfig): WizardConfigurationExport['alertSettings'] {
  return {
    maxAlertQueue: config.browserOverlay.maxAlertQueue,
    alertDurationMs: config.browserOverlay.alertDurationMs,
    showSimulated: config.browserOverlay.showSimulated,
    alerts: config.browserOverlay.alerts,
  };
}

function parseObject(raw: string): Record<string, unknown> {
  const value = JSON.parse(raw) as unknown;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new WizardConfigurationError(400, 'Configuration root must be an object.');
  return value as Record<string, unknown>;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseWithReadableError<T>(schema: z.ZodType<T>, input: unknown, label: string): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const details = result.error.issues.slice(0, 5).map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ');
  throw new WizardConfigurationError(400, `${label} is invalid: ${details}`);
}

async function writeAtomic(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${String(process.pid)}.${randomUUID()}.tmp`;
  await writeFile(temporary, value, 'utf8');
  await rename(temporary, path);
}
