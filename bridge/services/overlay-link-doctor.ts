import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { addOnOverlayModuleId } from './http-server.js';
import { readActiveSceneCollection } from './obs-environment-doctor.js';

export interface OverlayLinkAddOn { readonly moduleId: string; readonly enabled: boolean; readonly health: string; readonly permissions: readonly string[] }

export interface OverlayLinkIssue {
  readonly kind: 'missing-file' | 'wrong-port' | 'overlay-not-installed' | 'overlay-turned-off';
  readonly source: string;
  readonly scenes: readonly string[];
  readonly fix: string;
}

export interface OverlayLinkReport {
  readonly available: boolean;
  readonly sceneCollection?: string;
  readonly checked: number;
  readonly issues: readonly OverlayLinkIssue[];
}

interface LinkedSource { readonly name: string; readonly scenes: readonly string[]; readonly url?: string; readonly file?: string }

/**
 * Stream Doctor: before going live, checks every OBS source that a scene uses for links that will show nothing:
 * a local file (media, image or a file:// browser page) that no longer exists, a StreamBridge overlay on the wrong
 * port, or an add-on overlay whose add-on is not installed or is turned off (StreamBridge answers those with "not
 * found"). Sources no scene uses are skipped, so leftovers do not cause noise. Read-only.
 */
export function overlayLinkIssues(collection: unknown, port: number, addOns: readonly OverlayLinkAddOn[], exists: ReadonlySet<string>): OverlayLinkIssue[] {
  const issues: OverlayLinkIssue[] = [];
  for (const source of linkedSources(collection)) {
    const where = source.scenes.slice(0, 2).map((scene) => `"${scene}"`).join(' and ') + (source.scenes.length > 2 ? ` and ${String(source.scenes.length - 2)} more scenes` : '');
    if (source.file !== undefined && !exists.has(source.file)) {
      issues.push({ kind: 'missing-file', source: source.name, scenes: source.scenes, fix: `The OBS source "${source.name}" (in ${where}) uses ${source.file}, which is not there anymore, so it shows nothing. Put the file back or pick its new location in the source's properties.` });
      continue;
    }
    const bridge = bridgeOverlay(source.url);
    if (bridge === undefined) continue;
    if (bridge.port !== port) {
      issues.push({ kind: 'wrong-port', source: source.name, scenes: source.scenes, fix: `The OBS source "${source.name}" (in ${where}) points at port ${String(bridge.port)}, but StreamBridge runs on port ${String(port)}. Change the port in its URL to ${String(port)}.` });
      continue;
    }
    const moduleId = addOnOverlayModuleId(bridge.path);
    if (moduleId === undefined) continue;
    const addOn = addOns.find((candidate) => candidate.moduleId === moduleId);
    if (addOn === undefined || addOn.health !== 'installed' || !addOn.permissions.includes('overlay.publish')) {
      issues.push({ kind: 'overlay-not-installed', source: source.name, scenes: source.scenes, fix: `The OBS source "${source.name}" (in ${where}) shows the ${moduleId} overlay, but that feature is not installed, so it stays blank. Install the feature again, or remove the source.` });
    } else if (!addOn.enabled) {
      issues.push({ kind: 'overlay-turned-off', source: source.name, scenes: source.scenes, fix: `The OBS source "${source.name}" (in ${where}) shows the ${moduleId} overlay, but that feature is turned off, so it stays blank. Turn the feature on, or hide the source if you meant to.` });
    }
  }
  return issues;
}

/** Local files the sources point at, so the caller can check which exist. */
export function linkedFiles(collection: unknown): readonly string[] {
  return [...new Set(linkedSources(collection).flatMap((source) => (source.file === undefined ? [] : [source.file])))];
}

export async function inspectOverlayLinks(obsRoot: string | undefined, port: number, addOns: readonly OverlayLinkAddOn[]): Promise<OverlayLinkReport> {
  const active = await readActiveSceneCollection(obsRoot);
  if (active === undefined) return { available: false, checked: 0, issues: [] };
  const files = linkedFiles(active.collection);
  const exists = new Set<string>();
  await Promise.all(files.map(async (file) => { try { await stat(file); exists.add(file); } catch { /* missing */ } }));
  return { available: true, sceneCollection: active.file, checked: linkedSources(active.collection).length, issues: overlayLinkIssues(active.collection, port, addOns, exists) };
}

function linkedSources(collection: unknown): LinkedSource[] {
  const data = isRecord(collection) ? collection : {};
  const sources = Array.isArray(data['sources']) ? data['sources'].filter(isRecord) : [];
  const usedBy = new Map<string, string[]>();
  for (const scene of sources.filter((source) => source['id'] === 'scene' || source['id'] === 'group')) {
    const items = isRecord(scene['settings']) && Array.isArray(scene['settings']['items']) ? scene['settings']['items'].filter(isRecord) : [];
    for (const item of items) {
      if (typeof item['name'] !== 'string' || typeof scene['name'] !== 'string') continue;
      const scenes = usedBy.get(item['name']) ?? [];
      if (!scenes.includes(scene['name'])) scenes.push(scene['name']);
      usedBy.set(item['name'], scenes);
    }
  }
  const linked: LinkedSource[] = [];
  for (const source of sources) {
    const name = typeof source['name'] === 'string' ? source['name'] : '';
    const scenes = usedBy.get(name);
    const settings = isRecord(source['settings']) ? source['settings'] : {};
    if (scenes === undefined) continue;
    const url = typeof settings['url'] === 'string' && settings['url'] !== '' ? settings['url'] : undefined;
    const browserFile = source['id'] === 'browser_source' && settings['is_local_file'] === true && typeof settings['local_file'] === 'string' ? settings['local_file'] : undefined;
    const mediaFile = source['id'] === 'ffmpeg_source' && settings['is_local_file'] !== false && typeof settings['local_file'] === 'string' ? settings['local_file'] : undefined;
    const imageFile = source['id'] === 'image_source' && typeof settings['file'] === 'string' ? settings['file'] : undefined;
    const pageFile = source['id'] === 'browser_source' && browserFile === undefined && url?.startsWith('file:') === true ? filePath(url) : undefined;
    const file = [browserFile, mediaFile, imageFile, pageFile].find((value) => value !== undefined && value !== '');
    if (file !== undefined) linked.push({ name, scenes, file });
    else if (source['id'] === 'browser_source' && url !== undefined) linked.push({ name, scenes, url });
  }
  return linked;
}

function bridgeOverlay(url: string | undefined): { readonly port: number; readonly path: string } | undefined {
  if (url === undefined) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname) || !parsed.pathname.startsWith('/overlay')) return undefined;
    return { port: parsed.port === '' ? 80 : Number(parsed.port), path: parsed.pathname.replace(/\/+$/u, '') || '/' };
  } catch { return undefined; }
}

function filePath(url: string): string | undefined {
  try { return fileURLToPath(new URL(url.split(/[?#]/u)[0] ?? url)); } catch { return undefined; }
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
