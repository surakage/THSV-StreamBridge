import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile, copyFile, lstat, cp } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { unzipSync } from 'fflate';
import { CORE_CONTRACT_VERSION } from '../contracts/v2/common.js';
import { addOnPackageV2Schema, type AddOnPackageV2 } from '../contracts/v2/addon-package.js';
import { isProtectedFrameworkActionId } from '../contracts/v2/addon-capability.js';

const DESCRIPTOR_FILE = 'module-package.json';
const MIGRATION_TIMEOUT_MS = 30_000;
const MAXIMUM_DESCRIPTOR_BYTES = 1_048_576;
const MAXIMUM_CONFIGURATION_SCHEMA_BYTES = 262_144;
const MAXIMUM_SETTINGS_UI_BYTES = 65_536;
const MAXIMUM_PACKAGE_FILES = 1_000;
const MAXIMUM_PACKAGE_BYTES = 100 * 1_024 * 1_024;
const ACTION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class AddOnPackageError extends Error {
  public constructor(message: string) { super(message); this.name = 'AddOnPackageError'; }
}

export interface VerifiedAddOnPackage {
  readonly root: string;
  readonly descriptor: AddOnPackageV2;
}

export function safeChild(root: string, relativePath: string): string {
  const candidate = resolve(root, ...relativePath.split('/'));
  const prefix = resolve(root).replace(/[\\/]+$/u, '') + sep;
  if (!candidate.startsWith(prefix)) throw new AddOnPackageError(`Package path leaves its root: ${relativePath}`);
  return candidate;
}

function parseVersion(value: string): readonly [number, number, number, readonly string[]] {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?/u.exec(value);
  if (match === null) throw new AddOnPackageError(`Version is not valid SemVer: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4]?.split('.') ?? []];
}

export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left); const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const av = a[index] as number; const bv = b[index] as number;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  const ap = a[3]; const bp = b[3];
  if (ap.length === 0 || bp.length === 0) return ap.length === bp.length ? 0 : (ap.length === 0 ? 1 : -1);
  const count = Math.max(ap.length, bp.length);
  for (let index = 0; index < count; index += 1) {
    const av = ap[index]; const bv = bp[index];
    if (av === undefined || bv === undefined) return av === bv ? 0 : (av === undefined ? -1 : 1);
    if (av === bv) continue;
    const an = /^\d+$/u.test(av); const bn = /^\d+$/u.test(bv);
    if (an && bn) return Number(av) < Number(bv) ? -1 : 1;
    if (an !== bn) return an ? -1 : 1;
    return av < bv ? -1 : 1;
  }
  return 0;
}

async function listFiles(root: string, current = root): Promise<readonly string[]> {
  const result: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isSymbolicLink()) throw new AddOnPackageError(`Symbolic links are not allowed in add-on packages: ${relative(root, path)}`);
    if (entry.isDirectory()) result.push(...await listFiles(root, path));
    else if (entry.isFile()) result.push(relative(root, path).split(sep).join('/'));
  }
  return result.sort();
}

async function pathExists(path: string): Promise<boolean> {
  try { await stat(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

interface InstalledPackageRecord {
  readonly moduleId: string;
  readonly version: string;
  readonly enabled?: boolean;
  readonly installedAt?: string;
  readonly changedAt?: string;
  readonly approvedActionIds?: readonly string[];
}
interface MigrationContext { readonly moduleId: string; readonly fromVersion: string; readonly toVersion: string; readonly storageRoot: string; readonly packageRoot: string }

async function installedRecord(target: string, moduleId: string): Promise<InstalledPackageRecord | undefined> {
  if (!await pathExists(target)) return undefined;
  await verifyAddOnPackage(target, undefined, true);
  const record = JSON.parse(await readFile(safeChild(target, 'installed-package.json'), 'utf8')) as Partial<InstalledPackageRecord>;
  if (record.moduleId !== moduleId || typeof record.version !== 'string') throw new AddOnPackageError('The installed add-on record does not match the package being upgraded.');
  return record as InstalledPackageRecord;
}

async function writeInstalledRecord(recordPath: string, record: InstalledPackageRecord): Promise<void> {
  const temporary = `${recordPath}.${String(process.pid)}.${String(Date.now())}.tmp`;
  await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, recordPath);
}

function migrationPath(descriptor: AddOnPackageV2, fromVersion: string, toVersion: string): AddOnPackageV2['manifest']['migrations'] {
  if (fromVersion === toVersion || descriptor.manifest.migrations.length === 0) return [];
  const result: AddOnPackageV2['manifest']['migrations'][number][] = [];
  const visited = new Set<string>();
  let current = fromVersion;
  while (current !== toVersion) {
    if (visited.has(current)) throw new AddOnPackageError(`Migration cycle detected from ${fromVersion} to ${toVersion}.`);
    visited.add(current);
    const choices = descriptor.manifest.migrations.filter((migration) => migration.from === current && compareVersions(migration.to, toVersion) <= 0);
    if (choices.length !== 1) throw new AddOnPackageError(`Add-on upgrade requires exactly one migration step from ${current} toward ${toVersion}; found ${String(choices.length)}.`);
    const step = choices[0];
    if (step === undefined || compareVersions(step.to, current) <= 0) throw new AddOnPackageError(`Migration ${current} must advance to a newer version.`);
    result.push(step); current = step.to;
  }
  return result;
}

async function executeMigration(scriptPath: string, context: MigrationContext, timeoutMs: number): Promise<void> {
  const url = pathToFileURL(scriptPath); url.searchParams.set('migration', `${context.fromVersion}-${context.toVersion}-${String(Date.now())}`);
  const bootstrap = `import { parentPort, workerData } from 'node:worker_threads'; try { const imported = await import(workerData.scriptUrl); const migrate = imported.migrate ?? imported.default; if (typeof migrate !== 'function') throw new Error('Migration must export migrate() or a default function.'); await migrate(Object.freeze(workerData.context)); parentPort.postMessage({ ok: true }); } catch (error) { parentPort.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) }); }`;
  await new Promise<void>((resolveMigration, rejectMigration) => {
    const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(bootstrap)}`), { workerData: { scriptUrl: url.href, context } });
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error === undefined) resolveMigration(); else rejectMigration(error);
    };
    const timer = setTimeout(() => { finish(new AddOnPackageError(`Migration ${context.fromVersion} -> ${context.toVersion} exceeded ${String(timeoutMs)} ms.`)); void worker.terminate(); }, timeoutMs);
    worker.once('message', (message: { readonly ok?: boolean; readonly error?: string }) => {
      if (message.ok === true) finish();
      else finish(new AddOnPackageError(`Migration ${context.fromVersion} -> ${context.toVersion} failed: ${message.error ?? 'unknown error'}`));
      void worker.terminate();
    });
    worker.once('error', (error) => finish(new AddOnPackageError(`Migration worker failed: ${error.message}`)));
    worker.once('exit', (code) => { if (code !== 0) finish(new AddOnPackageError(`Migration worker exited with code ${String(code)}.`)); });
  });
}

export async function verifyAddOnPackage(rootPath: string, coreVersion: string = CORE_CONTRACT_VERSION, allowInstallRecord = false): Promise<VerifiedAddOnPackage> {
  const root = resolve(rootPath);
  const descriptorPath = safeChild(root, DESCRIPTOR_FILE);
  let raw: unknown;
  try {
    const descriptorInfo = await lstat(descriptorPath);
    if (!descriptorInfo.isFile() || descriptorInfo.size > MAXIMUM_DESCRIPTOR_BYTES) throw new AddOnPackageError(`${DESCRIPTOR_FILE} must be a regular file no larger than ${String(MAXIMUM_DESCRIPTOR_BYTES)} bytes.`);
    raw = JSON.parse(await readFile(descriptorPath, 'utf8')) as unknown;
  }
  catch (error) { throw new AddOnPackageError(`Unable to read ${DESCRIPTOR_FILE}: ${error instanceof Error ? error.message : String(error)}`); }
  const result = addOnPackageV2Schema.safeParse(raw);
  if (!result.success) throw new AddOnPackageError(`Add-on descriptor validation failed: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  const descriptor = result.data;
  const declaredBytes = descriptor.files.reduce((total, file) => total + file.size, 0);
  if (descriptor.files.length > MAXIMUM_PACKAGE_FILES || declaredBytes > MAXIMUM_PACKAGE_BYTES) throw new AddOnPackageError(`Add-on packages may contain at most ${String(MAXIMUM_PACKAGE_FILES)} files and ${String(MAXIMUM_PACKAGE_BYTES)} declared bytes.`);
  const configurationEntry = descriptor.files.find((file) => file.path === descriptor.manifest.configurationSchema);
  if (configurationEntry !== undefined && configurationEntry.size > MAXIMUM_CONFIGURATION_SCHEMA_BYTES) throw new AddOnPackageError(`The configuration schema exceeds ${String(MAXIMUM_CONFIGURATION_SCHEMA_BYTES)} bytes.`);
  const settingsUiEntry = descriptor.settingsUi === undefined ? undefined : descriptor.files.find((file) => file.path === descriptor.settingsUi);
  if (settingsUiEntry !== undefined && settingsUiEntry.size > MAXIMUM_SETTINGS_UI_BYTES) throw new AddOnPackageError(`The settings UI schema exceeds ${String(MAXIMUM_SETTINGS_UI_BYTES)} bytes.`);
  if (compareVersions(coreVersion, descriptor.manifest.minimumCoreVersion) < 0) throw new AddOnPackageError(`${descriptor.manifest.moduleId} requires core ${descriptor.manifest.minimumCoreVersion} or later.`);
  if (compareVersions(coreVersion, descriptor.manifest.maximumTestedCoreVersion) > 0) throw new AddOnPackageError(`${descriptor.manifest.moduleId} has only been tested through core ${descriptor.manifest.maximumTestedCoreVersion}.`);

  const expected = new Set([DESCRIPTOR_FILE, ...descriptor.files.map((file) => file.path), ...(allowInstallRecord ? ['installed-package.json'] : [])]);
  const actual = await listFiles(root);
  if (actual.length > MAXIMUM_PACKAGE_FILES + 2) throw new AddOnPackageError(`Add-on packages may contain at most ${String(MAXIMUM_PACKAGE_FILES)} payload files.`);
  const unexpected = actual.filter((path) => !expected.has(path));
  const missing = [...expected].filter((path) => !actual.includes(path));
  if (unexpected.length > 0 || missing.length > 0) throw new AddOnPackageError(`Package file list mismatch. Unexpected: ${unexpected.join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'}.`);
  for (const file of descriptor.files) {
    const path = safeChild(root, file.path);
    const info = await lstat(path);
    if (!info.isFile() || info.size !== file.size) throw new AddOnPackageError(`Package file size mismatch: ${file.path}`);
    const hash = createHash('sha256').update(await readFile(path)).digest('hex');
    if (hash !== file.sha256) throw new AddOnPackageError(`Package file hash mismatch: ${file.path}`);
  }
  return { root, descriptor };
}

export interface InstallAddOnOptions {
  readonly migrationTimeoutMs?: number;
  readonly stagePreparedHook?: (stage: string) => Promise<void>;
  readonly stateRoot?: string;
}

export async function installAddOnPackage(sourceRoot: string, addOnsRoot: string, approvedByCreator: boolean, options: InstallAddOnOptions = {}): Promise<VerifiedAddOnPackage> {
  if (!approvedByCreator) throw new AddOnPackageError('Installing an add-on requires explicit creator approval after reviewing its publisher, permissions, compatibility, and package kind.');
  const migrationTimeoutMs = options.migrationTimeoutMs ?? MIGRATION_TIMEOUT_MS;
  if (!Number.isInteger(migrationTimeoutMs) || migrationTimeoutMs < 10 || migrationTimeoutMs > MIGRATION_TIMEOUT_MS) throw new AddOnPackageError(`Migration timeout must be an integer from 10 through ${String(MIGRATION_TIMEOUT_MS)} ms.`);
  const verified = await verifyAddOnPackage(sourceRoot);
  const root = resolve(addOnsRoot);
  await mkdir(root, { recursive: true });
  const target = safeChild(root, verified.descriptor.manifest.moduleId);
  const suffix = String(Date.now());
  const stage = safeChild(root, `.install-${verified.descriptor.manifest.moduleId}-${suffix}`);
  const rollback = safeChild(root, `.rollback-${verified.descriptor.manifest.moduleId}-${suffix}`);
  const stateRoot = resolve(options.stateRoot ?? safeChild(root, '.state'));
  const storageRoot = safeChild(stateRoot, verified.descriptor.manifest.moduleId);
  const storageRollback = safeChild(stateRoot, `.rollback-${verified.descriptor.manifest.moduleId}-${suffix}`);
  let storageExisted = false;
  let migrationStatePrepared = false;
  let storageBackupReady = false;
  try {
    await mkdir(stage, { recursive: true, mode: 0o700 });
    await chmod(stage, 0o700);
    for (const path of [DESCRIPTOR_FILE, ...verified.descriptor.files.map((file) => file.path)]) {
      const destination = safeChild(stage, path);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(safeChild(verified.root, path), destination);
    }
    await options.stagePreparedHook?.(stage);
    const staged = await verifyAddOnPackage(stage);
    if (JSON.stringify(staged.descriptor) !== JSON.stringify(verified.descriptor)) throw new AddOnPackageError('Add-on descriptor changed while the package was copied into private staging.');
    const previousRecord = await installedRecord(target, verified.descriptor.manifest.moduleId);
    const previousVersion = previousRecord?.version;
    const previousEnabled = previousRecord?.enabled !== false;
    const approvedActionIds = validateInstalledActionIds(previousRecord?.approvedActionIds);
    if (previousVersion !== undefined) {
      const migrations = migrationPath(verified.descriptor, previousVersion, verified.descriptor.manifest.version);
      if (migrations.length > 0) {
        migrationStatePrepared = true;
        await mkdir(dirname(storageRoot), { recursive: true });
        storageExisted = await pathExists(storageRoot);
        if (storageExisted) { await cp(storageRoot, storageRollback, { recursive: true, errorOnExist: true }); storageBackupReady = true; }
        else await mkdir(storageRoot, { recursive: true });
        let currentVersion = previousVersion;
        for (const migration of migrations) {
          await executeMigration(safeChild(stage, migration.script), Object.freeze({ moduleId: verified.descriptor.manifest.moduleId, fromVersion: currentVersion, toVersion: migration.to, storageRoot, packageRoot: stage }), migrationTimeoutMs);
          currentVersion = migration.to;
        }
      }
    }
    // Migrations are executable package content. Re-verify the private stage after they
    // finish so a migration cannot silently rewrite the code that will be activated.
    await verifyAddOnPackage(stage);
    if (await pathExists(target)) await rename(target, rollback);
    await rename(stage, target);
    await writeInstalledRecord(safeChild(target, 'installed-package.json'), { moduleId: verified.descriptor.manifest.moduleId, version: verified.descriptor.manifest.version, enabled: previousEnabled, approvedActionIds, installedAt: new Date().toISOString() });
    await rm(rollback, { recursive: true, force: true }).catch(() => undefined);
    await rm(storageRollback, { recursive: true, force: true }).catch(() => undefined);
    return { root: target, descriptor: verified.descriptor };
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    if (await pathExists(rollback)) {
      await rm(target, { recursive: true, force: true });
      await rename(rollback, target);
    }
    if (migrationStatePrepared) {
      if (storageBackupReady && await pathExists(storageRollback)) {
        await rm(storageRoot, { recursive: true, force: true });
        await rename(storageRollback, storageRoot);
      } else if (!storageExisted) await rm(storageRoot, { recursive: true, force: true });
      else await rm(storageRollback, { recursive: true, force: true });
    }
    throw error;
  }
}

export interface InstalledAddOnSummary {
  readonly moduleId: string;
  readonly name: string;
  readonly version: string;
  readonly author: string;
  readonly description: string;
  readonly changelog: string;
  readonly packageKind: 'declarative' | 'executable';
  readonly permissions: readonly string[];
  readonly trust: AddOnPackageV2['trust'];
  readonly enabled: boolean;
  readonly approvedActionIds: readonly string[];
  readonly health: 'installed' | 'rejected';
  readonly error?: string;
  readonly configurationSchema: unknown;
  readonly settingsUi?: unknown;
}

export async function listInstalledAddOnPackages(addOnsRoot: string): Promise<readonly InstalledAddOnSummary[]> {
  const root = resolve(addOnsRoot);
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  const result: InstalledAddOnSummary[] = [];
  for (const entry of entries.filter((candidate) => candidate.isDirectory() && !candidate.name.startsWith('.') && candidate.name !== 'inbox').sort((left, right) => left.name.localeCompare(right.name))) {
    try {
      const verified = await verifyAddOnPackage(join(root, entry.name), undefined, true);
      const record = JSON.parse(await readFile(safeChild(verified.root, 'installed-package.json'), 'utf8')) as InstalledPackageRecord;
      const configurationSchema = JSON.parse(await readFile(safeChild(verified.root, verified.descriptor.manifest.configurationSchema), 'utf8')) as unknown;
      const settingsUi = verified.descriptor.settingsUi === undefined ? undefined : JSON.parse(await readFile(safeChild(verified.root, verified.descriptor.settingsUi), 'utf8')) as unknown;
      result.push({
        moduleId: verified.descriptor.manifest.moduleId,
        name: verified.descriptor.manifest.name,
        version: verified.descriptor.manifest.version,
        author: verified.descriptor.author,
        description: verified.descriptor.description,
        changelog: verified.descriptor.changelog,
        packageKind: verified.descriptor.packageKind,
        permissions: verified.descriptor.permissions,
        trust: verified.descriptor.trust,
        enabled: record.enabled !== false,
        approvedActionIds: validateInstalledActionIds(record.approvedActionIds),
        health: 'installed',
        configurationSchema,
        ...(settingsUi === undefined ? {} : { settingsUi }),
      });
    } catch (error) {
      result.push({ moduleId: entry.name, name: entry.name, version: 'unknown', author: 'Unknown publisher', description: 'This installed add-on failed integrity or compatibility verification and will not be loaded.', changelog: '', packageKind: 'executable', permissions: [], trust: {}, enabled: false, approvedActionIds: [], health: 'rejected', error: error instanceof Error ? error.message : String(error), configurationSchema: { type: 'object', properties: {}, additionalProperties: false } });
    }
  }
  return result;
}

export async function setAddOnPackageEnabled(moduleId: string, addOnsRoot: string, enabled: boolean, approvedByCreator: boolean): Promise<void> {
  if (!approvedByCreator) throw new AddOnPackageError(`${enabled ? 'Enabling' : 'Disabling'} an add-on requires explicit creator approval.`);
  if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u.test(moduleId)) throw new AddOnPackageError('Invalid module ID.');
  const target = safeChild(resolve(addOnsRoot), moduleId);
  await verifyAddOnPackage(target, undefined, true);
  const recordPath = safeChild(target, 'installed-package.json');
  const record = JSON.parse(await readFile(recordPath, 'utf8')) as InstalledPackageRecord;
  await writeInstalledRecord(recordPath, { ...record, enabled, changedAt: new Date().toISOString() });
}

export async function setAddOnApprovedActionIds(moduleId: string, addOnsRoot: string, actionIds: readonly string[], approvedByCreator: boolean): Promise<void> {
  if (!approvedByCreator) throw new AddOnPackageError('Changing an add-on action grant requires explicit creator approval.');
  if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u.test(moduleId)) throw new AddOnPackageError('Invalid module ID.');
  if (actionIds.length > 50 || actionIds.some((id) => !ACTION_ID.test(id))) throw new AddOnPackageError('Approved Streamer.bot action IDs must contain at most 50 valid UUIDs.');
  if (new Set(actionIds).size !== actionIds.length) throw new AddOnPackageError('Approved Streamer.bot action IDs must be unique.');
  if (actionIds.some(isProtectedFrameworkActionId)) throw new AddOnPackageError('StreamBridge framework actions cannot be granted to an add-on.');
  const target = safeChild(resolve(addOnsRoot), moduleId);
  const verified = await verifyAddOnPackage(target, undefined, true);
  if (!verified.descriptor.permissions.includes('streamerbot.run-approved-action') && actionIds.length > 0) throw new AddOnPackageError('This add-on did not request permission to run approved Streamer.bot actions.');
  const recordPath = safeChild(target, 'installed-package.json');
  const record = JSON.parse(await readFile(recordPath, 'utf8')) as InstalledPackageRecord;
  await writeInstalledRecord(recordPath, { ...record, approvedActionIds: [...actionIds], changedAt: new Date().toISOString() });
}

export function validateInstalledActionIds(value: unknown): readonly string[] {
  if (value === undefined) return [];
  if (!isStringArray(value) || value.length > 50 || value.some((id) => !ACTION_ID.test(id)) || new Set(value).size !== value.length) throw new AddOnPackageError('The installed add-on action grant is invalid. Re-save or revoke its action grants.');
  if (value.some(isProtectedFrameworkActionId)) throw new AddOnPackageError('The installed add-on action grant includes a protected StreamBridge framework action. Revoke its action grants.');
  return [...value];
}

export async function inspectAddOnArchive(archive: Uint8Array, scratchRoot: string, limits: { readonly maximumFiles?: number; readonly maximumUncompressedBytes?: number } = {}): Promise<AddOnPackageV2> {
  const extracted = unpackAddOnArchive(archive, limits);
  const root = resolve(scratchRoot); await mkdir(root, { recursive: true });
  const extraction = await mkdtemp(join(root, '.inspect-'));
  try {
    await chmod(extraction, 0o700);
    for (const [path, content] of Object.entries(extracted)) {
      const target = safeChild(extraction, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, content, { mode: 0o600 });
    }
    return (await verifyAddOnPackage(extraction)).descriptor;
  } finally { await rm(extraction, { recursive: true, force: true }); }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry: unknown): entry is string => typeof entry === 'string');
}

export async function installAddOnArchive(archive: Uint8Array, addOnsRoot: string, approvedByCreator: boolean, limits: { readonly maximumFiles?: number; readonly maximumUncompressedBytes?: number } = {}, options: InstallAddOnOptions = {}): Promise<VerifiedAddOnPackage> {
  const extracted = unpackAddOnArchive(archive, limits);
  const root = resolve(addOnsRoot); await mkdir(root, { recursive: true });
  const extraction = await mkdtemp(join(root, '.archive-'));
  try {
    await chmod(extraction, 0o700);
    for (const [path, content] of Object.entries(extracted)) {
      const target = safeChild(extraction, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, content, { mode: 0o600 });
    }
    return await installAddOnPackage(extraction, root, approvedByCreator, options);
  } finally { await rm(extraction, { recursive: true, force: true }); }
}

function unpackAddOnArchive(archive: Uint8Array, limits: { readonly maximumFiles?: number; readonly maximumUncompressedBytes?: number }): Record<string, Uint8Array> {
  const maximumFiles = limits.maximumFiles ?? 10_000;
  const maximumUncompressedBytes = limits.maximumUncompressedBytes ?? 100 * 1_024 * 1_024;
  let files = 0; let totalBytes = 0; const names = new Set<string>();
  const extracted = unzipSync(archive, {
    filter: (file) => {
      if (file.name.endsWith('/')) return false;
      if (!file.name || !file.name.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..') || file.name.includes('\\') || file.name.startsWith('/') || /^[A-Za-z]:/u.test(file.name)) throw new AddOnPackageError(`Unsafe archive path: ${file.name}`);
      if (names.has(file.name)) throw new AddOnPackageError(`Duplicate archive path: ${file.name}`);
      names.add(file.name);
      files += 1; totalBytes += file.originalSize;
      if (files > maximumFiles) throw new AddOnPackageError(`Add-on archive exceeds the ${String(maximumFiles)} file limit.`);
      if (totalBytes > maximumUncompressedBytes) throw new AddOnPackageError(`Add-on archive exceeds the ${String(maximumUncompressedBytes)} byte expanded-size limit.`);
      return true;
    },
  });
  if (extracted[DESCRIPTOR_FILE] === undefined) throw new AddOnPackageError(`${DESCRIPTOR_FILE} must be at the root of the .thsv-addon archive.`);
  return extracted;
}

export async function removeAddOnPackage(moduleId: string, addOnsRoot: string, approvedByCreator: boolean): Promise<void> {
  if (!approvedByCreator) throw new AddOnPackageError('Removing an add-on requires explicit creator approval. Owned state is preserved separately.');
  if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u.test(moduleId)) throw new AddOnPackageError('Invalid module ID.');
  const root = resolve(addOnsRoot);
  const target = safeChild(root, moduleId);
  if (!await pathExists(target)) throw new AddOnPackageError('The add-on is not installed.');
  await rm(target, { recursive: true, force: true });
}
