import { createHash } from 'node:crypto';
import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { readCrashSafeText, writeCrashSafeText } from './crash-safe-state-file.js';

const MINIMUM_ACTIVE_BUDGET_BYTES = 16 * 1024 * 1024;
const MINIMUM_ARCHIVE_BUDGET_BYTES = 48 * 1024 * 1024;
const MAXIMUM_BUDGET_BYTES = 16 * 1024 * 1024 * 1024;
const ACTIVE_NAMES = new Set(['streambridge.log', 'service.stdout.log', 'service.stderr.log', 'startup-reports.jsonl', 'last-startup-report.json', 'tray-shell.log']);

interface LogFile { readonly name: string; readonly path: string; readonly bytes: number; readonly compressed: boolean; readonly modifiedAt: number }
export interface LogStorageBudgets { readonly activeBytes: number; readonly archiveBytes: number }

export class LogLifecycleStatusService {
  private lastEnforcedAt: string | undefined;
  private lastPrunedFiles = 0;
  private lastPrunedBytes = 0;
  private configuredBudgets: LogStorageBudgets | undefined;
  private policyWarning: string | undefined;

  public constructor(
    private readonly directory: string,
    private readonly maxFileBytes: number,
    private readonly backups: number,
    private readonly explicitBudgets?: number | LogStorageBudgets,
    private readonly policyPath?: string,
  ) {}

  public async start(): Promise<Readonly<Record<string, unknown>>> {
    if (this.policyPath !== undefined) {
      try { this.configuredBudgets = validateBudgets(JSON.parse(await readCrashSafeText(this.policyPath)) as unknown); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.policyWarning = error instanceof Error ? error.message : String(error); }
    }
    return this.enforce();
  }

  public async preview(input?: unknown): Promise<Readonly<Record<string, unknown>>> {
    const budgets = input === undefined ? this.budgets() : validateBudgets(input);
    const files = await collectFiles(this.directory);
    const candidates = pruneCandidates(files, budgets.archiveBytes);
    return Object.freeze({ mutationFree: true, activeFilesProtected: true, budgets, previewToken: previewToken(budgets, candidates), wouldPruneFiles: candidates.length, wouldPruneBytes: candidates.reduce((sum, file) => sum + file.bytes, 0), candidates: candidates.map(({ name, bytes }) => ({ name, bytes })) });
  }

  public async applyAndPrune(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const budgets = validateBudgets(input);
    const suppliedToken = input !== null && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>)['previewToken'] : undefined;
    const currentPreview = await this.preview(budgets);
    if (typeof suppliedToken !== 'string' || suppliedToken !== currentPreview['previewToken']) throw new Error('Log archives changed or were not previewed. Run Preview archive prune again before approving deletion.');
    if (this.policyPath === undefined) throw new Error('Persistent log-storage policy is unavailable.');
    await writeCrashSafeText(this.policyPath, `${JSON.stringify({ schemaVersion: 1, ...budgets }, null, 2)}\n`);
    this.configuredBudgets = budgets;
    this.policyWarning = undefined;
    return this.enforce();
  }

  public async enforce(): Promise<Readonly<Record<string, unknown>>> {
    const { archiveBytes: archiveBudgetBytes } = this.budgets();
    const files = await collectFiles(this.directory);
    let archiveBytes = files.filter(isArchive).reduce((sum, file) => sum + file.bytes, 0);
    let prunedFiles = 0; let prunedBytes = 0;
    const candidates = files.filter(isArchive).sort((left, right) => left.modifiedAt - right.modifiedAt || left.name.localeCompare(right.name));
    for (const file of candidates) {
      if (archiveBytes <= archiveBudgetBytes) break;
      await rm(file.path, { force: true });
      archiveBytes -= file.bytes; prunedBytes += file.bytes; prunedFiles += 1;
    }
    this.lastEnforcedAt = new Date().toISOString(); this.lastPrunedFiles = prunedFiles; this.lastPrunedBytes = prunedBytes;
    return this.status();
  }

  public async status(): Promise<Readonly<Record<string, unknown>>> {
    const files = await collectFiles(this.directory);
    const activeFiles = files.filter((file) => !isArchive(file)); const archiveFiles = files.filter(isArchive);
    const activeBytes = activeFiles.reduce((sum, file) => sum + file.bytes, 0); const archiveBytes = archiveFiles.reduce((sum, file) => sum + file.bytes, 0);
    const budgets = this.budgets(); const totalBytes = activeBytes + archiveBytes; const budgetBytes = budgets.activeBytes + budgets.archiveBytes;
    const active = storageLane(activeBytes, budgets.activeBytes, activeFiles.length); const archive = storageLane(archiveBytes, budgets.archiveBytes, archiveFiles.length);
    const state = worstState(active.state, archive.state);
    return {
      available: true, checkedAt: new Date().toISOString(), directory: this.directory, totalBytes, budgetBytes,
      usagePercent: Math.min(100, Math.round(totalBytes / budgetBytes * 100)), state, fileCount: files.length,
      compressedCount: files.filter((file) => file.compressed).length, storage: { active, archive },
      largestFiles: files.sort((left, right) => right.bytes - left.bytes).slice(0, 5).map(({ name, bytes, compressed }) => ({ name, bytes, compressed })),
      retention: { lastEnforcedAt: this.lastEnforcedAt, prunedFiles: this.lastPrunedFiles, prunedBytes: this.lastPrunedBytes, protectedActiveFiles: [...ACTIVE_NAMES] },
      policy: { maxActiveFileBytes: this.maxFileBytes, structuredBackups: this.backups, activeBudgetBytes: budgets.activeBytes, archiveBudgetBytes: budgets.archiveBytes, aggregateBudgetBytes: budgetBytes, repeatedEntrySuppressionSeconds: 10, persistent: this.policyPath !== undefined, ...(this.policyWarning === undefined ? {} : { warning: this.policyWarning }) },
    };
  }

  private budgets(): LogStorageBudgets {
    if (this.configuredBudgets !== undefined) return this.configuredBudgets;
    if (typeof this.explicitBudgets === 'number') {
      const activeBytes = Math.max(1, Math.floor(this.explicitBudgets / 4));
      return { activeBytes, archiveBytes: Math.max(1, this.explicitBudgets - activeBytes) };
    }
    if (this.explicitBudgets !== undefined) return this.explicitBudgets;
    return { activeBytes: Math.max(MINIMUM_ACTIVE_BUDGET_BYTES, this.maxFileBytes * 3), archiveBytes: Math.max(MINIMUM_ARCHIVE_BUDGET_BYTES, this.maxFileBytes * (this.backups + 6)) };
  }
}

function previewToken(budgets: LogStorageBudgets, candidates: readonly LogFile[]): string {
  return createHash('sha256').update(JSON.stringify({ budgets, candidates: candidates.map(({ name, bytes, modifiedAt }) => ({ name, bytes, modifiedAt })) })).digest('hex');
}

function validateBudgets(value: unknown): LogStorageBudgets {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Log storage budgets must be an object.');
  const item = value as Record<string, unknown>;
  const activeBytes = item['activeBytes']; const archiveBytes = item['archiveBytes'];
  if (!Number.isSafeInteger(activeBytes) || (activeBytes as number) < MINIMUM_ACTIVE_BUDGET_BYTES || (activeBytes as number) > MAXIMUM_BUDGET_BYTES) throw new Error('Active log budget must be between 16 MB and 16 GB.');
  if (!Number.isSafeInteger(archiveBytes) || (archiveBytes as number) < MINIMUM_ARCHIVE_BUDGET_BYTES || (archiveBytes as number) > MAXIMUM_BUDGET_BYTES) throw new Error('Archive log budget must be between 48 MB and 16 GB.');
  return Object.freeze({ activeBytes: activeBytes as number, archiveBytes: archiveBytes as number });
}

function pruneCandidates(files: readonly LogFile[], archiveBudgetBytes: number): LogFile[] {
  let remaining = files.filter(isArchive).reduce((sum, file) => sum + file.bytes, 0);
  const result: LogFile[] = [];
  for (const file of files.filter(isArchive).sort((left, right) => left.modifiedAt - right.modifiedAt || left.name.localeCompare(right.name))) {
    if (remaining <= archiveBudgetBytes) break;
    result.push(file); remaining -= file.bytes;
  }
  return result;
}

function storageLane(bytes: number, budgetBytes: number, fileCount: number): Readonly<{ bytes: number; budgetBytes: number; usagePercent: number; state: string; fileCount: number }> {
  const usagePercent = Math.min(100, Math.round(bytes / budgetBytes * 100));
  return Object.freeze({ bytes, budgetBytes, usagePercent, state: usagePercent >= 90 ? 'critical' : usagePercent >= 75 ? 'warning' : 'healthy', fileCount });
}

function worstState(left: string, right: string): string {
  const rank: Readonly<Record<string, number>> = { healthy: 0, warning: 1, critical: 2 };
  return (rank[left] ?? 0) >= (rank[right] ?? 0) ? left : right;
}

function isArchive(file: LogFile): boolean {
  if (ACTIVE_NAMES.has(file.name)) return false;
  return file.compressed || /^streambridge\.log\.\d+$/u.test(file.name) || file.name.startsWith('daily/');
}

async function collectFiles(root: string): Promise<LogFile[]> {
  const result: LogFile[] = [];
  const top = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of top) {
    if (entry.isFile()) { const path = join(root, entry.name); const info = await stat(path).catch(() => undefined); if (info !== undefined) result.push({ name: entry.name, path, bytes: info.size, compressed: entry.name.endsWith('.gz'), modifiedAt: info.mtimeMs }); continue; }
    if (!entry.isDirectory() || entry.name !== 'daily') continue;
    const daily = await readdir(join(root, entry.name), { withFileTypes: true }).catch(() => []);
    for (const child of daily) {
      if (!child.isFile()) continue;
      const path = join(root, entry.name, child.name); const info = await stat(path).catch(() => undefined);
      if (info !== undefined) result.push({ name: `${entry.name}/${child.name}`, path, bytes: info.size, compressed: child.name.endsWith('.gz'), modifiedAt: info.mtimeMs });
    }
  }
  return result;
}
