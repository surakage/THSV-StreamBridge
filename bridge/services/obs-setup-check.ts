import { open, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/** OBS logs can be large; the plugin load messages this check needs are near the top. */
const MAXIMUM_LOG_BYTES = 2 * 1024 * 1024;

export interface ObsSetupCheck {
  readonly id: 'optional-obs-setup';
  readonly label: string;
  readonly ready: boolean;
  readonly detail: string;
  readonly recovery: string;
}

/**
 * Finds plugins OBS loaded twice in one start. OBS logs "Dock id '<name>' already used! Duplicate library?"
 * when two copies of a plugin register the same dock; on Oct 29 an old Aitum Stream Suite copy in
 * C:\ProgramData\obs-studio\plugins made the vertical canvas miss the first scene switch.
 */
export function findDuplicateObsPlugins(log: string): readonly string[] {
  const names = new Set<string>();
  for (const line of log.split(/\r?\n/u)) {
    if (!/duplicate library/iu.test(line)) continue;
    const quoted = /'([^']{1,120})'/u.exec(line)?.[1];
    names.add(quoted ?? line.replace(/^[\d:.\s]+/u, '').trim().slice(0, 120));
  }
  return [...names];
}

/** Checks the newest OBS log; undefined when there is no OBS log to read (OBS not installed or never started). */
export async function checkObsSetup(logsDirectory: string): Promise<ObsSetupCheck | undefined> {
  const latest = await newestLog(logsDirectory);
  if (latest === undefined) return undefined;
  const duplicates = findDuplicateObsPlugins(await readStart(latest.path));
  const started = latest.modified.toLocaleString('en-US');
  if (duplicates.length === 0) {
    return { id: 'optional-obs-setup', label: 'OBS plugins', ready: true, detail: `No duplicate OBS plugins in the OBS start of ${started}.`, recovery: '' };
  }
  const shown = duplicates.slice(0, 5).join(', ');
  const recovery = 'Close OBS. Keep the newer copy of the plugin (usually in C:\\Program Files\\obs-studio\\obs-plugins\\64bit) and move the older one (often in C:\\ProgramData\\obs-studio\\plugins) to the Recycle Bin, then start OBS and run this check again.';
  return {
    id: 'optional-obs-setup',
    label: 'OBS plugins',
    ready: false,
    detail: `OBS loaded a plugin twice in its start of ${started} (${String(duplicates.length)} duplicate dock${duplicates.length === 1 ? '' : 's'}: ${shown}${duplicates.length > 5 ? ', …' : ''}). Two copies of one plugin can fight over the same scenes, for example a vertical canvas missing the first scene switch. ${recovery}`,
    recovery,
  };
}

async function newestLog(directory: string): Promise<{ readonly path: string; readonly modified: Date } | undefined> {
  let names: string[];
  try { names = await readdir(directory); } catch { return undefined; }
  let newest: { path: string; modified: Date } | undefined;
  for (const name of names) {
    if (!name.toLowerCase().endsWith('.txt')) continue;
    const path = join(directory, name);
    try {
      const info = await stat(path);
      if (info.isFile() && (newest === undefined || info.mtime > newest.modified)) newest = { path, modified: info.mtime };
    } catch { /* A log rotated away while listing is simply skipped. */ }
  }
  return newest;
}

async function readStart(path: string): Promise<string> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(MAXIMUM_LOG_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, MAXIMUM_LOG_BYTES, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally { await handle.close(); }
}
