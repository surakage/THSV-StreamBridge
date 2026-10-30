import { open, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/** OBS logs can be large; the plugin load messages this check needs are near the top. */
const MAXIMUM_LOG_BYTES = 2 * 1024 * 1024;

export interface ObsSetupCheck {
  readonly id: 'optional-obs-setup' | 'optional-obs-canvases';
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

/**
 * Finds extra OBS canvases that hold no scenes while another extra canvas does. On Oct 29 an empty leftover
 * "Vertical" canvas sat next to "Aitum Vertical", Aitum Stream Suite pointed at the empty one, and the vertical
 * output stayed stuck on the Stream Ending scene. A lone empty canvas is left alone, since a plugin may keep
 * its scenes somewhere else.
 */
export function findEmptyObsCanvases(collection: unknown): readonly string[] {
  if (!isRecord(collection) || !Array.isArray(collection['canvases'])) return [];
  const sceneCounts = new Map<string, number>();
  for (const source of Array.isArray(collection['sources']) ? collection['sources'] : []) {
    if (!isRecord(source) || (source['id'] !== 'scene' && source['id'] !== 'group')) continue;
    const canvas = source['canvas_uuid'];
    if (typeof canvas === 'string') sceneCounts.set(canvas, (sceneCounts.get(canvas) ?? 0) + 1);
  }
  const canvases = collection['canvases'].flatMap((entry) => {
    const info = isRecord(entry) && isRecord(entry['info']) ? entry['info'] : undefined;
    const uuid = info?.['uuid'];
    if (typeof uuid !== 'string') return [];
    const name = typeof info?.['name'] === 'string' && info['name'] !== '' ? info['name'] : uuid;
    return [{ name, scenes: sceneCounts.get(uuid) ?? 0 }];
  });
  if (!canvases.some((canvas) => canvas.scenes > 0)) return [];
  return canvases.filter((canvas) => canvas.scenes === 0).map((canvas) => canvas.name);
}

/** Checks the active OBS scene collection; undefined when it can't be found or read. */
export async function checkObsCanvases(obsDirectory: string): Promise<ObsSetupCheck | undefined> {
  const path = await activeSceneCollection(obsDirectory);
  if (path === undefined) return undefined;
  let collection: unknown;
  try { collection = JSON.parse(await readFile(path, 'utf8')); } catch { return undefined; }
  const name = isRecord(collection) && typeof collection['name'] === 'string' ? collection['name'] : 'current';
  const empty = findEmptyObsCanvases(collection);
  if (empty.length === 0) {
    return { id: 'optional-obs-canvases', label: 'OBS canvases', ready: true, detail: `No empty extra canvases in the "${name}" scene collection.`, recovery: '' };
  }
  const shown = empty.map((canvas) => `"${canvas}"`).join(', ');
  const recovery = `Make sure your vertical plugin (for example Aitum Stream Suite) uses the canvas that has your scenes, not ${shown}. To remove the empty canvas, close OBS, copy ${path} somewhere safe, delete that canvas from the file's "canvases" list, then start OBS and run this check again.`;
  return {
    id: 'optional-obs-canvases',
    label: 'OBS canvases',
    ready: false,
    detail: `The "${name}" scene collection has ${empty.length === 1 ? 'an extra canvas' : 'extra canvases'} with no scenes (${shown}) next to one that has them. A plugin pointed at the empty canvas can leave its output stuck on an old scene. ${recovery}`,
    recovery,
  };
}

/** OBS 31+ keeps the active collection in user.ini, older versions in global.ini; otherwise the newest collection file is used. */
async function activeSceneCollection(obsDirectory: string): Promise<string | undefined> {
  const scenes = join(obsDirectory, 'basic', 'scenes');
  for (const ini of ['user.ini', 'global.ini']) {
    let text: string;
    try { text = await readFile(join(obsDirectory, ini), 'utf8'); } catch { continue; }
    const file = /^\s*SceneCollectionFile\s*=\s*(.+?)\s*$/mu.exec(text)?.[1];
    if (file === undefined || /[\\/]/u.test(file)) continue;
    const path = join(scenes, `${file}.json`);
    try { if ((await stat(path)).isFile()) return path; } catch { /* Fall through to the next place OBS may record it. */ }
  }
  let names: string[];
  try { names = await readdir(scenes); } catch { return undefined; }
  let newest: { path: string; modified: Date } | undefined;
  for (const name of names) {
    if (!name.toLowerCase().endsWith('.json')) continue;
    const path = join(scenes, name);
    try {
      const info = await stat(path);
      if (info.isFile() && (newest === undefined || info.mtime > newest.modified)) newest = { path, modified: info.mtime };
    } catch { /* A file removed while listing is simply skipped. */ }
  }
  return newest?.path;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
