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
    expect(result).toMatchObject({ available: true, state: 'healthy', fileCount: 3, compressedCount: 2, storage: { active: { fileCount: 1 }, archive: { fileCount: 2 } } });
    expect(result['totalBytes']).toBeGreaterThan(0);
    expect(result['usagePercent']).toBeLessThan(75);
  });

  it('prunes oldest archives to an aggregate ceiling while preserving active logs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-log-prune-'));
    await mkdir(join(root, 'daily'));
    await writeFile(join(root, 'streambridge.log'), 'active-log');
    await writeFile(join(root, 'streambridge.log.1.gz'), 'old-archive-data');
    await writeFile(join(root, 'daily', 'THSV-StreamBridge-old.txt.gz'), 'newer-archive-data');
    const service = new LogLifecycleStatusService(root, 100, 1, { activeBytes: 5, archiveBytes: 1 });
    const result = await service.enforce();
    expect(result).toMatchObject({ totalBytes: 10, fileCount: 1, state: 'critical', storage: { active: { bytes: 10, state: 'critical' }, archive: { bytes: 0, state: 'healthy' } }, retention: { prunedFiles: 2 } });
    await expect(readFile(join(root, 'streambridge.log'), 'utf8')).resolves.toBe('active-log');
    await expect(stat(join(root, 'streambridge.log.1.gz'))).rejects.toThrow();
  });

  it('applies archive cleanup independently when active output exceeds its own ceiling', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-log-lanes-'));
    await writeFile(join(root, 'service.stdout.log'), 'active-output');
    await writeFile(join(root, 'streambridge.log.1.gz'), 'archive');
    const service = new LogLifecycleStatusService(root, 100, 1, { activeBytes: 4, archiveBytes: 100 });
    const result = await service.enforce();
    expect(result).toMatchObject({ fileCount: 2, state: 'critical', storage: { active: { bytes: 13, state: 'critical' }, archive: { bytes: 7, state: 'healthy' } }, retention: { prunedFiles: 0 } });
  });

  it('previews without mutation and persists creator-approved lane budgets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-log-policy-')); const policy = join(root, 'configuration', 'log-storage-policy.json');
    await writeFile(join(root, 'streambridge.log.1.gz'), 'archive');
    const service = new LogLifecycleStatusService(root, 5 * 1024 * 1024, 3, undefined, policy);
    const budgets = { activeBytes: 32 * 1024 * 1024, archiveBytes: 96 * 1024 * 1024 };
    const preview = await service.preview(budgets);
    expect(preview).toMatchObject({ mutationFree: true, activeFilesProtected: true, budgets, wouldPruneFiles: 0 });
    expect(String(preview['previewToken'])).toMatch(/^[a-f0-9]{64}$/u);
    await service.applyAndPrune({ ...budgets, previewToken: preview['previewToken'] });
    expect(JSON.parse(await readFile(policy, 'utf8'))).toMatchObject({ schemaVersion: 1, ...budgets });
    const restarted = new LogLifecycleStatusService(root, 5 * 1024 * 1024, 3, undefined, policy);
    await restarted.start();
    await expect(restarted.status()).resolves.toMatchObject({ policy: { activeBudgetBytes: budgets.activeBytes, archiveBudgetBytes: budgets.archiveBytes, persistent: true } });
  });

  it('rejects an unpreviewed archive deletion approval', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-log-stale-preview-')); const policy = join(root, 'configuration', 'log-storage-policy.json');
    const service = new LogLifecycleStatusService(root, 5 * 1024 * 1024, 3, undefined, policy);
    await expect(service.applyAndPrune({ activeBytes: 16 * 1024 * 1024, archiveBytes: 48 * 1024 * 1024 })).rejects.toThrow('Run Preview archive prune again');
  });
});
