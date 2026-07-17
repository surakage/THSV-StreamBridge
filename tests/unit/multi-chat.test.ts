import { describe, expect, it } from 'vitest';
import { fixture } from '../helpers.js';
import { normalizedEventSchema, type NormalizedEvent } from '../../schemas/event.js';
import {
  InvalidMultiChatEventError,
  MULTI_CHAT_MAX_MESSAGE_LENGTH,
  normalizeChatPlainText,
  projectMultiChatMessage,
} from '../../bridge/core/multi-chat.js';

describe('Multi-Chat contract', () => {
  it.each([
    ['twitch-chat.json', 'twitch'],
    ['youtube-chat.json', 'youtube'],
    ['kick-chat.json', 'kick'],
    ['tiktok-tikfinity-chat.json', 'tiktok'],
  ])('projects %s into one platform-neutral contract', async (fixtureName, platform) => {
    const projected = projectMultiChatMessage(await chatFixture(fixtureName));
    expect(projected).toMatchObject({ contractVersion: '1.1.0', sequence: 1, visibility: 'public', platform, simulated: true });
    expect(projected?.message).toBeTypeOf('string');
    expect(projected?.user.displayName).not.toBe('');
  });

  it('normalizes whitespace and control characters while preserving Unicode', () => {
    expect(normalizeChatPlainText('  Hello\n\tworld\u0000 🦥  ')).toBe('Hello world 🦥');
  });

  it('derives platform-neutral role flags case-insensitively', async () => {
    const event = await chatFixture();
    if (event.user === undefined) throw new Error('Fixture must contain a user');
    const projected = projectMultiChatMessage({
      ...event,
      user: { ...event.user, roles: ['Broadcaster', 'MOD', 'Member'] },
    });
    expect(projected?.user).toMatchObject({ isBroadcaster: true, isModerator: true, isSubscriber: true });
  });

  it('ignores non-chat event types', async () => {
    expect(projectMultiChatMessage(await fixture('kick-follow.json'))).toBeUndefined();
    expect(projectMultiChatMessage({ ...(await chatFixture()), eventType: 'chat.private-message' })).toBeUndefined();
    expect(projectMultiChatMessage({ ...(await chatFixture()), eventType: 'operator.message' })).toBeUndefined();
  });

  it('rejects missing, empty, and oversized messages with readable errors', async () => {
    const event = await chatFixture();
    expect(() => projectMultiChatMessage({ ...event, payload: {} })).toThrow('payload.message must be a string');
    expect(() => projectMultiChatMessage({ ...event, payload: { message: '\n\t' } })).toThrow('empty after normalization');
    expect(() => projectMultiChatMessage({ ...event, payload: { message: 'x'.repeat(MULTI_CHAT_MAX_MESSAGE_LENGTH + 1) } })).toThrow(InvalidMultiChatEventError);
  });

  it('exposes bot provenance and rejects system actors on the public chat type', async () => {
    const event = await chatFixture();
    if (event.user === undefined) throw new Error('Fixture must contain a user');
    const user = event.user;
    const bot = projectMultiChatMessage({ ...event, user: { ...user, actorType: 'bot' } });
    expect(bot?.user).toMatchObject({ actorType: 'bot', isBot: true });
    expect(() => projectMultiChatMessage({ ...event, user: { ...user, actorType: 'system' } })).toThrow('must use chat.system-message');
  });

  it('requires a bridge-assigned sequence for public chat', async () => {
    const event = await chatFixture();
    const { bridgeSequence: _ignored, ...metadata } = event.metadata;
    void _ignored;
    expect(() => projectMultiChatMessage({ ...event, metadata })).toThrow('bridge-assigned sequence');
  });
});

async function chatFixture(name = 'twitch-chat.json'): Promise<NormalizedEvent> {
  const event = normalizedEventSchema.parse(await fixture(name));
  return { ...event, metadata: { ...event.metadata, bridgeSequence: 1 } };
}
