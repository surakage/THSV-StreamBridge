import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from './logger.js';

/**
 * A stopgap for raid targets' clips on SprigCast.
 *
 * Twitch gives no video file for another channel's clip: only its own player (an iframe), which streams H.264. The
 * Chromium inside SprigCast's Web pages can't play H.264, but Microsoft Edge can. So for the length of the clip
 * StreamBridge opens a small Edge app window (its own private profile) showing the clip page from localhost, and
 * SprigCast shows that window with a window capture placed under the Raid Scout page. The window closes when the
 * clip ends. This goes away once SprigCast's Web pages can play H.264.
 */

/** The window's title: SprigCast's window capture finds it by this exact title in msedge.exe. */
export const CLIP_WINDOW_TITLE = 'StreamBridge Raid Clip';
export const CLIP_WINDOW_PROCESS = 'msedge.exe';
/** The page's size inside the window, in screen units (DIPs). */
export const CLIP_WINDOW_SIZE = Object.freeze({ width: 1280, height: 720 });

/** Sizes the clip page measured in its window: outer is the whole window, inner the page. */
export interface ClipWindowMetrics { readonly outerWidth: number; readonly outerHeight: number; readonly innerWidth: number; readonly innerHeight: number; readonly dpr: number }
export interface ClipWindowCrop { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }

/** What to cut off a capture of the window so only the page shows: the title bar on top and any border, in pixels. */
export function cropFromMetrics(metrics: ClipWindowMetrics): ClipWindowCrop {
  const side = Math.max(0, Math.round(((metrics.outerWidth - metrics.innerWidth) / 2) * metrics.dpr));
  const top = Math.max(0, Math.round((metrics.outerHeight - metrics.innerHeight) * metrics.dpr) - side);
  return { left: side, top, right: side, bottom: side };
}

export function parseMetrics(query: URLSearchParams): ClipWindowMetrics | undefined {
  const value = (key: string): number => Number(query.get(key));
  const metrics = { outerWidth: value('ow'), outerHeight: value('oh'), innerWidth: value('iw'), innerHeight: value('ih'), dpr: value('dpr') };
  const sane = Object.values(metrics).every((entry) => Number.isFinite(entry) && entry > 0 && entry < 20_000) && metrics.dpr <= 8;
  return sane ? metrics : undefined;
}

/** The Twitch clip's slug from its embed address, when it is one. */
export function twitchClipSlug(embedUrl: unknown): string | undefined {
  if (typeof embedUrl !== 'string') return undefined;
  try {
    const url = new URL(embedUrl);
    const clip = url.searchParams.get('clip') ?? '';
    return url.protocol === 'https:' && url.hostname === 'clips.twitch.tv' && /^[A-Za-z0-9_-]{1,120}$/u.test(clip) ? clip : undefined;
  } catch { return undefined; }
}

/** Microsoft Edge on this PC: the usual install places. */
export function findEdge(env: NodeJS.ProcessEnv = process.env, exists: (path: string) => boolean = existsSync): string | undefined {
  for (const root of [env['ProgramFiles(x86)'], env['ProgramFiles'], env['LOCALAPPDATA']]) {
    if (root === undefined || root === '') continue;
    const candidate = join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe');
    if (exists(candidate)) return candidate;
  }
  return undefined;
}

/** Edge's command line for the clip window. */
export function edgeArguments(url: string, profileDirectory: string, size: { readonly width: number; readonly height: number }): readonly string[] {
  return [
    `--app=${url}`, `--user-data-dir=${profileDirectory}`,
    `--window-size=${String(size.width)},${String(size.height)}`, '--window-position=0,0',
    '--no-first-run', '--no-default-browser-check', '--disable-sync', '--hide-crash-restore-bubble',
    '--autoplay-policy=no-user-gesture-required',
    // Keep drawing while covered by a game: a covered window's picture would freeze in SprigCast.
    '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
  ];
}

export interface ClipWindowHandle {
  /** Settles when the page in the window has loaded (with its measured size), or fails when it never does. */
  readonly ready: Promise<ClipWindowMetrics>;
  close(): void;
}

export interface ClipWindowOpener {
  available(): boolean;
  /** Opens the window: the clip when a slug is given, or a blank page that only measures the window. */
  open(clip: string | undefined, durationMs: number): ClipWindowHandle;
}

export interface EdgeClipWindowOptions {
  readonly port: number;
  readonly profileDirectory: string;
  readonly platform?: NodeJS.Platform;
  readonly edgePath?: () => string | undefined;
  readonly launch?: (file: string, args: readonly string[]) => Pick<ChildProcess, 'pid' | 'once' | 'kill'>;
  readonly closeTree?: (pid: number) => void;
  readonly readyTimeoutMs?: number;
  readonly logger?: Pick<Logger, 'info' | 'warn' | 'debug'>;
}

export class EdgeClipWindow implements ClipWindowOpener {
  private readonly waiting = new Map<string, (metrics: ClipWindowMetrics) => void>();
  private current: { readonly close: () => void } | undefined;
  private frame = { width: 16, height: 40 };

  public constructor(private readonly options: EdgeClipWindowOptions) {}

  public available(): boolean {
    return (this.options.platform ?? process.platform) === 'win32' && this.edge() !== undefined;
  }

  public open(clip: string | undefined, durationMs: number): ClipWindowHandle {
    this.current?.close();
    const token = randomBytes(16).toString('hex');
    const edge = this.edge();
    const query = new URLSearchParams({ token, ...(clip === undefined ? {} : { clip, end: String(Math.max(5_000, Math.round(durationMs)) + 3_000) }) });
    const url = `http://localhost:${String(this.options.port)}/overlay/clip-window?${query.toString()}`;
    let child: Pick<ChildProcess, 'pid' | 'once' | 'kill'> | undefined;
    let timer: NodeJS.Timeout | undefined;
    let closed = false;
    const close = (): void => {
      if (closed) return; closed = true;
      if (timer !== undefined) clearTimeout(timer);
      this.waiting.delete(token);
      if (this.current?.close === close) this.current = undefined;
      const pid = child?.pid;
      if (pid !== undefined) this.closeTree(pid, child);
    };
    const ready = new Promise<ClipWindowMetrics>((resolve, reject) => {
      if (edge === undefined) { reject(new Error('Microsoft Edge was not found on this PC.')); return; }
      timer = setTimeout(() => { this.waiting.delete(token); reject(new Error('The Edge clip window did not open in time.')); }, this.options.readyTimeoutMs ?? 25_000);
      timer.unref();
      this.waiting.set(token, (metrics) => {
        if (timer !== undefined) clearTimeout(timer);
        this.frame = { width: Math.max(0, metrics.outerWidth - metrics.innerWidth), height: Math.max(0, metrics.outerHeight - metrics.innerHeight) };
        resolve(metrics);
      });
      const size = { width: CLIP_WINDOW_SIZE.width + this.frame.width, height: CLIP_WINDOW_SIZE.height + this.frame.height };
      try {
        child = (this.options.launch ?? defaultLaunch)(edge, edgeArguments(url, this.options.profileDirectory, size));
        child.once('error', (error: Error) => { this.options.logger?.warn('Edge clip window failed to start', { error: error.message }); });
      } catch (error) { clearTimeout(timer); this.waiting.delete(token); reject(error instanceof Error ? error : new Error(String(error))); }
    });
    ready.catch(() => undefined);
    this.current = { close };
    return { ready, close };
  }

  /** The clip page in the window reports in: answers false for a page this window didn't open. */
  public accept(token: string, metrics: ClipWindowMetrics): boolean {
    const resolve = this.waiting.get(token); if (resolve === undefined) return false;
    this.waiting.delete(token); resolve(metrics); return true;
  }

  public closeAll(): void { this.current?.close(); }

  private edge(): string | undefined { return (this.options.edgePath ?? findEdge)(); }

  private closeTree(pid: number, child: Pick<ChildProcess, 'kill'> | undefined): void {
    try {
      if (this.options.closeTree !== undefined) { this.options.closeTree(pid); return; }
      if ((this.options.platform ?? process.platform) === 'win32') {
        spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).once('error', () => undefined);
      } else child?.kill();
    } catch (error) { this.options.logger?.debug('Edge clip window close failed', { error }); }
  }
}

function defaultLaunch(file: string, args: readonly string[]): ChildProcess {
  return spawn(file, [...args], { stdio: 'ignore', windowsHide: false, detached: false });
}
