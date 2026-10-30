import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const MAXIMUM_LOG_BYTES = 8 * 1024 * 1024;
const MAXIMUM_COLLECTION_BYTES = 64 * 1024 * 1024;

export interface ObsEnvironmentIssue {
  readonly kind: 'duplicate-plugin' | 'duplicate-canvas-name' | 'empty-canvas' | 'aitum-canvas-missing';
  readonly detail: string;
  readonly fix: string;
}

export interface ObsEnvironmentReport {
  readonly available: boolean;
  readonly ready: boolean;
  readonly checkedLog?: string;
  readonly sceneCollection?: string;
  readonly issues: readonly ObsEnvironmentIssue[];
}

/**
 * Reads OBS's own files (newest log, the active scene collection and the Aitum profile settings)
 * for setup problems that make features fail in confusing ways. Found on a creator PC on
 * 2026-10-29: Aitum Stream Suite installed twice (in Program Files and in ProgramData), plus an
 * empty leftover vertical canvas that Aitum's settings pointed at, so the vertical canvas ignored
 * the first scene switch. Read-only; returns available: false when OBS is not installed here.
 */
export async function inspectObsEnvironment(obsRoot: string | undefined): Promise<ObsEnvironmentReport> {
  if (obsRoot === undefined) return { available: false, ready: true, issues: [] };
  const issues: ObsEnvironmentIssue[] = [];
  const log = await newestLog(join(obsRoot, 'logs'));
  if (log !== undefined) issues.push(...duplicatePlugins(log.text));
  const ini = await readText(join(obsRoot, 'user.ini'), 256 * 1024) ?? await readText(join(obsRoot, 'global.ini'), 256 * 1024);
  const collectionFile = ini === undefined ? undefined : iniValue(ini, 'Basic', 'SceneCollectionFile');
  const profileDir = ini === undefined ? undefined : iniValue(ini, 'Basic', 'ProfileDir');
  let sceneCollection: string | undefined;
  if (collectionFile !== undefined) {
    const file = collectionFile.toLowerCase().endsWith('.json') ? collectionFile : `${collectionFile}.json`;
    const collection = await readJson(join(obsRoot, 'basic', 'scenes', file), MAXIMUM_COLLECTION_BYTES);
    if (collection !== undefined) {
      sceneCollection = file;
      const aitum = profileDir === undefined ? undefined : await readJson(join(obsRoot, 'basic', 'profiles', profileDir, 'aitum.json'), 4 * 1024 * 1024);
      issues.push(...canvasIssues(collection, aitum));
    }
  }
  if (log === undefined && sceneCollection === undefined) return { available: false, ready: true, issues: [] };
  return { available: true, ready: issues.length === 0, ...(log === undefined ? {} : { checkedLog: log.name }), ...(sceneCollection === undefined ? {} : { sceneCollection }), issues };
}

/** OBS logs "… already used!  Duplicate library?" when the same plugin is loaded from two folders. */
export function duplicatePlugins(logText: string): ObsEnvironmentIssue[] {
  const names = new Set<string>();
  for (const match of logText.matchAll(/(?:Dock id|Source) '([^']{1,120})' already (?:used|exists)!\s+Duplicate library\?/gu)) names.add(match[1] ?? '');
  if (names.size === 0) return [];
  const plugins = new Set([...names].map((name) => (/^aitum/iu.test(name) || name === 'component_source' ? 'Aitum Stream Suite' : name)));
  return [...plugins].map((plugin) => ({
    kind: 'duplicate-plugin' as const,
    detail: `OBS loaded ${plugin} twice (its docks or sources were registered twice at startup).`,
    fix: `Close OBS and remove the older copy of ${plugin}. OBS loads plugins from C:\\Program Files\\obs-studio\\obs-plugins\\64bit and from C:\\ProgramData\\obs-studio\\plugins; keep only one.`,
  }));
}

export function canvasIssues(collection: unknown, aitumProfile: unknown): ObsEnvironmentIssue[] {
  const data = isRecord(collection) ? collection : {};
  const canvases = (Array.isArray(data['canvases']) ? data['canvases'] : []).map((entry) => (isRecord(entry) && isRecord(entry['info']) ? entry['info'] : {})).map((info) => ({ name: typeof info['name'] === 'string' ? info['name'] : '', uuid: typeof info['uuid'] === 'string' ? info['uuid'] : '' }));
  const sources = Array.isArray(data['sources']) ? data['sources'].filter(isRecord) : [];
  const issues: ObsEnvironmentIssue[] = [];
  const byName = new Map<string, number>();
  for (const canvas of canvases) byName.set(canvas.name.toLowerCase(), (byName.get(canvas.name.toLowerCase()) ?? 0) + 1);
  for (const [name, count] of byName) if (count > 1) issues.push({ kind: 'duplicate-canvas-name', detail: `OBS has ${String(count)} canvases named "${name}". Scene links and outputs find canvases by name, so they can pick the wrong one.`, fix: 'Close OBS, keep the canvas that holds your scenes, and remove or rename the others.' });
  for (const canvas of canvases) {
    const scenes = sources.filter((source) => source['canvas_uuid'] === canvas.uuid && source['id'] === 'scene');
    const items = scenes.reduce((total, scene) => total + (isRecord(scene['settings']) && Array.isArray(scene['settings']['items']) ? scene['settings']['items'].length : 0), 0);
    if (canvas.uuid !== '' && items === 0) issues.push({ kind: 'empty-canvas', detail: `The OBS canvas "${canvas.name}" has no sources in any scene. It is usually a leftover from an older plugin.`, fix: 'Close OBS and remove the empty canvas, or point the plugin that uses it at your real canvas.' });
  }
  const aitum = isRecord(aitumProfile) && Array.isArray(aitumProfile['canvas']) ? aitumProfile['canvas'].filter(isRecord) : [];
  const known = new Set(canvases.map((canvas) => canvas.uuid));
  for (const entry of aitum) {
    const uuid = typeof entry['uuid'] === 'string' ? entry['uuid'] : '';
    const name = typeof entry['name'] === 'string' ? entry['name'] : 'vertical';
    const target = canvases.find((canvas) => canvas.uuid === uuid);
    const holdsScenes = target !== undefined && sources.some((source) => source['canvas_uuid'] === uuid && source['id'] === 'scene' && isRecord(source['settings']) && Array.isArray(source['settings']['items']) && source['settings']['items'].length > 0);
    if (uuid !== '' && (!known.has(uuid) || !holdsScenes)) issues.push({ kind: 'aitum-canvas-missing', detail: `Aitum Stream Suite's "${name}" canvas points at a canvas that ${known.has(uuid) ? 'has no scenes' : 'does not exist'} in your scene collection.`, fix: `Close OBS and point Aitum's "${name}" canvas (profiles\\<profile>\\aitum.json) at the canvas that holds your vertical scenes.` });
  }
  return issues;
}

async function newestLog(folder: string): Promise<{ readonly name: string; readonly text: string } | undefined> {
  try {
    const entries = (await readdir(folder)).filter((name) => name.toLowerCase().endsWith('.txt'));
    const dated = await Promise.all(entries.map(async (name) => ({ name, modified: (await stat(join(folder, name))).mtimeMs })));
    const newest = dated.sort((left, right) => right.modified - left.modified)[0];
    if (newest === undefined) return undefined;
    const text = await readText(join(folder, newest.name), MAXIMUM_LOG_BYTES);
    return text === undefined ? undefined : { name: newest.name, text };
  } catch { return undefined; }
}

async function readText(path: string, maximumBytes: number): Promise<string | undefined> {
  try {
    if ((await stat(path)).size > maximumBytes) return undefined;
    return (await readFile(path, 'utf8')).replace(/^\uFEFF/u, '');
  } catch { return undefined; }
}

async function readJson(path: string, maximumBytes: number): Promise<unknown> {
  const text = await readText(path, maximumBytes);
  if (text === undefined) return undefined;
  try { return JSON.parse(text) as unknown; } catch { return undefined; }
}

function iniValue(text: string, section: string, key: string): string | undefined {
  let current = '';
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim();
    const header = /^\[(.+)\]$/u.exec(line);
    if (header !== null) { current = header[1] ?? ''; continue; }
    if (current !== section) continue;
    const separator = line.indexOf('=');
    if (separator > 0 && line.slice(0, separator).trim() === key) return line.slice(separator + 1).trim() || undefined;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
