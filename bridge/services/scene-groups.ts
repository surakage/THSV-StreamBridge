/**
 * Tidy groups for a scene picker, from the scene order the streaming app keeps (SprigCast's blooms).
 * Creators often mark sections with separator scenes such as "🎚 Main Scenes 🎚". Every scene after a separator
 * belongs to that section. The main section (named "Main …", or else the 🔴 scenes) comes first; the other
 * sections follow A to Z, then the scenes outside any section. Scenes are A to Z inside each group, ignoring a
 * leading emoji. Separators, decorative lines and sprigs are left out: they aren't scenes to switch to.
 */
export interface SceneGroup {
  readonly name: string;
  readonly main?: true;
  readonly scenes: readonly string[];
}

const DECORATIVE = /^[\s\d._\-━─═—–│┃┄┅┈┉┊┋┌┐└┘├┤┬┴┼*~=+#|<>[\](){}]+$/u;
const SEPARATOR = /^([^\p{L}\p{N}\s]+)\s*(.*?\p{L}.*?)\s*\1$/u;
const MAIN_SECTION = /\bmain\b/iu;
const MAIN_MARK = /^\s*🔴/u;

/** The section name when this scene is a separator ("🎚 Main Scenes 🎚" → "Main Scenes"), '' for a plain line. */
export function sceneSeparatorName(scene: string): string | undefined {
  const name = scene.trim();
  if (name === '') return undefined;
  if (DECORATIVE.test(name)) return '';
  return SEPARATOR.exec(name)?.[2]?.trim();
}

/** A scene's name without its leading emoji or marks, for sorting ("🔴 Gameplay" sorts as "Gameplay"). */
export function sceneSortKey(scene: string): string { return scene.replace(/^[^\p{L}\p{N}]+/u, '').trim() || scene; }

function byName(left: string, right: string): number { return sceneSortKey(left).localeCompare(sceneSortKey(right), undefined, { sensitivity: 'base' }) || left.localeCompare(right); }

export function groupScenes(ordered: readonly string[], leaveOut: readonly string[] = []): readonly SceneGroup[] {
  const skip = new Set(leaveOut.map((name) => name.trim()));
  const sections = new Map<string, string[]>();
  const loose: string[] = [];
  let section: string | undefined;
  for (const raw of ordered) {
    const scene = raw.trim();
    if (scene === '' || skip.has(scene)) continue;
    const separator = sceneSeparatorName(scene);
    if (separator !== undefined) { section = separator === '' ? section : separator; if (separator !== '' && !sections.has(separator)) sections.set(separator, []); continue; }
    if (section === undefined) loose.push(scene); else sections.get(section)?.push(scene);
  }
  let mainName = [...sections.keys()].find((name) => MAIN_SECTION.test(name) && (sections.get(name)?.length ?? 0) > 0);
  let main: string[] = mainName === undefined ? [] : sections.get(mainName) ?? [];
  if (mainName === undefined) {
    // No "Main" section: the 🔴 scenes are the main ones.
    for (const list of [loose, ...sections.values()]) for (let index = list.length - 1; index >= 0; index -= 1) if (MAIN_MARK.test(list[index] ?? '')) main.unshift(...list.splice(index, 1));
    mainName = 'Main';
  }
  const unique = (list: readonly string[]): string[] => [...new Set(list)].sort(byName);
  main = unique(main);
  const seen = new Set(main);
  const others: SceneGroup[] = [];
  for (const [name, scenes] of [...sections.entries()].sort(([left], [right]) => left.localeCompare(right, undefined, { sensitivity: 'base' }))) {
    if (name === mainName) continue;
    const fresh = unique(scenes).filter((scene) => !seen.has(scene));
    for (const scene of fresh) seen.add(scene);
    others.push({ name, scenes: fresh });
  }
  const rest = unique(loose).filter((scene) => !seen.has(scene));
  return [
    ...(main.length > 0 ? [{ name: mainName, main: true as const, scenes: main }] : []),
    ...others.filter((group) => group.scenes.length > 0),
    ...(rest.length > 0 ? [{ name: '', scenes: rest }] : []),
  ];
}

/** Checks groups read back from a saved file. */
export function parseSceneGroups(input: unknown, clean: (value: unknown) => string | undefined): readonly SceneGroup[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const groups = input.slice(0, 64).flatMap((value): SceneGroup[] => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
    const entry = value as Record<string, unknown>;
    const name = typeof entry['name'] === 'string' ? entry['name'].trim().slice(0, 256) : '';
    const scenes = Array.isArray(entry['scenes']) ? entry['scenes'].slice(0, 256).flatMap((scene) => clean(scene) ?? []) : [];
    return scenes.length === 0 ? [] : [{ name, ...(entry['main'] === true ? { main: true as const } : {}), scenes }];
  });
  return groups.length > 0 ? groups : undefined;
}
