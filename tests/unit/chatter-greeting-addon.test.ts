import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import chatterGreeting, { DEFAULT_NEW_MESSAGES, DEFAULT_RETURNING_MESSAGES, greetingView, ordinal, pickLine, settingsFor, sinceText, skipped, viewerKey } from '../../addons/chatter-greeting/dist/index.js';
import { addOnOverlayPreviewTopic, buildAddOnOverlayPreview } from '../../bridge/services/http-server.js';

function runtime(settings: Record<string, unknown> = {}) {
  let state: Record<string, unknown> = {};
  const context = {
    settings: { enabled: true, ...settings },
    state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) },
    overlay: { publish: vi.fn(async () => undefined) },
    chat: { send: vi.fn(async () => undefined) },
  };
  return { context, state: () => state };
}

let sequence = 0;
function chat(platform: string, user: string, message = 'hello', extra: { roles?: string[]; actorType?: string; simulated?: boolean; firstMessage?: boolean; avatarUrl?: string } = {}) {
  sequence += 1;
  return {
    eventId: `chat-${String(sequence)}`, eventType: 'chat.message', platform,
    user: { id: `${user.toLowerCase()}-id`, name: user.toLowerCase(), displayName: user, roles: extra.roles ?? [], actorType: extra.actorType ?? 'human', ...(extra.avatarUrl ? { avatarUrl: extra.avatarUrl } : {}) },
    payload: { message, ...(extra.firstMessage === undefined ? {} : { firstMessage: extra.firstMessage }) }, metadata: { simulated: extra.simulated ?? false },
  };
}
const greetings = (test: ReturnType<typeof runtime>) => test.context.overlay.publish.mock.calls.map((call: unknown[]) => call[1] as { name: string; greeting: string; returning: boolean; platform: string; message: string });

describe('Chatter Greeting', () => {
  it('greets each viewer once per stream, and greets them again after the next stream starts', async () => {
    const test = runtime({ newMessage: 'Hi {name}, welcome!', returningMessage: 'Good to see you, {name}!' });
    await chatterGreeting.start(test.context);
    await chatterGreeting.onEvent(chat('twitch', 'Sloth', 'hi all', { avatarUrl: 'https://static-cdn.jtvnw.net/user/sloth.png' }), test.context);
    await chatterGreeting.onEvent(chat('twitch', 'Sloth', 'second message'), test.context);
    await chatterGreeting.onEvent(chat('kick', 'Sloth', 'from kick'), test.context);
    expect(greetings(test).map((view) => [view.platform, view.greeting, view.returning])).toEqual([
      ['twitch', 'Hi Sloth, welcome!', false],
      ['kick', 'Hi Sloth, welcome!', false],
    ]);
    expect(test.context.overlay.publish.mock.calls[0]).toEqual(['thsv.chatter-greeting.greeting.show', expect.objectContaining({ avatarUrl: 'https://static-cdn.jtvnw.net/user/sloth.png', message: 'hi all' }), { lane: 'independent' }]);

    await chatterGreeting.onEvent({ eventId: 'online', eventType: 'stream.online', platform: 'twitch', payload: {}, metadata: { simulated: false } }, test.context);
    await chatterGreeting.onEvent(chat('twitch', 'Sloth', 'back again'), test.context);
    expect(greetings(test).at(-1)).toMatchObject({ greeting: 'Good to see you, Sloth!', returning: true });
    await chatterGreeting.stop();
  });

  it('skips bots, the streamer, simulated chat, listed names and unticked platforms', async () => {
    const test = runtime({ skipNames: 'Nightbot, @StreamElements', platforms: ['twitch', 'youtube'], skipModerators: true });
    await chatterGreeting.start(test.context);
    for (const event of [
      chat('twitch', 'HelperBot', 'beep', { actorType: 'bot' }),
      chat('twitch', 'Owner', 'hello chat', { roles: ['broadcaster'] }),
      chat('twitch', 'Mod', 'hi', { roles: ['moderator'] }),
      chat('twitch', 'Nightbot'),
      chat('youtube', 'StreamElements'),
      chat('kick', 'KickViewer'),
      chat('twitch', 'Tester', 'test', { simulated: true }),
    ]) await chatterGreeting.onEvent(event, test.context);
    expect(test.context.overlay.publish).not.toHaveBeenCalled();
    await chatterGreeting.onEvent(chat('youtube', 'RealViewer'), test.context);
    expect(greetings(test).map((view) => view.name)).toEqual(['RealViewer']);
    await chatterGreeting.stop();
  });

  it('can stay quiet for returning viewers and treats a Twitch first-ever message as new', async () => {
    const test = runtime({ greetReturning: false });
    await chatterGreeting.start(test.context);
    await chatterGreeting.onEvent(chat('twitch', 'Regular'), test.context);
    await chatterGreeting.onEvent({ eventId: 'online', eventType: 'stream.online', platform: 'twitch', payload: {}, metadata: { simulated: false } }, test.context);
    await chatterGreeting.onEvent(chat('twitch', 'Regular'), test.context);
    expect(greetings(test)).toHaveLength(1);
    const settings = settingsFor({ settings: { enabled: true } });
    expect(greetingView(chat('twitch', 'Newbie', 'hey', { firstMessage: true }), settings, false, {}, () => 0)).toMatchObject({ greeting: 'Welcome in, Newbie! First time in chat, so make yourself at home.', durationMs: 7_000, position: 'bottom-left' });
    await chatterGreeting.stop();
  });

  it('starts a fresh stream after a long quiet gap in chat', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-30T20:00:00Z'));
      const test = runtime({ resetHours: 2 });
      await chatterGreeting.start(test.context);
      await chatterGreeting.onEvent(chat('youtube', 'NightOwl'), test.context);
      vi.setSystemTime(new Date('2026-10-30T23:30:00Z'));
      await chatterGreeting.onEvent(chat('youtube', 'NightOwl'), test.context);
      expect(greetings(test).map((view) => view.returning)).toEqual([false, true]);
      await chatterGreeting.stop();
    } finally { vi.useRealTimers(); }
  });

  it('keys viewers by platform ID, cleans settings and builds a Wizard preview', () => {
    expect(viewerKey(chat('kick', 'Sloth'))).toBe('kick:id:sloth-id');
    expect(skipped(chat('twitch', 'Viewer'), settingsFor({ settings: {} }))).toBe(false);
    expect(settingsFor({ settings: { durationSeconds: 99, position: 'middle', platforms: ['twitch', 'myspace'], newMessage: '' } })).toMatchObject({ enabled: false, durationSeconds: 7, position: 'bottom-left', platforms: ['twitch'], newMessages: [...DEFAULT_NEW_MESSAGES] });
    expect(addOnOverlayPreviewTopic('thsv.chatter-greeting')).toBe('thsv.chatter-greeting.greeting.show');
    expect(buildAddOnOverlayPreview({ moduleId: 'thsv.chatter-greeting', name: 'Chatter Greeting', settings: { newMessage: 'Hey {name}, welcome to the village!', position: 'top-right' } })).toMatchObject({ greeting: 'Hey Sloth Explorer, welcome to the village!', position: 'top-right', templatePreview: true });
  });

  it('moves the old stock lines to the warmer set and keeps lines the streamer wrote', () => {
    expect(settingsFor({ settings: { newMessage: 'Welcome in, {name}! Glad you found us.', returningMessage: 'Welcome back, {name}!' } })).toMatchObject({ newMessages: [...DEFAULT_NEW_MESSAGES], returningMessages: [...DEFAULT_RETURNING_MESSAGES] });
    expect(settingsFor({ settings: { newMessage: 'Hi {name}!', newMessageAlternates: ['Yo {name}', 'Hi {name}!', ''] } }).newMessages).toEqual(['Hi {name}!', 'Yo {name}']);
  });

  it('writes personal welcome-back lines from how often and how recently a viewer came', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-30T20:00:00Z'));
      const test = runtime({ returningMessage: '{name} on {platform}, {visits} stream, last {since}' });
      await chatterGreeting.start(test.context);
      await chatterGreeting.onEvent(chat('twitch', 'Regular'), test.context);
      vi.setSystemTime(new Date('2026-11-02T20:00:00Z'));
      await chatterGreeting.onEvent({ eventId: 'online', eventType: 'stream.online', platform: 'twitch', payload: {}, metadata: { simulated: false } }, test.context);
      await chatterGreeting.onEvent(chat('twitch', 'Regular'), test.context);
      expect(greetings(test).at(-1)).toMatchObject({ greeting: 'Regular on Twitch, 2nd stream, last 3 days ago', returning: true });
      await chatterGreeting.stop();
    } finally { vi.useRealTimers(); }
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map((value) => ordinal(value) as string)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '103rd']);
    const now = Date.parse('2026-11-04T12:00:00Z');
    expect([1, 3, 9, 20, 90].map((days) => sinceText(now - days * 86_400_000, now) as string)).toEqual(['yesterday', '3 days ago', 'last week', '2 weeks ago', 'a while ago']);
    expect(pickLine(['Back {since}', 'Visit {visits}'], { returning: true, since: '', visits: '' })).toBe('Welcome back, {name}!');
    expect(pickLine(['Back {since}', 'Plain {name}'], { returning: true, since: '', visits: '' })).toBe('Plain {name}');
  });

  it('lets a viewer turn their own greeting off and back on with a chat command', async () => {
    const test = runtime();
    await chatterGreeting.start(test.context);
    await chatterGreeting.onEvent(chat('twitch', 'Shy', '!nogreet'), test.context);
    expect(test.context.overlay.publish).not.toHaveBeenCalled();
    expect(test.context.chat.send).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('No more greeting pop-ups for you') as unknown, sourcePlatform: 'twitch' }));
    await chatterGreeting.onEvent({ eventId: 'online', eventType: 'stream.online', platform: 'twitch', payload: {}, metadata: { simulated: false } }, test.context);
    await chatterGreeting.onEvent(chat('twitch', 'Shy', 'hello'), test.context);
    expect(test.context.overlay.publish).not.toHaveBeenCalled();
    await chatterGreeting.onEvent(chat('twitch', 'Shy', '!NoGreet please'), test.context);
    expect(test.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'Welcome greetings are back on for you, Shy.' }));
    await chatterGreeting.onEvent({ eventId: 'online', eventType: 'stream.online', platform: 'twitch', payload: {}, metadata: { simulated: false } }, test.context);
    await chatterGreeting.onEvent(chat('twitch', 'Shy', 'hello again'), test.context);
    expect(greetings(test)).toHaveLength(1);
    await chatterGreeting.stop();
    const off = runtime({ allowOptOut: false, confirmOptOut: false });
    await chatterGreeting.start(off.context);
    await chatterGreeting.onEvent(chat('kick', 'Shy', '!nogreet'), off.context);
    expect(greetings(off)).toHaveLength(1);
    expect(off.context.chat.send).not.toHaveBeenCalled();
    expect(settingsFor({ settings: { optOutCommand: 'quiet' } }).optOutCommand).toBe('!quiet');
    expect(settingsFor({ settings: { optOutCommand: 'two words' } }).optOutCommand).toBe('!nogreet');
    await chatterGreeting.stop();
  });
});
