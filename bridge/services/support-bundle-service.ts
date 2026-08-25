import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { strToU8, zipSync } from 'fflate';
import { STREAMBRIDGE_VERSION } from '../version.js';

const MAXIMUM_TEXT_BYTES = 192 * 1024;
const SENSITIVE_KEY = /(?:authorization|cookie|credential|password|secret|token|webhook|control.?key)/iu;
const INLINE_SECRET = /\b(password|token|secret|cookie|authorization|webhook)\b["']?\s*[:=]\s*["']?[^\s,;}"']+/giu;
const OMITTED_CATEGORIES = Object.freeze(['configuration files', 'secret and recovery-key files', 'viewer data', 'raw provider payloads', 'chat message text']);
type PreviewEntry = { readonly path: string; readonly bytes: number; readonly sourceBytes: number; readonly truncated: boolean; readonly redactions: number };

export interface SupportBundleSnapshot {
  readonly health: Readonly<Record<string, unknown>>;
  readonly readiness: Readonly<Record<string, unknown>>;
  readonly diagnostics: Readonly<Record<string, unknown>>;
  readonly overlay?: Readonly<Record<string, unknown>>;
  readonly launcher?: Readonly<Record<string, unknown>>;
  readonly broadcastAutomation?: Readonly<Record<string, unknown>>;
  readonly broadcastConnections?: Readonly<Record<string, unknown>>;
  readonly safeConfiguration?: unknown;
  readonly windowsApplicationEvents?: string;
}
export interface SupportBundleResult { readonly filename: string; readonly bytes: Uint8Array; readonly sha256: string; }
export interface SupportBundlePreview { readonly filename: string; readonly generatedAt: string; readonly files: readonly PreviewEntry[]; readonly totalBytes: number; readonly archiveBytes: number; readonly sha256: string; readonly totalRedactions: number; readonly omittedCategories: readonly string[]; }
interface CollectedBundle { readonly filename: string; readonly files: Record<string, Uint8Array>; readonly preview: SupportBundlePreview; }

export async function prepareSupportBundle(dataRoot: string, snapshot: SupportBundleSnapshot): Promise<{ readonly bundle: SupportBundleResult; readonly preview: SupportBundlePreview }> {
  const collected = await collectSupportBundle(dataRoot, snapshot);
  const bytes = zipSync(collected.files, { level: 6 });
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { bundle: { filename: collected.filename, bytes, sha256 }, preview: { ...collected.preview, archiveBytes: bytes.byteLength, sha256 } };
}
export async function previewSupportBundle(dataRoot: string, snapshot: SupportBundleSnapshot): Promise<SupportBundlePreview> { return (await prepareSupportBundle(dataRoot, snapshot)).preview; }
export async function createSupportBundle(dataRoot: string, snapshot: SupportBundleSnapshot): Promise<SupportBundleResult> { return (await prepareSupportBundle(dataRoot, snapshot)).bundle; }

async function collectSupportBundle(dataRoot: string, snapshot: SupportBundleSnapshot): Promise<CollectedBundle> {
  const generatedAt = new Date(); const files: Record<string, Uint8Array> = {}; const entries: PreviewEntry[] = [];
  addGenerated(files, entries, 'README.txt', 'THSV StreamBridge sanitized support bundle\n\nThis archive may include the Wizard safe-export format, but omits raw configuration files, secrets, viewer data, raw provider payloads, and chat message text. Review it before sharing.\n');
  const { safeConfiguration, windowsApplicationEvents, ...snapshotWithoutConfiguration } = snapshot;
  const summary = sanitize(snapshotWithoutConfiguration);
  addGenerated(files, entries, 'summary.json', `${JSON.stringify({ generatedAt: generatedAt.toISOString(), version: STREAMBRIDGE_VERSION, snapshot: summary.value }, null, 2)}\n`, summary.redactions);
  if (safeConfiguration !== undefined) {
    const cleanedConfiguration = sanitize(safeConfiguration);
    addGenerated(files, entries, 'configuration/safe-wizard-export.json', `${JSON.stringify(cleanedConfiguration.value, null, 2)}\n`, cleanedConfiguration.redactions);
  }
  if (windowsApplicationEvents !== undefined) addGeneratedRedacted(files, entries, 'windows/application-events.json', windowsApplicationEvents);
  await addTextFile(files, entries, 'startup/last-startup-report.json', join(dataRoot, 'logs', 'last-startup-report.json'));
  await addTextFile(files, entries, 'startup/startup-reports.jsonl', join(dataRoot, 'logs', 'startup-reports.jsonl'));
  await addTextFile(files, entries, 'startup/streambridge-circuit.json', join(dataRoot, 'runtime', 'streambridge-startup-circuit.json'));
  await addTextFile(files, entries, 'connections/broadcast-events.json', join(dataRoot, 'state', 'broadcast-connection-events.json'));
  await addNewestMatchingFile(files, entries, 'startup', join(dataRoot, 'runtime'), /^streamerbot-\d+-startup-circuit\.json$/u);
  await addTextFile(files, entries, 'logs/streambridge.log', join(dataRoot, 'logs', 'streambridge.log'));
  await addTextFile(files, entries, 'logs/service.stderr.log', join(dataRoot, 'logs', 'service.stderr.log'));
  await addNewestMatchingFile(files, entries, 'logs/daily', join(dataRoot, 'logs', 'daily'), /^THSV-StreamBridge-\d{4}-\d{2}-\d{2}\.txt$/u);
  const filename = `THSV-StreamBridge-support-${generatedAt.toISOString().replaceAll(/[:.]/gu, '-')}.zip`;
  return { filename, files, preview: { filename, generatedAt: generatedAt.toISOString(), files: entries, totalBytes: entries.reduce((total, entry) => total + entry.bytes, 0), archiveBytes: 0, sha256: '', totalRedactions: entries.reduce((total, entry) => total + entry.redactions, 0), omittedCategories: OMITTED_CATEGORIES } };
}

async function addNewestMatchingFile(files: Record<string, Uint8Array>, entries: PreviewEntry[], archiveDirectory: string, directory: string, pattern: RegExp): Promise<void> {
  try { const matches = (await readdir(directory)).filter((name) => pattern.test(name)); const ranked = await Promise.all(matches.map(async (name) => ({ name, modified: (await stat(join(directory, name))).mtimeMs }))); const latest = ranked.sort((left, right) => right.modified - left.modified)[0]; if (latest !== undefined) await addTextFile(files, entries, `${archiveDirectory}/${basename(latest.name)}`, join(directory, latest.name)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
async function addTextFile(files: Record<string, Uint8Array>, entries: PreviewEntry[], archivePath: string, path: string): Promise<void> {
  try { const value = await readFile(path, 'utf8'); const sourceBytes = Buffer.byteLength(value); const tail = sourceBytes <= MAXIMUM_TEXT_BYTES ? value : Buffer.from(value).subarray(-MAXIMUM_TEXT_BYTES).toString('utf8'); const redacted = redactText(tail); const bytes = strToU8(redacted.value); files[archivePath] = bytes; entries.push({ path: archivePath, bytes: bytes.byteLength, sourceBytes, truncated: sourceBytes > MAXIMUM_TEXT_BYTES, redactions: redacted.redactions }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
function addGenerated(files: Record<string, Uint8Array>, entries: PreviewEntry[], path: string, value: string, redactions = 0): void { const bytes = strToU8(value); files[path] = bytes; entries.push({ path, bytes: bytes.byteLength, sourceBytes: bytes.byteLength, truncated: false, redactions }); }
function addGeneratedRedacted(files: Record<string, Uint8Array>, entries: PreviewEntry[], path: string, value: string): void { const sourceBytes = Buffer.byteLength(value); const bounded = sourceBytes <= MAXIMUM_TEXT_BYTES ? value : Buffer.from(value).subarray(0, MAXIMUM_TEXT_BYTES).toString('utf8'); const redacted = redactText(bounded); const bytes = strToU8(redacted.value); files[path] = bytes; entries.push({ path, bytes: bytes.byteLength, sourceBytes, truncated: sourceBytes > MAXIMUM_TEXT_BYTES, redactions: redacted.redactions }); }
function sanitize(value: unknown, key = ''): { readonly value: unknown; readonly redactions: number } {
  if (SENSITIVE_KEY.test(key)) return { value: '[REDACTED]', redactions: 1 };
  if (Array.isArray(value)) { const items = value.slice(0, 200).map((item) => sanitize(item)); return { value: items.map((item) => item.value), redactions: items.reduce((total, item) => total + item.redactions, 0) }; }
  if (value !== null && typeof value === 'object') { let redactions = 0; const entries = Object.entries(value as Record<string, unknown>).slice(0, 500).map(([name, item]) => { const cleaned = sanitize(item, name); redactions += cleaned.redactions; return [name, cleaned.value] as const; }); return { value: Object.fromEntries(entries), redactions }; }
  if (typeof value === 'string') { const redacted = redactText(value); return { value: redacted.value.slice(0, 2_000), redactions: redacted.redactions }; }
  return { value, redactions: 0 };
}
function redactText(value: string): { readonly value: string; readonly redactions: number } {
  let redactions = 0;
  const replace = (pattern: RegExp, replacement: string): void => { value = value.replace(pattern, () => { redactions += 1; return replacement; }); };
  replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/giu, 'Bearer [REDACTED]');
  value = value.replace(INLINE_SECRET, (_match, label: string) => { redactions += 1; return `${label}=[REDACTED]`; });
  replace(/gh[opsu]_[A-Za-z0-9_]{16,}/gu, '[REDACTED]');
  replace(/\b[A-Za-z]:\\+Users\\+[^\\\s"']+/giu, 'C:\\\\Users\\\\[REDACTED]');
  return { value, redactions };
}

export async function readSanitizedWindowsApplicationEvents(platform: NodeJS.Platform = process.platform): Promise<string | undefined> {
  if (platform !== 'win32') return undefined;
  const script = String.raw`$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $names=@('.NET Runtime','Application Error','Windows Error Reporting'); $pattern='Streamer\.bot|THSV StreamBridge|Speaker\.bot|obs64|Meld Studio|Streamlabs Desktop'; $events=Get-WinEvent -FilterHashtable @{LogName='Application'; StartTime=(Get-Date).AddHours(-24)} -MaxEvents 300 | Where-Object { ($names -contains $_.ProviderName) -and ($_.Message -match $pattern) } | Select-Object -First 25 @{n='timeCreated';e={$_.TimeCreated.ToUniversalTime().ToString('o')}},Id,@{n='level';e={$_.LevelDisplayName}},ProviderName,@{n='message';e={$_.Message}}; @{available=$true; collectedAt=(Get-Date).ToUniversalTime().ToString('o'); windowHours=24; maximumEvents=25; events=@($events)} | ConvertTo-Json -Depth 4 -Compress`;
  try {
    const output = await new Promise<string>((resolve, reject) => execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 8_000, windowsHide: true, maxBuffer: MAXIMUM_TEXT_BYTES }, (error, stdout) => error === null ? resolve(stdout) : reject(error instanceof Error ? error : new Error('Windows Application event query failed.'))));
    return `${output.trim()}\n`;
  } catch {
    return `${JSON.stringify({ available: false, collectedAt: new Date().toISOString(), windowHours: 24, maximumEvents: 25, message: 'Relevant Windows Application events could not be read within the safe time limit.' }, null, 2)}\n`;
  }
}
