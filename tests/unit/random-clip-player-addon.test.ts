import { describe, expect, it } from 'vitest';
// @ts-expect-error plain-JS add-on entrypoint has no type declarations
import { filterClipsByDuration, selectNextClip } from '../../addons/random-clip-player/dist/index.js';

interface Clip { readonly id: string; readonly durationSeconds: number }

const filterByDuration = filterClipsByDuration as (clips: readonly Clip[], minDurationSeconds: number, maxDurationSeconds: number) => readonly Clip[];
const pickNext = selectNextClip as (clips: readonly Clip[], seenClipIds: readonly string[], random?: () => number) => Clip | undefined;

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
