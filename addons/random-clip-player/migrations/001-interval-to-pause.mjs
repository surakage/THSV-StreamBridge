import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Preserves the old minutes-between-rotations value when upgrading to completion-driven pacing.
// The migration host backs up the entire private state directory before this script runs.
export async function migrate(context) {
  const path = join(context.storageRoot, 'settings.json');
  let settings;
  try { settings = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') return; throw error; }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return;
  if (settings.secondsBetweenClips === undefined && Number.isFinite(settings.intervalMinutes)) {
    settings.secondsBetweenClips = Math.max(1, Math.min(3_600, Math.round(settings.intervalMinutes * 60)));
  }
  delete settings.intervalMinutes;
  await writeFile(path, `${JSON.stringify(settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}
