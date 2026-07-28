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
});
