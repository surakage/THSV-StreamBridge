import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LogLifecycleStatusService } from '../../bridge/services/log-lifecycle-status-service.js';

describe('LogLifecycleStatusService', () => {
  it('reports bounded aggregate usage and compressed rotation evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-log-budget-'));
    await mkdir(join(root, 'daily'));
    await writeFile(join(root, 'streambridge.log'), 'active');
    await writeFile(join(root, 'streambridge.log.1.gz'), 'compressed');
    await writeFile(join(root, 'daily', 'THSV-StreamBridge-2026-08-26.txt.gz'), 'daily');
    const result = await new LogLifecycleStatusService(root, 5 * 1024 * 1024, 3).status();
    expect(result).toMatchObject({ available: true, state: 'healthy', fileCount: 3, compressedCount: 2 });
    expect(result['totalBytes']).toBeGreaterThan(0);
    expect(result['usagePercent']).toBeLessThan(75);
  });

  it('prunes oldest archives to an aggregate ceiling while preserving active logs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-log-prune-'));
    await mkdir(join(root, 'daily'));
    await writeFile(join(root, 'streambridge.log'), 'active-log');
    await writeFile(join(root, 'streambridge.log.1.gz'), 'old-archive-data');
    await writeFile(join(root, 'daily', 'THSV-StreamBridge-old.txt.gz'), 'newer-archive-data');
    const service = new LogLifecycleStatusService(root, 100, 1, 20);
    const result = await service.enforce();
    expect(result).toMatchObject({ totalBytes: 10, fileCount: 1, retention: { prunedFiles: 2 } });
    await expect(readFile(join(root, 'streambridge.log'), 'utf8')).resolves.toBe('active-log');
    await expect(stat(join(root, 'streambridge.log.1.gz'))).rejects.toThrow();
  });
});
