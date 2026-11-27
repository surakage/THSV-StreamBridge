import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Logger } from './logger.js';
import { STREAM_STATUS_LIVE, STREAM_STATUS_NOT_LIVE, STREAM_STATUS_PAUSED, type TikTokLiveStudioControl, type TikTokLiveStudioSession } from './tiktok-live-studio-control.js';
import type { TikTokLiveReminder } from './tiktok-live-reminder.js';

export interface TikTokLiveAutomationOptions {
  /** data/configuration/tiktok-live-automation.json */
  readonly settingsPath: string;
  readonly control: Pick<TikTokLiveStudioControl, 'open'>;
  readonly reminder: Pick<TikTokLiveReminder, 'broadcastStarted' | 'broadcastStopped'> & Partial<Pick<TikTokLiveReminder, 'pauseFailed' | 'pauseResumed'>>;
  /**
   * The creator's Starting, Break and Ending scenes (Features > Scene roles). TikTok strikes still screens, so with a
   * Starting scene the LIVE waits for it to end, Break pauses the LIVE and Ending ends it. Blank roles are ignored.
   */
  readonly sceneRoles?: () => { readonly starting?: string; readonly break?: string; readonly ending?: string };
  /** Turns OBS Virtual Camera on; LIVE Studio's scene shows it. Resolves false when that failed. */
  readonly ensureVirtualCamera: () => Promise<boolean>;
  /** Whether TikTok LIVE Studio is enabled in the launcher; automation never runs otherwise. */
  readonly studioEnabled: () => Promise<boolean>;
  readonly logger: Logger;
  /**
   * Told when LIVE Studio itself confirms TikTok is live (true) or has ended (false). Only confirmed states are
   * reported, never a guess, so the Bridge can publish a real TikTok live status.
   */
  readonly onLiveState?: (live: boolean) => void | Promise<void>;
  /** How long LIVE Studio may take to report the new state after a press. */
  readonly confirmTimeoutMs?: number;
  /** How long to keep asking when LIVE Studio first reports "not live" as OBS stops. */
  readonly notLiveRecheckMs?: number;
  /** How long to wait for the Starting scene to end before giving up and showing the Go LIVE reminder (15 min). */
  readonly startWaitMs?: number;
  /** TikTok ends a pause after about 5 minutes: continue before that (4:30). */
  readonly pauseLimitMs?: number;
}

type Trigger = 'obs-started' | 'obs-stopped' | 'starting-ended' | 'countdown-done' | 'start-wait-timeout' | 'break-started' | 'break-ended' | 'pause-limit' | 'ending-scene';
type Phase = 'idle' | 'waiting' | 'live' | 'paused' | 'ended';
const DEFAULT_START_WAIT_MS = 15 * 60_000;
const DEFAULT_PAUSE_LIMIT_MS = 270_000;

export interface TikTokLiveAutomationResult {
  readonly at: string;
  readonly trigger: Trigger;
  readonly outcome: 'went-live' | 'ended-live' | 'already-live' | 'not-live' | 'paused-left-alone' | 'waiting' | 'paused' | 'resumed' | 'reminder' | 'disabled';
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
  /** Where this broadcast's TikTok LIVE stands, as far as this automation moved it. */
  private phase: Phase = 'idle';
  private startWait: NodeJS.Timeout | undefined;
  private pauseLimit: NodeJS.Timeout | undefined;

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

  /**
   * The streaming app started streaming. When it is on the Starting scene, TikTok waits until that scene ends (or a
   * SprigCast countdown reaches 0) so TikTok never gets the still Starting screen; otherwise TikTok goes LIVE now.
   */
  public broadcastStarted(onAirScene?: string): Promise<void> {
    return this.serialize(async () => {
      this.clearTimers(); this.phase = 'idle';
      const starting = this.role('starting');
      if (starting !== undefined && onAirScene?.trim() === starting && await this.active()) {
        this.phase = 'waiting';
        this.record('obs-started', 'waiting', 'Waiting for the Starting scene to end before going LIVE on TikTok.');
        this.startWait = setTimeout(() => { void this.serialize(async () => {
          if (this.phase !== 'waiting') return;
          this.phase = 'idle'; this.goLiveOutcome = 'reminder';
          this.record('start-wait-timeout', 'reminder', 'The Starting scene did not end within 15 minutes, so TikTok was not started.');
          await this.options.reminder.broadcastStarted();
        }); }, this.options.startWaitMs ?? DEFAULT_START_WAIT_MS);
        this.startWait.unref();
        return;
      }
      await this.handle('obs-started');
    });
  }

  public broadcastStopped(): Promise<void> {
    return this.serialize(async () => {
      const wasWaiting = this.phase === 'waiting';
      this.clearTimers(); this.phase = 'idle';
      // Still on the Starting scene: TikTok was never started, so there is nothing to end or remind about.
      if (wasWaiting) { this.goLiveOutcome = undefined; this.record('obs-stopped', 'not-live', 'The stream stopped before the Starting scene ended; TikTok was never started.'); return; }
      await this.handle('obs-stopped');
    });
  }

  /** A scene (SprigCast: a bloom, in any shape) went on air. */
  public sceneChanged(sceneName: string): Promise<void> {
    const scene = sceneName.trim();
    return this.serialize(async () => {
      if (scene === '' || this.phase === 'idle' || this.phase === 'ended') return;
      if (scene === this.role('ending')) {
        if (this.phase === 'waiting') { this.clearTimers(); this.phase = 'ended'; this.record('ending-scene', 'not-live', 'The Ending scene came on before TikTok was started.'); return; }
        await this.run('ending-scene', () => this.endLive());
        return;
      }
      if (this.phase === 'waiting') { if (scene !== this.role('starting')) await this.run('starting-ended', () => this.goLive()); return; }
      if (scene === this.role('break')) { if (this.phase === 'live') await this.run('break-started', () => this.pause()); return; }
      if (this.phase === 'paused') await this.run('break-ended', () => this.resume());
    });
  }

  /** A SprigCast countdown reached 0 on screen: the early go-live hint while waiting on the Starting scene. */
  public countdownDone(): Promise<void> {
    return this.serialize(async () => { if (this.phase === 'waiting') await this.run('countdown-done', () => this.goLive()); });
  }

  /** SprigCast's Break & End Guard started or ended a break. */
  public breakStarted(): Promise<void> {
    return this.serialize(async () => { if (this.phase === 'live') await this.run('break-started', () => this.pause()); });
  }

  public breakEnded(): Promise<void> {
    return this.serialize(async () => { if (this.phase === 'paused') await this.run('break-ended', () => this.resume()); });
  }

  private serialize(task: () => Promise<void>): Promise<void> {
    this.running = this.running.then(task, task);
    return this.running;
  }

  private async active(): Promise<boolean> {
    await this.load();
    return this.enabled && await this.safeStudioEnabled();
  }

  private role(name: 'starting' | 'break' | 'ending'): string | undefined {
    let value: string | undefined;
    try { value = this.options.sceneRoles?.()[name]?.trim(); } catch { value = undefined; }
    return value === undefined || value === '' ? undefined : value;
  }

  private clearTimers(): void {
    if (this.startWait !== undefined) { clearTimeout(this.startWait); this.startWait = undefined; }
    if (this.pauseLimit !== undefined) { clearTimeout(this.pauseLimit); this.pauseLimit = undefined; }
  }

  private async handle(trigger: 'obs-started' | 'obs-stopped'): Promise<void> {
    const remind = trigger === 'obs-started' ? () => this.options.reminder.broadcastStarted() : () => this.options.reminder.broadcastStopped();
    if (!await this.active()) { await remind(); return; }
    await this.run(trigger, trigger === 'obs-started' ? () => this.goLive() : () => this.endLive());
  }

  /** Runs one LIVE Studio step, records it, follows the phase and falls back to the matching reminder when in doubt. */
  private async run(trigger: Trigger, step: () => Promise<Omit<TikTokLiveAutomationResult, 'at' | 'trigger'>>): Promise<void> {
    const starts = trigger === 'obs-started' || trigger === 'starting-ended' || trigger === 'countdown-done';
    const ends = trigger === 'obs-stopped' || trigger === 'ending-scene';
    if (starts) this.clearTimers();
    try {
      const result = await step();
      this.record(trigger, result.outcome, result.detail);
      if (starts) { this.goLiveOutcome = result.outcome; this.phase = result.outcome === 'went-live' || result.outcome === 'already-live' ? 'live' : result.outcome === 'paused-left-alone' ? 'paused' : 'idle'; }
      if (ends) { this.goLiveOutcome = undefined; this.clearTimers(); this.phase = trigger === 'ending-scene' ? 'ended' : 'idle'; }
      if (result.outcome === 'paused') { this.phase = 'paused'; this.armPauseLimit(); }
      if (result.outcome === 'resumed') { this.phase = 'live'; this.clearTimers(); }
      const live = result.outcome === 'went-live' || result.outcome === 'already-live' ? true : result.outcome === 'ended-live' ? false : undefined;
      if (live !== undefined) await Promise.resolve(this.options.onLiveState?.(live)).catch((error: unknown) => this.options.logger.warn('TikTok live status could not be published', { error }));
      if (result.outcome === 'reminder') await this.remindFor(trigger);
    } catch (error) {
      if (starts) { this.goLiveOutcome = 'reminder'; this.phase = 'idle'; }
      if (ends) { this.goLiveOutcome = undefined; this.clearTimers(); this.phase = trigger === 'ending-scene' ? 'ended' : 'idle'; }
      this.record(trigger, 'reminder', error instanceof Error ? error.message : String(error));
      await this.remindFor(trigger);
    }
  }

  private async remindFor(trigger: Trigger): Promise<void> {
    if (trigger === 'obs-started' || trigger === 'starting-ended' || trigger === 'countdown-done') await this.options.reminder.broadcastStarted();
    else if (trigger === 'obs-stopped' || trigger === 'ending-scene') await this.options.reminder.broadcastStopped();
    // TikTok is showing the break screen right now: say so loudly. A resume that did not take only logs (TikTok stays paused).
    else if (trigger === 'break-started') await Promise.resolve(this.options.reminder.pauseFailed?.()).catch(() => undefined);
  }

  private armPauseLimit(): void {
    if (this.pauseLimit !== undefined) clearTimeout(this.pauseLimit);
    this.pauseLimit = setTimeout(() => { this.pauseLimit = undefined; void this.serialize(async () => {
      if (this.phase !== 'paused') return;
      await this.run('pause-limit', () => this.resume());
      if ((this.phase as Phase) === 'live') await Promise.resolve(this.options.reminder.pauseResumed?.()).catch(() => undefined);
    }); }, this.options.pauseLimitMs ?? DEFAULT_PAUSE_LIMIT_MS);
    this.pauseLimit.unref();
  }

  private async goLive(): Promise<Omit<TikTokLiveAutomationResult, 'at' | 'trigger'>> {
    if (!await this.options.ensureVirtualCamera()) return { outcome: 'reminder', detail: 'Your streaming app could not start its virtual camera, so TikTok would show no picture.' };
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

  /** Break: pause the TikTok LIVE so viewers see TikTok's pause screen instead of the still Break scene. */
  private async pause(): Promise<Omit<TikTokLiveAutomationResult, 'at' | 'trigger'>> {
    const session = await this.options.control.open();
    if (session === undefined) return { outcome: 'reminder', detail: 'TikTok LIVE Studio is not open, so the TikTok LIVE was not paused.' };
    try {
      const status = session.streamStatus();
      if (status === STREAM_STATUS_PAUSED) return { outcome: 'paused', detail: 'TikTok LIVE Studio was already paused.' };
      if (status !== STREAM_STATUS_LIVE) return { outcome: 'not-live', detail: 'TikTok LIVE Studio is not live, so there was nothing to pause.' };
      if (!await session.pressPauseToggle()) return { outcome: 'reminder', detail: 'TikTok LIVE Studio did not accept Pause LIVE.' };
      if (!await session.waitForStatus(STREAM_STATUS_PAUSED, this.options.confirmTimeoutMs ?? 15_000)) return { outcome: 'reminder', detail: 'TikTok LIVE Studio did not report pausing.' };
      return { outcome: 'paused', detail: 'TikTok LIVE paused for the break.' };
    } finally { session.close(); }
  }

  private async resume(): Promise<Omit<TikTokLiveAutomationResult, 'at' | 'trigger'>> {
    const session = await this.options.control.open();
    if (session === undefined) return { outcome: 'reminder', detail: 'TikTok LIVE Studio is not open, so the TikTok LIVE was not continued.' };
    try { return await this.resumeIn(session); } finally { session.close(); }
  }

  private async resumeIn(session: TikTokLiveStudioSession): Promise<Omit<TikTokLiveAutomationResult, 'at' | 'trigger'>> {
    const status = session.streamStatus();
    if (status === STREAM_STATUS_LIVE) return { outcome: 'resumed', detail: 'TikTok LIVE Studio was already live.' };
    if (status !== STREAM_STATUS_PAUSED) return { outcome: 'reminder', detail: 'TikTok LIVE Studio is not paused, so there was nothing to continue.' };
    if (!await session.pressPauseToggle()) return { outcome: 'reminder', detail: 'TikTok LIVE Studio did not accept Resume LIVE.' };
    if (!await session.waitForStatus(STREAM_STATUS_LIVE, this.options.confirmTimeoutMs ?? 15_000)) return { outcome: 'reminder', detail: 'TikTok LIVE Studio did not report continuing.' };
    return { outcome: 'resumed', detail: 'TikTok LIVE continued after the break.' };
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
      // Paused during a break that this automation started: continue first, since End LIVE is pressed from live.
      if (status === STREAM_STATUS_PAUSED && this.phase === 'paused') {
        const resumed = await this.resumeIn(session);
        if (resumed.outcome !== 'resumed') return { outcome: 'reminder', detail: 'TikTok LIVE Studio is paused and did not continue; end it there if you are done.' };
        status = STREAM_STATUS_LIVE;
      }
      if (status !== STREAM_STATUS_LIVE) return { outcome: 'reminder', detail: 'TikTok LIVE Studio is paused; end it there if you are done.' };
      if (!await session.pressLiveToggle()) return { outcome: 'reminder', detail: 'TikTok LIVE Studio did not accept End LIVE.' };
      if (!await session.waitForStatus(STREAM_STATUS_NOT_LIVE, this.options.confirmTimeoutMs ?? 15_000)) return { outcome: 'reminder', detail: 'TikTok LIVE Studio did not report ending; it may be asking you to confirm.' };
      return { outcome: 'ended-live', detail: 'TikTok LIVE Studio ended the LIVE with your stream.' };
    } finally { session.close(); }
  }

  private record(trigger: Trigger, outcome: TikTokLiveAutomationResult['outcome'], detail: string): void {
    this.last = { at: new Date().toISOString(), trigger, outcome, detail };
    const log = outcome === 'reminder' || trigger === 'pause-limit' ? this.options.logger.warn.bind(this.options.logger) : this.options.logger.info.bind(this.options.logger);
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
