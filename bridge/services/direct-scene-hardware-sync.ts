import type { DirectSceneSnapshot } from './obs-direct-scene-client.js';

/** Reconciles hardware from the current OBS scene even when a native trigger is lost.
 * The configured action must read the current scene and must never switch scenes.
 */
export class DirectSceneHardwareSync {
  private readonly observed = new Map<string, string>();
  private pending = false;
  private running = false;
  private retryPending = false;

  public constructor(private readonly actionId: string, private readonly run: (id: string) => Promise<void>, private readonly warn: () => void) {}

  public observe(provider: string, snapshot: DirectSceneSnapshot): void {
    if (provider !== 'obs' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(this.actionId) || snapshot.currentScene === undefined) return;
    const previous = this.observed.get(snapshot.connectionId);
    this.observed.set(snapshot.connectionId, snapshot.currentScene);
    // A connection's initial catalog is a baseline, not a scene transition.
    // In particular, restarting the Bridge must not override manually powered
    // lights merely because OBS was left on Gameplay while offline.
    if (previous === undefined || (previous === snapshot.currentScene && !this.retryPending)) return;
    this.retryPending = false;
    this.pending = true;
    if (!this.running) void this.drain();
  }

  private async drain(): Promise<void> {
    this.running = true;
    try {
      while (this.pending) {
        this.pending = false;
        try { await this.run(this.actionId); }
        catch { this.retryPending = true; this.warn(); }
      }
    } finally { this.running = false; }
  }
}
