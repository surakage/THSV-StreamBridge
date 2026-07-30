import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Clip Courier 2.5.1 moved scanning into the shared Clip Library Cache and
// replaced the old first-scan switches with one explicit current-stream gate.
export async function migrate(context) {
  const path = join(context.storageRoot, 'settings.json');
  let settings;
  try { settings = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') return; throw error; }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return;
  if (settings.automaticCurrentStreamClips === undefined) settings.automaticCurrentStreamClips = false;
  delete settings.scanMinutes;
  delete settings.clipCount;
  delete settings.publishExistingOnFirstScan;
  if (typeof settings.messageTemplate === 'string') settings.messageTemplate = settings.messageTemplate.replaceAll('â€”', '—');
  await writeFile(path, `${JSON.stringify(settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}
