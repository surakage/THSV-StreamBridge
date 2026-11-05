import { describe, expect, it } from 'vitest';
import { isAutomatedSenderName, isBlockedBotCommand, isIgnoredBotAction, markAutomatedSender } from '../../bridge/core/automated-senders.js';
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

describe('what a bot account can trigger', () => {
  const command = (name: string, actorType: 'human' | 'bot', payload: Record<string, unknown> = {}): NormalizedEvent => (({ ...chat(name, [], actorType), eventType: 'command.received', payload: { command: 'hug', ...payload } }));
  const own = ['suraruisuh', 'The Hidden Sloth Village', 'Sery_Bot'];

  it('stops commands from bots', () => {
    expect(isBlockedBotCommand(command('Sery_Bot', 'bot'), own)).toBe(true);
    expect(isBlockedBotCommand(command('Nightbot', 'bot'), own)).toBe(true);
    // Streamer.bot flagged it as its bot account, whatever it is called.
    expect(isBlockedBotCommand(command('VillageHelper', 'bot'), own)).toBe(true);
  });

  it('keeps commands for viewers, listed own accounts and commands that allow bots', () => {
    expect(isBlockedBotCommand(command('Viewer', 'human'), own)).toBe(false);
    expect(isBlockedBotCommand(command('suraruisuh', 'bot'), own)).toBe(false);
    expect(isBlockedBotCommand(command('Sery_Bot', 'bot', { allowBots: true }), own)).toBe(false);
  });

  it('ignores follows and rewards from bots but keeps paid events', () => {
    const of = (eventType: string, name: string, actorType: 'human' | 'bot'): NormalizedEvent => (({ ...chat(name, [], actorType), eventType }));
    expect(isIgnoredBotAction(of('channel.follow', 'Sery_Bot', 'bot'))).toBe(true);
    expect(isIgnoredBotAction(of('reward.redemption', 'Nightbot', 'bot'))).toBe(true);
    expect(isIgnoredBotAction(of('channel.subscription', 'Sery_Bot', 'bot'))).toBe(false);
    expect(isIgnoredBotAction(of('channel.follow', 'Viewer', 'human'))).toBe(false);
    expect(isIgnoredBotAction(of('reward.redemption', 'suraruisuh', 'bot'))).toBe(false);
  });
});
