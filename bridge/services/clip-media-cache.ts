import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const MAXIMUM_TTL_SECONDS = 86_400;
const MAXIMUM_FILE_BYTES = 52_428_800;
const MAXIMUM_CACHE_BYTES = 262_144_000;
const MAXIMUM_REDIRECTS = 3;

export interface ClipMediaCacheRequest { readonly sourceUrl: string; readonly cacheKey: string; readonly ttlSeconds: number; readonly maximumBytes: number }
export interface ClipMediaCacheResult { readonly url: string; readonly cacheHit: boolean; readonly bytes: number; readonly expiresAt: string }

export class ClipMediaCache {
  public constructor(private readonly root: string, private readonly request: typeof fetch = fetch) {}

  public async fetch(moduleId: string, input: ClipMediaCacheRequest, signal: AbortSignal): Promise<ClipMediaCacheResult> {
    const ttlSeconds = Math.min(MAXIMUM_TTL_SECONDS, Math.max(60, input.ttlSeconds));
    const maximumBytes = Math.min(MAXIMUM_FILE_BYTES, Math.max(1_048_576, input.maximumBytes));
    const filename = `${createHash('sha256').update(`${moduleId}\0${input.cacheKey}`).digest('hex')}.mp4`;
    const path = join(this.root, filename); await mkdir(this.root, { recursive: true, mode: 0o700 }); await this.prune();
    const existing = await stat(path).catch(() => undefined);
    if (existing?.isFile() && existing.size > 0 && existing.size <= maximumBytes && Date.now() - existing.mtimeMs < ttlSeconds * 1_000) return { url: `/overlay/cache/${filename}`, cacheHit: true, bytes: existing.size, expiresAt: new Date(existing.mtimeMs + ttlSeconds * 1_000).toISOString() };
    const bytes = await this.download(input.sourceUrl, maximumBytes, signal);
    const temporary = `${path}.${randomUUID()}.tmp`; await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
    try { await rm(path, { force: true }); await rename(temporary, path); } catch (error) { await rm(temporary, { force: true }).catch(() => undefined); throw error; }
    return { url: `/overlay/cache/${filename}`, cacheHit: false, bytes: bytes.byteLength, expiresAt: new Date(Date.now() + ttlSeconds * 1_000).toISOString() };
  }

  private async download(source: string, maximumBytes: number, signal: AbortSignal): Promise<Uint8Array> {
    let url = trustedTwitchMediaUrl(source);
    for (let redirect = 0; redirect <= MAXIMUM_REDIRECTS; redirect += 1) {
      const response = await this.request(url.href, { redirect: 'manual', signal, headers: { accept: 'video/mp4,application/octet-stream;q=0.8' } });
      if (response.status >= 300 && response.status < 400) { const location = response.headers.get('location'); if (location === null || redirect === MAXIMUM_REDIRECTS) throw new Error('Twitch clip cache redirect was rejected.'); url = trustedTwitchMediaUrl(new URL(location, url).href); continue; }
      if (!response.ok || response.body === null) throw new Error(`Twitch clip cache download returned HTTP ${String(response.status)}.`);
      const length = Number(response.headers.get('content-length') ?? '0'); if (Number.isFinite(length) && length > maximumBytes) throw new Error('Twitch clip exceeds the configured cache file limit.');
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
      try { for (;;) { const next = await reader.read(); if (next.done) break; total += next.value.byteLength; if (total > maximumBytes) { await reader.cancel(); throw new Error('Twitch clip exceeds the configured cache file limit.'); } chunks.push(next.value); } } finally { reader.releaseLock(); }
      if (total === 0) throw new Error('Twitch clip cache download was empty.');
      const combined = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; } return combined;
    }
    throw new Error('Twitch clip cache redirect limit exceeded.');
  }

  private async prune(): Promise<void> {
    const entries = await readdir(this.root, { withFileTypes: true }).catch(() => []); const files: Array<{ path: string; size: number; mtimeMs: number }> = [];
    for (const entry of entries.slice(0, 1_000)) { if (!entry.isFile() || !/^[a-f0-9]{64}\.mp4$/u.test(entry.name)) continue; const path = join(this.root, entry.name); const info = await stat(path).catch(() => undefined); if (!info?.isFile()) continue; if (Date.now() - info.mtimeMs > MAXIMUM_TTL_SECONDS * 1_000) { await rm(path, { force: true }); continue; } files.push({ path, size: info.size, mtimeMs: info.mtimeMs }); }
    let total = files.reduce((sum, file) => sum + file.size, 0); for (const file of files.sort((a, b) => a.mtimeMs - b.mtimeMs)) { if (total <= MAXIMUM_CACHE_BYTES) break; await rm(file.path, { force: true }); total -= file.size; }
  }
}

function trustedTwitchMediaUrl(value: string): URL {
  const url = new URL(value); const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.hash !== '' || !(host === 'twitchcdn.net' || host.endsWith('.twitchcdn.net') || host === 'ttvnw.net' || host.endsWith('.ttvnw.net'))) throw new Error('Clip caching accepts only Twitch CDN HTTPS URLs.');
  return url;
}

export async function readCachedClip(root: string, filename: string): Promise<{ readonly bytes: Buffer; readonly modifiedAt: number } | undefined> {
  if (!/^[a-f0-9]{64}\.mp4$/u.test(filename)) return undefined; const path = join(root, filename); const info = await stat(path).catch(() => undefined);
  if (!info?.isFile() || info.size < 1 || info.size > MAXIMUM_FILE_BYTES || Date.now() - info.mtimeMs > MAXIMUM_TTL_SECONDS * 1_000) { if (info !== undefined) await rm(path, { force: true }).catch(() => undefined); return undefined; }
  return { bytes: await readFile(path), modifiedAt: info.mtimeMs };
}
