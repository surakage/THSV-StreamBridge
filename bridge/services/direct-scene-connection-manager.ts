import { setTimeout as delay } from 'node:timers/promises';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createConnection } from 'node:net';
import type { DirectSceneSnapshot, ObsBrowserSourceRequest, ObsBrowserSourceResult, ObsPowerSavingResult } from './obs-direct-scene-client.js';
import { OBS_PLACEMENTS, ObsDirectSceneClient } from './obs-direct-scene-client.js';
import { MeldDirectSceneClient, StreamlabsDirectSceneClient } from './direct-broadcast-scene-clients.js';
import type { SprigCastEffect } from './sprigcast-direct-scene-client.js';
import { STREAMING_APP_SUPPORT } from './streaming-app-compatibility.js';
import { streamingEffectKind } from './streaming-app-effects.js';
import type { StreamingEffectCheck, StreamingEffectKind } from './streaming-app-effects.js';
import type { StreamingAppSupport } from './streaming-app-compatibility.js';
import type { SprigCastLink } from './sprigcast-clip-video.js';
import { OBS_SERVER_OFF, readObsWebSocketSettings } from './obs-websocket-settings.js';
import { SPRIGCAST_PORTS, SprigCastDirectSceneClient, closeSprigCastRequestSessions,parseSprigCastConnectionFile, sprigcastAnswers, sprigcastConnectMessage, sprigcastLiveUrl } from './sprigcast-direct-scene-client.js';
import type { SprigCastConnectionFile } from './sprigcast-direct-scene-client.js';
import type { BroadcastConnectionProvider, BroadcastConnectionVaultService, ResolvedBroadcastConnection } from './broadcast-connection-vault-service.js';

export interface DirectSceneConnectionClient {
  getSceneList(): Promise<DirectSceneSnapshot>;
  /** The scene list plus tidy picker groups, when the app can tell its sections and sprigs apart (SprigCast). */
  getSceneCatalog?(): Promise<DirectSceneSnapshot>;
  watchChanges(onChange: () => void, signal: AbortSignal): Promise<void>;
  /** Save the program scene (SprigCast: what is on air; vertical: its vertical canvas), or one named source or scene (SprigCast: bloom), as a PNG at this path. */
  saveScreenshot?(imageFilePath: string, sourceName?: string, vertical?: boolean, named?: 'source' | 'scene'): Promise<void>;
  /** OBS and SprigCast: the source names a screenshot can capture. */
  listSources?(): Promise<readonly string[]>;
  /** OBS and SprigCast: add browser (SprigCast: Web page) sources to one scene (bloom), created when missing, skipping names already used. */
  addBrowserSources?(sceneName: string, sources: readonly ObsBrowserSourceRequest[], shareExisting?: boolean): Promise<ObsBrowserSourceResult>;
  pauseHiddenOverlaySources?(): Promise<ObsPowerSavingResult>;
  resumeHiddenOverlaySources?(): Promise<ObsPowerSavingResult>;
  removeScenes?(sceneNames: readonly string[]): Promise<{ readonly removed: readonly string[]; readonly missing: readonly string[] }>;
  /** Meld: take a screenshot into Meld's own screenshot folder. */
  takeScreenshot?(vertical?: boolean): Promise<void>;
  /** Puts a scene (SprigCast: a bloom) on air. */
  switchScene?(sceneName: string): Promise<void>;
  /** Turns one filter (Meld: effect) on a source (Meld: layer) on or off. */
  setFilter?(sourceName: string, filterName: string, enabled: boolean): Promise<void>;
  /** Ends the stream when it is live. */
  stopStreaming?(): Promise<void>;
  /** Is the app streaming or recording right now? */
  isBusy?(): Promise<boolean>;
  /** Is the app streaming (going out live) right now? Recording alone does not count. */
  isStreaming?(): Promise<boolean>;
  /** OBS and SprigCast: switches the app's virtual camera on unless it already runs; true when it is on afterwards. */
  ensureVirtualCamera?(): Promise<boolean>;
  /** OBS and SprigCast: every browser (Web page) source and its URL. */
  browserSources?(): Promise<readonly { readonly name: string; readonly url: string }[]>;
  /** SprigCast only: its own Hide it and Barrel Roll plugin effects. */
  runEffect?(effect: SprigCastEffect, target: string, seconds: number): Promise<void>;
  /** Streamlabs: a barrel roll by turning the source one full circle. */
  spinSource?(sourceName: string, seconds: number): Promise<void>;
  /** Is this screen effect ready in the app (source, filter, effect, or plugin found)? */
  checkEffect?(kind: StreamingEffectKind, source: string, filter: string): Promise<StreamingEffectCheck>;
  /** Creates what an effect needs (today: a blackout filter in OBS or Streamlabs). */
  createEffect?(kind: StreamingEffectKind, source: string, filter: string): Promise<void>;
}
/** The streaming app extensions control: one the creator picked, or "auto" (the first connected one). */
export type StreamingAppChoice = 'auto' | BroadcastConnectionProvider;
export const STREAMING_APP_ORDER: readonly BroadcastConnectionProvider[] = ['sprigcast', 'obs', 'meld', 'streamlabs'];
export type BroadcastOperation = 'switch-scene' | 'set-filter' | 'stop-streaming' | 'sprigcast-effect' | 'spin-source';
/** What each app can do for extensions through StreamBridge. */
export const BROADCAST_OPERATIONS: Readonly<Record<BroadcastConnectionProvider, readonly BroadcastOperation[]>> = {
  sprigcast: ['switch-scene', 'set-filter', 'stop-streaming', 'sprigcast-effect'],
  obs: ['switch-scene', 'set-filter', 'stop-streaming'],
  meld: ['switch-scene', 'set-filter', 'stop-streaming'],
  streamlabs: ['switch-scene', 'set-filter', 'stop-streaming', 'spin-source'],
};
export type ScreenshotApp = 'auto' | 'obs' | 'meld' | 'sprigcast';
/** scene: the scene on screen now; named-scene / source: one OBS scene or source by name; vertical: Meld's vertical canvas. */
export type ScreenshotTarget = 'scene' | 'named-scene' | 'source' | 'vertical';
export interface ScreenshotRequest { readonly app: ScreenshotApp; readonly target: ScreenshotTarget; readonly sourceName?: string; readonly filePath: string }
/** Which app took it, and where the picture was saved when StreamBridge chose the path (Meld uses its own folder). */
export interface ScreenshotResult { readonly app: 'obs' | 'meld' | 'sprigcast'; readonly connectionName: string; readonly savedTo?: string }
export type DirectSceneConnectionClientFactory = (profile: ResolvedBroadcastConnection) => DirectSceneConnectionClient;
export interface DirectSceneApplicationState { readonly configured: boolean; readonly running: boolean; readonly executableName?: string; readonly processId?: number; readonly differentInstallationProcessId?: number; readonly state?: string }
export type DirectSceneApplicationStateProvider = (profile: ResolvedBroadcastConnection) => Promise<DirectSceneApplicationState>;
interface ConnectionRuntime { readonly profile: ResolvedBroadcastConnection; state: 'connecting' | 'connected' | 'reconnecting' | 'paused' | 'stopped'; lastConnectedAt?: string; lastSnapshotAt?: string; lastError?: string; pauseReason?: string; reconnectCount: number; lastLatencyMs?: number; applicationExecutableName?: string; applicationProcessId?: number; differentInstallationProcessId?: number }
interface ConnectionEvent { readonly timestamp: string; readonly connectionId: string; readonly connectionName: string; readonly provider: BroadcastConnectionProvider; readonly type: 'configured' | 'connected' | 'snapshot' | 'reconnecting' | 'paused' | 'resumed' | 'stopped' | 'test-succeeded' | 'test-failed'; readonly latencyMs?: number; readonly sceneCount?: number; readonly detail?: string }
interface AcceptanceResult { readonly provider: BroadcastConnectionProvider; readonly outcome: string; readonly processId?: number; readonly executable?: string; readonly sceneCount?: number; readonly latencyMs?: number }
interface AcceptanceReceipt { readonly checkedAt: string; readonly results: readonly AcceptanceResult[] }
interface AcceptanceBaseline { readonly approvedAt: string; readonly receiptCheckedAt: string }
interface ReliabilitySnapshot { readonly capturedAt: string; readonly profiles: readonly Readonly<Record<string, unknown>>[] }
interface BroadcastConnectionProfileLike { readonly id: string; readonly name: string; readonly enabled: boolean; readonly hasCredential: boolean; readonly credentialVerifiedAt?: string }
const MAXIMUM_EVENTS = 100;
const WARNING_RECONNECT_THRESHOLD = 3;
const WARNING_LATENCY_MS = 2_000;

export class DirectSceneConnectionManager {
  private controller: AbortController | undefined;
  private runtimes = new Map<string, ConnectionRuntime>();
  private listener: ((provider: BroadcastConnectionProvider, snapshot: DirectSceneSnapshot) => void) | undefined;
  private tasks: Promise<void>[] = [];
  private readonly refreshes = new Set<string>();
  private events: ConnectionEvent[] = [];
  private acceptanceReceipts: AcceptanceReceipt[] = [];
  private acceptanceBaseline: AcceptanceBaseline | undefined;
  private readonly degradationSince = new Map<string, number>();
  private reliabilitySnapshots: ReliabilitySnapshot[] = [];
  private eventWrites: Promise<void> = Promise.resolve();
  private readonly lastSnapshotSignatures = new Map<string, string>();

  /**
   * @param pausePollMs how often a closed application is re-checked while its subscription is paused.
   * @param connectedProbeMs how often a connected application is re-checked. A dropped socket already
   *   triggers an immediate check, so this is only a slow safety net for "wrong installation" detection.
   */
  public constructor(private readonly vault: BroadcastConnectionVaultService, private readonly environmentDefaults: readonly ResolvedBroadcastConnection[] = [], private readonly createClient: DirectSceneConnectionClientFactory = client, private readonly historyPath?: string, private readonly applicationState?: DirectSceneApplicationStateProvider, private readonly pausePollMs = 5_000, private readonly connectedProbeMs = 60_000) {}

  public async start(listener: (provider: BroadcastConnectionProvider, snapshot: DirectSceneSnapshot) => void): Promise<void> { this.listener = listener; await Promise.all([this.loadHistory(), this.loadAcceptanceReceipts(), this.loadAcceptanceBaseline(), this.loadReliabilitySnapshots()]); await this.reload(); }

  public async reload(): Promise<void> {
    await this.stopWatchers();
    const profiles = await this.profiles(); this.controller = new AbortController(); this.runtimes = new Map(profiles.map((profile) => [profile.id, { profile, state: 'connecting', reconnectCount: 0 }]));
    for (const profile of profiles) this.recordEvent(profile, 'configured');
    this.tasks = profiles.map((profile) => this.watchLoop(profile, this.controller?.signal ?? AbortSignal.abort()));
  }

  public async stop(): Promise<void> { this.listener = undefined; await this.stopWatchers(); await this.eventWrites; closeSprigCastRequestSessions(); }

  private streamingAppPath(): string | undefined { return this.historyPath === undefined ? undefined : join(dirname(this.historyPath), 'streaming-app.json'); }

  /** The creator's streaming-app choice ("auto" when never set). */
  public async streamingAppChoice(): Promise<StreamingAppChoice> {
    const path = this.streamingAppPath(); if (path === undefined) return this.memoryStreamingApp;
    try { const value = (JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>)['app']; return value === 'auto' || isProvider(value) ? value : 'auto'; }
    catch { return 'auto'; }
  }
  private memoryStreamingApp: StreamingAppChoice = 'auto';

  public async setStreamingApp(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const app = input !== null && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>)['app'] : undefined;
    if (app !== 'auto' && !isProvider(app)) throw new DirectSceneConnectionError(400, 'app must be auto, obs, sprigcast, meld, or streamlabs.');
    const path = this.streamingAppPath();
    if (path === undefined) this.memoryStreamingApp = app;
    else { await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.${String(process.pid)}.tmp`; await writeFile(temporary, `${JSON.stringify({ version: 1, app }, null, 2)}\n`, 'utf8'); await rename(temporary, path); }
    return await this.streamingApp();
  }

  /** The app extensions control now: the creator's pick, else the first connected (SprigCast first), else the first saved. */
  public async streamingApp(): Promise<Readonly<{ choice: StreamingAppChoice; app?: BroadcastConnectionProvider; connected: readonly BroadcastConnectionProvider[]; configured: readonly BroadcastConnectionProvider[]; operations: Readonly<Record<BroadcastConnectionProvider, readonly BroadcastOperation[]>>; extensions: Readonly<Record<string, StreamingAppSupport>> }>> {
    const choice = await this.streamingAppChoice(); const profiles = await this.profiles();
    const configured = STREAMING_APP_ORDER.filter((provider) => profiles.some((profile) => profile.provider === provider));
    const connected = configured.filter((provider) => profiles.some((profile) => profile.provider === provider && this.runtimes.get(profile.id)?.state === 'connected'));
    const app = choice !== 'auto' ? choice : connected[0] ?? configured[0];
    return { choice, ...(app === undefined ? {} : { app }), connected, configured, operations: BROADCAST_OPERATIONS, extensions: STREAMING_APP_SUPPORT };
  }

  /**
   * Runs one control step in the streaming app extensions use, on its first connected profile (then the others).
   * Throws a clear error when the app can't do it, so the caller can fall back (for example to Streamer.bot).
   */
  public async control(operation: BroadcastOperation, run: (client: DirectSceneConnectionClient) => Promise<void>): Promise<Readonly<{ app: BroadcastConnectionProvider; connectionName: string }>> {
    const { app } = await this.streamingApp();
    if (app === undefined) throw new DirectSceneConnectionError(409, 'Add your streaming app under Scene connections first.');
    if (!BROADCAST_OPERATIONS[app].includes(operation)) throw new DirectSceneConnectionError(409, `${providerLabel(app)} can't do that through StreamBridge.`);
    const rank = (profile: ResolvedBroadcastConnection): number => (this.runtimes.get(profile.id)?.state === 'connected' ? 0 : 1);
    const profiles = (await this.profiles()).filter((profile) => profile.provider === app).sort((left, right) => rank(left) - rank(right));
    if (profiles.length === 0) throw new DirectSceneConnectionError(409, `Add ${providerLabel(app)} under Scene connections first.`);
    const problems: string[] = [];
    for (const profile of profiles) {
      try { await run(this.createClient(profile)); return { app, connectionName: profile.name }; }
      catch (error) { problems.push(`${profile.name}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    throw new DirectSceneConnectionError(502, problems.join(' · '));
  }

  /**
   * Is the creator's streaming app streaming or recording? undefined when no app is saved under Scene connections.
   * An app that can't be reached (closed) counts as not busy, the same as before for OBS.
   */
  public async streamingAppBusy(): Promise<Readonly<{ app: BroadcastConnectionProvider; busy: boolean }> | undefined> {
    const { app } = await this.streamingApp();
    if (app === undefined) return undefined;
    for (const profile of await this.appProfiles(app)) {
      const target = this.createClient(profile);
      if (target.isBusy === undefined) continue;
      try { if (await withTimeout(target.isBusy(), 10_000)) return { app, busy: true }; } catch { /* Closed or unreachable: not busy. */ }
    }
    return { app, busy: false };
  }

  /**
   * Is the creator's streaming app streaming (live) right now? undefined when no app is saved under Scene connections.
   * Throws when none of its saved connections answer, so a closed app is never mistaken for "stopped" after one
   * missed answer (the error says ECONNREFUSED, which the broadcast monitor treats as "closed").
   */
  public async streamingAppStreaming(): Promise<Readonly<{ app: BroadcastConnectionProvider; streaming: boolean }> | undefined> {
    const { app } = await this.streamingApp();
    if (app === undefined) return undefined;
    let lastError: unknown;
    let asked = false;
    let answered = false;
    for (const profile of await this.appProfiles(app)) {
      const target = this.createClient(profile);
      if (target.isStreaming === undefined) continue;
      asked = true;
      try { if (await withTimeout(target.isStreaming(), 10_000)) return { app, streaming: true }; answered = true; }
      catch (error) { lastError = error; }
    }
    if (!asked || answered) return { app, streaming: false };
    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    const error = new Error(`${providerLabel(app)} did not answer (ECONNREFUSED): ${detail}`) as NodeJS.ErrnoException;
    error.code = 'ECONNREFUSED';
    throw error;
  }

  /**
   * Switches on the creator's streaming app's virtual camera (OBS Virtual Camera, SprigCast Camera), which TikTok LIVE
   * Studio shows. undefined when no app is saved under Scene connections or the app has no virtual camera here (the
   * caller then keeps the old plain-OBS behaviour); false when none of its connections could switch it on.
   */
  public async streamingAppVirtualCamera(): Promise<boolean | undefined> {
    const { app } = await this.streamingApp();
    if (app === undefined) return undefined;
    let supported = false;
    for (const profile of await this.appProfiles(app)) {
      const target = this.createClient(profile);
      if (target.ensureVirtualCamera === undefined) continue;
      supported = true;
      try { if (await withTimeout(target.ensureVirtualCamera(), 10_000)) return true; } catch { /* Try the next saved connection. */ }
    }
    return supported ? false : undefined;
  }

  /**
   * The browser sources in the creator's streaming app, read through its own connection (OBS and SprigCast).
   * supported is false for an app that can't list them (Meld, Streamlabs) or none picked; connected is false when it didn't answer.
   */
  public async streamingAppBrowserSources(): Promise<Readonly<{ app?: BroadcastConnectionProvider; supported: boolean; connected: boolean; sources: readonly { readonly name: string; readonly url: string }[] }>> {
    const { app } = await this.streamingApp();
    if (app === undefined) return { supported: false, connected: false, sources: [] };
    for (const profile of await this.appProfiles(app)) {
      const target = this.createClient(profile);
      if (target.browserSources === undefined) return { app, supported: false, connected: false, sources: [] };
      try { return { app, supported: true, connected: true, sources: await withTimeout(target.browserSources(), 15_000) }; } catch { /* Try the next saved connection. */ }
    }
    return { app, supported: app === 'obs' || app === 'sprigcast', connected: false, sources: [] };
  }

  /** SprigCast's own API, when SprigCast is the creator's streaming app and connected (clips in a SprigCast video source). */
  public async sprigcastLink(): Promise<SprigCastLink | undefined> {
    const { app, connected } = await this.streamingApp();
    if (app !== 'sprigcast' || !connected.includes('sprigcast')) return undefined;
    const profiles = (await this.appProfiles('sprigcast')).filter((profile) => this.runtimes.get(profile.id)?.state === 'connected');
    for (const profile of profiles) {
      const target = this.createClient(profile);
      if (!(target instanceof SprigCastDirectSceneClient)) continue;
      try { const info = await target.info(); return { request: async (action, fields) => await target.request(action, fields), features: info.features }; } catch { /* Try the next saved connection. */ }
    }
    return undefined;
  }

  public async switchScene(sceneName: string): Promise<Readonly<{ app: BroadcastConnectionProvider; connectionName: string }>> {
    return await this.control('switch-scene', async (client) => { if (client.switchScene === undefined) throw new Error('This app cannot switch scenes here.'); await client.switchScene(sceneName); });
  }
  public async setFilter(sourceName: string, filterName: string, enabled: boolean): Promise<Readonly<{ app: BroadcastConnectionProvider; connectionName: string }>> {
    return await this.control('set-filter', async (client) => { if (client.setFilter === undefined) throw new Error('This app has no filter control.'); await client.setFilter(sourceName, filterName, enabled); });
  }
  public async stopStreaming(): Promise<Readonly<{ app: BroadcastConnectionProvider; connectionName: string }>> {
    return await this.control('stop-streaming', async (client) => { if (client.stopStreaming === undefined) throw new Error('This app cannot end the stream here.'); await client.stopStreaming(); });
  }
  public async spinSource(sourceName: string, seconds: number): Promise<Readonly<{ app: BroadcastConnectionProvider; connectionName: string }>> {
    return await this.control('spin-source', async (client) => { if (client.spinSource === undefined) throw new Error('This app cannot turn a source here.'); await client.spinSource(sourceName, seconds); });
  }
  public async runSprigCastEffect(effect: SprigCastEffect, target: string, seconds: number): Promise<Readonly<{ app: BroadcastConnectionProvider; connectionName: string }>> {
    return await this.control('sprigcast-effect', async (client) => { if (client.runEffect === undefined) throw new Error('Only SprigCast has these effects.'); await client.runEffect(effect, target, seconds); });
  }

  /** Checks each effect line (name, source, filter) against the picked streaming app. Never throws for one bad line. */
  public async checkEffects(input: unknown): Promise<Readonly<{ app?: BroadcastConnectionProvider; connected: boolean; effects: readonly Readonly<{ name: string; kind: StreamingEffectKind } & StreamingEffectCheck>[] }>> {
    const lines = effectLines(input);
    const { app, connected } = await this.streamingApp();
    if (app === undefined) return { connected: false, effects: lines.map((line) => ({ name: line.name, kind: streamingEffectKind(line.name, line.filter), status: 'unchecked', detail: 'Pick your streaming app and add it under Scene connections first.', canCreate: false })) };
    const profiles = await this.appProfiles(app);
    const client = profiles[0] === undefined ? undefined : this.createClient(profiles[0]);
    const effects = [];
    for (const line of lines) {
      const kind = streamingEffectKind(line.name, line.filter);
      if (client?.checkEffect === undefined) { effects.push({ name: line.name, kind, status: 'unchecked' as const, detail: `Add ${providerLabel(app)} under Scene connections so StreamBridge can check this.`, canCreate: false }); continue; }
      try { effects.push({ name: line.name, kind, ...await withTimeout(client.checkEffect(kind, line.source, line.filter), 10_000) }); }
      catch (error) { effects.push({ name: line.name, kind, status: 'unchecked' as const, detail: `Could not check in ${providerLabel(app)}: ${error instanceof Error ? error.message : String(error)}`, canCreate: false }); }
    }
    return { app, connected: connected.includes(app), effects };
  }

  /** "Set it up for me": creates what one effect line needs in the picked app, then checks it again. */
  public async createEffect(input: unknown): Promise<Readonly<{ app: BroadcastConnectionProvider; name: string; kind: StreamingEffectKind } & StreamingEffectCheck>> {
    const [line] = effectLines({ effects: [input] });
    if (line === undefined) throw new DirectSceneConnectionError(400, 'Send the effect name, source, and filter.');
    const { app } = await this.streamingApp();
    if (app === undefined) throw new DirectSceneConnectionError(409, 'Add your streaming app under Scene connections first.');
    const profiles = await this.appProfiles(app);
    if (profiles[0] === undefined) throw new DirectSceneConnectionError(409, `Add ${providerLabel(app)} under Scene connections first.`);
    const client = this.createClient(profiles[0]); const kind = streamingEffectKind(line.name, line.filter);
    if (client.createEffect === undefined || client.checkEffect === undefined) throw new DirectSceneConnectionError(409, `StreamBridge can't create this in ${providerLabel(app)}. Follow the steps shown instead.`);
    try { await withTimeout(client.createEffect(kind, line.source, line.filter), 15_000); return { app, name: line.name, kind, ...await withTimeout(client.checkEffect(kind, line.source, line.filter), 10_000) }; }
    catch (error) { throw new DirectSceneConnectionError(502, error instanceof Error ? error.message : String(error)); }
  }

  private async appProfiles(app: BroadcastConnectionProvider): Promise<readonly ResolvedBroadcastConnection[]> {
    const rank = (profile: ResolvedBroadcastConnection): number => (this.runtimes.get(profile.id)?.state === 'connected' ? 0 : 1);
    return (await this.profiles()).filter((profile) => profile.provider === app).sort((left, right) => rank(left) - rank(right));
  }

  public async activeProfiles(): Promise<readonly Readonly<{ id: string; name: string; provider: BroadcastConnectionProvider; url: string }>[] > {
    return (await this.profiles()).map(({ id, name, provider, url }) => ({ id, name, provider, url }));
  }

  /**
   * Takes a screenshot in OBS or Meld through a saved scene connection, trying connected profiles first.
   * Streamlabs Desktop's remote API has no screenshot call, so it is never used here.
   */
  public async takeScreenshot(request: ScreenshotRequest): Promise<ScreenshotResult> {
    // OBS and SprigCast can capture a scene (bloom) that is not on screen, or a single source; Meld cannot.
    const byName = request.target === 'named-scene' || request.target === 'source';
    if (byName && request.app === 'meld') throw new DirectSceneConnectionError(400, 'Meld Studio can only capture the scene on screen or its vertical canvas. Choose OBS Studio or SprigCast for a specific scene or source.');
    if (byName && (request.sourceName ?? '').trim() === '') throw new DirectSceneConnectionError(400, request.target === 'source' ? 'Choose which source to capture.' : 'Choose which scene to capture.');
    const providers: readonly ('obs' | 'meld' | 'sprigcast')[] = request.app !== 'auto' ? [request.app] : byName ? ['obs', 'sprigcast'] : ['obs', 'sprigcast', 'meld'];
    const rank = (profile: ResolvedBroadcastConnection): number => (this.runtimes.get(profile.id)?.state === 'connected' ? 0 : 1);
    const candidates = (await this.profiles()).filter((profile) => (providers as readonly string[]).includes(profile.provider))
      .sort((left, right) => rank(left) - rank(right) || providers.indexOf(left.provider as 'obs' | 'meld' | 'sprigcast') - providers.indexOf(right.provider as 'obs' | 'meld' | 'sprigcast'));
    if (candidates.length === 0) throw new DirectSceneConnectionError(409, request.app === 'meld' ? 'Add Meld Studio under Scene connections first.' : request.app === 'obs' ? 'Add OBS Studio under Scene connections first.' : request.app === 'sprigcast' ? 'Add SprigCast under Scene connections first.' : 'Add OBS Studio, SprigCast or Meld Studio under Scene connections first.');
    const problems: string[] = [];
    for (const profile of candidates) {
      const instance = this.createClient(profile);
      try {
        if (profile.provider === 'obs' && instance.saveScreenshot !== undefined) {
          await instance.saveScreenshot(request.filePath, byName ? request.sourceName : undefined);
          return { app: 'obs', connectionName: profile.name, savedTo: request.filePath };
        }
        if (profile.provider === 'sprigcast' && instance.saveScreenshot !== undefined) {
          await instance.saveScreenshot(request.filePath, byName ? request.sourceName : undefined, request.target === 'vertical', request.target === 'named-scene' ? 'scene' : 'source');
          return { app: 'sprigcast', connectionName: profile.name, savedTo: request.filePath };
        }
        if (profile.provider === 'meld' && instance.takeScreenshot !== undefined) {
          await instance.takeScreenshot(request.target === 'vertical');
          return { app: 'meld', connectionName: profile.name };
        }
      } catch (error) { problems.push(`${profile.name}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    throw new DirectSceneConnectionError(502, `The screenshot could not be taken. ${problems.join(' · ')}`.trim());
  }

  /**
   * "Add all to OBS": puts StreamBridge's overlay browser sources into one OBS scene of their own, so the
   * creator can nest that scene in theirs. Only StreamBridge overlay links on this PC are accepted, and
   * existing scenes and sources are never changed.
   */
  public async addOverlaySources(input: unknown): Promise<ObsBrowserSourceResult & { readonly connectionName: string }> {
    const request = input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const sceneName = typeof request['sceneName'] === 'string' && request['sceneName'].trim() !== '' ? request['sceneName'].trim().slice(0, 100) : 'StreamBridge Overlays';
    const list = Array.isArray(request['sources']) ? request['sources'] : [];
    if (list.length === 0 || list.length > 80) throw new DirectSceneConnectionError(400, 'Send between 1 and 80 overlay sources.');
    const sources = list.map((entry) => overlaySourceRequest(entry));
    const app = overlayToolApp(request['app']);
    return await this.firstObs(app === 'sprigcast' ? 'SprigCast did not add the overlays.' : app === 'streamlabs' ? 'Streamlabs Desktop did not add the overlays.' : 'OBS did not add the overlays.', async (instance) => instance.addBrowserSources === undefined ? undefined : await instance.addBrowserSources(sceneName, sources, request['shareExisting'] === true), app);
  }

  /** Sets "Shutdown source when not visible" on the StreamBridge overlays that are safe to pause, in the first OBS that answers. */
  public async pauseHiddenOverlaySources(input?: unknown): Promise<ObsPowerSavingResult & { readonly connectionName: string }> {
    return await this.firstObs('OBS did not change the overlays.', async (instance) => instance.pauseHiddenOverlaySources === undefined ? undefined : await instance.pauseHiddenOverlaySources(), pickedOverlayApp(input));
  }

  /** Undoes Save power in the first OBS that answers. */
  public async resumeHiddenOverlaySources(input?: unknown): Promise<ObsPowerSavingResult & { readonly connectionName: string }> {
    return await this.firstObs('OBS did not change the overlays.', async (instance) => instance.resumeHiddenOverlaySources === undefined ? undefined : await instance.resumeHiddenOverlaySources(), pickedOverlayApp(input));
  }

  /** Removes StreamBridge's starter scenes. Only scene names starting with "StreamBridge " are accepted, so the creator's own scenes are safe. */
  public async removeStarterScenes(input: unknown): Promise<{ readonly removed: readonly string[]; readonly missing: readonly string[]; readonly connectionName: string }> {
    const request = input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const names = Array.isArray(request['sceneNames']) ? request['sceneNames'] : [];
    if (names.length === 0 || names.length > 12 || !names.every((name) => typeof name === 'string' && /^StreamBridge [^\n]{1,80}$/u.test(name))) throw new DirectSceneConnectionError(400, 'Only StreamBridge starter scenes can be removed here.');
    const app = overlayToolApp(request['app']);
    return await this.firstObs(app === 'sprigcast' ? 'SprigCast did not remove the blooms.' : app === 'streamlabs' ? 'Streamlabs Desktop did not remove the scenes.' : 'OBS did not remove the scenes.', async (instance) => instance.removeScenes === undefined ? undefined : await instance.removeScenes(names as string[]), app);
  }

  /**
   * Runs on the first OBS (and, with withSprigCast, SprigCast) connection that answers, connected ones first.
   * With 'obs' or 'sprigcast' only that app is used (the streaming app the creator picked).
   */
  private async firstObs<T extends object>(failure: string, run: (instance: DirectSceneConnectionClient) => Promise<T | undefined>, withSprigCast: boolean | 'obs' | 'sprigcast' | 'streamlabs' = false): Promise<T & { readonly connectionName: string }> {
    const rank = (profile: ResolvedBroadcastConnection): number => (this.runtimes.get(profile.id)?.state === 'connected' ? 0 : 1);
    const wanted = withSprigCast === 'obs' || withSprigCast === false ? ['obs'] : withSprigCast === 'sprigcast' ? ['sprigcast'] : withSprigCast === 'streamlabs' ? ['streamlabs'] : ['obs', 'sprigcast'];
    const profiles = (await this.profiles()).filter((profile) => wanted.includes(profile.provider)).sort((left, right) => rank(left) - rank(right));
    if (profiles.length === 0) throw new DirectSceneConnectionError(409, wanted.length === 2 ? 'Connect OBS or SprigCast first (Core setup › Scene connections), then try again.' : wanted[0] === 'sprigcast' ? 'Connect SprigCast first (Core setup › Scene connections), then try again.' : wanted[0] === 'streamlabs' ? 'Connect Streamlabs Desktop first (Core setup › Scene connections), then try again.' : 'Connect OBS first (Core setup › Scene connections), then try again.');
    const problems: string[] = [];
    for (const profile of profiles) {
      try { const result = await run(this.createClient(profile)); if (result !== undefined) return { ...result, connectionName: profile.name }; }
      catch (error) { const message = error instanceof Error ? error.message : String(error); problems.push(`${profile.name}: ${/ECONNREFUSED|closed before/u.test(message) ? (profile.provider === 'sprigcast' ? 'SprigCast is not open, or its API is off (Settings › Connections).' : profile.provider === 'streamlabs' ? 'Streamlabs Desktop is not open, or Remote Control is off (Settings › Remote Control).' : 'OBS is not open, or its WebSocket server is off (Tools › WebSocket Server Settings).') : message}`); }
    }
    throw new DirectSceneConnectionError(502, `${failure} ${problems.join(' · ')}`.trim());
  }

  /** Connected apps that can take screenshots, and the OBS source names a screenshot can capture. */
  public async screenshotOptions(): Promise<Readonly<{ apps: readonly Readonly<{ provider: BroadcastConnectionProvider; name: string; connected: boolean; canScreenshot: boolean }>[]; obsScenes: readonly string[]; obsSources: readonly string[] }>> {
    const profiles = await this.profiles();
    const apps = profiles.map((profile) => ({ provider: profile.provider, name: profile.name, connected: this.runtimes.get(profile.id)?.state === 'connected', canScreenshot: profile.provider !== 'streamlabs' }));
    let obsScenes: readonly string[] = []; let obsSources: readonly string[] = [];
    // OBS first, then SprigCast: both can picture one named scene (bloom) or source.
    for (const profile of [...profiles.filter((candidate) => candidate.provider === 'obs'), ...profiles.filter((candidate) => candidate.provider === 'sprigcast')]) {
      try {
        const instance = this.createClient(profile);
        obsScenes = (await instance.getSceneList()).scenes;
        obsSources = await instance.listSources?.() ?? [];
        break;
      } catch { /* try the next OBS profile */ }
    }
    return { apps, obsScenes, obsSources };
  }

  public async refresh(provider: BroadcastConnectionProvider, connectionIndex: number): Promise<DirectSceneSnapshot | undefined> {
    const profile = (await this.profiles()).filter((connection) => connection.provider === provider)[connectionIndex];
    if (profile === undefined) return undefined;
    const startedAt = Date.now(); const snapshot = await catalogSnapshot(this.createClient(profile)); this.recordSnapshot(profile, Date.now() - startedAt, snapshot.scenes.length); return snapshot;
  }

  public async testCandidate(profile: ResolvedBroadcastConnection): Promise<Readonly<Record<string, unknown>>> { return await this.runTest(profile, 0, false); }

  public async discover(input?: unknown): Promise<Readonly<Record<string, unknown>>> {
    const profiles = await this.profiles();
    const request = input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const customRequested = request['port'] !== undefined || request['provider'] !== undefined;
    let candidates: Array<{ provider: BroadcastConnectionProvider; url: string; credentialRequired: boolean }>;
    if (customRequested) {
      const provider = request['provider']; const port = request['port'];
      if (!isProvider(provider)) throw new DirectSceneConnectionError(400, 'Choose OBS, Meld, Streamlabs, or SprigCast for custom discovery.');
      if (!Number.isInteger(port) || (port as number) < 1 || (port as number) > 65_535) throw new DirectSceneConnectionError(400, 'Custom discovery requires one port from 1 through 65535. Port ranges are not allowed.');
      candidates = [{ provider, url: `ws://127.0.0.1:${String(port)}${providerPath(provider)}`, credentialRequired: provider !== 'meld' }];
    } else candidates = [{ provider: 'obs', url: 'ws://127.0.0.1:4455', credentialRequired: true }, { provider: 'meld', url: 'ws://127.0.0.1:13376', credentialRequired: false }, { provider: 'streamlabs', url: 'ws://127.0.0.1:59650/api/websocket', credentialRequired: true }, ...sprigcastDiscoveryPorts().map((sprigPort) => ({ provider: 'sprigcast' as const, url: `ws://127.0.0.1:${String(sprigPort)}/sprigcast`, credentialRequired: sprigcastConnectionFile()?.passwordSet === true }))];
    // OBS and SprigCast can share a port number in turn, so SprigCast counts as found only when its own API says hello.
    const discovered = await Promise.all(candidates.map(async (candidate) => { const profile: ResolvedBroadcastConnection = { id: `discovery-${candidate.provider}`, name: `${providerLabel(candidate.provider)} discovery`, provider: candidate.provider, url: candidate.url, enabled: true, hasCredential: false, credential: '' }; const application = await this.applicationState?.(profile).catch(() => undefined); return { ...candidate, listening: candidate.provider === 'sprigcast' ? await sprigcastAnswers(candidate.url) : await portListening(new URL(candidate.url)), profileConfigured: profiles.some((saved) => saved.provider === candidate.provider && saved.url === candidate.url), application: application === undefined ? { configured: false, running: false } : application }; }));
    return { scannedAt: new Date().toISOString(), mutationFree: true, scope: customRequested ? 'single-explicit-loopback-port' : 'documented-loopback-defaults-only', candidates: discovered };
  }

  public async recordAcceptance(results: readonly Readonly<Record<string, unknown>>[]): Promise<Readonly<Record<string, unknown>>> {
    const receipt: AcceptanceReceipt = { checkedAt: new Date().toISOString(), results: results.flatMap((result) => sanitizeAcceptanceResult(result)) };
    const previous = this.acceptanceComparisonReceipt(true);
    this.acceptanceReceipts = [...this.acceptanceReceipts, receipt].slice(-50);
    await this.writeAcceptanceReceipts();
    return { receipt, comparison: compareAcceptance(previous, receipt), receiptCount: this.acceptanceReceipts.length };
  }

  public async approveAcceptanceBaseline(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const request = input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    if (request['approvedByCreator'] !== true) throw new DirectSceneConnectionError(403, 'Explicit creator approval is required to replace the acceptance baseline.');
    const latest = this.acceptanceReceipts.at(-1);
    if (latest === undefined) throw new DirectSceneConnectionError(409, 'Run installed-app acceptance before approving a baseline.');
    this.acceptanceBaseline = { approvedAt: new Date().toISOString(), receiptCheckedAt: latest.checkedAt };
    await this.writeAcceptanceBaseline();
    return { approved: true, baseline: this.acceptanceBaseline, comparison: compareAcceptance(latest, latest) };
  }

  public async conflictAssistant(): Promise<Readonly<Record<string, unknown>>> {
    const profiles = await this.profiles();
    const issues: Readonly<Record<string, unknown>>[] = [];
    const ports = new Map<number, ResolvedBroadcastConnection[]>();
    for (const profile of profiles) { const port = Number(new URL(profile.url).port); ports.set(port, [...(ports.get(port) ?? []), profile]); }
    for (const [port, selected] of ports) if (selected.length > 1) issues.push({ type: 'duplicate-port', severity: 'warning', port, profileIds: selected.map(({ id }) => id), profileNames: selected.map(({ name }) => name), guidance: 'Give each running broadcast application its own WebSocket port, then retest each profile.' });
    for (const profile of profiles) {
      const state = await this.applicationState?.(profile).catch(() => undefined);
      if (state?.differentInstallationProcessId !== undefined) issues.push({ type: 'wrong-installation', severity: 'error', profileId: profile.id, profileName: profile.name, provider: profile.provider, processId: state.differentInstallationProcessId, guidance: 'Close the other installation or reselect the executable that owns this WebSocket port.' });
    }
    return { checkedAt: new Date().toISOString(), mutationFree: true, ready: issues.length === 0, issues };
  }

  public async suggestUnusedPorts(input: unknown): Promise<Readonly<Record<string, unknown>>> { const request = input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}; const provider = request['provider']; if (!isProvider(provider)) throw new DirectSceneConnectionError(400, 'Choose OBS, Meld, Streamlabs, or SprigCast for port suggestions.'); const profiles = await this.profiles(); const used = new Set(profiles.map((profile) => Number(new URL(profile.url).port))); const start = provider === 'obs' || provider === 'sprigcast' ? 4455 : provider === 'meld' ? 13_376 : 59_650; const suggestions: number[] = []; for (let port = start; port < start + 50 && suggestions.length < 5; port += 1) if (!used.has(port) && !await portListening(new URL(`ws://127.0.0.1:${String(port)}`))) suggestions.push(port); return { checkedAt: new Date().toISOString(), mutationFree: true, provider, suggestions, excludedSavedPorts: [...used].sort((left, right) => left - right) }; }

  public async captureReliabilitySnapshot(): Promise<Readonly<Record<string, unknown>>> { const status = this.status(); const profiles = Array.isArray(status['connections']) ? (status['connections'] as Readonly<Record<string, unknown>>[]).map((profile) => ({ name: profile['name'], provider: profile['provider'], state: profile['state'], reconnectCount: profile['reconnectCount'], lastLatencyMs: profile['lastLatencyMs'], reliability: profile['reliability'] })) : []; const snapshot: ReliabilitySnapshot = { capturedAt: new Date().toISOString(), profiles }; const previous = this.reliabilitySnapshots.at(-1); this.reliabilitySnapshots = [...this.reliabilitySnapshots, snapshot].slice(-30); await this.writeReliabilitySnapshots(); return { current: snapshot, comparison: compareReliabilitySnapshots(previous, snapshot), snapshotCount: this.reliabilitySnapshots.length }; }

  public reliabilityHistory(): Readonly<Record<string, unknown>> {
    const snapshots = this.reliabilitySnapshots.map((snapshot, index) => ({
      ...snapshot,
      comparison: compareReliabilitySnapshots(index === 0 ? undefined : this.reliabilitySnapshots[index - 1], snapshot)
    })).reverse();
    return { redacted: true, snapshotCount: snapshots.length, snapshots };
  }

  public async test(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const request = input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const provider = request['provider']; if (!isProvider(provider)) throw new DirectSceneConnectionError(400, 'provider must be obs, meld, streamlabs, or sprigcast.');
    const connectionIndex = request['connectionIndex'] ?? 0; if (!Number.isInteger(connectionIndex) || (connectionIndex as number) < 0 || (connectionIndex as number) > 23) throw new DirectSceneConnectionError(400, 'connectionIndex must be an integer from 0 through 23.');
    const profile = (await this.profiles()).filter((connection) => connection.provider === provider)[connectionIndex as number];
    if (profile === undefined) return { available: false, provider, connectionIndex, transport: 'streamerbot-fallback', message: 'No enabled native connection profile is saved. Streamer.bot fallback remains available when configured.' };
    const result = await this.runTest(profile, connectionIndex as number);
    if (result['available'] === true && profile.hasCredential) await this.vault.markCredentialVerified(profile.id);
    return result;
  }

  public status(): Readonly<Record<string, unknown>> {
    const runtimes = [...this.runtimes.values()];
    const issues = runtimes.filter((runtime) => runtime.state !== 'paused' && ((runtime.state === 'reconnecting' && runtime.reconnectCount >= WARNING_RECONNECT_THRESHOLD) || (runtime.lastLatencyMs ?? 0) >= (runtime.profile.latencyWarningMs ?? WARNING_LATENCY_MS)));
    const attention = issues.length === 0 ? { level: 'ready', affectedConnections: 0, message: 'Native scene connections are within reconnect and latency thresholds.' } : { level: 'warning', affectedConnections: issues.length, reconnectThreshold: WARNING_RECONNECT_THRESHOLD, latencyThresholdMs: WARNING_LATENCY_MS, message: `${String(issues.length)} native scene connection${issues.length === 1 ? '' : 's'} need attention due to repeated reconnects or latency of ${String(WARNING_LATENCY_MS)} ms or more.` };
    const trends = connectionTrends(this.events); const reliability = reliabilityScores(runtimes, trends, this.acceptanceReceipts.at(-1)); const reliabilityAlerts = this.sustainedReliabilityAlerts(reliability, runtimes);
    const latest = this.acceptanceReceipts.at(-1); const comparisonReceipt = this.acceptanceComparisonReceipt();
    return { subscriptionsActive: this.controller !== undefined && !this.controller.signal.aborted, attention, trends, strictGate: this.strictGate(), reliability: { profiles: reliability, alerts: reliabilityAlerts }, acceptance: { receiptCount: this.acceptanceReceipts.length, latest, approvedBaseline: this.acceptanceBaseline, comparison: compareAcceptance(comparisonReceipt, latest) }, notification: { ...notificationSummary(runtimes, trends), reliabilitySignature: reliabilityAlerts.filter((item) => item.alerting === true).map((item) => `${String(item.connectionId)}:${String(item.score)}`).join('|'), reliabilityBreaches: reliabilityAlerts.filter((item) => item.alerting === true) }, connections: runtimes.map((runtime) => ({ id: runtime.profile.id, name: runtime.profile.name, provider: runtime.profile.provider, url: runtime.profile.url, hasCredential: runtime.profile.hasCredential, maintenanceUntil: runtime.profile.maintenanceUntil, maintenanceReason: runtime.profile.maintenanceReason, latencyWarningMs: runtime.profile.latencyWarningMs ?? WARNING_LATENCY_MS, state: runtime.state, reconnectCount: runtime.reconnectCount, lastLatencyMs: runtime.lastLatencyMs, lastConnectedAt: runtime.lastConnectedAt, lastSnapshotAt: runtime.lastSnapshotAt, lastError: runtime.lastError, pauseReason: runtime.pauseReason, applicationExecutableName: runtime.applicationExecutableName, applicationProcessId: runtime.applicationProcessId, differentInstallationProcessId: runtime.differentInstallationProcessId, reliability: reliability.find((score) => score.connectionId === runtime.profile.id) })), events: this.events };
  }

  private sustainedReliabilityAlerts(scores: readonly Readonly<Record<string, unknown>>[], runtimes: readonly ConnectionRuntime[]): readonly Readonly<Record<string, unknown>>[] { const now = Date.now(); const requiredMs = this.vault.reliabilityPolicy().sustainedAlertMinutes * 60_000; const active = new Set(runtimes.map((runtime) => runtime.profile.id)); for (const id of this.degradationSince.keys()) if (!active.has(id)) this.degradationSince.delete(id); return scores.flatMap((score) => { const id = String(score['connectionId']); const runtime = runtimes.find((item) => item.profile.id === id); const degraded = typeof score['score'] === 'number' && score['score'] < 90 && runtime?.profile.maintenanceUntil === undefined; if (!degraded) { this.degradationSince.delete(id); return []; } const since = this.degradationSince.get(id) ?? now; this.degradationSince.set(id, since); return [{ connectionId: id, connectionName: score['connectionName'], provider: score['provider'], score: score['score'], degradedSince: new Date(since).toISOString(), sustainedMinutes: Math.floor((now - since) / 60_000), requiredMinutes: this.vault.reliabilityPolicy().sustainedAlertMinutes, alerting: now - since >= requiredMs }]; }); }

  private strictGate(): Readonly<Record<string, unknown>> {
    const policy = this.vault.reliabilityPolicy();
    if (!policy.strictMode) return { enabled: false, ready: true, blockers: [], message: 'Strict pre-stream freshness gating is off.' };
    const now = Date.now(); const blockers: Readonly<Record<string, unknown>>[] = []; const latest = this.acceptanceReceipts.at(-1);
    if (latest === undefined || now - Date.parse(latest.checkedAt) > policy.acceptanceMaxAgeDays * 86_400_000) blockers.push({ type: 'acceptance-stale', message: `Installed-app acceptance must be run within ${String(policy.acceptanceMaxAgeDays)} day(s).` });
    const connections = this.vault.status()['connections'];
    if (Array.isArray(connections)) for (const value of connections) { const profile = value as BroadcastConnectionProfileLike; if (!profile.enabled || !profile.hasCredential) continue; if (typeof profile.credentialVerifiedAt !== 'string' || now - Date.parse(profile.credentialVerifiedAt) > policy.credentialMaxAgeDays * 86_400_000) blockers.push({ type: 'credential-stale', profileId: profile.id, profileName: profile.name, message: `Retest ${profile.name} to refresh credential verification.` }); }
    return { enabled: true, ready: blockers.length === 0, policy, blockers, message: blockers.length === 0 ? 'Strict connection freshness requirements are satisfied.' : `${String(blockers.length)} strict connection freshness requirement(s) need attention.` };
  }

  private async runTest(profile: ResolvedBroadcastConnection, connectionIndex: number, record = true): Promise<Readonly<Record<string, unknown>>> { const startedAt = Date.now(); try { const snapshot = await this.createClient(profile).getSceneList(); const latencyMs = Date.now() - startedAt; if (record) { this.recordSnapshot(profile, latencyMs, snapshot.scenes.length); this.recordEvent(profile, 'test-succeeded', { latencyMs, sceneCount: snapshot.scenes.length }); } return { available: true, provider: profile.provider, connectionIndex, connectionId: profile.id, connectionName: profile.name, transport: 'direct-websocket', sceneCount: snapshot.scenes.length, currentScene: snapshot.currentScene, latencyMs, message: `Direct ${providerLabel(profile.provider)} WebSocket connected and returned ${String(snapshot.scenes.length)} scene(s).` }; } catch (error) { if (record) { this.recordError(profile, error); this.recordEvent(profile, 'test-failed', { detail: safeError(error, profile) }); } return { available: false, provider: profile.provider, connectionIndex, connectionId: profile.id, connectionName: profile.name, transport: 'streamerbot-fallback', message: `Native connection failed: ${safeError(error, profile)} Streamer.bot fallback remains available when configured.` }; } }

  private async profiles(): Promise<readonly ResolvedBroadcastConnection[]> {
    const stored = await this.vault.resolved(); const configured = new Set(stored.map((profile) => profile.provider)); return [...stored, ...this.environmentDefaults.filter((profile) => !configured.has(profile.provider))];
  }

  private async watchLoop(profile: ResolvedBroadcastConnection, signal: AbortSignal): Promise<void> {
    let failures = 0;
    while (!signal.aborted) {
      if (profile.maintenanceUntil !== undefined && Date.parse(profile.maintenanceUntil) > Date.now()) { this.pauseForMaintenance(profile); await delay(Math.min(this.pausePollMs, Math.max(250, Date.parse(profile.maintenanceUntil) - Date.now())), undefined, { signal }).catch(() => undefined); continue; }
      const application = await this.applicationState?.(profile).catch(() => ({ configured: false, running: true }));
      this.recordApplication(profile, application);
      if (application?.configured === true && !application.running) {
        this.pause(profile);
        await delay(this.pausePollMs, undefined, { signal }).catch(() => undefined);
        continue;
      }
      this.resume(profile);
      try {
        this.setState(profile, 'connecting'); const instance = this.createClient(profile); const startedAt = Date.now(); const snapshot = await catalogSnapshot(instance); this.recordSnapshot(profile, Date.now() - startedAt, snapshot.scenes.length); this.lastSnapshotSignatures.set(profile.id, snapshotSignature(snapshot)); this.listener?.(profile.provider, snapshot); this.setState(profile, 'connected'); failures = 0;
        const applicationClosed = await this.watchUntilApplicationCloses(profile, instance, signal);
        if (applicationClosed) continue;
      } catch (error) { if (isActive(signal)) { failures += 1; this.recordError(profile, error); this.setState(profile, 'reconnecting'); } }
      if (isActive(signal)) await delay(Math.min(30_000, 1_000 * 2 ** Math.min(failures, 5)), undefined, { signal }).catch(() => undefined);
    }
    this.setState(profile, 'stopped'); this.recordEvent(profile, 'stopped');
  }

  private async refreshAfterEvent(profile: ResolvedBroadcastConnection, instance: DirectSceneConnectionClient): Promise<void> { if (this.refreshes.has(profile.id)) return; this.refreshes.add(profile.id); const startedAt = Date.now(); try { const updated = await catalogSnapshot(instance); const signature = snapshotSignature(updated); const changed = this.lastSnapshotSignatures.get(profile.id) !== signature; this.lastSnapshotSignatures.set(profile.id, signature); this.recordSnapshot(profile, Date.now() - startedAt, updated.scenes.length, changed); if (changed) this.listener?.(profile.provider, updated); } catch (error) { this.recordError(profile, error); } finally { this.refreshes.delete(profile.id); } }
  private async watchUntilApplicationCloses(profile: ResolvedBroadcastConnection, instance: DirectSceneConnectionClient, signal: AbortSignal): Promise<boolean> {
    if (this.applicationState === undefined) { await instance.watchChanges(() => { void this.refreshAfterEvent(profile, instance); }, signal); return false; }
    const local = new AbortController(); const stop = () => local.abort(); signal.addEventListener('abort', stop, { once: true });
    try {
      const watching = instance.watchChanges(() => { void this.refreshAfterEvent(profile, instance); }, local.signal);
      const applicationClosed = this.waitForApplicationClose(profile, local.signal);
      const outcome = await Promise.race([watching.then(() => 'watch-ended' as const), applicationClosed.then(() => 'application-closed' as const)]);
      local.abort(); await Promise.allSettled([watching, applicationClosed]);
      return outcome === 'application-closed' && isActive(signal);
    } finally { signal.removeEventListener('abort', stop); local.abort(); }
  }
  private async waitForApplicationClose(profile: ResolvedBroadcastConnection, signal: AbortSignal): Promise<void> {
    while (isActive(signal)) {
      await delay(this.connectedProbeMs, undefined, { signal }).catch(() => undefined);
      if (!isActive(signal)) return;
      const application = await this.applicationState?.(profile).catch(() => ({ configured: false, running: true }));
      if (application?.configured === true && !application.running) return;
    }
  }
  private pause(profile: ResolvedBroadcastConnection): void { const current = this.runtimes.get(profile.id); if (current?.state === 'paused') return; this.runtimes.set(profile.id, { ...(current ?? { profile, reconnectCount: 0 }), state: 'paused', pauseReason: `${providerLabel(profile.provider)} is not running. The native subscription will resume automatically after the app opens.` }); this.recordEvent(profile, 'paused', { detail: 'Application process is not running; reconnect attempts are paused.' }); }
  private pauseForMaintenance(profile: ResolvedBroadcastConnection): void { const current = this.runtimes.get(profile.id); const reason = `Maintenance snoozed until ${new Date(profile.maintenanceUntil ?? '').toLocaleString()}${profile.maintenanceReason === undefined ? '' : `: ${profile.maintenanceReason}`}.`; if (current?.state === 'paused' && current.pauseReason === reason) return; this.runtimes.set(profile.id, { ...(current ?? { profile, reconnectCount: 0 }), state: 'paused', pauseReason: reason }); this.recordEvent(profile, 'paused', { detail: 'Creator-approved maintenance snooze is active; reconnect and reliability alerts are paused.' }); }
  private recordApplication(profile: ResolvedBroadcastConnection, application: DirectSceneApplicationState | undefined): void { if (application === undefined) return; const current = this.runtimes.get(profile.id) ?? { profile, state: 'connecting' as const, reconnectCount: 0 }; const next: ConnectionRuntime = { ...current, ...(application.executableName === undefined ? {} : { applicationExecutableName: application.executableName }), ...(application.processId === undefined ? {} : { applicationProcessId: application.processId }), ...(application.differentInstallationProcessId === undefined ? {} : { differentInstallationProcessId: application.differentInstallationProcessId }) }; if (application.processId === undefined) delete next.applicationProcessId; if (application.differentInstallationProcessId === undefined) delete next.differentInstallationProcessId; this.runtimes.set(profile.id, next); }
  private resume(profile: ResolvedBroadcastConnection): void { const current = this.runtimes.get(profile.id); if (current?.state !== 'paused') return; const next: ConnectionRuntime = { ...current, state: 'connecting' }; delete next.pauseReason; this.runtimes.set(profile.id, next); this.recordEvent(profile, 'resumed', { detail: 'Application process detected; native subscription is resuming.' }); }
  private setState(profile: ResolvedBroadcastConnection, state: ConnectionRuntime['state']): void { const current = this.runtimes.get(profile.id) ?? { profile, state, reconnectCount: 0 }; const next: ConnectionRuntime = { ...current, state, ...(state === 'connected' ? { lastConnectedAt: new Date().toISOString() } : {}) }; if (state === 'connected') delete next.lastError; this.runtimes.set(profile.id, next); }
  /** Unchanged confirmation snapshots update the live runtime only; the persisted history records changes. */
  private recordSnapshot(profile: ResolvedBroadcastConnection, latencyMs: number, sceneCount: number, changed = true): void { const current = this.runtimes.get(profile.id) ?? { profile, state: 'connected' as const, reconnectCount: 0 }; const next: ConnectionRuntime = { ...current, state: 'connected', lastConnectedAt: current.lastConnectedAt ?? new Date().toISOString(), lastSnapshotAt: new Date().toISOString(), lastLatencyMs: latencyMs }; delete next.lastError; this.runtimes.set(profile.id, next); if (changed || current.lastSnapshotAt === undefined || current.lastError !== undefined) this.recordEvent(profile, current.lastSnapshotAt === undefined ? 'connected' : 'snapshot', { latencyMs, sceneCount }); }
  private recordError(profile: ResolvedBroadcastConnection, error: unknown): void { const current = this.runtimes.get(profile.id) ?? { profile, state: 'reconnecting' as const, reconnectCount: 0 }; const detail = safeError(error, profile); this.runtimes.set(profile.id, { ...current, reconnectCount: current.reconnectCount + 1, lastError: detail }); this.recordEvent(profile, 'reconnecting', { detail }); }
  private async stopWatchers(): Promise<void> { this.controller?.abort(); this.controller = undefined; await Promise.allSettled(this.tasks); this.tasks = []; }
  private recordEvent(profile: ResolvedBroadcastConnection, type: ConnectionEvent['type'], detail: Pick<ConnectionEvent, 'latencyMs' | 'sceneCount' | 'detail'> = {}): void { this.events = [...this.events, { timestamp: new Date().toISOString(), connectionId: profile.id, connectionName: profile.name, provider: profile.provider, type, ...detail }].slice(-MAXIMUM_EVENTS); this.queueHistoryWrite(); }
  private async loadHistory(): Promise<void> { if (this.historyPath === undefined) return; try { const value = JSON.parse(await readFile(this.historyPath, 'utf8')) as unknown; if (Array.isArray(value)) this.events = value.flatMap(parseEvent).slice(-MAXIMUM_EVENTS); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.events = []; } }
  private async loadAcceptanceReceipts(): Promise<void> { const path = this.acceptanceHistoryPath(); if (path === undefined) return; try { const value = JSON.parse(await readFile(path, 'utf8')) as unknown; if (Array.isArray(value)) this.acceptanceReceipts = value.flatMap(parseAcceptanceReceipt).slice(-50); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.acceptanceReceipts = []; } }
  private async loadAcceptanceBaseline(): Promise<void> { const path = this.acceptanceBaselinePath(); if (path === undefined) return; try { const value = JSON.parse(await readFile(path, 'utf8')) as unknown; if (value !== null && typeof value === 'object' && !Array.isArray(value)) { const item = value as Record<string, unknown>; if (item['version'] === 1 && typeof item['approvedAt'] === 'string' && typeof item['receiptCheckedAt'] === 'string' && Number.isFinite(Date.parse(item['approvedAt'])) && Number.isFinite(Date.parse(item['receiptCheckedAt']))) this.acceptanceBaseline = { approvedAt: item['approvedAt'], receiptCheckedAt: item['receiptCheckedAt'] }; } } catch { this.acceptanceBaseline = undefined; } }
  private acceptanceComparisonReceipt(forNewReceipt = false): AcceptanceReceipt | undefined { return this.acceptanceBaseline === undefined ? this.acceptanceReceipts.at(forNewReceipt ? -1 : -2) : this.acceptanceReceipts.findLast((receipt) => receipt.checkedAt === this.acceptanceBaseline?.receiptCheckedAt) ?? this.acceptanceReceipts.at(forNewReceipt ? -1 : -2); }
  private acceptanceHistoryPath(): string | undefined { return this.historyPath === undefined ? undefined : join(dirname(this.historyPath), 'broadcast-acceptance-receipts.json'); }
  private acceptanceBaselinePath(): string | undefined { return this.historyPath === undefined ? undefined : join(dirname(this.historyPath), 'broadcast-acceptance-baseline.json'); }
  private reliabilitySnapshotsPath(): string | undefined { return this.historyPath === undefined ? undefined : join(dirname(this.historyPath), 'broadcast-reliability-snapshots.json'); }
  private async writeAcceptanceReceipts(): Promise<void> { const path = this.acceptanceHistoryPath(); if (path === undefined) return; await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.${String(process.pid)}.tmp`; await writeFile(temporary, `${JSON.stringify(this.acceptanceReceipts, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 }); await rename(temporary, path); }
  private async writeAcceptanceBaseline(): Promise<void> { const path = this.acceptanceBaselinePath(); if (path === undefined || this.acceptanceBaseline === undefined) return; await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.${String(process.pid)}.tmp`; await writeFile(temporary, `${JSON.stringify({ version: 1, ...this.acceptanceBaseline }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 }); await rename(temporary, path); }
  private async loadReliabilitySnapshots(): Promise<void> { const path = this.reliabilitySnapshotsPath(); if (path === undefined) return; try { const value = JSON.parse(await readFile(path, 'utf8')) as unknown; if (Array.isArray(value)) this.reliabilitySnapshots = value.flatMap(parseReliabilitySnapshot).slice(-30); } catch { this.reliabilitySnapshots = []; } }
  private async writeReliabilitySnapshots(): Promise<void> { const path = this.reliabilitySnapshotsPath(); if (path === undefined) return; await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.${String(process.pid)}.tmp`; await writeFile(temporary, `${JSON.stringify(this.reliabilitySnapshots, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 }); await rename(temporary, path); }
  private queueHistoryWrite(): void { if (this.historyPath === undefined) return; const snapshot = this.events; this.eventWrites = this.eventWrites.then(async () => { await mkdir(dirname(this.historyPath as string), { recursive: true }); const temporary = `${this.historyPath as string}.${String(process.pid)}.tmp`; await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 }); await rename(temporary, this.historyPath as string); }).catch(() => undefined); }
}

function overlaySourceRequest(entry: unknown): ObsBrowserSourceRequest {
  const value = entry !== null && typeof entry === 'object' && !Array.isArray(entry) ? entry as Record<string, unknown> : {};
  const name = typeof value['name'] === 'string' ? value['name'].trim().slice(0, 100) : '';
  const width = value['width']; const height = value['height'];
  let url: URL | undefined;
  try { url = typeof value['url'] === 'string' ? new URL(value['url']) : undefined; } catch { url = undefined; }
  const local = url?.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/overlay/');
  if (url === undefined || name === '' || !local || !Number.isInteger(width) || !Number.isInteger(height) || (width as number) < 50 || (width as number) > 7680 || (height as number) < 50 || (height as number) > 7680) {
    throw new DirectSceneConnectionError(400, 'Each overlay needs a name, a StreamBridge overlay link on this PC, and a width and height from 50 to 7680.');
  }
  const placement = OBS_PLACEMENTS.find((entry) => entry === value['placement']);
  return { name, url: url.href, width: width as number, height: height as number, ...(placement === undefined ? {} : { placement }) };
}

export class DirectSceneConnectionError extends Error { public constructor(public readonly statusCode: number, message: string) { super(message); } }

function client(profile: ResolvedBroadcastConnection): DirectSceneConnectionClient {
  if (profile.provider === 'obs') return new ObsDirectSceneClient(profile.url, profile.credential, 4_000, profile.id, profile.name);
  if (profile.provider === 'meld') return new MeldDirectSceneClient(profile.url, 4_000, profile.id, profile.name);
  // SprigCast moves to 4456 when OBS holds 4455: its connection.json says where it listens right now.
  if (profile.provider === 'sprigcast') return new SprigCastDirectSceneClient(sprigcastLiveUrl(profile.url, sprigcastConnectionFile()), profile.credential, 4_000, profile.id, profile.name);
  return new StreamlabsDirectSceneClient(profile.url, profile.credential, 4_000, profile.id, profile.name);
}
function snapshotSignature(snapshot: DirectSceneSnapshot): string { return JSON.stringify([snapshot.connectionId, snapshot.connectionName, snapshot.scenes, snapshot.currentScene ?? null, snapshot.groups ?? null]); }
function safeError(error: unknown, profile?: Pick<ResolvedBroadcastConnection, 'provider' | 'url'>): string {
  const message = (error instanceof Error ? error.message : String(error)).replaceAll(/\b(?:password|token|secret)\s*[:=]\s*\S+/giu, '[REDACTED]').slice(0, 500);
  return profile === undefined ? message : plainConnectMessage(profile.provider, profile.url, message);
}
/** "connect ECONNREFUSED 127.0.0.1:4455" in plain words: which app isn't answering, and where to turn it on. */
export function plainConnectMessage(provider: BroadcastConnectionProvider, url: string, message: string): string {
  if (!/ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|socket hang up/iu.test(message)) return message;
  if (provider === 'sprigcast') return sprigcastConnectMessage(message, url);
  if (provider === 'obs') { const own = readObsWebSocketSettings(); return own?.enabled === false ? OBS_SERVER_OFF : `OBS isn't answering at ${url}. Check that OBS is open and that Tools › WebSocket Server Settings › Enable WebSocket server is on${own === undefined ? ', with the same port' : ` (OBS says its port is ${String(own.port)})`}.`; }
  if (provider === 'meld') return `Meld Studio isn't answering at ${url}. Check that Meld Studio is open. Meld turns its connection on by itself; if it stays quiet, update Meld Studio.`;
  return `Streamlabs Desktop isn't answering at ${url}. Check that Streamlabs Desktop is open and that Settings › Remote Control is on.`;
}
function providerLabel(provider: BroadcastConnectionProvider): string { return provider === 'obs' ? 'OBS' : provider === 'meld' ? 'Meld Studio' : provider === 'sprigcast' ? 'SprigCast' : 'Streamlabs Desktop'; }
function isProvider(value: unknown): value is BroadcastConnectionProvider { return value === 'obs' || value === 'meld' || value === 'streamlabs' || value === 'sprigcast'; }
function providerPath(provider: BroadcastConnectionProvider): string { return provider === 'streamlabs' ? '/api/websocket' : provider === 'sprigcast' ? '/sprigcast' : ''; }
function isActive(signal: AbortSignal): boolean { return !signal.aborted; }
function parseEvent(value: unknown): ConnectionEvent[] { if (value === null || typeof value !== 'object' || Array.isArray(value)) return []; const item = value as Record<string, unknown>; const type = item['type']; const provider = item['provider']; if (typeof item['timestamp'] !== 'string' || typeof item['connectionId'] !== 'string' || typeof item['connectionName'] !== 'string' || !isProvider(provider) || !['configured', 'connected', 'snapshot', 'reconnecting', 'paused', 'resumed', 'stopped', 'test-succeeded', 'test-failed'].includes(String(type))) return []; return [{ timestamp: item['timestamp'], connectionId: item['connectionId'], connectionName: item['connectionName'], provider, type: type as ConnectionEvent['type'], ...(typeof item['latencyMs'] === 'number' ? { latencyMs: item['latencyMs'] } : {}), ...(typeof item['sceneCount'] === 'number' ? { sceneCount: item['sceneCount'] } : {}), ...(typeof item['detail'] === 'string' ? { detail: safeError(item['detail']) } : {}) }]; }
function sanitizeAcceptanceResult(value: Readonly<Record<string, unknown>>): AcceptanceResult[] { const provider = value['provider']; if (!isProvider(provider) || typeof value['outcome'] !== 'string') return []; return [{ provider, outcome: value['outcome'].slice(0, 40), ...(Number.isInteger(value['processId']) ? { processId: value['processId'] as number } : {}), ...(typeof value['executable'] === 'string' ? { executable: value['executable'].slice(0, 120) } : {}), ...(Number.isInteger(value['sceneCount']) ? { sceneCount: value['sceneCount'] as number } : {}), ...(Number.isInteger(value['latencyMs']) ? { latencyMs: value['latencyMs'] as number } : {}) }]; }
function parseAcceptanceReceipt(value: unknown): AcceptanceReceipt[] { if (value === null || typeof value !== 'object' || Array.isArray(value)) return []; const item = value as Record<string, unknown>; if (typeof item['checkedAt'] !== 'string' || !Number.isFinite(Date.parse(item['checkedAt'])) || !Array.isArray(item['results'])) return []; return [{ checkedAt: item['checkedAt'], results: item['results'].flatMap((result) => result !== null && typeof result === 'object' && !Array.isArray(result) ? sanitizeAcceptanceResult(result as Record<string, unknown>) : []) }]; }
function parseReliabilitySnapshot(value: unknown): ReliabilitySnapshot[] { if (value === null || typeof value !== 'object' || Array.isArray(value)) return []; const item = value as Record<string, unknown>; if (typeof item['capturedAt'] !== 'string' || !Number.isFinite(Date.parse(item['capturedAt'])) || !Array.isArray(item['profiles'])) return []; const profiles = item['profiles'].flatMap((profile) => { if (profile === null || typeof profile !== 'object' || Array.isArray(profile)) return []; const entry = profile as Record<string, unknown>; if (typeof entry['name'] !== 'string' || typeof entry['provider'] !== 'string') return []; const reliability = entry['reliability']; const safeReliability = reliability !== null && typeof reliability === 'object' && !Array.isArray(reliability) ? reliability as Record<string, unknown> : {}; return [{ name: entry['name'].slice(0, 60), provider: entry['provider'].slice(0, 20), state: typeof entry['state'] === 'string' ? entry['state'].slice(0, 20) : '', reconnectCount: typeof entry['reconnectCount'] === 'number' ? entry['reconnectCount'] : 0, ...(typeof entry['lastLatencyMs'] === 'number' ? { lastLatencyMs: entry['lastLatencyMs'] } : {}), reliability: { score: typeof safeReliability['score'] === 'number' ? safeReliability['score'] : 0, label: typeof safeReliability['label'] === 'string' ? safeReliability['label'].slice(0, 20) : 'unknown' } }]; }); return [{ capturedAt: item['capturedAt'], profiles }]; }
function compareReliabilitySnapshots(previous: ReliabilitySnapshot | undefined, current: ReliabilitySnapshot): Readonly<Record<string, unknown>> { if (previous === undefined) return { available: false, changes: [], regressions: 0, improvements: 0, summary: 'First redacted reliability snapshot saved.' }; const changes = current.profiles.flatMap((profile) => { const before = previous.profiles.find((candidate) => candidate['name'] === profile['name'] && candidate['provider'] === profile['provider']); const beforeReliability = before?.['reliability'] as Readonly<Record<string, unknown>> | undefined; const currentReliability = profile['reliability'] as Readonly<Record<string, unknown>> | undefined; const beforeScore = typeof beforeReliability?.['score'] === 'number' ? beforeReliability['score'] : undefined; const currentScore = typeof currentReliability?.['score'] === 'number' ? currentReliability['score'] : undefined; return beforeScore === undefined || currentScore === undefined || beforeScore === currentScore ? [] : [{ name: profile['name'], provider: profile['provider'], beforeScore, currentScore, change: currentScore - beforeScore, severity: currentScore < beforeScore ? 'regression' : 'improvement' }]; }); const regressions = changes.filter((change) => change.severity === 'regression').length; const improvements = changes.filter((change) => change.severity === 'improvement').length; return { available: true, previousCapturedAt: previous.capturedAt, currentCapturedAt: current.capturedAt, changes, regressions, improvements, summary: regressions > 0 ? `${String(regressions)} reliability regression${regressions === 1 ? '' : 's'} since the previous snapshot.` : improvements > 0 ? `${String(improvements)} reliability improvement${improvements === 1 ? '' : 's'} since the previous snapshot.` : 'No reliability score changes since the previous snapshot.' }; }
function compareAcceptance(previous?: AcceptanceReceipt, current?: AcceptanceReceipt): Readonly<Record<string, unknown>> { if (current === undefined) return { available: false, regressions: [], improvements: [], summary: 'Run installed-app acceptance to create the first receipt.' }; if (previous === undefined) return { available: true, baseline: true, regressions: [], improvements: [], summary: 'First sanitized acceptance baseline recorded.' }; const regressions: Readonly<Record<string, unknown>>[] = []; const improvements: Readonly<Record<string, unknown>>[] = []; for (const result of current.results) { const before = previous.results.find((entry) => entry.provider === result.provider); if (before === undefined) continue; if (before.outcome === 'passed' && result.outcome !== 'passed') regressions.push({ provider: result.provider, kind: 'outcome', before: before.outcome, after: result.outcome }); else if (before.outcome !== 'passed' && result.outcome === 'passed') improvements.push({ provider: result.provider, kind: 'outcome', before: before.outcome, after: result.outcome }); if (before.outcome === 'passed' && result.outcome === 'passed' && before.sceneCount !== undefined && result.sceneCount !== undefined && result.sceneCount < before.sceneCount) regressions.push({ provider: result.provider, kind: 'scene-count', before: before.sceneCount, after: result.sceneCount }); if (before.latencyMs !== undefined && result.latencyMs !== undefined && result.latencyMs >= Math.max(250, before.latencyMs * 2) && result.latencyMs - before.latencyMs >= 100) regressions.push({ provider: result.provider, kind: 'latency', beforeMs: before.latencyMs, afterMs: result.latencyMs }); } return { available: true, baseline: false, previousCheckedAt: previous.checkedAt, currentCheckedAt: current.checkedAt, regressions, improvements, summary: regressions.length > 0 ? `${String(regressions.length)} installed-app acceptance regression${regressions.length === 1 ? '' : 's'} detected.` : improvements.length > 0 ? `${String(improvements.length)} installed-app acceptance improvement${improvements.length === 1 ? '' : 's'} detected.` : 'No installed-app acceptance regressions detected.' }; }
async function portListening(url: URL): Promise<boolean> { return await new Promise<boolean>((resolve) => { const socket = createConnection({ host: url.hostname.replace(/^\[|\]$/gu, ''), port: Number(url.port) }); const done = (value: boolean) => { socket.destroy(); resolve(value); }; socket.setTimeout(500); socket.once('connect', () => done(true)); socket.once('timeout', () => done(false)); socket.once('error', () => done(false)); }); }
function connectionTrends(events: readonly ConnectionEvent[]): Readonly<Record<string, unknown>> { const cutoff = Date.now() - 30 * 60_000; const recent = events.filter((event) => Date.parse(event.timestamp) >= cutoff); const ids = [...new Set(recent.map((event) => event.connectionId))]; return { windowMinutes: 30, generatedAt: new Date().toISOString(), connections: ids.map((id) => { const selected = recent.filter((event) => event.connectionId === id); const latencies = selected.flatMap((event) => event.latencyMs === undefined ? [] : [event.latencyMs]).sort((a, b) => a - b); const sample = selected[0]; return { connectionId: id, connectionName: sample?.connectionName, provider: sample?.provider, latencySamples: latencies.length, averageLatencyMs: latencies.length === 0 ? undefined : Math.round(latencies.reduce((total, value) => total + value, 0) / latencies.length), maximumLatencyMs: latencies.at(-1), p95LatencyMs: latencies.length === 0 ? undefined : latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)], reconnects: selected.filter((event) => event.type === 'reconnecting').length, pauses: selected.filter((event) => event.type === 'paused').length, failedTests: selected.filter((event) => event.type === 'test-failed').length }; }) }; }
function reliabilityScores(runtimes: readonly ConnectionRuntime[], trends: Readonly<Record<string, unknown>>, latest?: AcceptanceReceipt): readonly Readonly<Record<string, unknown>>[] { const trendConnections = Array.isArray(trends['connections']) ? trends['connections'] as Readonly<Record<string, unknown>>[] : []; return runtimes.map((runtime) => { const trend = trendConnections.find((item) => item['connectionId'] === runtime.profile.id); const reconnects = typeof trend?.['reconnects'] === 'number' ? trend['reconnects'] : runtime.reconnectCount; const failedTests = typeof trend?.['failedTests'] === 'number' ? trend['failedTests'] : 0; const p95 = typeof trend?.['p95LatencyMs'] === 'number' ? trend['p95LatencyMs'] : runtime.lastLatencyMs; const factors: string[] = []; let score = 100; if (reconnects > 0) { const deduction = Math.min(30, reconnects * 6); score -= deduction; factors.push(`${String(reconnects)} reconnect(s): -${String(deduction)}`); } if (failedTests > 0) { const deduction = Math.min(30, failedTests * 10); score -= deduction; factors.push(`${String(failedTests)} failed test(s): -${String(deduction)}`); } if (p95 !== undefined && p95 >= (runtime.profile.latencyWarningMs ?? WARNING_LATENCY_MS)) { score -= 25; factors.push(`p95 latency ${String(p95)} ms crossed threshold: -25`); } const acceptance = latest?.results.find((result) => result.provider === runtime.profile.provider); if (acceptance !== undefined && acceptance.outcome !== 'passed' && acceptance.outcome !== 'not-installed') { score -= 25; factors.push(`latest acceptance ${acceptance.outcome}: -25`); } score = Math.max(0, score); return { connectionId: runtime.profile.id, connectionName: runtime.profile.name, provider: runtime.profile.provider, score, label: score >= 90 ? 'stable' : score >= 70 ? 'watch' : 'attention', factors: factors.length === 0 ? ['No recent reliability deductions.'] : factors }; }); }
function notificationSummary(runtimes: readonly ConnectionRuntime[], trends: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> { const processBindings = runtimes.filter((runtime) => runtime.applicationProcessId !== undefined).map((runtime) => ({ connectionId: runtime.profile.id, connectionName: runtime.profile.name, provider: runtime.profile.provider, processId: runtime.applicationProcessId, executable: runtime.applicationExecutableName })).sort((left, right) => left.connectionId.localeCompare(right.connectionId)); const trendConnections = Array.isArray(trends['connections']) ? trends['connections'] as Readonly<Record<string, unknown>>[] : []; const latencyBreaches = runtimes.flatMap((runtime) => { const thresholdMs = runtime.profile.latencyWarningMs ?? WARNING_LATENCY_MS; const trend = trendConnections.find((item) => item['connectionId'] === runtime.profile.id); const observedMs = typeof trend?.['p95LatencyMs'] === 'number' ? trend['p95LatencyMs'] : runtime.lastLatencyMs; return observedMs !== undefined && observedMs >= thresholdMs ? [{ connectionId: runtime.profile.id, connectionName: runtime.profile.name, provider: runtime.profile.provider, observedMs, thresholdMs }] : []; }); return { processSignature: processBindings.map((item) => `${item.connectionId}:${String(item.processId)}:${item.executable ?? ''}`).join('|'), processBindings, latencySignature: latencyBreaches.map((item) => `${item.connectionId}:${String(item.thresholdMs)}`).join('|'), latencyBreaches }; }

function effectLines(input: unknown): readonly Readonly<{ name: string; source: string; filter: string }>[] {
  const raw = input !== null && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>)['effects'] : undefined;
  if (!Array.isArray(raw)) throw new DirectSceneConnectionError(400, 'effects must be a list.');
  if (raw.length > 50) throw new DirectSceneConnectionError(400, 'Check at most 50 effects at once.');
  const text = (value: unknown): string => (typeof value === 'string' ? value.trim().slice(0, 256) : '');
  return raw.flatMap((entry: unknown) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>; const name = text(record['name']);
    return name === '' ? [] : [{ name, source: text(record['source']), filter: text(record['filter']) }];
  });
}

async function withTimeout<T>(work: Promise<T>, milliseconds: number): Promise<T> {
  const controller = new AbortController();
  try { return await Promise.race([work, delay(milliseconds, undefined, { signal: controller.signal }).then(() => { throw new Error('The app did not answer in time.'); })]); }
  finally { controller.abort(); }
}

/** Which app the overlay tools (Add all, starter scenes) work in: SprigCast when asked for, else OBS. */
function overlayToolApp(value: unknown): 'obs' | 'sprigcast' | 'streamlabs' { return value === 'sprigcast' || value === 'streamlabs' ? value : 'obs'; }
/** Save power: in the app asked for (OBS or SprigCast), else in whichever of the two answers first. */
function pickedOverlayApp(input: unknown): true | 'obs' | 'sprigcast' { const app = input !== null && typeof input === 'object' ? (input as Record<string, unknown>)['app'] : undefined; return app === 'obs' || app === 'sprigcast' ? app : true; }

let connectionFileCache: { readonly at: number; readonly file: SprigCastConnectionFile | undefined } | undefined;
/** %APPDATA%\\SprigCast\\connection.json while SprigCast's API runs (read at most every 3 seconds). Windows only. */
export function sprigcastConnectionFile(now = Date.now()): SprigCastConnectionFile | undefined {
  if (connectionFileCache !== undefined && now - connectionFileCache.at < 3_000) return connectionFileCache.file;
  let file: SprigCastConnectionFile | undefined;
  for (const path of sprigcastConnectionFilePaths()) {
    try { file = parseSprigCastConnectionFile(readFileSync(path, 'utf8'), processAlive); } catch { file = undefined; }
    if (file !== undefined) break;
  }
  connectionFileCache = { at: now, file };
  return file;
}
/** %APPDATA%\\SprigCast first (where SprigCast documents it), then the Slothbloom folder and Local AppData. */
function sprigcastConnectionFilePaths(): readonly string[] {
  if (process.platform !== 'win32') return [];
  const roaming = process.env['APPDATA'] ?? ''; const local = process.env['LOCALAPPDATA'] ?? '';
  return [roaming === '' ? '' : join(roaming, 'SprigCast', 'connection.json'), roaming === '' ? '' : join(roaming, 'Slothbloom', 'SprigCast', 'connection.json'), local === '' ? '' : join(local, 'SprigCast', 'connection.json')].filter((path) => path !== '');
}
function processAlive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; } }
/** The port SprigCast reports first, then its usual 4455 and 4456. */
function sprigcastDiscoveryPorts(): readonly number[] { const live = sprigcastConnectionFile()?.port; return [...new Set([...(live === undefined ? [] : [live]), ...SPRIGCAST_PORTS])]; }

/** The scene list for the catalog: with tidy groups when the app offers them. */
function catalogSnapshot(client: DirectSceneConnectionClient): Promise<DirectSceneSnapshot> { return client.getSceneCatalog === undefined ? client.getSceneList() : client.getSceneCatalog(); }
