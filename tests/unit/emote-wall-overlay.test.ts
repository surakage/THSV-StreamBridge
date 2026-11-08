import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

interface WallOptions { maxOnScreen: number; perMessage: number; lifetimeMs: number; gifs: boolean; minSize: number; maxSize: number; minSpeed: number; maxSpeed: number; movements: string[]; platforms: string[]; demo: boolean; layout: string; effects: Record<string, string>; effectCount: number; effectSize: number; effectScale: boolean; effectMinBits: number; effectRewards: string[]; effectEmotes: string[] }
interface EmoteWall {
  parseOptions(search: string): WallOptions;
  pickEmotes(message: unknown, options: WallOptions): { url: string; name: string }[];
  isAnimated(url: string): boolean;
  sharpestUrl(url: string): string;
  effectFor(trigger: unknown, options: WallOptions): string | undefined;
  effectEmoteCount(trigger: unknown, options: WallOptions): number;
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
    expect(wall.parseOptions('')).toEqual({ maxOnScreen: 50, perMessage: 10, lifetimeMs: 10_000, gifs: true, minSize: 60, maxSize: 150, minSpeed: 4, maxSpeed: 8, movements: ['float', 'slide', 'zoom', 'bounce', 'spiral', 'wobble'], platforms: ['twitch', 'youtube', 'kick'], demo: false, layout: 'horizontal', effects: { follow: 'rain', sub: 'fireworks', gift: 'fireworks', cheer: 'explosion', raid: 'explosion', tip: 'fireworks' }, effectCount: 40, effectSize: 130, effectScale: true, effectMinBits: 1, effectRewards: [], effectEmotes: [] });
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

  it('plays the chosen effect for each kind of stream moment', async () => {
    const wall = await loadWall();
    const defaults = wall.parseOptions('');
    expect(wall.effectFor({ platform: 'twitch', category: 'follow' }, defaults)).toBe('rain');
    expect(wall.effectFor({ platform: 'youtube', category: 'subscriber' }, defaults)).toBe('rain');
    expect(wall.effectFor({ platform: 'twitch', category: 'gift-bomb', quantity: 5 }, defaults)).toBe('fireworks');
    expect(wall.effectFor({ platform: 'twitch', category: 'raid', quantity: 30 }, defaults)).toBe('explosion');
    expect(wall.effectFor({ platform: 'twitch', category: 'reward-redemption', rewardTitle: 'Hydrate' }, defaults)).toBeUndefined();
    expect(wall.effectFor({ platform: 'tiktok', category: 'gift' }, defaults)).toBeUndefined();
    expect(wall.effectFor({ platform: 'twitch', category: 'follow' }, wall.parseOptions('?fx=none'))).toBeUndefined();
    expect(wall.effectFor({ platform: 'twitch', category: 'follow' }, wall.parseOptions('?platforms=youtube'))).toBeUndefined();
    expect(wall.effectFor({ test: 'fireworks' }, wall.parseOptions('?fx=none'))).toBe('fireworks');
  });

  it('honours bits minimums, chosen rewards and bigger moments', async () => {
    const wall = await loadWall();
    const options = wall.parseOptions('?fx=cheer:rain,reward:explosion,raid:fireworks,bogus:rain,follow:teleport&fxMinBits=100&fxRewards=Hydrate,%20Emote%20Party&fxCount=20');
    expect(options.effects).toEqual({ cheer: 'rain', reward: 'explosion', raid: 'fireworks' });
    expect(wall.effectFor({ platform: 'twitch', category: 'cheer', quantity: 50 }, options)).toBeUndefined();
    expect(wall.effectFor({ platform: 'twitch', category: 'cheer', quantity: 100 }, options)).toBe('rain');
    expect(wall.effectFor({ platform: 'twitch', category: 'reward-redemption', rewardTitle: 'emote party' }, options)).toBe('explosion');
    expect(wall.effectFor({ platform: 'twitch', category: 'reward-redemption', rewardTitle: 'Timeout' }, options)).toBeUndefined();
    expect(wall.effectEmoteCount({ category: 'raid', quantity: 5 }, options)).toBe(20);
    expect(wall.effectEmoteCount({ category: 'raid', quantity: 500 }, options)).toBe(60);
    expect(wall.effectEmoteCount({ category: 'cheer', quantity: 300 }, options)).toBe(28);
    expect(wall.effectEmoteCount({ category: 'raid', quantity: 500 }, wall.parseOptions('?fxScale=0'))).toBe(40);
  });

  it('only keeps https links for your own effect emotes', async () => {
    const wall = await loadWall();
    expect(wall.parseOptions('?fxEmotes=https://a.example/1.png,javascript:alert(1),http://b.example/2.png').effectEmotes).toEqual(['https://a.example/1.png']);
  });

  it('reads the vertical layout and always asks for the sharpest copy of an emote', async () => {
    const wall = await loadWall();
    expect(wall.parseOptions('?layout=vertical').layout).toBe('vertical');
    expect(wall.parseOptions('?layout=sideways').layout).toBe('horizontal');
    expect(wall.sharpestUrl('https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0')).toBe('https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/3.0');
    expect(wall.sharpestUrl('https://cdn.7tv.app/emote/abc/1x.webp')).toBe('https://cdn.7tv.app/emote/abc/4x.webp');
    expect(wall.sharpestUrl('https://cdn.betterttv.net/emote/abc/2x.webp')).toBe('https://cdn.betterttv.net/emote/abc/3x.webp');
    expect(wall.sharpestUrl('https://cdn.frankerfacez.com/emote/123/1')).toBe('https://cdn.frankerfacez.com/emote/123/4');
    expect(wall.sharpestUrl('https://media.giphy.com/media/x/giphy.gif')).toBe('https://media.giphy.com/media/x/giphy.gif');
  });
});
