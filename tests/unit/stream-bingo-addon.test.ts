import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import bingo, { fairPick, lines, manifest, newCard, newWin, parseSquare, playerKey, rollSeason, seasonKey, settingsFor, stateFor } from '../../addons/stream-bingo/dist/index.js';
import { addOnOverlayPreviewTopic, buildAddOnOverlayPreview } from '../../bridge/services/http-server.js';
import { summarizeTracker, trackerMonth } from '../../bridge/services/monthly-tracker-reports.js';
import { languageSettingDefaults } from '../../bridge/core/language-defaults.js';
import { SUPPORTED_LANGUAGE_CODES } from '../../bridge/core/locale.js';
import { validateSettings } from '../../bridge/services/addon-wizard-service.js';

interface Square { n: number; text: string; when: string; need: number; have: number; marked: boolean; free: boolean }
interface Card { id: string; size: number; status: string; squares: Square[]; players: Array<{ key: string; name: string }>; wins: Array<{ name: string; noWinner: boolean; points: number; lines: string[] }> }
interface State { month: string; card: Card | null; leaderboard: Array<{ key: string; displayName: string; wins: number; cards: number }>; allTime: Array<[string, number, string]>; hallOfFame: Array<{ month: string; leaders: Array<{ displayName: string; wins: number }> }>; monthWins: number }

// Six manual squares and three event squares; a 3x3 card with no free square uses exactly these nine.
const SQUARES = ['Alpha | manual | 1 |', 'Bravo | manual | 1 |', 'Charlie | manual | 1 |', 'Follow x2 | follow | 2 |', 'Hydrate | reward | 1 | Hydrate', 'GG chat | chat | 2 | gg', 'Golf | manual | 1 |', 'Hotel | manual | 1 |', 'India | manual | 1 |'];

function runtime(settings: Record<string, unknown> = {}, saved: Record<string, unknown> = {}) {
  let state: Record<string, unknown> = saved;
  const tasks: Array<() => Promise<void>> = [];
  const context = {
    settings: { enabled: true, squares: SQUARES, gridSize: '3x3', freeCenter: false, platforms: ['twitch', 'tiktok', 'youtube'], ...settings },
    state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) },
    chat: { send: vi.fn(async () => []) },
    overlay: { publish: vi.fn(async () => undefined) },
    schedule: { after: vi.fn((_delay: number, task: () => Promise<void>) => { tasks.push(task); return `task-${String(tasks.length)}`; }), cancel: vi.fn(() => true) },
    viewerFoundation: {
      getProjection: vi.fn(async ({ platform, userId }: { platform: string; userId: string }) => ({ viewerId: userId.startsWith('linked') ? 'viewer-linked-0001' : `viewer-${platform}-${userId}` })),
      mutate: vi.fn(async () => ({})),
    },
  };
  return { context, tasks, state: () => state as unknown as State };
}

let sequence = 0;
function event(eventType: string, platform: string, user: string, payload: Record<string, unknown> = {}, extra: { roles?: string[]; simulated?: boolean; actorType?: string } = {}) {
  sequence += 1;
  return {
    eventId: `event-${String(sequence)}`, eventType, platform,
    user: { id: `${user.toLowerCase()}-id`, name: user.toLowerCase(), displayName: user, roles: extra.roles ?? [], actorType: extra.actorType ?? 'human' },
    payload, metadata: { simulated: extra.simulated ?? false },
  };
}
const command = (platform: string, user: string, args: string[] = [], roles: string[] = []) => event('command.received', platform, user, { command: 'bingo', arguments: args }, { roles });
const squareIndex = (test: ReturnType<typeof runtime>, text: string) => test.state().card?.squares.findIndex((square) => square.text === text) ?? -1;

describe('Stream Bingo extension', () => {
  afterEach(async () => { await bingo.stop(); });

  it('reads square rows, with a reward or chat square needing its title or word', () => {
    expect(parseSquare('3 follows | follow | 3 |')).toEqual({ text: '3 follows', when: 'follow', need: 3, match: '' });
    expect(parseSquare('Hydrate | reward | 1 | Hydrate')).toEqual({ text: 'Hydrate', when: 'reward', need: 1, match: 'hydrate' });
    expect(parseSquare('No word | chat | 2 |')).toMatchObject({ when: 'manual' });
    expect(parseSquare('Odd | nonsense | x |')).toMatchObject({ when: 'manual', need: 1 });
    expect(parseSquare(' | follow | 1 |')).toBeUndefined();
  });

  it('builds a shuffled card with a free middle square and finds rows, columns and diagonals', () => {
    const settings = settingsFor({ settings: { gridSize: '5x5' } });
    const card = newCard(settings, 1, () => 0);
    expect(card.squares).toHaveLength(25);
    expect(card.squares[12]).toMatchObject({ free: true, marked: true, text: 'FREE' });
    expect(new Set((card.squares as Square[]).map((square) => square.text)).size).toBe(25);
    expect(lines(3).map((line: { id: string }) => line.id)).toEqual(['r0', 'r1', 'r2', 'c0', 'c1', 'c2', 'd0', 'd1']);
    for (const index of [0, 6, 18, 24]) card.squares[index].marked = true;
    expect(newWin(card)).toEqual({ cells: [0, 6, 12, 18, 24], lines: ['d0'] });
    card.wins.push({ lines: ['d0'], cells: [] });
    expect(newWin(card)).toBeUndefined();
    expect(newWin({ ...card, pattern: 'corners', wins: [] })).toBeUndefined();
  });

  it('ticks squares from stream events, joins viewers once per person, and pays one fair winner with points', async () => {
    const test = runtime({ winnerPoints: 50 });
    await bingo.start(test.context);
    await bingo.controlPanel({ operation: 'action', action: 'new' }, test.context);
    expect(test.state().card?.squares).toHaveLength(9);
    expect(test.context.chat.send).toHaveBeenCalledWith(expect.objectContaining({ message: 'A new Stream Bingo card is on screen! Type !bingo to join the draw.', selectedPlatforms: ['tiktok'] }));
    await bingo.onEvent(command('twitch', 'Sloth'), test.context);
    await bingo.onEvent(command('twitch', 'Sloth'), test.context);
    await bingo.onEvent(command('tiktok', 'Linked'), test.context);
    await bingo.onEvent(command('youtube', 'Linked'), test.context);
    expect(test.state().card?.players.map((player) => player.name)).toEqual(['Sloth', 'Linked']);
    await bingo.onEvent(event('channel.follow', 'twitch', 'Fan'), test.context);
    expect(test.state().card?.squares[squareIndex(test, 'Follow x2')]).toMatchObject({ have: 1, marked: false });
    await bingo.onEvent(event('channel.follow', 'tiktok', 'Fan2'), test.context);
    await bingo.onEvent(event('reward.redemption', 'twitch', 'Fan', { rewardTitle: 'HYDRATE' }), test.context);
    await bingo.onEvent(event('chat.message', 'twitch', 'Fan', { message: 'GG!' }), test.context);
    await bingo.onEvent(event('chat.message', 'twitch', 'Fan', { message: 'gg again' }), test.context);
    await bingo.onEvent(event('chat.message', 'twitch', 'Bot', { message: 'gg' }, { actorType: 'bot' }), test.context);
    await bingo.onEvent(event('channel.follow', 'twitch', 'Sim', {}, { simulated: true }), test.context);
    expect(test.state().card?.squares[squareIndex(test, 'GG chat')]).toMatchObject({ have: 1, marked: false });
    await bingo.onEvent(event('chat.message', 'kick', 'Elsewhere', { message: 'gg' }), test.context);
    expect(test.state().card?.squares[squareIndex(test, 'GG chat')]).toMatchObject({ have: 1 });
    await bingo.onEvent(event('chat.message', 'tiktok', 'Second', { message: 'what a gg' }), test.context);
    const marked = test.state().card?.squares.filter((square) => square.marked).map((square) => square.text).sort();
    expect(marked).toEqual(['Follow x2', 'GG chat', 'Hydrate']);
    expect(test.state().card?.wins).toEqual([]);
    // Viewers cannot mark squares; a moderator finishes every row the event squares are in.
    await bingo.onEvent(command('twitch', 'Sloth', ['mark', '1', '2', '3', '4', '5', '6', '7', '8', '9']), test.context);
    expect(test.state().card?.wins).toEqual([]);
    await bingo.onEvent(command('twitch', 'Mod', ['mark', '1', '2', '3', '4', '5', '6', '7', '8', '9'], ['moderator']), test.context);
    const card = test.state().card;
    expect(card?.status).toBe('won');
    expect(card?.wins).toHaveLength(1);
    expect(['Sloth', 'Linked']).toContain(card?.wins[0]?.name);
    expect(card?.wins[0]?.points).toBe(50);
    expect(test.context.viewerFoundation.mutate).toHaveBeenCalledTimes(1);
    expect(test.context.viewerFoundation.mutate).toHaveBeenCalledWith(expect.objectContaining({ operation: 'add', amount: 50, reason: 'Stream Bingo win' }));
    const sent = test.context.chat.send.mock.calls.map((call) => (call as unknown as [{ message: string; selectedPlatforms: string[] }])[0]);
    const tiktokWin = sent.find((message) => message.message.startsWith('BINGO!') && message.selectedPlatforms[0] === 'tiktok');
    expect(tiktokWin?.message.length).toBeLessThanOrEqual(150);
    expect(test.state().leaderboard.find((entry) => entry.displayName === card?.wins[0]?.name)).toMatchObject({ wins: 1, cards: 1 });
    expect(test.state().allTime).toHaveLength(1);
    // The next card starts on its own after the pause.
    expect(test.tasks).toHaveLength(1);
    await test.tasks[0]?.();
    expect(test.state().card).toMatchObject({ id: 'card-2', status: 'playing', players: [], wins: [] });
  });

  it('announces a bingo with nobody joined, and keeps paying new lines when asked', async () => {
    const test = runtime({ afterWin: 'keep-playing', winnerPoints: 0 });
    await bingo.start(test.context);
    await bingo.controlPanel({ operation: 'action', action: 'new-quiet' }, test.context);
    expect(test.context.chat.send).not.toHaveBeenCalled();
    await bingo.controlPanel({ operation: 'action', action: 'mark', values: { square: 1 } }, test.context);
    await bingo.controlPanel({ operation: 'action', action: 'mark', values: { square: 2 } }, test.context);
    const status = await bingo.controlPanel({ operation: 'action', action: 'mark', values: { square: 3 } }, test.context);
    expect(status.message).toBe('Marked 1 square.');
    expect(test.state().card?.wins).toEqual([expect.objectContaining({ noWinner: true, lines: ['r0'] })]);
    expect(test.state().card?.status).toBe('playing');
    expect(test.context.chat.send).toHaveBeenCalledWith(expect.objectContaining({ message: 'BINGO! The card made a line, but nobody had joined. Type !bingo to join the next card!' }));
    await bingo.onEvent(command('twitch', 'Late'), test.context);
    await bingo.onEvent(command('twitch', 'Mod', ['mark', '4', '7'], ['broadcaster']), test.context);
    expect(test.state().card?.wins.at(-1)).toMatchObject({ name: 'Late', lines: ['c0'] });
    expect(test.context.viewerFoundation.mutate).not.toHaveBeenCalled();
    const panel = await bingo.controlPanel({ operation: 'status' }, test.context);
    expect(panel.lists[0].items[0]).toMatchObject({ title: `1. ${test.state().card?.squares[0]?.text ?? ''}`, badge: '✓', actions: [{ action: 'unmark' }] });
  });

  it('answers stats and top, and keeps one identity for linked accounts', async () => {
    expect(playerKey({ platform: 'twitch', user: { id: '42' } }, 'viewer-linked-0001')).toBe('vf:viewer-linked-0001');
    expect(playerKey({ platform: 'twitch', user: { id: '42' } })).toBe('twitch:id:42');
    expect(fairPick(['a', 'b', 'c'], () => 2)).toBe('c');
    expect(fairPick([])).toBeUndefined();
    const test = runtime();
    await bingo.start(test.context);
    await bingo.onEvent(command('twitch', 'Nobody', ['stats']), test.context);
    expect(test.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'Nobody: 0 bingo wins this month, 0 all time.' }));
    await bingo.onEvent(command('twitch', 'Nobody', ['top']), test.context);
    expect(test.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'No bingo wins yet this month.' }));
  });

  it('starts a new month on the 1st in the creator\'s time zone, keeping a hall of fame and all-time wins', () => {
    const june30 = Date.parse('2026-07-01T03:00:00Z');
    expect(seasonKey('America/Chicago', june30)).toBe('2026-06');
    expect(seasonKey('UTC', june30)).toBe('2026-07');
    const state = stateFor({ month: '2026-06', monthCards: 4, leaderboard: [{ key: 'a', displayName: 'Ana', wins: 3, cards: 4 }, { key: 'b', displayName: 'Bo', wins: 5, cards: 4 }], allTime: [['a', 7, 'Ana']] });
    expect(trackerMonth('thsv.stream-bingo', state)).toBe('2026-06');
    expect(summarizeTracker('thsv.stream-bingo', state)).toMatchObject({ participants: 2, cards: 4, leaders: [{ name: 'Bo', wins: 5 }, { name: 'Ana', wins: 3 }] });
    expect(rollSeason(state, 'America/Chicago', june30)).toBe(false);
    expect(rollSeason(state, 'UTC', june30)).toBe(true);
    expect(state).toMatchObject({ month: '2026-07', leaderboard: [], monthCards: 0, allTime: [['a', 7, 'Ana']] });
    expect(state.hallOfFame).toEqual([{ month: '2026-06', cards: 4, leaders: [{ displayName: 'Bo', platform: '', wins: 5 }, { displayName: 'Ana', platform: '', wins: 3 }] }]);
  });

  it('does nothing while switched off, and hides the card', async () => {
    const test = runtime({ enabled: false });
    await bingo.start(test.context);
    await bingo.onEvent(command('twitch', 'Sloth'), test.context);
    expect(test.context.overlay.publish).toHaveBeenLastCalledWith('thsv.stream-bingo.bingo.hide', {}, { lane: 'persistent' });
    await expect(bingo.controlPanel({ operation: 'action', action: 'new' }, test.context)).rejects.toThrow('switched off');
  });

  it('ships a matching package, schema defaults and a wizard preview', async () => {
    const descriptor = JSON.parse(await readFile('addons/stream-bingo/module-package.json', 'utf8')) as { permissions: string[]; manifest: { eventSubscriptions: string[]; commandsProvided: unknown[]; dependencies: string[] } };
    expect(descriptor.manifest.eventSubscriptions).toEqual(manifest.eventSubscriptions);
    expect(descriptor.manifest.commandsProvided).toEqual(manifest.commandsProvided);
    expect(descriptor.manifest.dependencies).toEqual(['thsv.viewer-foundation']);
    expect(descriptor.permissions).toEqual(expect.arrayContaining(['viewer.foundation.read', 'viewer.foundation.mutate', 'overlay.publish', 'chat.send']));
    const schema = JSON.parse(await readFile('addons/stream-bingo/schemas/config.json', 'utf8')) as { properties: Record<string, { default?: unknown }> };
    expect(schema.properties['enabled']?.default).toBe(false);
    for (const pack of ['squares', 'gamingPack', 'chattingPack']) {
      const rows = schema.properties[pack]?.default as string[];
      expect(rows.length, pack).toBeGreaterThanOrEqual(24);
      expect(rows.every((row) => parseSquare(row) !== undefined), pack).toBe(true);
    }
    expect(addOnOverlayPreviewTopic('thsv.stream-bingo')).toBe('thsv.stream-bingo.bingo.update');
    const preview = buildAddOnOverlayPreview({ moduleId: 'thsv.stream-bingo', name: 'Stream Bingo', settings: { squares: SQUARES, gridSize: '3x3', layout: 'vertical' } }) as { squares: Square[]; layout: string; grid: number };
    expect(preview).toMatchObject({ layout: 'vertical', grid: 3 });
    expect(preview.squares).toHaveLength(9);
    expect(preview.squares[4]).toMatchObject({ free: true });
  });

  it('ships every viewer-facing default in all nine languages', async () => {
    const schema = JSON.parse(await readFile('addons/stream-bingo/schemas/config.json', 'utf8')) as Record<string, unknown>;
    const english = validateSettings(schema, {}, true) as Record<string, unknown>;
    for (const language of SUPPORTED_LANGUAGE_CODES.filter((code) => code !== 'en')) {
      const settings = validateSettings(schema, {}, true, languageSettingDefaults('thsv.stream-bingo', language)) as Record<string, unknown>;
      for (const key of ['title', 'winMessage', 'noWinnerMessage', 'newCardMessage', 'hintText', 'playersLabel', 'squares', 'gamingPack', 'chattingPack', 'patternNames']) expect(settings[key], `${language} ${key}`).not.toEqual(english[key]);
      const pack = settingsFor({ settings: { ...settings, squarePack: 'mixed' } });
      expect(pack.pool.length, language).toBeGreaterThanOrEqual(60);
      expect(pack.pool.filter((square: { when: string }) => square.when !== 'manual').length, language).toBeGreaterThan(10);
    }
  });
});
