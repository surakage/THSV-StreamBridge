import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { EdgeClipWindow, cropFromMetrics, edgeArguments, findEdge, parseMetrics, twitchClipSlug } from '../../bridge/services/edge-clip-window.js';
import { CLIP_PAGES_PLAY_NOTE, SprigCastClipVideo, type SprigCastLink } from '../../bridge/services/sprigcast-clip-video.js';

describe('Edge clip window helpers', () => {
  it('reads the clip slug from Twitch embed addresses only', () => {
    expect(twitchClipSlug('https://clips.twitch.tv/embed?clip=BraveOtter-abc_1&parent=localhost')).toBe('BraveOtter-abc_1');
    expect(twitchClipSlug('https://example.com/embed?clip=BraveOtter')).toBeUndefined();
    expect(twitchClipSlug('https://clips.twitch.tv/embed?clip=a%22b')).toBeUndefined();
    expect(twitchClipSlug(undefined)).toBeUndefined();
  });

  it('crops the title bar and borders measured by the page', () => {
    expect(cropFromMetrics({ outerWidth: 1296, outerHeight: 760, innerWidth: 1280, innerHeight: 720, dpr: 1.5 })).toEqual({ left: 12, top: 48, right: 12, bottom: 12 });
    expect(cropFromMetrics({ outerWidth: 1280, outerHeight: 752, innerWidth: 1280, innerHeight: 720, dpr: 1 })).toEqual({ left: 0, top: 32, right: 0, bottom: 0 });
    expect(parseMetrics(new URLSearchParams('ow=1280&oh=752&iw=1280&ih=720&dpr=1'))).toEqual({ outerWidth: 1280, outerHeight: 752, innerWidth: 1280, innerHeight: 720, dpr: 1 });
    expect(parseMetrics(new URLSearchParams('ow=1280&oh=-1&iw=1280&ih=720&dpr=1'))).toBeUndefined();
  });

  it('finds Edge where Windows installs it and keeps it in its own profile', () => {
    const edge = findEdge({ 'ProgramFiles(x86)': 'C:\\PF86', ProgramFiles: 'C:\\PF' }, (path) => path.startsWith('C:\\PF') && !path.startsWith('C:\\PF86'));
    expect(edge).toContain('msedge.exe');
    expect(findEdge({}, () => true)).toBeUndefined();
    const args = edgeArguments('http://localhost:1/overlay/clip-window?token=t', 'D:\\data\\edge', { width: 1296, height: 760 });
    expect(args).toContain('--app=http://localhost:1/overlay/clip-window?token=t');
    expect(args).toContain('--user-data-dir=D:\\data\\edge');
    expect(args).toContain('--autoplay-policy=no-user-gesture-required');
  });

  it('opens the window, waits for the page to report in, and closes the whole Edge tree', async () => {
    const launched: { file: string; args: readonly string[] }[] = []; const closed: number[] = [];
    const window = new EdgeClipWindow({ port: 8787, profileDirectory: 'D:\\edge', platform: 'win32', edgePath: () => 'C:\\msedge.exe', launch: (file, args) => { launched.push({ file, args }); return Object.assign(new EventEmitter(), { pid: 42, kill: () => true }) as never; }, closeTree: (pid) => { closed.push(pid); } });
    expect(window.available()).toBe(true);
    const handle = window.open('BraveOtter', 20_000);
    const app = launched[0]?.args.find((arg) => arg.startsWith('--app='))?.slice(6) ?? '';
    const url = new URL(app);
    expect(url.host).toBe('localhost:8787'); expect(url.pathname).toBe('/overlay/clip-window'); expect(url.searchParams.get('clip')).toBe('BraveOtter');
    expect(window.accept('wrong', { outerWidth: 1, outerHeight: 1, innerWidth: 1, innerHeight: 1, dpr: 1 })).toBe(false);
    expect(window.accept(url.searchParams.get('token') ?? '', { outerWidth: 1296, outerHeight: 760, innerWidth: 1280, innerHeight: 720, dpr: 1 })).toBe(true);
    await expect(handle.ready).resolves.toMatchObject({ innerWidth: 1280 });
    handle.close(); handle.close();
    expect(closed).toEqual([42]);
    // The next window is sized to fit the page after the measured title bar.
    window.open(undefined, 5_000).close();
    expect(launched[1]?.args).toContain('--window-size=1296,760');
  });

  it('is not available off Windows or without Edge', async () => {
    expect(new EdgeClipWindow({ port: 1, profileDirectory: '.', platform: 'linux', edgePath: () => 'x' }).available()).toBe(false);
    const missing = new EdgeClipWindow({ port: 1, profileDirectory: '.', platform: 'win32', edgePath: () => undefined });
    expect(missing.available()).toBe(false);
    await expect(missing.open('a', 1_000).ready).rejects.toThrow('Edge');
  });
});

function fakeLink(responses: Record<string, (fields: Record<string, unknown>) => unknown>, extra: readonly string[] = []): { link: SprigCastLink; calls: { action: string; fields: Record<string, unknown> }[] } {
  const calls: { action: string; fields: Record<string, unknown> }[] = [];
  return { calls, link: { features: new Set(['layout.get', 'item.place_full', 'edit.undo', ...extra]), request: async (action, fields = {}) => { calls.push({ action, fields: { ...fields } }); const answer = responses[action]; return answer === undefined ? {} : answer({ ...fields }); } } };
}

function fakeOpener(metrics = { outerWidth: 1280, outerHeight: 752, innerWidth: 1280, innerHeight: 720, dpr: 1.25 }) {
  const opened: (string | undefined)[] = []; let closes = 0;
  return { opened, closes: () => closes, opener: { available: () => true, open: (clip: string | undefined) => { opened.push(clip); return { ready: Promise.resolve(metrics), pid: () => 4242, close: () => { closes += 1; } }; } } };
}

const PAGE = { id: 'raid-page', name: 'Raid Scout', kind: 'browser', sprig: false, x: 0, y: 0, scale_x: 1, scale_y: 1, rotation: 0, crop: { left: 0, top: 0, right: 0, bottom: 0 }, bounds: { mode: 'off', width: 0, height: 0, align: 'center' }, source_size: { width: 1920, height: 1080 } };

describe('raid targets\' clips in the Edge window', () => {
  const sources = [{ id: 'raid-page', name: 'Raid Scout', kind: 'browser' }];
  const responses = (list: unknown[], sprigItems: unknown[] = [PAGE]) => ({
    'sources.list': () => ({ sources: list }),
    'source.get': () => ({ settings: { url: 'http://localhost:8787/overlay/addons/thsv.raid-scout' } }),
    'blooms.list': () => ({ blooms: [{ name: 'Ending Soon' }] }),
    'layout.get': () => ({ shapes: { horizontal: { items: [{ id: 'sprig-end', name: 'Ending Soon', kind: 'sprig', sprig: true, x: 0, y: 0, scale_x: 1, scale_y: 1, rotation: 0, items: sprigItems }] } } }),
    'stream.status': () => ({ on: false }), 'record.status': () => ({ on: false }),
    steps: () => ({ applied: true }),
  });

  it('setup adds a hidden, cropped window capture and a muted Edge sound row under the page', async () => {
    const { link, calls } = fakeLink(responses(sources));
    const edge = fakeOpener();
    const video = new SprigCastClipVideo({ sprigcast: async () => link, cacheClip: async () => '', cacheDirectory: '.', placeholderFile: join(tmpdir(), 'clip-blank-edge-test.webm'), report: () => undefined, clipWindow: edge.opener });
    const result = await video.setUp('thsv.raid-scout');
    expect(edge.opened).toEqual([undefined]); expect(edge.closes()).toBe(1);
    const steps = calls.find((call) => call.action === 'steps')?.fields['steps'] as Record<string, unknown>[];
    expect(steps.find((step) => step['kind'] === 'window_capture')).toMatchObject({ name: 'StreamBridge Raid Clip Window', settings: { title: 'StreamBridge Raid Clip', process: 'msedge.exe', match: 'title', cursor: false } });
    expect(steps.find((step) => step['kind'] === 'app_audio')).toMatchObject({ name: 'StreamBridge Raid Clip Sound', settings: { apps: ['msedge.exe'], muted: true } });
    // SprigCast refuses a sound.mute for a sound made in the same batch, so the mute follows the batch.
    expect(steps.some((step) => step['do'] === 'sound.mute')).toBe(false);
    const batchAt = calls.findIndex((call) => call.action === 'steps'); const muteAt = calls.findIndex((call) => call.action === 'sound.mute');
    expect(muteAt).toBeGreaterThan(batchAt); expect(calls[muteAt]?.fields).toEqual({ sound: 'StreamBridge Raid Clip Sound', muted: true });
    const place = steps.find((step) => step['do'] === 'item.place' && step['item'] === 'StreamBridge Raid Clip Window');
    expect(place).toMatchObject({ bounds: 'fit', crop: { left: 0, top: 40, right: 0, bottom: 0 } });
    expect(steps.at(-1)).toMatchObject({ do: 'item.hide', item: 'StreamBridge Raid Clip Window', sprig: 'sprig-end' });
    expect(result.changed).toBe(true);
    expect(result.windowNote).toContain('Edge window');
  });

  it('opens Edge, shows the capture and sound for the clip, then hides, mutes and closes', async () => {
    const window = { ...PAGE, id: 'win', name: 'StreamBridge Raid Clip Window', kind: 'window_capture' };
    const list = [...sources, { id: 'win', name: 'StreamBridge Raid Clip Window', kind: 'window_capture' }, { id: 'snd', name: 'StreamBridge Raid Clip Sound', kind: 'app_audio' }];
    const { link, calls } = fakeLink(responses(list, [PAGE, window]));
    const edge = fakeOpener(); const reports: unknown[] = [];
    const video = new SprigCastClipVideo({ sprigcast: async () => link, cacheClip: async () => '', cacheDirectory: '.', placeholderFile: join(tmpdir(), 'clip-blank-edge-test.webm'), report: (...args) => { reports.push(args); }, clipWindow: edge.opener });
    await video.refresh();
    const payload = { appVideo: true, embedUrl: 'https://clips.twitch.tv/embed?clip=BraveOtter&parent=localhost', posterUrl: 'https://x/a.jpg' };
    expect(video.claims('thsv.raid-scout', payload)).toBe(true);
    expect(video.claims('thsv.raid-scout', { ...payload, appVideo: false })).toBe(false);
    expect(video.claims('thsv.random-clip-player', payload)).toBe(false);
    vi.useFakeTimers();
    try {
      video.play('thsv.raid-scout', { playbackId: 'raid-1', url: '', embedUrl: payload.embedUrl, muted: false, volume: 0.5, durationMs: 10_000 });
      await vi.waitFor(() => expect(reports).toHaveLength(1));
      expect(edge.opened).toEqual(['BraveOtter']);
      expect(reports[0]).toEqual(['thsv.raid-scout', 'raid-1', 'playing', { durationMs: 10_000 }]);
      expect(calls.find((call) => call.action === 'item.show')?.fields).toEqual({ item: 'StreamBridge Raid Clip Window', sprig: 'sprig-end' });
      expect(calls.find((call) => call.action === 'sound.mute')?.fields).toEqual({ sound: 'StreamBridge Raid Clip Sound', muted: false });
      expect(calls.find((call) => call.action === 'sound.volume')?.fields['db']).toBeCloseTo(-6.02, 1);
      await vi.advanceTimersByTimeAsync(11_600);
      expect(reports[1]).toEqual(['thsv.raid-scout', 'raid-1', 'ended']);
    } finally { vi.useRealTimers(); }
    await vi.waitFor(() => expect(calls.some((call) => call.action === 'item.hide')).toBe(true));
    await vi.waitFor(() => expect(calls.filter((call) => call.action === 'sound.mute').at(-1)?.fields).toEqual({ sound: 'StreamBridge Raid Clip Sound', muted: true }));
    expect(edge.closes()).toBe(1);
  });

  it('a stop hides the capture, then closes the window', async () => {
    const window = { ...PAGE, id: 'win', name: 'StreamBridge Raid Clip Window', kind: 'window_capture' };
    const list = [...sources, { id: 'win', name: 'StreamBridge Raid Clip Window', kind: 'window_capture' }];
    const { link, calls } = fakeLink(responses(list, [PAGE, window]));
    const edge = fakeOpener(); const reports: unknown[] = [];
    const video = new SprigCastClipVideo({ sprigcast: async () => link, cacheClip: async () => '', cacheDirectory: '.', placeholderFile: join(tmpdir(), 'clip-blank-edge-test.webm'), report: (...args) => { reports.push(args); }, clipWindow: edge.opener });
    await video.refresh();
    video.play('thsv.raid-scout', { playbackId: 'raid-2', url: '', embedUrl: 'https://clips.twitch.tv/embed?clip=Otter', muted: false, volume: 1, durationMs: 60_000 });
    await vi.waitFor(() => expect(reports).toHaveLength(1));
    video.stop('thsv.raid-scout');
    await vi.waitFor(() => expect(edge.closes()).toBe(1));
    expect(calls.some((call) => call.action === 'item.hide')).toBe(true);
    expect(reports).toHaveLength(1);
  });

  it('catches only the StreamBridge Edge sound when SprigCast can (app_audio.pids), and hides before closing', async () => {
    const window = { ...PAGE, id: 'win', name: 'StreamBridge Raid Clip Window', kind: 'window_capture' };
    const list = [...sources, { id: 'win', name: 'StreamBridge Raid Clip Window', kind: 'window_capture' }, { id: 'snd', name: 'StreamBridge Raid Clip Sound', kind: 'app_audio' }];
    const { link, calls } = fakeLink(responses(list, [PAGE, window]), ['app_audio.pids']);
    const edge = fakeOpener(); const reports: unknown[] = [];
    const video = new SprigCastClipVideo({ sprigcast: async () => link, cacheClip: async () => '', cacheDirectory: '.', placeholderFile: join(tmpdir(), 'clip-blank-edge-test.webm'), report: (...args) => { reports.push(args); }, clipWindow: edge.opener });
    await video.refresh();
    video.play('thsv.raid-scout', { playbackId: 'raid-3', url: '', embedUrl: 'https://clips.twitch.tv/embed?clip=Otter', muted: false, volume: 1, durationMs: 60_000 });
    await vi.waitFor(() => expect(reports).toHaveLength(1));
    const sets = () => calls.filter((call) => call.action === 'source.set').map((call) => call.fields);
    expect(sets()[0]).toEqual({ source: 'StreamBridge Raid Clip Sound', settings: { pids: [4242] } });
    const unmute = calls.findIndex((call) => call.action === 'sound.mute' && call.fields['muted'] === false);
    expect(calls.findIndex((call) => call.action === 'source.set')).toBeLessThan(unmute);
    video.stop('thsv.raid-scout');
    expect(edge.closes()).toBe(0);
    await vi.waitFor(() => expect(edge.closes()).toBe(1));
    expect(calls.some((call) => call.action === 'item.hide')).toBe(true);
    expect(sets().at(-1)).toEqual({ source: 'StreamBridge Raid Clip Sound', settings: { pids: [] } });
  });

  it('leaves Twitch\'s player in the page once SprigCast pages play H.264 (browser.h264)', async () => {
    const list = [...sources, { id: 'win', name: 'StreamBridge Raid Clip Window', kind: 'window_capture' }];
    const { link } = fakeLink(responses(list), ['browser.h264']);
    const video = new SprigCastClipVideo({ sprigcast: async () => link, cacheClip: async () => '', cacheDirectory: '.', placeholderFile: join(tmpdir(), 'clip-blank-edge-test.webm'), report: () => undefined, clipWindow: fakeOpener().opener });
    await video.refresh();
    const payload = { appVideo: true, embedUrl: 'https://clips.twitch.tv/embed?clip=Otter', posterUrl: 'https://x/a.jpg' };
    expect(video.claims('thsv.raid-scout', payload)).toBe(false);
    expect(video.stillOnly('thsv.raid-scout', payload)).toBe(false);
  });

  it('with H.264 pages, Check and Set it up for me change nothing in SprigCast and say the pages play the clips', async () => {
    const list = [...sources, { id: 'media-3', name: 'StreamBridge Raid Clip Video', kind: 'media' }];
    const { link, calls } = fakeLink(responses(list), ['browser.h264']);
    const edge = fakeOpener();
    const video = new SprigCastClipVideo({ sprigcast: async () => link, cacheClip: async () => '', cacheDirectory: '.', placeholderFile: join(tmpdir(), 'clip-blank-edge-test.webm'), report: () => undefined, clipWindow: edge.opener });
    const result = await video.setUp('thsv.raid-scout');
    expect(edge.opened).toEqual([]);
    expect(calls.map((call) => call.action)).toEqual(['sources.list']);
    expect(result).toMatchObject({ connected: true, ready: true, sourceExists: true, changed: false, message: CLIP_PAGES_PLAY_NOTE });
    expect((await video.check('thsv.raid-scout')).message).toBe(CLIP_PAGES_PLAY_NOTE);
    // A clip file is not claimed either: the page plays it.
    expect(video.claims('thsv.raid-scout', { appVideo: true, url: 'http://localhost:8787/overlay/cache/a.mp4' })).toBe(false);
  });
});
