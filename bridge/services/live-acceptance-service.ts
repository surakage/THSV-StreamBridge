import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { NormalizedEvent } from '../../schemas/event.js';

const MAXIMUM_EVIDENCE = 100;
const MAXIMUM_FILE_BYTES = 128 * 1024;
const CHECK_ID = /^[a-z][a-z0-9-]{2,80}$/u;

export interface LiveAcceptanceCheck {
  readonly id: string;
  readonly label: string;
  readonly guidance: string;
  readonly requiresGenuineEvent: boolean;
  readonly platforms?: readonly string[];
  readonly eventTypes?: readonly string[];
  readonly relevantAddOns?: readonly string[] | 'all';
  readonly relevantAdapters?: readonly string[] | 'all';
  readonly recheckAfterDays: number;
}

export interface LiveAcceptanceBinding {
  readonly coreVersion: string;
  readonly coreContractVersion: string;
  readonly buildFingerprint: string;
  readonly configurationFingerprint: string;
  readonly triggerContractFingerprint: string;
  readonly adapters: Readonly<Record<string, string>>;
  readonly addOns: Readonly<Record<string, string>>;
}

export interface LiveAcceptanceEvidence {
  readonly id: string;
  readonly upstreamEventId: string;
  readonly platform: string;
  readonly eventType: string;
  readonly receivedAt: string;
}

export interface LiveAcceptanceConfirmation {
  readonly checkId: string;
  readonly status: 'pending' | 'accepted';
  readonly evidenceId?: string;
  readonly note: string;
  readonly confirmedAt: string;
  readonly bindingFingerprint?: string;
  readonly binding?: Readonly<Record<string, unknown>>;
}

const CHECKS: readonly LiveAcceptanceCheck[] = Object.freeze([
  { id: 'bridge-startup', label: 'Bridge startup and recovery', guidance: 'Start while healthy, recover one unresponsive record, and confirm the final startup report has no readiness blockers.', requiresGenuineEvent: false, relevantAdapters: 'all', recheckAfterDays: 90 },
  { id: 'twitch-chat', label: 'Twitch chat intake', guidance: 'Confirm one genuine message arrives exactly once with its expected identity and presentation.', requiresGenuineEvent: true, platforms: ['twitch'], eventTypes: ['chat.message'], relevantAdapters: ['streamerbot-native', 'streamerbot'], recheckAfterDays: 180 },
  { id: 'kick-chat', label: 'Kick chat intake', guidance: 'Confirm one genuine message arrives exactly once with its stable identity.', requiresGenuineEvent: true, platforms: ['kick'], eventTypes: ['chat.message'], relevantAdapters: ['streamerbot-native', 'streamerbot'], recheckAfterDays: 180 },
  { id: 'twitch-alert', label: 'Twitch alert path', guidance: 'Confirm one genuine follow, subscription, cheer, raid, or gift appears exactly once.', requiresGenuineEvent: true, platforms: ['twitch'], eventTypes: ['channel.follow', 'channel.subscription', 'channel.gift-subscription', 'engagement.cheer', 'channel.raid', 'engagement.gift'], relevantAdapters: ['streamerbot-native', 'streamerbot'], recheckAfterDays: 180 },
  { id: 'kick-alert', label: 'Kick alert path', guidance: 'Confirm one genuine follow, subscription, reward, or gift appears exactly once.', requiresGenuineEvent: true, platforms: ['kick'], eventTypes: ['channel.follow', 'channel.subscription', 'channel.gift-subscription', 'engagement.gift', 'reward.redemption'], relevantAdapters: ['streamerbot-native', 'streamerbot'], recheckAfterDays: 180 },
  { id: 'hydration-late-start', label: 'Village Hydration late start', guidance: 'Start StreamBridge after going live, redeem the configured hydration reward, and confirm render and speech without resetting another add-on.', requiresGenuineEvent: true, platforms: ['twitch', 'kick'], eventTypes: ['reward.redemption'], relevantAddOns: ['thsv.village-hydration-station'], relevantAdapters: ['streamerbot-native', 'streamerbot-addon-relay', 'streamerbot'], recheckAfterDays: 180 },
  { id: 'countdown-scene', label: 'Countdown scene lifecycle', guidance: 'Confirm the exact program scene starts once, preview changes do not restart it, and leaving follows the saved stop behavior.', requiresGenuineEvent: false, relevantAddOns: ['thsv.starting-soon-countdown'], relevantAdapters: ['streamerbot-scene-relay', 'streamerbot'], recheckAfterDays: 180 },
  { id: 'shared-overlay', label: 'Shared overlay placement', guidance: 'Confirm required shared sources are visible in each intended OBS program scene and independent lanes remain unblocked.', requiresGenuineEvent: false, relevantAddOns: 'all', recheckAfterDays: 90 },
  { id: 'provider-reconnect', label: 'Provider disconnect and reconnect', guidance: 'Reconnect every enabled provider once with no replay storm, duplicate socket, or duplicate event.', requiresGenuineEvent: false, relevantAdapters: 'all', recheckAfterDays: 90 },
  { id: 'persistence-restart', label: 'Coordination and persistence restart', guidance: 'Restart Streamer.bot and StreamBridge and confirm outbox, deduplication, private state, and counters recover.', requiresGenuineEvent: false, relevantAddOns: 'all', relevantAdapters: 'all', recheckAfterDays: 90 },
]);

export class LiveAcceptanceService {
  private readonly path: string;
  private evidence: LiveAcceptanceEvidence[] = [];
  private confirmations: Record<string, LiveAcceptanceConfirmation> = {};
  private writes: Promise<void> = Promise.resolve();

  public constructor(stateRoot: string, private readonly binding?: LiveAcceptanceBinding, private readonly now: () => number = Date.now) { this.path = join(stateRoot, 'live-acceptance.json'); }

  public async start(): Promise<void> {
    try {
      const raw = await readFile(this.path, 'utf8');
      if (Buffer.byteLength(raw) > MAXIMUM_FILE_BYTES) return;
      const value = JSON.parse(raw) as Record<string, unknown>;
      if (Array.isArray(value['evidence'])) this.evidence = value['evidence'].flatMap(validEvidence).slice(-MAXIMUM_EVIDENCE);
      if (typeof value['confirmations'] === 'object' && value['confirmations'] !== null && !Array.isArray(value['confirmations'])) {
        for (const [id, item] of Object.entries(value['confirmations'] as Record<string, unknown>)) {
          const confirmation = validConfirmation(item);
          if (CHECK_ID.test(id) && confirmation !== undefined && CHECKS.some((check) => check.id === id)) this.confirmations[id] = confirmation;
        }
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }

  public observe(event: NormalizedEvent): void {
    if (event.metadata.simulated || event.source.eventId === undefined || !CHECKS.some((check) => check.requiresGenuineEvent && check.platforms?.includes(event.platform) === true && check.eventTypes?.includes(event.eventType) === true)) return;
    const id = `${event.platform}:${event.source.eventId}`.slice(0, 400);
    if (this.evidence.some((item) => item.id === id)) return;
    this.evidence = [...this.evidence, { id, upstreamEventId: event.source.eventId, platform: event.platform, eventType: event.eventType, receivedAt: event.receivedAt }].slice(-MAXIMUM_EVIDENCE);
    this.queueWrite();
  }

  public status(): Readonly<Record<string, unknown>> {
    const confirmations: Record<string, unknown> = {};
    for (const [id, confirmation] of Object.entries(this.confirmations)) {
      const check = CHECKS.find((candidate) => candidate.id === id);
      const expected = check === undefined ? undefined : this.bindingFingerprint(check);
      const stale = confirmation.status === 'accepted' && expected !== undefined && confirmation.bindingFingerprint !== expected;
      const current = check === undefined ? undefined : this.relevantBinding(check);
      const staleReasons = stale ? bindingChanges(confirmation.binding, current) : [];
      const dueAt = check === undefined || confirmation.status !== 'accepted' ? undefined : new Date(Date.parse(confirmation.confirmedAt) + check.recheckAfterDays * 86_400_000).toISOString();
      const due = !stale && dueAt !== undefined && Date.parse(dueAt) <= this.now();
      const dueSoon = !stale && !due && dueAt !== undefined && Date.parse(dueAt) - this.now() <= 14 * 86_400_000;
      if (stale) confirmations[id] = { ...confirmation, status: 'stale', stale: true, staleReasons, staleReason: `${staleReasons.join(' ')} Re-run and confirm this check.`, ...(dueAt === undefined ? {} : { dueAt }) };
      else if (due) confirmations[id] = { ...confirmation, status: 'due', due: true, dueAt, dueReason: `Periodic live acceptance is due after ${String(check?.recheckAfterDays)} days.` };
      else confirmations[id] = dueAt === undefined ? confirmation : { ...confirmation, dueAt, ...(dueSoon ? { dueSoon: true, dueSoonReason: 'Periodic live acceptance is due within 14 days.' } : {}) };
    }
    return { checks: CHECKS, evidence: [...this.evidence].reverse(), confirmations, binding: this.binding === undefined ? undefined : { coreVersion: this.binding.coreVersion, coreContractVersion: this.binding.coreContractVersion, buildFingerprint: this.binding.buildFingerprint } };
  }

  public confirm(checkId: string, input: unknown): LiveAcceptanceConfirmation {
    const check = CHECKS.find((candidate) => candidate.id === checkId);
    if (check === undefined) throw new LiveAcceptanceError(404, 'Unknown live-acceptance check.');
    if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new LiveAcceptanceError(400, 'Live-acceptance confirmation must be an object.');
    const body = input as Record<string, unknown>;
    if (body['approvedByCreator'] !== true) throw new LiveAcceptanceError(403, 'Marking live acceptance requires explicit creator confirmation.');
    const status = body['status'] === 'accepted' ? 'accepted' : body['status'] === 'pending' ? 'pending' : undefined;
    if (status === undefined) throw new LiveAcceptanceError(400, 'Live-acceptance status must be pending or accepted.');
    const evidenceId = typeof body['evidenceId'] === 'string' ? body['evidenceId'].slice(0, 400) : undefined;
    const evidence = evidenceId === undefined ? undefined : this.evidence.find((item) => item.id === evidenceId);
    if (status === 'accepted' && check.requiresGenuineEvent && evidence === undefined) throw new LiveAcceptanceError(409, 'Choose a captured genuine upstream event before accepting this provider path.');
    if (evidence !== undefined && (check.platforms?.includes(evidence.platform) !== true || check.eventTypes?.includes(evidence.eventType) !== true)) throw new LiveAcceptanceError(409, 'The selected event does not match this acceptance check.');
    const note = typeof body['note'] === 'string' ? body['note'].replaceAll(/[\r\n\t]+/gu, ' ').trim().slice(0, 300) : '';
    if (status === 'accepted' && note.length < 8) throw new LiveAcceptanceError(400, 'Add a short result note before accepting this check.');
    const bindingFingerprint = this.bindingFingerprint(check); const binding = this.relevantBinding(check);
    const confirmation: LiveAcceptanceConfirmation = { checkId, status, ...(evidence === undefined ? {} : { evidenceId: evidence.id }), note, confirmedAt: new Date(this.now()).toISOString(), ...(bindingFingerprint === undefined || binding === undefined ? {} : { bindingFingerprint, binding }) };
    this.confirmations[checkId] = confirmation;
    this.queueWrite();
    return confirmation;
  }

  public async flush(): Promise<void> { await this.writes; }

  private queueWrite(): void {
    this.writes = this.writes.then(async () => {
      const encoded = `${JSON.stringify({ version: 1, evidence: this.evidence, confirmations: this.confirmations }, null, 2)}\n`;
      if (Buffer.byteLength(encoded) > MAXIMUM_FILE_BYTES) throw new Error('Live acceptance evidence exceeds its storage limit.');
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const temporary = `${this.path}.${randomUUID()}.tmp`;
      await writeFile(temporary, encoded, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, this.path);
    }).catch(() => undefined);
  }

  private bindingFingerprint(check: LiveAcceptanceCheck): string | undefined {
    const relevant = this.relevantBinding(check);
    return relevant === undefined ? undefined : createHash('sha256').update(JSON.stringify(relevant)).digest('hex');
  }

  private relevantBinding(check: LiveAcceptanceCheck): Readonly<Record<string, unknown>> | undefined {
    if (this.binding === undefined) return undefined;
    const addOns = check.relevantAddOns === 'all' ? this.binding.addOns : Object.fromEntries((check.relevantAddOns ?? []).map((id) => [id, this.binding?.addOns[id] ?? 'not-installed']));
    const adapters = check.relevantAdapters === 'all' ? this.binding.adapters : Object.fromEntries((check.relevantAdapters ?? []).map((id) => [id, this.binding?.adapters[id] ?? 'not-enabled']));
    return {
      coreVersion: this.binding.coreVersion,
      coreContractVersion: this.binding.coreContractVersion,
      buildFingerprint: this.binding.buildFingerprint,
      configurationFingerprint: this.binding.configurationFingerprint,
      triggerContractFingerprint: this.binding.triggerContractFingerprint,
      adapters,
      addOns,
    };
  }
}

export class LiveAcceptanceError extends Error {
  public constructor(public readonly statusCode: number, message: string) { super(message); }
}

function validEvidence(value: unknown): LiveAcceptanceEvidence[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  const item = value as Record<string, unknown>;
  if (typeof item['id'] !== 'string' || typeof item['upstreamEventId'] !== 'string' || typeof item['platform'] !== 'string' || typeof item['eventType'] !== 'string' || typeof item['receivedAt'] !== 'string') return [];
  return [{ id: item['id'].slice(0, 400), upstreamEventId: item['upstreamEventId'].slice(0, 256), platform: item['platform'].slice(0, 64), eventType: item['eventType'].slice(0, 128), receivedAt: item['receivedAt'].slice(0, 64) }];
}

function validConfirmation(value: unknown): LiveAcceptanceConfirmation | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (typeof item['checkId'] !== 'string' || (item['status'] !== 'pending' && item['status'] !== 'accepted') || typeof item['note'] !== 'string' || typeof item['confirmedAt'] !== 'string') return undefined;
  const bindingFingerprint = typeof item['bindingFingerprint'] === 'string' && /^[a-f0-9]{64}$/u.test(item['bindingFingerprint']) ? item['bindingFingerprint'] : undefined;
  return { checkId: item['checkId'], status: item['status'], ...(typeof item['evidenceId'] === 'string' ? { evidenceId: item['evidenceId'].slice(0, 400) } : {}), note: item['note'].slice(0, 300), confirmedAt: item['confirmedAt'].slice(0, 64), ...(bindingFingerprint === undefined ? {} : { bindingFingerprint, ...(typeof item['binding'] === 'object' && item['binding'] !== null && !Array.isArray(item['binding']) ? { binding: item['binding'] as Record<string, unknown> } : {}) }) };
}

function bindingChanges(previous: Readonly<Record<string, unknown>> | undefined, current: Readonly<Record<string, unknown>> | undefined): string[] {
  if (previous === undefined) return ['This acceptance predates version-bound evidence.'];
  if (current === undefined) return ['The current acceptance binding is unavailable.'];
  const changes: string[] = [];
  compareText(changes, previous, current, 'coreVersion', 'StreamBridge version');
  compareText(changes, previous, current, 'coreContractVersion', 'Core contract version');
  compareFingerprint(changes, previous, current, 'buildFingerprint', 'Installed build');
  compareFingerprint(changes, previous, current, 'configurationFingerprint', 'StreamBridge configuration');
  compareFingerprint(changes, previous, current, 'triggerContractFingerprint', 'Streamer.bot trigger catalogue');
  const oldAdapters = isRecord(previous['adapters']) ? previous['adapters'] : {}; const newAdapters = isRecord(current['adapters']) ? current['adapters'] : {};
  for (const id of [...new Set([...Object.keys(oldAdapters), ...Object.keys(newAdapters)])].sort()) {
    const oldValue = typeof oldAdapters[id] === 'string' ? oldAdapters[id] : 'not-enabled'; const newValue = typeof newAdapters[id] === 'string' ? newAdapters[id] : 'not-enabled';
    if (oldValue !== newValue) changes.push(`${id} adapter contract changed from ${oldValue} to ${newValue}.`);
  }
  const oldAddOns = isRecord(previous['addOns']) ? previous['addOns'] : {}; const newAddOns = isRecord(current['addOns']) ? current['addOns'] : {};
  for (const id of [...new Set([...Object.keys(oldAddOns), ...Object.keys(newAddOns)])].sort()) {
    const oldValue = typeof oldAddOns[id] === 'string' ? oldAddOns[id] : 'not-installed'; const newValue = typeof newAddOns[id] === 'string' ? newAddOns[id] : 'not-installed';
    if (oldValue === newValue) continue;
    if (oldValue === 'not-installed') changes.push(`${id} was installed.`);
    else if (newValue === 'not-installed') changes.push(`${id} was removed.`);
    else {
      const oldSeparator = oldValue.indexOf(':'); const newSeparator = newValue.indexOf(':');
      const oldVersion = oldSeparator < 0 ? oldValue : oldValue.slice(0, oldSeparator); const newVersion = newSeparator < 0 ? newValue : newValue.slice(0, newSeparator);
      if (oldVersion !== newVersion) changes.push(`${id} version changed from ${oldVersion} to ${newVersion}.`);
      else changes.push(`${id} settings changed.`);
    }
  }
  return changes.length > 0 ? changes : ['A relevant acceptance fingerprint changed.'];
}

function compareText(changes: string[], previous: Readonly<Record<string, unknown>>, current: Readonly<Record<string, unknown>>, key: string, label: string): void {
  if (previous[key] !== current[key]) changes.push(`${label} changed from ${textValue(previous[key])} to ${textValue(current[key])}.`);
}
function compareFingerprint(changes: string[], previous: Readonly<Record<string, unknown>>, current: Readonly<Record<string, unknown>>, key: string, label: string): void {
  if (previous[key] !== current[key]) changes.push(`${label} changed (${shortFingerprint(previous[key])} to ${shortFingerprint(current[key])}).`);
}
function shortFingerprint(value: unknown): string { return typeof value === 'string' ? value.slice(0, 12) : 'unknown'; }
function textValue(value: unknown): string { return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : 'unknown'; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
