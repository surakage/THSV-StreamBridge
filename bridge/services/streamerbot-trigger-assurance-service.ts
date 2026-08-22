import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

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

interface ExpectedActionContract {
  readonly packageId: string;
  readonly actionName: string;
  readonly triggerTypes: readonly number[];
  readonly triggerLabels: readonly string[];
  readonly unavailableAliases?: readonly string[];
}

export interface StreamerBotTriggerAssuranceOptions {
  readonly packageRoot: string;
  readonly stateRoot: string;
  readonly actionsPath: () => Promise<string | undefined>;
  readonly streamerBotRunning?: () => Promise<boolean>;
  readonly moduleStatus?: () => readonly Readonly<Record<string, unknown>>[];
}

const VERSION_ALIASES = Object.freeze({
  streamerBotVersion: '1.0.7',
  aliases: Object.freeze({
    'TwitchChatMessage': 'Twitch > Chat > Chat Message',
    'YouTubeMessage': 'YouTube > Chat > Chat Message',
    'YouTubeMembershipGift': 'YouTube > Membership > Gift Membership Received',
    'YouTubeBroadcastStarted': 'YouTube > Broadcast > Broadcast Monitoring Started',
    'KickChatMessage': 'Kick > Chat > Chat Message',
  }),
  unavailable: Object.freeze({
    'TwitchSub': 'Streamer.bot 1.0.7 does not expose a separate plain Subscription picker in this installation.',
    'KickSubscription': 'Streamer.bot 1.0.7 does not expose a separate plain Subscription picker in this installation.',
  }),
});

// Streamer.bot persists numeric trigger types in data/actions.json. These are the verified 1.0.7
// equivalents of the package contract. Gift Bomb is represented by the Twitch gift trigger with
// subtype/options, so it intentionally does not create a second required numeric type.
const NATIVE_107_CONTRACTS: readonly ExpectedActionContract[] = [
  {
    packageId: 'native-platform-intake', actionName: 'THSV Twitch - Intake',
    triggerTypes: [133, 101, 102, 104, 105, 106, 107, 112, 154, 155],
    triggerLabels: ['Chat Message', 'Follow', 'Cheer', 'Subscription/Resubscription', 'Gift Subscription/Gift Bomb', 'Raid', 'Reward Redemption', 'Stream Online', 'Stream Offline'],
    unavailableAliases: ['TwitchSub'],
  },
  {
    packageId: 'native-platform-intake', actionName: 'THSV YouTube - Intake',
    triggerTypes: [4003, 4006, 4007, 4030, 4018, 4008, 4009, 4015, 4019, 4002],
    triggerLabels: ['Chat Message', 'Super Chat', 'Super Sticker', 'Jewels Gifted', 'New Subscriber', 'New Sponsor', 'Member Milestone', 'Gift Membership Received', 'Broadcast Monitoring Started', 'Broadcast Ended'],
  },
  {
    packageId: 'native-platform-intake', actionName: 'THSV Kick - Intake',
    triggerTypes: [35010, 35011, 35016, 35015, 35017, 35025, 35024, 35012, 35013],
    triggerLabels: ['Chat Message', 'Follow', 'Resubscription', 'Gift Subscription', 'Mass Gift Subscription', 'Kicks Gifted', 'Reward Redemption', 'Stream Online', 'Stream Offline'],
    unavailableAliases: ['KickSubscription'],
  },
];

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
    const actions = readActions(document);
    const manifests = await this.packageManifestSummary();
    const results = NATIVE_107_CONTRACTS.map((contract) => reconcileContract(contract, actions));
    const duplicateEnabledTriggers = actions.flatMap(enabledDuplicateTriggers);
    const missingActions = results.filter((entry) => entry.state === 'missing-action').map((entry) => entry.actionName);
    const disabledActions = results.filter((entry) => entry.state === 'disabled-action').map((entry) => entry.actionName);
    const missingTriggers = results.flatMap((entry) => entry.missingTriggerTypes.map((type) => ({ actionName: entry.actionName, type })));
    const compatibilityExceptions = results.flatMap((entry) => (entry['unavailableAliases'] as readonly string[]).map((alias) => ({ actionName: entry.actionName, alias, explanation: VERSION_ALIASES.unavailable[alias as keyof typeof VERSION_ALIASES.unavailable] })));
    const ready = missingActions.length === 0 && disabledActions.length === 0 && missingTriggers.length === 0 && duplicateEnabledTriggers.length === 0;
    return this.cache({
      available: true, ready, canSave: duplicateEnabledTriggers.length === 0, checkedAt: new Date().toISOString(), actionsPath,
      streamerBotVersion: VERSION_ALIASES.streamerBotVersion, versionAliases: VERSION_ALIASES, manifests, actions: results,
      issues: { missingActions, disabledActions, missingTriggers, duplicateEnabledTriggers, compatibilityExceptions }, activity: this.activityStatus(), moduleState: this.options.moduleStatus?.() ?? [],
      connectionExplanation: ready
        ? `All supported trigger contracts are installed once and enabled.${compatibilityExceptions.length > 0 ? ' A 9/10 or Partially Connected label can reflect version-unavailable plain subscription pickers; it does not mean the Streamer.bot WebSocket is disconnected.' : ''}`
        : 'Partially Connected means the WebSocket works, but one or more installed action triggers are missing, disabled, duplicated, or unavailable in this Streamer.bot version.',
    });
  }

  public async reconcile(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    requireApproval(input, 'approvedByCreator');
    if (await this.options.streamerBotRunning?.() === true) throw new TriggerAssuranceError(409, 'Close Streamer.bot before reconciling its actions file. The Bridge will not edit a live Streamer.bot database.');
    const actionsPath = await this.requireActionsPath();
    const document = await readJson(actionsPath);
    const actions = readActions(document);
    const backup = await this.createBackup(actionsPath, 'before-reconcile');
    let changed = 0;
    for (const contract of NATIVE_107_CONTRACTS) {
      const action = actions.find((candidate) => candidate.name === contract.actionName);
      if (action === undefined) continue;
      if (action.source['enabled'] !== true) { action.source['enabled'] = true; changed += 1; }
      const seen = new Set<string>();
      for (const raw of rawTriggers(action.source)) {
        const fingerprint = triggerFingerprint(raw);
        if (raw['enabled'] !== false && seen.has(fingerprint)) { raw['enabled'] = false; changed += 1; }
        else if (raw['enabled'] !== false) seen.add(fingerprint);
        if (typeof raw['type'] === 'number' && contract.triggerTypes.includes(raw['type']) && raw['enabled'] === false && !seen.has(fingerprint)) { raw['enabled'] = true; seen.add(fingerprint); changed += 1; }
      }
    }
    const after = readActions(document).flatMap(enabledDuplicateTriggers);
    if (after.length > 0) throw new TriggerAssuranceError(409, 'Reconciliation was blocked because enabled duplicate triggers remain. No Streamer.bot file was changed.');
    if (changed > 0) await atomicWriteJson(actionsPath, document);
    return { reconciled: true, changed, backup, status: await this.status() };
  }

  public async backups(): Promise<Readonly<Record<string, unknown>>> {
    const root = this.backupRoot();
    try {
      const entries = await readdir(root);
      const backups = await Promise.all(entries.filter((name) => name.endsWith('.json')).map(async (name) => ({ name, path: join(root, name), modifiedAt: (await stat(join(root, name))).mtime.toISOString() })));
      return { backups: backups.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt)).slice(0, 20) };
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { backups: [] }; throw error; }
  }

  public async restore(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    requireApproval(input, 'approvedByCreator');
    if (await this.options.streamerBotRunning?.() === true) throw new TriggerAssuranceError(409, 'Close Streamer.bot before restoring an actions backup.');
    if (!isRecord(input) || typeof input['name'] !== 'string' || basename(input['name']) !== input['name'] || !input['name'].endsWith('.json')) throw new TriggerAssuranceError(400, 'Choose a listed trigger backup.');
    const actionsPath = await this.requireActionsPath();
    const source = join(this.backupRoot(), input['name']);
    await readJson(source);
    const safetyBackup = await this.createBackup(actionsPath, 'before-restore');
    const temporary = `${actionsPath}.${randomUUID()}.tmp`;
    await copyFile(source, temporary); await rename(temporary, actionsPath);
    return { restored: true, restoredFrom: input['name'], safetyBackup, status: await this.status() };
  }

  public lastKnownStatus(): Readonly<Record<string, unknown>> | undefined { return this.lastStatus; }

  private cache(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> { this.lastStatus = value; return value; }
  private activityStatus(): Readonly<Record<string, unknown>> { return Object.fromEntries([...this.activity.entries()].sort(([a], [b]) => a.localeCompare(b))); }
  private async requireActionsPath(): Promise<string> { const value = await this.options.actionsPath(); if (value === undefined) throw new TriggerAssuranceError(409, 'Select Streamer.bot.exe first.'); return value; }
  private backupRoot(): string { return join(this.options.stateRoot, 'streamerbot-action-backups'); }
  private async createBackup(actionsPath: string, reason: string): Promise<Readonly<Record<string, unknown>>> {
    const root = this.backupRoot(); await mkdir(root, { recursive: true, mode: 0o700 });
    const timestamp = new Date().toISOString().replace(/[:.]/gu, '-');
    const name = `${timestamp}-${reason}.json`; const path = join(root, name); await copyFile(actionsPath, path);
    const bytes = await readFile(path); return { name, path, sha256: createHash('sha256').update(bytes).digest('hex') };
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

function reconcileContract(contract: ExpectedActionContract, actions: readonly InstalledAction[]): Readonly<Record<string, unknown>> & { readonly state: string; readonly actionName: string; readonly missingTriggerTypes: readonly number[] } {
  const action = actions.find((candidate) => candidate.name === contract.actionName);
  const enabledTypes = new Set(action?.triggers.filter((trigger) => trigger.enabled).map((trigger) => trigger.type) ?? []);
  const missingTriggerTypes = contract.triggerTypes.filter((type) => !enabledTypes.has(type));
  const state = action === undefined ? 'missing-action' : !action.enabled ? 'disabled-action' : missingTriggerTypes.length > 0 ? 'missing-triggers' : 'ready';
  return { packageId: contract.packageId, actionName: contract.actionName, state, enabledTriggerCount: action?.triggers.filter((trigger) => trigger.enabled).length ?? 0, expectedTriggerTypes: contract.triggerTypes, triggerLabels: contract.triggerLabels, missingTriggerTypes, unavailableAliases: contract.unavailableAliases ?? [] };
}

function readActions(document: JsonRecord): readonly InstalledAction[] {
  if (!Array.isArray(document['actions'])) throw new TriggerAssuranceError(422, 'Streamer.bot actions.json does not contain an actions array.');
  return document['actions'].flatMap((value): InstalledAction[] => {
    if (!isRecord(value) || typeof value['id'] !== 'string' || typeof value['name'] !== 'string') return [];
    return [{ id: value['id'], name: value['name'], group: typeof value['group'] === 'string' ? value['group'] : '', enabled: value['enabled'] !== false, triggers: rawTriggers(value).flatMap((trigger): InstalledTrigger[] => typeof trigger['id'] === 'string' && typeof trigger['type'] === 'number' ? [{ id: trigger['id'], type: trigger['type'], enabled: trigger['enabled'] !== false, fingerprint: triggerFingerprint(trigger) }] : []), source: value }];
  });
}

function rawTriggers(action: JsonRecord): JsonRecord[] { return Array.isArray(action['triggers']) ? action['triggers'].filter(isRecord) : []; }
function triggerFingerprint(trigger: JsonRecord): string { const copy = Object.fromEntries(Object.entries(trigger).filter(([key]) => !['id', 'enabled', 'exclusions'].includes(key)).sort(([a], [b]) => a.localeCompare(b))); return createHash('sha256').update(JSON.stringify(copy)).digest('hex'); }
function enabledDuplicateTriggers(action: InstalledAction): readonly Readonly<Record<string, unknown>>[] { const seen = new Map<string, string>(); const duplicates: Readonly<Record<string, unknown>>[] = []; for (const trigger of action.triggers.filter((entry) => entry.enabled)) { const previous = seen.get(trigger.fingerprint); if (previous !== undefined) duplicates.push({ actionName: action.name, triggerType: trigger.type, keptTriggerId: previous, duplicateTriggerId: trigger.id }); else seen.set(trigger.fingerprint, trigger.id); } return duplicates; }
function requireApproval(input: unknown, field: string): void { if (!isRecord(input) || input[field] !== true) throw new TriggerAssuranceError(403, 'This action requires explicit creator approval.'); }
function isRecord(value: unknown): value is JsonRecord { return typeof value === 'object' && value !== null && !Array.isArray(value); }
async function readJson(path: string): Promise<JsonRecord> { const value = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/u, '')) as unknown; if (!isRecord(value)) throw new TriggerAssuranceError(422, 'Expected a JSON object.'); return value; }
async function atomicWriteJson(path: string, value: JsonRecord): Promise<void> { const temporary = `${path}.${randomUUID()}.tmp`; await writeFile(temporary, `\uFEFF${JSON.stringify(value)}`, { encoding: 'utf8', mode: 0o600 }); await rename(temporary, path); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
