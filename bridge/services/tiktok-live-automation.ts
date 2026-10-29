import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Logger } from './logger.js';
import { STREAM_STATUS_LIVE, STREAM_STATUS_NOT_LIVE, type TikTokLiveStudioControl } from './tiktok-live-studio-control.js';
import type { TikTokLiveReminder } from './tiktok-live-reminder.js';

export interface TikTokLiveAutomationOptions {
  /** data/configuration/tiktok-live-automation.json */
  readonly settingsPath: string;
  readonly control: Pick<TikTokLiveStudioControl, 'open'>;
  readonly reminder: Pick<TikTokLiveReminder, 'broadcastStarted' | 'broadcastStopped'>;
  /** Turns OBS Virtual Camera on; LIVE Studio's scene shows it. Resolves false when that failed. */
  readonly ensureVirtualCamera: () => Promise<boolean>;
  /** Whether TikTok LIVE Studio is enabled in the launcher; automation never runs otherwise. */
  readonly studioEnabled: () => Promise<boolean>;
  readonly logger: Logger;
  /** How long LIVE Studio may take to report the new state after a press. */
  readonly confirmTimeoutMs?: number;
  /** How long to keep asking when LIVE Studio first reports "not live" as OBS stops. */
  readonly notLiveRecheckMs?: number;
}

export interface TikTokLiveAutomationResult {
  readonly at: string;
  readonly trigger: 'obs-started' | 'obs-stopped';
  readonly outcome: 'went-live' | 'ended-live' | 'already-live' | 'not-live' | 'paused-left-alone' | 'reminder' | 'disabled';
  readonly detail: string;
}

/**
 * Goes LIVE and ends the LIVE in TikTok LIVE Studio together with OBS, through the local channel
 * LIVE Studio opens for its official Stream Deck plugin. "Go / end LIVE" is a single toggle, so it
 * is pressed only after LIVE Studio confirms the opposite state, and the result is checked. Any
 * doubt (LIVE Studio closed, no answer, error, state not changing) falls back to the tray reminder.
 * Off by default; the creator turns it on in the setup wizard.
 */
export class TikTokLiveAutomation {
  private enabled = false;
  private loaded = false;
  private running: Promise<void> = Promise.resolve();
  private last: TikTokLiveAutomationResult | undefined;
  /** How this broadcast's go-live went; a failed automatic Go LIVE means the creator probably started TikTok by hand. */
  private goLiveOutcome: TikTokLiveAutomationResult['outcome'] | undefined;

  public constructor(private readonly options: TikTokLiveAutomationOptions) {}

  public async status(): Promise<Readonly<Record<string, unknown>>> {
    await this.load();
    return { enabled: this.enabled, studioEnabled: await this.safeStudioEnabled(), ...(this.last === undefined ? {} : { last: this.last }) };
  }

  public async setEnabled(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const enabled = typeof input === 'object' && input !== null ? (input as Record<string, unknown>)['enabled'] : undefined;
    if (typeof enabled !== 'boolean') throw new Error('enabled must be true or false.');
    await mkdir(dirname(this.options.settingsPath), { recursive: true });
    const temporary = `${this.options.settingsPath}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ enabled }, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.options.settingsPath);
    this.enabled = enabled; this.loaded = true;
    this.options.logger.info('TikTok LIVE Studio automation setting saved', { enabled });
    return await this.status();
  }

  public broadcastStarted(): Promise<void> { return this.serialize(() => this.handle('obs-started')); }
  public broadcastStopped(): Promise<void> { return this.serialize(() => this.handle('obs-stopped')); }

  private serialize(task: () => Promise<void>): Promise<void> {
    this.running = this.running.then(task, task);
    return this.running;
  }

  private async handle(trigger: 'obs-started' | 'obs-stopped'): Promise<void> {
    await this.load();
    const remind = trigger === 'obs-started' ? () => this.options.reminder.broadcastStarted() : () => this.options.reminder.broadcastStopped();
    if (!this.enabled || !await this.safeStudioEnabled()) { await remind(); return; }
    try {
      const result = trigger === 'obs-started' ? await this.goLive() : await this.endLive();
      if (trigger === 'obs-started') this.goLiveOutcome = result.outcome; else this.goLiveOutcome = undefined;
      this.record(trigger, result.outcome, result.detail);
      if (result.outcome === 'reminder') await remind();
    } catch (error) {
      if (trigger === 'obs-started') this.goLiveOutcome = 'reminder'; else this.goLiveOutcome = undefined;
      this.record(trigger, 'reminder', error instanceof Error ? error.message : String(error));
      await remind();
    }
  }

  private async goLive(): Promise<Omit<TikTokLiveAutomationResult, 'at' | 'trigger'>> {
    if (!await this.options.ensureVirtualCamera()) return { outcome: 'reminder', detail: 'OBS Virtual Camera could not be started, so TikTok would show no picture.' };
    const session = await this.options.control.open();
    if (session === undefined) return { outcome: 'reminder', detail: 'TikTok LIVE Studio is not open or its Stream Deck control is unavailable.' };
    try {
      const status = session.streamStatus();
      if (status === STREAM_STATUS_LIVE) return { outcome: 'already-live', detail: 'TikTok LIVE Studio was already live.' };
      if (status !== STREAM_STATUS_NOT_LIVE) return { outcome: 'paused-left-alone', detail: 'TikTok LIVE Studio is paused; it was left as it is.' };
      if (!await session.pressLiveToggle()) return { outcome: 'reminder', detail: 'TikTok LIVE Studio did not accept Go LIVE.' };
      if (!await session.waitForStatus(STREAM_STATUS_LIVE, this.options.confirmTimeoutMs ?? 15_000)) return { outcome: 'reminder', detail: 'TikTok LIVE Studio did not report going live; it may be waiting for you to confirm something.' };
      return { outcome: 'went-live', detail: 'TikTok LIVE Studio went live with OBS.' };
    } finally { session.close(); }
  }

  private async endLive(): Promise<Omit<TikTokLiveAutomationResult, 'at' | 'trigger'>> {
    const session = await this.options.control.open();
    if (session === undefined) return { outcome: 'reminder', detail: 'TikTok LIVE Studio is not open or its Stream Deck control is unavailable.' };
    try {
      let status = session.streamStatus();
      // LIVE Studio can report "not live" for a moment (seen on 2026-10-28 while a manually started LIVE was running),
      // so ask again for a few seconds before deciding there is nothing to end.
      if (status === STREAM_STATUS_NOT_LIVE && await session.waitForStatus(STREAM_STATUS_LIVE, this.options.notLiveRecheckMs ?? 4_000)) status = STREAM_STATUS_LIVE;
      if (status === STREAM_STATUS_NOT_LIVE) {
        // If the automatic Go LIVE failed, the creator likely started TikTok by hand: remind instead of staying silent.
        if (this.goLiveOutcome === 'reminder') return { outcome: 'reminder', detail: 'TikTok LIVE Studio reports not live, but Go LIVE was done by hand this stream; end the TikTok LIVE in LIVE Studio if it is still running.' };
        return { outcome: 'not-live', detail: 'TikTok LIVE Studio was not live.' };
      }
      if (status !== STREAM_STATUS_LIVE) return { outcome: 'reminder', detail: 'TikTok LIVE Studio is paused; end it there if you are done.' };
      if (!await session.pressLiveToggle()) return { outcome: 'reminder', detail: 'TikTok LIVE Studio did not accept End LIVE.' };
      if (!await session.waitForStatus(STREAM_STATUS_NOT_LIVE, this.options.confirmTimeoutMs ?? 15_000)) return { outcome: 'reminder', detail: 'TikTok LIVE Studio did not report ending; it may be asking you to confirm.' };
      return { outcome: 'ended-live', detail: 'TikTok LIVE Studio ended the LIVE with OBS.' };
    } finally { session.close(); }
  }

  private record(trigger: TikTokLiveAutomationResult['trigger'], outcome: TikTokLiveAutomationResult['outcome'], detail: string): void {
    this.last = { at: new Date().toISOString(), trigger, outcome, detail };
    const log = outcome === 'reminder' ? this.options.logger.warn.bind(this.options.logger) : this.options.logger.info.bind(this.options.logger);
    log('TikTok LIVE Studio automation', { trigger, outcome, detail });
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const value = JSON.parse(await readFile(this.options.settingsPath, 'utf8')) as unknown;
      this.enabled = typeof value === 'object' && value !== null && (value as Record<string, unknown>)['enabled'] === true;
    } catch { this.enabled = false; }
    this.loaded = true;
  }

  private async safeStudioEnabled(): Promise<boolean> {
    try { return await this.options.studioEnabled(); } catch { return false; }
  }
}
