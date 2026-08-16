import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain-JS add-on entrypoint has no type declarations
import { filterClipsByDuration, mergeClipPools, normalizedSceneName, resetCompletedBag, sceneShouldPlay, selectNextClip } from '../../addons/random-clip-player/dist/index.js';

interface Clip { readonly id: string; readonly durationSeconds: number }

const filterByDuration = filterClipsByDuration as (clips: readonly Clip[], minDurationSeconds: number, maxDurationSeconds: number) => readonly Clip[];
const pickNext = selectNextClip as (clips: readonly Clip[], seenClipIds: readonly string[], random?: () => number) => Clip | undefined;
const normalizeScene = normalizedSceneName as (sceneName: string) => string;
const shouldPlayScene = sceneShouldPlay as (sceneName: string, configuredSceneNames: readonly string[]) => boolean;
const mergePools = mergeClipPools as (incoming: readonly Clip[], existing: readonly Clip[], maximum?: number) => readonly Clip[];
const resetBag = resetCompletedBag as (seenIds: readonly string[], eligibleIds: ReadonlySet<string>) => readonly string[];

function clip(id: string, durationSeconds: number): Clip {
  return { id, durationSeconds };
}

describe('Random Clip Player - filterClipsByDuration', () => {
  it('keeps only clips within the inclusive duration range', () => {
    const clips = [clip('a', 4), clip('b', 5), clip('c', 30), clip('d', 60), clip('e', 61)];
    expect(filterByDuration(clips, 5, 60).map((entry) => entry.id)).toEqual(['b', 'c', 'd']);
  });

  it('drops a clip whose durationSeconds is missing or not a number', () => {
    const clips = [clip('a', 30), { id: 'b' } as unknown as Clip, { id: 'c', durationSeconds: 'thirty' } as unknown as Clip];
    expect(filterByDuration(clips, 5, 60).map((entry) => entry.id)).toEqual(['a']);
  });
});

describe('Random Clip Player - automatic OBS scenes', () => {
  it('matches only creator-configured scene names while ignoring capitalization', () => {
    expect(normalizeScene('  My Custom Break Scene  ')).toBe('my custom break scene');
    expect(shouldPlayScene('My Custom Break Scene', ['My Custom Break Scene', 'Credits'])).toBe(true);
    expect(shouldPlayScene('MY CUSTOM BREAK SCENE', ['My Custom Break Scene', 'Credits'])).toBe(true);
    expect(shouldPlayScene('📂 BRB [Nested]', ['BRB', 'Stream Ending'])).toBe(false);
    expect(shouldPlayScene('📂 BRB [Nested]', ['📂 BRB [Nested]'])).toBe(true);
  });
});

describe('Random Clip Player - selectNextClip', () => {
  it('returns undefined for an empty clip list', () => {
    expect(pickNext([], [])).toBeUndefined();
  });

  it('never picks a clip already in seenClipIds while unseen clips remain', () => {
    const clips = [clip('a', 10), clip('b', 10), clip('c', 10)];
    const picked = pickNext(clips, ['a', 'b'], () => 0);
    expect(picked?.id).toBe('c');
  });

  it('resets the rotation once every clip has been seen, instead of returning nothing', () => {
    const clips = [clip('a', 10), clip('b', 10)];
    const picked = pickNext(clips, ['a', 'b'], () => 0);
    expect(picked).toBeDefined();
    expect(['a', 'b']).toContain(picked?.id);
  });

  it('uses the injected random source deterministically', () => {
    const clips = [clip('a', 10), clip('b', 10), clip('c', 10)];
    expect(pickNext(clips, [], () => 0)?.id).toBe('a');
    expect(pickNext(clips, [], () => 0.999)?.id).toBe('c');
  });
});

describe('Random Clip Player - refreshed rotation pool', () => {
  it('does not let a smaller fallback response discard clips from the shared cache', () => {
    const shared = [clip('a', 10), clip('b', 10), clip('c', 10), clip('d', 10)];
    const fallback = [clip('a', 11), clip('b', 11)];
    expect(mergePools(fallback, shared).map((entry) => entry.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(mergePools(fallback, shared)[0]?.durationSeconds).toBe(11);
  });

  it('bounds merged clip metadata and removes duplicate IDs', () => {
    expect(mergePools([clip('a', 10), clip('a', 20), clip('b', 10)], [clip('c', 10)], 2).map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('keeps the last completed clip blocked when a finished bag reshuffles', () => {
    expect(resetBag(['a', 'b', 'c'], new Set(['a', 'b', 'c']))).toEqual(['c']);
    expect(resetBag(['a'], new Set(['a', 'b']))).toEqual(['a']);
  });
});

describe('Random Clip Player - shared video coordination', () => {
  it('declares the exclusive-media permission and suspends cleanly for another owner', async () => {
    const descriptor = JSON.parse(await readFile('addons/random-clip-player/module-package.json', 'utf8')) as { permissions: string[] };
    const runtime = await readFile('addons/random-clip-player/dist/index.js', 'utf8');
    expect(descriptor.permissions).toContain('media.exclusive');
    expect(descriptor.permissions).toContain('media.cache');
    expect(runtime).toContain('context.mediaSlot.onChange');
    expect(runtime).toContain('onMediaSlotChanged');
    expect(runtime).toContain('fade: true');
    expect(runtime).toContain('context.mediaCache.fetch');
    expect(runtime).toContain('maximumBytes: settings.cacheMaximumFileMb * 1_048_576');
  });
});
