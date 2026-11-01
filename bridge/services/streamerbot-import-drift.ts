import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const MAXIMUM_ACTIONS_BYTES = 128 * 1024 * 1024;
const CSHARP_SUB_ACTION = 99_999;
const SET_ARGUMENT_SUB_ACTION = 123;

export type ImportedActionState = 'current' | 'outdated' | 'customized' | 'missing';

export interface ImportedActionCheck {
  readonly id: string;
  readonly name: string;
  readonly state: ImportedActionState;
  /** What a re-import of this action undoes and the creator must put back: triggers they added and settings they changed. */
  readonly redo: readonly string[];
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

export interface ExpectedAction {
  readonly id: string;
  readonly name: string;
  readonly importFile: string;
  readonly sourceHash: string;
  /** Triggers the import itself brings; any more were added by the creator and a re-import removes them. */
  readonly shippedTriggers?: number;
  /** Where the package's setup notes say to attach this action's triggers, for example "Core > Streamer.bot > Streamer.bot Started". */
  readonly triggerSetup?: readonly string[];
  /** Arguments the creator may edit, with the value the import resets them to. */
  readonly editableArguments?: Readonly<Record<string, string>>;
  /** A starter the creator is meant to replace with their own sub-actions (Scene Actions). */
  readonly creatorTemplate?: boolean;
}

export interface ExpectedPackage {
  readonly folder: string;
  readonly name: string;
  readonly actions: readonly ExpectedAction[];
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
 * it is named so they can decide before a re-import overwrites it. Packages never imported are left alone, and a
 * package of starter templates the creator fills in themselves (Scene Actions) is never suggested for re-import.
 * Read-only.
 */
export function compareImportedActions(savedActions: unknown, expected: readonly ExpectedPackage[], releasedHashes: ReadonlySet<string>): ImportDriftReport {
  const saved = new Map<string, { readonly code: readonly string[]; readonly triggers: number; readonly argumentValues: ReadonlyMap<string, string> }>();
  for (const action of Array.isArray(savedActions) ? savedActions : []) {
    if (!isRecord(action) || typeof action['id'] !== 'string') continue;
    const subActions = Array.isArray(action['subActions']) ? action['subActions'].filter(isRecord) : [];
    saved.set(action['id'].toLowerCase(), {
      code: subActions.flatMap((sub) => (sub['type'] === CSHARP_SUB_ACTION && typeof sub['byteCode'] === 'string' ? [sourceFingerprint(decode(sub['byteCode']))] : [])),
      triggers: Array.isArray(action['triggers']) ? action['triggers'].length : 0,
      argumentValues: new Map(subActions.flatMap((sub) => (sub['type'] === SET_ARGUMENT_SUB_ACTION && typeof sub['variableName'] === 'string' ? [[sub['variableName'], scalarText(sub['value'])] as const] : []))),
    });
  }
  const packages: ImportedPackageCheck[] = [];
  for (const pkg of expected) {
    const actions = pkg.actions.map((action): ImportedActionCheck => {
      const found = saved.get(action.id.toLowerCase());
      const code = found?.code;
      const state: ImportedActionState = code === undefined ? 'missing' : code.includes(action.sourceHash) ? 'current' : code.some((hash) => releasedHashes.has(hash)) || code.length === 0 ? 'outdated' : 'customized';
      const redo: string[] = [];
      if (found !== undefined && found.triggers > (action.shippedTriggers ?? 0)) redo.push(`re-add the trigger${found.triggers - (action.shippedTriggers ?? 0) === 1 ? '' : 's'} you added to "${action.name}"${action.triggerSetup === undefined || action.triggerSetup.length === 0 ? '' : ` (${action.triggerSetup.join('; ')})`}`);
      for (const [argument, reset] of Object.entries(action.editableArguments ?? {})) {
        const value = found?.argumentValues.get(argument);
        if (value !== undefined && value !== reset) redo.push(`set ${argument} in "${action.name}" back to ${value}`);
      }
      return { id: action.id, name: action.name, state, redo };
    });
    if (actions.every((action) => action.state === 'missing')) continue;
    const customized = actions.filter((action) => action.state === 'customized').map((action) => action.name);
    const creatorOwned = pkg.actions.some((action) => action.creatorTemplate === true);
    packages.push({ folder: pkg.folder, name: pkg.name, importFile: pkg.actions[0]?.importFile ?? '', reimport: !creatorOwned && actions.some((action) => action.state === 'outdated' || action.state === 'missing'), customized, actions });
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
    const redo = pkg.actions.flatMap((action) => action.redo);
    const after = redo.length === 0 ? '' : ` Re-importing resets your setup, so afterwards: ${redo.join('; ')}.`;
    return { area: 'streamerbot-imports', package: pkg.folder, fix: `${pkg.name}: ${parts.join(', and ')}. Re-import ${pkg.importFile} in Streamer.bot.${after}${keep}` };
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
    const actions: ExpectedAction[] = [];
    const editable = new Set(Array.isArray(manifest['editableArguments']) ? manifest['editableArguments'].filter((name): name is string => typeof name === 'string') : []);
    const triggerSetup = isRecord(manifest['manualTriggerSetup']) ? manifest['manualTriggerSetup'] : {};
    for (const action of manifest['actions'].filter(isRecord)) {
      if (typeof action['id'] !== 'string' || typeof action['name'] !== 'string' || typeof action['source'] !== 'string' || typeof action['importFile'] !== 'string') continue;
      if (action['source'].includes('..')) continue;
      const source = await readText(join(packagesRoot, folder, action['source']), 4 * 1024 * 1024);
      if (source === undefined) continue;
      // manualTriggerSetup is keyed by the last part of the action name: "THSV StreamBridge - Launch Bridge" -> "launch" or "launch-bridge".
      const slug = (action['name'].split(' - ').at(-1) ?? '').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
      const setup = [triggerSetup[slug], triggerSetup[slug.split('-')[0] ?? '']].find((value) => Array.isArray(value));
      const argumentDefaults = Object.fromEntries((Array.isArray(action['arguments']) ? action['arguments'].filter(isRecord) : []).flatMap((argument) => (typeof argument['name'] === 'string' && editable.has(argument['name']) ? [[argument['name'], scalarText(argument['value'])]] : [])));
      actions.push({
        id: action['id'], name: action['name'], importFile: action['importFile'], sourceHash: sourceFingerprint(source),
        shippedTriggers: Array.isArray(action['triggers']) ? action['triggers'].length : 0,
        ...(Array.isArray(setup) ? { triggerSetup: setup.filter((value): value is string => typeof value === 'string') } : {}),
        editableArguments: argumentDefaults,
        creatorTemplate: /Template\.cs$/u.test(action['source']),
      });
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

function scalarText(value: unknown): string { return typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''; }
