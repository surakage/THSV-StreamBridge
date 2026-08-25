import { createHash, randomUUID } from 'node:crypto';
import WebSocket from 'ws';

export interface DirectSceneSnapshot {
  readonly connectionId: string;
  readonly connectionName: string;
  readonly scenes: readonly string[];
  readonly currentScene?: string;
}

export class ObsDirectSceneClient {
  public constructor(private readonly url = 'ws://127.0.0.1:4455', private readonly password = '', private readonly timeoutMs = 4_000, private readonly connectionId = url, private readonly connectionName = 'OBS WebSocket (direct)') {}

  public async getSceneList(): Promise<DirectSceneSnapshot> {
    const responseData = await this.request('GetSceneList');
    const scenes = Array.isArray(responseData['scenes']) ? responseData['scenes'].flatMap((scene) => { const name = string(record(scene)['sceneName']).trim(); return name === '' ? [] : [name]; }) : [];
    const currentScene = string(responseData['currentProgramSceneName']).trim();
    return { connectionId: this.connectionId, connectionName: this.connectionName, scenes, ...(currentScene === '' ? {} : { currentScene }) };
  }

  public async isStreaming(): Promise<boolean> { return (await this.request('GetStreamStatus'))['outputActive'] === true; }

  public async watchChanges(onChange: () => void, signal: AbortSignal): Promise<void> {
    const socket = new WebSocket(this.url, { maxPayload: 256 * 1024 });
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]);
    const hello = await nextMessage(socket, deadline, 0); const authentication = record(record(hello['d'])['authentication']);
    const identify: Record<string, unknown> = { rpcVersion: 1, eventSubscriptions: 4 };
    if (Object.keys(authentication).length > 0) { if (this.password === '') throw new Error('OBS WebSocket requires a password.'); identify['authentication'] = obsAuthentication(this.password, string(authentication['salt']), string(authentication['challenge'])); }
    socket.send(JSON.stringify({ op: 1, d: identify })); await nextMessage(socket, deadline, 2);
    let timer: NodeJS.Timeout | undefined;
    const onMessage = (raw: WebSocket.RawData): void => { try { const value = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : Buffer.from(raw as ArrayBuffer).toString('utf8')) as unknown; if (!isRecord(value) || value['op'] !== 5) return; const eventType = string(record(value['d'])['eventType']); if (!['SceneCreated', 'SceneRemoved', 'SceneNameChanged', 'CurrentProgramSceneChanged', 'SceneListChanged'].includes(eventType)) return; if (timer !== undefined) clearTimeout(timer); timer = setTimeout(onChange, 100); timer.unref(); } catch { /* Ignore malformed provider events. */ } };
    socket.on('message', onMessage);
    try { await waitUntilClosed(socket, signal, 'OBS'); }
    finally { if (timer !== undefined) clearTimeout(timer); socket.off('message', onMessage); if (socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Scene subscription stopped'); }
  }

  private async request(requestType: 'GetSceneList' | 'GetStreamStatus'): Promise<Record<string, unknown>> {
    const socket = new WebSocket(this.url, { maxPayload: 256 * 1024 });
    const deadline = AbortSignal.timeout(this.timeoutMs);
    try {
      const hello = await nextMessage(socket, deadline, 0);
      const authentication = record(record(hello['d'])['authentication']);
      const identify: Record<string, unknown> = { rpcVersion: 1 };
      if (Object.keys(authentication).length > 0) {
        if (this.password === '') throw new Error('OBS WebSocket requires a password; save it in THSV_OBS_WEBSOCKET_PASSWORD or use the Streamer.bot scene fallback.');
        identify['authentication'] = obsAuthentication(this.password, string(authentication['salt']), string(authentication['challenge']));
      }
      socket.send(JSON.stringify({ op: 1, d: identify }));
      await nextMessage(socket, deadline, 2);
      const requestId = randomUUID(); socket.send(JSON.stringify({ op: 6, d: { requestType, requestId } }));
      const response = await nextMessage(socket, deadline, 7, requestId); const data = record(response['d']);
      const status = record(data['requestStatus']); if (status['result'] !== true) throw new Error(`OBS ${requestType} failed: ${string(status['comment']) || 'unknown response'}`);
      return record(data['responseData']);
    } finally { socket.close(1000, 'Read-only scene query complete'); }
  }
}

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
      try { const value = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : Buffer.from(raw as ArrayBuffer).toString('utf8')) as unknown; if (!isRecord(value) || value['op'] !== op) return; if (requestId !== undefined && record(value['d'])['requestId'] !== requestId) return; cleanup(); resolve(value); }
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
