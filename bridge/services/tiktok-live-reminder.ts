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
}

export type TikTokLiveReminderKind = 'start' | 'end';

interface Reminder {
  readonly kind: TikTokLiveReminderKind;
  readonly at: string;
  readonly app: string;
}

const DEFAULT_ACTIVE_WINDOW_MS = 180_000;

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
    this.remind('start', studio);
  }

  public async broadcastStopped(): Promise<void> {
    const studio = await this.studioSetting();
    if (studio === undefined) return;
    this.remind('end', studio);
  }

  public status(): Readonly<Record<string, unknown>> {
    if (this.reminder === undefined) return { signature: '' };
    return {
      signature: `${this.reminder.kind}:${this.reminder.at}`,
      kind: this.reminder.kind,
      at: this.reminder.at,
      title: this.reminder.kind === 'start' ? 'Go LIVE on TikTok' : 'End your TikTok LIVE',
      text: this.reminder.kind === 'start'
        ? `${this.reminder.app} is streaming, but TikTok isn't live yet. Click Go LIVE in TikTok LIVE Studio. Click here to open it.`
        : `${this.reminder.app} stopped streaming. Click End LIVE in TikTok LIVE Studio so your TikTok LIVE ends too. Click here to open it.`,
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

  private now(): number { return this.options.now?.() ?? Date.now(); }
}
