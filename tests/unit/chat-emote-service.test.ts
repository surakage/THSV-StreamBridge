import { describe, expect, it, vi } from 'vitest';
import { ChatEmoteService } from '../../bridge/services/chat-emote-service.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { Logger } from '../../bridge/services/logger.js';

const logger: Logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('ChatEmoteService', () => {
  it('backs off after an outage and recovers after the retry window', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    try {
      let unavailable = true;
      const fetcher = vi.fn(async () => unavailable
        ? new Response('', { status: 503 })
        : Response.json([{ id: 'recovered', code: 'BACK' }]));
      const warn = vi.fn();
      const service = new ChatEmoteService({ ...logger, warn }, fetcher);
      const event = chatEvent('BACK', 'viewer');
      await service.warm(event);
      const attempts = fetcher.mock.calls.length;
      await service.warm(event);
      expect(fetcher).toHaveBeenCalledTimes(attempts);
      expect(warn).toHaveBeenCalledTimes(1);
      unavailable = false;
      now.mockReturnValue(61_000);
      await service.warm(event);
      expect(service.enrich(event).payload['fragments']).toEqual([
        { type: 'emote', name: 'BACK', imageUrl: 'https://cdn.betterttv.net/emote/recovered/2x.webp', provider: 'bttv' },
      ]);
    } finally { now.mockRestore(); }
  });

  it('retains cached emotes when a refresh fails and suppresses repeated retries', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    try {
      let unavailable = false;
      const fetcher = vi.fn(async () => unavailable
        ? new Response('', { status: 503 })
        : Response.json([{ id: 'cached', code: 'KEEP' }]));
      const service = new ChatEmoteService(logger, fetcher);
      const event = chatEvent('KEEP', 'viewer');
      await service.warm(event);
      const working = service.enrich(event);
      unavailable = true;
      now.mockReturnValue(1_801_000);
      await service.warm(event);
      expect(service.enrich(event)).toEqual(working);
      const attempts = fetcher.mock.calls.length;
      await service.warm(event);
      expect(fetcher).toHaveBeenCalledTimes(attempts);
    } finally { now.mockRestore(); }
  });

  it.each([404, 429, 503])('keeps global emotes when channel catalogues return HTTP %s', async (status) => {
    const warn = vi.fn();
    const service = new ChatEmoteService({ ...logger, warn }, async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://api.betterttv.net/3/cached/emotes/global') {
        return Response.json([{ id: 'global', code: 'GLOBAL' }]);
      }
      return new Response('', { status });
    });
    const event = chatEvent('hello GLOBAL', 'viewer');
    const enriched = await service.enrichAfterWarm(event);
    expect(enriched.payload['fragments']).toEqual([
      { type: 'text', text: 'hello ' },
      { type: 'emote', name: 'GLOBAL', imageUrl: 'https://cdn.betterttv.net/emote/global/2x.webp', provider: 'bttv' },
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps YouTube global emotes without requesting the unsupported 7TV user endpoint', async () => {
    const requested: string[] = [];
    const service = new ChatEmoteService(logger, async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      requested.push(url);
      if (url === 'https://7tv.io/v3/emote-sets/global') return Response.json({ emotes: [{
        name: 'GLOBAL', data: { host: { url: '//cdn.7tv.app/emote/global', files: [{ name: '2x.webp', format: 'WEBP' }] } },
      }] });
      return new Response('', { status: 404 });
    });
    const event: NormalizedEvent = { ...chatEvent('GLOBAL', 'viewer'), platform: 'youtube' };
    const enriched = await service.enrichAfterWarm(event);
    expect(requested.some((url) => url.includes('7tv.io/v3/users/'))).toBe(false);
    expect(enriched.payload['fragments']).toEqual([
      { type: 'emote', name: 'GLOBAL', imageUrl: 'https://cdn.7tv.app/emote/global/2x.webp', provider: '7tv' },
    ]);
  });

  it('caches provider catalogs without sending message or viewer data and then enriches chat', async () => {
    const requested: string[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      requested.push(url);
      if (url.includes('betterttv.net/3/cached/emotes/global')) return Response.json([{ id: 'bttv-1', code: 'OMEGALUL' }]);
      if (url.includes('betterttv.net/3/cached/users')) return Response.json({ channelEmotes: [], sharedEmotes: [] });
      if (url.includes('frankerfacez.com/v1/set/global')) return Response.json({ sets: {} });
      if (url.includes('frankerfacez.com/v1/room')) return Response.json({ sets: {} });
      return Response.json({ emotes: [] });
    });
    const service = new ChatEmoteService(logger, fetcher);
    const event = chatEvent('hello OMEGALUL', 'private-viewer-name');
    void service.warm(event);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(6));
    await vi.waitFor(() => expect(service.enrich(event).payload['fragments']).toBeDefined());
    expect(service.enrich(event).payload['fragments']).toEqual([
      { type: 'text', text: 'hello ' },
      { type: 'emote', name: 'OMEGALUL', imageUrl: 'https://cdn.betterttv.net/emote/bttv-1/2x.webp', provider: 'bttv' },
    ]);
    expect(requested.join(' ')).not.toContain('private-viewer-name');
    expect(requested.join(' ')).not.toContain('hello');

    const nativeAndThirdParty = { ...event, payload: { message: 'Kappa OMEGALUL', fragments: [
      { type: 'emote', name: 'Kappa', imageUrl: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0', provider: 'twitch' },
      { type: 'text', text: ' OMEGALUL' },
    ] } } as NormalizedEvent;
    expect(service.enrich(nativeAndThirdParty).payload['fragments']).toEqual([
      { type: 'emote', name: 'Kappa', imageUrl: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0', provider: 'twitch' },
      { type: 'text', text: ' ' },
      { type: 'emote', name: 'OMEGALUL', imageUrl: 'https://cdn.betterttv.net/emote/bttv-1/2x.webp', provider: 'bttv' },
    ]);
  });

  it('enriches the first cold chat message before it is published', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('betterttv.net/3/cached/emotes/global')) return Response.json([{ id: 'bttv-first', code: 'FIRSTEMOTE' }]);
      if (url.includes('betterttv.net/3/cached/users')) return Response.json({ channelEmotes: [], sharedEmotes: [] });
      if (url.includes('frankerfacez.com')) return Response.json({ sets: {} });
      return Response.json({ emotes: [] });
    });
    const service = new ChatEmoteService(logger, fetcher);
    const enriched = await service.enrichAfterWarm(chatEvent('FIRSTEMOTE hello', 'viewer'));
    expect(enriched.payload['fragments']).toEqual([
      { type: 'emote', name: 'FIRSTEMOTE', imageUrl: 'https://cdn.betterttv.net/emote/bttv-first/2x.webp', provider: 'bttv' },
      { type: 'text', text: ' hello' },
    ]);
  });

  it('publishes plain text when every catalog provider fails', async () => {
    const warn = vi.fn();
    const failureLogger: Logger = { ...logger, warn };
    const service = new ChatEmoteService(failureLogger, vi.fn(async () => new Response('', { status: 503 })));
    const event = chatEvent('plain message', 'viewer');
    await expect(service.enrichAfterWarm(event)).resolves.toBe(event);
    expect(warn).toHaveBeenCalledWith('Chat emote catalog refresh failed; plain text remains available', expect.any(Object));
  });
});

function chatEvent(message: string, userName: string): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: 'chat-1', eventType: 'chat.message', platform: 'twitch',
    source: { adapter: 'test', eventId: 'source-1', eventName: 'TwitchChatMessage' }, receivedAt: new Date().toISOString(),
    channel: { id: 'channel-1', name: 'Channel' }, user: { id: 'viewer-1', name: userName, displayName: userName, actorType: 'human', roles: [] },
    payload: { message }, metadata: { simulated: true, bridgeSequence: 1 },
  };
}
