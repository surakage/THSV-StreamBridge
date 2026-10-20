import type { NormalizedEvent } from '../../schemas/event.js';

/** What happens to one incoming event. */
export type NestingSceneDecision =
  | { readonly kind: 'pass'; readonly event: NormalizedEvent }
  | { readonly kind: 'ignore'; readonly reason: 'nesting-scene' | 'returned-to-same-scene' };

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** The creator's nesting scenes: exact scene names plus name prefixes such as "🟠". */
export interface NestingScenes {
  readonly scenes?: readonly string[];
  readonly prefixes?: readonly string[];
}

/** Nesting scenes from the saved scene roles. */
export function nestingScenesFrom(sceneRoles: { readonly nestedScenes?: Readonly<Record<string, string>>; readonly nestingScenePrefixes?: readonly string[] }): NestingScenes {
  return { scenes: Object.values(sceneRoles.nestedScenes ?? {}), prefixes: sceneRoles.nestingScenePrefixes ?? [] };
}

/** Whether a scene is one of the creator's nesting scenes, by exact name or prefix (case-insensitive). */
export function isNestingSceneName(sceneName: unknown, nesting: NestingScenes): boolean {
  const name = text(sceneName).toLocaleLowerCase('en-US');
  if (name === '') return false;
  if ((nesting.scenes ?? []).some((scene) => text(scene).toLocaleLowerCase('en-US') === name)) return true;
  return (nesting.prefixes ?? []).some((prefix) => {
    const normalized = text(prefix).toLocaleLowerCase('en-US');
    return normalized !== '' && name.startsWith(normalized);
  });
}

/**
 * Hides "nesting" scenes from everything downstream. Creators often keep sources in one set of scenes
 * (for example "🟠 Gameplay") and nest them inside the scenes they go live with ("🔴 Gameplay"). When a
 * nesting scene becomes the program scene by accident, add-ons and timers should neither start nor stop:
 * StreamBridge acts as if the last other scene is still live. Returning from a nesting scene to that same
 * scene is not a switch either, and the next real switch reports that scene as the one it came from.
 */
export class NestingSceneFilter {
  private readonly lastScene = new Map<string, string>();
  private readonly inNestingScene = new Set<string>();

  public constructor(private readonly nesting: () => NestingScenes) {}

  public isNestingScene(sceneName: unknown): boolean {
    return isNestingSceneName(sceneName, this.active());
  }

  public apply(event: NormalizedEvent): NestingSceneDecision {
    const nesting = this.active();
    if (event.metadata.simulated || ((nesting.scenes ?? []).every((scene) => text(scene) === '') && (nesting.prefixes ?? []).every((prefix) => text(prefix) === ''))) return { kind: 'pass', event };
    const provider = text(event.payload['provider']).toLocaleLowerCase('en-US');
    if (event.eventType === 'stream.scene-changed') {
      const sceneName = text(event.payload['sceneName']);
      if (this.isNestingScene(sceneName)) {
        this.inNestingScene.add(provider);
        return { kind: 'ignore', reason: 'nesting-scene' };
      }
      const previous = this.lastScene.get(provider);
      const leftNestingScene = this.inNestingScene.delete(provider) || this.isNestingScene(event.payload['oldSceneName']);
      if (sceneName !== '') this.lastScene.set(provider, sceneName);
      if (!leftNestingScene) return { kind: 'pass', event };
      if (previous !== undefined && previous.toLocaleLowerCase('en-US') === sceneName.toLocaleLowerCase('en-US')) return { kind: 'ignore', reason: 'returned-to-same-scene' };
      const payload = { ...event.payload };
      if (previous === undefined) delete payload['oldSceneName'];
      else payload['oldSceneName'] = previous;
      return { kind: 'pass', event: { ...event, payload } };
    }
    if (event.eventType === 'system.scene-catalog') {
      const currentScene = text(event.payload['currentScene']);
      if (!this.isNestingScene(currentScene)) {
        if (currentScene !== '') this.lastScene.set(provider, currentScene);
        return { kind: 'pass', event };
      }
      // Keep the scene list for pickers, but report the last real scene (or none) as the current one.
      const payload = { ...event.payload };
      const previous = this.lastScene.get(provider);
      if (previous === undefined) delete payload['currentScene'];
      else payload['currentScene'] = previous;
      return { kind: 'pass', event: { ...event, payload } };
    }
    return { kind: 'pass', event };
  }

  private active(): NestingScenes {
    try {
      return this.nesting();
    } catch {
      return {};
    }
  }
}
