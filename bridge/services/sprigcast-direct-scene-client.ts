import type { StreamingEffectCheck, StreamingEffectKind } from './streaming-app-effects.js';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import WebSocket from 'ws';
import type { DirectSceneSnapshot, ObsBrowserSourceRequest, ObsBrowserSourceResult, ObsPowerSavingResult } from './obs-direct-scene-client.js';
import { alwaysRunningOverlayUrl, pausableOverlayUrl, placementTransform } from './obs-direct-scene-client.js';
import { groupScenes } from './scene-groups.js';

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
/** SprigCast uses its saved port (4455), or the next free one from 4456 to 4460 when OBS already holds 4455. */
export const SPRIGCAST_PORTS: readonly number[] = [4455, 4456, 4457, 4458, 4459, 4460];
/** Store plugins SprigCast's own effects need, as SprigCast names them. */
const SPRIGCAST_PLUGIN_HELP = 'Add it in SprigCast under Tools › Plugin store.';
const BLOOM_EVENTS = new Set(['bloom.shown', 'blooms.changed', 'garden.changed']);
const OUTPUT_EVENTS = new Set(['stream.changed', 'record.changed']);
const MAXIMUM_SOURCES = 300;
/** SprigCast's usual canvases (its API does not tell their size yet). */
const SPRIGCAST_CANVAS: Readonly<Record<string, { readonly width: number; readonly height: number }>> = { horizontal: { width: 1920, height: 1080 }, vertical: { width: 1080, height: 1920 } };

export type SprigCastStreamSignal = 'connected' | 'stream-state-changed';
export const SPRIGCAST_EFFECTS = ['blackout', 'pixelate', 'barrel-roll'] as const;
export type SprigCastEffect = typeof SPRIGCAST_EFFECTS[number];
/** A SprigCast error answer. not_found ones also say what was missing (bloom, source, filter...) and its name. */
export class SprigCastApiError extends Error { public constructor(public readonly code: string, message: string, public readonly what = '', public readonly missingName = '') { super(message); this.name = 'SprigCastApiError'; } }
/** What a SprigCast says it can do (app.info): its feature names (only ever added) and canvas sizes. Older ones list none. */
export interface SprigCastInfo { readonly version: string; readonly features: ReadonlySet<string>; readonly canvases: Readonly<Record<string, { readonly width: number; readonly height: number }>> }
const SPRIGCAST_PAIR_HELP = 'In SprigCast open Settings › Connections › Pair a device, then type the 6-digit code under Scene connections in StreamBridge.';

/** One open, welcomed socket per endpoint, shared by every client so status reads never open extra connections. */
const openSessions = new Map<string, SprigCastSession>();
const streamListeners = new Map<string, Set<(signal: SprigCastStreamSignal) => void>>();

export class SprigCastDirectSceneClient {
  private infoCache: Promise<SprigCastInfo> | undefined;
  public constructor(private readonly url = SPRIGCAST_DEFAULT_URL, private readonly password = '', private readonly timeoutMs = 4_000, private readonly connectionId = url, private readonly connectionName = 'SprigCast (direct)', private readonly confirmationMs = 15_000) {}

  /** The horizontal blooms by name, and the one on air there (the vertical twin follows it). */
  public async getSceneList(): Promise<DirectSceneSnapshot> {
    return parseSprigCastBlooms(await this.request('blooms.list'), this.connectionId, this.connectionName);
  }

  /** The blooms in tidy groups for scene pickers (main blooms first, then each section A to Z, no sprigs or separators). */
  public async getSceneCatalog(): Promise<DirectSceneSnapshot> {
    const snapshot = await this.getSceneList();
    const sprigs = record(await this.request('sprigs.list').catch(() => ({})))['sprigs'];
    const sprigNames = (Array.isArray(sprigs) ? sprigs : []).map((sprig) => string(record(sprig)['name']).trim()).filter((name) => name !== '');
    const groups = groupScenes(snapshot.scenes, sprigNames);
    // Separators and sprigs aren't blooms to switch to, so the catalog lists only the grouped blooms.
    return { ...snapshot, scenes: groups.flatMap((group) => group.scenes), groups };
  }

  public async isStreaming(): Promise<boolean> { return record(await this.request('stream.status'))['on'] === true; }
  /** A paused recording still counts as recording. */
  public async isRecording(): Promise<boolean> { const status = record(await this.request('record.status')); return status['on'] === true || status['paused'] === true; }
  /** Streaming or recording. */
  public async isBusy(): Promise<boolean> { return (await this.isStreaming()) || (await this.isRecording()); }

  /** Puts a bloom on air in both shapes. */
  public async showScene(sceneName: string): Promise<void> { await this.request('bloom.show', { bloom: sceneName }); }

  public async switchScene(sceneName: string): Promise<void> { await this.showScene(sceneName); }

  /** Turns one filter on a source on or off (SprigCast's `filter.set`). */
  public async setFilter(sourceName: string, filterName: string, enabled: boolean): Promise<void> { await this.request('filter.set', { source: sourceName, filter: filterName, on: enabled }); }

  /** Ends the stream when it is live. */
  public async stopStreaming(): Promise<void> { if (await this.isStreaming()) await this.request('stream.stop'); }

  /**
   * SprigCast's own screen effects, from its store plugins: Hide it (blackout, pixelate) and Barrel Roll.
   * They always go through the effect requests, which change the target on the horizontal AND the vertical canvas.
   * (filter.set only changes one canvas's placement, so it is never used for these.) A source is changed everywhere
   * it shows; a sprig is changed in the bloom on air (Hide it needs a bloom for sprigs; Barrel Roll spins it everywhere).
   */
  public async runEffect(effect: SprigCastEffect, target: string, seconds: number): Promise<void> {
    const wait = Math.max(1, Math.min(600, Math.round(seconds)));
    const name = target.trim();
    const sources = await this.listSources();
    const sprig = await this.isSprig(name) && !sources.includes(name);
    if (effect === 'barrel-roll') await pluginNeeded(this.request('roll.spin', { ...(sprig ? { sprig: name } : { source: name }), seconds: wait }), 'Barrel Roll');
    else {
      let where: Record<string, unknown> = { source: name };
      if (sprig) {
        const bloom = (await this.getSceneList()).currentScene;
        if (bloom === undefined) throw new Error(`SprigCast has no bloom on air, so it can't find the sprig "${name}".`);
        where = { sprig: name, in: bloom };
      }
      await pluginNeeded(this.request(effect === 'blackout' ? 'hide.blackout' : 'hide.pixelate', { ...where, seconds: wait }), 'Hide it');
    }
    // A setup imported from OBS often has a separate copy for the vertical canvas, named "<name> (Vertical)". The viewer
    // paid for the effect on both streams, so its vertical twin gets it too (best effort: the main one already ran).
    for (const twin of await this.verticalTwins(name, sprig, sources)) {
      const request = effect === 'barrel-roll' ? this.request('roll.spin', { source: twin, seconds: wait }) : this.request(effect === 'blackout' ? 'hide.blackout' : 'hide.pixelate', { source: twin, seconds: wait });
      await request.catch(() => undefined);
    }
  }

  /** The "(Vertical)" copies of a source, or of the sources inside a sprig, that exist as their own sources. */
  private async verticalTwins(name: string, sprig: boolean, sources: readonly string[]): Promise<readonly string[]> {
    let inside: readonly string[] = [name];
    if (sprig) {
      try {
        const shapes = record(record(await this.request('items.list', { sprig: name }))['shapes']);
        inside = Object.values(shapes).flatMap((items): unknown[] => (Array.isArray(items) ? (items as unknown[]) : [])).map(record).filter((item) => item['sprig'] !== true).map((item) => string(item['name']).trim()).filter((item) => item !== '');
      } catch { return []; }
    }
    const twins = inside.map((item) => `${item} (Vertical)`).filter((item) => sources.includes(item));
    return [...new Set(twins)];
  }

  /**
   * Is the source (or sprig) there, and the plugin a built-in effect needs? Older SprigCast without plugins.list
   * answers "unchecked": SprigCast itself says which plugin is missing when the effect runs.
   */
  public async checkEffect(kind: StreamingEffectKind, target: string, filterName: string): Promise<StreamingEffectCheck> {
    const sources = await this.listSources();
    const isSource = sources.includes(target.trim());
    if (!isSource && !(kind !== 'filter' && await this.isSprig(target))) return { status: 'needs-setup', detail: `SprigCast has no ${kind === 'filter' ? 'source' : 'source or sprig'} called "${target}".`, canCreate: false };
    if (kind === 'filter') return { status: 'unchecked', detail: `"${target}" is there. Check that it has a filter called "${filterName}".`, canCreate: false };
    const plugin = kind === 'barrel-roll' ? 'Barrel Roll' : 'Hide it';
    let plugins: unknown;
    try { plugins = record(await this.request('plugins.list'))['plugins']; }
    catch { return { status: 'unchecked', detail: `"${target}" is there. This SprigCast can't list its plugins, so make sure ${plugin} is added.`, canCreate: false }; }
    const wanted = kind === 'barrel-roll' ? /roll/iu : /hide/iu;
    const found = (Array.isArray(plugins) ? plugins : []).map(record).find((entry) => wanted.test(`${string(entry['id'])} ${string(entry['name'])}`));
    // plugins.list also names the store's plugins that are not added (enabled false).
    // No filter fallback: a filter only changes one canvas, and the effect must show on both.
    if (found === undefined || found['enabled'] === false) return { status: 'needs-setup', detail: `Add the ${plugin} plugin in SprigCast under Tools › Plugin store.`, canCreate: false };
    return { status: 'ready', detail: `${plugin} is added and "${target}" is there.`, canCreate: false };
  }

  /** app.info, read once per client: features and canvas sizes (empty for a SprigCast from before 0.2.0). */
  public async info(): Promise<SprigCastInfo> {
    this.infoCache ??= (async () => {
      const answer = record(await this.request('app.info').catch(() => ({})));
      const canvases: Record<string, { width: number; height: number }> = {};
      for (const canvas of Array.isArray(answer['canvases']) ? answer['canvases'].map(record) : []) {
        const width = Number(canvas['width']); const height = Number(canvas['height']);
        if (string(canvas['id']) !== '' && width > 0 && height > 0) canvases[string(canvas['id'])] = { width, height };
      }
      return { version: string(answer['version']), features: new Set(Array.isArray(answer['features']) ? answer['features'].map(string) : []), canvases };
    })();
    return await this.infoCache;
  }

  /** Nothing to set up by hand in SprigCast: its effects come from the Hide it and Barrel Roll plugins and cover both canvases. */
  public async createEffect(kind: StreamingEffectKind): Promise<void> {
    throw new Error(kind === 'barrel-roll' ? 'Add the Barrel Roll plugin in SprigCast under Tools › Plugin store.' : kind === 'filter' ? 'Add the filter to the source in SprigCast, name it exactly like the Filter box, and turn it off.' : 'Add the Hide it plugin in SprigCast under Tools › Plugin store. It covers the horizontal and the vertical canvas.');
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
   * A PNG written to this path by StreamBridge (SprigCast is asked not to save its own copy, so its Snap plugin does
   * not print a polaroid for it). With no name: what is on air (`vertical` pictures the vertical canvas). With a name:
   * just that source, such as a camera, or (named "scene") that bloom.
   */
  public async saveScreenshot(imageFilePath: string, sourceName?: string, vertical = false, named: 'source' | 'scene' = 'source'): Promise<void> {
    const name = sourceName?.trim() ?? '';
    const shape = vertical ? 'vertical' : 'horizontal';
    const key = named === 'scene' ? 'bloom' : 'source';
    const answer = record(await this.request('screenshot.take', { shape, save: false, data: true, ...(name === '' ? {} : { [key]: name }) }));
    const shots = Array.isArray(answer['shots']) ? answer['shots'].map(record) : [];
    // A SprigCast from before one-source pictures ignores the name and pictures the whole screen: never pass that off as the source.
    if (name !== '' && !shots.some((entry) => entry[key] !== undefined)) throw new Error(`This SprigCast pictures what is on air only. Update SprigCast to picture one ${named === 'scene' ? 'bloom' : 'source'}.`);
    const shot = name !== '' ? shots[0] ?? {} : shots.find((entry) => entry['shape'] === shape) ?? shots[0] ?? {};
    const png = string(shot['png']);
    if (png === '') throw new Error(`SprigCast sent no picture${vertical && name === '' ? ' (is the vertical canvas turned on?)' : ''}.`);
    await mkdir(dirname(imageFilePath), { recursive: true });
    await writeFile(imageFilePath, Buffer.from(png, 'base64'));
  }

  /** Every bloom's name (for choosing what a screenshot captures). */
  public async listScenes(): Promise<readonly string[]> { return (await this.getSceneList()).scenes; }

  /**
   * "Add all": puts StreamBridge's overlays into a bloom as SprigCast Web page sources, making the bloom when it is
   * missing. A source whose name is already used is left alone, or with shareExisting also shown in this bloom (the
   * same source, so its settings stay shared). Placement follows the same layout as in OBS, on each canvas.
   */
  public async addBrowserSources(sceneName: string, sources: readonly ObsBrowserSourceRequest[], shareExisting = false): Promise<ObsBrowserSourceResult> {
    const blooms = (await this.getSceneList()).scenes;
    const sceneCreated = !blooms.includes(sceneName);
    if (sceneCreated) await this.request('bloom.new', { name: sceneName });
    const listed = record(await this.request('sources.list'))['sources'];
    const existing = new Set((Array.isArray(listed) ? listed : []).map((source) => string(record(source)['name']).trim()));
    const inBloom = new Set<string>();
    if (shareExisting && !sceneCreated) {
      const shapes = record(record(await this.request('items.list', { bloom: sceneName }))['shapes']);
      for (const items of Object.values(shapes)) for (const item of Array.isArray(items) ? items : []) inBloom.add(string(record(item)['name']).trim());
    }
    const added: string[] = []; const skipped: string[] = []; const shared: string[] = [];
    const info = await this.info();
    const stretch = info.features.has('item.scale_xy');
    // item.add always adds another copy, so it runs once per source and bloom (the in-bloom check above covers re-runs).
    const put = async (source: ObsBrowserSourceRequest): Promise<void> => {
      const answer = record(await this.request('item.add', { source: source.name, bloom: sceneName }));
      if (source.placement === undefined) return;
      const item = string(answer['item']) || source.name;
      const shapes = Array.isArray(answer['shapes']) ? answer['shapes'].map(string) : ['horizontal'];
      for (const shape of shapes) {
        const canvas = info.canvases[shape] ?? SPRIGCAST_CANVAS[shape]; if (canvas === undefined) continue;
        const spot = placementTransform(source.placement, source, canvas);
        const size = (value: number): number => Math.max(0.01, Math.min(100, value));
        // A full-canvas overlay stretches each way when SprigCast can; older ones size it evenly.
        const scale = stretch && spot.scaleX !== spot.scaleY ? { scale_x: size(spot.scaleX), scale_y: size(spot.scaleY) } : { scale: size(spot.scaleX) };
        await this.request('item.place', { item, bloom: sceneName, shape, x: spot.positionX, y: spot.positionY, ...scale });
      }
    };
    for (const source of sources) {
      if (existing.has(source.name)) {
        if (shareExisting && !inBloom.has(source.name)) { await put(source); inBloom.add(source.name); shared.push(source.name); }
        else skipped.push(source.name);
        continue;
      }
      await this.request('source.new', { name: source.name, kind: 'browser', settings: { url: source.url, width: source.width, height: source.height, keep_running: true } });
      await put(source);
      existing.add(source.name); added.push(source.name);
    }
    return { sceneName, sceneCreated, added, skipped, ...(shareExisting ? { shared } : {}) };
  }

  /** Removes the named blooms when they exist. Their sources stay while other blooms use them. */
  public async removeScenes(sceneNames: readonly string[]): Promise<{ readonly removed: readonly string[]; readonly missing: readonly string[] }> {
    const blooms = new Set((await this.getSceneList()).scenes);
    const removed: string[] = []; const missing: string[] = [];
    for (const name of sceneNames) {
      if (!blooms.has(name)) { missing.push(name); continue; }
      await this.request('bloom.remove', { bloom: name }); removed.push(name);
    }
    return { removed, missing };
  }

  /** Every source's name. */
  public async listSources(): Promise<readonly string[]> {
    const sources = record(await this.request('sources.list'))['sources'];
    return (Array.isArray(sources) ? sources : []).map((source) => string(record(source)['name']).trim()).filter((name) => name !== '').slice(0, MAXIMUM_SOURCES);
  }

  /** Lets the StreamBridge overlays that are safe to pause sleep while hidden (SprigCast's "Keep running when hidden" off). */
  public async pauseHiddenOverlaySources(): Promise<ObsPowerSavingResult> { return await this.setKeepRunning(false); }
  /** Undoes Save power: those overlays keep running while hidden again. */
  public async resumeHiddenOverlaySources(): Promise<ObsPowerSavingResult> { return await this.setKeepRunning(true); }

  /** Every Web page source and the page it shows, read-only (the readiness check counts StreamBridge overlays from it). */
  public async browserSources(): Promise<readonly { readonly name: string; readonly url: string }[]> {
    const sources = record(await this.request('sources.list'))['sources'];
    const pages = (Array.isArray(sources) ? sources : []).map(record).filter((source) => source['kind'] === 'browser').slice(0, MAXIMUM_SOURCES);
    const found: { name: string; url: string }[] = [];
    for (const page of pages) {
      const id = string(page['id']); const name = string(page['name']);
      found.push({ name, url: string(record(record(await this.request('source.get', { source: id || name }))['settings'])['url']) });
    }
    return found;
  }

  /**
   * Switches "Keep running when hidden" on for the StreamBridge pages that must not be closed while off screen
   * (alerts, chat, clips, Raid Scout, sounds, countdowns with a sound cue). Only ever turns the flag on, never off,
   * and never touches other pages. SprigCast closes idle pages without it.
   */
  public async keepAlwaysRunningPagesOn(): Promise<{ readonly changed: readonly string[]; readonly already: readonly string[] }> {
    const sources = record(await this.request('sources.list'))['sources'];
    const pages = (Array.isArray(sources) ? sources : []).map(record).filter((source) => source['kind'] === 'browser').slice(0, MAXIMUM_SOURCES);
    const changed: string[] = []; const already: string[] = [];
    for (const page of pages) {
      const id = string(page['id']); const name = string(page['name']);
      const settings = record(record(await this.request('source.get', { source: id || name }))['settings']);
      if (!alwaysRunningOverlayUrl(string(settings['url']))) continue;
      if (settings['keep_running'] === true) { already.push(name); continue; }
      await this.request('source.set', { source: id || name, settings: { keep_running: true } });
      changed.push(name);
    }
    return { changed, already };
  }

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
    let timer: NodeJS.Timeout | undefined; let confirmation: NodeJS.Timeout | undefined; let outputQueued = false;
    const session = await this.openSession(['bloom', 'output', 'garden'], AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]));
    const stopEvents = session.onEvent((name) => {
      // SprigCast is closing or restarting its API: drop this socket now; the watcher reconnects and reads connection.json again.
      if (name === 'app.closing') { movedUrls.delete(this.url); session.close('SprigCast is closing'); return; }
      // One look at the stream state per group of events: a batch with stream.changed and record.changed asks once.
      if (OUTPUT_EVENTS.has(name)) { if (!outputQueued) { outputQueued = true; queueMicrotask(() => { outputQueued = false; notify(this.url, 'stream-state-changed'); }); } return; }
      if (!BLOOM_EVENTS.has(name)) return;
      if (timer !== undefined) clearTimeout(timer); timer = setTimeout(onChange, 100); timer.unref();
    });
    try {
      openSessions.set(this.url, session);
      notify(this.url, 'connected');
      // SprigCast closes pages that sit off screen; the ones that must keep running get the flag on each connect.
      void this.keepAlwaysRunningPagesOn().catch(() => { /* Older SprigCast or a page it refuses: the pages still work, they may just be reopened. */ });
      confirmation = setInterval(onChange, this.confirmationMs); confirmation.unref();
      await session.closed(signal);
    } finally {
      if (confirmation !== undefined) clearInterval(confirmation); if (timer !== undefined) clearTimeout(timer); stopEvents();
      if (openSessions.get(this.url) === session) openSessions.delete(this.url);
      session.close('Scene subscription stopped');
    }
  }

  /**
   * Opens a socket at the saved address, or where SprigCast moved to (4455 ↔ 4456 when OBS starts or stops)
   * when its connection file can't be read. The new address is remembered until SprigCast moves again.
   */
  private async openSession(events: readonly string[] | 'none', signal: AbortSignal): Promise<SprigCastSession> {
    const remembered = movedUrls.get(this.url) ?? this.url;
    try { return await SprigCastSession.open(remembered, this.password, events, signal); }
    catch (error) {
      if (!(error instanceof Error) || sprigcastConnectMessage(error.message, remembered) === error.message || signal.aborted) throw error;
      const found = await findSprigCastUrl(this.url, undefined);
      if (found === remembered) throw error;
      const session = await SprigCastSession.open(found, this.password, events, signal);
      movedUrls.set(this.url, found);
      return session;
    }
  }

  /** One action, on the shared socket when one is open, else on a short-lived one. */
  public async request(action: string, fields: Readonly<Record<string, unknown>> = {}): Promise<unknown> {
    const deadline = AbortSignal.timeout(this.timeoutMs);
    const shared = openSessions.get(this.url);
    if (shared?.open() === true) return await shared.ask(action, fields, deadline);
    const session = await this.openSession('none', deadline);
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
        if (password === '') throw new Error(`SprigCast has a password, so StreamBridge needs to be paired. ${SPRIGCAST_PAIR_HELP}`);
        greeting['auth'] = sprigcastAuthentication(password, string(auth['salt']), string(auth['challenge']));
      }
      const welcome = nextMessage(socket, signal, (value) => 'welcome' in value);
      socket.send(JSON.stringify(greeting));
      await welcome;
      return new SprigCastSession(socket);
    } catch (error) {
      if (socket.readyState < WebSocket.CLOSING) socket.terminate();
      if (error instanceof Error && /\(4009/u.test(error.message)) throw new Error(`SprigCast no longer knows StreamBridge. The device may have been removed in SprigCast under Settings › Connections, or the password changed. Pair again: ${SPRIGCAST_PAIR_HELP}`, { cause: error });
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
    // While live, SprigCast groups events (about 10 a second). A group may come as several messages in a row, as one
    // JSON array, or as {"events": [...]} / {"batch": [...]}; each item is handled in order, like a single message.
    for (const item of sprigcastMessages(value)) this.receiveOne(item);
  }

  private receiveOne(value: Record<string, unknown>): void {
    if (typeof value['event'] === 'string') { for (const listener of [...this.eventListeners]) { try { listener(value['event'], value); } catch { /* A listener must not break the socket. */ } } return; }
    const id = value['id']; if (typeof id !== 'string') return;
    const waiter = this.pending.get(id); if (waiter === undefined) return; this.pending.delete(id);
    if (value['ok'] === true) { waiter.resolve(value['result'] ?? {}); return; }
    const error = record(value['error']);
    waiter.reject(new SprigCastApiError(string(error['code']) || 'failed', `SprigCast: ${string(error['message']) || 'the action failed.'}`, string(error['what']), string(error['name'])));
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

/**
 * The address where SprigCast's own API answers right now. Uses connection.json when SprigCast wrote one;
 * otherwise keeps the typed address when SprigCast answers there, else tries its usual ports (4455 to 4460).
 * Answers the typed address unchanged when nothing answers, so the error names what the creator typed.
 */
export async function findSprigCastUrl(url: string, file: SprigCastConnectionFile | undefined, answers: (url: string) => Promise<boolean> = sprigcastAnswers): Promise<string> {
  if (file !== undefined) return sprigcastLiveUrl(url, file);
  let parsed: URL; try { parsed = new URL(url); } catch { return url; }
  if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') return url;
  if (await answers(url)) return url;
  for (const port of SPRIGCAST_PORTS) {
    const candidate = new URL(url); candidate.port = String(port); candidate.pathname = '/sprigcast';
    const href = candidate.href.replace(/\/$/u, '');
    if (href !== url && await answers(href)) return href;
  }
  return url;
}

/** Plain words for a SprigCast socket that never opened (refused, timed out), instead of "connect ECONNREFUSED…". */
export function sprigcastConnectMessage(message: string, url: string): string {
  if (!/ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|timed out|aborted/iu.test(message)) return message;
  return `SprigCast isn't answering at ${url}. Check that SprigCast is open and that Settings › Connections › Let other apps control SprigCast is on, then use the address SprigCast shows there (for example ws://127.0.0.1:4456/sprigcast).`;
}

/**
 * Pairs StreamBridge with SprigCast using the 6-digit code from SprigCast's Settings › Connections › Pair a device.
 * Answers the key to save (encrypted) and send later exactly like a password. Never asks for SprigCast's password.
 */
export async function sprigcastPair(url: string, code: string, name = 'StreamBridge', timeoutMs = 8_000): Promise<string> {
  if (!/^\d{6}$/u.test(code.trim())) throw new Error('Type the 6-digit code SprigCast shows under Settings › Connections › Pair a device.');
  const socket = new WebSocket(url, { maxPayload: 64 * 1024 });
  socket.on('error', () => { /* Surfaces through the handshake. */ });
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const hello = record((await nextMessage(socket, signal, (value) => 'hello' in value))['hello']);
    if (hello['app'] !== 'SprigCast') throw new Error('This port is not SprigCast\'s own API. Use the address ending in /sprigcast.');
    const paired = nextMessage(socket, signal, (value) => 'paired' in value);
    socket.send(JSON.stringify({ pair: code.trim(), name, events: 'none' }));
    const key = string(record((await paired)['paired'])['key']);
    if (key === '') throw new Error('SprigCast did not send a pairing key.');
    return key;
  } catch (error) {
    if (error instanceof Error && /\(4011/u.test(error.message)) throw new Error('SprigCast did not accept that code. It lasts 2 minutes, and after 5 wrong codes pairing locks for a minute. Make a new code and try again.', { cause: error });
    if (error instanceof Error) throw new Error(sprigcastConnectMessage(error.message, url), { cause: error });
    throw error;
  } finally { if (socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Paired'); }
}

/** SprigCast's connection.json (%APPDATA%\\SprigCast): where its API listens right now. Never holds a password or key. */
export interface SprigCastConnectionFile { readonly port: number; readonly path: string; readonly passwordSet: boolean; readonly pid: number }
export function parseSprigCastConnectionFile(text: string, alive: (pid: number) => boolean): SprigCastConnectionFile | undefined {
  // Windows tools often save JSON with a byte-order mark, which JSON.parse refuses.
  let value: unknown; try { value = JSON.parse(text.replace(/^\uFEFF/u, '')); } catch { return undefined; }
  const file = record(value); const port = Number(file['port']); const pid = Number(file['pid']);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return undefined;
  // The file can outlive a crash, so it only counts while SprigCast's process is still running.
  if (Number.isInteger(pid) && pid > 0 && !alive(pid)) return undefined;
  return { port, path: string(file['path']) || '/sprigcast', passwordSet: file['passwordSet'] === true, pid };
}
/** The saved SprigCast address with the port SprigCast reports now (it moves to 4456 when OBS holds 4455). */
export function sprigcastLiveUrl(url: string, file: SprigCastConnectionFile | undefined): string {
  if (file === undefined) return url;
  try { const parsed = new URL(url); if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') return url; parsed.port = String(file.port); parsed.pathname = file.path; return parsed.href.replace(/\/$/u, ''); }
  catch { return url; }
}

/** Same answer as obs-websocket's: base64(sha256(base64(sha256(password + salt)) + challenge)). */
export function sprigcastAuthentication(password: string, salt: string, challenge: string): string {
  if (salt === '' || challenge === '') throw new Error('SprigCast sent an incomplete password challenge.');
  const secret = createHash('sha256').update(password + salt).digest('base64');
  return createHash('sha256').update(secret + challenge).digest('base64');
}

/** Saved address → where SprigCast answered instead, found when the saved one stopped answering. */
const movedUrls = new Map<string, string>();

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

/**
 * The messages inside one SprigCast text: itself, the items of a JSON array, or the items of {"events": [...]} or
 * {"batch": [...]} (an event group sent at once). Anything that isn't an object is skipped. At most 500 per text.
 */
export function sprigcastMessages(value: unknown): Record<string, unknown>[] {
  const items: unknown[] = Array.isArray(value) ? value
    : isRecord(value) && !('event' in value) && !('id' in value) && Array.isArray(value['events']) ? value['events'] as unknown[]
      : isRecord(value) && !('event' in value) && !('id' in value) && Array.isArray(value['batch']) ? value['batch'] as unknown[]
        : [value];
  return items.filter(isRecord).slice(0, 500);
}

function rawText(raw: WebSocket.RawData): string { return Array.isArray(raw) ? Buffer.concat(raw).toString('utf8') : Buffer.isBuffer(raw) ? raw.toString('utf8') : Buffer.from(raw).toString('utf8'); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function record(value: unknown): Record<string, unknown> { return isRecord(value) ? value : {}; }
function string(value: unknown): string { return typeof value === 'string' ? value : ''; }

/** A SprigCast effect that needs a store plugin: say which one and where to add it, instead of a bare plugin_missing. */
function pluginError(error: unknown, plugin: string): unknown {
  if (!(error instanceof SprigCastApiError) || (error.code !== 'plugin_missing' && error.code !== 'unknown_action')) return error;
  return new SprigCastApiError(error.code, `SprigCast needs the ${plugin} plugin for this. ${SPRIGCAST_PLUGIN_HELP}`, error.what, error.missingName);
}
async function pluginNeeded(work: Promise<unknown>, plugin: string): Promise<void> {
  try { await work; } catch (error) { throw pluginError(error, plugin); }
}
