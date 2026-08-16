import { resolve } from 'node:path';
import type { AddOnUpdateStatus } from './addon-update-service.js';
import { writeJsonAtomic } from './atomic-state.js';
import type { Logger } from './logger.js';
import type { ReleaseUpdateStatus } from './release-update-service.js';

const CONNECTION_POLL_MS = 30_000;
const AUTOMATIC_CHECK_INTERVAL_MS = 21_600_000;

export type AutomaticUpdateState = 'waiting-for-streamerbot' | 'checking' | 'current' | 'updates-available' | 'unavailable';

export interface AutomaticUpdateSnapshot {
  readonly state: AutomaticUpdateState;
  readonly streamerBotConnected: boolean;
  readonly checkedAt?: string;
  readonly nextCheckAt?: string;
  readonly coreUpdateAvailable: boolean;
  readonly latestCoreVersion?: string;
  readonly addOnUpdateCount: number;
  readonly revokedAddOnCount: number;
  readonly discoverySource?: 'slothbloom' | 'github';
  readonly message: string;
}

export interface AutomaticUpdateMonitorOptions {
  readonly streamerBotConnected: () => boolean;
  readonly checkCore: () => Promise<ReleaseUpdateStatus>;
  readonly checkAddOns: () => Promise<AddOnUpdateStatus>;
  readonly logger: Logger;
  readonly statePath: string;
  readonly now?: () => number;
  readonly persist?: (path: string, value: unknown) => Promise<void>;
}

export class AutomaticUpdateMonitor {
  private timer: NodeJS.Timeout | undefined;
  private checking: Promise<AutomaticUpdateSnapshot> | undefined;
  private wasConnected = false;
  private lastCheckedAt = 0;
  private current: AutomaticUpdateSnapshot = {
    state: 'waiting-for-streamerbot', streamerBotConnected: false, coreUpdateAvailable: false, addOnUpdateCount: 0, revokedAddOnCount: 0,
    message: 'Automatic update checks begin after Streamer.bot connects.',
  };

  public constructor(private readonly options: AutomaticUpdateMonitorOptions) {}

  public start(): void {
    if (this.timer !== undefined) return;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), CONNECTION_POLL_MS);
    this.timer.unref();
  }

  public stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  public snapshot(): AutomaticUpdateSnapshot { return this.current; }

  public async poll(force = false): Promise<AutomaticUpdateSnapshot> {
    const connected = this.options.streamerBotConnected();
    if (!connected) {
      this.wasConnected = false;
      this.current = { ...this.current, state: 'waiting-for-streamerbot', streamerBotConnected: false, message: 'Automatic update checks are paused until Streamer.bot reconnects.' };
      return this.current;
    }
    const now = (this.options.now ?? Date.now)();
    const due = force || !this.wasConnected || this.lastCheckedAt === 0 || now - this.lastCheckedAt >= AUTOMATIC_CHECK_INTERVAL_MS;
    this.wasConnected = true;
    if (!due) return this.current;
    if (this.checking !== undefined) return this.checking;
    this.checking = this.runCheck(now).finally(() => { this.checking = undefined; });
    return this.checking;
  }

  private async runCheck(now: number): Promise<AutomaticUpdateSnapshot> {
    this.current = { ...this.current, state: 'checking', streamerBotConnected: true, message: 'Checking SlothBloom for StreamBridge and feature updates.' };
    let core: ReleaseUpdateStatus;
    let addOns: AddOnUpdateStatus;
    try {
      [core, addOns] = await Promise.all([this.options.checkCore(), this.options.checkAddOns()]);
    } catch (error) {
      this.lastCheckedAt = now;
      const checkedAt = new Date(now).toISOString();
      this.current = {
        state: 'unavailable', streamerBotConnected: true, checkedAt,
        nextCheckAt: new Date(now + AUTOMATIC_CHECK_INTERVAL_MS).toISOString(),
        coreUpdateAvailable: false, addOnUpdateCount: 0, revokedAddOnCount: 0,
        message: 'The automatic update check could not complete. Streaming is unaffected and the Bridge will retry at the next scheduled check.',
      };
      await (this.options.persist ?? writeJsonAtomic)(resolve(this.options.statePath), this.current).catch((persistError: unknown) => {
        this.options.logger.warn('Automatic update status could not be saved', { error: persistError });
      });
      this.options.logger.warn('Automatic update check failed safely', { error });
      return this.current;
    }
    this.lastCheckedAt = now;
    const checkedAt = new Date(now).toISOString();
    const nextCheckAt = new Date(now + AUTOMATIC_CHECK_INTERVAL_MS).toISOString();
    const unavailable = !core.available && !addOns.available;
    const updateAvailable = core.updateAvailable || addOns.updateCount > 0 || addOns.revokedCount > 0;
    const message = unavailable
      ? 'The automatic update check could not reach SlothBloom or GitHub. The Bridge will retry after Streamer.bot reconnects or at the next scheduled check.'
      : updateAvailable
        ? `${core.updateAvailable ? `StreamBridge ${core.latestVersion ?? 'update'} is available. ` : ''}${addOns.updateCount > 0 ? `${String(addOns.updateCount)} feature update(s) are available. ` : ''}${addOns.revokedCount > 0 ? `${String(addOns.revokedCount)} installed feature package(s) require attention.` : ''}`.trim()
        : 'StreamBridge and installed feature packages are current.';
    this.current = {
      state: unavailable ? 'unavailable' : updateAvailable ? 'updates-available' : 'current',
      streamerBotConnected: true,
      checkedAt,
      nextCheckAt,
      coreUpdateAvailable: core.updateAvailable,
      ...(core.latestVersion === undefined ? {} : { latestCoreVersion: core.latestVersion }),
      addOnUpdateCount: addOns.updateCount,
      revokedAddOnCount: addOns.revokedCount,
      ...(core.discoverySource === undefined && addOns.discoverySource === undefined ? {} : { discoverySource: core.discoverySource ?? addOns.discoverySource }),
      message,
    };
    await (this.options.persist ?? writeJsonAtomic)(resolve(this.options.statePath), this.current).catch((error: unknown) => {
      this.options.logger.warn('Automatic update status could not be saved', { error });
    });
    const fields = { coreUpdateAvailable: core.updateAvailable, latestCoreVersion: core.latestVersion, addOnUpdateCount: addOns.updateCount, revokedAddOnCount: addOns.revokedCount, discoverySource: this.current.discoverySource };
    if (unavailable) this.options.logger.warn('Automatic update check unavailable', { ...fields, coreError: core.error, addOnError: addOns.error });
    else if (updateAvailable) this.options.logger.info('Automatic update check found available changes', fields);
    else this.options.logger.info('Automatic update check confirmed current versions', fields);
    return this.current;
  }
}
