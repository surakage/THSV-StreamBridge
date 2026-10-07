import { createHash, randomUUID } from 'node:crypto';
import WebSocket from 'ws';

export interface DirectSceneSnapshot {
  readonly connectionId: string;
  readonly connectionName: string;
  readonly scenes: readonly string[];
  readonly currentScene?: string;
}

/** OBS WebSocket event subscription bits (obs-websocket protocol v5). */
const OBS_EVENT_SCENES = 1 << 2;
const OBS_EVENT_OUTPUTS = 1 << 6;
const SCENE_EVENTS = new Set(['SceneCreated', 'SceneRemoved', 'SceneNameChanged', 'CurrentProgramSceneChanged', 'SceneListChanged']);

/** Signals delivered to stream-state listeners: the shared socket opened, or OBS reported a stream output change. */
export type ObsStreamStateSignal = 'connected' | 'stream-state-changed';

/**
 * One authenticated, subscribed OBS socket per endpoint is kept open by
 * `watchChanges`. Read-only requests (`GetSceneList`, `GetStreamStatus`) from
 * any client for the same endpoint reuse it instead of opening a new
 * authenticated connection, and stream-state listeners are notified from its
 * events.
 */
const openSessions = new Map<string, WebSocket>();
const streamStateListeners = new Map<string, Set<(signal: ObsStreamStateSignal) => void>>();

export class ObsDirectSceneClient {
  public constructor(private readonly url = 'ws://127.0.0.1:4455', private readonly password = '', private readonly timeoutMs = 4_000, private readonly connectionId = url, private readonly connectionName = 'OBS WebSocket (direct)', private readonly confirmationMs = 15_000) {}

  public async getSceneList(): Promise<DirectSceneSnapshot> {
    const responseData = await this.request('GetSceneList');
    const scenes = Array.isArray(responseData['scenes']) ? responseData['scenes'].flatMap((scene) => { const name = string(record(scene)['sceneName']).trim(); return name === '' ? [] : [name]; }) : [];
    const currentScene = string(responseData['currentProgramSceneName']).trim();
    return { connectionId: this.connectionId, connectionName: this.connectionName, scenes, ...(currentScene === '' ? {} : { currentScene }) };
  }

  public async isStreaming(): Promise<boolean> { return (await this.request('GetStreamStatus'))['outputActive'] === true; }

  /** True while a subscribed socket for this endpoint is open and identified. */
  public hasOpenSession(): boolean { return openSessions.get(this.url)?.readyState === WebSocket.OPEN; }

  /**
   * Registers a listener for OBS stream output changes on the shared socket.
   * It is also called whenever that socket (re)connects so callers can resync.
   */
  public onStreamStateSignal(listener: (signal: ObsStreamStateSignal) => void): () => void {
    const listeners = streamStateListeners.get(this.url) ?? new Set(); listeners.add(listener); streamStateListeners.set(this.url, listeners);
    return () => { listeners.delete(listener); if (listeners.size === 0 && streamStateListeners.get(this.url) === listeners) streamStateListeners.delete(this.url); };
  }

  public async watchChanges(onChange: () => void, signal: AbortSignal): Promise<void> {
    const socket = new WebSocket(this.url, { maxPayload: 256 * 1024 });
    let timer: NodeJS.Timeout | undefined; let confirmation: NodeJS.Timeout | undefined;
    const onMessage = (raw: WebSocket.RawData): void => {
      try {
        const value = JSON.parse(rawText(raw)) as unknown; if (!isRecord(value) || value['op'] !== 5) return;
        const eventType = string(record(value['d'])['eventType']);
        if (eventType === 'StreamStateChanged') { notifyStreamState(this.url, 'stream-state-changed'); return; }
        if (!SCENE_EVENTS.has(eventType)) return;
        if (timer !== undefined) clearTimeout(timer); timer = setTimeout(onChange, 100); timer.unref();
      } catch { /* Ignore malformed provider events. */ }
    };
    try {
      const deadline = AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]);
      const hello = await nextMessage(socket, deadline, 0); const authentication = record(record(hello['d'])['authentication']);
      const identify: Record<string, unknown> = { rpcVersion: 1, eventSubscriptions: OBS_EVENT_SCENES | OBS_EVENT_OUTPUTS };
      if (Object.keys(authentication).length > 0) { if (this.password === '') throw new Error('OBS WebSocket requires a password.'); identify['authentication'] = obsAuthentication(this.password, string(authentication['salt']), string(authentication['challenge'])); }
      socket.send(JSON.stringify({ op: 1, d: identify })); await nextMessage(socket, deadline, 2);
      socket.on('message', onMessage);
      openSessions.set(this.url, socket);
      notifyStreamState(this.url, 'connected');
      // Some OBS/provider combinations miss scene notifications during chained
      // transitions. Confirm the snapshot on this same socket at a slow interval
      // while the subscription is active; consumers still compare scene names
      // before taking any action.
      confirmation = setInterval(onChange, this.confirmationMs); confirmation.unref();
      await waitUntilClosed(socket, signal, 'OBS');
    } finally {
      if (confirmation !== undefined) clearInterval(confirmation); if (timer !== undefined) clearTimeout(timer); socket.off('message', onMessage);
      if (openSessions.get(this.url) === socket) openSessions.delete(this.url);
      if (socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Scene subscription stopped');
    }
  }

  private async request(requestType: 'GetSceneList' | 'GetStreamStatus'): Promise<Record<string, unknown>> {
    const deadline = AbortSignal.timeout(this.timeoutMs);
    const shared = openSessions.get(this.url);
    if (shared?.readyState === WebSocket.OPEN) return await sendRequest(shared, deadline, requestType);
    const socket = new WebSocket(this.url, { maxPayload: 256 * 1024 });
    try {
      const hello = await nextMessage(socket, deadline, 0);
      const authentication = record(record(hello['d'])['authentication']);
      const identify: Record<string, unknown> = { rpcVersion: 1, eventSubscriptions: 0 };
      if (Object.keys(authentication).length > 0) {
        if (this.password === '') throw new Error('OBS WebSocket requires a password; save it in THSV_OBS_WEBSOCKET_PASSWORD or use the Streamer.bot scene fallback.');
        identify['authentication'] = obsAuthentication(this.password, string(authentication['salt']), string(authentication['challenge']));
      }
      socket.send(JSON.stringify({ op: 1, d: identify }));
      await nextMessage(socket, deadline, 2);
      return await sendRequest(socket, deadline, requestType);
    } finally { socket.close(1000, 'Read-only scene query complete'); }
  }
}

async function sendRequest(socket: WebSocket, deadline: AbortSignal, requestType: string): Promise<Record<string, unknown>> {
  const requestId = randomUUID();
  const response = nextMessage(socket, deadline, 7, requestId);
  socket.send(JSON.stringify({ op: 6, d: { requestType, requestId } }));
  const data = record((await response)['d']);
  const status = record(data['requestStatus']); if (status['result'] !== true) throw new Error(`OBS ${requestType} failed: ${string(status['comment']) || 'unknown response'}`);
  return record(data['responseData']);
}

function notifyStreamState(url: string, signal: ObsStreamStateSignal): void {
  for (const listener of [...(streamStateListeners.get(url) ?? [])]) { try { listener(signal); } catch { /* Listener failures must not break the shared socket. */ } }
}

function rawText(raw: WebSocket.RawData): string { return Array.isArray(raw) ? Buffer.concat(raw).toString('utf8') : Buffer.isBuffer(raw) ? raw.toString('utf8') : Buffer.from(raw).toString('utf8'); }

function obsAuthentication(password: string, salt: string, challenge: string): string {
  if (salt === '' || challenge === '') throw new Error('OBS returned an incomplete authentication challenge.');
  const secret = createHash('sha256').update(password + salt).digest('base64');
  return createHash('sha256').update(secret + challenge).digest('base64');
}

async function nextMessage(socket: WebSocket, signal: AbortSignal, op: number, requestId?: string): Promise<Record<string, unknown>> {
  if (signal.aborted) throw new Error('OBS WebSocket scene query timed out.');
  return await new Promise<Record<string, unknown>>((resolve, reject) => {
    const cleanup = (): void => { socket.off('message', onMessage); socket.off('error', onError); socket.off('close', onClose); signal.removeEventListener('abort', onAbort); };
    const onError = (error: Error): void => { cleanup(); reject(error); };
    const onClose = (): void => { cleanup(); reject(new Error('OBS WebSocket closed before the scene query completed.')); };
    const onAbort = (): void => { cleanup(); reject(new Error('OBS WebSocket scene query timed out.')); };
    const onMessage = (raw: WebSocket.RawData): void => {
      try { const value = JSON.parse(rawText(raw)) as unknown; if (!isRecord(value) || value['op'] !== op) return; if (requestId !== undefined && record(value['d'])['requestId'] !== requestId) return; cleanup(); resolve(value); }
      catch (error) { cleanup(); reject(error instanceof Error ? error : new Error(String(error))); }
    };
    socket.on('message', onMessage); socket.once('error', onError); socket.once('close', onClose); signal.addEventListener('abort', onAbort, { once: true });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function record(value: unknown): Record<string, unknown> { return isRecord(value) ? value : {}; }
function string(value: unknown): string { return typeof value === 'string' ? value : ''; }

async function waitUntilClosed(socket: WebSocket, signal: AbortSignal, label: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => { socket.off('close', onClose); socket.off('error', onError); signal.removeEventListener('abort', onAbort); };
    const onClose = (): void => { cleanup(); resolve(); }; const onError = (error: Error): void => { cleanup(); reject(error); }; const onAbort = (): void => { cleanup(); resolve(); };
    socket.once('close', onClose); socket.once('error', onError); signal.addEventListener('abort', onAbort, { once: true });
  });
  if (signal.aborted && socket.readyState < WebSocket.CLOSING) socket.close(1000, `${label} subscription stopped`);
}
