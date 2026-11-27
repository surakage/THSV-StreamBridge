import type { NormalizedEvent } from '../../schemas/event.js';

export interface TikTokLiveStudioSetting {
  readonly enabled: boolean;
  readonly executable?: string;
}

export interface TikTokLiveReminderOptions {
  /** The creator's TikTok LIVE Studio launcher setting (Streamer.bot launcher "optional apps"). */
  readonly studio: () => Promise<TikTokLiveStudioSetting | undefined>;
  readonly now?: () => number;
  /** TikTok activity within this window means the TikTok LIVE is already running. */
  readonly activeWindowMs?: number;
  /** The streaming app that started or stopped (OBS, SprigCast, Meld Studio, Streamlabs Desktop), named in the reminder. */
  readonly appName?: () => string;
  /**
   * Is TikTok LIVE Studio open, and is it live? 'closed' when it isn't running; 'unknown' when it can't be asked.
   * A reminder only shows when it would help: Go LIVE while Studio is open and not live, End LIVE while it is live.
   */
  readonly studioState?: () => Promise<TikTokLiveStudioState>;
}

export type TikTokLiveStudioState = 'closed' | 'not-live' | 'live' | 'paused' | 'unknown';

export type TikTokLiveReminderKind = 'start' | 'end' | 'pause' | 'resumed';

interface Reminder {
  readonly kind: TikTokLiveReminderKind;
  readonly at: string;
  readonly app: string;
}

const DEFAULT_ACTIVE_WINDOW_MS = 180_000;
const REMINDER_TITLES: Readonly<Record<TikTokLiveReminderKind, string>> = { start: 'Go LIVE on TikTok', end: 'End your TikTok LIVE', pause: 'Pause TikTok now', resumed: 'TikTok is showing your break' };

/**
 * TikTok LIVE Studio has no API or hotkey to go live or end, so StreamBridge cannot do it.
 * Instead it reminds the creator at the two moments that matter: when the streaming app starts streaming
 * (unless TikTok activity shows the LIVE is already running) and when it stops. The tray shows
 * each reminder once; clicking it opens LIVE Studio, which brings the running app to the front.
 */
export class TikTokLiveReminder {
  private lastTikTokActivityAt: number | undefined;
  private reminder: Reminder | undefined;
  private launchPath: string | undefined;

  public constructor(private readonly options: TikTokLiveReminderOptions) {}

  /** Any non-simulated TikTok event (chat, likes, gifts via TikFinity) arrives only while the LIVE runs. */
  public observe(event: NormalizedEvent): void {
    if (event.platform === 'tiktok' && !event.metadata.simulated) this.lastTikTokActivityAt = this.now();
  }

  public async broadcastStarted(): Promise<void> {
    const studio = await this.studioSetting();
    if (studio === undefined) return;
    const activeWindow = this.options.activeWindowMs ?? DEFAULT_ACTIVE_WINDOW_MS;
    if (this.lastTikTokActivityAt !== undefined && this.now() - this.lastTikTokActivityAt <= activeWindow) return;
    // TikTok LIVE Studio closed means TikTok isn't part of this stream (a Twitch-only or test stream); already live needs nothing.
    const state = await this.studioState();
    if (state === 'closed' || state === 'live') return;
    this.remind('start', studio);
  }

  public async broadcastStopped(): Promise<void> {
    const studio = await this.studioSetting();
    if (studio === undefined) return;
    // Only when there is a TikTok LIVE to end: not when LIVE Studio is closed or reports it isn't live.
    const state = await this.studioState();
    if (state === 'closed' || state === 'not-live') return;
    this.remind('end', studio);
  }

  /** A break started but LIVE Studio did not confirm the pause: TikTok is showing the break screen right now. */
  public async pauseFailed(): Promise<void> {
    const studio = await this.studioSetting();
    if (studio !== undefined) this.remind('pause', studio);
  }

  /** The TikTok pause was about to run out during a break, so the automation continued the LIVE: tell the creator. */
  public async pauseResumed(): Promise<void> {
    const studio = await this.studioSetting();
    if (studio !== undefined) this.remind('resumed', studio);
  }

  public status(): Readonly<Record<string, unknown>> {
    if (this.reminder === undefined) return { signature: '' };
    return {
      signature: `${this.reminder.kind}:${this.reminder.at}`,
      kind: this.reminder.kind,
      at: this.reminder.at,
      title: REMINDER_TITLES[this.reminder.kind],
      // TikTok is showing a still break screen right now: the tray shows this one as a warning.
      urgent: this.reminder.kind === 'pause' || this.reminder.kind === 'resumed',
      text: this.reminder.kind === 'start'
        ? `${this.reminder.app} is streaming, but TikTok isn't live yet. Click Go LIVE in TikTok LIVE Studio. Click here to open it.`
        : this.reminder.kind === 'end'
          ? `${this.reminder.app} stopped streaming. Click End LIVE in TikTok LIVE Studio so your TikTok LIVE ends too. Click here to open it.`
          : this.reminder.kind === 'pause'
            ? 'StreamBridge could not pause your TikTok LIVE for the break, so TikTok is showing your break screen. Click Pause in TikTok LIVE Studio now. Click here to open it.'
            : 'Your break reached TikTok\'s 5-minute pause limit, so your TikTok LIVE continued and TikTok is showing your break screen. Switch scenes or end the break now. Click here to open TikTok LIVE Studio.',
      ...(this.launchPath === undefined ? {} : { launchPath: this.launchPath }),
    };
  }

  private remind(kind: TikTokLiveReminderKind, studio: TikTokLiveStudioSetting): void {
    this.launchPath = studio.executable;
    let app: string;
    try { app = this.options.appName?.().trim() ?? ''; } catch { app = ''; }
    this.reminder = { kind, at: new Date(this.now()).toISOString(), app: app === '' ? 'Your streaming app' : app };
  }

  private async studioSetting(): Promise<TikTokLiveStudioSetting | undefined> {
    try {
      const studio = await this.options.studio();
      return studio?.enabled === true ? studio : undefined;
    } catch { return undefined; }
  }

  private async studioState(): Promise<TikTokLiveStudioState> {
    if (this.options.studioState === undefined) return 'unknown';
    try { return await this.options.studioState(); } catch { return 'unknown'; }
  }

  private now(): number { return this.options.now?.() ?? Date.now(); }
}
