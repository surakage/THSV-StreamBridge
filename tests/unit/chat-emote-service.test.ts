import { describe, expect, it, vi } from 'vitest';
import { ChatEmoteService } from '../../bridge/services/chat-emote-service.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { Logger } from '../../bridge/services/logger.js';

const logger: Logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('ChatEmoteService', () => {
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
