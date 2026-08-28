import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { alertPresentationSchema, bridgeConfigSchema, chatOverlaySchema, filtersSchema, timedActionsSchema, type BridgeConfig } from '../../schemas/config.js';
import type { PlatformCapabilityReport } from '../contracts/v2/capability.js';
import { stripUtf8Bom } from './config-loader.js';

const BACKUP_RETENTION_DAYS = 90;
const BACKUP_RETENTION_FILES = 40;
const BACKUP_RETENTION_BYTES = 32 * 1024 * 1024;
const BACKUP_MINIMUM_KEPT = 5;
const logStoragePolicySchema = z.object({
  activeBytes: z.number().int().min(16 * 1024 * 1024).max(16 * 1024 * 1024 * 1024),
  archiveBytes: z.number().int().min(48 * 1024 * 1024).max(16 * 1024 * 1024 * 1024),
}).strict();

const wizardConfigurationChangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('platform'), platform: z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/), enabled: z.boolean(), inputEnabled: z.boolean(), outputEnabled: z.boolean() }).strict(),
  z.object({ kind: z.literal('filters'), filters: filtersSchema }).strict(),
  z.object({ kind: z.literal('timed-actions'), timedActions: timedActionsSchema }).strict(),
  z.object({ kind: z.literal('chat-overlay'), chatSettings: z.object({
    brandLabel: z.string().trim().max(60),
    maxChatMessages: z.number().int().min(1).max(200),
    showBots: z.boolean(),
    chat: chatOverlaySchema,
  }).strict() }).strict(),
  z.object({ kind: z.literal('alerts'), alertSettings: z.object({
    maxAlertQueue: z.number().int().min(1).max(200),
    alertDurationMs: z.number().int().min(1_000).max(60_000),
    overlayGapMs: z.number().int().min(250).max(10_000).default(1_000),
    showSimulated: z.boolean(),
    alerts: alertPresentationSchema,
  }).strict() }).strict(),
  z.object({ kind: z.literal('log-storage-policy'), logStoragePolicy: logStoragePolicySchema }).strict(),
]);

const wizardConfigurationImportSchema = z.object({
  format: z.literal('thsv.streambridge.wizard-configuration'),
  version: z.literal(1),
  exportedAt: z.iso.datetime({ offset: true }),
  platforms: z.record(z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), z.object({ enabled: z.boolean(), inputEnabled: z.boolean(), outputEnabled: z.boolean() }).strict()),
  filters: filtersSchema,
  timedActions: timedActionsSchema.optional(),
  chatSettings: z.object({ brandLabel: z.string().trim().max(60), maxChatMessages: z.number().int().min(1).max(200), showBots: z.boolean(), chat: chatOverlaySchema }).strict().optional(),
  alertSettings: z.object({ maxAlertQueue: z.number().int().min(1).max(200), alertDurationMs: z.number().int().min(1_000).max(60_000), overlayGapMs: z.number().int().min(250).max(10_000).default(1_000), showSimulated: z.boolean(), alerts: alertPresentationSchema }).strict().optional(),
  logStoragePolicy: logStoragePolicySchema.optional(),
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
  leaseOwner: string;
  logStoragePolicy?: z.infer<typeof logStoragePolicySchema>;
}

export interface WizardConfigurationExport {
  readonly format: 'thsv.streambridge.wizard-configuration';
  readonly version: 1;
  readonly exportedAt: string;
  readonly platforms: Readonly<Record<string, Pick<BridgeConfig['platforms'][string], 'enabled' | 'inputEnabled' | 'outputEnabled'>>>;
  readonly filters: BridgeConfig['filters'];
  readonly timedActions: BridgeConfig['timedActions'];
  readonly chatSettings: Pick<BridgeConfig['browserOverlay'], 'brandLabel' | 'maxChatMessages' | 'showBots' | 'chat'>;
  readonly alertSettings: Pick<BridgeConfig['browserOverlay'], 'maxAlertQueue' | 'alertDurationMs' | 'overlayGapMs' | 'showSimulated' | 'alerts'>;
  readonly logStoragePolicy?: z.infer<typeof logStoragePolicySchema>;
}

export interface WizardConfigurationActivation {
  readonly state: 'active' | 'restart-required';
  readonly restartRequired: boolean;
  readonly activatedAt: string;
}

export interface WizardConfigurationBackup {
  readonly filename: string;
  readonly createdAt: string;
  readonly bytes: number;
}

export class WizardConfigurationGateway {
  private readonly drafts = new Map<string, InternalDraft>();
  private readonly activatedAt = new Date().toISOString();
  private readonly activeConfigHash: Promise<string>;
  private mutationWrites = 0;
  private rollbackWrites = 0;

  public constructor(
    private readonly configPath: string,
    private readonly capabilitySource: (platforms: BridgeConfig['platforms']) => readonly PlatformCapabilityReport[],
    private readonly backupDirectory = resolve(dirname(configPath), '..', 'backups', 'wizard'),
    private readonly logStoragePolicyPath = join(dirname(configPath), 'log-storage-policy.json'),
  ) {
    this.activeConfigHash = readFile(this.configPath, 'utf8').then((value) => configFingerprint(value));
  }

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
      activation: await this.activationStatus(),
      platforms: Object.fromEntries(Object.entries(config.platforms).map(([id, value]) => [id, {
        enabled: value.enabled, inputEnabled: value.inputEnabled, outputEnabled: value.outputEnabled, adapter: value.adapter,
      }])),
      filters: config.filters,
      timedActions: config.timedActions,
      chatSettings: pickChatSettings(config),
      alertSettings: pickAlertSettings(config),
      capabilities: this.capabilitySource(config.platforms),
    };
  }

  public async activationStatus(): Promise<WizardConfigurationActivation> {
    const [activeHash, currentRaw] = await Promise.all([this.activeConfigHash, readFile(this.configPath, 'utf8')]);
    const restartRequired = configFingerprint(currentRaw) !== activeHash;
    return { state: restartRequired ? 'restart-required' : 'active', restartRequired, activatedAt: this.activatedAt };
  }

  public async begin(leaseOwner = ''): Promise<WizardConfigurationDraft> {
    if ([...this.drafts.values()].some((draft) => draft.public.status === 'draft')) throw new WizardConfigurationError(409, 'Another browser tab already holds the configuration mutation lease. Cancel or commit it first.');
    const raw = await readFile(this.configPath, 'utf8');
    const candidate = parseObject(raw);
    bridgeConfigSchema.parse(candidate);
    const publicDraft: WizardConfigurationDraft = { id: randomUUID(), status: 'draft', createdAt: new Date().toISOString(), stagedChanges: [], restartRequired: true };
    this.drafts.set(publicDraft.id, { public: publicDraft, sourceHash: hash(raw), candidate, leaseOwner });
    return publicDraft;
  }

  public stage(id: string, input: unknown, leaseOwner = ''): WizardConfigurationDraft {
    const draft = this.requireDraft(id,leaseOwner);
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
    } else if (change.kind === 'chat-overlay') {
      const current = bridgeConfigSchema.parse(draft.candidate).browserOverlay;
      draft.candidate = { ...draft.candidate, browserOverlay: { ...current, ...change.chatSettings } };
    } else if (change.kind === 'alerts') {
      const current = bridgeConfigSchema.parse(draft.candidate).browserOverlay;
      draft.candidate = { ...draft.candidate, browserOverlay: { ...current, ...change.alertSettings } };
    } else {
      draft.logStoragePolicy = change.logStoragePolicy;
    }
    bridgeConfigSchema.parse(draft.candidate);
    draft.public = { ...draft.public, stagedChanges: [...draft.public.stagedChanges.filter((existing) => existing.kind !== change.kind || (change.kind === 'platform' && existing.kind === 'platform' && existing.platform !== change.platform)), change] };
    return draft.public;
  }

  public stageImport(id: string, input: unknown, leaseOwner = ''): WizardConfigurationDraft {
    const imported = parseImport(input);
    this.requireDraft(id,leaseOwner);
    for (const [platform, flags] of Object.entries(imported.platforms)) {
      this.stage(id, { kind: 'platform', platform, ...flags },leaseOwner);
    }
    let result = this.stage(id, { kind: 'filters', filters: imported.filters },leaseOwner);
    if (imported.timedActions !== undefined) result = this.stage(id, { kind: 'timed-actions', timedActions: imported.timedActions },leaseOwner);
    if (imported.chatSettings !== undefined) result = this.stage(id, { kind: 'chat-overlay', chatSettings: imported.chatSettings },leaseOwner);
    if (imported.alertSettings !== undefined) result = this.stage(id, { kind: 'alerts', alertSettings: imported.alertSettings },leaseOwner);
    if (imported.logStoragePolicy !== undefined) result = this.stage(id, { kind: 'log-storage-policy', logStoragePolicy: imported.logStoragePolicy },leaseOwner);
    return result;
  }

  public async export(): Promise<WizardConfigurationExport> {
    const config = await this.readConfig();
    const logStoragePolicy = await this.readLogStoragePolicy();
    return {
      format: 'thsv.streambridge.wizard-configuration', version: 1, exportedAt: new Date().toISOString(),
      platforms: Object.fromEntries(Object.entries(config.platforms).map(([id, value]) => [id, { enabled: value.enabled, inputEnabled: value.inputEnabled, outputEnabled: value.outputEnabled }])),
      filters: config.filters,
      timedActions: config.timedActions,
      chatSettings: pickChatSettings(config),
      alertSettings: pickAlertSettings(config),
      ...(logStoragePolicy === undefined ? {} : { logStoragePolicy }),
    };
  }

  public async backups(): Promise<{ readonly backups: readonly WizardConfigurationBackup[]; readonly retention: Readonly<Record<string, number>> }> {
    try {
      const pruned = await this.pruneBackups();
      const candidates = (await readdir(this.backupDirectory)).filter(validBackupFilename);
      const backups = (await Promise.all(candidates.map(async (filename): Promise<WizardConfigurationBackup | undefined> => {
        const path = join(this.backupDirectory, filename);
        try {
          const details = await stat(path);
          if (!details.isFile() || details.size > 2 * 1024 * 1024) return undefined;
          bridgeConfigSchema.parse(JSON.parse(stripUtf8Bom(await readFile(path, 'utf8'))) as unknown);
          return { filename, createdAt: details.mtime.toISOString(), bytes: details.size };
        } catch { return undefined; }
      }))).filter((entry): entry is WizardConfigurationBackup => entry !== undefined).sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, BACKUP_RETENTION_FILES);
      return { backups, retention: { maximumAgeDays: BACKUP_RETENTION_DAYS, maximumFiles: BACKUP_RETENTION_FILES, maximumBytes: BACKUP_RETENTION_BYTES, minimumKept: BACKUP_MINIMUM_KEPT, pruned } };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { backups: [], retention: { maximumAgeDays: BACKUP_RETENTION_DAYS, maximumFiles: BACKUP_RETENTION_FILES, maximumBytes: BACKUP_RETENTION_BYTES, minimumKept: BACKUP_MINIMUM_KEPT, pruned: 0 } };
      throw error;
    }
  }

  public async restoreBackup(input: unknown): Promise<{ readonly restored: true; readonly restoredFrom: string; readonly rollbackBackup: string; readonly restartRequired: true }> {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new WizardConfigurationError(400, 'Backup restore request must be an object.');
    const request = input as Record<string, unknown>;
    if (request['approvedByCreator'] !== true) throw new WizardConfigurationError(403, 'Restoring a configuration backup requires explicit creator approval.');
    if (typeof request['filename'] !== 'string' || !validBackupFilename(request['filename']) || basename(request['filename']) !== request['filename']) throw new WizardConfigurationError(400, 'Choose a listed configuration backup.');
    if ([...this.drafts.values()].some((draft) => draft.public.status === 'draft')) throw new WizardConfigurationError(409, 'Save or discard the pending configuration draft before restoring a backup.');
    const sourcePath = join(this.backupDirectory, request['filename']);
    let sourceRaw: string;
    try {
      const details = await stat(sourcePath);
      if (!details.isFile() || details.size > 2 * 1024 * 1024) throw new WizardConfigurationError(400, 'The selected configuration backup is invalid or too large.');
      sourceRaw = await readFile(sourcePath, 'utf8');
      bridgeConfigSchema.parse(JSON.parse(stripUtf8Bom(sourceRaw)) as unknown);
    } catch (error) {
      if (error instanceof WizardConfigurationError) throw error;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new WizardConfigurationError(404, 'The selected configuration backup no longer exists. Refresh the backup list.');
      throw new WizardConfigurationError(400, 'The selected configuration backup is damaged and was not restored.');
    }
    const currentRaw = await readFile(this.configPath, 'utf8');
    await mkdir(this.backupDirectory, { recursive: true });
    const rollbackPath = join(this.backupDirectory, `${timestampForFilename()}-before-restore-${randomUUID()}.json`);
    await writeFile(rollbackPath, currentRaw, { encoding: 'utf8', flag: 'wx' });
    try {
      await writeAtomic(this.configPath, sourceRaw.endsWith('\n') ? sourceRaw : `${sourceRaw}\n`);
      await this.readConfig();
      this.mutationWrites += 1;
      await this.pruneBackups();
      return { restored: true, restoredFrom: request['filename'], rollbackBackup: basename(rollbackPath), restartRequired: true };
    } catch {
      await writeAtomic(this.configPath, currentRaw);
      this.rollbackWrites += 1;
      throw new WizardConfigurationError(500, 'Configuration restore failed and the pre-restore rollback backup was restored.');
    }
  }

  public cancel(id: string,leaseOwner = ''): WizardConfigurationDraft {
    const draft = this.requireDraft(id,leaseOwner);
    draft.public = { ...draft.public, status: 'cancelled', finishedAt: new Date().toISOString(), stagedChanges: [] };
    return draft.public;
  }

  public async commit(id: string,leaseOwner = ''): Promise<WizardConfigurationDraft> {
    const draft = this.requireDraft(id,leaseOwner);
    const currentRaw = await readFile(this.configPath, 'utf8');
    if (hash(currentRaw) !== draft.sourceHash) throw new WizardConfigurationError(409, 'Configuration changed after this draft began. No files were written; start a new draft.');
    if (draft.public.stagedChanges.length === 0) throw new WizardConfigurationError(400, 'The draft has no staged changes.');
    bridgeConfigSchema.parse(draft.candidate);
    const candidateRaw = `${JSON.stringify(draft.candidate, null, 2)}\n`;
    const restartRequired = configFingerprint(candidateRaw) !== configFingerprint(currentRaw);
    const currentPolicyRaw = await readOptionalText(this.logStoragePolicyPath);
    await mkdir(this.backupDirectory, { recursive: true });
    const backupPath = join(this.backupDirectory, `${timestampForFilename()}-${id}.json`);
    await writeFile(backupPath, currentRaw, { encoding: 'utf8', flag: 'wx' });
    try {
      await writeAtomic(this.configPath, candidateRaw);
      if (draft.logStoragePolicy !== undefined) await writeAtomic(this.logStoragePolicyPath, `${JSON.stringify({ schemaVersion: 1, ...draft.logStoragePolicy }, null, 2)}\n`);
      this.mutationWrites += 1;
      await this.readConfig();
      if (draft.logStoragePolicy !== undefined) await this.readLogStoragePolicy(true);
      await this.pruneBackups();
      draft.public = { ...draft.public, status: 'committed', finishedAt: new Date().toISOString(), restartRequired, backupPath: resolve(backupPath) };
      return draft.public;
    } catch (error) {
      await writeAtomic(this.configPath, currentRaw);
      if (draft.logStoragePolicy !== undefined) {
        if (currentPolicyRaw === undefined) await rm(this.logStoragePolicyPath, { force: true });
        else await writeAtomic(this.logStoragePolicyPath, currentPolicyRaw);
      }
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

  private async pruneBackups(): Promise<number> {
    let names: string[];
    try { names = (await readdir(this.backupDirectory)).filter(validBackupFilename); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw error; }
    const ranked = (await Promise.all(names.map(async (filename) => {
      const details = await stat(join(this.backupDirectory, filename));
      return { filename, bytes: details.isFile() ? details.size : Number.MAX_SAFE_INTEGER, modifiedAt: details.mtimeMs, isFile: details.isFile() };
    }))).sort((left, right) => right.modifiedAt - left.modifiedAt);
    const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60_000;
    let keptFiles = 0; let keptBytes = 0; let pruned = 0;
    for (const entry of ranked) {
      const protectedNewest = entry.isFile && keptFiles < BACKUP_MINIMUM_KEPT;
      const withinLimits = entry.isFile && entry.modifiedAt >= cutoff && keptFiles < BACKUP_RETENTION_FILES && keptBytes + entry.bytes <= BACKUP_RETENTION_BYTES;
      if (protectedNewest || withinLimits) { keptFiles += 1; keptBytes += entry.bytes; continue; }
      await rm(join(this.backupDirectory, entry.filename), { force: true });
      pruned += 1;
    }
    return pruned;
  }

  private requireDraft(id: string,leaseOwner = ''): InternalDraft {
    const draft = this.drafts.get(id);
    if (draft === undefined) throw new WizardConfigurationError(404, 'Wizard transaction was not found.');
    if (draft.public.status !== 'draft') throw new WizardConfigurationError(409, `Wizard transaction is already ${draft.public.status}.`);
    if(draft.leaseOwner!==''&&draft.leaseOwner!==leaseOwner)throw new WizardConfigurationError(409,'Another browser tab owns this protected draft. Return to that tab to edit, save, or discard it.');
    return draft;
  }

  private async readConfig(): Promise<BridgeConfig> {
    return bridgeConfigSchema.parse(JSON.parse(stripUtf8Bom(await readFile(this.configPath, 'utf8'))) as unknown);
  }

  private async readLogStoragePolicy(required = false): Promise<z.infer<typeof logStoragePolicySchema> | undefined> {
    try {
      const value = JSON.parse(stripUtf8Bom(await readFile(this.logStoragePolicyPath, 'utf8'))) as Record<string, unknown>;
      return logStoragePolicySchema.parse({ activeBytes: value['activeBytes'], archiveBytes: value['archiveBytes'] });
    } catch (error) {
      if (!required && (error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }
}

export class WizardConfigurationError extends Error {
  public constructor(public readonly statusCode: number, message: string) { super(message); }
}

function parseImport(input: unknown): z.infer<typeof wizardConfigurationImportSchema> {
  return parseWithReadableError(wizardConfigurationImportSchema, input, 'Imported configuration');
}

function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function timestampForFilename(): string { return new Date().toISOString().replace(/[:.]/gu, '-'); }
function validBackupFilename(value: string): boolean { return /^\d{4}-\d{2}-\d{2}T[0-9Z-]+-(?:before-restore-)?[0-9a-f-]{36}\.json$/iu.test(value); }
function configFingerprint(value: string): string { return hash(JSON.stringify(bridgeConfigSchema.parse(JSON.parse(stripUtf8Bom(value)) as unknown))); }

function pickAlertSettings(config: BridgeConfig): WizardConfigurationExport['alertSettings'] {
  return {
    maxAlertQueue: config.browserOverlay.maxAlertQueue,
    alertDurationMs: config.browserOverlay.alertDurationMs,
    overlayGapMs: config.browserOverlay.overlayGapMs,
    showSimulated: config.browserOverlay.showSimulated,
    alerts: config.browserOverlay.alerts,
  };
}

function pickChatSettings(config: BridgeConfig): WizardConfigurationExport['chatSettings'] {
  return {
    brandLabel: config.browserOverlay.brandLabel,
    maxChatMessages: config.browserOverlay.maxChatMessages,
    showBots: config.browserOverlay.showBots,
    chat: config.browserOverlay.chat,
  };
}

function parseObject(raw: string): Record<string, unknown> {
  const value = JSON.parse(stripUtf8Bom(raw)) as unknown;
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

async function readOptionalText(path: string): Promise<string | undefined> {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}
