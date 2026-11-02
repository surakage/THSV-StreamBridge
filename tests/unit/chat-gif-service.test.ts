import { describe, expect, it } from 'vitest';
import { ChatGifService, gifFragmentsFrom, trustedGifUrl } from '../../bridge/services/chat-gif-service.js';
import { projectMultiChatMessage } from '../../bridge/core/multi-chat.js';
import type { NormalizedEvent } from '../../schemas/event.js';

const GIF_URL = 'https://media1.giphy.com/media/lFk9vYnLxSwb7w5gnM/giphy.gif?cid=095d7a5d&ep=v1_gifs_trending&rid=giphy.gif&ct=g';
const TEXT = '[Working Together Jennifer Lawrence GIF by Variety]';

// The shape Streamer.bot broadcasts for a Twitch chat message that contains a GIF.
function streamerBotChat(parts: unknown[], messageId = 'msg-1'): Record<string, unknown> {
  return { event: { source: 'Twitch', type: 'ChatMessage' }, data: { messageId, text: TEXT, emotes: [], parts } };
}

function chatEvent(message = TEXT, eventId = 'msg-1'): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: `streamerbot-twitch-${eventId}`, eventType: 'chat.message', platform: 'twitch',
    source: { adapter: 'streamerbot-native', eventId, eventName: 'TwitchChatMessage' }, receivedAt: '2026-11-02T16:08:00.000Z',
    channel: { id: '1', name: 'channel' }, user: { id: '2', name: 'viewer', displayName: 'Viewer', actorType: 'human', roles: [] },
    payload: { message }, metadata: { simulated: false, bridgeSequence: 1 },
  };
}

describe('Twitch chat GIFs', () => {
  it('reads GIF parts from Streamer.bot and trusts only GIPHY media links', () => {
    expect(trustedGifUrl(GIF_URL)).toBe(true);
    expect(trustedGifUrl('https://evil.example/media/x.gif')).toBe(false);
    expect(trustedGifUrl('http://media1.giphy.com/media/x/giphy.gif')).toBe(false);
    expect(gifFragmentsFrom(streamerBotChat([{ type: 'gif', url: GIF_URL, text: TEXT }]))).toEqual({ messageId: 'msg-1', fragments: [{ type: 'gif', url: GIF_URL, text: TEXT }] });
    expect(gifFragmentsFrom(streamerBotChat([{ type: 'text', text: 'hello' }]))).toBeUndefined();
    expect(gifFragmentsFrom(streamerBotChat([{ type: 'gif', url: 'https://evil.example/media/x.gif', text: TEXT }]))).toBeUndefined();
    expect(gifFragmentsFrom({ event: { source: 'Twitch', type: 'RaidSend' }, data: {} })).toBeUndefined();
  });

  it('puts the GIF into the matching chat message, waiting briefly when Streamer.bot is a moment late', async () => {
    const gifs = new ChatGifService();
    gifs.observe(streamerBotChat([{ type: 'gif', url: GIF_URL, text: TEXT }]));
    const enriched = await gifs.enrich(chatEvent());
    expect(enriched.payload['fragments']).toEqual([{ type: 'gif', url: GIF_URL, text: TEXT }]);

    const late = gifs.enrich(chatEvent(TEXT, 'msg-2'), 1_000);
    setTimeout(() => gifs.observe(streamerBotChat([{ type: 'text', text: 'look ' }, { type: 'gif', url: GIF_URL, text: TEXT }], 'msg-2')), 20);
    expect((await late).payload['fragments']).toEqual([{ type: 'text', text: 'look ' }, { type: 'gif', url: GIF_URL, text: TEXT }]);

    const plain = chatEvent('just words', 'msg-3');
    expect(await gifs.enrich(plain, 1_000)).toBe(plain);
    const missing = chatEvent(TEXT, 'msg-4');
    expect(await gifs.enrich(missing, 10)).toBe(missing);
  });

  it('keeps GIF fragments for the overlay and drops untrusted ones', () => {
    const projected = projectMultiChatMessage({ ...chatEvent(), payload: { message: TEXT, fragments: [{ type: 'gif', url: GIF_URL, text: TEXT }, { type: 'gif', url: 'https://evil.example/media/x.gif', text: 'bad' }] } });
    expect(projected?.fragments).toEqual([{ type: 'gif', url: GIF_URL, text: TEXT }]);
  });
});
