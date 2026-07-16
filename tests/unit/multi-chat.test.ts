import { describe, expect, it } from 'vitest';
import { fixture } from '../helpers.js';
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
    ['facebook-chat.json', 'facebook'],
  ])('projects %s into one platform-neutral contract', async (fixtureName, platform) => {
    const projected = projectMultiChatMessage(await fixture(fixtureName));
    expect(projected).toMatchObject({ contractVersion: '1.0.0', platform, simulated: true });
    expect(projected?.message).toBeTypeOf('string');
    expect(projected?.user.displayName).not.toBe('');
  });

  it('normalizes whitespace and control characters while preserving Unicode', () => {
    expect(normalizeChatPlainText('  Hello\n\tworld\u0000 🦥  ')).toBe('Hello world 🦥');
  });

  it('derives platform-neutral role flags case-insensitively', async () => {
    const event = await fixture();
    if (event.user === undefined) throw new Error('Fixture must contain a user');
    const projected = projectMultiChatMessage({
      ...event,
      user: { ...event.user, roles: ['Broadcaster', 'MOD', 'Member'] },
    });
    expect(projected?.user).toMatchObject({ isBroadcaster: true, isModerator: true, isSubscriber: true });
  });

  it('ignores non-chat event types', async () => {
    expect(projectMultiChatMessage(await fixture('kick-follow.json'))).toBeUndefined();
  });

  it('rejects missing, empty, and oversized messages with readable errors', async () => {
    const event = await fixture();
    expect(() => projectMultiChatMessage({ ...event, payload: {} })).toThrow('payload.message must be a string');
    expect(() => projectMultiChatMessage({ ...event, payload: { message: '\n\t' } })).toThrow('empty after normalization');
    expect(() => projectMultiChatMessage({ ...event, payload: { message: 'x'.repeat(MULTI_CHAT_MAX_MESSAGE_LENGTH + 1) } })).toThrow(InvalidMultiChatEventError);
  });
});
