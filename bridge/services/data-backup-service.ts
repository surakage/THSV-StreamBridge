import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { writeJsonAtomic } from './atomic-state.js';

// "Your data": everything the extensions remember (points, quotes, giveaway history, counters and so on)
// plus their settings, in one file the creator can keep, move to another PC, or restore.
// Restores are staged and applied the next time StreamBridge starts, before any extension runs,
// so a running extension can never overwrite restored data.

export const DATA_BACKUP_FORMAT = 'thsv-streambridge-data';
export const AUTOMATIC_BACKUPS_KEPT = 14;
const OTHER_BACKUPS_KEPT = 10;
const MAXIMUM_MODULE_JSON_BYTES = 1_048_576;
const MAXIMUM_SETTINGS_BYTES = 65_536;
const MAXIMUM_BUNDLE_BYTES = 64 * 1_048_576;
const MODULE_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;
const BACKUP_FILE = /^streambridge-data-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z-(?:daily|manual|before-restore)\.json$/u;
const SECRET_KEY = /(?:token|secret|password|passphrase|apikey|api_key|privatekey|webhookurl)/iu;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DataBackupModule {
  readonly moduleId: string;
  readonly name: string;
  readonly configurationSchema?: unknown;
}

export interface DataBackupDependencies {
  readonly stateRoot: string;
  readonly backupDirectory: string;
  readonly version: string;
  /** Installed extensions and built-in integrations, with their settings schema. */
  readonly modules: () => Promise<readonly DataBackupModule[]>;
  /** Validates restored settings against the installed schema; throws when they do not fit. */
  readonly checkSettings: (schema: unknown, value: Readonly<Record<string, unknown>>) => Readonly<Record<string, unknown>>;
  /** The safe (secret-free) wizard configuration export, included in "Back up everything". */
  readonly configuration?: () => Promise<unknown>;
  readonly now?: () => number;
  readonly logger?: { info(message: string, details?: Readonly<Record<string, unknown>>): void; warn(message: string, details?: Readonly<Record<string, unknown>>): void };
}

export interface DataBundleEntry { readonly name?: string; readonly data?: Record<string, unknown>; readonly settings?: Record<string, unknown> }
export interface DataBundle {
  readonly format: typeof DATA_BACKUP_FORMAT;
  readonly version: 1;
  readonly createdAt: string;
  readonly appVersion: string;
  readonly reason?: string;
  readonly configuration?: unknown;
  readonly addOns: Readonly<Record<string, DataBundleEntry>>;
}

export class DataBackupError extends Error {
  public constructor(public readonly statusCode: number, message: string) { super(message); }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stamp(at: number): string {
  return new Date(at).toISOString().replace(/\.\d{3}Z$/u, 'Z').replace(/:/gu, '-');
}

/** Drops anything that looks like a credential from add-on settings before they leave this PC. */
function withoutSecrets(settings: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(settings).filter(([key, value]) => !(SECRET_KEY.test(key) && typeof value === 'string' && value !== '')));
}

async function readJsonFile(path: string, maximumBytes: number): Promise<Record<string, unknown> | undefined> {
  try {
    const details = await stat(path);
    if (!details.isFile() || details.size > maximumBytes * 2) return undefined;
    const parsed = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/u, '')) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch { return undefined; }
}

export function parseDataBundle(input: unknown): DataBundle {
  if (!isRecord(input) || input['format'] !== DATA_BACKUP_FORMAT || input['version'] !== 1 || !isRecord(input['addOns'])) {
    throw new DataBackupError(400, 'That is not a StreamBridge data backup. Choose a file made with "Back up everything" or an extension export.');
  }
  const addOns: Record<string, DataBundleEntry> = {};
  for (const [moduleId, value] of Object.entries(input['addOns'])) {
    if (!MODULE_ID.test(moduleId) || moduleId.length > 100 || !isRecord(value)) continue;
    const data = isRecord(value['data']) ? value['data'] : undefined;
    const settings = isRecord(value['settings']) ? value['settings'] : undefined;
    if (data !== undefined && Buffer.byteLength(JSON.stringify(data)) > MAXIMUM_MODULE_JSON_BYTES) throw new DataBackupError(413, `The saved data for ${moduleId} is larger than an extension can keep.`);
    if (settings !== undefined && Buffer.byteLength(JSON.stringify(settings)) > MAXIMUM_SETTINGS_BYTES) throw new DataBackupError(413, `The saved settings for ${moduleId} are too large.`);
    if (data === undefined && settings === undefined) continue;
    addOns[moduleId] = { ...(typeof value['name'] === 'string' ? { name: value['name'].slice(0, 120) } : {}), ...(data ? { data } : {}), ...(settings ? { settings } : {}) };
  }
  return {
    format: DATA_BACKUP_FORMAT, version: 1,
    createdAt: typeof input['createdAt'] === 'string' ? input['createdAt'].slice(0, 40) : '',
    appVersion: typeof input['appVersion'] === 'string' ? input['appVersion'].slice(0, 40) : '',
    ...(input['configuration'] !== undefined ? { configuration: input['configuration'] } : {}),
    addOns,
  };
}

export class DataBackupService {
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<unknown> = Promise.resolve();

  public constructor(private readonly dependencies: DataBackupDependencies) {}

  private now(): number { return this.dependencies.now?.() ?? Date.now(); }
  private get stateRoot(): string { return resolve(this.dependencies.stateRoot); }
  private get pendingRoot(): string { return join(this.stateRoot, '.pending-restore'); }

  private modulePath(moduleId: string, file: 'runtime-state.json' | 'settings.json'): string {
    if (!MODULE_ID.test(moduleId)) throw new DataBackupError(400, 'Invalid extension ID.');
    const path = resolve(this.stateRoot, moduleId, file);
    if (!path.startsWith(this.stateRoot.replace(/[\\/]+$/u, '') + sep)) throw new DataBackupError(400, 'Invalid extension ID.');
    return path;
  }

  private backupPath(filename: string): string {
    if (!BACKUP_FILE.test(filename) || basename(filename) !== filename) throw new DataBackupError(400, 'Choose a listed backup.');
    return join(resolve(this.dependencies.backupDirectory), filename);
  }

  /** What each extension keeps, the saved backups, and any restore waiting for a restart. */
  public async summary(): Promise<Readonly<Record<string, unknown>>> {
    const modules = await this.dependencies.modules();
    const rows = await Promise.all(modules.map(async (module) => {
      const [data, settings] = await Promise.all([this.fileInfo(this.modulePath(module.moduleId, 'runtime-state.json')), this.fileInfo(this.modulePath(module.moduleId, 'settings.json'))]);
      return { moduleId: module.moduleId, name: module.name, dataBytes: data?.bytes ?? 0, dataUpdatedAt: data?.updatedAt ?? '', hasSettings: settings !== undefined };
    }));
    return {
      modules: rows.sort((left, right) => left.name.localeCompare(right.name)),
      backups: await this.listBackups(),
      automaticBackupsKept: AUTOMATIC_BACKUPS_KEPT,
      pendingRestore: await this.pendingRestore(),
    };
  }

  private async fileInfo(path: string): Promise<{ bytes: number; updatedAt: string } | undefined> {
    try { const details = await stat(path); return details.isFile() ? { bytes: details.size, updatedAt: details.mtime.toISOString() } : undefined; }
    catch { return undefined; }
  }

  /** One file with the chosen extensions' data and settings. No module IDs means everything. */
  public async exportBundle(input: unknown = {}): Promise<DataBundle> {
    const request = isRecord(input) ? input : {};
    const wanted = Array.isArray(request['moduleIds']) ? new Set(request['moduleIds'].filter((value): value is string => typeof value === 'string')) : undefined;
    const includeSettings = request['includeSettings'] !== false;
    const includeConfiguration = request['includeConfiguration'] !== false && wanted === undefined;
    const addOns: Record<string, DataBundleEntry> = {};
    for (const module of await this.dependencies.modules()) {
      if (wanted !== undefined && !wanted.has(module.moduleId)) continue;
      const data = await readJsonFile(this.modulePath(module.moduleId, 'runtime-state.json'), MAXIMUM_MODULE_JSON_BYTES);
      const settings = includeSettings ? await readJsonFile(this.modulePath(module.moduleId, 'settings.json'), MAXIMUM_SETTINGS_BYTES) : undefined;
      if (data === undefined && settings === undefined) continue;
      addOns[module.moduleId] = { name: module.name, ...(data ? { data } : {}), ...(settings ? { settings: withoutSecrets(settings) } : {}) };
    }
    let configuration: unknown;
    if (includeConfiguration && this.dependencies.configuration !== undefined) {
      try { configuration = await this.dependencies.configuration(); } catch { configuration = undefined; }
    }
    return {
      format: DATA_BACKUP_FORMAT, version: 1, createdAt: new Date(this.now()).toISOString(), appVersion: this.dependencies.version,
      ...(typeof request['reason'] === 'string' ? { reason: request['reason'].slice(0, 40) } : {}),
      ...(configuration === undefined ? {} : { configuration }),
      addOns,
    };
  }

  private async bundleFrom(request: Record<string, unknown>): Promise<DataBundle> {
    if (typeof request['backup'] === 'string') {
      const path = this.backupPath(request['backup']);
      const raw = await readFile(path, 'utf8').catch(() => { throw new DataBackupError(404, 'That backup no longer exists. Refresh the list.'); });
      return parseDataBundle(JSON.parse(raw) as unknown);
    }
    return parseDataBundle(request['bundle']);
  }

  /** Shows what a restore would change, without changing anything. */
  public async preview(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const request = isRecord(input) ? input : {};
    const bundle = await this.bundleFrom(request);
    const installed = new Map((await this.dependencies.modules()).map((module) => [module.moduleId, module]));
    const modules = await Promise.all(Object.entries(bundle.addOns).map(async ([moduleId, entry]) => {
      const current = await this.fileInfo(this.modulePath(moduleId, 'runtime-state.json'));
      return {
        moduleId, name: installed.get(moduleId)?.name ?? entry.name ?? moduleId, installed: installed.has(moduleId),
        hasData: entry.data !== undefined, hasSettings: entry.settings !== undefined,
        dataBytes: entry.data === undefined ? 0 : Buffer.byteLength(JSON.stringify(entry.data)), currentDataBytes: current?.bytes ?? 0,
      };
    }));
    return { createdAt: bundle.createdAt, appVersion: bundle.appVersion, hasConfiguration: bundle.configuration !== undefined, modules: modules.sort((left, right) => left.name.localeCompare(right.name)) };
  }

  /**
   * Stages the chosen extensions' data and/or settings. They replace the current ones the next time
   * StreamBridge starts. A safety backup of everything is saved first.
   */
  public async restore(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const request = isRecord(input) ? input : {};
    if (request['approvedByCreator'] !== true) throw new DataBackupError(403, 'Restoring data needs your approval.');
    const bundle = await this.bundleFrom(request);
    const restoreData = request['data'] !== false;
    const restoreSettings = request['settings'] !== false;
    if (!restoreData && !restoreSettings) throw new DataBackupError(400, 'Choose data, settings or both.');
    const wanted = Array.isArray(request['moduleIds']) ? new Set(request['moduleIds'].filter((value): value is string => typeof value === 'string')) : undefined;
    const installed = new Map((await this.dependencies.modules()).map((module) => [module.moduleId, module]));
    const staged: { moduleId: string; name: string; data: boolean; settings: boolean }[] = [];
    const skipped: { moduleId: string; reason: string }[] = [];
    const files: { path: string; value: Record<string, unknown> }[] = [];
    for (const [moduleId, entry] of Object.entries(bundle.addOns)) {
      if (wanted !== undefined && !wanted.has(moduleId)) continue;
      const module = installed.get(moduleId);
      if (module === undefined) { skipped.push({ moduleId, reason: 'not installed' }); continue; }
      let settings: Readonly<Record<string, unknown>> | undefined;
      if (restoreSettings && entry.settings !== undefined) {
        try { settings = this.dependencies.checkSettings(module.configurationSchema, entry.settings); }
        catch { skipped.push({ moduleId, reason: 'settings do not fit this version' }); }
      }
      const data = restoreData ? entry.data : undefined;
      if (data === undefined && settings === undefined) continue;
      if (data !== undefined) files.push({ path: join(this.pendingRoot, `${moduleId}.runtime-state.json`), value: data });
      if (settings !== undefined) files.push({ path: join(this.pendingRoot, `${moduleId}.settings.json`), value: { ...settings } });
      staged.push({ moduleId, name: module.name, data: data !== undefined, settings: settings !== undefined });
    }
    if (staged.length === 0) throw new DataBackupError(400, skipped.length ? 'Nothing in that file can be restored here. Turn on the extensions it came from first.' : 'Nothing was chosen to restore.');
    const safety = await this.backupNow('before-restore');
    await this.cancelRestore();
    for (const file of files) await writeJsonAtomic(file.path, file.value);
    await writeJsonAtomic(join(this.pendingRoot, 'restore.json'), { stagedAt: new Date(this.now()).toISOString(), safetyBackup: safety.filename, modules: staged });
    this.dependencies.logger?.info('Data restore staged for the next start', { modules: staged.map((item) => item.moduleId), safetyBackup: safety.filename });
    return { staged: staged.length, modules: staged, skipped, safetyBackup: safety.filename, restartRequired: true, hasConfiguration: bundle.configuration !== undefined };
  }

  public async pendingRestore(): Promise<Readonly<Record<string, unknown>> | null> {
    const manifest = await readJsonFile(join(this.pendingRoot, 'restore.json'), 1_048_576);
    return manifest ?? null;
  }

  public async cancelRestore(): Promise<{ readonly cancelled: boolean }> {
    const had = (await this.pendingRestore()) !== null;
    await rm(this.pendingRoot, { recursive: true, force: true });
    return { cancelled: had };
  }

  /** Runs at startup, before any extension starts: moves staged files into place. */
  public async applyPendingRestore(): Promise<{ readonly applied: readonly string[] }> {
    const manifest = await this.pendingRestore();
    if (manifest === null) { await rm(this.pendingRoot, { recursive: true, force: true }); return { applied: [] }; }
    const applied: string[] = [];
    const modules = Array.isArray(manifest['modules']) ? manifest['modules'] : [];
    for (const item of modules) {
      if (!isRecord(item) || typeof item['moduleId'] !== 'string' || !MODULE_ID.test(item['moduleId'])) continue;
      const moduleId = item['moduleId'];
      for (const file of ['runtime-state.json', 'settings.json'] as const) {
        const staged = await readJsonFile(join(this.pendingRoot, `${moduleId}.${file}`), MAXIMUM_MODULE_JSON_BYTES);
        if (staged === undefined) continue;
        await writeJsonAtomic(this.modulePath(moduleId, file), staged);
      }
      applied.push(moduleId);
    }
    await rm(this.pendingRoot, { recursive: true, force: true });
    if (applied.length) this.dependencies.logger?.info('Restored extension data from a backup', { modules: applied });
    return { applied };
  }

  public async listBackups(): Promise<readonly { filename: string; createdAt: string; bytes: number; kind: string }[]> {
    let names: string[];
    try { names = (await readdir(resolve(this.dependencies.backupDirectory))).filter((name) => BACKUP_FILE.test(name)); }
    catch { return []; }
    const rows = await Promise.all(names.map(async (filename) => {
      const info = await this.fileInfo(join(resolve(this.dependencies.backupDirectory), filename));
      const kind = /-(daily|manual|before-restore)\.json$/u.exec(filename)?.[1] ?? 'manual';
      // The time is in the name, so copying a backup to another folder or PC keeps its date.
      const named = /^streambridge-data-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z/u.exec(filename);
      const createdAt = named ? `${named[1] ?? ''}T${named[2] ?? ''}:${named[3] ?? ''}:${named[4] ?? ''}.000Z` : info?.updatedAt ?? '';
      return info === undefined ? undefined : { filename, createdAt, bytes: info.bytes, kind };
    }));
    return rows.filter((row): row is NonNullable<typeof row> => row !== undefined).sort((left, right) => right.filename.localeCompare(left.filename));
  }

  public async readBackup(filename: string): Promise<string> {
    try { return await readFile(this.backupPath(filename), 'utf8'); }
    catch (error) { if (error instanceof DataBackupError) throw error; throw new DataBackupError(404, 'That backup no longer exists. Refresh the list.'); }
  }

  public async backupNow(kind: 'daily' | 'manual' | 'before-restore' = 'manual'): Promise<{ readonly filename: string; readonly bytes: number }> {
    const task = async (): Promise<{ filename: string; bytes: number }> => {
      const bundle = await this.exportBundle({ reason: kind });
      const text = `${JSON.stringify(bundle)}\n`;
      if (Buffer.byteLength(text) > MAXIMUM_BUNDLE_BYTES) throw new DataBackupError(413, 'Your data is too large for one backup file.');
      const directory = resolve(this.dependencies.backupDirectory);
      await mkdir(directory, { recursive: true });
      const filename = `streambridge-data-${stamp(this.now())}-${kind}.json`;
      await writeFile(join(directory, filename), text, { encoding: 'utf8', mode: 0o600 });
      await this.prune();
      return { filename, bytes: Buffer.byteLength(text) };
    };
    const result = this.running.then(task, task);
    this.running = result.catch(() => undefined);
    return result;
  }

  private async prune(): Promise<void> {
    const backups = await this.listBackups();
    const daily = backups.filter((item) => item.kind === 'daily');
    const other = backups.filter((item) => item.kind !== 'daily');
    for (const item of [...daily.slice(AUTOMATIC_BACKUPS_KEPT), ...other.slice(OTHER_BACKUPS_KEPT)]) {
      await rm(join(resolve(this.dependencies.backupDirectory), item.filename), { force: true });
    }
  }

  /** Makes one automatic backup a day (checked hourly and at start), keeping the last 14. */
  public async runDailyBackup(): Promise<{ readonly created: boolean; readonly filename?: string }> {
    const latest = (await this.listBackups()).find((item) => item.kind === 'daily');
    if (latest !== undefined && this.now() - Date.parse(latest.createdAt) < DAY_MS - 5 * 60_000) return { created: false };
    const result = await this.backupNow('daily');
    return { created: true, filename: result.filename };
  }

  public start(): void {
    if (this.timer !== undefined) return;
    const run = (): void => { void this.runDailyBackup().catch((error: unknown) => this.dependencies.logger?.warn('Daily data backup failed', { error })); };
    run();
    this.timer = setInterval(run, 60 * 60_000);
    this.timer.unref();
  }

  public stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }
}
