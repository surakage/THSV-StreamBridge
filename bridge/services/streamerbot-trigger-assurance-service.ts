import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { normalizeStreamerBotVersion, STREAMERBOT_TRIGGER_REGISTRY_107, type StreamerBotTriggerContract } from '../contracts/streamerbot-trigger-contract-registry.js';

type JsonRecord = Record<string, unknown>;

interface InstalledTrigger {
  readonly id: string;
  readonly type: number;
  readonly enabled: boolean;
  readonly fingerprint: string;
}

interface InstalledAction {
  readonly id: string;
  readonly name: string;
  readonly group: string;
  readonly enabled: boolean;
  readonly triggers: readonly InstalledTrigger[];
  readonly source: JsonRecord;
}

export interface StreamerBotTriggerAssuranceOptions {
  readonly packageRoot: string;
  readonly stateRoot: string;
  readonly actionsPath: () => Promise<string | undefined>;
  readonly streamerBotVersion: () => Promise<string | undefined>;
  readonly streamerBotRunning?: () => Promise<boolean>;
  readonly moduleStatus?: () => readonly Readonly<Record<string, unknown>>[];
}

const REGISTRY = STREAMERBOT_TRIGGER_REGISTRY_107;
const VERSION_ALIASES = Object.freeze({ streamerBotVersion: REGISTRY.version, aliases: REGISTRY.aliases, unavailable: REGISTRY.unavailable });
const TRIGGER_BACKUP_RETENTION_FILES = 20;

export class StreamerBotTriggerAssuranceService {
  private lastStatus: Readonly<Record<string, unknown>> | undefined;
  private activity = new Map<string, { genuineEvents: number; failures: number; lastEventAt: string; lastAcknowledgedAt: string; lastFailureAt: string }>();

  public constructor(private readonly options: StreamerBotTriggerAssuranceOptions) {}

  public observe(event: { readonly platform: string; readonly eventType: string; readonly receivedAt: string; readonly metadata: { readonly simulated: boolean } }): void {
    if (event.metadata.simulated) return;
    const current = this.activity.get(event.platform) ?? { genuineEvents: 0, failures: 0, lastEventAt: '', lastAcknowledgedAt: '', lastFailureAt: '' };
    this.activity.set(event.platform, { ...current, genuineEvents: current.genuineEvents + 1, lastEventAt: event.receivedAt });
  }

  public acknowledge(platform: string, at = new Date().toISOString()): void {
    const current = this.activity.get(platform) ?? { genuineEvents: 0, failures: 0, lastEventAt: '', lastAcknowledgedAt: '', lastFailureAt: '' };
    this.activity.set(platform, { ...current, lastAcknowledgedAt: at });
  }

  public fail(platform: string, at = new Date().toISOString()): void {
    const current = this.activity.get(platform) ?? { genuineEvents: 0, failures: 0, lastEventAt: '', lastAcknowledgedAt: '', lastFailureAt: '' };
    this.activity.set(platform, { ...current, failures: current.failures + 1, lastFailureAt: at });
  }

  public async status(): Promise<Readonly<Record<string, unknown>>> {
    const actionsPath = await this.options.actionsPath();
    if (actionsPath === undefined) return this.cache({ available: false, ready: false, canSave: false, error: 'Select Streamer.bot.exe before checking triggers.', versionAliases: VERSION_ALIASES, activity: this.activityStatus(), moduleState: this.options.moduleStatus?.() ?? [] });
    let document: JsonRecord;
    try { document = await readJson(actionsPath); }
    catch (error) { return this.cache({ available: false, ready: false, canSave: false, actionsPath, error: errorMessage(error), versionAliases: VERSION_ALIASES, activity: this.activityStatus(), moduleState: this.options.moduleStatus?.() ?? [] }); }
    const detectedVersion = await this.options.streamerBotVersion();
    const streamerBotVersion = normalizeStreamerBotVersion(detectedVersion);
    const versionCompatible = streamerBotVersion === REGISTRY.version;
    let assessment: TriggerAssessment; let repair: ReturnType<typeof prepareRepair> | undefined;
    try { assessment = assessDocument(document); repair = versionCompatible ? prepareRepair(document) : undefined; }
    catch (error) { return this.cache({ available: true, ready: false, canSave: false, checkedAt: new Date().toISOString(), actionsPath, streamerBotVersion: detectedVersion ?? 'unknown', supportedStreamerBotVersion: REGISTRY.version, versionCompatible, schemaCompatible: false, error: `Streamer.bot actions schema is not safe to repair: ${errorMessage(error)}`, versionAliases: VERSION_ALIASES, activity: this.activityStatus(), moduleState: this.options.moduleStatus?.() ?? [] }); }
    const manifests = await this.packageManifestSummary();
    const ready = versionCompatible && assessment.ready;
    const versionIssue = versionCompatible ? undefined : detectedVersion === undefined
      ? `The installed Streamer.bot version could not be verified. Trigger repair is read-only until version ${REGISTRY.version} is detected.`
      : `Streamer.bot ${detectedVersion} is not covered by the tested ${REGISTRY.version} trigger registry. No trigger repair will be offered.`;
    return this.cache({
      available: true, ready, canSave: repair?.changes.repairable === true && repair.changes.total > 0, checkedAt: new Date().toISOString(), actionsPath,
      streamerBotVersion: detectedVersion ?? 'unknown', supportedStreamerBotVersion: REGISTRY.version, versionCompatible, schemaCompatible: true, versionIssue, versionAliases: VERSION_ALIASES, manifests, actions: assessment.results,
      issues: assessment.issues, repairPlan: repair?.changes ?? { repairable: false, total: 0, reason: versionIssue }, activity: this.activityStatus(), moduleState: this.options.moduleStatus?.() ?? [],
      connectionExplanation: ready
        ? `All supported trigger contracts are installed once and enabled.${assessment.compatibilityExceptions.length > 0 ? ' A 9/10 or Partially Connected label can reflect version-unavailable plain subscription pickers; it does not mean the Streamer.bot WebSocket is disconnected.' : ''}`
        : versionIssue ?? (assessment.missingActions.length > 0 ? 'One or more THSV intake actions are missing. Regenerate and import the current universal package before attempting trigger repair.' : 'Partially Connected means the WebSocket works, but one or more installed action triggers are missing, disabled, or duplicated.'),
    });
  }

  public async reconcile(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    requireApproval(input, 'approvedByCreator');
    if (await this.options.streamerBotRunning?.() === true) throw new TriggerAssuranceError(409, 'Close Streamer.bot before reconciling its actions file. The Bridge will not edit a live Streamer.bot database.');
    const actionsPath = await this.requireActionsPath();
    await this.requireSupportedVersion();
    const document = await readJson(actionsPath);
    const repair = prepareRepair(document);
    if (!repair.changes.repairable) throw new TriggerAssuranceError(409, repair.changes.reason ?? 'Trigger repair is unavailable. Regenerate and import the current universal package.');
    if (repair.changes.total === 0) return { reconciled: true, changed: 0, changes: repair.changes, status: await this.status() };
    if (managedActionBodyFingerprint(document) !== managedActionBodyFingerprint(repair.document)) throw new TriggerAssuranceError(409, 'Reconciliation was blocked because the proposed repair changed an action body. No Streamer.bot file was changed.');
    const backup = await this.createBackup(actionsPath, 'before-reconcile');
    let installed = false;
    try {
      await atomicWriteJson(actionsPath, repair.document); installed = true;
      const persisted = await readJson(actionsPath);
      if (!assessDocument(persisted).ready || managedActionBodyFingerprint(document) !== managedActionBodyFingerprint(persisted)) throw new Error('Post-write trigger validation did not match the approved repair plan.');
    } catch (error) {
      if (installed) await restoreVerifiedBackup(String(backup['path']), actionsPath, String(backup['sha256']));
      throw new TriggerAssuranceError(409, `Trigger reconciliation did not validate and the original actions file was ${installed ? 'restored automatically' : 'left unchanged'}: ${errorMessage(error)}`);
    }
    return { reconciled: true, changed: repair.changes.total, changes: repair.changes, backup, status: await this.status() };
  }

  public async backups(): Promise<Readonly<Record<string, unknown>>> {
    const root = this.backupRoot();
    try {
      const entries = await readdir(root);
      const backups = await Promise.all(entries.filter((name) => name.endsWith('.json') && !name.endsWith('.integrity.json')).map(async (name) => {
        const path = join(root, name); const verification = await verifyBackup(path);
        return { name, path, modifiedAt: (await stat(path)).mtime.toISOString(), ...verification };
      }));
      return { backups: backups.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt)).slice(0, TRIGGER_BACKUP_RETENTION_FILES), retention: { maximumFiles: TRIGGER_BACKUP_RETENTION_FILES } };
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { backups: [], retention: { maximumFiles: TRIGGER_BACKUP_RETENTION_FILES } }; throw error; }
  }

  public async restore(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    requireApproval(input, 'approvedByCreator');
    if (await this.options.streamerBotRunning?.() === true) throw new TriggerAssuranceError(409, 'Close Streamer.bot before restoring an actions backup.');
    if (!isRecord(input) || typeof input['name'] !== 'string' || basename(input['name']) !== input['name'] || !input['name'].endsWith('.json')) throw new TriggerAssuranceError(400, 'Choose a listed trigger backup.');
    const actionsPath = await this.requireActionsPath();
    const source = join(this.backupRoot(), input['name']);
    await readJson(source);
    const verification = await verifyBackup(source);
    if (verification.integrity === 'failed') throw new TriggerAssuranceError(409, 'The selected trigger backup failed its recorded SHA-256 check and was not restored.');
    const safetyBackup = await this.createBackup(actionsPath, 'before-restore');
    await restoreVerifiedBackup(source, actionsPath, verification.sha256);
    return { restored: true, restoredFrom: input['name'], integrity: verification.integrity, safetyBackup, status: await this.status() };
  }

  public lastKnownStatus(): Readonly<Record<string, unknown>> | undefined { return this.lastStatus; }

  private cache(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> { this.lastStatus = value; return value; }
  private activityStatus(): Readonly<Record<string, unknown>> { return Object.fromEntries([...this.activity.entries()].sort(([a], [b]) => a.localeCompare(b))); }
  private async requireActionsPath(): Promise<string> { const value = await this.options.actionsPath(); if (value === undefined) throw new TriggerAssuranceError(409, 'Select Streamer.bot.exe first.'); return value; }
  private async requireSupportedVersion(): Promise<void> { const detected = await this.options.streamerBotVersion(); if (normalizeStreamerBotVersion(detected) !== REGISTRY.version) throw new TriggerAssuranceError(409, detected === undefined ? `The installed Streamer.bot version could not be verified. Repair requires the tested ${REGISTRY.version} registry.` : `Streamer.bot ${detected} is not covered by the tested ${REGISTRY.version} trigger registry. No file was changed.`); }
  private backupRoot(): string { return join(this.options.stateRoot, 'streamerbot-action-backups'); }
  private async createBackup(actionsPath: string, reason: string): Promise<Readonly<Record<string, unknown>>> {
    const root = this.backupRoot(); await mkdir(root, { recursive: true, mode: 0o700 });
    const timestamp = new Date().toISOString().replace(/[:.]/gu, '-');
    const name = `${timestamp}-${randomUUID()}-${reason}.json`; const path = join(root, name); const sourceBytes = await readFile(actionsPath); const sha256 = sha256Of(sourceBytes);
    await retryTransient(() => copyFile(actionsPath, path));
    const copiedBytes = await readFile(path);
    if (sha256Of(copiedBytes) !== sha256) { await rm(path, { force: true }); throw new TriggerAssuranceError(409, 'The trigger rollback backup did not match the source file. No Streamer.bot file was changed.'); }
    const integrityPath = backupIntegrityPath(path);
    await atomicWriteJson(integrityPath, { schemaVersion: 1, name, reason, createdAt: new Date().toISOString(), sha256 });
    const retention = await pruneTriggerBackups(root);
    return { name, path, integrityPath, integrity: 'verified', sha256, retention };
  }
  private async packageManifestSummary(): Promise<readonly Readonly<Record<string, unknown>>[]> {
    const packageRoot = resolve(this.options.packageRoot);
    const folders = await readdir(packageRoot, { withFileTypes: true });
    const values: Readonly<Record<string, unknown>>[] = [];
    for (const folder of folders.filter((entry) => entry.isDirectory())) {
      try {
        const manifest = await readJson(join(packageRoot, folder.name, 'manifest.json'));
        const actions = Array.isArray(manifest['actions']) ? manifest['actions'] : [];
        values.push({ packageId: folder.name, name: manifest['name'], version: manifest['version'], actionCount: actions.length, hasTriggerContract: manifest['triggerContract'] !== undefined || manifest['manualTriggerSetup'] !== undefined });
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    return values.sort((left, right) => String(left['packageId']).localeCompare(String(right['packageId'])));
  }
}

export class TriggerAssuranceError extends Error { public constructor(public readonly statusCode: number, message: string) { super(message); } }

function reconcileContract(contract: StreamerBotTriggerContract, actions: readonly InstalledAction[]): Readonly<Record<string, unknown>> & { readonly state: string; readonly actionName: string; readonly missingTriggerTypes: readonly number[] } {
  const action = actions.find((candidate) => candidate.name === contract.actionName);
  const enabledTypes = new Set(action?.triggers.filter((trigger) => trigger.enabled).map((trigger) => trigger.type) ?? []);
  const missingTriggerTypes = contract.triggerTypes.filter((type) => !enabledTypes.has(type));
  const state = action === undefined ? 'missing-action' : !action.enabled ? 'disabled-action' : missingTriggerTypes.length > 0 ? 'missing-triggers' : 'ready';
  return { packageId: contract.packageId, actionName: contract.actionName, state, enabledTriggerCount: action?.triggers.filter((trigger) => trigger.enabled).length ?? 0, expectedTriggerTypes: contract.triggerTypes, triggerLabels: contract.triggerLabels, missingTriggerTypes, unavailableAliases: contract.unavailableAliases ?? [] };
}

interface TriggerAssessment {
  readonly ready: boolean;
  readonly results: readonly (Readonly<Record<string, unknown>> & { readonly state: string; readonly actionName: string; readonly missingTriggerTypes: readonly number[] })[];
  readonly issues: Readonly<Record<string, unknown>>;
  readonly missingActions: readonly string[];
  readonly compatibilityExceptions: readonly Readonly<Record<string, unknown>>[];
}

interface TriggerRepairChanges {
  readonly repairable: boolean;
  readonly reason?: string;
  readonly total: number;
  readonly created: number;
  readonly reenabled: number;
  readonly disabledDuplicates: number;
  readonly enabledActions: number;
  readonly items: readonly Readonly<Record<string, unknown>>[];
}

function assessDocument(document: JsonRecord): TriggerAssessment {
  const actions = readActions(document);
  const results = REGISTRY.contracts.map((contract) => reconcileContract(contract, actions));
  const duplicateEnabledTriggers = actions.flatMap((action) => enabledDuplicateTriggers(action, REGISTRY.contracts.find((contract) => contract.actionName === action.name)?.triggerTypes));
  const missingActions = results.filter((entry) => entry.state === 'missing-action').map((entry) => entry.actionName);
  const disabledActions = results.filter((entry) => entry.state === 'disabled-action').map((entry) => entry.actionName);
  const missingTriggers = results.flatMap((entry) => entry.missingTriggerTypes.map((type) => ({ actionName: entry.actionName, type })));
  const compatibilityExceptions = results.flatMap((entry) => (entry['unavailableAliases'] as readonly string[]).map((alias) => ({ actionName: entry.actionName, alias, explanation: REGISTRY.unavailable[alias] })));
  return {
    ready: missingActions.length === 0 && disabledActions.length === 0 && missingTriggers.length === 0 && duplicateEnabledTriggers.length === 0,
    results, missingActions, compatibilityExceptions,
    issues: { missingActions, disabledActions, missingTriggers, duplicateEnabledTriggers, compatibilityExceptions },
  };
}

function prepareRepair(document: JsonRecord): { readonly document: JsonRecord; readonly changes: TriggerRepairChanges } {
  const proposed = structuredClone(document);
  const actions = readActions(proposed);
  const missingActions = REGISTRY.contracts.filter((contract) => !actions.some((action) => action.name === contract.actionName)).map((contract) => contract.actionName);
  if (missingActions.length > 0) return { document: proposed, changes: { repairable: false, reason: `Regenerate and import the current universal package first. Missing managed actions: ${missingActions.join(', ')}.`, total: 0, created: 0, reenabled: 0, disabledDuplicates: 0, enabledActions: 0, items: [] } };
  const items: Readonly<Record<string, unknown>>[] = [];
  let created = 0; let reenabled = 0; let disabledDuplicates = 0; let enabledActions = 0;
  for (const contract of REGISTRY.contracts) {
    const action = actions.find((candidate) => candidate.name === contract.actionName);
    if (action === undefined) continue;
    if (action.source['enabled'] !== true) { action.source['enabled'] = true; enabledActions += 1; items.push({ kind: 'enable-action', actionName: contract.actionName }); }
    const triggers = mutableRawTriggers(action.source);
    const fingerprints = new Set<string>();
    for (const trigger of triggers) {
      if (trigger['enabled'] === false) continue;
      const fingerprint = triggerFingerprint(trigger);
      if (fingerprints.has(fingerprint)) { trigger['enabled'] = false; disabledDuplicates += 1; items.push({ kind: 'disable-duplicate', actionName: contract.actionName, triggerType: trigger['type'], triggerId: trigger['id'] }); }
      else fingerprints.add(fingerprint);
    }
    for (const type of contract.triggerTypes) {
      const enabled = triggers.filter((trigger) => trigger['enabled'] !== false && trigger['type'] === type);
      for (const duplicate of enabled.slice(1)) { duplicate['enabled'] = false; disabledDuplicates += 1; items.push({ kind: 'disable-duplicate-type', actionName: contract.actionName, triggerType: type, triggerId: duplicate['id'] }); }
      if (enabled.length > 0) continue;
      const disabled = triggers.find((trigger) => trigger['enabled'] === false && trigger['type'] === type);
      if (disabled !== undefined) { disabled['enabled'] = true; reenabled += 1; items.push({ kind: 'reenable-trigger', actionName: contract.actionName, triggerType: type, triggerId: disabled['id'] }); continue; }
      const trigger = createNative107Trigger(type); triggers.push(trigger); created += 1; items.push({ kind: 'create-trigger', actionName: contract.actionName, triggerType: type, triggerId: trigger['id'] });
    }
  }
  const total = created + reenabled + disabledDuplicates + enabledActions;
  const after = assessDocument(proposed);
  if (!after.ready) return { document: proposed, changes: { repairable: false, reason: 'The proposed repair did not produce one enabled copy of every supported trigger. No file will be changed.', total, created, reenabled, disabledDuplicates, enabledActions, items } };
  return { document: proposed, changes: { repairable: true, total, created, reenabled, disabledDuplicates, enabledActions, items } };
}

function readActions(document: JsonRecord): readonly InstalledAction[] {
  if (!Array.isArray(document['actions'])) throw new TriggerAssuranceError(422, 'Streamer.bot actions.json does not contain an actions array.');
  return document['actions'].flatMap((value): InstalledAction[] => {
    if (!isRecord(value) || typeof value['id'] !== 'string' || typeof value['name'] !== 'string') return [];
    return [{ id: value['id'], name: value['name'], group: typeof value['group'] === 'string' ? value['group'] : '', enabled: value['enabled'] !== false, triggers: rawTriggers(value).flatMap((trigger): InstalledTrigger[] => typeof trigger['id'] === 'string' && typeof trigger['type'] === 'number' ? [{ id: trigger['id'], type: trigger['type'], enabled: trigger['enabled'] !== false, fingerprint: triggerFingerprint(trigger) }] : []), source: value }];
  });
}

function rawTriggers(action: JsonRecord): JsonRecord[] { return Array.isArray(action['triggers']) ? action['triggers'].filter(isRecord) : []; }
function mutableRawTriggers(action: JsonRecord): JsonRecord[] {
  if (!Array.isArray(action['triggers'])) action['triggers'] = [];
  const triggers = action['triggers'];
  if (!Array.isArray(triggers) || !triggers.every(isRecord)) throw new TriggerAssuranceError(422, 'A managed Streamer.bot action contains an invalid triggers array. No Streamer.bot file was changed.');
  return triggers;
}
function createNative107Trigger(type: number): JsonRecord {
  return { ...(REGISTRY.defaults[type] ?? {}), id: randomUUID(), type, enabled: true, exclusions: [] };
}
function triggerFingerprint(trigger: JsonRecord): string { const copy = Object.fromEntries(Object.entries(trigger).filter(([key]) => !['id', 'enabled', 'exclusions'].includes(key)).sort(([a], [b]) => a.localeCompare(b))); return createHash('sha256').update(JSON.stringify(copy)).digest('hex'); }
function enabledDuplicateTriggers(action: InstalledAction, uniqueTypes: readonly number[] = []): readonly Readonly<Record<string, unknown>>[] {
  const seenFingerprints = new Map<string, string>(); const seenTypes = new Map<number, string>(); const duplicateIds = new Set<string>(); const duplicates: Readonly<Record<string, unknown>>[] = [];
  for (const trigger of action.triggers.filter((entry) => entry.enabled)) {
    const fingerprintMatch = seenFingerprints.get(trigger.fingerprint); const typeMatch = uniqueTypes.includes(trigger.type) ? seenTypes.get(trigger.type) : undefined;
    const kept = fingerprintMatch ?? typeMatch;
    if (kept !== undefined && !duplicateIds.has(trigger.id)) { duplicateIds.add(trigger.id); duplicates.push({ actionName: action.name, triggerType: trigger.type, keptTriggerId: kept, duplicateTriggerId: trigger.id }); }
    else { seenFingerprints.set(trigger.fingerprint, trigger.id); if (uniqueTypes.includes(trigger.type)) seenTypes.set(trigger.type, trigger.id); }
  }
  return duplicates;
}
function managedActionBodyFingerprint(document: JsonRecord): string {
  const managedNames = new Set(REGISTRY.contracts.map((contract) => contract.actionName));
  const bodies = readActions(document).filter((action) => managedNames.has(action.name)).map((action) => Object.fromEntries(Object.entries(action.source).filter(([key]) => key !== 'triggers' && key !== 'enabled')));
  return sha256Of(Buffer.from(JSON.stringify(bodies)));
}
function requireApproval(input: unknown, field: string): void { if (!isRecord(input) || input[field] !== true) throw new TriggerAssuranceError(403, 'This action requires explicit creator approval.'); }
function isRecord(value: unknown): value is JsonRecord { return typeof value === 'object' && value !== null && !Array.isArray(value); }
async function readJson(path: string): Promise<JsonRecord> { const value = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/u, '')) as unknown; if (!isRecord(value)) throw new TriggerAssuranceError(422, 'Expected a JSON object.'); return value; }
async function atomicWriteJson(path: string, value: JsonRecord): Promise<void> { await atomicWriteBytes(path, Buffer.from(`\uFEFF${JSON.stringify(value)}`, 'utf8')); }
async function atomicWriteBytes(path: string, bytes: Buffer): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { await retryTransient(() => writeFile(temporary, bytes, { mode: 0o600 })); await retryTransient(() => rename(temporary, path)); }
  finally { await rm(temporary, { force: true }).catch(() => undefined); }
}
async function retryTransient<T>(operation: () => Promise<T>): Promise<T> {
  const delays = [0, 50, 150, 350]; let last: unknown;
  for (const delay of delays) {
    if (delay > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
    try { return await operation(); } catch (error) { last = error; if (!isTransientFileError(error)) throw error; }
  }
  throw last;
}
function isTransientFileError(error: unknown): boolean { return ['EACCES', 'EBUSY', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? ''); }
function sha256Of(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
function backupIntegrityPath(path: string): string { return `${path}.integrity.json`; }
async function pruneTriggerBackups(root: string): Promise<Readonly<Record<string, number>>> {
  const names = await readdir(root);
  const backupNames = names.filter((name) => name.endsWith('.json') && !name.endsWith('.integrity.json'));
  const entries = await Promise.all(backupNames.map(async (name) => ({ name, modifiedAt: (await stat(join(root, name))).mtimeMs })));
  entries.sort((left, right) => right.modifiedAt - left.modifiedAt || right.name.localeCompare(left.name));
  const removed = entries.slice(TRIGGER_BACKUP_RETENTION_FILES);
  for (const entry of removed) {
    const path = join(root, entry.name);
    await rm(path, { force: true });
    await rm(backupIntegrityPath(path), { force: true });
  }
  const retained = new Set(entries.slice(0, TRIGGER_BACKUP_RETENTION_FILES).map((entry) => entry.name));
  const orphanedSidecars = names.filter((name) => name.endsWith('.json.integrity.json') && !retained.has(name.slice(0, -'.integrity.json'.length)));
  for (const name of orphanedSidecars) await rm(join(root, name), { force: true });
  return { maximumFiles: TRIGGER_BACKUP_RETENTION_FILES, retained: Math.min(entries.length, TRIGGER_BACKUP_RETENTION_FILES), pruned: removed.length, orphanedSidecarsPruned: orphanedSidecars.length };
}
async function verifyBackup(path: string): Promise<{ readonly integrity: 'verified' | 'legacy-unverified' | 'failed'; readonly sha256: string }> {
  const sha256 = sha256Of(await readFile(path));
  try {
    const metadata = await readJson(backupIntegrityPath(path));
    return { integrity: metadata['sha256'] === sha256 ? 'verified' : 'failed', sha256 };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { integrity: 'legacy-unverified', sha256 };
    return { integrity: 'failed', sha256 };
  }
}
async function restoreVerifiedBackup(source: string, destination: string, expectedSha256: string): Promise<void> {
  const bytes = await readFile(source);
  if (sha256Of(bytes) !== expectedSha256) throw new TriggerAssuranceError(409, 'The rollback backup failed SHA-256 verification. The destination was not changed.');
  await atomicWriteBytes(destination, bytes);
  if (sha256Of(await readFile(destination)) !== expectedSha256) throw new TriggerAssuranceError(409, 'The restored Streamer.bot actions file failed SHA-256 verification.');
}
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
