import { access, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CrashSafeWriteBoundary } from '../../bridge/services/crash-safe-state-file.js';
import { readCrashSafeText, writeCrashSafeText } from '../../bridge/services/crash-safe-state-file.js';

describe('crash-safe state files', () => {
  it('restores the previous file after interruption between Windows replacement steps', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-state-recovery-')); const path = join(root, 'state.json');
    await writeFile(path, 'trusted'); await rename(path, `${path}.previous`);
    await expect(readCrashSafeText(path)).resolves.toBe('trusted');
    await expect(readFile(path, 'utf8')).resolves.toBe('trusted');
  });

  it('keeps the completed replacement and removes stale recovery evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-state-replace-')); const path = join(root, 'state.json');
    await writeFile(path, 'current'); await writeFile(`${path}.previous`, 'old');
    await writeCrashSafeText(path, 'new');
    await expect(readFile(path, 'utf8')).resolves.toBe('new');
    await expect(access(`${path}.previous`)).rejects.toThrow();
  });

  for (const boundary of ['temporary-written', 'previous-moved', 'replacement-installed', 'recovery-removed'] as const satisfies readonly CrashSafeWriteBoundary[]) {
    it(`recovers a readable value after a fault at ${boundary}`, async () => {
      const root = await mkdtemp(join(tmpdir(), 'thsv-state-fault-')); const path = join(root, 'state.json');
      await writeFile(path, 'old');
      await expect(writeCrashSafeText(path, 'new', { onBoundary: (current) => { if (current === boundary) throw new Error(`fault:${boundary}`); } })).rejects.toThrow(`fault:${boundary}`);
      await expect(readCrashSafeText(path)).resolves.toMatch(/^(old|new)$/u);
      await expect(access(`${path}.previous`)).rejects.toThrow();
    });
  }

  it('serializes concurrent writers for the same path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-state-concurrent-')); const path = join(root, 'state.json');
    let releaseFirst!: () => void; const firstPaused = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let firstReached!: () => void; const reached = new Promise<void>((resolve) => { firstReached = resolve; });
    const first = writeCrashSafeText(path, 'first', { onBoundary: async (boundary) => { if (boundary === 'temporary-written') { firstReached(); await firstPaused; } } });
    await reached;
    const second = writeCrashSafeText(path, 'second');
    releaseFirst(); await Promise.all([first, second]);
    await expect(readCrashSafeText(path)).resolves.toBe('second');
  });
});
