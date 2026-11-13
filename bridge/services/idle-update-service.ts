import { readFile } from 'node:fs/promises';
import { writeJsonAtomic } from './atomic-state.js';
import type { Logger } from './logger.js';
import type { ReleaseUpdateStatus } from './release-update-service.js';

const CHECK_EVERY_MS = 15 * 60_000;
/** How long nothing may have been live before an update installs, so a short break between streams is left alone. */
export const QUIET_AFTER_STREAM_MS = 20 * 60_000;
const RETRY_AFTER_FAILURE_MS = 6 * 60 * 60_000;

export interface IdleUpdateOptions {
  readonly statePath: string;
  readonly isLive: () => boolean;
  /** True while OBS streams or records. Unknown (OBS closed) counts as not busy. */
  readonly obsBusy: () => Promise<boolean>;
  readonly check: () => Promise<ReleaseUpdateStatus>;
  readonly stage: (version: string) => Promise<unknown>;
  readonly apply: (version: string) => Promise<unknown>;
  readonly logger: Logger;
  readonly now?: () => number;
}

export interface IdleUpdateStatus { readonly enabled: boolean; readonly lastAttemptAt?: string; readonly lastResult?: string }

/**
 * Opt-in: installs a verified StreamBridge update by itself once nothing has been live for a while and OBS is
 * neither streaming nor recording. Off by default; switching it on is the creator's standing approval.
 */
export class IdleUpdateService {
  private enabled = false;
  private loaded = false;
  private timer: NodeJS.Timeout | undefined;
  private lastLiveAt: number;
  private retryAfter = 0;
  private running = false;
  private lastAttemptAt: number | undefined;
  private lastResult: string | undefined;

  public constructor(private readonly options: IdleUpdateOptions) { this.lastLiveAt = this.now(); }

  private now(): number { return (this.options.now ?? Date.now)(); }

  public async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try { this.enabled = (JSON.parse(await readFile(this.options.statePath, 'utf8')) as { enabled?: unknown }).enabled === true; } catch { this.enabled = false; }
  }

  public start(): void {
    if (this.timer !== undefined) return;
    void this.load();
    this.timer = setInterval(() => void this.tick(), CHECK_EVERY_MS);
    this.timer.unref();
  }

  public stop(): void { if (this.timer !== undefined) clearInterval(this.timer); this.timer = undefined; }

  public async status(): Promise<IdleUpdateStatus> {
    await this.load();
    return { enabled: this.enabled, ...(this.lastAttemptAt === undefined ? {} : { lastAttemptAt: new Date(this.lastAttemptAt).toISOString() }), ...(this.lastResult === undefined ? {} : { lastResult: this.lastResult }) };
  }

  public async setEnabled(enabled: boolean): Promise<IdleUpdateStatus> {
    await this.load();
    this.enabled = enabled;
    await writeJsonAtomic(this.options.statePath, { enabled });
    this.options.logger.info('Install updates when idle switched', { enabled });
    return await this.status();
  }

  /** One check. Returns what happened, for logs and tests. */
  public async tick(): Promise<'off' | 'live' | 'recently-live' | 'obs-busy' | 'waiting' | 'current' | 'installing' | 'failed'> {
    await this.load();
    const now = this.now();
    if (this.options.isLive()) { this.lastLiveAt = now; return 'live'; }
    if (!this.enabled) return 'off';
    if (now - this.lastLiveAt < QUIET_AFTER_STREAM_MS) return 'recently-live';
    if (this.running || now < this.retryAfter) return 'waiting';
    if (await this.options.obsBusy().catch(() => false)) return 'obs-busy';
    this.running = true;
    try {
      const status = await this.options.check();
      if (!status.available || !status.updateAvailable || status.latestVersion === undefined) return 'current';
      // Check once more right before installing: a stream may have started while the update downloaded.
      const version = status.latestVersion;
      this.lastAttemptAt = now;
      await this.options.stage(version);
      if (this.options.isLive() || await this.options.obsBusy().catch(() => false)) { this.lastResult = `StreamBridge ${version} is downloaded and waits until you are off air.`; return 'waiting'; }
      await this.options.apply(version);
      this.lastResult = `Installing StreamBridge ${version}.`;
      this.options.logger.info('Installing a StreamBridge update while idle', { version });
      return 'installing';
    } catch (error) {
      this.retryAfter = now + RETRY_AFTER_FAILURE_MS;
      this.lastResult = `The automatic install did not run: ${error instanceof Error ? error.message : String(error)}`;
      this.options.logger.warn('Idle update install did not run', { error });
      return 'failed';
    } finally { this.running = false; }
  }
}
