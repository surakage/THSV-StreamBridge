import { createHash, randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import type { BridgeConfig } from '../../schemas/config.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { Logger } from '../services/logger.js';
import { buildStreamerBotEventArguments } from './streamerbot-package.js';
import type { StreamerBotEventRelay } from './streamerbot-event-relay.js';

interface PendingRequest {
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

interface StreamerBotMessage {
  readonly request?: string;
  readonly id?: string;
  readonly status?: string;
  readonly authentication?: { readonly salt?: string; readonly challenge?: string };
  readonly event?: { readonly source?: string; readonly type?: string };
  readonly data?: unknown;
}

export type StreamerBotState = 'disabled' | 'stopped' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export function calculateReconnectDelay(initialDelayMs: number, maxDelayMs: number, attempt: number, random = Math.random): number {
  const cappedDelay = Math.min(initialDelayMs * 2 ** attempt, maxDelayMs);
  const boundedRandom = Math.min(1, Math.max(0, random()));
  return Math.max(1, Math.floor(cappedDelay * (0.5 + boundedRandom * 0.5)));
}

export class StreamerBotAdapter {
  private socket: WebSocket | undefined;
  private state: StreamerBotState = 'stopped';
  private lastError: string | undefined;
  private lastEventAt: string | undefined;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private stopping = false;
  private authenticated = false;
  private readonly pending = new Map<string, PendingRequest>();

  public constructor(private readonly config: BridgeConfig['streamerbot'], private readonly logger: Logger, public readonly name = 'streamerbot', private readonly eventRelay?: StreamerBotEventRelay) {}

  public get enabled(): boolean { return this.config.enabled; }

  public async start(): Promise<void> {
    if (!this.config.enabled) { this.state = 'disabled'; return; }
    if (this.config.testMode) {
      this.state = 'connected';
      this.authenticated = true;
      this.logger.info('Streamer.bot adapter started in test mode');
      return;
    }
    this.stopping = false;
    await this.connect();
  }

  public async stop(signal?: AbortSignal): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Streamer.bot adapter stopped'));
    }
    this.pending.clear();
    const socket = this.socket;
    this.socket = undefined;
    if (socket !== undefined && socket.readyState < WebSocket.CLOSING) {
      await new Promise<void>((resolve) => {
        const finish = (): void => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', finish);
          resolve();
        };
        const timer = setTimeout(finish, 500);
        const onAbort = finish;
        signal?.addEventListener('abort', onAbort, { once: true });
        socket.once('close', finish);
        socket.close(1000, 'Bridge shutdown');
      });
    }
    this.state = 'stopped';
  }

  public async sendEvent(event: NormalizedEvent): Promise<void> {
    if (!this.config.enabled) return;
    if (this.config.testMode) {
      this.lastEventAt = new Date().toISOString();
      this.logger.info('Streamer.bot test mode accepted event', { eventId: event.eventId, eventType: event.eventType });
      return;
    }
    if (this.socket?.readyState !== WebSocket.OPEN || !this.authenticated) throw new Error('Streamer.bot is unavailable');
    const requestId = randomUUID();
    const action = this.config.actionId === undefined ? { name: this.config.actionAlias } : { id: this.config.actionId, name: this.config.actionAlias };
    const request = {
      request: 'DoAction',
      id: requestId,
      action,
      args: buildStreamerBotEventArguments(event),
    };
    await this.sendRequest(requestId, request);
    this.lastEventAt = new Date().toISOString();
  }

  public async deliver(event: NormalizedEvent): Promise<void> { await this.sendEvent(event); }

  public status(): Readonly<Record<string, unknown>> {
    return {
      name: this.name, state: this.config.enabled ? this.state : 'disabled', reconnectAttempts: this.reconnectAttempts,
      liveDelivery: this.config.enabled && !this.config.testMode,
      pendingRequests: this.pending.size,
      ...(this.lastEventAt === undefined ? {} : { lastEventAt: this.lastEventAt }),
      ...(this.lastError === undefined ? {} : { lastError: this.lastError }),
    };
  }

  private async connect(): Promise<void> {
    this.state = this.reconnectAttempts === 0 ? 'connecting' : 'reconnecting';
    await new Promise<void>((resolve) => {
      const socket = new WebSocket(this.config.url, { maxPayload: 64 * 1024 });
      this.socket = socket;
      let settled = false;
      const settle = (): void => { if (!settled) { settled = true; resolve(); } };
      socket.once('open', () => this.logger.info('Connected to Streamer.bot WebSocket', { url: this.config.url }));
      socket.on('message', (data) => this.handleMessage(decodeMessage(data)));
      socket.once('error', (error) => {
        this.lastError = error.message;
        this.logger.warn('Streamer.bot connection error', { error });
        settle();
      });
      socket.once('close', () => {
        this.authenticated = false;
        if (!this.stopping) this.scheduleReconnect();
        settle();
      });
      const startupTimer = setTimeout(() => {
        if (!this.authenticated) {
          this.lastError = 'Timed out waiting for Streamer.bot Hello/authentication';
          socket.close();
        }
        settle();
      }, this.config.acknowledgementTimeoutMs);
      socket.once('close', () => clearTimeout(startupTimer));
      const poll = setInterval(() => {
        if (this.authenticated) { clearInterval(poll); clearTimeout(startupTimer); settle(); }
        if (socket.readyState >= WebSocket.CLOSING) clearInterval(poll);
      }, 10);
    });
  }

  private handleMessage(raw: string): void {
    let message: StreamerBotMessage & Readonly<Record<string, unknown>>;
    try { message = JSON.parse(raw) as StreamerBotMessage & Readonly<Record<string, unknown>>; }
    catch { this.logger.warn('Ignored invalid Streamer.bot JSON response'); return; }

    if (message.request === 'Hello') {
      const authentication = message.authentication;
      if (authentication?.salt !== undefined && authentication.challenge !== undefined) {
        const password = process.env[this.config.passwordEnv];
        if (password === undefined || password.length === 0) {
          this.lastError = `Streamer.bot authentication requires environment variable ${this.config.passwordEnv}`;
          this.socket?.close();
          return;
        }
        const secret = createHash('sha256').update(password + authentication.salt, 'utf8').digest('base64');
        const response = createHash('sha256').update(secret + authentication.challenge, 'utf8').digest('base64');
        const id = randomUUID();
        void this.sendRequest(id, { request: 'Authenticate', id, authentication: response }).then(() => this.completeHandshake()).catch((error: unknown) => {
          this.lastError = error instanceof Error ? error.message : String(error);
          this.socket?.close();
        });
      } else void this.completeHandshake().catch((error: unknown) => {
        this.lastError = error instanceof Error ? error.message : String(error);
        this.socket?.close();
      });
      return;
    }

    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (pending !== undefined) {
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.status === 'ok') pending.resolve();
        else pending.reject(new Error(`Streamer.bot request ${message.id} failed`));
      }
    }
    const relayMessage = extractTikfinityRelay(message);
    if (relayMessage !== undefined) this.eventRelay?.publish(relayMessage);
  }

  private async completeHandshake(): Promise<void> {
    if (this.eventRelay !== undefined) {
      const id = randomUUID();
      await this.sendRequest(id, { request: 'Subscribe', id, events: { General: ['Custom'] } });
    }
    this.markReady();
  }

  private markReady(): void {
    this.authenticated = true;
    this.state = 'connected';
    this.reconnectAttempts = 0;
    this.lastError = undefined;
  }

  private sendRequest(id: string, value: unknown): Promise<void> {
    if (this.socket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Streamer.bot socket is not open'));
    if (this.pending.size >= this.config.maxPendingRequests) return Promise.reject(new Error('Streamer.bot pending request capacity reached'));
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Streamer.bot acknowledgement timed out for request ${id}`));
      }, this.config.acknowledgementTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.socket?.send(JSON.stringify(value)); }
      catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private scheduleReconnect(): void {
    if (!this.config.reconnect.enabled || this.reconnectAttempts >= this.config.reconnect.maxAttempts) {
      this.state = 'error';
      this.lastError ??= 'Streamer.bot reconnect limit reached';
      return;
    }
    const delay = calculateReconnectDelay(this.config.reconnect.initialDelayMs, this.config.reconnect.maxDelayMs, this.reconnectAttempts);
    this.reconnectAttempts += 1;
    this.state = 'reconnecting';
    this.reconnectTimer = setTimeout(() => void this.connect().catch((error: unknown) => {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.scheduleReconnect();
    }), delay);
  }
}

function decodeMessage(data: WebSocket.RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data).toString('utf8');
}

function extractTikfinityRelay(message: StreamerBotMessage & Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> | undefined {
  if (message['type'] === 'thsv.tikfinity') return message;
  if (message.event?.source !== 'General' || message.event.type !== 'Custom' || !isRecord(message.data)) return undefined;
  return message.data['type'] === 'thsv.tikfinity' ? message.data : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
