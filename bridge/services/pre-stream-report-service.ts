import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const MAXIMUM_STARTUP_REPORT_BYTES = 128 * 1024;

export interface PreStreamReportInput {
  readonly provenance: Readonly<Record<string, unknown>>;
  readonly readiness: Readonly<Record<string, unknown>>;
  readonly obsInventory: Readonly<Record<string, unknown>>;
  readonly liveAcceptance: Readonly<Record<string, unknown>>;
}

export async function createPreStreamReport(dataRoot: string, input: PreStreamReportInput): Promise<{ readonly filename: string; readonly bytes: Uint8Array }> {
  const generatedAt = new Date();
  const startup = await readStartupSummary(dataRoot);
  const sources = arrayOfRecords(input.obsInventory['sources']).map((source) => pick(source, ['id', 'label', 'scene', 'surface', 'moduleId', 'minimumCount', 'required', 'connectedCount', 'visibleCount', 'ready']));
  const confirmations = isRecord(input.liveAcceptance['confirmations']) ? Object.fromEntries(Object.entries(input.liveAcceptance['confirmations']).map(([id, value]) => [id, isRecord(value) ? pick(value, ['checkId', 'status', 'note', 'confirmedAt', 'stale', 'staleReason', 'staleReasons', 'due', 'dueAt', 'dueReason']) : {}])) : {};
  const checks = arrayOfRecords(input.liveAcceptance['checks']).map((check) => pick(check, ['id', 'label', 'requiresGenuineEvent']));
  const readiness = { ...pick(input.readiness, ['ready', 'status', 'version', 'coreContractVersion']), blockers: arrayOfRecords(input.readiness['blockers']).map((blocker) => pick(blocker, ['kind', 'name', 'state', 'message', 'recovery'])), warnings: arrayOfRecords(input.readiness['warnings']).map((warning) => pick(warning, ['kind', 'name', 'state', 'message', 'recovery'])) };
  const report = {
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    sharingNotice: 'Sanitized pre-stream evidence. No configuration values, secrets, chat text, viewer identity, or raw provider payloads are included.',
    build: pick(input.provenance, ['version', 'coreContractVersion', 'installation', 'buildFingerprint', 'releaseManifestSha256', 'runtimeVersion', 'installedAt', 'fileCount']),
    readiness,
    obs: { ...pick(input.obsInventory, ['configured', 'ready', 'requiredCount', 'readyRequiredCount']), sources },
    acceptance: { checks, confirmations },
    startup,
  };
  const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const filename = `THSV-StreamBridge-pre-stream-${generatedAt.toISOString().replaceAll(/[:.]/gu, '-')}.json`;
  return { filename, bytes };
}

export function comparePreStreamReports(baseline: unknown, current: unknown): Readonly<Record<string, unknown>> {
  const before = validReport(baseline); const after = validReport(current); const changes: Array<Readonly<Record<string, unknown>>> = [];
  compareField(changes, 'Build version', path(before, 'build', 'version'), path(after, 'build', 'version'));
  compareField(changes, 'Build fingerprint', short(path(before, 'build', 'buildFingerprint')), short(path(after, 'build', 'buildFingerprint')));
  compareBoolean(changes, 'Bridge readiness', path(before, 'readiness', 'ready'), path(after, 'readiness', 'ready'));
  compareCount(changes, 'Readiness blockers', arrayLength(path(before, 'readiness', 'blockers')), arrayLength(path(after, 'readiness', 'blockers')), true);
  compareBoolean(changes, 'Required OBS inventory', path(before, 'obs', 'ready'), path(after, 'obs', 'ready'));
  compareCount(changes, 'Ready required OBS sources', numberValue(path(before, 'obs', 'readyRequiredCount')), numberValue(path(after, 'obs', 'readyRequiredCount')), false);
  compareStatusMaps(changes, 'OBS source', recordsById(path(before, 'obs', 'sources'), 'ready'), recordsById(path(after, 'obs', 'sources'), 'ready'));
  compareStatusMaps(changes, 'Acceptance', recordValues(path(before, 'acceptance', 'confirmations'), 'status'), recordValues(path(after, 'acceptance', 'confirmations'), 'status'));
  compareField(changes, 'Startup outcome', path(before, 'startup', 'outcome'), path(after, 'startup', 'outcome'));
  const regressions = changes.filter((change) => change['severity'] === 'regression').length; const improvements = changes.filter((change) => change['severity'] === 'improvement').length;
  return { changed: changes.length > 0, regressions, improvements, unchanged: changes.length === 0, summary: regressions > 0 ? `${String(regressions)} regression${regressions === 1 ? '' : 's'} require attention.` : changes.length === 0 ? 'No tracked readiness differences.' : 'No tracked regressions.', changes };
}

export class PreStreamReportError extends Error {}

async function readStartupSummary(dataRoot: string): Promise<Readonly<Record<string, unknown>> | undefined> {
  try {
    const raw = await readFile(join(dataRoot, 'logs', 'last-startup-report.json'), 'utf8');
    if (Buffer.byteLength(raw) > MAXIMUM_STARTUP_REPORT_BYTES) return { available: false, reason: 'Startup report exceeded the safe size limit.' };
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? pick(parsed, ['startupRunId', 'startedAt', 'completedAt', 'outcome', 'category', 'version', 'attempt', 'ready', 'recovered', 'recoveryAction']) : { available: false, reason: 'Startup report was not an object.' };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? { available: false, reason: 'No startup report has been recorded yet.' } : { available: false, reason: 'Startup report could not be read.' };
  }
}

function pick(value: Readonly<Record<string, unknown>>, keys: readonly string[]): Readonly<Record<string, unknown>> {
  return Object.fromEntries(keys.flatMap((key) => value[key] === undefined ? [] : [[key, safeValue(value[key])]]));
}
function safeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 100).map(safeValue);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [key, safeValue(item)]));
  if (typeof value === 'string') return value.slice(0, 1_000).replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/giu, 'Bearer [REDACTED]').replace(/\b(password|token|secret|cookie|authorization|webhook)\b["']?\s*[:=]\s*["']?[^\s,;}"']+/giu, '$1=[REDACTED]');
  return value;
}
function arrayOfRecords(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter(isRecord).slice(0, 100) : []; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

function validReport(value: unknown): Readonly<Record<string, unknown>> { if (!isRecord(value) || value['schemaVersion'] !== 1) throw new PreStreamReportError('Choose a valid StreamBridge pre-stream report with schema version 1.'); return value; }
function path(value: Readonly<Record<string, unknown>>, ...keys: string[]): unknown { let current: unknown = value; for (const key of keys) { if (!isRecord(current)) return undefined; current = current[key]; } return current; }
function display(value: unknown): string { return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value).slice(0, 120) : value === undefined ? 'unavailable' : 'changed'; }
function short(value: unknown): unknown { return typeof value === 'string' ? value.slice(0, 12) : value; }
function addChange(changes: Array<Readonly<Record<string, unknown>>>, label: string, before: unknown, after: unknown, severity: 'regression' | 'improvement' | 'change'): void { if (before !== after) changes.push({ label, before: display(before), after: display(after), severity }); }
function compareField(changes: Array<Readonly<Record<string, unknown>>>, label: string, before: unknown, after: unknown): void { addChange(changes, label, before, after, 'change'); }
function compareBoolean(changes: Array<Readonly<Record<string, unknown>>>, label: string, before: unknown, after: unknown): void { addChange(changes, label, before, after, before === true && after === false ? 'regression' : before === false && after === true ? 'improvement' : 'change'); }
function compareCount(changes: Array<Readonly<Record<string, unknown>>>, label: string, before: number, after: number, lowerIsBetter: boolean): void { addChange(changes, label, before, after, before === after ? 'change' : (after < before) === lowerIsBetter ? 'improvement' : 'regression'); }
function arrayLength(value: unknown): number { return Array.isArray(value) ? value.length : 0; }
function numberValue(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }
function recordsById(value: unknown, field: string): Record<string, unknown> { return Object.fromEntries(arrayOfRecords(value).flatMap((item) => typeof item['id'] === 'string' ? [[item['id'], item[field]]] : [])); }
function recordValues(value: unknown, field: string): Record<string, unknown> { return isRecord(value) ? Object.fromEntries(Object.entries(value).map(([id, item]) => [id, isRecord(item) ? item[field] : undefined])) : {}; }
function compareStatusMaps(changes: Array<Readonly<Record<string, unknown>>>, prefix: string, before: Record<string, unknown>, after: Record<string, unknown>): void {
  for (const id of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const oldValue = before[id] ?? 'missing'; const newValue = after[id] ?? 'missing'; if (oldValue === newValue) continue;
    const positive = new Set<unknown>([true, 'accepted']); const negative = new Set<unknown>([false, 'pending', 'due', 'stale', 'missing']);
    addChange(changes, `${prefix} ${id}`, oldValue, newValue, positive.has(oldValue) && negative.has(newValue) ? 'regression' : negative.has(oldValue) && positive.has(newValue) ? 'improvement' : 'change');
  }
}
