import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Logger } from './logger.js';
import { CLIP_WINDOW_PROCESS, CLIP_WINDOW_TITLE, cropFromMetrics, twitchClipSlug, type ClipWindowCrop, type ClipWindowOpener } from './edge-clip-window.js';

/**
 * Clips in a SprigCast video source.
 *
 * SprigCast's Web page sources use a Chromium without H.264/AAC, so a Twitch clip (H.264 MP4) can't play inside the
 * clip page there. SprigCast's own video source (kind "media") plays it fine. With this on, the clip page keeps
 * drawing its frame, title and fades, and leaves its video area see-through; the clip itself plays in a SprigCast
 * video source placed just under the page, over that video area. Everything goes through SprigCast's own API.
 *
 * "Set it up for me" (never while live or recording) makes one video source per extension and places it under each
 * of that extension's pages, in one undoable step when SprigCast can. While a clip plays only that source's file,
 * volume and play state change; the layout is never touched.
 *
 * Raid targets' clips have no video file (only Twitch's player, which streams H.264). Until SprigCast's Web pages can
 * play H.264, Raid Scout shows them in a small Edge window that a SprigCast window capture (kept hidden, under the
 * page) shows for the clip's length, with Edge's sound in an app sound row that is muted the rest of the time.
 */

export type SprigCastRequest = (action: string, fields?: Readonly<Record<string, unknown>>) => Promise<unknown>;
export interface SprigCastLink { readonly request: SprigCastRequest; readonly features: ReadonlySet<string> }

/** The extensions that can play clips in a SprigCast video source, their page paths, and the source made for each. */
export interface ClipVideoModule {
  readonly paths: readonly string[]; readonly sourceName: string; readonly label: string;
  /** The Edge window stopgap for clips that only have Twitch's player: its window capture and its sound row. */
  readonly window?: { readonly sourceName: string; readonly soundName: string };
}
export const CLIP_VIDEO_MODULES: Readonly<Record<string, ClipVideoModule>> = Object.freeze({
  'thsv.random-clip-player': Object.freeze({ paths: Object.freeze(['/overlay/clips', '/overlay/addons/thsv.random-clip-player']), sourceName: 'StreamBridge Clip Video', label: 'Random Clip Player' }),
  'thsv.raid-scout': Object.freeze({ paths: Object.freeze(['/overlay/addons/thsv.raid-scout']), sourceName: 'StreamBridge Raid Clip Video', label: 'Raid Scout', window: Object.freeze({ sourceName: 'StreamBridge Raid Clip Window', soundName: 'StreamBridge Raid Clip Sound' }) }),
});

export function isClipVideoModule(moduleId: string): boolean { return Object.hasOwn(CLIP_VIDEO_MODULES, moduleId); }

/** The features "Set it up for me" needs: reading where pages are, and placing with a fit box. */
export const CLIP_VIDEO_SETUP_FEATURES = Object.freeze(['layout.get', 'item.place_full']);

export interface Rect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

/**
 * Where the clip's picture sits on a clip page of this size, in page pixels: the inside of the media frame.
 * Mirrors overlays/browser/addon-host.css (.stage padding clamp(8px, 3vmin, 72px), .media-shell up to 1600x900 centred
 * with a 2px border and 3px padding, the video filling it with object-fit: contain).
 */
export function clipVideoArea(pageWidth: number, pageHeight: number): Rect {
  const padding = Math.min(72, Math.max(8, 0.03 * Math.min(pageWidth, pageHeight)));
  const shellWidth = Math.max(0, Math.min(pageWidth - 2 * padding, 1600));
  const shellHeight = Math.max(0, Math.min(pageHeight - 2 * padding, 900));
  return { x: (pageWidth - shellWidth) / 2 + 5, y: (pageHeight - shellHeight) / 2 + 5, width: Math.max(1, shellWidth - 10), height: Math.max(1, shellHeight - 10) };
}

/** Is this Web page URL one of this extension's StreamBridge pages? */
export function isClipPageUrl(url: string, moduleId: string): boolean {
  const module = CLIP_VIDEO_MODULES[moduleId]; if (module === undefined) return false;
  try {
    const parsed = new URL(url);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) && !parsed.hostname.endsWith('slothbloom.com')) return false;
    const path = parsed.pathname.replace(/\/+$/u, '');
    return module.paths.includes(path);
  } catch { return false; }
}

const SHARE: Readonly<Record<string, readonly [number, number]>> = { top_left: [0, 0], top: [0.5, 0], top_right: [1, 0], left: [0, 0.5], center: [0.5, 0.5], right: [1, 0.5], bottom_left: [0, 1], bottom: [0.5, 1], bottom_right: [1, 1] };

/** One item from SprigCast's layout.get answer (only the fields used here). */
export interface LayoutItem {
  readonly id: string; readonly name: string; readonly kind: string; readonly sprig: boolean; readonly locked?: boolean;
  readonly x: number; readonly y: number; readonly scale_x: number; readonly scale_y: number; readonly rotation: number;
  readonly crop?: { readonly left?: number; readonly top?: number; readonly right?: number; readonly bottom?: number };
  readonly bounds?: { readonly mode?: string; readonly width?: number; readonly height?: number; readonly align?: string };
  readonly source_size?: { readonly width: number; readonly height: number } | null;
  readonly items?: readonly LayoutItem[];
}

/**
 * The page's video area carried into the pixels of the layout the page sits in (its bloom's sprig, or a sprig),
 * the same way SprigCast places a picture: crop, then the scale (or the bounds box), then the item's spot.
 * undefined when the page is turned (a turned video can't be matched with a fit box) or its size isn't known yet.
 */
export function videoAreaInLayout(page: LayoutItem): Rect | undefined {
  const size = page.source_size; if (size === null || size === undefined || !(size.width > 0) || !(size.height > 0)) return undefined;
  if (Math.abs(page.rotation) > 0.01) return undefined;
  const crop = { left: page.crop?.left ?? 0, top: page.crop?.top ?? 0, right: page.crop?.right ?? 0, bottom: page.crop?.bottom ?? 0 };
  const croppedWidth = size.width - crop.left - crop.right; const croppedHeight = size.height - crop.top - crop.bottom;
  if (!(croppedWidth > 0) || !(croppedHeight > 0)) return undefined;
  let scaleX = page.scale_x; let scaleY = page.scale_y; let offsetX = 0; let offsetY = 0;
  const mode = page.bounds?.mode ?? 'off';
  if (mode !== 'off') {
    const boxWidth = page.bounds?.width ?? 0; const boxHeight = page.bounds?.height ?? 0;
    if (mode === 'stretch') { scaleX = boxWidth / croppedWidth; scaleY = boxHeight / croppedHeight; }
    else { const k = (mode === 'fit' ? Math.min : Math.max)(boxWidth / croppedWidth, boxHeight / croppedHeight); scaleX = k; scaleY = k; }
    const [shareX, shareY] = SHARE[page.bounds?.align ?? 'center'] ?? [0.5, 0.5];
    offsetX = (boxWidth - croppedWidth * scaleX) * shareX; offsetY = (boxHeight - croppedHeight * scaleY) * shareY;
  }
  const area = clipVideoArea(size.width, size.height);
  // Only the part of the video area the crop leaves on screen.
  const left = Math.max(area.x, crop.left); const top = Math.max(area.y, crop.top);
  const right = Math.min(area.x + area.width, size.width - crop.right); const bottom = Math.min(area.y + area.height, size.height - crop.bottom);
  if (right <= left || bottom <= top) return undefined;
  const round = (value: number): number => Math.round(value * 100) / 100;
  return { x: round(page.x + offsetX + (left - crop.left) * scaleX), y: round(page.y + offsetY + (top - crop.top) * scaleY), width: round((right - left) * scaleX), height: round((bottom - top) * scaleY) };
}

/** A layout (a bloom's own layout or a sprig) holding one of an extension's pages, for one shape. */
export interface ClipPagePlace {
  readonly shape: string; readonly holder: { readonly bloom: string } | { readonly sprig: string }; readonly where: string;
  readonly pageName: string; readonly items: readonly LayoutItem[]; readonly page: LayoutItem;
}

/** Every layout under these rows (top first) that holds one of the pages, once per sprig and shape. */
export function findClipPages(rows: readonly LayoutItem[], shape: string, isPage: (item: LayoutItem) => boolean, holder: ClipPagePlace['holder'], where: string, seen: Set<string>, out: ClipPagePlace[]): void {
  const page = rows.find((row) => !row.sprig && isPage(row));
  if (page !== undefined) out.push({ shape, holder, where, pageName: page.name, items: rows, page });
  for (const row of rows) {
    if (!row.sprig || !Array.isArray(row.items)) continue;
    const key = `${row.id}\0${shape}`; if (seen.has(key)) continue; seen.add(key);
    findClipPages(row.items, shape, isPage, { sprig: row.id }, row.name, seen, out);
  }
}

/**
 * The steps that put the video source just under the page, sized to its video area: take out an earlier placement,
 * add it on top, place it with a centred fit box (the page's object-fit: contain), then send it down below the page.
 */
export function placementSteps(place: ClipPagePlace, sourceId: string, sourceName: string, extra: { readonly crop?: ClipWindowCrop; readonly hidden?: boolean } = {}): readonly Readonly<Record<string, unknown>>[] {
  const area = videoAreaInLayout(place.page); if (area === undefined) return [];
  const mine = (item: LayoutItem): boolean => item.id === sourceId || (sourceId === '' && item.name === sourceName);
  const others = place.items.filter((item) => !mine(item));
  const pageIndex = others.indexOf(place.page);
  const holder = { ...place.holder, shape: place.shape };
  const item = sourceId || sourceName;
  const steps: Record<string, unknown>[] = [];
  if (place.items.some(mine)) steps.push({ do: 'item.remove', item, ...holder });
  steps.push({ do: 'item.add', source: item, ...holder });
  steps.push({ do: 'item.place', item, ...holder, x: area.x, y: area.y, bounds: 'fit', bounds_width: area.width, bounds_height: area.height, bounds_align: 'center', ...(extra.crop === undefined ? {} : { crop: extra.crop }) });
  for (let step = 0; step <= pageIndex; step += 1) steps.push({ do: 'item.order', item, ...holder, to: 'down' });
  if (extra.hidden === true) steps.push({ do: 'item.hide', item, ...holder });
  return steps;
}

/** Is the source already right under the page (or just under its partner), in the right spot? */
export function alreadyPlaced(place: ClipPagePlace, sourceId: string, sourceName: string): boolean {
  const index = place.items.indexOf(place.page);
  const below = place.items.slice(index + 1, index + 3).find((item) => (sourceId !== '' && item.id === sourceId) || item.name === sourceName);
  if (below === undefined) return false;
  const area = videoAreaInLayout(place.page); if (area === undefined) return false;
  const near = (left: number | undefined, right: number): boolean => left !== undefined && Math.abs(left - right) < 1.5;
  return below.bounds?.mode === 'fit' && near(below.x, area.x) && near(below.y, area.y) && near(below.bounds.width, area.width) && near(below.bounds.height, area.height);
}

export type ClipVideoState = 'playing' | 'ended' | 'failed';
export interface ClipVideoPlay { readonly playbackId: string; readonly url: string; readonly embedUrl?: string; readonly muted: boolean; readonly volume: number; readonly durationMs?: number }
export interface ClipVideoSetupResult {
  readonly moduleId: string; readonly app?: string; readonly connected: boolean; readonly ready: boolean; readonly sourceName: string;
  readonly sourceExists: boolean; readonly missingFeatures: readonly string[];
  readonly places: readonly Readonly<{ where: string; shape: string; page: string; status: 'placed' | 'needs-setup' | 'skipped'; detail?: string }>[];
  readonly changed?: boolean; readonly undoable?: boolean; readonly message: string;
  /** About the Edge window for other channels' clips (Raid Scout). */
  readonly windowNote?: string;
}

export interface SprigCastClipVideoOptions {
  /** SprigCast's API, when SprigCast is the creator's streaming app and connected; undefined otherwise. */
  readonly sprigcast: () => Promise<SprigCastLink | undefined>;
  /** Downloads a Twitch clip into the private clip cache; answers its /overlay/cache/<file> URL. */
  readonly cacheClip: (moduleId: string, sourceUrl: string, cacheKey: string) => Promise<string>;
  readonly cacheDirectory: string;
  /** Tells the clip pages how the SprigCast video is doing. */
  readonly report: (moduleId: string, playbackId: string, state: ClipVideoState, detail?: Readonly<{ durationMs?: number; error?: string }>) => void;
  /** Opens the Edge window for clips that only have Twitch's player; undefined where there is no Edge. */
  readonly clipWindow?: ClipWindowOpener;
  readonly logger?: Pick<Logger, 'info' | 'warn' | 'debug'>;
  readonly pollMs?: number;
  readonly startTimeoutMs?: number;
}

type Running = { readonly playbackId: string; timer?: NodeJS.Timeout; readonly cancelled: { value: boolean }; cleanup?: (() => void) | undefined };

const TRUSTED_CLIP_HOST = /^(?:clips-media-assets\d*\.twitch\.tv|d1ndex63qxojbr\.cloudfront\.net|(?:.+\.)?twitchcdn\.net|(?:.+\.)?ttvnw\.net)$/iu;

export class SprigCastClipVideo {
  private readonly ready = new Set<string>();
  private sprigcastActive = false;
  private readonly running = new Map<string, Running>();
  private readonly windowReady = new Set<string>();
  private readonly shown = new Set<string>();
  private refreshTimer: NodeJS.Timeout | undefined;

  public constructor(private readonly options: SprigCastClipVideoOptions) {}

  /** Re-checks which extensions have their video source in SprigCast now and then, so a play can be routed at once. */
  public start(intervalMs = 30_000): void {
    void this.refresh();
    this.refreshTimer = setInterval(() => { void this.refresh(); }, intervalMs); this.refreshTimer.unref();
  }

  public stopAll(): void {
    if (this.refreshTimer !== undefined) clearInterval(this.refreshTimer); this.refreshTimer = undefined;
    for (const moduleId of [...this.running.keys()]) this.cancel(moduleId);
  }

  public async refresh(): Promise<void> {
    try {
      const link = await this.options.sprigcast();
      this.sprigcastActive = link !== undefined;
      if (link === undefined) { this.ready.clear(); this.windowReady.clear(); return; }
      const rows = sourceRows(await link.request('sources.list'));
      const names = new Set(rows.filter((row) => row.kind === 'media').map((row) => row.name));
      const windows = new Set(rows.filter((row) => row.kind === 'window_capture').map((row) => row.name));
      for (const [moduleId, module] of Object.entries(CLIP_VIDEO_MODULES)) {
        if (names.has(module.sourceName)) this.ready.add(moduleId); else this.ready.delete(moduleId);
        if (module.window !== undefined && windows.has(module.window.sourceName)) this.windowReady.add(moduleId); else this.windowReady.delete(moduleId);
      }
    } catch (error) { this.ready.clear(); this.windowReady.clear(); this.sprigcastActive = false; this.options.logger?.debug('SprigCast clip video check failed', { error }); }
  }

  /**
   * A Twitch clip embed (another channel's clip, which has no video file) can't play in SprigCast's Web pages either.
   * While SprigCast is the streaming app, the page shows the clip's still picture and title for the clip's length.
   */
  public stillOnly(moduleId: string, payload: Readonly<Record<string, unknown>>): boolean {
    if (!this.sprigcastActive || !isClipVideoModule(moduleId) || typeof payload['posterUrl'] !== 'string' || payload['posterUrl'] === '') return false;
    try { return new URL(String(payload['embedUrl'])).hostname === 'clips.twitch.tv'; } catch { return false; }
  }

  /**
   * Should this play go to SprigCast? Only when asked for and set up: a clip file to the video source, or (Raid Scout)
   * a Twitch player clip to the Edge window, when Edge is on this PC and the window source exists.
   */
  public claims(moduleId: string, payload: Readonly<Record<string, unknown>>): boolean {
    if (payload['appVideo'] !== true) return false;
    if (typeof payload['url'] === 'string' && payload['url'] !== '') return this.ready.has(moduleId);
    return twitchClipSlug(payload['embedUrl']) !== undefined && this.windowReady.has(moduleId) && this.options.clipWindow?.available() === true;
  }

  /** Plays one clip in the extension's SprigCast video source and reports playing, then ended (or failed). */
  public play(moduleId: string, play: ClipVideoPlay): void {
    this.cancel(moduleId);
    const cancelled = { value: false }; const entry: Running = { playbackId: play.playbackId, cancelled };
    this.running.set(moduleId, entry);
    const work = play.url === '' && play.embedUrl !== undefined ? this.runWindow(moduleId, play, entry) : this.run(moduleId, play, entry);
    void work.catch((error: unknown) => {
      if (cancelled.value) return;
      this.finish(moduleId, entry); entry.cleanup?.();
      const message = error instanceof Error ? error.message : String(error);
      this.options.logger?.warn('A clip could not play in the SprigCast video source', { moduleId, error: message });
      this.options.report(moduleId, play.playbackId, 'failed', { error: message.slice(0, 300) });
    });
  }

  /** The clip was stopped (scene change, disabled, raid handoff): stop the video and show nothing. */
  public stop(moduleId: string): void {
    const wasRunning = this.running.has(moduleId) || this.shown.has(moduleId);
    this.cancel(moduleId); this.shown.delete(moduleId);
    if (!wasRunning) return;
    void this.inOrder(moduleId, async () => {
      const link = await this.options.sprigcast(); const module = CLIP_VIDEO_MODULES[moduleId];
      if (link === undefined || module === undefined) return;
      await link.request('media.stop', { media: module.sourceName });
    }).catch(() => { /* Not loaded or closed: nothing is showing. */ });
  }

  /** SprigCast commands for one extension run one after another, so a stop never lands after the next clip's start. */
  private readonly order = new Map<string, Promise<unknown>>();
  private async inOrder<T>(moduleId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.order.get(moduleId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(work);
    this.order.set(moduleId, next);
    try { return await next; } finally { if (this.order.get(moduleId) === next) this.order.delete(moduleId); }
  }

  private cancel(moduleId: string): void {
    const entry = this.running.get(moduleId); if (entry === undefined) return;
    entry.cancelled.value = true; if (entry.timer !== undefined) clearTimeout(entry.timer); this.running.delete(moduleId);
    entry.cleanup?.();
  }

  private finish(moduleId: string, entry: Running): void {
    if (entry.timer !== undefined) clearTimeout(entry.timer);
    if (this.running.get(moduleId) === entry) this.running.delete(moduleId);
  }

  /**
   * Another channel's clip (Raid Scout): open the Edge window, show the hidden window capture and unmute Edge's sound
   * row once the clip page has loaded, then after the clip's length hide, mute and close everything again.
   */
  private async runWindow(moduleId: string, play: ClipVideoPlay, entry: Running): Promise<void> {
    const win = CLIP_VIDEO_MODULES[moduleId]?.window; const opener = this.options.clipWindow;
    const clip = twitchClipSlug(play.embedUrl);
    if (win === undefined || opener === undefined || clip === undefined) throw new Error('This clip cannot play in the Edge window.');
    const cancelled = (): boolean => entry.cancelled.value;
    const link = await this.options.sprigcast(); if (link === undefined) throw new Error('SprigCast is not connected.');
    const holders = await sprigsHolding(link, win.sourceName);
    if (holders.length === 0) throw new Error('The SprigCast window source is not under a Raid Scout page. Press Set it up for me.');
    const hasSound = sourceRows(await link.request('sources.list')).some((row) => row.name === win.soundName && row.kind === 'app_audio');
    if (cancelled()) return;
    const durationMs = play.durationMs !== undefined && play.durationMs > 0 ? play.durationMs : 30_000;
    const handle = opener.open(clip, durationMs);
    let shown = false;
    entry.cleanup = () => {
      entry.cleanup = undefined; handle.close();
      if (!shown) return;
      void this.inOrder(moduleId, async () => {
        for (const sprig of holders) await link.request('item.hide', { item: win.sourceName, sprig }).catch(() => undefined);
        if (hasSound) await link.request('sound.mute', { sound: win.soundName, muted: true }).catch(() => undefined);
      }).catch(() => undefined);
    };
    await handle.ready;
    if (cancelled()) return;
    const volumeDb = play.volume <= 0 ? -100 : Math.max(-100, Math.min(0, Math.round(20 * Math.log10(play.volume) * 100) / 100));
    await this.inOrder(moduleId, async () => {
      if (cancelled()) return;
      shown = true;
      for (const sprig of holders) await link.request('item.show', { item: win.sourceName, sprig });
      if (hasSound) {
        await link.request('sound.volume', { sound: win.soundName, db: volumeDb }).catch(() => undefined);
        await link.request('sound.mute', { sound: win.soundName, muted: play.muted });
      }
    });
    if (cancelled()) return;
    this.options.report(moduleId, play.playbackId, 'playing', { durationMs });
    // Twitch's player takes a moment to start after the page loads.
    entry.timer = setTimeout(() => {
      if (cancelled()) return;
      this.finish(moduleId, entry); entry.cleanup?.();
      this.options.report(moduleId, play.playbackId, 'ended');
    }, durationMs + 1_500);
  }

  private async run(moduleId: string, play: ClipVideoPlay, entry: Running): Promise<void> {
    const module = CLIP_VIDEO_MODULES[moduleId]; if (module === undefined) throw new Error('This extension cannot use a SprigCast video source.');
    // Read through a function: the flag changes while this waits, which a narrowed check can't see.
    const cancelled = (): boolean => entry.cancelled.value;
    const file = await this.localFile(moduleId, play.url);
    if (cancelled()) return;
    const link = await this.options.sprigcast(); if (link === undefined) throw new Error('SprigCast is not connected.');
    const volumeDb = play.volume <= 0 ? -100 : Math.max(-100, Math.min(0, Math.round(20 * Math.log10(play.volume) * 100) / 100));
    const started = await this.inOrder(moduleId, async () => {
      if (cancelled()) return false;
      await link.request('source.set', { source: module.sourceName, settings: { path: file, loop: false, restart_on_show: false, clear_on_end: true, muted: play.muted, volume_db: volumeDb } });
      this.shown.add(moduleId);
      // A new file starts by itself; the same clip again (or after a stop) needs a start from the beginning.
      await link.request('media.restart', { media: module.sourceName }).catch(() => undefined);
      return true;
    });
    if (!started || cancelled()) return;
    const startedAt = Date.now(); const startTimeoutMs = this.options.startTimeoutMs ?? 20_000; const pollMs = this.options.pollMs ?? 500;
    let playing = false; let playingAt = 0; let durationMs = play.durationMs;
    const poll = async (): Promise<void> => {
      if (cancelled()) return;
      let status: Record<string, unknown> = {};
      try { status = record(await link.request('media.status', { media: module.sourceName })); } catch { /* Try again on the next poll. */ }
      if (cancelled()) return;
      const state = typeof status['state'] === 'string' ? status['state'] : '';
      const duration = typeof status['duration'] === 'number' && status['duration'] > 0 ? Math.round(status['duration'] * 1_000) : undefined;
      if (duration !== undefined) durationMs = duration;
      if (!playing && state === 'playing') {
        playing = true; playingAt = Date.now();
        this.options.report(moduleId, play.playbackId, 'playing', durationMs === undefined ? {} : { durationMs });
      } else if (playing && (state === 'ended' || state === 'stopped')) {
        this.finish(moduleId, entry); this.options.report(moduleId, play.playbackId, 'ended'); return;
      }
      if (!playing && Date.now() - startedAt > startTimeoutMs) throw new Error(state === 'unloaded' ? 'The SprigCast video source is not in the bloom on air.' : 'The SprigCast video source did not start the clip.');
      // A clip that never reports its end still finishes a little after its length.
      if (playing && Date.now() - playingAt > (durationMs ?? 60_000) + 10_000) { this.finish(moduleId, entry); this.options.report(moduleId, play.playbackId, 'ended'); return; }
      entry.timer = setTimeout(() => { void poll().catch((error: unknown) => { if (cancelled()) return; this.finish(moduleId, entry); this.options.report(moduleId, play.playbackId, 'failed', { error: error instanceof Error ? error.message : String(error) }); }); }, pollMs);
    };
    await poll();
  }

  /** The clip as a file on this PC: the private cache copy, downloaded first when the extension sent a Twitch address. */
  private async localFile(moduleId: string, url: string): Promise<string> {
    let cacheUrl = url;
    if (/^https:/iu.test(url)) {
      const host = new URL(url).hostname;
      if (!TRUSTED_CLIP_HOST.test(host)) throw new Error('Only Twitch clip video can play in the SprigCast video source.');
      cacheUrl = await this.options.cacheClip(moduleId, url, createHash('sha256').update(url.split('?')[0] ?? url).digest('hex').slice(0, 40));
    }
    const match = /^\/overlay\/cache\/([a-f0-9]{64}\.mp4)$/u.exec(new URL(cacheUrl, 'http://localhost').pathname);
    if (match?.[1] === undefined) throw new Error('The clip is not in the private clip cache.');
    const file = join(this.options.cacheDirectory, basename(match[1]));
    const info = await stat(file).catch(() => undefined);
    if (info?.isFile() !== true || info.size === 0) throw new Error('The cached clip file is missing.');
    return file;
  }

  /** What "Check" shows: is SprigCast ready, does the video source exist, and is it under each page? */
  public async check(moduleId: string): Promise<ClipVideoSetupResult> { return await this.inspect(moduleId, false); }

  /** "Set it up for me": makes the video source and puts it under every page of this extension. */
  public async setUp(moduleId: string): Promise<ClipVideoSetupResult> { return await this.inspect(moduleId, true); }

  private async inspect(moduleId: string, apply: boolean): Promise<ClipVideoSetupResult> {
    const module = CLIP_VIDEO_MODULES[moduleId];
    if (module === undefined) throw new ClipVideoError(400, 'This extension cannot use a SprigCast video source.');
    const base = { moduleId, sourceName: module.sourceName };
    const link = await this.options.sprigcast();
    if (link === undefined) return { ...base, connected: false, ready: false, sourceExists: false, missingFeatures: [], places: [], message: 'Pick SprigCast as your streaming app and connect it under Scene connections first.' };
    const missingFeatures = CLIP_VIDEO_SETUP_FEATURES.filter((feature) => !link.features.has(feature));
    const sources = sourceRows(await link.request('sources.list'));
    const mine = sources.find((row) => row.name === module.sourceName);
    if (mine !== undefined && mine.kind !== 'media') throw new ClipVideoError(409, `SprigCast already has a source called ${module.sourceName} that isn't a video source. Rename it, then try again.`);
    // The Edge window for other channels' clips (Raid Scout), where Edge is on this PC.
    const win = module.window !== undefined && this.options.clipWindow?.available() === true ? module.window : undefined;
    const winSource = win === undefined ? undefined : sources.find((row) => row.name === win.sourceName);
    const soundSource = win === undefined ? undefined : sources.find((row) => row.name === win.soundName);
    for (const [row, kind] of [[winSource, 'window_capture'], [soundSource, 'app_audio']] as const) {
      if (row !== undefined && row.kind !== kind) throw new ClipVideoError(409, `SprigCast already has a source called ${row.name} of another kind. Rename it, then try again.`);
    }
    if (missingFeatures.length > 0) return { ...base, app: 'sprigcast', connected: true, ready: false, sourceExists: mine !== undefined, missingFeatures, places: [], message: 'Update SprigCast to its newest build: this needs its layout tools.' };
    const pageIds = new Set<string>();
    for (const row of sources.filter((candidate) => candidate.kind === 'browser')) {
      const settings = record(record(await link.request('source.get', { source: row.id || row.name }))['settings']);
      if (typeof settings['url'] === 'string' && isClipPageUrl(settings['url'], moduleId)) pageIds.add(row.id || row.name);
    }
    const places: ClipPagePlace[] = []; const seen = new Set<string>();
    for (const bloom of bloomNames(await link.request('blooms.list'))) {
      const answer = record(await link.request('layout.get', { bloom }));
      for (const [shape, layout] of Object.entries(record(answer['shapes']))) {
        const rows = record(layout)['items'];
        findClipPages(Array.isArray(rows) ? rows as LayoutItem[] : [], shape, (item) => pageIds.has(item.id) || pageIds.has(item.name), { bloom }, bloom, seen, places);
      }
    }
    const sourceId = mine?.id ?? ''; const windowId = winSource?.id ?? '';
    const rows = places.map((place) => {
      const holderLabel = 'bloom' in place.holder ? `${place.where} (bloom)` : place.where;
      if ('bloom' in place.holder) return { place, mediaPlaced: false, windowPlaced: false, row: { where: holderLabel, shape: place.shape, page: place.pageName, status: 'skipped' as const, detail: 'This page sits straight in the bloom; put it in the bloom\'s sprig to use the video source.' } };
      if (videoAreaInLayout(place.page) === undefined) return { place, mediaPlaced: false, windowPlaced: false, row: { where: holderLabel, shape: place.shape, page: place.pageName, status: 'skipped' as const, detail: 'This page is turned, or SprigCast does not know its size yet. Place the video source by hand.' } };
      const mediaPlaced = mine !== undefined && alreadyPlaced(place, sourceId, module.sourceName);
      const windowPlaced = win === undefined || (winSource !== undefined && alreadyPlaced(place, windowId, win.sourceName));
      const placed = mediaPlaced && windowPlaced;
      return { place, mediaPlaced, windowPlaced, row: { where: holderLabel, shape: place.shape, page: place.pageName, status: placed ? 'placed' as const : 'needs-setup' as const } };
    });
    const todo = rows.filter((entry) => entry.row.status === 'needs-setup');
    const sourceExists = mine !== undefined;
    const allExist = sourceExists && (win === undefined || (winSource !== undefined && soundSource !== undefined));
    const windowNote = module.window === undefined ? undefined
      : win === undefined ? 'Other channels\' clips need Microsoft Edge on this PC; they show their still picture instead.'
        : 'Other channels\' clips play in a small Edge window that SprigCast captures, until SprigCast\'s Web pages can play them. The window opens on your screen during the raid clip.';
    if (!apply || (todo.length === 0 && allExist)) {
      const ready = sourceExists && rows.some((entry) => entry.row.status === 'placed');
      if (ready) this.ready.add(moduleId); else this.ready.delete(moduleId);
      if (win !== undefined && winSource !== undefined && rows.some((entry) => entry.windowPlaced && entry.row.status !== 'skipped')) this.windowReady.add(moduleId); else this.windowReady.delete(moduleId);
      const needed = sourceExists ? todo.length : rows.filter((entry) => entry.row.status !== 'skipped').length;
      const message = rows.length === 0 ? `No ${module.label} page was found in SprigCast. Add its page first.`
        : ready && needed === 0 ? `Ready: clips play in the ${module.sourceName} video source.`
          : needed === 0 ? 'No page can use the video source as it is placed now.'
            : `${String(needed)} of ${String(rows.length)} pages need the video source. Press Set it up for me.`;
      return { ...base, app: 'sprigcast', connected: true, ready, sourceExists, missingFeatures, places: rows.map((entry) => entry.row), message, ...(windowNote === undefined ? {} : { windowNote }), ...(apply ? { changed: false } : {}) };
    }
    if (rows.length === 0) return { ...base, app: 'sprigcast', connected: true, ready: false, sourceExists, missingFeatures, places: [], changed: false, message: `No ${module.label} page was found in SprigCast. Add its page first.` };
    const [streaming, recording] = await Promise.all([link.request('stream.status'), link.request('record.status')]);
    if (record(streaming)['on'] === true || record(recording)['on'] === true || record(recording)['paused'] === true) throw new ClipVideoError(409, 'SprigCast is live or recording. Set this up when you are off air.');
    // Measure the Edge window once (its title bar), so the capture shows only the clip.
    let crop: ClipWindowCrop | undefined; let cropNote: string | undefined;
    if (win !== undefined && this.options.clipWindow !== undefined && todo.some((entry) => !entry.windowPlaced)) {
      const handle = this.options.clipWindow.open(undefined, 5_000);
      try { crop = cropFromMetrics(await handle.ready); } catch { cropNote = 'Edge did not open the measuring window, so the window source is not cropped. Crop its title bar in SprigCast.'; } finally { handle.close(); }
    }
    const steps: Readonly<Record<string, unknown>>[] = [];
    if (!sourceExists) steps.push({ do: 'source.new', name: module.sourceName, kind: 'media', settings: { path: '', loop: false, restart_on_show: false, clear_on_end: true } });
    if (win !== undefined && winSource === undefined) steps.push({ do: 'source.new', name: win.sourceName, kind: 'window_capture', settings: { title: CLIP_WINDOW_TITLE, process: CLIP_WINDOW_PROCESS, match: 'title', cursor: false } });
    if (win !== undefined && soundSource === undefined) {
      steps.push({ do: 'source.new', name: win.soundName, kind: 'app_audio', settings: { preset: 'custom', apps: [CLIP_WINDOW_PROCESS], muted: true } });
      steps.push({ do: 'sound.mute', sound: win.soundName, muted: true });
    }
    for (const entry of todo) {
      if (!entry.mediaPlaced) steps.push(...placementSteps(entry.place, sourceId, module.sourceName));
      if (win !== undefined && !entry.windowPlaced) steps.push(...placementSteps(entry.place, windowId, win.sourceName, { ...(crop === undefined ? {} : { crop }), hidden: true }));
    }
    const undoable = link.features.has('edit.undo') && steps.length <= 100;
    if (undoable) {
      const answer = record(await link.request('steps', { steps, one_step: true }));
      if (answer['applied'] === false) throw new ClipVideoError(502, 'SprigCast did not make the change.');
    } else {
      for (const step of steps) { const { do: action, ...fields } = step; await link.request(String(action), fields); }
    }
    this.options.logger?.info('SprigCast clip video source set up', { moduleId, pages: todo.length, created: !sourceExists });
    const after = await this.inspect(moduleId, false);
    return { ...after, changed: true, undoable, ...(cropNote === undefined ? {} : { windowNote: cropNote }) };
  }
}

export class ClipVideoError extends Error { public constructor(public readonly statusCode: number, message: string) { super(message); } }

function record(value: unknown): Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function sourceRows(answer: unknown): readonly { readonly id: string; readonly name: string; readonly kind: string }[] {
  const list = record(answer)['sources'];
  return (Array.isArray(list) ? list : []).map((row) => { const value = record(row); return { id: typeof value['id'] === 'string' ? value['id'] : '', name: typeof value['name'] === 'string' ? value['name'] : '', kind: typeof value['kind'] === 'string' ? value['kind'] : '' }; });
}
/** The sprigs (ids) that hold an item with this name, in any bloom: where to show and hide it. */
async function sprigsHolding(link: SprigCastLink, itemName: string): Promise<readonly string[]> {
  const found = new Set<string>();
  const walk = (rows: unknown, sprig: string | undefined): void => {
    for (const row of Array.isArray(rows) ? rows as LayoutItem[] : []) {
      if (row.sprig) walk(row.items, row.id);
      else if (sprig !== undefined && row.name === itemName) found.add(sprig);
    }
  };
  for (const bloom of bloomNames(await link.request('blooms.list'))) {
    const answer = record(await link.request('layout.get', { bloom }));
    for (const layout of Object.values(record(answer['shapes']))) walk(record(layout)['items'], undefined);
  }
  return [...found];
}
function bloomNames(answer: unknown): readonly string[] {
  const list = record(answer)['blooms'];
  return (Array.isArray(list) ? list : []).map((row) => record(row)['name']).filter((name): name is string => typeof name === 'string' && name !== '');
}
