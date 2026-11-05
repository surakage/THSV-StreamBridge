import { describe, expect, it } from 'vitest';
import { isAutomatedSenderName, markAutomatedSender } from '../../bridge/core/automated-senders.js';
import type { NormalizedEvent } from '../../schemas/event.js';

function chat(name: string, roles: string[] = [], actorType: 'human' | 'bot' | 'system' = 'human'): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: `e-${name}`, eventType: 'chat.message', platform: 'twitch', occurredAt: '2026-11-05T12:00:00.000Z', receivedAt: '2026-11-05T12:00:00.000Z',
    source: { adapter: 'test', eventId: name }, user: { name, displayName: name, actorType, roles, badges: [] }, payload: { message: 'hi' }, metadata: { simulated: false },
  } as unknown as NormalizedEvent;
}

describe('automated senders', () => {
  it('recognises known chat bots, bot-suffixed names and the creator ignore list', () => {
    expect(isAutomatedSenderName('Sery_Bot')).toBe(true);
    expect(isAutomatedSenderName('suraruisuh_bot')).toBe(true);
    expect(isAutomatedSenderName('StreamElements')).toBe(true);
    expect(isAutomatedSenderName('my-bot')).toBe(true);
    expect(isAutomatedSenderName('MyHelper', ['@myhelper'])).toBe(true);
    expect(isAutomatedSenderName('Abbott')).toBe(false);
    expect(isAutomatedSenderName('Robot')).toBe(false);
    expect(isAutomatedSenderName('Viewer')).toBe(false);
  });

  it('relabels bot senders as bots but never the broadcaster', () => {
    expect(markAutomatedSender(chat('Sery_Bot')).user?.actorType).toBe('bot');
    expect(markAutomatedSender(chat('Viewer')).user?.actorType).toBe('human');
    expect(markAutomatedSender(chat('owner_bot', ['broadcaster'])).user?.actorType).toBe('human');
    expect(markAutomatedSender(chat('Sery_Bot', [], 'system')).user?.actorType).toBe('system');
  });
});
