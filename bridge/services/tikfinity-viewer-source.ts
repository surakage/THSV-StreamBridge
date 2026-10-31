import WebSocket from 'ws';
import type { Logger } from './logger.js';

type JsonRecord = Readonly<Record<string, unknown>>;
export type TikFinityViewerUpdate = Readonly<{ viewers: number }> | Readonly<{ ended: true }>;

// TikFinity's desktop app serves its Event API on this local port. Its events follow TikTok-Live-Connector:
// { event: 'roomUser', data: { viewerCount } } for the live viewer count and 'streamEnd' when the LIVE stops.
export const TIKFINITY_EVENT_API_URL = 'ws://127.0.0.1:21213/';
const VIEWER_EVENTS = new Set(['roomUser', 'roomUserSeq', 'viewerCount']);
const END_EVENTS = new Set(['streamEnd', 'liveEnd']);

/** Reads a TikFinity Event API message: the TikTok LIVE viewer count, the end of the LIVE, or nothing else. */
export function parseTikFinityViewerMessage(raw: unknown): TikFinityViewerUpdate | undefined {
  const message = record(raw);
  const event = typeof message?.['event'] === 'string' ? message['event'] : '';
  if (END_EVENTS.has(event)) return { ended: true };
  if (!VIEWER_EVENTS.has(event)) return undefined;
  const data = record(message?.['data']);
  for (const key of ['viewerCount', 'viewers', 'userCount']) {
    const value = data?.[key];
    const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,9}$/u.test(value.trim()) ? Number(value.trim()) : Number.NaN;
    if (Number.isInteger(number) && number >= 0 && number <= 100_000_000) return { viewers: number };
  }
  return undefined;
}

/**
 * Listens to TikFinity's local Event API for the TikTok LIVE viewer count. Read-only: it never sends anything
 * to TikFinity. When TikFinity is closed it keeps retrying quietly, slowing down to once a minute.
 */
export class TikFinityViewerSource {
  private socket: WebSocket | undefined;
  private timer: NodeJS.Timeout | undefined;
  private stopped = true;
  private failures = 0;
  private connected = false;
  private lastViewersAt: string | undefined;

  public constructor(
    private readonly report: (viewers: number | undefined) => void,
    private readonly logger: Logger,
    private readonly url = TIKFINITY_EVENT_API_URL,
  ) {}

  public start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  public stop(): void {
    this.stopped = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.socket?.removeAllListeners();
    this.socket?.terminate();
    this.socket = undefined;
    this.connected = false;
  }

  public status(): Readonly<Record<string, unknown>> {
    return { listening: !this.stopped, connected: this.connected, url: this.url, ...(this.lastViewersAt === undefined ? {} : { lastViewersAt: this.lastViewersAt }) };
  }

  private connect(): void {
    if (this.stopped) return;
    const socket = new WebSocket(this.url, { maxPayload: 512 * 1024, handshakeTimeout: 4_000 });
    this.socket = socket;
    socket.on('open', () => {
      this.connected = true;
      if (this.failures > 0) this.logger.info('TikFinity Event API connected for TikTok viewer counts');
      this.failures = 0;
    });
    socket.on('message', (raw) => {
      let update: TikFinityViewerUpdate | undefined;
      try { update = parseTikFinityViewerMessage(JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : Buffer.from(raw as ArrayBuffer).toString('utf8')) as unknown); }
      catch { return; }
      if (update === undefined) return;
      if ('ended' in update) { this.report(undefined); return; }
      this.lastViewersAt = new Date().toISOString();
      this.report(update.viewers);
    });
    socket.on('error', () => { /* 'close' follows and schedules the retry */ });
    socket.on('close', () => {
      if (this.connected) this.report(undefined);
      this.connected = false;
      if (this.stopped) return;
      this.failures += 1;
      const delay = Math.min(60_000, 5_000 * 2 ** Math.min(this.failures - 1, 4));
      this.timer = setTimeout(() => this.connect(), delay);
      this.timer.unref();
    });
  }
}

function record(value: unknown): JsonRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonRecord : undefined;
}
