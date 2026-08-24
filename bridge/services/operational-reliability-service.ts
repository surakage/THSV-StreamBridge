import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { NormalizedEvent } from '../../schemas/event.js';
import { writeJsonAtomic } from './atomic-state.js';
import type { Logger } from './logger.js';

type JsonRecord = Record<string, unknown>;

export interface OperationalReliabilityOptions {
  readonly dataRoot: string;
  readonly expectedVersion: string;
  readonly packageRoot: string;
  readonly streamerBotPackageRoot: string;
  readonly logger: Logger;
  readonly diagnostics: () => Readonly<JsonRecord>;
  readonly readiness: () => Readonly<JsonRecord>;
  readonly triggerStatus: () => Promise<Readonly<JsonRecord>>;
  readonly reconcileTriggers: (input: unknown) => Promise<Readonly<JsonRecord>>;
  readonly sceneStatus: () => Readonly<JsonRecord>;
  readonly refreshObsScenes?: () => Promise<Readonly<JsonRecord>>;
  readonly overlayStatus?: () => Readonly<JsonRecord>;
  readonly broadcastStatus?: () => Readonly<JsonRecord>;
  readonly listAddOns?: () => Promise<readonly Readonly<JsonRecord>[]>;
  readonly sampleIntervalMs?: number;
  readonly now?: () => Date;
}

interface TimelineEntry {
  readonly id: string;
  readonly receivedAt: string;
  readonly eventType: string;
  readonly platform: string;
  readonly simulated: boolean;
  readonly source: string;
  readonly outcome: 'observed' | 'controller-success' | 'controller-failure';
  readonly summary: string;
}

interface ActiveSession {
  readonly id: string;
  readonly startedAt: string;
  readonly source: 'provider-events' | 'verified-broadcast-status';
  readonly platforms: Set<string>;
  readonly counts: Map<string, number>;
  readonly failures: string[];
  readonly expectedSignals: Set<string>;
}

interface RecoveryState {
  attempts: number;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  nextAttemptAt?: string;
}

const TIMELINE_LIMIT = 600;
const TIMELINE_RETENTION_MS = 30 * 60_000;
const MAXIMUM_RECOVERY_ATTEMPTS = 5;
const MAXIMUM_RECOVERY_DELAY_MS = 60_000;
const EXPECTED_LIVE_SIGNALS = Object.freeze([
  'stream.online',
  'stream.offline',
  'system.timed',
  'addon.thsv.starting-soon-countdown',
  'addon.thsv.random-clip-player',
  'addon.thsv.raid-scout',
  'addon.thsv.ad-break-companion',
]);

export class OperationalReliabilityService {
  private timeline: TimelineEntry[] = [];
  private activeSession: ActiveSession | undefined;
  private latestReportValue: Readonly<JsonRecord> | undefined;
  private writes: Promise<void> = Promise.resolve();
  private timer: NodeJS.Timeout | undefined;
  private sampling = false;
  private lastHealth: Readonly<JsonRecord> | undefined;
  private readonly recovery: RecoveryState = { attempts: 0 };

  public constructor(private readonly options: OperationalReliabilityOptions) {}

  public async start(): Promise<void> {
    await Promise.all([this.loadTimeline(), this.loadLatestReport()]);
    await this.sample();
    this.timer = setInterval(() => void this.sample(), this.options.sampleIntervalMs ?? 10_000);
    this.timer.unref();
  }

  public async stop(): Promise<void> {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    if (this.activeSession !== undefined) await this.finishSession('bridge-shutdown');
    await this.flush();
  }

  public observe(event: NormalizedEvent): void {
    const entry = redactEvent(event);
    this.timeline = pruneTimeline([...this.timeline, entry], this.now().getTime());
    this.queueTimelineWrite();
    if (!event.metadata.simulated) this.observeSession(event, entry);
  }

  public recoverLiveSession(platforms: readonly string[], startedAt?: string): void {
    if (this.activeSession === undefined) this.activeSession = newSession(startedAt ?? this.now().toISOString(), 'verified-broadcast-status');
    for (const platform of platforms) this.activeSession.platforms.add(platform);
    this.activeSession.expectedSignals.add('stream.online');
  }

  public async endRecoveredLiveSession(): Promise<void> {
    if (this.activeSession === undefined) return;
    this.activeSession.platforms.clear();
    this.activeSession.expectedSignals.add('stream.offline');
    await this.finishSession('verified-broadcast-stop');
  }

  public async driftStatus(): Promise<Readonly<JsonRecord>> {
    const expected = this.options.expectedVersion;
    const issues: JsonRecord[] = [];
    const components: JsonRecord[] = [];
    const packageVersion = await readVersion(join(this.options.packageRoot, 'package.json'));
    addVersionComponent(components, issues, 'core', 'StreamBridge core', packageVersion, expected, false);
    addVersionComponent(components, issues, 'launcher', 'Launcher package', packageVersion, expected, false);

    for (const manifest of await packageManifests(this.options.streamerBotPackageRoot)) {
      addVersionComponent(components, issues, 'streamerbot-package', String(manifest['packageId']), stringValue(manifest['version']), expected, false);
      const importFiles = Array.isArray(manifest['imports']) ? manifest['imports'] as string[] : [];
      for (const name of importFiles) {
        const ready = name.endsWith(`-${expected}.sb`);
        const item = { category: 'streamerbot-import', name, current: ready ? expected : versionFromFilename(name), expected, ready, repair: 'regenerate-import' };
        components.push(item); if (!ready) issues.push(item);
      }
    }

    const addOns = await this.options.listAddOns?.() ?? [];
    for (const addOn of addOns) addVersionComponent(components, issues, 'addon', stringValue(addOn['moduleId']) ?? 'unknown add-on', stringValue(addOn['version']), expected, false);

    const triggers = await this.options.triggerStatus();
    const triggerReady = triggers['ready'] === true;
    const triggerItem = { category: 'streamerbot-actions', name: 'Installed Streamer.bot actions and triggers', current: triggerReady ? 'matched' : 'drifted', expected: 'matched', ready: triggerReady, repair: 'backup-and-reconcile', detail: triggers['connectionExplanation'] ?? triggers['error'] };
    components.push(triggerItem); if (!triggerReady) issues.push(triggerItem);
    const immutableIssues = issues.filter((issue) => issue['repair'] !== 'backup-and-reconcile');
    return {
      checkedAt: this.now().toISOString(), expectedVersion: expected, ready: issues.length === 0,
      repairable: issues.length > 0 && immutableIssues.length === 0, components, issues,
      repairPolicy: { backupBeforeMutation: true, streamerBotMustBeClosed: true, releaseFilesNeverRewrittenInPlace: true },
    };
  }

  public async repair(input: unknown): Promise<Readonly<JsonRecord>> {
    requireApproval(input);
    const before = await this.driftStatus();
    const issues = Array.isArray(before['issues']) ? before['issues'] as JsonRecord[] : [];
    if (issues.length === 0) return { repaired: true, changed: 0, before, after: before, message: 'Installed state already matches this release.' };
    const immutable = issues.filter((issue) => issue['repair'] !== 'backup-and-reconcile');
    if (immutable.length > 0) throw new OperationalReliabilityError(409, 'Release-owned files are mismatched. Apply the verified StreamBridge update before repairing Streamer.bot actions. No files were changed.');
    const result = await this.options.reconcileTriggers({ approvedByCreator: true });
    return { repaired: true, changed: result['changed'] ?? 0, backup: result['backup'], before, after: await this.driftStatus() };
  }

  public async rehearsal(): Promise<Readonly<JsonRecord>> {
    const diagnostics = this.options.diagnostics();
    const readiness = this.options.readiness();
    const triggers = await this.options.triggerStatus();
    const scenes = this.options.sceneStatus();
    const overlay = this.options.overlayStatus?.() ?? {};
    const modules = recordArray(diagnostics['modules']);
    const timed = recordValue(diagnostics['timedActions']);
    const steps = [
      check('bridge-ready', readiness['ready'] === true, readiness['ready'] === true ? 'Core readiness passed.' : `${String(recordArray(readiness['blockers']).length)} readiness blocker(s) remain.`),
      check('streamerbot-triggers', triggers['ready'] === true, stringValue(triggers['connectionExplanation']) ?? stringValue(triggers['error']) ?? 'Trigger contract inspected.'),
      check('scene-selection', sceneCount(scenes) > 0, `${String(sceneCount(scenes))} provider scene(s) are available for selectors.`),
      check('countdown-overlay', moduleReady(modules, 'thsv.starting-soon-countdown'), moduleDetail(modules, 'thsv.starting-soon-countdown')),
      check('ad-overlay', moduleReady(modules, 'thsv.ad-break-companion'), moduleDetail(modules, 'thsv.ad-break-companion')),
      check('chat-and-alert-overlays', Object.keys(overlay).length > 0, 'Overlay hub status was inspected without publishing a visible event.'),
      check('timed-actions', timed !== undefined, timed === undefined ? 'Timed-action controller is unavailable.' : 'Timed-action state and pending selections are readable.'),
      check('random-clip', moduleReady(modules, 'thsv.random-clip-player'), moduleDetail(modules, 'thsv.random-clip-player')),
      check('raid-scout', moduleReady(modules, 'thsv.raid-scout'), moduleDetail(modules, 'thsv.raid-scout')),
      check('offline-cleanup', recordValue(diagnostics['mainFeatures']) !== undefined, 'Lifecycle coordinator state is available for final-offline cleanup.'),
    ];
    return {
      rehearsedAt: this.now().toISOString(), safe: true, mutationPolicy: 'dry-run', ready: steps.every((step) => step['ready'] === true), steps,
      suppressed: ['real chat and Discord sends', 'provider lifecycle mutation', 'scene changes', 'visible alerts', 'raids and ads', 'timer advancement'],
      sequence: ['preflight', 'go-live recovery', 'countdown', 'chat and alerts', 'timed actions', 'BRB/scene mapping', 'clips', 'ads', 'Raid Scout', 'final offline cleanup'],
    };
  }

  public healthStatus(): Readonly<JsonRecord> {
    return this.lastHealth ?? this.buildHealth();
  }

  public timelineStatus(limit = 100): Readonly<JsonRecord> {
    const safeLimit = Math.min(300, Math.max(1, Number.isSafeInteger(limit) ? limit : 100));
    return { retainedMinutes: 30, redacted: true, total: this.timeline.length, events: this.timeline.slice(-safeLimit).reverse() };
  }

  public replay(eventId: string, input: unknown): Readonly<JsonRecord> {
    requireApproval(input);
    const event = this.timeline.find((entry) => entry.id === eventId);
    if (event === undefined) throw new OperationalReliabilityError(404, 'That redacted timeline event is no longer retained.');
    return {
      replayed: true, mode: 'dry-run', externalMutationSuppressed: true, original: event,
      result: { ready: true, route: `${event.platform}:${event.eventType}`, detail: 'Validated the retained routing identity without restoring private payload text or publishing the event.' },
    };
  }

  public latestReport(): Readonly<JsonRecord> {
    return this.latestReportValue ?? { available: false, message: 'No completed live session report is available yet.' };
  }

  public async flush(): Promise<void> { await this.writes; }

  private async sample(): Promise<void> {
    if (this.sampling) return;
    this.sampling = true;
    try {
      this.lastHealth = this.buildHealth();
      await this.recoverObsSceneInventoryIfNeeded();
      this.lastHealth = this.buildHealth();
    } finally { this.sampling = false; }
  }

  private buildHealth(): Readonly<JsonRecord> {
    const readiness = this.options.readiness();
    const diagnostics = this.options.diagnostics();
    const sceneStatus = this.options.sceneStatus();
    const broadcast = this.options.broadcastStatus?.() ?? {};
    const adapters = recordArray(readiness['adapters']);
    const outputs = recordArray(readiness['outputs']);
    const components = [
      ...adapters.map((item) => component('adapter', stringValue(item['name']) ?? 'adapter', stringValue(item['state']) ?? 'unknown', item['lastEventAt'], item['lastError'])),
      ...outputs.map((item) => component('output', stringValue(item['name']) ?? 'output', stringValue(item['state']) ?? 'unknown', item['lastEventAt'], item['lastError'])),
      component('scene-catalog', 'OBS scenes', sceneCount(sceneStatus) > 0 ? 'connected' : 'attention', providerUpdatedAt(sceneStatus, 'obs'), undefined),
      component('broadcast-monitor', 'OBS broadcast monitor', stringValue(broadcast['state']) ?? 'unknown', broadcast['lastSuccessAt'], broadcast['lastError']),
      component('timed-actions', 'Timed actions', recordValue(diagnostics['timedActions']) === undefined ? 'unavailable' : 'connected', undefined, undefined),
    ];
    const event = this.timeline.at(-1);
    return {
      checkedAt: this.now().toISOString(), ready: readiness['ready'] === true && components.every((item) => !['error', 'attention', 'unavailable'].includes(String(item['state']))),
      components, lastEvent: event, activeSession: this.activeSession === undefined ? undefined : sessionSnapshot(this.activeSession),
      recovery: { obsSceneInventory: { ...this.recovery, maximumAttempts: MAXIMUM_RECOVERY_ATTEMPTS, policy: 'bounded exponential retry' }, streamerBot: { policy: 'adapter-managed exponential reconnect', state: outputs.find((item) => item['name'] === 'streamerbot')?.['state'] ?? 'unknown' } },
    };
  }

  private async recoverObsSceneInventoryIfNeeded(): Promise<void> {
    const refresh = this.options.refreshObsScenes;
    const status = this.options.sceneStatus();
    if (sceneCount(status) > 0) { this.recovery.attempts = 0; this.recovery.lastSuccessAt = this.now().toISOString(); delete this.recovery.lastError; delete this.recovery.nextAttemptAt; return; }
    if (refresh === undefined || this.recovery.attempts >= MAXIMUM_RECOVERY_ATTEMPTS) return;
    const now = this.now();
    if (this.recovery.nextAttemptAt !== undefined && Date.parse(this.recovery.nextAttemptAt) > now.getTime()) return;
    this.recovery.attempts += 1; this.recovery.lastAttemptAt = now.toISOString();
    try {
      await refresh();
      if (sceneCount(this.options.sceneStatus()) > 0) { this.recovery.lastSuccessAt = this.now().toISOString(); this.recovery.attempts = 0; delete this.recovery.lastError; delete this.recovery.nextAttemptAt; return; }
      this.recovery.lastError = 'OBS scene inventory remained empty after refresh.';
    } catch (error) { this.recovery.lastError = errorMessage(error); }
    const delay = Math.min(2 ** Math.max(0, this.recovery.attempts - 1) * 5_000, MAXIMUM_RECOVERY_DELAY_MS);
    this.recovery.nextAttemptAt = new Date(now.getTime() + delay).toISOString();
  }

  private observeSession(event: NormalizedEvent, entry: TimelineEntry): void {
    if (event.eventType === 'stream.online') {
      this.activeSession ??= newSession(event.receivedAt, 'provider-events');
      this.activeSession.platforms.add(event.platform);
    }
    const session = this.activeSession;
    if (session === undefined) return;
    session.counts.set(event.eventType, (session.counts.get(event.eventType) ?? 0) + 1);
    if (entry.outcome === 'controller-failure') session.failures.push(entry.summary);
    for (const expected of EXPECTED_LIVE_SIGNALS) if (event.eventType === expected || event.eventType.startsWith(expected)) session.expectedSignals.add(expected);
    if (event.eventType === 'stream.offline') {
      session.platforms.delete(event.platform);
      if (session.platforms.size === 0) void this.finishSession('final-provider-offline');
    }
  }

  private async finishSession(reason: string): Promise<void> {
    const session = this.activeSession;
    if (session === undefined) return;
    this.activeSession = undefined;
    const endedAt = this.now().toISOString();
    const counts = Object.fromEntries([...session.counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
    const signals = EXPECTED_LIVE_SIGNALS.map((id) => ({ id, observed: session.expectedSignals.has(id) }));
    const report = {
      schemaVersion: 1, available: true, completed: reason !== 'bridge-shutdown', sessionId: session.id, startedAt: session.startedAt, endedAt, reason, source: session.source,
      durationSeconds: Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(session.startedAt)) / 1000)), counts,
      failures: session.failures.slice(-50), expectedSignals: signals, summary: {
        eventCount: [...session.counts.values()].reduce((total, value) => total + value, 0),
        failureCount: session.failures.length, observedSignals: signals.filter((item) => item.observed).length, expectedSignalCount: signals.length,
      },
      privacy: { chatTextRetained: false, viewerIdentityRetained: false, rawPayloadRetained: false },
    };
    this.latestReportValue = report;
    await writeJsonAtomic(this.latestReportPath(), report);
    await writeJsonAtomic(join(this.options.dataRoot, 'reports', 'post-stream', `${safeTimestamp(endedAt)}-${session.id}.json`), report);
  }

  private queueTimelineWrite(): void {
    this.writes = this.writes.then(() => writeJsonAtomic(this.timelinePath(), { schemaVersion: 1, retainedMinutes: 30, events: this.timeline })).catch((error: unknown) => { this.options.logger.warn('Operational timeline persistence failed', { error }); });
  }

  private async loadTimeline(): Promise<void> {
    try {
      const value = JSON.parse(await readFile(this.timelinePath(), 'utf8')) as unknown;
      if (isRecord(value) && Array.isArray(value['events'])) this.timeline = pruneTimeline(value['events'].filter(isTimelineEntry), this.now().getTime());
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.options.logger.warn('Operational timeline could not be restored', { error }); }
  }

  private async loadLatestReport(): Promise<void> {
    try { const value = JSON.parse(await readFile(this.latestReportPath(), 'utf8')) as unknown; if (isRecord(value)) this.latestReportValue = value; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.options.logger.warn('Post-stream report could not be restored', { error }); }
  }

  private timelinePath(): string { return join(this.options.dataRoot, 'state', 'operational-timeline.json'); }
  private latestReportPath(): string { return join(this.options.dataRoot, 'reports', 'post-stream', 'latest.json'); }
  private now(): Date { return this.options.now?.() ?? new Date(); }
}

export class OperationalReliabilityError extends Error { public constructor(public readonly statusCode: number, message: string) { super(message); } }

function redactEvent(event: NormalizedEvent): TimelineEntry {
  const controller = event.eventType.endsWith('.controller-result');
  const success = controller && event.payload['success'] === true;
  const failed = controller && event.payload['success'] === false;
  return {
    id: event.eventId, receivedAt: event.receivedAt, eventType: event.eventType, platform: event.platform,
    simulated: event.metadata.simulated, source: event.source.adapter,
    outcome: failed ? 'controller-failure' : success ? 'controller-success' : 'observed',
    summary: controller ? `${event.eventType}: ${failed ? 'failed' : success ? 'completed' : 'observed'}` : `${event.platform} ${event.eventType}`,
  };
}

function newSession(startedAt: string, source: ActiveSession['source']): ActiveSession {
  return { id: safeTimestamp(startedAt), startedAt, source, platforms: new Set(), counts: new Map(), failures: [], expectedSignals: new Set() };
}
function sessionSnapshot(session: ActiveSession): JsonRecord { return { id: session.id, startedAt: session.startedAt, source: session.source, platforms: [...session.platforms].sort(), eventCount: [...session.counts.values()].reduce((total, value) => total + value, 0), failureCount: session.failures.length }; }
function safeTimestamp(value: string): string { return value.replace(/[^0-9TZ-]/gu, '-'); }
function pruneTimeline(values: readonly TimelineEntry[], now: number): TimelineEntry[] { return values.filter((entry) => now - Date.parse(entry.receivedAt) <= TIMELINE_RETENTION_MS).slice(-TIMELINE_LIMIT); }
function isTimelineEntry(value: unknown): value is TimelineEntry { return isRecord(value) && typeof value['id'] === 'string' && typeof value['receivedAt'] === 'string' && typeof value['eventType'] === 'string' && typeof value['platform'] === 'string' && typeof value['simulated'] === 'boolean' && typeof value['source'] === 'string' && typeof value['summary'] === 'string' && ['observed', 'controller-success', 'controller-failure'].includes(String(value['outcome'])); }
function isRecord(value: unknown): value is JsonRecord { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function recordValue(value: unknown): JsonRecord | undefined { return isRecord(value) ? value : undefined; }
function recordArray(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function stringValue(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function requireApproval(input: unknown): void { if (!isRecord(input) || input['approvedByCreator'] !== true) throw new OperationalReliabilityError(403, 'This operation requires explicit creator approval.'); }
function check(id: string, ready: boolean, detail: string): JsonRecord { return { id, ready, detail }; }
function component(kind: string, name: string, state: string, lastEventAt: unknown, lastError: unknown): JsonRecord { return { kind, name, state, ...(typeof lastEventAt === 'string' ? { lastEventAt } : {}), ...(typeof lastError === 'string' ? { lastError: lastError.slice(0, 300) } : {}) }; }
function moduleReady(modules: readonly JsonRecord[], moduleId: string): boolean { const item = modules.find((entry) => entry['moduleId'] === moduleId); return item !== undefined && !['error', 'disabled', 'blocked'].includes(String(item['status'])); }
function moduleDetail(modules: readonly JsonRecord[], moduleId: string): string { const item = modules.find((entry) => entry['moduleId'] === moduleId); return item === undefined ? `${moduleId} is not installed.` : `${moduleId} is ${stringValue(item['status']) ?? 'available'}.`; }
function providerRecord(status: Readonly<JsonRecord>, provider: string): JsonRecord | undefined { return recordValue(recordValue(status['providers'])?.[provider]); }
function providerUpdatedAt(status: Readonly<JsonRecord>, provider: string): unknown { return providerRecord(status, provider)?.['updatedAt']; }
function sceneCount(status: Readonly<JsonRecord>): number { const providers = recordValue(status['providers']); if (providers === undefined) return 0; return Object.values(providers).filter(isRecord).reduce((count, provider) => count + (Array.isArray(provider['scenes']) ? provider['scenes'].length : 0), 0); }
function addVersionComponent(components: JsonRecord[], issues: JsonRecord[], category: string, name: string, current: string | undefined, expected: string, repairable: boolean): void { const ready = current === expected; const item = { category, name, current: current ?? 'missing', expected, ready, repair: repairable ? 'backup-and-reconcile' : 'verified-update-required' }; components.push(item); if (!ready) issues.push(item); }
async function readVersion(path: string): Promise<string | undefined> { try { const value = JSON.parse(await readFile(path, 'utf8')) as unknown; return isRecord(value) ? stringValue(value['version']) : undefined; } catch { return undefined; } }
function versionFromFilename(name: string): string { return /-([0-9]+\.[0-9]+\.[0-9]+)\.sb$/u.exec(name)?.[1] ?? 'unknown'; }
async function packageManifests(root: string): Promise<JsonRecord[]> {
  const values: JsonRecord[] = [];
  let folders;
  try { folders = await readdir(resolve(root), { withFileTypes: true }); } catch { return values; }
  for (const folder of folders.filter((entry) => entry.isDirectory())) {
    try {
      const manifest = JSON.parse(await readFile(join(root, folder.name, 'manifest.json'), 'utf8')) as unknown;
      if (!isRecord(manifest)) continue;
      const files = await readdir(join(root, folder.name));
      values.push({ packageId: folder.name, version: manifest['version'], imports: files.filter((name) => name.endsWith('.sb')) });
    } catch { /* A non-package folder is ignored. */ }
  }
  return values.sort((left, right) => String(left['packageId']).localeCompare(String(right['packageId'])));
}
