import { describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/restrict-template-expressions -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import clipLibraryCache, { stateFor, validClip } from '../../addons/clip-library-cache/dist/index.js';

describe('Clip Library Cache', () => {
  it('accepts only bounded canonical Twitch clip metadata', () => {
    expect(validClip({ id: 'Clip_123', url: 'https://clips.twitch.tv/Clip_123', title: 'A clip', creatorName: 'Viewer', thumbnailUrl: 'https://static-cdn.jtvnw.net/thumb.jpg', durationSeconds: 30 })).toMatchObject({ id: 'Clip_123', durationSeconds: 30 });
    expect(validClip({ id: 'Clip_123', url: 'https://evil.example/clip' })).toBeUndefined();
    expect(validClip({ id: '../bad', url: 'https://clips.twitch.tv/bad' })).toBeUndefined();
  });
  it('bounds persisted snapshots and excludes signed playback URLs', () => {
    const clips = Array.from({ length: 150 }, (_, index) => ({ id: `clip-${index}`, url: `https://clips.twitch.tv/clip-${index}`, title: 'x', landscapeUrl: 'https://signed.example/private' }));
    const state = stateFor({ clips, refreshedAt: '2026-07-27T00:00:00.000Z' }, 60);
    expect(state.clips).toHaveLength(60); expect(JSON.stringify(state)).not.toContain('signed.example');
    expect(clipLibraryCache.manifest.dependencies).toEqual([]);
  });
  it('refreshes at the creator interval while live, hourly while offline, and right away at go-live', async () => {
    const delays: number[] = []; const tasks: (() => Promise<void>)[] = []; let state: unknown = {};
    const runApprovedAction = async () => undefined;
    const context = {
      settings: { refreshMinutes: 5 },
      state: { read: async () => state, write: async (value: unknown) => { state = value; } },
      streamerbot: { runApprovedAction },
      schedule: { after: (delay: number, task: () => Promise<void>) => { delays.push(delay); tasks.push(task); return `task-${tasks.length}`; }, cancel: () => undefined },
    };
    const runLatest = async () => { const task = tasks.at(-1); if (task) await task(); };
    const event = (eventType: string, platform: string, simulated = false) => ({ eventType, platform, metadata: { simulated } });
    await clipLibraryCache.start(context);
    expect(delays.at(-1)).toBe(1000);
    await runLatest();
    expect(delays.at(-1)).toBe(60 * 60_000);
    await clipLibraryCache.onEvent(event('stream.online', 'twitch', true), context);
    expect(delays.at(-1)).toBe(60 * 60_000);
    await clipLibraryCache.onEvent(event('stream.online', 'twitch'), context);
    expect(delays.at(-1)).toBe(1000);
    await runLatest();
    expect(delays.at(-1)).toBe(5 * 60_000);
    await clipLibraryCache.onEvent(event('stream.online', 'youtube'), context);
    await clipLibraryCache.onEvent(event('stream.offline', 'twitch'), context);
    await runLatest();
    expect(delays.at(-1)).toBe(5 * 60_000);
    await clipLibraryCache.onEvent(event('stream.offline', 'youtube'), context);
    await runLatest();
    expect(delays.at(-1)).toBe(60 * 60_000);
    await clipLibraryCache.stop(context);
  });
});
