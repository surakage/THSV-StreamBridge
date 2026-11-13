import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

const MAXIMUM_TTL_SECONDS = 86_400;
const MAXIMUM_FILE_BYTES = 52_428_800;
/** Default total size of the shared clip cache (150 MiB). The oldest clips are evicted first. */
export const DEFAULT_MAXIMUM_CACHE_BYTES = 157_286_400;
const STALE_TEMPORARY_MS = 3_600_000;
const MAXIMUM_REDIRECTS = 3;
const TRUSTED_TWITCH_CLIP_ASSET = /^clips-media-assets\d*\.twitch\.tv$/u;
const TRUSTED_TWITCH_CLIP_CLOUDFRONT = /^d1ndex63qxojbr\.cloudfront\.net$/u;

export interface ClipMediaCacheRequest { readonly sourceUrl: string; readonly cacheKey: string; readonly ttlSeconds: number; readonly maximumBytes: number }
export interface ClipMediaCacheResult { readonly url: string; readonly cacheHit: boolean; readonly bytes: number; readonly expiresAt: string }

export class ClipMediaCache {
  private readonly maximumCacheBytes: number;

  public constructor(private readonly root: string, private readonly request: typeof fetch = fetch, maximumCacheBytes = DEFAULT_MAXIMUM_CACHE_BYTES) {
    this.maximumCacheBytes = Math.max(1_048_576, Math.floor(maximumCacheBytes));
  }

  public async fetch(moduleId: string, input: ClipMediaCacheRequest, signal: AbortSignal): Promise<ClipMediaCacheResult> {
    const ttlSeconds = Math.min(MAXIMUM_TTL_SECONDS, Math.max(60, input.ttlSeconds));
    const maximumBytes = Math.min(MAXIMUM_FILE_BYTES, Math.max(1_048_576, input.maximumBytes));
    const filename = `${createHash('sha256').update(`${moduleId}\0${input.cacheKey}`).digest('hex')}.mp4`;
    const path = join(this.root, filename); await mkdir(this.root, { recursive: true, mode: 0o700 }); await this.prune();
    const existing = await stat(path).catch(() => undefined);
    if (existing?.isFile() && existing.size > 0 && existing.size <= maximumBytes && Date.now() - existing.mtimeMs < ttlSeconds * 1_000) return { url: `/overlay/cache/${filename}`, cacheHit: true, bytes: existing.size, expiresAt: new Date(existing.mtimeMs + ttlSeconds * 1_000).toISOString() };
    // Two requests for the same clip at once share one download instead of fetching it twice.
    const running = this.downloads.get(path);
    if (running !== undefined) { const bytes = await running; return { url: `/overlay/cache/${filename}`, cacheHit: true, bytes, expiresAt: new Date(Date.now() + ttlSeconds * 1_000).toISOString() }; }
    const task = this.downloadToFile(input.sourceUrl, path, maximumBytes, signal);
    this.downloads.set(path, task);
    let bytes: number;
    try { bytes = await task; } finally { this.downloads.delete(path); }
    // Enforce the total cap after every download too, keeping the clip that was just requested.
    await this.prune(path);
    return { url: `/overlay/cache/${filename}`, cacheHit: false, bytes, expiresAt: new Date(Date.now() + ttlSeconds * 1_000).toISOString() };
  }

  private readonly downloads = new Map<string, Promise<number>>();

  /** Writes the clip straight to a temporary file as it arrives, so a 50 MB clip never sits in memory. */
  private async downloadToFile(source: string, path: string, maximumBytes: number, signal: AbortSignal): Promise<number> {
    const temporary = `${path}.${randomUUID()}.tmp`;
    const file = await open(temporary, 'wx', 0o600);
    try {
      const total = await this.download(source, maximumBytes, signal, async (chunk) => { await file.write(chunk); });
      await file.close();
      await rm(path, { force: true }); await rename(temporary, path);
      return total;
    } catch (error) {
      await file.close().catch(() => undefined);
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  private async download(source: string, maximumBytes: number, signal: AbortSignal, write: (chunk: Uint8Array) => Promise<void>): Promise<number> {
    let url = trustedTwitchMediaUrl(source);
    for (let redirect = 0; redirect <= MAXIMUM_REDIRECTS; redirect += 1) {
      const response = await this.request(url.href, { redirect: 'manual', signal, headers: { accept: 'video/mp4,application/octet-stream;q=0.8' } });
      if (response.status >= 300 && response.status < 400) { const location = response.headers.get('location'); if (location === null || redirect === MAXIMUM_REDIRECTS) throw new Error('Twitch clip cache redirect was rejected.'); url = trustedTwitchMediaUrl(new URL(location, url).href); continue; }
      if (!response.ok || response.body === null) throw new Error(`Twitch clip cache download returned HTTP ${String(response.status)}.`);
      const length = Number(response.headers.get('content-length') ?? '0'); if (Number.isFinite(length) && length > maximumBytes) throw new Error('Twitch clip exceeds the configured cache file limit.');
      const reader = response.body.getReader(); let total = 0;
      try { for (;;) { const next = await reader.read(); if (next.done) break; total += next.value.byteLength; if (total > maximumBytes) { await reader.cancel(); throw new Error('Twitch clip exceeds the configured cache file limit.'); } await write(next.value); } } finally { reader.releaseLock(); }
      if (total === 0) throw new Error('Twitch clip cache download was empty.');
      return total;
    }
    throw new Error('Twitch clip cache redirect limit exceeded.');
  }

  /** Removes expired, abandoned and over-cap clips. Runs at start and hourly so a quiet cache still empties after a day. */
  public async sweep(): Promise<void> { await this.prune(); }

  private async prune(keep?: string): Promise<void> {
    const entries = await readdir(this.root, { withFileTypes: true }).catch(() => []); const files: Array<{ path: string; size: number; mtimeMs: number }> = [];
    for (const entry of entries.slice(0, 1_000)) {
      if (!entry.isFile()) continue; const path = join(this.root, entry.name);
      // Interrupted downloads leave temporary files behind; remove them once they are clearly abandoned.
      if (/^[a-f0-9]{64}\.mp4\.[0-9a-f-]{36}\.tmp$/u.test(entry.name)) { const info = await stat(path).catch(() => undefined); if (info !== undefined && Date.now() - info.mtimeMs > STALE_TEMPORARY_MS) await rm(path, { force: true }); continue; }
      if (!/^[a-f0-9]{64}\.mp4$/u.test(entry.name)) continue; const info = await stat(path).catch(() => undefined); if (!info?.isFile()) continue; if (Date.now() - info.mtimeMs > MAXIMUM_TTL_SECONDS * 1_000) { await rm(path, { force: true }); continue; } files.push({ path, size: info.size, mtimeMs: info.mtimeMs });
    }
    let total = files.reduce((sum, file) => sum + file.size, 0); for (const file of files.sort((a, b) => a.mtimeMs - b.mtimeMs)) { if (total <= this.maximumCacheBytes) break; if (file.path === keep) continue; await rm(file.path, { force: true }); total -= file.size; }
  }
}

function trustedTwitchMediaUrl(value: string): URL {
  const url = new URL(value); const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.hash !== '' || !(host === 'twitchcdn.net' || host.endsWith('.twitchcdn.net') || host === 'ttvnw.net' || host.endsWith('.ttvnw.net') || TRUSTED_TWITCH_CLIP_ASSET.test(host) || TRUSTED_TWITCH_CLIP_CLOUDFRONT.test(host))) throw new Error('Clip caching accepts only Twitch CDN HTTPS URLs.');
  return url;
}

/** Where a cached clip lives and how big it is, so it can be streamed in pieces instead of read whole. */
export async function cachedClipFile(root: string, filename: string): Promise<{ readonly path: string; readonly size: number; readonly modifiedAt: number } | undefined> {
  if (!/^[a-f0-9]{64}\.mp4$/u.test(filename)) return undefined; const path = join(root, filename); const info = await stat(path).catch(() => undefined);
  if (!info?.isFile() || info.size < 1 || info.size > MAXIMUM_FILE_BYTES || Date.now() - info.mtimeMs > MAXIMUM_TTL_SECONDS * 1_000) { if (info !== undefined) await rm(path, { force: true }).catch(() => undefined); return undefined; }
  return { path, size: info.size, modifiedAt: info.mtimeMs };
}

export async function readCachedClip(root: string, filename: string): Promise<{ readonly bytes: Buffer; readonly modifiedAt: number } | undefined> {
  if (!/^[a-f0-9]{64}\.mp4$/u.test(filename)) return undefined; const path = join(root, filename); const info = await stat(path).catch(() => undefined);
  if (!info?.isFile() || info.size < 1 || info.size > MAXIMUM_FILE_BYTES || Date.now() - info.mtimeMs > MAXIMUM_TTL_SECONDS * 1_000) { if (info !== undefined) await rm(path, { force: true }).catch(() => undefined); return undefined; }
  return { bytes: await readFile(path), modifiedAt: info.mtimeMs };
}
