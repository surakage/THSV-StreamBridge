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
  private attempts = 0;
  private lastAttemptAt: string | undefined;
  private lastSuccessAt: string | undefined;
  private lastError: string | undefined;

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

  public status(): Readonly<Record<string, unknown>> {
    return {
      state: this.lastError === undefined ? this.state : 'error',
      running: this.timer !== undefined,
      recoveryPolicy: 'continuous fixed-interval polling',
      intervalMs: this.options.intervalMs ?? 5_000,
      attempts: this.attempts,
      ...(this.lastAttemptAt === undefined ? {} : { lastAttemptAt: this.lastAttemptAt }),
      ...(this.lastSuccessAt === undefined ? {} : { lastSuccessAt: this.lastSuccessAt }),
      ...(this.lastError === undefined ? {} : { lastError: this.lastError }),
    };
  }

  private async sample(): Promise<void> {
    if (this.sampling) return;
    this.sampling = true;
    this.lastAttemptAt = new Date().toISOString();
    try {
      const active = await this.options.query();
      this.unavailableLogged = false;
      this.attempts = 0;
      this.lastSuccessAt = new Date().toISOString();
      this.lastError = undefined;
      const next = active ? 'active' : 'inactive';
      if (next === this.state) return;
      if (active) await this.options.onStarted();
      else if (this.state === 'active') await this.options.onStopped();
      this.state = next;
      this.options.logger.info('OBS broadcast state changed', { state: next });
    } catch (error) {
      this.attempts += 1;
      this.lastError = error instanceof Error ? error.message : String(error);
      if (!this.unavailableLogged) {
        this.options.logger.info('Direct OBS broadcast-state monitoring is temporarily unavailable; platform lifecycle signals remain active', { error });
        this.unavailableLogged = true;
      }
    } finally { this.sampling = false; }
  }
}
