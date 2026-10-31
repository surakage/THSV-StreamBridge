import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

interface WallOptions { maxOnScreen: number; perMessage: number; lifetimeMs: number; gifs: boolean; minSize: number; maxSize: number; minSpeed: number; maxSpeed: number; movements: string[]; platforms: string[]; demo: boolean }
interface EmoteWall {
  parseOptions(search: string): WallOptions;
  pickEmotes(message: unknown, options: WallOptions): { url: string; name: string }[];
  isAnimated(url: string): boolean;
}

async function loadWall(): Promise<EmoteWall> {
  const module = { exports: {} as EmoteWall };
  runInNewContext(await readFile('overlays/browser/emote-wall.js', 'utf8'), { module, URLSearchParams });
  return module.exports;
}

const emote = (name: string, imageUrl: string) => ({ type: 'emote', name, imageUrl, provider: 'twitch' });

describe('emote wall overlay', () => {
  it('uses the Stream UI style defaults when the URL has no settings', async () => {
    const wall = await loadWall();
    expect(wall.parseOptions('')).toEqual({ maxOnScreen: 50, perMessage: 10, lifetimeMs: 10_000, gifs: true, minSize: 60, maxSize: 150, minSpeed: 4, maxSpeed: 8, movements: ['float', 'slide', 'zoom', 'bounce', 'spiral', 'wobble'], platforms: ['twitch', 'youtube', 'kick'], demo: false });
  });

  it('clamps settings, keeps ranges ordered and ignores unknown choices', async () => {
    const wall = await loadWall();
    const options = wall.parseOptions('?max=900&perMessage=0&life=1&minSize=300&maxSize=50&minSpeed=9&maxSpeed=2&moves=zoom,teleport,ZOOM&platforms=kick&gifs=0');
    expect(options).toMatchObject({ maxOnScreen: 200, perMessage: 1, lifetimeMs: 2_000, minSize: 300, maxSize: 300, minSpeed: 9, maxSpeed: 9, movements: ['zoom'], platforms: ['kick'], gifs: false });
    expect(wall.parseOptions('?moves=teleport').movements).toHaveLength(6);
  });

  it('takes only https emote fragments, up to the per-message limit', async () => {
    const wall = await loadWall();
    const message = { platform: 'twitch', fragments: [{ type: 'text', text: 'hi ' }, emote('Kappa', 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/3.0'), emote('bad', 'javascript:alert(1)'), emote('Pog', 'https://cdn.7tv.app/emote/1/4x.webp'), emote('LUL', 'https://static-cdn.jtvnw.net/emoticons/v2/425618/default/dark/3.0')] };
    expect(wall.pickEmotes(message, wall.parseOptions('?perMessage=2')).map((item) => item.name)).toEqual(['Kappa', 'Pog']);
    expect(wall.pickEmotes({ platform: 'twitch', message: 'no fragments' }, wall.parseOptions(''))).toEqual([]);
  });

  it('filters chats by platform and can leave out animated emotes', async () => {
    const wall = await loadWall();
    const animated = { platform: 'youtube', fragments: [emote('dance', 'https://static-cdn.jtvnw.net/emoticons/v2/1/animated/dark/3.0'), emote('cat', 'https://cdn.betterttv.net/emote/1/3x.gif'), emote('still', 'https://cdn.frankerfacez.com/emote/1/4')] };
    expect(wall.pickEmotes(animated, wall.parseOptions('?gifs=0')).map((item) => item.name)).toEqual(['still']);
    expect(wall.pickEmotes(animated, wall.parseOptions('?platforms=twitch,kick'))).toEqual([]);
    expect(wall.pickEmotes(animated, wall.parseOptions(''))).toHaveLength(3);
  });
});
