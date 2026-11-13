import { createHash, randomUUID } from 'node:crypto';
import WebSocket from 'ws';

export interface DirectSceneSnapshot {
  readonly connectionId: string;
  readonly connectionName: string;
  readonly scenes: readonly string[];
  readonly currentScene?: string;
}

/** One streaming (service) output as OBS reports it. `durationMs` is how long the current connection has been sending; it restarts after every reconnect. */
export interface ObsStreamOutputSample {
  readonly name: string;
  readonly reconnecting: boolean;
  readonly durationMs: number;
}

const MAXIMUM_SAMPLED_OUTPUTS = 16;

export interface ObsLayoutItem {
  readonly name: string;
  readonly kind: string;
  readonly isGroup: boolean;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** OBS alignment bit field: 1 left, 2 right, 4 top, 8 bottom; 0 centre. */
  readonly alignment: number;
  readonly url?: string;
  /** The browser source has custom CSS that moves things around, so where its content sits is a guess. */
  readonly customCss?: boolean;
}

/** One browser source the Wizard asks OBS to add. */
export const OBS_PLACEMENTS = ['full', 'center', 'left', 'right', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
export type ObsPlacement = typeof OBS_PLACEMENTS[number];
export interface ObsBrowserSourceRequest { readonly name: string; readonly url: string; readonly width: number; readonly height: number; readonly placement?: ObsPlacement }
export interface ObsSceneItemTransform { readonly positionX: number; readonly positionY: number; readonly scaleX: number; readonly scaleY: number }

/**
 * Where a starter-scene overlay goes on the canvas. Sizes are designed for 1920 wide, so they scale with the canvas;
 * full-canvas overlays stretch to fill it, everything else keeps its shape and sits a small margin from the edge.
 */
export function placementTransform(placement: ObsPlacement, source: { readonly width: number; readonly height: number }, canvas: { readonly width: number; readonly height: number }): ObsSceneItemTransform {
  if (placement === 'full') return { positionX: 0, positionY: 0, scaleX: canvas.width / source.width, scaleY: canvas.height / source.height };
  const design = Math.min(canvas.width, canvas.height) / 1080;
  const scale = Math.min(design, (canvas.width * 0.96) / source.width, (canvas.height * 0.96) / source.height);
  const width = source.width * scale; const height = source.height * scale; const margin = Math.round(24 * design);
  const left = margin; const right = canvas.width - width - margin; const middleX = (canvas.width - width) / 2;
  const top = margin; const bottom = canvas.height - height - margin; const middleY = (canvas.height - height) / 2;
  const [x, y] = ({ center: [middleX, middleY], left: [left, middleY], right: [right, middleY], top: [middleX, top], bottom: [middleX, bottom], 'top-left': [left, top], 'top-right': [right, top], 'bottom-left': [left, bottom], 'bottom-right': [right, bottom] } as const)[placement];
  return { positionX: Math.round(x), positionY: Math.round(y), scaleX: scale, scaleY: scale };
}
export interface ObsPowerSavingResult { readonly changed: readonly string[]; readonly already: readonly string[]; readonly keptRunning: number }
/**
 * Overlays that only show a standing picture and catch up by themselves when their scene comes back, so OBS can
 * safely stop them while hidden. Alerts, chat, captions, the emote wall, countdowns, timers, clips, music and
 * games are never in this list: they react at any moment or keep time.
 */
export const PAUSE_WHEN_HIDDEN_MODULES: readonly string[] = ['thsv.local-clock', 'thsv.chat-first', 'thsv.first-five', 'thsv.fan-crown', 'thsv.village-roll-call', 'thsv.viewer-spotlight'];
export function pausableOverlayUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) return false;
    return PAUSE_WHEN_HIDDEN_MODULES.some((moduleId) => parsed.pathname === `/overlay/addons/${moduleId}`);
  } catch { return false; }
}
export interface ObsBrowserSourceResult { readonly sceneName: string; readonly sceneCreated: boolean; readonly added: readonly string[]; readonly skipped: readonly string[]; readonly shared?: readonly string[] }

export interface ObsLayoutScene { readonly name: string; readonly items: readonly ObsLayoutItem[] }
export interface ObsLayoutSnapshot { readonly canvas: { readonly width: number; readonly height: number }; readonly scenes: readonly ObsLayoutScene[] }

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
  public async isRecording(): Promise<boolean> { return (await this.request('GetRecordStatus'))['outputActive'] === true; }

  /** Turns OBS Virtual Camera on unless it already runs. Resolves true when it is running afterwards. */
  public async ensureVirtualCamera(startTimeoutMs = 5_000): Promise<boolean> {
    if ((await this.request('GetVirtualCamStatus'))['outputActive'] === true) return true;
    await this.request('StartVirtualCam');
    // OBS answers StartVirtualCam before the output reports active (on the creator's PC by about
    // 2 ms), so wait briefly for it instead of checking once.
    const deadline = Date.now() + startTimeoutMs;
    for (;;) {
      if ((await this.request('GetVirtualCamStatus'))['outputActive'] === true) return true;
      if (Date.now() >= deadline) return false;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  /**
   * Active streaming outputs (the main stream and plugin outputs such as Aitum's per-platform
   * outputs) with their reconnect state. Reads only over the already-open subscribed socket, so
   * periodic sampling never opens extra OBS connections; returns undefined while none is open.
   */
  public async getStreamingOutputs(): Promise<readonly ObsStreamOutputSample[] | undefined> {
    const shared = openSessions.get(this.url);
    if (shared?.readyState !== WebSocket.OPEN) return undefined;
    const deadline = AbortSignal.timeout(this.timeoutMs);
    const listed = await sendRequest(shared, deadline, 'GetOutputList');
    const outputs = (Array.isArray(listed['outputs']) ? listed['outputs'] : []).map(record)
      .filter((output) => output['outputActive'] === true && record(output['outputFlags'])['OBS_OUTPUT_SERVICE'] === true && string(output['outputName']) !== '')
      .slice(0, MAXIMUM_SAMPLED_OUTPUTS);
    const samples: ObsStreamOutputSample[] = [];
    for (const output of outputs) {
      const name = string(output['outputName']);
      const status = await sendRequest(shared, deadline, 'GetOutputStatus', { outputName: name });
      if (status['outputActive'] !== true) continue;
      const durationMs = status['outputDuration'];
      samples.push({ name, reconnecting: status['outputReconnecting'] === true, durationMs: typeof durationMs === 'number' && Number.isFinite(durationMs) ? durationMs : 0 });
    }
    return samples;
  }

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

  /**
   * Read-only map of every scene on the main canvas: where each enabled source sits and, for browser
   * sources, which URL it shows. Nested scenes and groups are opened (up to three levels) and their items
   * placed on the canvas, because creators often keep overlays in a shared scene. Never changes anything.
   */
  public async getLayout(maximumScenes = 40, maximumItems = 120): Promise<ObsLayoutSnapshot> {
    const video = await this.request('GetVideoSettings');
    const canvas = { width: number(video['baseWidth'], 1920), height: number(video['baseHeight'], 1080) };
    const list = await this.request('GetSceneList');
    const sceneNames = (Array.isArray(list['scenes']) ? list['scenes'] : []).map((scene) => string(record(scene)['sceneName']).trim()).filter(Boolean).reverse().slice(0, maximumScenes);
    const urls = new Map<string, { url: string; customCss: boolean }>();
    const listings = new Map<string, unknown[]>();
    const nested = new Set<string>();
    const children = async (name: string, group: boolean): Promise<unknown[]> => {
      const key = `${group ? 'group' : 'scene'}:${name}`;
      if (!listings.has(key)) {
        try { const response = await this.request(group ? 'GetGroupSceneItemList' : 'GetSceneItemList', { sceneName: name }); listings.set(key, Array.isArray(response['sceneItems']) ? response['sceneItems'] : []); }
        catch { listings.set(key, []); }
      }
      return listings.get(key) ?? [];
    };
    const place = async (raw: unknown[], frame: { left: number; top: number; scaleX: number; scaleY: number }, depth: number, items: ObsLayoutItem[]): Promise<void> => {
      for (const entry of raw) {
        if (items.length >= maximumItems) return;
        const item = record(entry); const transform = record(item['sceneItemTransform']);
        const name = string(item['sourceName']); const kind = string(item['inputKind']);
        if (name === '' || item['sceneItemEnabled'] !== true) continue;
        const width = (number(transform['width'], 0) || number(transform['sourceWidth'], 0) * number(transform['scaleX'], 1)) * frame.scaleX;
        const height = (number(transform['height'], 0) || number(transform['sourceHeight'], 0) * number(transform['scaleY'], 1)) * frame.scaleY;
        const alignment = number(transform['alignment'], 5);
        const horizontal = (alignment & 1) !== 0 ? 0 : (alignment & 2) !== 0 ? 1 : 0.5; const vertical = (alignment & 4) !== 0 ? 0 : (alignment & 8) !== 0 ? 1 : 0.5;
        const left = frame.left + number(transform['positionX'], 0) * frame.scaleX - width * horizontal;
        const top = frame.top + number(transform['positionY'], 0) * frame.scaleY - height * vertical;
        const isGroup = item['isGroup'] === true;
        const isScene = string(item['sourceType']) === 'OBS_SOURCE_TYPE_SCENE' && !isGroup;
        if (isScene) nested.add(name);
        if ((isGroup || isScene) && depth < 3) {
          // A nested scene is drawn at canvas size and scaled into its box; a group keeps its own scale.
          const scaleX = isScene ? width / canvas.width : number(transform['scaleX'], 1) * frame.scaleX;
          const scaleY = isScene ? height / canvas.height : number(transform['scaleY'], 1) * frame.scaleY;
          await place(await children(name, isGroup), { left, top, scaleX: scaleX || frame.scaleX, scaleY: scaleY || frame.scaleY }, depth + 1, items);
          continue;
        }
        let browser: { url: string; customCss: boolean } | undefined;
        if (kind === 'browser_source') {
          if (!urls.has(name)) {
            try { const settings = record((await this.request('GetInputSettings', { inputName: name }))['inputSettings']); urls.set(name, { url: string(settings['url']), customCss: /(?:position|left|right|top|bottom|transform|translate|inset|margin)\s*:/iu.test(string(settings['css'])) }); }
            catch { urls.set(name, { url: '', customCss: false }); }
          }
          browser = urls.get(name);
        }
        items.push({ name, kind, isGroup: false, x: left, y: top, width, height, alignment: 5, ...(browser?.url ? { url: browser.url, customCss: browser.customCss } : {}) });
      }
    };
    const scenes: ObsLayoutScene[] = [];
    for (const sceneName of sceneNames) {
      const items: ObsLayoutItem[] = [];
      await place(await children(sceneName, false), { left: 0, top: 0, scaleX: 1, scaleY: 1 }, 0, items);
      scenes.push({ name: sceneName, items });
    }
    // Scenes that only appear inside other scenes are already covered where they are used.
    return { canvas, scenes: scenes.filter((scene) => !nested.has(scene.name)) };
  }

  /** Saves a PNG of the scene currently on air (Discord screenshots). OBS writes the file itself. */
  public async saveProgramScreenshot(imageFilePath: string): Promise<void> { await this.saveScreenshot(imageFilePath); }

  /** Saves the program scene, or one named source such as a camera, as a PNG at `imageFilePath`. */
  public async saveScreenshot(imageFilePath: string, sourceName?: string): Promise<void> {
    const source = sourceName?.trim() || string((await this.request('GetCurrentProgramScene'))['currentProgramSceneName']);
    if (source === '') throw new Error('OBS reported no program scene.');
    await this.request('SaveSourceScreenshot', { sourceName: source, imageFormat: 'png', imageFilePath });
  }

  /** Names of the sources (inputs) in OBS, for choosing what a screenshot captures. */
  public async listSources(): Promise<readonly string[]> {
    const inputs = (await this.request('GetInputList'))['inputs'];
    return (Array.isArray(inputs) ? inputs : []).map((input) => string(record(input)['inputName'])).filter((name) => name !== '').sort((left, right) => left.localeCompare(right)).slice(0, 300);
  }

  /**
   * Adds browser sources to one scene, creating the scene when it does not exist. A source whose name
   * is already used anywhere in OBS is left alone, so running it twice never makes duplicates or
   * changes a source the creator already placed.
   */
  /**
   * Adds browser sources to a scene, creating the scene when it is missing. A source that already exists elsewhere
   * is skipped, or with shareExisting it is also shown in this scene (the same source, so its settings stay shared).
   */
  public async addBrowserSources(sceneName: string, sources: readonly ObsBrowserSourceRequest[], shareExisting = false): Promise<ObsBrowserSourceResult> {
    const scenes = (await this.getSceneList()).scenes;
    const sceneCreated = !scenes.includes(sceneName);
    if (sceneCreated) await this.request('CreateScene', { sceneName });
    const inputs = (await this.request('GetInputList'))['inputs'];
    const existing = new Set((Array.isArray(inputs) ? inputs : []).map((input) => string(record(input)['inputName'])));
    const inScene = new Set<string>();
    if (shareExisting && !sceneCreated) {
      const items = (await this.request('GetSceneItemList', { sceneName }))['sceneItems'];
      for (const item of Array.isArray(items) ? items : []) inScene.add(string(record(item)['sourceName']));
    }
    const added: string[] = []; const skipped: string[] = []; const shared: string[] = [];
    let canvas: { width: number; height: number } | undefined;
    const place = async (source: ObsBrowserSourceRequest, created: Record<string, unknown>): Promise<void> => {
      const sceneItemId = created['sceneItemId'];
      if (source.placement === undefined || typeof sceneItemId !== 'number') return;
      if (canvas === undefined) { const video = await this.request('GetVideoSettings'); canvas = { width: number(video['baseWidth'], 1920), height: number(video['baseHeight'], 1080) }; }
      await this.request('SetSceneItemTransform', { sceneName, sceneItemId, sceneItemTransform: placementTransform(source.placement, source, canvas) });
    };
    for (const source of sources) {
      if (existing.has(source.name)) {
        if (shareExisting && !inScene.has(source.name)) { await place(source, await this.request('CreateSceneItem', { sceneName, sourceName: source.name, sceneItemEnabled: true })); inScene.add(source.name); shared.push(source.name); }
        else skipped.push(source.name);
        continue;
      }
      await place(source, await this.request('CreateInput', { sceneName, inputName: source.name, inputKind: 'browser_source', inputSettings: { url: source.url, width: source.width, height: source.height }, sceneItemEnabled: true }));
      existing.add(source.name); added.push(source.name);
    }
    return { sceneName, sceneCreated, added, skipped, ...(shareExisting ? { shared } : {}) };
  }

  /** Removes the named scenes when they exist. Only the scenes go: a source that other scenes still show stays there. */
  public async removeScenes(sceneNames: readonly string[]): Promise<{ readonly removed: readonly string[]; readonly missing: readonly string[] }> {
    const scenes = new Set((await this.getSceneList()).scenes);
    const removed: string[] = []; const missing: string[] = [];
    for (const sceneName of sceneNames) {
      if (!scenes.has(sceneName)) { missing.push(sceneName); continue; }
      await this.request('RemoveScene', { sceneName }); removed.push(sceneName);
    }
    return { removed, missing };
  }

  /** Undoes Save power: StreamBridge overlays that pause while hidden keep running again. Other sources are left alone. */
  public async resumeHiddenOverlaySources(): Promise<ObsPowerSavingResult> {
    const inputs = (await this.request('GetInputList', { inputKind: 'browser_source' }))['inputs'];
    const names = (Array.isArray(inputs) ? inputs : []).map((input) => string(record(input)['inputName'])).filter((name) => name !== '').slice(0, 300);
    const changed: string[] = []; const already: string[] = []; let keptRunning = 0;
    for (const inputName of names) {
      const settings = record((await this.request('GetInputSettings', { inputName }))['inputSettings']);
      if (!pausableOverlayUrl(string(settings['url']))) { keptRunning += 1; continue; }
      if (settings['shutdown'] !== true) { already.push(inputName); continue; }
      await this.request('SetInputSettings', { inputName, inputSettings: { shutdown: false }, overlay: true });
      changed.push(inputName);
    }
    return { changed, already, keptRunning };
  }

  /**
   * Turns on "Shutdown source when not visible" for StreamBridge browser sources that are safe to pause.
   * Every other source, and every other setting of the changed sources, is left exactly as it is.
   */
  public async pauseHiddenOverlaySources(): Promise<ObsPowerSavingResult> {
    const inputs = (await this.request('GetInputList', { inputKind: 'browser_source' }))['inputs'];
    const names = (Array.isArray(inputs) ? inputs : []).map((input) => string(record(input)['inputName'])).filter((name) => name !== '').slice(0, 300);
    const changed: string[] = []; const already: string[] = []; let keptRunning = 0;
    for (const inputName of names) {
      const settings = record((await this.request('GetInputSettings', { inputName }))['inputSettings']);
      if (!pausableOverlayUrl(string(settings['url']))) { keptRunning += 1; continue; }
      if (settings['shutdown'] === true) { already.push(inputName); continue; }
      await this.request('SetInputSettings', { inputName, inputSettings: { shutdown: true }, overlay: true });
      changed.push(inputName);
    }
    return { changed, already, keptRunning };
  }

  private async request(requestType: 'CreateScene' | 'CreateSceneItem' | 'RemoveScene' | 'SetSceneItemTransform' | 'CreateInput' | 'SetInputSettings' | 'GetRecordStatus' | 'GetSceneList' | 'GetStreamStatus' | 'GetVirtualCamStatus' | 'StartVirtualCam' | 'GetVideoSettings' | 'GetSceneItemList' | 'GetGroupSceneItemList' | 'GetInputSettings' | 'GetCurrentProgramScene' | 'SaveSourceScreenshot' | 'GetInputList', requestData?: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>> {
    const deadline = AbortSignal.timeout(this.timeoutMs);
    const shared = openSessions.get(this.url);
    if (shared?.readyState === WebSocket.OPEN) return await sendRequest(shared, deadline, requestType, requestData);
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
      return await sendRequest(socket, deadline, requestType, requestData);
    } finally { socket.close(1000, 'Read-only scene query complete'); }
  }
}

async function sendRequest(socket: WebSocket, deadline: AbortSignal, requestType: string, requestData?: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>> {
  const requestId = randomUUID();
  const response = nextMessage(socket, deadline, 7, requestId);
  socket.send(JSON.stringify({ op: 6, d: { requestType, requestId, ...(requestData === undefined ? {} : { requestData }) } }));
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
function number(value: unknown, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
