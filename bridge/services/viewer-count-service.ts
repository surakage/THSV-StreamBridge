import type { NormalizedEvent } from '../../schemas/event.js';
import type { StreamerBotEventRelay } from '../adapters/streamerbot-event-relay.js';
import type { BrowserOverlayHub } from './browser-overlay-hub.js';
import type { Logger } from './logger.js';

type JsonRecord = Readonly<Record<string, unknown>>;
export type ViewerCountPlatform = 'twitch' | 'youtube' | 'kick' | 'tiktok' | 'facebook';
export type ViewerCountReading = Readonly<{ platform: ViewerCountPlatform; viewers: number }>;

/** Streamer.bot WebSocket events that carry a live viewer count, by event source. */
export const VIEWER_COUNT_EVENTS = Object.freeze({ Twitch: ['ViewerCountUpdate'], YouTube: ['StatisticsUpdated'], Kick: ['ViewerCountUpdate'] });

const SOURCES: Readonly<Record<string, Readonly<{ platform: ViewerCountPlatform; type: string }>>> = {
  Twitch: { platform: 'twitch', type: 'ViewerCountUpdate' },
  YouTube: { platform: 'youtube', type: 'StatisticsUpdated' },
  Kick: { platform: 'kick', type: 'ViewerCountUpdate' },
};
const COUNT_KEYS = ['viewerCount', 'viewers', 'concurrentViewers', 'viewer_count', 'concurrent_viewers', 'count'];
// A count that has not been refreshed for this long is treated as gone (the platform stopped reporting).
const STALE_AFTER_MS = 20 * 60_000;

/** Reads the viewer count from a Streamer.bot viewer-count or statistics event, or undefined for any other message. */
export function parseViewerCount(message: JsonRecord): ViewerCountReading | undefined {
  const event = record(message['event']);
  const source = typeof event?.['source'] === 'string' ? SOURCES[event['source']] : undefined;
  if (source === undefined || event?.['type'] !== source.type) return undefined;
  const data = record(message['data']);
  if (data === undefined) return undefined;
  const viewers = countIn(data) ?? countIn(record(data['statistics'])) ?? countIn(record(data['stats'])) ?? countIn(record(data['broadcast']));
  return viewers === undefined ? undefined : { platform: source.platform, viewers };
}

/** Keeps the latest live viewer count per platform and sends it to the viewer counter overlay. Nothing is stored on disk. */
export class ViewerCountService {
  private readonly counts = new Map<ViewerCountPlatform, { viewers: number; updatedAtMs: number }>();
  private unsubscribe: (() => void) | undefined;
  private staleTimer: NodeJS.Timeout | undefined;
  private received = 0;

  public constructor(
    private readonly overlay: BrowserOverlayHub,
    private readonly relay: StreamerBotEventRelay,
    private readonly logger: Logger,
    private readonly now = () => Date.now(),
  ) {}

  public start(): void {
    if (this.unsubscribe !== undefined) return;
    this.unsubscribe = this.relay.subscribe((message) => this.receive(message));
    this.staleTimer = setInterval(() => this.dropStale(), 60_000);
    this.staleTimer.unref();
  }

  public stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    if (this.staleTimer !== undefined) clearInterval(this.staleTimer);
    this.staleTimer = undefined;
  }

  public observeBridgeEvent(event: NormalizedEvent): void {
    if (event.eventType !== 'stream.offline' || event.metadata.simulated) return;
    if (this.counts.delete(event.platform as ViewerCountPlatform)) this.publish();
  }

  public snapshot(): Readonly<{ total: number; platforms: Readonly<Partial<Record<ViewerCountPlatform, number>>> }> {
    const platforms: Partial<Record<ViewerCountPlatform, number>> = {};
    let total = 0;
    for (const [platform, entry] of this.counts) { platforms[platform] = entry.viewers; total += entry.viewers; }
    return { total, platforms };
  }

  /**
   * Counts that do not come from Streamer.bot: TikTok through TikFinity's Event API and Facebook through the
   * Page connection. undefined means that platform is no longer live.
   */
  public report(platform: ViewerCountPlatform, viewers: number | undefined): void {
    if (viewers === undefined) { if (this.counts.delete(platform)) this.publish(); return; }
    if (!Number.isInteger(viewers) || viewers < 0 || viewers > 100_000_000) return;
    this.received += 1;
    const previous = this.counts.get(platform);
    this.counts.set(platform, { viewers, updatedAtMs: this.now() });
    if (previous?.viewers !== viewers) this.publish();
  }

  public status(): Readonly<Record<string, unknown>> {
    return { listening: this.unsubscribe !== undefined, received: this.received, ...this.snapshot(), overlayUrl: '/overlay/viewers' };
  }

  private receive(message: JsonRecord): void {
    const reading = parseViewerCount(message);
    if (reading === undefined) return;
    this.received += 1;
    const previous = this.counts.get(reading.platform);
    this.counts.set(reading.platform, { viewers: reading.viewers, updatedAtMs: this.now() });
    if (previous?.viewers !== reading.viewers) this.publish();
  }

  private dropStale(): void {
    const cutoff = this.now() - STALE_AFTER_MS;
    let changed = false;
    for (const [platform, entry] of this.counts) if (entry.updatedAtMs < cutoff) { this.counts.delete(platform); changed = true; }
    if (changed) this.publish();
  }

  private publish(): void {
    try { this.overlay.publishViewerCounts(this.snapshot()); }
    catch (error) { this.logger.debug('Viewer counts were not sent to the overlay', { error }); }
  }
}

function countIn(value: JsonRecord | undefined): number | undefined {
  if (value === undefined) return undefined;
  for (const key of COUNT_KEYS) {
    const raw = value[key];
    const number = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d{1,9}$/u.test(raw.trim()) ? Number(raw.trim()) : Number.NaN;
    if (Number.isInteger(number) && number >= 0 && number <= 100_000_000) return number;
  }
  return undefined;
}

function record(value: unknown): JsonRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonRecord : undefined;
}
