import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BrowserOverlayHub } from '../../bridge/services/browser-overlay-hub.js';
import { SprigCastClipVideo, clipVideoArea, ensureClipVideoPlaceholder, isClipPageUrl, placementSteps, videoAreaInLayout, type ClipPagePlace, type LayoutItem, type SprigCastLink } from '../../bridge/services/sprigcast-clip-video.js';

const FILE = `${'a'.repeat(64)}.mp4`;

function page(overrides: Partial<LayoutItem> = {}): LayoutItem {
  return { id: 'page-1', name: 'Clips', kind: 'browser', sprig: false, x: 0, y: 0, scale_x: 1, scale_y: 1, rotation: 0, crop: { left: 0, top: 0, right: 0, bottom: 0 }, bounds: { mode: 'off', width: 0, height: 0, align: 'center' }, source_size: { width: 1920, height: 1080 }, ...overrides };
}

describe('clip video area', () => {
  it('is the whole media frame of the clip page, as measured in Chromium', () => {
    expect(clipVideoArea(1920, 1080)).toEqual({ x: 160, y: 90, width: 1600, height: 900 });
    expect(clipVideoArea(400, 300)).toEqual({ x: 9, y: 9, width: 382, height: 282 });
    const small = clipVideoArea(1280, 720);
    expect(small.x).toBeCloseTo(21.6, 1); expect(small.width).toBeCloseTo(1236.8, 1);
  });

  it('carries the area through the page item scale, position and fit box', () => {
    expect(videoAreaInLayout(page({ x: 100, y: 50, scale_x: 0.5, scale_y: 0.5 }))).toEqual({ x: 180, y: 95, width: 800, height: 450 });
    // A 1920x1080 page fitted into a 960x960 box: scale 0.5, centred 210 px down.
    expect(videoAreaInLayout(page({ bounds: { mode: 'fit', width: 960, height: 960, align: 'center' } }))).toEqual({ x: 80, y: 255, width: 800, height: 450 });
    expect(videoAreaInLayout(page({ rotation: 90 }))).toBeUndefined();
    expect(videoAreaInLayout(page({ source_size: null }))).toBeUndefined();
  });

  it('recognises only the extension\'s own StreamBridge pages', () => {
    expect(isClipPageUrl('http://localhost:8787/overlay/clips', 'thsv.random-clip-player')).toBe(true);
    expect(isClipPageUrl('http://127.0.0.1:8787/overlay/addons/thsv.raid-scout?overlayOrientation=vertical', 'thsv.raid-scout')).toBe(true);
    expect(isClipPageUrl('http://localhost:8787/overlay/clips', 'thsv.raid-scout')).toBe(false);
    expect(isClipPageUrl('https://example.com/overlay/clips', 'thsv.random-clip-player')).toBe(false);
  });
});

describe('placement steps', () => {
  it('adds the video on top, fits it to the video area, then sends it just below the page', () => {
    const target = page();
    const place: ClipPagePlace = { shape: 'horizontal', holder: { sprig: 'sprig-1' }, where: 'BRB', pageName: 'Clips', page: target, items: [page({ id: 'title', name: 'Title' }), target, page({ id: 'bg', name: 'Background' })] };
    const steps = placementSteps(place, '', 'StreamBridge Clip Video');
    expect(steps[0]).toMatchObject({ do: 'item.add', source: 'StreamBridge Clip Video', sprig: 'sprig-1', shape: 'horizontal' });
    expect(steps[1]).toMatchObject({ do: 'item.place', x: 160, y: 90, bounds: 'fit', bounds_width: 1600, bounds_height: 900, bounds_align: 'center' });
    // On top (index 0), the page is second from the top: two steps down puts the video right under it.
    expect(steps.filter((step) => step['to'] === 'down')).toHaveLength(2);
  });

  it('takes out an earlier placement first', () => {
    const target = page();
    const old = page({ id: 'video-1', name: 'StreamBridge Clip Video', kind: 'media' });
    const steps = placementSteps({ shape: 'vertical', holder: { sprig: 's' }, where: 'BRB', pageName: 'Clips', page: target, items: [old, target] }, 'video-1', 'StreamBridge Clip Video');
    expect(steps[0]).toMatchObject({ do: 'item.remove', item: 'video-1' });
    expect(steps.filter((step) => step['to'] === 'down')).toHaveLength(1);
  });
});

function fakeLink(responses: Record<string, (fields: Record<string, unknown>) => unknown>, features: readonly string[] = ['layout.get', 'item.place_full', 'edit.undo']): { link: SprigCastLink; calls: { action: string; fields: Record<string, unknown> }[] } {
  const calls: { action: string; fields: Record<string, unknown> }[] = [];
  return { calls, link: { features: new Set(features), request: async (action, fields = {}) => { calls.push({ action, fields: { ...fields } }); const answer = responses[action]; if (answer === undefined) return {}; return answer({ ...fields }); } } };
}

async function cacheDirectory(): Promise<string> { const root = await mkdtemp(join(tmpdir(), 'clip-video-')); await writeFile(join(root, FILE), 'video'); return root; }

describe('playing a clip in the SprigCast video source', () => {
  it('sets the cached file, starts it, and reports playing then ended', async () => {
    const root = await cacheDirectory();
    const states = ['starting', 'playing', 'playing', 'ended'];
    const { link, calls } = fakeLink({ 'sources.list': () => ({ sources: [{ id: 'v', name: 'StreamBridge Clip Video', kind: 'media' }] }), 'media.status': () => ({ state: states.shift() ?? 'ended', duration: 12.5 }) });
    const reports: unknown[] = [];
    const video = new SprigCastClipVideo({ sprigcast: async () => link, cacheClip: async () => '', cacheDirectory: root, placeholderFile: join(root, 'blank.webm'), report: (...args) => { reports.push(args); }, pollMs: 1 });
    await video.refresh();
    expect(video.claims('thsv.random-clip-player', { appVideo: true, url: `/overlay/cache/${FILE}` })).toBe(true);
    expect(video.claims('thsv.random-clip-player', { url: `/overlay/cache/${FILE}` })).toBe(false);
    expect(video.claims('thsv.raid-scout', { appVideo: true, url: 'https://clips-media-assets2.twitch.tv/a.mp4' })).toBe(false);
    video.play('thsv.random-clip-player', { playbackId: 'clip-1', url: `/overlay/cache/${FILE}`, muted: false, volume: 0.5 });
    await vi.waitFor(() => expect(reports).toHaveLength(2));
    expect(reports[0]).toEqual(['thsv.random-clip-player', 'clip-1', 'playing', { durationMs: 12_500 }]);
    expect(reports[1]).toEqual(['thsv.random-clip-player', 'clip-1', 'ended']);
    const set = calls.find((call) => call.action === 'source.set' && (call.fields['settings'] as { path?: string }).path === join(root, FILE));
    expect(set?.fields).toMatchObject({ source: 'StreamBridge Clip Video', settings: { path: join(root, FILE), loop: false, restart_on_show: false, clear_on_end: true, muted: false, volume_db: -6.02 } });
    expect(calls.some((call) => call.action === 'media.restart')).toBe(true);
  });

  it('mutes or unmutes only the clip that is playing, without restarting it', async () => {
    const root = await cacheDirectory();
    const { link, calls } = fakeLink({ 'sources.list': () => ({ sources: [{ id: 'v', name: 'StreamBridge Clip Video', kind: 'media' }] }), 'media.status': () => ({ state: 'playing', duration: 30 }) });
    const reports: unknown[] = [];
    const video = new SprigCastClipVideo({ sprigcast: async () => link, cacheClip: async () => '', cacheDirectory: root, placeholderFile: join(root, 'blank.webm'), report: (...args) => { reports.push(args); }, pollMs: 1 });
    await video.refresh();
    video.play('thsv.random-clip-player', { playbackId: 'clip-1', url: `/overlay/cache/${FILE}`, muted: true, volume: 1 });
    await vi.waitFor(() => expect(reports).toHaveLength(1));
    const restarts = calls.filter((call) => call.action === 'media.restart').length;
    video.setMuted('thsv.random-clip-player', 'old-clip', false);
    video.setMuted('thsv.random-clip-player', 'clip-1', false);
    await vi.waitFor(() => expect(calls.some((call) => call.action === 'source.set' && JSON.stringify(call.fields) === JSON.stringify({ source: 'StreamBridge Clip Video', settings: { muted: false } }))).toBe(true));
    expect(calls.filter((call) => call.action === 'source.set' && (call.fields['settings'] as { muted?: boolean }).muted === false && !('path' in (call.fields['settings'] as object)))).toHaveLength(1);
    expect(calls.filter((call) => call.action === 'media.restart')).toHaveLength(restarts);
    video.stopAll();
  });

  it('shows a still picture for Twitch clip embeds only while SprigCast is the streaming app', async () => {
    let connected = true;
    const { link } = fakeLink({ 'sources.list': () => ({ sources: [] }) });
    const video = new SprigCastClipVideo({ sprigcast: async () => (connected ? link : undefined), cacheClip: async () => '', cacheDirectory: '.', placeholderFile: join(tmpdir(), `clip-blank-${String(process.pid)}.webm`), report: () => undefined });
    const embed = { embedUrl: 'https://clips.twitch.tv/embed?clip=Brave', posterUrl: 'https://static-cdn.jtvnw.net/a.jpg' };
    expect(video.stillOnly('thsv.raid-scout', embed)).toBe(false);
    await video.refresh();
    expect(video.stillOnly('thsv.raid-scout', embed)).toBe(true);
    expect(video.stillOnly('thsv.raid-scout', { ...embed, posterUrl: '' })).toBe(false);
    expect(video.stillOnly('thsv.village-jukebox', embed)).toBe(false);
    expect(video.stillOnly('thsv.raid-scout', { ...embed, embedUrl: 'https://www.youtube.com/embed/x' })).toBe(false);
    connected = false; await video.refresh();
    expect(video.stillOnly('thsv.raid-scout', embed)).toBe(false);
  });

  it('downloads a Twitch address into the cache first and refuses other hosts', async () => {
    const root = await cacheDirectory();
    const { link } = fakeLink({ 'media.status': () => ({ state: 'playing' }) });
    const cacheClip = vi.fn(async () => `/overlay/cache/${FILE}`);
    const reports: unknown[][] = [];
    const video = new SprigCastClipVideo({ sprigcast: async () => link, cacheClip, cacheDirectory: root, placeholderFile: join(root, 'blank.webm'), report: (...args) => { reports.push(args); }, pollMs: 1 });
    video.play('thsv.raid-scout', { playbackId: 'raid-1', url: 'https://clips-media-assets2.twitch.tv/abc.mp4?sig=1', muted: true, volume: 1 });
    await vi.waitFor(() => expect(reports[0]?.[2]).toBe('playing'));
    expect(cacheClip).toHaveBeenCalledWith('thsv.raid-scout', 'https://clips-media-assets2.twitch.tv/abc.mp4?sig=1', expect.any(String));
    video.stop('thsv.raid-scout');
    video.play('thsv.raid-scout', { playbackId: 'raid-2', url: 'https://example.com/clip.mp4', muted: true, volume: 1 });
    await vi.waitFor(() => expect(reports.at(-1)?.[2]).toBe('failed'));
  });

  it('fails when the video never starts', async () => {
    const root = await cacheDirectory();
    const { link } = fakeLink({ 'media.status': () => ({ state: 'unloaded' }) });
    const reports: unknown[][] = [];
    const video = new SprigCastClipVideo({ sprigcast: async () => link, cacheClip: async () => '', cacheDirectory: root, placeholderFile: join(root, 'blank.webm'), report: (...args) => { reports.push(args); }, pollMs: 1, startTimeoutMs: 5 });
    video.play('thsv.random-clip-player', { playbackId: 'clip-2', url: `/overlay/cache/${FILE}`, muted: false, volume: 1 });
    await vi.waitFor(() => expect(reports[0]?.[2]).toBe('failed'));
    expect((reports[0]?.[3] as { error: string }).error).toContain('not in the bloom on air');
  });
});

describe('the blank placeholder video', () => {
  it('is written once as a small WebM and rewritten when changed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'clip-blank-'));
    const file = await ensureClipVideoPlaceholder(join(root, 'nested', 'blank.webm'));
    const bytes = await readFile(file);
    expect(bytes.subarray(0, 4).toString('hex')).toBe('1a45dfa3');
    expect(bytes.length).toBeLessThan(2_000);
    await writeFile(file, 'broken');
    await ensureClipVideoPlaceholder(file);
    expect(await readFile(file)).toEqual(bytes);
  });

  it('goes back into the video source after a clip ends, so its path is never left on an old clip or empty', async () => {
    const root = await cacheDirectory();
    const states = ['playing', 'ended'];
    const { link, calls } = fakeLink({ 'media.status': () => ({ state: states.shift() ?? 'ended', duration: 3 }), 'source.get': () => ({ settings: { path: join(root, 'blank.webm') } }) });
    const reports: unknown[][] = [];
    const video = new SprigCastClipVideo({ sprigcast: async () => link, cacheClip: async () => '', cacheDirectory: root, placeholderFile: join(root, 'blank.webm'), report: (...args) => { reports.push(args); }, pollMs: 1 });
    video.play('thsv.random-clip-player', { playbackId: 'clip-1', url: `/overlay/cache/${FILE}`, muted: false, volume: 1 });
    await vi.waitFor(() => expect(calls.filter((call) => call.action === 'source.set')).toHaveLength(2));
    const rest = calls.filter((call) => call.action === 'source.set')[1];
    expect(rest?.fields).toMatchObject({ source: 'StreamBridge Clip Video', settings: { path: join(root, 'blank.webm'), clear_on_end: true, muted: true } });
    await vi.waitFor(() => expect(calls.at(-1)?.action).toBe('media.stop'));
    expect(reports.at(-1)?.[2]).toBe('ended');
  });

  it('goes back after a stop too', async () => {
    const root = await cacheDirectory();
    const { link, calls } = fakeLink({ 'media.status': () => ({ state: 'playing' }) });
    const reports: unknown[][] = [];
    const video = new SprigCastClipVideo({ sprigcast: async () => link, cacheClip: async () => '', cacheDirectory: root, placeholderFile: join(root, 'blank.webm'), report: (...args) => { reports.push(args); }, pollMs: 1 });
    video.play('thsv.raid-scout', { playbackId: 'raid-1', url: `/overlay/cache/${FILE}`, muted: true, volume: 1 });
    await vi.waitFor(() => expect(reports[0]?.[2]).toBe('playing'));
    video.stop('thsv.raid-scout');
    await vi.waitFor(() => expect(calls.filter((call) => call.action === 'source.set').at(-1)?.fields).toMatchObject({ source: 'StreamBridge Raid Clip Video', settings: { path: join(root, 'blank.webm') } }));
  });

  it('fills a video source an older StreamBridge left empty, once per connection', async () => {
    const root = await mkdtemp(join(tmpdir(), 'clip-blank-'));
    const { link, calls } = fakeLink({ 'sources.list': () => ({ sources: [{ id: 'v', name: 'StreamBridge Raid Clip Video', kind: 'media' }, { id: 'w', name: 'StreamBridge Clip Video', kind: 'media' }] }), 'source.get': (fields) => ({ settings: { path: fields['source'] === 'StreamBridge Clip Video' ? join(root, 'gone.mp4') : '' } }) });
    const video = new SprigCastClipVideo({ sprigcast: async () => link, cacheClip: async () => '', cacheDirectory: root, placeholderFile: join(root, 'blank.webm'), report: () => undefined });
    await video.refresh();
    const sets = calls.filter((call) => call.action === 'source.set').map((call) => call.fields['source']);
    expect(sets.sort()).toEqual(['StreamBridge Clip Video', 'StreamBridge Raid Clip Video']);
    await video.refresh();
    expect(calls.filter((call) => call.action === 'source.set')).toHaveLength(2);
  });

  it('leaves the video sources alone and lets the page play every clip once SprigCast pages play H.264', async () => {
    const root = await mkdtemp(join(tmpdir(), 'clip-blank-'));
    const { link, calls } = fakeLink({ 'sources.list': () => ({ sources: [{ id: 'v', name: 'StreamBridge Raid Clip Video', kind: 'media' }, { id: 'w', name: 'StreamBridge Clip Video', kind: 'media' }] }), 'source.get': () => ({ settings: { path: '' } }) }, ['browser.h264']);
    const video = new SprigCastClipVideo({ sprigcast: async () => link, cacheClip: async () => '', cacheDirectory: root, placeholderFile: join(root, 'blank.webm'), report: () => undefined });
    await video.refresh();
    expect(calls.map((call) => call.action)).toEqual(['sources.list']);
    expect(video.claims('thsv.random-clip-player', { appVideo: true, url: `/overlay/cache/${FILE}` })).toBe(false);
    expect(video.claims('thsv.raid-scout', { appVideo: true, url: `/overlay/cache/${FILE}` })).toBe(false);
    video.stop('thsv.random-clip-player');
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(calls.map((call) => call.action)).toEqual(['sources.list']);
  });
});

describe('Set it up for me', () => {
  const layout = { shapes: { horizontal: { items: [{ id: 'sprig-brb', name: 'BRB', kind: 'sprig', sprig: true, x: 0, y: 0, scale_x: 1, scale_y: 1, rotation: 0, source_size: { width: 1920, height: 1080 }, items: [page({ id: 'clips-page' })] }] } } };
  const responses = (live: boolean, sources: unknown[]) => ({
    'sources.list': () => ({ sources }),
    'source.get': () => ({ settings: { url: 'http://localhost:8787/overlay/clips' } }),
    'blooms.list': () => ({ blooms: [{ name: 'BRB' }] }),
    'layout.get': () => layout,
    'stream.status': () => ({ on: live }),
    'record.status': () => ({ on: false }),
    steps: () => ({ applied: true }),
  });

  it('makes the video source and places it under the page in one undoable step', async () => {
    const { link, calls } = fakeLink(responses(false, [{ id: 'clips-page', name: 'Clips', kind: 'browser' }]));
    const video = new SprigCastClipVideo({ sprigcast: async () => link, cacheClip: async () => '', cacheDirectory: '.', placeholderFile: join(tmpdir(), `clip-blank-${String(process.pid)}.webm`), report: () => undefined });
    const checked = await video.check('thsv.random-clip-player');
    expect(checked.places).toEqual([{ where: 'BRB', shape: 'horizontal', page: 'Clips', status: 'needs-setup' }]);
    const result = await video.setUp('thsv.random-clip-player');
    const batch = calls.find((call) => call.action === 'steps');
    expect(batch?.fields['one_step']).toBe(true);
    const steps = batch?.fields['steps'] as Record<string, unknown>[];
    expect(steps[0]).toMatchObject({ do: 'source.new', name: 'StreamBridge Clip Video', kind: 'media', settings: { clear_on_end: true } });
    // Never an empty path: SprigCast's Stream doctor refuses Go Live on an empty video source.
    const path = (steps[0]?.['settings'] as { path: string }).path;
    expect(path).toMatch(/\.webm$/u);
    expect((await readFile(path)).subarray(0, 4).toString('hex')).toBe('1a45dfa3');
    expect(steps[1]).toMatchObject({ do: 'item.add', sprig: 'sprig-brb', shape: 'horizontal' });
    expect(result.changed).toBe(true); expect(result.undoable).toBe(true);
  });

  it('never changes the layout while live', async () => {
    const { link, calls } = fakeLink(responses(true, [{ id: 'clips-page', name: 'Clips', kind: 'browser' }]));
    const video = new SprigCastClipVideo({ sprigcast: async () => link, cacheClip: async () => '', cacheDirectory: '.', placeholderFile: join(tmpdir(), `clip-blank-${String(process.pid)}.webm`), report: () => undefined });
    await expect(video.setUp('thsv.random-clip-player')).rejects.toThrow('live or recording');
    expect(calls.some((call) => call.action === 'steps')).toBe(false);
  });

  it('asks for a newer SprigCast without the layout tools', async () => {
    const { link } = fakeLink(responses(false, []), []);
    const video = new SprigCastClipVideo({ sprigcast: async () => link, cacheClip: async () => '', cacheDirectory: '.', placeholderFile: join(tmpdir(), `clip-blank-${String(process.pid)}.webm`), report: () => undefined });
    const result = await video.check('thsv.random-clip-player');
    expect(result.missingFeatures).toEqual(['layout.get', 'item.place_full']);
    expect(result.message).toContain('newest build');
  });
});

describe('overlay hub routing', () => {
  it('marks a claimed play as external, hands it to SprigCast, and stops it there', async () => {
    const hub = new BrowserOverlayHub({ debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined }, { enabled: true, alertDurationMs: 8_000, overlayGapMs: 0 } as never);
    const router = { claims: vi.fn(() => true), play: vi.fn(), stop: vi.fn() };
    hub.useClipVideo(router);
    const sent: string[] = [];
    (hub as unknown as { broadcast: (message: string) => void }).broadcast = (message) => { sent.push(message); };
    await hub.publishAddOn('thsv.random-clip-player', 'thsv.random-clip-player.media.play', { playbackId: 'clip-9', url: `/overlay/cache/${FILE}`, appVideo: true, volume: 0.7, durationMs: 9_000 }, { lane: 'media' });
    expect(router.play).toHaveBeenCalledWith('thsv.random-clip-player', { playbackId: 'clip-9', url: `/overlay/cache/${FILE}`, muted: false, volume: 0.7, durationMs: 9_000 });
    expect((JSON.parse(sent[0] ?? '{}') as { payload: { externalVideo?: string } }).payload.externalVideo).toBe('sprigcast');
    await hub.publishAddOn('thsv.random-clip-player', 'thsv.random-clip-player.media.stop', { fade: true }, { lane: 'media' });
    expect(router.stop).toHaveBeenCalledWith('thsv.random-clip-player');
    const still = { claims: vi.fn(() => false), play: vi.fn(), stop: vi.fn(), stillOnly: vi.fn(() => true) };
    hub.useClipVideo(still);
    await hub.publishAddOn('thsv.raid-scout', 'thsv.raid-scout.media.play', { playbackId: 'raid-9', embedUrl: 'https://clips.twitch.tv/embed?clip=Brave', posterUrl: 'https://static-cdn.jtvnw.net/a.jpg' }, { lane: 'media' });
    expect((JSON.parse(sent.at(-1) ?? '{}') as { payload: { stillOnly?: boolean } }).payload.stillOnly).toBe(true);
    expect(still.play).not.toHaveBeenCalled();
    hub.useClipVideo(router);
    hub.publishClipVideoState('thsv.random-clip-player', 'clip-9', 'playing', { durationMs: 9_000 });
    expect(JSON.parse(sent.at(-1) ?? '{}')).toMatchObject({ topic: 'thsv.random-clip-player.media.external', payload: { playbackId: 'clip-9', state: 'playing', durationMs: 9_000 } });
  });
});
