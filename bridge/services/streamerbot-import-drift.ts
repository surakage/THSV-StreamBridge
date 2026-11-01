import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const MAXIMUM_ACTIONS_BYTES = 128 * 1024 * 1024;
const CSHARP_SUB_ACTION = 99_999;

export type ImportedActionState = 'current' | 'outdated' | 'customized' | 'missing';

export interface ImportedActionCheck {
  readonly id: string;
  readonly name: string;
  readonly state: ImportedActionState;
}

export interface ImportedPackageCheck {
  readonly folder: string;
  readonly name: string;
  readonly importFile: string;
  /** Re-importing this package brings its actions up to date. */
  readonly reimport: boolean;
  /** Actions the creator edited; a re-import would replace them, so they are listed before anyone re-imports. */
  readonly customized: readonly string[];
  readonly actions: readonly ImportedActionCheck[];
}

export interface ImportDriftReport {
  readonly available: boolean;
  readonly packages: readonly ImportedPackageCheck[];
  readonly reimportCount: number;
  readonly customizedCount: number;
}

export interface ExpectedPackage {
  readonly folder: string;
  readonly name: string;
  readonly actions: readonly { readonly id: string; readonly name: string; readonly importFile: string; readonly sourceHash: string }[];
}

/**
 * Line endings, blank lines, whole-line comments and the release number in a User-Agent
 * ("THSV-StreamBridge-Translate/4.1.6") do not change what an action does, so they neither count as an edit nor ask
 * for a re-import every release.
 */
export function sourceFingerprint(sourceCode: string): string {
  const canonical = sourceCode.replace(/\r\n?/gu, '\n').split('\n').map((line) => line.trimEnd()).filter((line) => line.trim() !== '' && !line.trimStart().startsWith('//')).join('\n')
    .replace(/(THSV-StreamBridge-[A-Za-z-]+\/)\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?/gu, '$1*');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Stream Doctor: compares the THSV actions saved in Streamer.bot with the imports shipped in this release and says
 * which packages to re-import. An action whose code matches an earlier StreamBridge release is safe to replace; code
 * that matches no release was edited by the creator (for example their own Fast Scenes changes) and is protected:
 * it is named so they can decide before a re-import overwrites it. Packages never imported are left alone.
 * Read-only.
 */
export function compareImportedActions(savedActions: unknown, expected: readonly ExpectedPackage[], releasedHashes: ReadonlySet<string>): ImportDriftReport {
  const saved = new Map<string, readonly string[]>();
  for (const action of Array.isArray(savedActions) ? savedActions : []) {
    if (!isRecord(action) || typeof action['id'] !== 'string') continue;
    const subActions = Array.isArray(action['subActions']) ? action['subActions'].filter(isRecord) : [];
    saved.set(action['id'].toLowerCase(), subActions.flatMap((sub) => (sub['type'] === CSHARP_SUB_ACTION && typeof sub['byteCode'] === 'string' ? [sourceFingerprint(decode(sub['byteCode']))] : [])));
  }
  const packages: ImportedPackageCheck[] = [];
  for (const pkg of expected) {
    const actions = pkg.actions.map((action): ImportedActionCheck => {
      const code = saved.get(action.id.toLowerCase());
      const state: ImportedActionState = code === undefined ? 'missing' : code.includes(action.sourceHash) ? 'current' : code.some((hash) => releasedHashes.has(hash)) || code.length === 0 ? 'outdated' : 'customized';
      return { id: action.id, name: action.name, state };
    });
    if (actions.every((action) => action.state === 'missing')) continue;
    const customized = actions.filter((action) => action.state === 'customized').map((action) => action.name);
    packages.push({ folder: pkg.folder, name: pkg.name, importFile: pkg.actions[0]?.importFile ?? '', reimport: actions.some((action) => action.state === 'outdated' || action.state === 'missing'), customized, actions });
  }
  return { available: true, packages, reimportCount: packages.filter((pkg) => pkg.reimport).length, customizedCount: packages.reduce((total, pkg) => total + pkg.customized.length, 0) };
}

/**
 * Plain-words readiness notices, one per package to re-import. They are advice, not blockers: older actions keep
 * running. Packages whose only differences are the creator's own edits get no notice; the report still lists them.
 */
export function importDriftNotices(report: ImportDriftReport): readonly Readonly<Record<string, unknown>>[] {
  return report.packages.filter((pkg) => pkg.reimport).map((pkg) => {
    const outdated = pkg.actions.filter((action) => action.state === 'outdated').map((action) => action.name);
    const missing = pkg.actions.filter((action) => action.state === 'missing').map((action) => action.name);
    const parts = [
      ...(outdated.length === 0 ? [] : [`${list(outdated)} ${outdated.length === 1 ? 'is' : 'are'} from an older StreamBridge release`]),
      ...(missing.length === 0 ? [] : [`${list(missing)} ${missing.length === 1 ? 'is' : 'are'} missing from Streamer.bot`]),
    ];
    const keep = pkg.customized.length === 0 ? '' : ` You changed ${list(pkg.customized)}, and re-importing replaces ${pkg.customized.length === 1 ? 'it' : 'them'}, so copy your changes first or skip this re-import.`;
    return { area: 'streamerbot-imports', package: pkg.folder, fix: `${pkg.name}: ${parts.join(', and ')}. Re-import ${pkg.importFile} in Streamer.bot.${keep}` };
  });
}

/** Reads the shipped packages and the creator's Streamer.bot actions.json. */
export async function inspectImportDrift(packagesRoot: string, actionsPath: string | undefined): Promise<ImportDriftReport> {
  const empty: ImportDriftReport = { available: false, packages: [], reimportCount: 0, customizedCount: 0 };
  if (actionsPath === undefined) return empty;
  const document = await readJson(actionsPath, MAXIMUM_ACTIONS_BYTES);
  if (!isRecord(document) || !Array.isArray(document['actions'])) return empty;
  const index = await readJson(join(packagesRoot, 'import-index.json'), 4 * 1024 * 1024);
  const history = await readJson(join(packagesRoot, 'source-history.json'), 16 * 1024 * 1024);
  const releasedHashes = new Set(isRecord(history) && Array.isArray(history['hashes']) ? history['hashes'].filter((hash): hash is string => typeof hash === 'string') : []);
  const expected: ExpectedPackage[] = [];
  for (const entry of isRecord(index) && Array.isArray(index['packages']) ? index['packages'].filter(isRecord) : []) {
    const folder = typeof entry['folder'] === 'string' ? entry['folder'] : '';
    if (!/^[a-z0-9-]+$/u.test(folder)) continue;
    const manifest = await readJson(join(packagesRoot, folder, 'manifest.json'), 4 * 1024 * 1024);
    if (!isRecord(manifest) || !Array.isArray(manifest['actions'])) continue;
    const actions: ExpectedPackage['actions'][number][] = [];
    for (const action of manifest['actions'].filter(isRecord)) {
      if (typeof action['id'] !== 'string' || typeof action['name'] !== 'string' || typeof action['source'] !== 'string' || typeof action['importFile'] !== 'string') continue;
      if (action['source'].includes('..')) continue;
      const source = await readText(join(packagesRoot, folder, action['source']), 4 * 1024 * 1024);
      if (source !== undefined) actions.push({ id: action['id'], name: action['name'], importFile: action['importFile'], sourceHash: sourceFingerprint(source) });
    }
    if (actions.length > 0) expected.push({ folder, name: typeof manifest['name'] === 'string' ? manifest['name'].replace(/^THSV StreamBridge - /u, '') : folder, actions });
  }
  return compareImportedActions(document['actions'], expected, releasedHashes);
}

function list(names: readonly string[]): string {
  const shown = names.slice(0, 3).map((name) => `"${name}"`);
  const more = names.length - shown.length;
  return more > 0 ? `${shown.join(', ')} and ${String(more)} more` : shown.length < 2 ? shown.join('') : `${shown.slice(0, -1).join(', ')} and ${shown.at(-1) ?? ''}`;
}

function decode(byteCode: string): string {
  try { return Buffer.from(byteCode, 'base64').toString('utf8'); } catch { return ''; }
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

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
