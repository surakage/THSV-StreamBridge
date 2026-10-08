import { mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClipMediaCache, DEFAULT_MAXIMUM_CACHE_BYTES, readCachedClip } from '../../bridge/services/clip-media-cache.js';

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe('ClipMediaCache', () => {
  it('caches bounded Twitch CDN video and reuses it without a second request', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-clip-cache-')); temporary.push(root);
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-length': '3', 'content-type': 'video/mp4' } }));
    const cache = new ClipMediaCache(root, request); const input = { sourceUrl: 'https://production.assets.clips.twitchcdn.net/test.mp4', cacheKey: 'clip-one', ttlSeconds: 3600, maximumBytes: 1_048_576 };
    const first = await cache.fetch('thsv.random-clip-player', input, new AbortController().signal);
    const second = await cache.fetch('thsv.random-clip-player', input, new AbortController().signal);
    expect(first).toMatchObject({ cacheHit: false, bytes: 3 }); expect(second).toMatchObject({ cacheHit: true, bytes: 3, url: first.url }); expect(request).toHaveBeenCalledOnce();
    const filename = first.url.split('/').at(-1) ?? ''; await expect(readCachedClip(root, filename)).resolves.toMatchObject({ bytes: Buffer.from([1, 2, 3]) });
  });

  it('keeps the shared cache within its total size cap by evicting the oldest clips first', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-clip-cache-cap-')); temporary.push(root);
    const clip = 400_000;
    const request = vi.fn<typeof fetch>().mockImplementation(async () => new Response(new Uint8Array(clip), { status: 200, headers: { 'content-length': String(clip), 'content-type': 'video/mp4' } }));
    const cache = new ClipMediaCache(root, request, 1_048_576);
    const fetchClip = async (cacheKey: string) => cache.fetch('thsv.random-clip-player', { sourceUrl: 'https://clips.twitchcdn.net/clip.mp4', cacheKey, ttlSeconds: 3600, maximumBytes: 1_048_576 }, new AbortController().signal);
    const nameOf = (url: string) => url.split('/').at(-1) ?? '';
    const oldest = nameOf((await fetchClip('one')).url);
    const middle = nameOf((await fetchClip('two')).url);
    const now = Date.now() / 1_000;
    await utimes(join(root, oldest), now - 120, now - 120); await utimes(join(root, middle), now - 60, now - 60);
    // A stale temporary file from an interrupted download is removed as well.
    const abandoned = `${'a'.repeat(64)}.mp4.${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}.tmp`;
    await writeFile(join(root, abandoned), 'partial'); await utimes(join(root, abandoned), now - 7_200, now - 7_200);
    const newest = nameOf((await fetchClip('three')).url);
    expect((await readdir(root)).sort()).toEqual([middle, newest].sort());
    expect(DEFAULT_MAXIMUM_CACHE_BYTES).toBe(250 * 1_048_576);
  });

  it('accepts the legacy Twitch clip asset host returned by Streamer.bot', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-clip-cache-legacy-')); temporary.push(root);
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([4, 5, 6]), { status: 200, headers: { 'content-length': '3', 'content-type': 'video/mp4' } }));
    const cache = new ClipMediaCache(root, request);
    await expect(cache.fetch('thsv.raid-scout', { sourceUrl: 'https://clips-media-assets2.twitch.tv/AT-cm-test.mp4', cacheKey: 'raid-clip', ttlSeconds: 3600, maximumBytes: 1_048_576 }, new AbortController().signal)).resolves.toMatchObject({ cacheHit: false, bytes: 3 });
  });

  it('accepts the exact Twitch CloudFront clip host returned by Streamer.bot 1.0.7', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-clip-cache-cloudfront-')); temporary.push(root);
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([7, 8, 9]), { status: 200, headers: { 'content-length': '3', 'content-type': 'video/mp4' } }));
    const cache = new ClipMediaCache(root, request);
    await expect(cache.fetch('thsv.random-clip-player', { sourceUrl: 'https://d1ndex63qxojbr.cloudfront.net/nauth/example/landscape/avc/720/index.mp4?sig=test', cacheKey: 'cloudfront-clip', ttlSeconds: 3600, maximumBytes: 1_048_576 }, new AbortController().signal)).resolves.toMatchObject({ cacheHit: false, bytes: 3 });
  });

  it('rejects untrusted hosts, unsafe redirects, and oversized bodies', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-clip-cache-reject-')); temporary.push(root);
    const cache = new ClipMediaCache(root, vi.fn<typeof fetch>());
    await expect(cache.fetch('thsv.random-clip-player', { sourceUrl: 'https://evil.example/clip.mp4', cacheKey: 'x', ttlSeconds: 3600, maximumBytes: 1_048_576 }, new AbortController().signal)).rejects.toThrow('only Twitch CDN');
    await expect(cache.fetch('thsv.random-clip-player', { sourceUrl: 'https://attacker.cloudfront.net/clip.mp4', cacheKey: 'cloudfront-evil', ttlSeconds: 3600, maximumBytes: 1_048_576 }, new AbortController().signal)).rejects.toThrow('only Twitch CDN');
    const redirect = new ClipMediaCache(root, vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://evil.example/file.mp4' } })));
    await expect(redirect.fetch('thsv.random-clip-player', { sourceUrl: 'https://clips.twitchcdn.net/clip.mp4', cacheKey: 'y', ttlSeconds: 3600, maximumBytes: 1_048_576 }, new AbortController().signal)).rejects.toThrow('only Twitch CDN');
    const oversized = new ClipMediaCache(root, vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([1]), { status: 200, headers: { 'content-length': '2000000' } })));
    await expect(oversized.fetch('thsv.random-clip-player', { sourceUrl: 'https://clips.twitchcdn.net/clip.mp4', cacheKey: 'z', ttlSeconds: 3600, maximumBytes: 1_048_576 }, new AbortController().signal)).rejects.toThrow('file limit');
  });
});
