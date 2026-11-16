import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import WebSocket from 'ws';
import type { DirectSceneSnapshot, ObsPowerSavingResult } from './obs-direct-scene-client.js';
import { pausableOverlayUrl } from './obs-direct-scene-client.js';

/**
 * SprigCast through its own API (ws://127.0.0.1:<port>/sprigcast, SprigCast's docs/control-api.md), never
 * through its OBS-compatible door. Blooms are SprigCast's scenes; a bloom can have a horizontal and a vertical
 * shape, and switching one switches both. Things are named by name or id.
 *
 *   server → {"hello": {"app": "SprigCast", "api": 0, "auth": {salt, challenge} | null}}
 *   app    → {"auth": "<answer>", "events": [...]}      answer = base64(sha256(base64(sha256(password + salt)) + challenge))
 *   server → {"welcome": {...}}
 *   app    → {"id": "1", "do": "blooms.list"}  →  {"id": "1", "ok": true, "result": {...}}
 */
export const SPRIGCAST_DEFAULT_URL = 'ws://127.0.0.1:4455/sprigcast';
/** SprigCast uses 4455, or 4456 when OBS already holds 4455. */
export const SPRIGCAST_PORTS: readonly number[] = [4455, 4456];
const BLOOM_EVENTS = new Set(['bloom.shown', 'blooms.changed', 'garden.changed']);
const OUTPUT_EVENTS = new Set(['stream.changed', 'record.changed']);
const MAXIMUM_SOURCES = 300;

export type SprigCastStreamSignal = 'connected' | 'stream-state-changed';
export const SPRIGCAST_EFFECTS = ['blackout', 'pixelate', 'barrel-roll'] as const;
export type SprigCastEffect = typeof SPRIGCAST_EFFECTS[number];
export class SprigCastApiError extends Error { public constructor(public readonly code: string, message: string) { super(message); this.name = 'SprigCastApiError'; } }

/** One open, welcomed socket per endpoint, shared by every client so status reads never open extra connections. */
const openSessions = new Map<string, SprigCastSession>();
const streamListeners = new Map<string, Set<(signal: SprigCastStreamSignal) => void>>();

export class SprigCastDirectSceneClient {
  public constructor(private readonly url = SPRIGCAST_DEFAULT_URL, private readonly password = '', private readonly timeoutMs = 4_000, private readonly connectionId = url, private readonly connectionName = 'SprigCast (direct)', private readonly confirmationMs = 15_000) {}

  /** The horizontal blooms by name, and the one on air there (the vertical twin follows it). */
  public async getSceneList(): Promise<DirectSceneSnapshot> {
    return parseSprigCastBlooms(await this.request('blooms.list'), this.connectionId, this.connectionName);
  }

  public async isStreaming(): Promise<boolean> { return record(await this.request('stream.status'))['on'] === true; }
  public async isRecording(): Promise<boolean> { return record(await this.request('record.status'))['on'] === true; }

  /** Puts a bloom on air in both shapes. */
  public async showScene(sceneName: string): Promise<void> { await this.request('bloom.show', { bloom: sceneName }); }

  public async switchScene(sceneName: string): Promise<void> { await this.showScene(sceneName); }

  /** Turns one filter on a source on or off (SprigCast's `filter.set`). */
  public async setFilter(sourceName: string, filterName: string, enabled: boolean): Promise<void> { await this.request('filter.set', { source: sourceName, filter: filterName, on: enabled }); }

  /** Ends the stream when it is live. */
  public async stopStreaming(): Promise<void> { if (await this.isStreaming()) await this.request('stream.stop'); }

  /**
   * SprigCast's own screen effects, from its store plugins: Hide it (blackout, pixelate) and Barrel Roll.
   * The target is a source name (or, for a barrel roll, a sprig name). The plugin must be added in SprigCast.
   */
  public async runEffect(effect: SprigCastEffect, target: string, seconds: number): Promise<void> {
    const wait = Math.max(1, Math.min(600, Math.round(seconds)));
    if (effect === 'blackout') await this.request('hide.blackout', { source: target, seconds: wait });
    else if (effect === 'pixelate') await this.request('hide.pixelate', { source: target, seconds: wait });
    else await this.request('roll.spin', { ...(await this.isSprig(target) ? { sprig: target } : { source: target }), seconds: wait });
  }

  private async isSprig(name: string): Promise<boolean> {
    const sprigs = record(await this.request('sprigs.list'))['sprigs'];
    return (Array.isArray(sprigs) ? sprigs : []).some((sprig) => string(record(sprig)['name']).trim() === name.trim());
  }

  /** Switches on SprigCast Camera (its virtual camera) when it is off. True when it is on afterwards. */
  public async ensureVirtualCamera(): Promise<boolean> {
    if (record(await this.request('camera.status'))['on'] === true) return true;
    return record(await this.request('camera.set', { on: true }))['on'] === true;
  }

  /**
   * A PNG of what is on air, written to this path by StreamBridge (SprigCast is asked not to save its own copy,
   * so its Snap plugin does not print a polaroid for it). `vertical` pictures the vertical canvas.
   */
  public async saveScreenshot(imageFilePath: string, sourceName?: string, vertical = false): Promise<void> {
    if (sourceName !== undefined && sourceName !== '') throw new Error('SprigCast pictures what is on air only. Choose "The scene on screen".');
    const shape = vertical ? 'vertical' : 'horizontal';
    const shots = record(await this.request('screenshot.take', { shape, save: false, data: true }))['shots'];
    const shot = (Array.isArray(shots) ? shots : []).map(record).find((entry) => entry['shape'] === shape) ?? record(Array.isArray(shots) ? shots[0] : undefined);
    const png = string(shot['png']);
    if (png === '') throw new Error(`SprigCast sent no picture${vertical ? ' (is the vertical canvas turned on?)' : ''}.`);
    await mkdir(dirname(imageFilePath), { recursive: true });
    await writeFile(imageFilePath, Buffer.from(png, 'base64'));
  }

  /** SprigCast has no "add a source" action yet, so overlays are added by hand as Web page sources. */
  public async listSources(): Promise<readonly string[]> {
    const sources = record(await this.request('sources.list'))['sources'];
    return (Array.isArray(sources) ? sources : []).map((source) => string(record(source)['name']).trim()).filter((name) => name !== '').slice(0, MAXIMUM_SOURCES);
  }

  /** Lets the StreamBridge overlays that are safe to pause sleep while hidden (SprigCast's "Keep running when hidden" off). */
  public async pauseHiddenOverlaySources(): Promise<ObsPowerSavingResult> { return await this.setKeepRunning(false); }
  /** Undoes Save power: those overlays keep running while hidden again. */
  public async resumeHiddenOverlaySources(): Promise<ObsPowerSavingResult> { return await this.setKeepRunning(true); }

  private async setKeepRunning(keepRunning: boolean): Promise<ObsPowerSavingResult> {
    const sources = record(await this.request('sources.list'))['sources'];
    const pages = (Array.isArray(sources) ? sources : []).map(record).filter((source) => source['kind'] === 'browser').slice(0, MAXIMUM_SOURCES);
    const changed: string[] = []; const already: string[] = []; let keptRunning = 0;
    for (const page of pages) {
      const id = string(page['id']); const name = string(page['name']);
      const settings = record(record(await this.request('source.get', { source: id || name }))['settings']);
      if (!pausableOverlayUrl(string(settings['url']))) { keptRunning += 1; continue; }
      if ((settings['keep_running'] === true) === keepRunning) { already.push(name); continue; }
      await this.request('source.set', { source: id || name, settings: { keep_running: keepRunning } });
      changed.push(name);
    }
    return { changed, already, keptRunning };
  }

  public onStreamStateSignal(listener: (signal: SprigCastStreamSignal) => void): () => void {
    const listeners = streamListeners.get(this.url) ?? new Set(); listeners.add(listener); streamListeners.set(this.url, listeners);
    return () => { listeners.delete(listener); if (listeners.size === 0 && streamListeners.get(this.url) === listeners) streamListeners.delete(this.url); };
  }

  public hasOpenSession(): boolean { return openSessions.get(this.url)?.open() === true; }

  /** Keeps one socket open, calls onChange (debounced) when a bloom goes on air or the bloom list changes. */
  public async watchChanges(onChange: () => void, signal: AbortSignal): Promise<void> {
    let timer: NodeJS.Timeout | undefined; let confirmation: NodeJS.Timeout | undefined;
    const session = await SprigCastSession.open(this.url, this.password, ['bloom', 'output', 'garden'], AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]));
    const stopEvents = session.onEvent((name) => {
      if (OUTPUT_EVENTS.has(name)) { notify(this.url, 'stream-state-changed'); return; }
      if (!BLOOM_EVENTS.has(name)) return;
      if (timer !== undefined) clearTimeout(timer); timer = setTimeout(onChange, 100); timer.unref();
    });
    try {
      openSessions.set(this.url, session);
      notify(this.url, 'connected');
      confirmation = setInterval(onChange, this.confirmationMs); confirmation.unref();
      await session.closed(signal);
    } finally {
      if (confirmation !== undefined) clearInterval(confirmation); if (timer !== undefined) clearTimeout(timer); stopEvents();
      if (openSessions.get(this.url) === session) openSessions.delete(this.url);
      session.close('Scene subscription stopped');
    }
  }

  /** One action, on the shared socket when one is open, else on a short-lived one. */
  public async request(action: string, fields: Readonly<Record<string, unknown>> = {}): Promise<unknown> {
    const deadline = AbortSignal.timeout(this.timeoutMs);
    const shared = openSessions.get(this.url);
    if (shared?.open() === true) return await shared.ask(action, fields, deadline);
    const session = await SprigCastSession.open(this.url, this.password, 'none', deadline);
    try { return await session.ask(action, fields, deadline); } finally { session.close('Request complete'); }
  }
}

/** A welcomed socket to SprigCast's own API. */
class SprigCastSession {
  private nextId = 1;
  private readonly pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private readonly eventListeners = new Set<(name: string, data: Record<string, unknown>) => void>();

  private constructor(private readonly socket: WebSocket) {
    socket.on('message', (raw) => this.receive(raw));
    socket.once('close', () => { for (const waiter of this.pending.values()) waiter.reject(new Error('SprigCast closed the connection.')); this.pending.clear(); });
  }

  public static async open(url: string, password: string, events: readonly string[] | 'none', signal: AbortSignal): Promise<SprigCastSession> {
    const socket = new WebSocket(url, { maxPayload: 32 * 1024 * 1024 });
    socket.on('error', () => { /* Errors surface through the handshake or the close event; an unheard one would crash the Bridge. */ });
    try {
      const hello = record((await nextMessage(socket, signal, (value) => 'hello' in value))['hello']);
      if (hello['app'] !== 'SprigCast') throw new Error('This port is not SprigCast\'s own API. Use the address ending in /sprigcast.');
      const auth = hello['auth'];
      const greeting: Record<string, unknown> = { events };
      if (isRecord(auth)) {
        if (password === '') throw new Error('SprigCast asks for a password. Copy it from SprigCast: Settings › Connections.');
        greeting['auth'] = sprigcastAuthentication(password, string(auth['salt']), string(auth['challenge']));
      }
      const welcome = nextMessage(socket, signal, (value) => 'welcome' in value);
      socket.send(JSON.stringify(greeting));
      await welcome;
      return new SprigCastSession(socket);
    } catch (error) {
      if (socket.readyState < WebSocket.CLOSING) socket.terminate();
      if (error instanceof Error && /4009/u.test(error.message)) throw new Error('SprigCast refused the password. Copy it again from SprigCast: Settings › Connections.', { cause: error });
      throw error;
    }
  }

  public open(): boolean { return this.socket.readyState === WebSocket.OPEN; }

  public onEvent(listener: (name: string, data: Record<string, unknown>) => void): () => void { this.eventListeners.add(listener); return () => { this.eventListeners.delete(listener); }; }

  public async ask(action: string, fields: Readonly<Record<string, unknown>>, signal: AbortSignal): Promise<unknown> {
    if (!this.open()) throw new Error('SprigCast closed the connection.');
    const id = `sb-${String(this.nextId++)}`;
    return await new Promise<unknown>((resolve, reject) => {
      const onAbort = (): void => { this.pending.delete(id); reject(new Error(`SprigCast did not answer ${action} in time.`)); };
      if (signal.aborted) { onAbort(); return; }
      signal.addEventListener('abort', onAbort, { once: true });
      this.pending.set(id, { resolve: (value) => { signal.removeEventListener('abort', onAbort); resolve(value); }, reject: (error) => { signal.removeEventListener('abort', onAbort); reject(error); } });
      this.socket.send(JSON.stringify({ ...fields, id, do: action }));
    });
  }

  public async closed(signal: AbortSignal): Promise<void> {
    if (!this.open()) return;
    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => { this.socket.off('close', onClose); this.socket.off('error', onError); signal.removeEventListener('abort', onAbort); };
      const onClose = (): void => { cleanup(); resolve(); }; const onError = (error: Error): void => { cleanup(); reject(error); }; const onAbort = (): void => { cleanup(); resolve(); };
      this.socket.once('close', onClose); this.socket.once('error', onError); signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  public close(reason: string): void { if (this.socket.readyState < WebSocket.CLOSING) this.socket.close(1000, reason); }

  private receive(raw: WebSocket.RawData): void {
    let value: unknown; try { value = JSON.parse(rawText(raw)); } catch { return; }
    if (!isRecord(value)) return;
    if (typeof value['event'] === 'string') { for (const listener of [...this.eventListeners]) { try { listener(value['event'], value); } catch { /* A listener must not break the socket. */ } } return; }
    const id = value['id']; if (typeof id !== 'string') return;
    const waiter = this.pending.get(id); if (waiter === undefined) return; this.pending.delete(id);
    if (value['ok'] === true) { waiter.resolve(value['result'] ?? {}); return; }
    const error = record(value['error']);
    waiter.reject(new SprigCastApiError(string(error['code']) || 'failed', `SprigCast: ${string(error['message']) || 'the action failed.'}`));
  }
}

export function parseSprigCastBlooms(input: unknown, connectionId = SPRIGCAST_DEFAULT_URL, connectionName = 'SprigCast (direct)'): DirectSceneSnapshot {
  const blooms = (Array.isArray(record(input)['blooms']) ? record(input)['blooms'] as unknown[] : []).map(record);
  const scenes = blooms.map((bloom) => string(bloom['name']).trim()).filter((name) => name !== '');
  const onAir = blooms.find((bloom) => Array.isArray(bloom['onAir']) && (bloom['onAir'] as unknown[]).includes('horizontal'))
    ?? blooms.find((bloom) => Array.isArray(bloom['onAir']) && (bloom['onAir'] as unknown[]).length > 0);
  const currentScene = onAir === undefined ? '' : string(onAir['name']).trim();
  return { connectionId, connectionName, scenes, ...(currentScene === '' ? {} : { currentScene }) };
}

/**
 * True when SprigCast's own API says hello at this address. Read-only: the socket closes right after the
 * greeting, before any password is sent. OBS on the same port answers differently, so it never counts.
 */
export async function sprigcastAnswers(url: string, timeoutMs = 1_500): Promise<boolean> {
  const socket = new WebSocket(url, { maxPayload: 64 * 1024 });
  socket.on('error', () => { /* A refused or closed port just means "not here". */ });
  try { return record((await nextMessage(socket, AbortSignal.timeout(timeoutMs), (value) => 'hello' in value))['hello'])['app'] === 'SprigCast'; }
  catch { return false; }
  finally { if (socket.readyState < WebSocket.CLOSING) socket.terminate(); }
}

/** Same answer as obs-websocket's: base64(sha256(base64(sha256(password + salt)) + challenge)). */
export function sprigcastAuthentication(password: string, salt: string, challenge: string): string {
  if (salt === '' || challenge === '') throw new Error('SprigCast sent an incomplete password challenge.');
  const secret = createHash('sha256').update(password + salt).digest('base64');
  return createHash('sha256').update(secret + challenge).digest('base64');
}

function notify(url: string, signal: SprigCastStreamSignal): void {
  for (const listener of [...(streamListeners.get(url) ?? [])]) { try { listener(signal); } catch { /* Listener failures must not break the shared socket. */ } }
}

async function nextMessage(socket: WebSocket, signal: AbortSignal, match: (value: Record<string, unknown>) => boolean): Promise<Record<string, unknown>> {
  if (signal.aborted) throw new Error('SprigCast did not answer in time.');
  return await new Promise<Record<string, unknown>>((resolve, reject) => {
    const cleanup = (): void => { socket.off('message', onMessage); socket.off('error', onError); socket.off('close', onClose); signal.removeEventListener('abort', onAbort); };
    const onError = (error: Error): void => { cleanup(); reject(error); };
    const onClose = (code: number, reason: Buffer): void => { cleanup(); reject(new Error(`SprigCast closed the connection (${String(code)}${reason.length > 0 ? `: ${reason.toString('utf8')}` : ''}).`)); };
    const onAbort = (): void => { cleanup(); reject(new Error('SprigCast did not answer in time.')); };
    const onMessage = (raw: WebSocket.RawData): void => { try { const value = JSON.parse(rawText(raw)) as unknown; if (isRecord(value) && match(value)) { cleanup(); resolve(value); } } catch { /* Ignore malformed messages. */ } };
    socket.on('message', onMessage); socket.once('error', onError); socket.once('close', onClose); signal.addEventListener('abort', onAbort, { once: true });
  });
}

function rawText(raw: WebSocket.RawData): string { return Array.isArray(raw) ? Buffer.concat(raw).toString('utf8') : Buffer.isBuffer(raw) ? raw.toString('utf8') : Buffer.from(raw).toString('utf8'); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function record(value: unknown): Record<string, unknown> { return isRecord(value) ? value : {}; }
function string(value: unknown): string { return typeof value === 'string' ? value : ''; }
