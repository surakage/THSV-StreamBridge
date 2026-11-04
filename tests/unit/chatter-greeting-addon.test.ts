import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import chatterGreeting, { awayText, greetingKind, greetingView, settingsFor, skipped, viewerKey } from '../../addons/chatter-greeting/dist/index.js';
import { addOnOverlayPreviewTopic, buildAddOnOverlayPreview } from '../../bridge/services/http-server.js';

// Fixed single lines so each case is predictable; rotation has its own test.
const FIXED_LINES = { newMessage: 'Welcome in, {name}! Glad you found us.', newMessageAlternates: [], returningMessage: 'Welcome back, {name}!', returningMessageAlternates: [] };
function runtime(settings: Record<string, unknown> = {}) {
  let state: Record<string, unknown> = {};
  const context = {
    settings: { enabled: true, ...FIXED_LINES, ...settings },
    community: { name: 'Sloth Den' },
    state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) },
    overlay: { publish: vi.fn(async () => undefined) },
    chat: { send: vi.fn(async () => []) },
  };
  return { context, state: () => state };
}

let sequence = 0;
function command(platform: string, user: string, name: string) {
  sequence += 1;
  return { eventId: `command-${String(sequence)}`, eventType: 'command.received', platform, user: { id: `${user.toLowerCase()}-id`, name: user.toLowerCase(), displayName: user, roles: [], actorType: 'human' }, payload: { command: name, arguments: [] }, metadata: { simulated: false } };
}
const online = () => ({ eventId: `online-${String(++sequence)}`, eventType: 'stream.online', platform: 'twitch', payload: {}, metadata: { simulated: false } });

function chat(platform: string, user: string, message = 'hello', extra: { roles?: string[]; actorType?: string; simulated?: boolean; firstMessage?: boolean; avatarUrl?: string } = {}) {
  sequence += 1;
  return {
    eventId: `chat-${String(sequence)}`, eventType: 'chat.message', platform,
    user: { id: `${user.toLowerCase()}-id`, name: user.toLowerCase(), displayName: user, roles: extra.roles ?? [], actorType: extra.actorType ?? 'human', ...(extra.avatarUrl ? { avatarUrl: extra.avatarUrl } : {}) },
    payload: { message, ...(extra.firstMessage === undefined ? {} : { firstMessage: extra.firstMessage }) }, metadata: { simulated: extra.simulated ?? false },
  };
}
const greetings = (test: ReturnType<typeof runtime>) => test.context.overlay.publish.mock.calls.map((call: unknown[]) => call[1] as { name: string; greeting: string; returning: boolean; kind: string; platform: string; message: string });

describe('Chatter Greeting', () => {
  it('greets each viewer once per stream, and greets them again after the next stream starts', async () => {
    const test = runtime();
    await chatterGreeting.start(test.context);
    await chatterGreeting.onEvent(chat('twitch', 'Sloth', 'hi all', { avatarUrl: 'https://static-cdn.jtvnw.net/user/sloth.png' }), test.context);
    await chatterGreeting.onEvent(chat('twitch', 'Sloth', 'second message'), test.context);
    await chatterGreeting.onEvent(chat('kick', 'Sloth', 'from kick'), test.context);
    expect(greetings(test).map((view) => [view.platform, view.greeting, view.returning])).toEqual([
      ['twitch', 'Welcome in, Sloth! Glad you found us.', false],
      ['kick', 'Welcome in, Sloth! Glad you found us.', false],
    ]);
    expect(test.context.overlay.publish.mock.calls[0]).toEqual(['thsv.chatter-greeting.greeting.show', expect.objectContaining({ avatarUrl: 'https://static-cdn.jtvnw.net/user/sloth.png', message: 'hi all' }), { lane: 'independent' }]);

    await chatterGreeting.onEvent({ eventId: 'online', eventType: 'stream.online', platform: 'twitch', payload: {}, metadata: { simulated: false } }, test.context);
    await chatterGreeting.onEvent(chat('twitch', 'Sloth', 'back again'), test.context);
    expect(greetings(test).at(-1)).toMatchObject({ greeting: 'Welcome back, Sloth!', returning: true });
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
    const settings = settingsFor({ settings: { enabled: true, ...FIXED_LINES } });
    expect(greetingView(chat('twitch', 'Newbie', 'hey', { firstMessage: true }), settings, false)).toMatchObject({ greeting: 'Welcome in, Newbie! Glad you found us.', durationMs: 7_000, position: 'bottom-left' });
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

  it('lets a viewer turn their greeting off with !nogreet and back on with !greetme', async () => {
    const test = runtime();
    await chatterGreeting.start(test.context);
    await chatterGreeting.onEvent(command('twitch', 'Shy', 'nogreet'), test.context);
    expect(test.context.chat.send).toHaveBeenCalledWith(expect.objectContaining({ routing: 'source', sourcePlatform: 'twitch', message: 'Got it, Shy. No more greetings from me. Type !greetme anytime to turn them back on.' }));
    await chatterGreeting.onEvent(chat('twitch', 'Shy', 'hi'), test.context);
    expect(test.context.overlay.publish).not.toHaveBeenCalled();
    // The choice survives the next stream, and the opt-out command typed as a first message never shows a bubble either.
    await chatterGreeting.onEvent(online(), test.context);
    await chatterGreeting.onEvent(chat('twitch', 'Shy', 'hello again'), test.context);
    await chatterGreeting.onEvent(chat('kick', 'Quiet', '!nogreet'), test.context);
    expect(test.context.overlay.publish).not.toHaveBeenCalled();
    await chatterGreeting.onEvent(command('twitch', 'Shy', '!greetme'), test.context);
    expect(test.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'Yay, Shy! Your greetings are back on.' }));
    await chatterGreeting.onEvent(online(), test.context);
    await chatterGreeting.onEvent(chat('twitch', 'Shy', 'missed me?'), test.context);
    expect(greetings(test).map((view) => view.name)).toEqual(['Shy']);
    await chatterGreeting.stop();
  });

  it('picks the line by who the viewer is: new, back again, regular, or back after a long break', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-01T20:00:00Z'));
      const test = runtime({ regularVisits: 3, awayDays: 14, returningMessage: 'Back again, {name}! Stream {visits}.', regularMessage: '{name}, regular #{visits}!', awayMessage: '{name}, {away} away! {community} missed you.' });
      await chatterGreeting.start(test.context);
      for (const day of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-30']) {
        vi.setSystemTime(new Date(`${day}T20:00:00Z`));
        await chatterGreeting.onEvent(online(), test.context);
        await chatterGreeting.onEvent(chat('youtube', 'Fern'), test.context);
      }
      expect(greetings(test).map((view) => [view.kind, view.greeting])).toEqual([
        ['new', 'Welcome in, Fern! Glad you found us.'],
        ['returning', 'Back again, Fern! Stream 2.'],
        ['regular', 'Fern, regular #3!'],
        ['away', 'Fern, 4 weeks away! Sloth Den missed you.'],
      ]);
      await chatterGreeting.stop();
    } finally { vi.useRealTimers(); }
    expect(awayText(3 * 86_400_000)).toBe('3 days');
    expect(awayText(200 * 86_400_000)).toBe('7 months');
    expect(greetingKind(5, 0, Date.now(), settingsFor({ settings: {} }))).toBe('returning');
  });

  it('rotates through the extra lines without repeating the last one', async () => {
    const test = runtime({ newMessage: 'One {name}', newMessageAlternates: ['Two {name}', 'Three {name}'] });
    await chatterGreeting.start(test.context);
    for (const name of ['Ann', 'Ben', 'Cal', 'Dee', 'Eve', 'Fay']) await chatterGreeting.onEvent(chat('twitch', name), test.context);
    const lines = greetings(test).map((view) => view.greeting.split(' ')[0]);
    for (let index = 1; index < lines.length; index += 1) expect(lines[index]).not.toBe(lines[index - 1]);
    expect(new Set(lines).size).toBeGreaterThan(1);
    await chatterGreeting.stop();
  });

  it('remembers viewers saved by the older version as returning', async () => {
    const test = runtime();
    await test.context.state.write({ greeted: [], known: ['twitch:id:oldtimer-id'], lastChatAt: 0 });
    await chatterGreeting.start(test.context);
    await chatterGreeting.onEvent(chat('twitch', 'OldTimer'), test.context);
    expect(greetings(test).at(-1)).toMatchObject({ kind: 'returning', greeting: 'Welcome back, OldTimer!' });
    await chatterGreeting.stop();
  });

  it('keys viewers by platform ID, cleans settings and builds a Wizard preview', () => {
    expect(viewerKey(chat('kick', 'Sloth'))).toBe('kick:id:sloth-id');
    expect(skipped(chat('twitch', 'Viewer'), settingsFor({ settings: {} }))).toBe(false);
    expect(settingsFor({ settings: { durationSeconds: 99, position: 'middle', platforms: ['twitch', 'myspace'], newMessage: '' } })).toMatchObject({ enabled: false, durationSeconds: 7, position: 'bottom-left', platforms: ['twitch'], newMessage: 'Welcome to {community}, {name}! First time here, so grab a cozy spot and say hi anytime.', optOutCommand: 'nogreet', optInCommand: 'greetme' });
    expect(addOnOverlayPreviewTopic('thsv.chatter-greeting')).toBe('thsv.chatter-greeting.greeting.show');
    expect(buildAddOnOverlayPreview({ moduleId: 'thsv.chatter-greeting', name: 'Chatter Greeting', settings: { newMessage: 'Hey {name}, welcome to the village!', position: 'top-right' } })).toMatchObject({ greeting: 'Hey Sloth Explorer, welcome to the village!', position: 'top-right', templatePreview: true });
    expect(buildAddOnOverlayPreview({ moduleId: 'thsv.chatter-greeting', name: 'Chatter Greeting', settings: {} }, '', 'Sloth Den')).toMatchObject({ greeting: 'Welcome to Sloth Den, Sloth Explorer! First time here, so grab a cozy spot and say hi anytime.' });
  });
});
