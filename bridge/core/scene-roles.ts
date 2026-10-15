import type { AddOnSceneRoleV2, AddOnScenesV2 } from '../contracts/v2/addon-capability.js';

export const SCENE_ROLES: readonly AddOnSceneRoleV2[] = Object.freeze(['starting', 'live', 'chatting', 'break', 'ending']);
export type SceneRoleMap = Readonly<Partial<Record<AddOnSceneRoleV2, string>>>;

const ROLE_TOKEN = /^role:\s*(starting|live|chatting|break|ending)$/iu;
// Leading emoji, symbols, variation selectors and joiners that creators put before scene names ("🔴 BRB").
const LEADING_DECORATION = /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji_Modifier}|\u{FE0F}|\u{200D}|\u{20E3}|\s)+/u;

function clean(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[\p{Cc}]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 200) : '';
}

/** Comparison key for scene names: case-insensitive, ignoring surrounding spaces and leading emoji. */
export function sceneMatchKey(value: unknown): string {
  const name = clean(value);
  const stripped = name.replace(LEADING_DECORATION, '');
  return (stripped || name).toLocaleLowerCase('en-US');
}

/** The role named by a "role:<role>" setting value, if it is one. */
export function sceneRoleToken(value: unknown): AddOnSceneRoleV2 | undefined {
  const match = ROLE_TOKEN.exec(clean(value));
  const role = match?.[1]?.toLowerCase();
  return role === undefined ? undefined : role as AddOnSceneRoleV2;
}

/** Builds the read-only `context.scenes` capability over the creator's saved mapping, read on every call. */
export function createSceneRoles(read: () => SceneRoleMap | undefined): AddOnScenesV2 {
  const current = (): SceneRoleMap => { try { return read() ?? {}; } catch { return {}; } };
  const sceneFor = (role: AddOnSceneRoleV2): string => (SCENE_ROLES.includes(role) ? clean(current()[role]) : '');
  return Object.freeze({
    sceneFor,
    roleOf(sceneName: string): AddOnSceneRoleV2 | undefined {
      const key = sceneMatchKey(sceneName);
      if (key === '') return undefined;
      const roles = current();
      return SCENE_ROLES.find((role) => clean(roles[role]) !== '' && sceneMatchKey(roles[role]) === key);
    },
    resolve(value: string): string {
      const role = sceneRoleToken(value);
      return role === undefined ? clean(value) : sceneFor(role);
    },
  });
}
