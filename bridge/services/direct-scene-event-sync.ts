import { randomUUID } from 'node:crypto';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { DirectSceneSnapshot } from './obs-direct-scene-client.js';

/** Publishes actual OBS and SprigCast scene transitions (SprigCast: a bloom going on air) when a native Streamer.bot trigger is missed. */
export class DirectSceneEventSync {
  private readonly observed = new Map<string, string>();
  private queue = Promise.resolve();
  public constructor(private readonly emit: (event: NormalizedEvent) => Promise<unknown>, private readonly warn: () => void) {}
  public observe(provider: string, snapshot: DirectSceneSnapshot): void {
    if ((provider !== 'obs' && provider !== 'sprigcast') || !snapshot.currentScene) return;
    const previous = this.observed.get(snapshot.connectionId);
    this.observed.set(snapshot.connectionId, snapshot.currentScene);
    // Startup is a baseline, never a scene switch or a reason to start an ad.
    if (previous === undefined || previous === snapshot.currentScene) return;
    const event: NormalizedEvent = { schemaVersion: '1.0.0', eventId: `${provider}-scene-` + randomUUID(), eventType: 'stream.scene-changed', platform: 'system', receivedAt: new Date().toISOString(), source: { adapter: provider === 'sprigcast' ? 'sprigcast-scene-monitor' : 'obs-scene-monitor', eventName: provider === 'sprigcast' ? 'bloom.shown' : 'CurrentProgramSceneChanged' }, channel: { name: provider === 'sprigcast' ? 'SprigCast' : 'OBS' }, payload: { provider, sceneName: snapshot.currentScene, oldSceneName: previous, connectionId: snapshot.connectionId, connectionName: snapshot.connectionName }, metadata: { simulated: false } };
    this.queue = this.queue.then(async () => { await this.emit(event); }).catch(() => this.warn());
  }
}
