import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

const MINIMUM_BUDGET_BYTES = 64 * 1024 * 1024;
const ACTIVE_NAMES = new Set(['streambridge.log', 'service.stdout.log', 'service.stderr.log', 'startup-reports.jsonl', 'last-startup-report.json', 'tray-shell.log']);

interface LogFile { readonly name: string; readonly path: string; readonly bytes: number; readonly compressed: boolean; readonly modifiedAt: number }

export class LogLifecycleStatusService {
  private lastEnforcedAt: string | undefined;
  private lastPrunedFiles = 0;
  private lastPrunedBytes = 0;

  public constructor(
    private readonly directory: string,
    private readonly maxFileBytes: number,
    private readonly backups: number,
    private readonly explicitBudgetBytes?: number,
  ) {}

  public async enforce(): Promise<Readonly<Record<string, unknown>>> {
    const budgetBytes = this.budgetBytes();
    const files = await collectFiles(this.directory);
    let totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
    let prunedFiles = 0; let prunedBytes = 0;
    const candidates = files.filter(isPrunable).sort((left, right) => left.modifiedAt - right.modifiedAt || left.name.localeCompare(right.name));
    for (const file of candidates) {
      if (totalBytes <= budgetBytes) break;
      await rm(file.path, { force: true });
      totalBytes -= file.bytes; prunedBytes += file.bytes; prunedFiles += 1;
    }
    this.lastEnforcedAt = new Date().toISOString(); this.lastPrunedFiles = prunedFiles; this.lastPrunedBytes = prunedBytes;
    return this.status();
  }

  public async status(): Promise<Readonly<Record<string, unknown>>> {
    const files = await collectFiles(this.directory);
    const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
    const budgetBytes = this.budgetBytes();
    const usagePercent = Math.min(100, Math.round(totalBytes / budgetBytes * 100));
    return {
      available: true, checkedAt: new Date().toISOString(), directory: this.directory, totalBytes, budgetBytes, usagePercent,
      state: usagePercent >= 90 ? 'critical' : usagePercent >= 75 ? 'warning' : 'healthy', fileCount: files.length,
      compressedCount: files.filter((file) => file.compressed).length,
      largestFiles: files.sort((left, right) => right.bytes - left.bytes).slice(0, 5).map(({ name, bytes, compressed }) => ({ name, bytes, compressed })),
      retention: { lastEnforcedAt: this.lastEnforcedAt, prunedFiles: this.lastPrunedFiles, prunedBytes: this.lastPrunedBytes, protectedActiveFiles: [...ACTIVE_NAMES] },
      policy: { maxActiveFileBytes: this.maxFileBytes, structuredBackups: this.backups, aggregateBudgetBytes: budgetBytes, repeatedEntrySuppressionSeconds: 10 },
    };
  }

  private budgetBytes(): number { return this.explicitBudgetBytes ?? Math.max(MINIMUM_BUDGET_BYTES, this.maxFileBytes * (this.backups + 9)); }
}

function isPrunable(file: LogFile): boolean {
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
