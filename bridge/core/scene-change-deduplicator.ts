import type { NormalizedEvent } from '../../schemas/event.js';
import type { Clock } from './deduplicator.js';

/** How long a second report of the same provider scene switch counts as the same switch. */
export const SCENE_CHANGE_DUPLICATE_WINDOW_MS = 5_000;

/**
 * Collapses one real scene switch that arrives from two sources: the
 * Streamer.bot Scene Changed relay and the Bridge's own OBS watcher. They use
 * different event and connection ids, so the ordinary deduplicator cannot
 * match them. The stable key is provider + scene name: a report is a duplicate
 * only when the last accepted live switch for that provider landed on the same
 * scene within the window, so quick A -> B -> A switching is never dropped.
 */
export class SceneChangeDeduplicator {
  private readonly lastSwitch = new Map<string, { readonly scene: string; readonly at: number }>();

  public constructor(private readonly windowMs = SCENE_CHANGE_DUPLICATE_WINDOW_MS, private readonly clock: Clock = { now: () => Date.now() }) {}

  public isDuplicate(event: NormalizedEvent): boolean {
    if (event.eventType !== 'stream.scene-changed' || event.metadata.simulated) return false;
    const provider = providerKey(event.payload['provider']);
    const scene = typeof event.payload['sceneName'] === 'string' ? event.payload['sceneName'].trim().toLocaleLowerCase('en-US') : '';
    if (provider === '' || scene === '') return false;
    const now = this.clock.now(); const previous = this.lastSwitch.get(provider);
    if (previous !== undefined && previous.scene === scene && now - previous.at < this.windowMs) return true;
    this.lastSwitch.set(provider, { scene, at: now });
    return false;
  }

  /** Lets a retried delivery of a switch that failed downstream through again. */
  public forget(event: NormalizedEvent): void {
    const provider = providerKey(event.payload['provider']);
    const scene = typeof event.payload['sceneName'] === 'string' ? event.payload['sceneName'].trim().toLocaleLowerCase('en-US') : '';
    if (event.eventType === 'stream.scene-changed' && this.lastSwitch.get(provider)?.scene === scene) this.lastSwitch.delete(provider);
  }
}

/**
 * Streamer.bot can reach SprigCast through SprigCast's OBS-compatible door, and then reports its bloom switches
 * as OBS scene changes while the Bridge's own SprigCast watcher reports the same switch as SprigCast. Both count
 * as one app here so one switch is never handled twice.
 */
function providerKey(value: unknown): string {
  const provider = typeof value === 'string' ? value.trim().toLocaleLowerCase('en-US') : '';
  return provider === 'sprigcast' ? 'obs' : provider;
}
