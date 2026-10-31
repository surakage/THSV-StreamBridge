import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import scoreboard, { contributions, scoreboardView, settingsFor } from '../../addons/scoreboard/dist/index.js';
import { addOnOverlayPreviewTopic, buildAddOnOverlayPreview } from '../../bridge/services/http-server.js';

function runtime(settings: Record<string, unknown> = {}) {
  let state: Record<string, unknown> = {};
  const context = {
    settings: { enabled: true, rows: ['follows', 'subs', 'bits', 'tips', 'chatters', 'messages'], ...settings },
    state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) },
    overlay: { publish: vi.fn<(topic: string, payload: unknown, options?: unknown) => Promise<undefined>>(async () => undefined) },
    chat: { send: vi.fn(async () => []) },
  };
  return { context, state: () => state };
}

let sequence = 0;
function event(eventType: string, platform: string, payload: Record<string, unknown> = {}, user = 'Viewer', extra: { roles?: string[]; actorType?: string; simulated?: boolean } = {}) {
  sequence += 1;
  return { eventId: `event-${String(sequence)}`, eventType, platform, user: { id: `${user.toLowerCase()}-id`, name: user.toLowerCase(), displayName: user, roles: extra.roles ?? [], actorType: extra.actorType ?? 'human' }, payload, metadata: { simulated: extra.simulated ?? false } };
}
type Row = { id: string; today: number; record?: number; newRecord: boolean; platforms: Array<{ platform: string; value: number }> };
const lastRows = (test: ReturnType<typeof runtime>): Record<string, Row> => {
  const view = (test.context.overlay.publish.mock.calls.at(-1) as unknown[])[1] as { rows: Row[] };
  return Object.fromEntries(view.rows.map((row) => [row.id, row]));
};
const online = (platform: string) => event('stream.online', platform);
const offline = (platform: string) => event('stream.offline', platform);

describe('Scoreboard', () => {
  it('maps events to rows, with amounts for Bits, gifts and tips', () => {
    const settings = settingsFor({ settings: { enabled: true, tipsCurrency: 'USD' } });
    expect(contributions(event('engagement.cheer', 'twitch', { quantity: 500 }), settings)).toEqual([['bits', 'twitch', 500]]);
    expect(contributions(event('engagement.super-chat', 'youtube', { amount: '9.99', currency: 'USD' }), settings)).toEqual([['tips', 'youtube', 9]]);
    expect(contributions(event('engagement.donation', 'streamlabs', { amount: 20, currency: 'USD' }), settings)).toEqual([['tips', 'tips', 20]]);
    expect(contributions(event('engagement.donation', 'streamlabs', { amount: 20, currency: 'EUR' }), settings)).toEqual([]);
    expect(contributions(event('chat.message', 'kick', { message: 'hi' }), settings)).toEqual([['messages', 'kick', 1]]);
    expect(contributions(event('chat.message', 'kick', { message: 'beep' }, 'Bot', { actorType: 'bot' }), settings)).toEqual([]);
  });

  it('counts this stream per platform, counts each chatter once and ignores simulated events', async () => {
    const test = runtime();
    await scoreboard.start(test.context);
    await scoreboard.onEvent(online('twitch'), test.context);
    await scoreboard.onEvent(event('channel.follow', 'twitch'), test.context);
    await scoreboard.onEvent(event('channel.follow', 'kick'), test.context);
    await scoreboard.onEvent(event('channel.membership', 'youtube'), test.context);
    await scoreboard.onEvent(event('chat.message', 'twitch', {}, 'Sloth'), test.context);
    await scoreboard.onEvent(event('chat.message', 'twitch', {}, 'Sloth'), test.context);
    await scoreboard.onEvent(event('chat.message', 'youtube', {}, 'Maple'), test.context);
    await scoreboard.onEvent(event('channel.follow', 'twitch', {}, 'Tester', { simulated: true }), test.context);
    const rows = lastRows(test);
    expect(rows['follows']).toMatchObject({ today: 2, platforms: [{ platform: 'twitch', value: 1 }, { platform: 'kick', value: 1 }] });
    expect(rows['subs']?.today).toBe(1);
    expect(rows['chatters']?.today).toBe(2);
    expect(rows['messages']?.today).toBe(3);
    expect(test.context.overlay.publish.mock.calls.at(-1)?.[0]).toBe('thsv.scoreboard.scoreboard.update');
    await scoreboard.stop();
  });

  it('keeps one stream across a multistream start and a short drop, and marks beaten records next stream', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-30T20:00:00Z'));
      const test = runtime();
      await scoreboard.start(test.context);
      await scoreboard.onEvent(online('twitch'), test.context);
      await scoreboard.onEvent(event('channel.follow', 'twitch'), test.context);
      await scoreboard.onEvent(online('youtube'), test.context);
      await scoreboard.onEvent(event('channel.follow', 'youtube'), test.context);
      expect(lastRows(test)['follows']).toMatchObject({ today: 2, record: 2, newRecord: false });
      // Every platform drops for ten minutes: still the same stream.
      await scoreboard.onEvent(offline('twitch'), test.context);
      await scoreboard.onEvent(offline('youtube'), test.context);
      vi.setSystemTime(new Date('2026-10-30T20:10:00Z'));
      await scoreboard.onEvent(online('twitch'), test.context);
      expect(lastRows(test)['follows']?.today).toBe(2);
      // The next day's stream starts fresh and lights up a row that beats the record.
      await scoreboard.onEvent(offline('twitch'), test.context);
      vi.setSystemTime(new Date('2026-10-31T20:00:00Z'));
      await scoreboard.onEvent(online('kick'), test.context);
      expect(lastRows(test)['follows']).toMatchObject({ today: 0, record: 2, newRecord: false });
      for (let index = 0; index < 3; index += 1) await scoreboard.onEvent(event('channel.follow', 'kick', {}, `Fan${String(index)}`), test.context);
      expect(lastRows(test)['follows']).toMatchObject({ today: 3, record: 3, newRecord: true });
      await scoreboard.stop();
    } finally { vi.useRealTimers(); }
  });

  it('lets moderators reset this stream and hides rows when asked', async () => {
    const test = runtime({ hideZeroRows: true });
    await scoreboard.start(test.context);
    await scoreboard.onEvent(event('channel.follow', 'twitch'), test.context);
    await scoreboard.onEvent(event('command.received', 'twitch', { command: 'scorereset' }, 'Viewer'), test.context);
    expect(Object.keys(lastRows(test))).toEqual(['follows']);
    await scoreboard.onEvent(event('command.received', 'twitch', { command: '!scorereset' }, 'Mod', { roles: ['moderator'] }), test.context);
    expect(test.context.overlay.publish.mock.calls.at(-1)?.[0]).toBe('thsv.scoreboard.scoreboard.hide');
    expect(test.context.chat.send).toHaveBeenCalledWith(expect.objectContaining({ message: 'Scoreboard reset for this stream.' }));
    await scoreboard.stop();
  });

  it('cleans settings, builds the view and offers a Wizard preview', () => {
    const settings = settingsFor({ settings: { rows: ['bits', 'nonsense', 'bits'], position: 'middle', showRecords: false } });
    expect(settings).toMatchObject({ enabled: false, rows: ['bits'], position: 'top-right', showRecords: false, resetCommand: 'scorereset' });
    expect(scoreboardView(settings, { counts: { bits: { twitch: 100 } }, records: { bits: 50 }, newRecords: ['bits'] }).rows).toEqual([{ id: 'bits', label: 'Bits', today: 100, platforms: [{ platform: 'twitch', value: 100 }], record: undefined, newRecord: false }]);
    expect(addOnOverlayPreviewTopic('thsv.scoreboard')).toBe('thsv.scoreboard.scoreboard.update');
    const preview = buildAddOnOverlayPreview({ moduleId: 'thsv.scoreboard', name: 'Scoreboard', settings: { rows: ['follows', 'chatters'], title: 'Village stats' } });
    expect(preview).toMatchObject({ title: 'Village stats', templatePreview: true, rows: [{ id: 'follows', today: 18, record: 25, newRecord: false }, { id: 'chatters', today: 52, newRecord: true }] });
  });
});
