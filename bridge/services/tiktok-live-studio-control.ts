import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';

/**
 * Client for the local control channel TikTok LIVE Studio opens for its official Stream Deck
 * plugin (socket.io over a loopback WebSocket). It joins the same room the plugin joins, reads
 * the live state LIVE Studio publishes, and can press the plugin's "Go / end LIVE" toggle.
 * Nothing leaves this computer.
 */

/** LIVE Studio's stream_status: 0 not live, 1 paused, 2 live. */
export type TikTokLiveStudioStreamStatus = 0 | 1 | 2;
export const STREAM_STATUS_NOT_LIVE = 0;
export const STREAM_STATUS_PAUSED = 1;
export const STREAM_STATUS_LIVE = 2;

export const LIVE_STUDIO_PORTS: readonly number[] = Object.freeze([28189, 39728, 34246, 42205, 38534, 40825, 40622]);
const PROTOCOL = 'streamdeck_ttls_v1';
const LIVE_TOGGLE_ACTION = 'com.tiktok.livestudio.livestartend';
const channel = (name: string): string => `stream_deck/${name}`;

export interface TikTokLiveStudioControlOptions {
  readonly ports?: readonly number[];
  readonly host?: string;
  readonly connectTimeoutMs?: number;
  readonly requestTimeoutMs?: number;
}

export interface TikTokLiveStudioSession {
  /** The latest stream_status LIVE Studio reported. */
  streamStatus(): TikTokLiveStudioStreamStatus | undefined;
  /** Presses "Go / end LIVE" once. Resolves true when LIVE Studio acknowledged it with code 0. */
  pressLiveToggle(): Promise<boolean>;
  /** Waits until LIVE Studio reports the given status, asking it to resync while waiting. */
  waitForStatus(status: TikTokLiveStudioStreamStatus, timeoutMs: number): Promise<boolean>;
  close(): void;
}

function frameText(raw: WebSocket.RawData): string {
  return Array.isArray(raw) ? Buffer.concat(raw).toString('utf8') : Buffer.isBuffer(raw) ? raw.toString('utf8') : Buffer.from(raw).toString('utf8');
}

function parseStatus(payload: unknown): TikTokLiveStudioStreamStatus | undefined {
  let value: unknown = payload;
  if (typeof value === 'string') { try { value = JSON.parse(value) as unknown; } catch { return undefined; } }
  if (typeof value !== 'object' || value === null) return undefined;
  const status = (value as Record<string, unknown>)['stream_status'];
  return status === 0 || status === 1 || status === 2 ? status : undefined;
}

/** LIVE Studio acknowledges a pressed action with {"code":0}; anything else counts as a failure. */
function ackCode(payload: unknown): number {
  try {
    const parsed: unknown = typeof payload === 'string' ? JSON.parse(payload) : payload;
    const code = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>)['code'] : undefined;
    return typeof code === 'number' ? code : -1;
  } catch { return -1; }
}

export class TikTokLiveStudioControl {
  public constructor(private readonly options: TikTokLiveStudioControlOptions = {}) {}

  /** Connects, joins the plugin room and waits for LIVE Studio's first state. Undefined when LIVE Studio is not reachable. */
  public async open(): Promise<TikTokLiveStudioSession | undefined> {
    for (const port of this.options.ports ?? LIVE_STUDIO_PORTS) {
      const session = await this.tryPort(port);
      if (session !== undefined) return session;
    }
    return undefined;
  }

  private async tryPort(port: number): Promise<TikTokLiveStudioSession | undefined> {
    const host = this.options.host ?? '127.0.0.1';
    const connectTimeoutMs = this.options.connectTimeoutMs ?? 1_500;
    const requestTimeoutMs = this.options.requestTimeoutMs ?? 5_000;
    const socket = new WebSocket(`ws://${host}:${String(port)}/socket.io/?EIO=4&transport=websocket`, [PROTOCOL], { maxPayload: 2 * 1024 * 1024 });
    let status: TikTokLiveStudioStreamStatus | undefined;
    const statusWaiters = new Set<() => void>();
    const ackWaiters = new Map<string, (code: number) => void>();
    const emit = (event: string, payload?: string): void => { socket.send(`42${JSON.stringify(payload === undefined ? [event] : [event, payload])}`); };

    const ready = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), connectTimeoutMs + requestTimeoutMs);
      socket.on('error', () => { clearTimeout(timer); resolve(false); });
      socket.on('close', () => { clearTimeout(timer); resolve(false); });
      socket.on('message', (raw) => {
        const text = frameText(raw);
        if (text === '2') { socket.send('3'); return; }
        if (text.startsWith('0')) { socket.send('40'); return; }
        if (text.startsWith('40')) { emit(channel('join_room')); return; }
        if (!text.startsWith('42')) return;
        let message: unknown;
        try { message = JSON.parse(text.slice(2)) as unknown; } catch { return; }
        if (!Array.isArray(message) || typeof message[0] !== 'string') return;
        const [event, payload] = message as [string, unknown];
        if (event === channel('join_room')) { emit(channel('sync_settings')); return; }
        if (event === channel('sync_settings')) {
          const next = parseStatus(payload);
          if (next !== undefined) { status = next; clearTimeout(timer); resolve(true); for (const waiter of [...statusWaiters]) waiter(); }
          return;
        }
        const waiter = ackWaiters.get(event);
        if (waiter !== undefined) {
          waiter(ackCode(payload));
        }
      });
    });
    const connected = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), connectTimeoutMs);
      socket.once('open', () => { clearTimeout(timer); resolve(true); });
      socket.once('error', () => { clearTimeout(timer); resolve(false); });
    });
    if (!connected || !await ready) { socket.terminate(); return undefined; }

    return {
      streamStatus: () => status,
      pressLiveToggle: async () => {
        // The same message the official plugin sends for a key press on its "Go / end LIVE" button.
        const context = `thsv-streambridge-${randomUUID()}`;
        const acknowledged = new Promise<number>((resolve) => {
          const timer = setTimeout(() => { ackWaiters.delete(channel(context)); resolve(-1); }, requestTimeoutMs);
          ackWaiters.set(channel(context), (code) => { clearTimeout(timer); ackWaiters.delete(channel(context)); resolve(code); });
        });
        emit(channel('action_emit'), JSON.stringify({ action: LIVE_TOGGLE_ACTION, event: 'keyDown', context, device: 'thsv-streambridge', payload: { settings: {}, coordinates: { column: 0, row: 0 }, state: status === STREAM_STATUS_LIVE ? 1 : 0, isInMultiAction: false } }));
        return await acknowledged === 0;
      },
      waitForStatus: async (target, timeoutMs) => {
        if (status === target) return true;
        return await new Promise<boolean>((resolve) => {
          const resync = setInterval(() => { if (socket.readyState === WebSocket.OPEN) emit(channel('sync_settings')); }, 2_000);
          const done = (result: boolean): void => { clearTimeout(timer); clearInterval(resync); statusWaiters.delete(check); resolve(result); };
          const check = (): void => { if (status === target) done(true); };
          const timer = setTimeout(() => done(false), timeoutMs);
          statusWaiters.add(check);
        });
      },
      close: () => { if (socket.readyState < WebSocket.CLOSING) socket.close(); },
    };
  }
}
