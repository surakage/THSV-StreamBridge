import { describe, expect, it } from 'vitest';
import { normalizedEventSchema, type NormalizedEvent } from '../../schemas/event.js';
import {
  InvalidMultiCommandError,
  MULTI_COMMANDS_MAX_ARGUMENTS,
  authorizeCommand,
  deriveCommandEvent,
  parseCommandInput,
  projectMultiCommand,
} from '../../bridge/core/multi-commands.js';
import { fixture } from '../helpers.js';

const definitions = [
  { name: 'shoutout', aliases: ['so'], minimumRole: 'moderator' as const, allowBots: false },
  { name: 'ping', aliases: ['p'], minimumRole: 'viewer' as const, allowBots: false },
];

describe('Multi-Commands contract', () => {
  it.each([
    ['twitch-command.json', 'twitch'],
    ['youtube-command.json', 'youtube'],
    ['kick-command.json', 'kick'],
    ['tiktok-tikfinity-command.json', 'tiktok'],
    ['facebook-command.json', 'facebook'],
  ])('projects %s into one platform-neutral contract', async (fixtureName, platform) => {
    const command = projectMultiCommand(await commandFixture(fixtureName));
    expect(command).toMatchObject({ contractVersion: '1.1.0', platform, visibility: 'public', command: 'shoutout', invokedAs: 'so', isAlias: true });
    expect(command?.arguments).toEqual(['ExampleViewer']);
  });

  it('parses aliases, quoted arguments, escapes, and case deterministically', () => {
    expect(parseCommandInput(' !SO "Some Viewer" reason\\ here ', definitions)).toEqual({
      command: 'shoutout', invokedAs: 'so', arguments: ['Some Viewer', 'reason here'], rawInput: '!SO "Some Viewer" reason\\ here',
      prefix: '!', minimumRole: 'moderator', allowBots: false,
    });
    expect(parseCommandInput('ordinary chat', definitions)).toBeUndefined();
    expect(parseCommandInput('!unknown value', definitions)).toBeUndefined();
  });

  it('preserves Unicode arguments and prevents control characters from merging tokens', () => {
    expect(parseCommandInput('!ping "hello 🦥 世界"', definitions)?.arguments).toEqual(['hello 🦥 世界']);
    expect(parseCommandInput('!ping first\nsecond', definitions)?.arguments).toEqual(['first', 'second']);
  });

  it('derives a structured command from public chat using the central configuration', async () => {
    const chat = normalizedEventSchema.parse(await fixture('twitch-chat.json'));
    const derived = deriveCommandEvent(
      { ...chat, payload: { message: '!SO "Example Viewer 🦥"' } },
      { enabled: true, prefix: '!', definitions },
    );
    expect(derived).toMatchObject({
      eventType: 'command.received', platform: 'twitch', payload: {
        command: 'shoutout', invokedAs: 'so', arguments: ['Example Viewer 🦥'], minimumRole: 'moderator', allowBots: false,
      }, metadata: { correlationId: chat.eventId },
    });
    expect(deriveCommandEvent(chat, { enabled: false, prefix: '!', definitions })).toBeUndefined();
  });

  it.each([
    ['twitch-chat.json', 'twitch'],
    ['youtube-chat.json', 'youtube'],
    ['kick-chat.json', 'kick'],
    ['tiktok-tikfinity-chat.json', 'tiktok'],
    ['facebook-chat.json', 'facebook'],
  ])('uses the same central tokenizer for raw %s command chat', async (fixtureName, platform) => {
    const chat = normalizedEventSchema.parse(await fixture(fixtureName));
    const derived = deriveCommandEvent(
      { ...chat, payload: { message: '!so "Cross Platform 🦥"' } },
      { enabled: true, prefix: '!', definitions },
    );
    expect(derived).toMatchObject({ platform, eventType: 'command.received', payload: { command: 'shoutout', arguments: ['Cross Platform 🦥'] } });
  });

  it('rejects malformed syntax, collisions, and bounded-input violations readably', () => {
    expect(() => parseCommandInput('!ping "open', definitions)).toThrow('unclosed quote');
    expect(() => parseCommandInput('!ping value\\', definitions)).toThrow('incomplete escape');
    expect(() => parseCommandInput('!ping', [{ name: 'ping', aliases: ['p'] }, { name: 'pong', aliases: ['p'] }])).toThrow('Duplicate');
    expect(() => projectMultiCommand(withPayload({ command: 'ping', arguments: Array(MULTI_COMMANDS_MAX_ARGUMENTS + 1).fill('x') }))).toThrow(InvalidMultiCommandError);
  });

  it('evaluates role and bot permissions without platform checks', () => {
    expect(authorizeCommand(['MOD'], 'human', 'moderator', false)).toEqual({ authorized: true, reason: 'authorized' });
    expect(authorizeCommand(['member'], 'human', 'moderator', false)).toMatchObject({ authorized: false });
    expect(authorizeCommand(['broadcaster'], 'bot', 'viewer', false)).toEqual({ authorized: false, reason: 'bot commands are disabled' });
    expect(authorizeCommand(['viewer'], 'bot', 'viewer', true)).toMatchObject({ authorized: true });
  });

  it('keeps shell-like input as inert argument data', () => {
    const parsed = parseCommandInput('!ping $(Remove-Item) ; whoami', definitions);
    expect(parsed?.arguments).toEqual(['$(Remove-Item)', ';', 'whoami']);
  });

  it('bypasses private, operator, and non-command events', async () => {
    const event = await commandFixture();
    expect(projectMultiCommand({ ...event, eventType: 'command.private-received' })).toBeUndefined();
    expect(projectMultiCommand({ ...event, eventType: 'operator.command-received' })).toBeUndefined();
    expect(projectMultiCommand({ ...event, eventType: 'chat.message' })).toBeUndefined();
  });

  it('rejects missing users, system actors, missing sequence, and malformed payloads', async () => {
    const event = await commandFixture();
    if (event.user === undefined) throw new Error('Fixture must contain a user');
    const user = event.user;
    expect(() => projectMultiCommand({ ...event, user: undefined })).toThrow('requires user data');
    expect(() => projectMultiCommand({ ...event, user: { ...user, actorType: 'system' } })).toThrow('operator.command-received');
    expect(() => projectMultiCommand({ ...event, metadata: { ...event.metadata, bridgeSequence: undefined } })).toThrow('bridge-assigned sequence');
    expect(() => projectMultiCommand({ ...event, payload: { command: 'ping', arguments: [1] } })).toThrow('array of strings');
  });
});

async function commandFixture(name = 'twitch-command.json'): Promise<NormalizedEvent> {
  const event = normalizedEventSchema.parse(await fixture(name));
  return { ...event, metadata: { ...event.metadata, bridgeSequence: 1 } };
}

function withPayload(payload: NormalizedEvent['payload']): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: 'command-test', eventType: 'command.received', platform: 'twitch',
    source: { adapter: 'fixture', eventName: 'Command' }, receivedAt: '2026-01-01T00:00:00.000Z',
    channel: { name: 'Example' }, user: { name: 'viewer', actorType: 'human', roles: ['viewer'] }, payload,
    metadata: { bridgeSequence: 1, simulated: true },
  };
}
