import WebSocket from 'ws';
import type { DirectSceneSnapshot } from './obs-direct-scene-client.js';

export class MeldDirectSceneClient {
  public constructor(private readonly url = 'ws://127.0.0.1:13376', private readonly timeoutMs = 4_000, private readonly connectionId = url, private readonly connectionName = 'Meld Studio WebSocket (direct)') {}

  public async getSceneList(): Promise<DirectSceneSnapshot> {
    const socket = new WebSocket(this.url, { maxPayload: 512 * 1024 });
    const signal = AbortSignal.timeout(this.timeoutMs);
    try {
      await waitForOpen(socket, signal, 'Meld Studio');
      const responsePromise = waitForJson(socket, signal, (value) => value['type'] === 10 && value['id'] === 1, 'Meld Studio');
      socket.send(JSON.stringify({ type: 3, id: 1 }));
      const response = await responsePromise;
      socket.send(JSON.stringify({ type: 4 }));
      return parseMeldSceneSnapshot(response['data'], this.connectionId, this.connectionName);
    } finally { socket.close(1000, 'Read-only scene query complete'); }
  }

  public async watchChanges(onChange: () => void, signal: AbortSignal): Promise<void> {
    const socket = new WebSocket(this.url, { maxPayload: 512 * 1024 }); const deadline = AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]);
    await waitForOpen(socket, deadline, 'Meld Studio'); const responsePromise = waitForJson(socket, deadline, (value) => value['type'] === 10 && value['id'] === 1, 'Meld Studio'); socket.send(JSON.stringify({ type: 3, id: 1 })); const response = await responsePromise;
    const meld = record(record(response['data'])['meld']); const signals = Array.isArray(meld['signals']) ? meld['signals'] as unknown[] : []; const sessionSignal = signals.find((entry) => Array.isArray(entry) && entry[0] === 'sessionChanged');
    if (Array.isArray(sessionSignal) && typeof sessionSignal[1] === 'number') socket.send(JSON.stringify({ type: 7, object: 'meld', signal: sessionSignal[1] }));
    socket.send(JSON.stringify({ type: 4 }));
    const onMessage = (raw: WebSocket.RawData): void => { try { const value = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : Buffer.from(raw as ArrayBuffer).toString('utf8')) as unknown; if (!isRecord(value)) return; const changed = value['type'] === 2 || value['type'] === 1 && value['object'] === 'meld' && Array.isArray(sessionSignal) && value['signal'] === sessionSignal[1]; if (changed) onChange(); if (value['type'] === 2) socket.send(JSON.stringify({ type: 4 })); } catch { /* Ignore malformed provider events. */ } };
    socket.on('message', onMessage); try { await waitUntilClosed(socket, signal, 'Meld Studio'); } finally { socket.off('message', onMessage); if (socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Scene subscription stopped'); }
  }
}

export class StreamlabsDirectSceneClient {
  public constructor(private readonly url = 'ws://127.0.0.1:59650/api/websocket', private readonly token = '', private readonly timeoutMs = 4_000, private readonly connectionId = url, private readonly connectionName = 'Streamlabs Desktop Remote Control (direct)') {}

  public async getSceneList(): Promise<DirectSceneSnapshot> {
    if (this.token.trim() === '') throw new Error('Streamlabs Desktop Remote Control requires its token; save it in THSV_STREAMLABS_REMOTE_TOKEN or use the Streamer.bot scene fallback.');
    const socket = new WebSocket(this.url, { maxPayload: 512 * 1024 });
    const signal = AbortSignal.timeout(this.timeoutMs);
    try {
      await waitForSockJsOpen(socket, signal);
      await streamlabsRequest(socket, signal, 1, 'TcpServerService', 'auth', [this.token]);
      const scenes = await streamlabsRequest(socket, signal, 2, 'ScenesService', 'getScenes', []);
      const activeSceneId = await streamlabsRequest(socket, signal, 3, 'ScenesService', 'activeSceneId', []);
      return parseStreamlabsSceneSnapshot(scenes, activeSceneId, this.connectionId, this.connectionName);
    } finally { socket.close(1000, 'Read-only scene query complete'); }
  }

  public async watchChanges(onChange: () => void, signal: AbortSignal): Promise<void> {
    if (this.token.trim() === '') throw new Error('Streamlabs Desktop Remote Control requires its token.');
    const socket = new WebSocket(this.url, { maxPayload: 512 * 1024 }); const deadline = AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]);
    await waitForSockJsOpen(socket, deadline); await streamlabsRequest(socket, deadline, 1, 'TcpServerService', 'auth', [this.token]);
    await Promise.all(['sceneSwitched', 'sceneAdded', 'sceneRemoved'].map((event, index) => streamlabsRequest(socket, deadline, index + 2, 'ScenesService', event, [])));
    const onMessage = (raw: WebSocket.RawData): void => { for (const value of parseSockJsRecords(Buffer.isBuffer(raw) ? raw.toString('utf8') : Buffer.from(raw as ArrayBuffer).toString('utf8'))) { const result = record(value['result']); if (result['_type'] === 'EVENT' && result['emitter'] === 'STREAM') onChange(); } };
    socket.on('message', onMessage); try { await waitUntilClosed(socket, signal, 'Streamlabs Desktop'); } finally { socket.off('message', onMessage); if (socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Scene subscription stopped'); }
  }
}

export function parseMeldSceneSnapshot(input: unknown, connectionId = 'ws://127.0.0.1:13376', connectionName = 'Meld Studio WebSocket (direct)'): DirectSceneSnapshot {
  const root = record(input); const meld = record(root['meld']);
  const properties = Array.isArray(meld['properties']) ? meld['properties'] : [];
  const sessionProperty = (properties as readonly unknown[]).find((entry: unknown) => Array.isArray(entry) && entry[1] === 'session');
  const session = record(Array.isArray(sessionProperty) ? sessionProperty[3] : undefined);
  const items = record(session['items']);
  const scenes = Object.values(items).map(record).filter((item) => item['type'] === 'scene' && cleanString(item['name']) !== '').sort((left, right) => number(left['index']) - number(right['index']));
  const names = scenes.map((scene) => cleanString(scene['name']));
  if (names.length === 0) throw new Error('Meld Studio returned no scene entries. Confirm its WebSocket Server is enabled in Settings > Advanced.');
  const currentScene = cleanString(scenes.find((scene) => scene['current'] === true)?.['name']);
  return { connectionId, connectionName, scenes: names, ...(currentScene === '' ? {} : { currentScene }) };
}

export function parseStreamlabsSceneSnapshot(scenesValue: unknown, activeSceneId: unknown, connectionId = 'ws://127.0.0.1:59650/api/websocket', connectionName = 'Streamlabs Desktop Remote Control (direct)'): DirectSceneSnapshot {
  const scenes = Array.isArray(scenesValue) ? scenesValue.map(record).filter((scene) => cleanString(scene['name']) !== '') : [];
  if (scenes.length === 0) throw new Error('Streamlabs Desktop returned no scene entries. Confirm Remote Control is enabled.');
  const names = scenes.map((scene) => cleanString(scene['name']));
  const activeId = cleanString(activeSceneId);
  const currentScene = cleanString(scenes.find((scene) => cleanString(scene['id']) === activeId)?.['name']);
  return { connectionId, connectionName, scenes: names, ...(currentScene === '' ? {} : { currentScene }) };
}

async function streamlabsRequest(socket: WebSocket, signal: AbortSignal, id: number, resource: string, method: string, args: readonly unknown[]): Promise<unknown> {
  const responsePromise = waitForSockJsJson(socket, signal, (value) => value['id'] === id);
  socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params: { resource, args } }));
  const response = await responsePromise;
  const error = record(response['error']);
  if (Object.keys(error).length > 0) throw new Error(`Streamlabs Desktop ${method} failed: ${cleanString(error['message']) || 'remote API error'}`);
  return response['result'];
}

async function waitForOpen(socket: WebSocket, signal: AbortSignal, label: string): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => { socket.off('open', onOpen); socket.off('error', onError); signal.removeEventListener('abort', onAbort); };
    const onOpen = (): void => { cleanup(); resolve(); };
    const onError = (error: Error): void => { cleanup(); reject(error); };
    const onAbort = (): void => { cleanup(); reject(new Error(`${label} WebSocket scene query timed out.`)); };
    socket.once('open', onOpen); socket.once('error', onError); signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function waitForJson(socket: WebSocket, signal: AbortSignal, accept: (value: Record<string, unknown>) => boolean, label: string): Promise<Record<string, unknown>> {
  return await waitForMessage(socket, signal, label, (text) => { try { const parsed = JSON.parse(text) as unknown; return isRecord(parsed) && accept(parsed) ? parsed : undefined; } catch { return undefined; } });
}
async function waitForSockJsOpen(socket: WebSocket, signal: AbortSignal): Promise<void> { await waitForMessage(socket, signal, 'Streamlabs Desktop', (text) => text === 'o' ? true : undefined); }
async function waitForSockJsJson(socket: WebSocket, signal: AbortSignal, accept: (value: Record<string, unknown>) => boolean): Promise<Record<string, unknown>> {
  return await waitForMessage(socket, signal, 'Streamlabs Desktop', (text) => {
    for (const parsed of parseSockJsRecords(text)) if (accept(parsed)) return parsed;
    return undefined;
  });
}
function parseSockJsRecords(text: string): Record<string, unknown>[] { try { const values: unknown[] = text.startsWith('a') ? JSON.parse(text.slice(1)) as unknown[] : [text]; return values.flatMap((entry) => { try { const parsed = JSON.parse(String(entry)) as unknown; return isRecord(parsed) ? [parsed] : []; } catch { return []; } }); } catch { return []; } }
async function waitForMessage<T>(socket: WebSocket, signal: AbortSignal, label: string, parse: (text: string) => T | undefined): Promise<T> {
  if (signal.aborted) throw new Error(`${label} WebSocket scene query timed out.`);
  return await new Promise<T>((resolve, reject) => {
    const cleanup = (): void => { socket.off('message', onMessage); socket.off('error', onError); socket.off('close', onClose); signal.removeEventListener('abort', onAbort); };
    const onError = (error: Error): void => { cleanup(); reject(error); };
    const onClose = (): void => { cleanup(); reject(new Error(`${label} WebSocket closed before the scene query completed.`)); };
    const onAbort = (): void => { cleanup(); reject(new Error(`${label} WebSocket scene query timed out.`)); };
    const onMessage = (raw: WebSocket.RawData): void => { const value = parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : Buffer.from(raw as ArrayBuffer).toString('utf8')); if (value !== undefined) { cleanup(); resolve(value); } };
    socket.on('message', onMessage); socket.once('error', onError); socket.once('close', onClose); signal.addEventListener('abort', onAbort, { once: true });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function record(value: unknown): Record<string, unknown> { return isRecord(value) ? value : {}; }
function cleanString(value: unknown): string { return typeof value === 'string' ? value.trim().slice(0, 256) : ''; }
function number(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER; }

async function waitUntilClosed(socket: WebSocket, signal: AbortSignal, label: string): Promise<void> {
  await new Promise<void>((resolve, reject) => { const cleanup = (): void => { socket.off('close', onClose); socket.off('error', onError); signal.removeEventListener('abort', onAbort); }; const onClose = (): void => { cleanup(); resolve(); }; const onError = (error: Error): void => { cleanup(); reject(error); }; const onAbort = (): void => { cleanup(); resolve(); }; socket.once('close', onClose); socket.once('error', onError); signal.addEventListener('abort', onAbort, { once: true }); });
  if (signal.aborted && socket.readyState < WebSocket.CLOSING) socket.close(1000, `${label} subscription stopped`);
}
