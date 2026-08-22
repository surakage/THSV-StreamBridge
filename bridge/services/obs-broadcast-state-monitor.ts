import type { Logger } from './logger.js';

export interface ObsBroadcastStateMonitorOptions {
  readonly query: () => Promise<boolean>;
  readonly onStarted: () => Promise<void>;
  readonly onStopped: () => Promise<void>;
  readonly logger: Logger;
  readonly intervalMs?: number;
}

export class ObsBroadcastStateMonitor {
  private state: 'unknown' | 'active' | 'inactive' = 'unknown';
  private timer: NodeJS.Timeout | undefined;
  private sampling = false;
  private unavailableLogged = false;

  public constructor(private readonly options: ObsBroadcastStateMonitorOptions) {}

  public async start(): Promise<void> {
    if (this.timer !== undefined) return;
    await this.sample();
    this.timer = setInterval(() => void this.sample(), this.options.intervalMs ?? 5_000);
    this.timer.unref();
  }

  public stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async sample(): Promise<void> {
    if (this.sampling) return;
    this.sampling = true;
    try {
      const active = await this.options.query();
      this.unavailableLogged = false;
      const next = active ? 'active' : 'inactive';
      if (next === this.state) return;
      if (active) await this.options.onStarted();
      else if (this.state === 'active') await this.options.onStopped();
      this.state = next;
      this.options.logger.info('OBS broadcast state changed', { state: next });
    } catch (error) {
      if (!this.unavailableLogged) {
        this.options.logger.info('Direct OBS broadcast-state monitoring is temporarily unavailable; platform lifecycle signals remain active', { error });
        this.unavailableLogged = true;
      }
    } finally { this.sampling = false; }
  }
}
