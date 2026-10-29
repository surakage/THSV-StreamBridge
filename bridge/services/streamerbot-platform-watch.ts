import type { Logger } from './logger.js';

/** Platforms Streamer.bot itself connects to (TikTok comes through TikFinity, Facebook directly). */
export const STREAMERBOT_PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick'] as const);
export type StreamerBotPlatform = (typeof STREAMERBOT_PLATFORMS)[number];

export interface StreamerBotBroadcasterConnections {
  readonly connected: readonly string[];
  readonly disconnected: readonly string[];
}

export interface StreamerBotPlatformWatchOptions {
  /** Streamer.bot's GetBroadcaster answer, or undefined when Streamer.bot itself is unreachable. */
  readonly query: () => Promise<StreamerBotBroadcasterConnections | undefined>;
  /** Platforms the creator turned on in StreamBridge; only these are watched. */
  readonly enabledPlatforms: () => readonly string[];
  readonly logger: Logger;
  readonly intervalMs?: number;
  readonly now?: () => number;
}

const LABELS: Readonly<Record<StreamerBotPlatform, string>> = { twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick' };

/**
 * Watches the platform connections inside Streamer.bot. When Streamer.bot loses one (on 2026-10-29
 * Kick's broadcaster client was refused and never came back), chat, follows and rewards from that
 * platform silently stop. This notices within a minute, logs it once, and raises a tray alert that
 * says how to reconnect. Streamer.bot being closed is reported elsewhere, so it is not an alert here.
 */
export class StreamerBotPlatformWatch {
  private timer: NodeJS.Timeout | undefined;
  private readonly down = new Map<StreamerBotPlatform, number>();
  /** Missing once; it must still be missing on the next check before it counts (Streamer.bot may still be connecting). */
  private readonly suspect = new Set<StreamerBotPlatform>();
  private alert: { readonly platforms: readonly StreamerBotPlatform[]; readonly at: string } | undefined;
  private lastCheckedAt: string | undefined;
  private running: Promise<void> = Promise.resolve();

  public constructor(private readonly options: StreamerBotPlatformWatchOptions) {}

  public start(): void {
    if (this.timer !== undefined) return;
    this.timer = setInterval(() => { void this.check(); }, this.options.intervalMs ?? 60_000);
    this.timer.unref();
    void this.check();
  }

  public stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Runs one check now; checks never overlap. */
  public check(): Promise<void> {
    this.running = this.running.then(() => this.runCheck(), () => this.runCheck());
    return this.running;
  }

  public status(): Readonly<Record<string, unknown>> {
    const base = { watching: STREAMERBOT_PLATFORMS.filter((platform) => this.watched().includes(platform)), down: [...this.down.keys()], ...(this.lastCheckedAt === undefined ? {} : { lastCheckedAt: this.lastCheckedAt }) };
    if (this.alert === undefined) return { ...base, signature: '' };
    const names = this.alert.platforms.map((platform) => LABELS[platform]);
    const list = names.length === 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
    return {
      ...base,
      signature: `${this.alert.platforms.join(',')}:${this.alert.at}`,
      title: `${list} disconnected in Streamer.bot`,
      text: `Streamer.bot lost its ${list} connection, so ${list} chat, follows and rewards are not reaching StreamBridge. In Streamer.bot open Platforms > ${names[0] ?? ''} > Accounts and reconnect the Broadcaster account.`,
    };
  }

  private watched(): readonly string[] {
    try { return this.options.enabledPlatforms(); } catch { return []; }
  }

  private async runCheck(): Promise<void> {
    let answer: StreamerBotBroadcasterConnections | undefined;
    try { answer = await this.options.query(); } catch { answer = undefined; }
    if (answer === undefined) return; // Streamer.bot itself is closed or unreachable.
    const now = this.options.now?.() ?? Date.now();
    this.lastCheckedAt = new Date(now).toISOString();
    const watched = this.watched();
    const connected = new Set(answer.connected.map((platform) => platform.toLowerCase()));
    let changed = false;
    for (const platform of STREAMERBOT_PLATFORMS) {
      const isWatched = watched.includes(platform);
      const isDown = isWatched && !connected.has(platform);
      if (isDown && !this.down.has(platform) && !this.suspect.has(platform)) { this.suspect.add(platform); continue; }
      if (!isDown) this.suspect.delete(platform);
      if (isDown && !this.down.has(platform)) {
        this.suspect.delete(platform); this.down.set(platform, now); changed = true;
        this.options.logger.warn('Streamer.bot lost a platform connection', { platform, detail: `${LABELS[platform]} is not connected in Streamer.bot. Reconnect it under Platforms > ${LABELS[platform]} > Accounts.` });
      } else if (!isDown && this.down.has(platform)) {
        const since = this.down.get(platform) ?? now;
        this.down.delete(platform); changed = true;
        if (isWatched) this.options.logger.info('Streamer.bot platform connection is back', { platform, downForSeconds: Math.round((now - since) / 1000) });
      }
    }
    if (!changed) return;
    this.alert = this.down.size === 0 ? undefined : { platforms: [...this.down.keys()], at: new Date(now).toISOString() };
  }
}
