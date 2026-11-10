import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

const SKIPPED_DIRECTORIES = new Set(['logs', 'backups', 'clip-media-cache', 'node_modules']);

/**
 * Removes half-written save files (`*.tmp`) left behind when a save was interrupted.
 * Every save writes a `.tmp` file and renames it over the real file, so a `.tmp` file
 * that is older than the grace period is never read again.
 */
export async function removeStaleTemporaryFiles(roots: readonly string[], olderThanMs = 60 * 60 * 1_000, now = Date.now(), maximumDepth = 4): Promise<string[]> {
  const removed: string[] = [];
  const visit = async (directory: string, depth: number): Promise<void> => {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (depth < maximumDepth && !SKIPPED_DIRECTORIES.has(entry.name)) await visit(path, depth + 1);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.tmp')) continue;
      try {
        if (now - (await stat(path)).mtimeMs < olderThanMs) continue;
        await rm(path, { force: true });
        removed.push(path);
      } catch { /* A file that cannot be removed is left for the next start. */ }
    }
  };
  for (const root of new Set(roots)) await visit(root, 0);
  return removed;
}
