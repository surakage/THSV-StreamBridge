/**
 * Runs an async persistence task so that concurrent requests share writes.
 *
 * Every `request()` resolves (or rejects) with a task run that started after
 * the request was made, so the caller's in-memory change is always included
 * in the write it awaits. Requests made while a run is in flight collapse into
 * a single follow-up run, which turns a burst of N saves into at most two.
 */
export class CoalescedTask {
  private running: Promise<void> = Promise.resolve();
  private queued: Promise<void> | undefined;

  public constructor(private readonly task: () => Promise<void>) {}

  public request(): Promise<void> {
    if (this.queued !== undefined) return this.queued;
    const queued: Promise<void> = this.running.catch(() => undefined).then(() => {
      if (this.queued === queued) this.queued = undefined;
      return this.task();
    });
    this.queued = queued;
    this.running = queued;
    return queued;
  }

  /** Resolves after every requested run has settled. */
  public async idle(): Promise<void> { await this.running.catch(() => undefined); }
}
