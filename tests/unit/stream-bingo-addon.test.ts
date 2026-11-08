import type * as Crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Cards are shuffled with secure random numbers. The tests make the shuffle keep the square order, so the three
// event squares never land in one line by chance (the draw then always picks the newest eligible player).
vi.mock('node:crypto', async (importOriginal) => ({ ...(await importOriginal<typeof Crypto>()), randomInt: (maximum: number) => Math.max(0, maximum - 1) }));
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import bingo, { fairPick, lines, manifest, newCard, newWin, parseSquare, playerKey, rollSeason, seasonKey, settingsFor, squaresAway, stateFor } from '../../addons/stream-bingo/dist/index.js';
import { addOnOverlayPreviewTopic, buildAddOnOverlayPreview } from '../../bridge/services/http-server.js';
import { summarizeTracker, trackerMonth } from '../../bridge/services/monthly-tracker-reports.js';
import { languageSettingDefaults } from '../../bridge/core/language-defaults.js';
import { SUPPORTED_LANGUAGE_CODES } from '../../bridge/core/locale.js';
import { validateSettings } from '../../bridge/services/addon-wizard-service.js';

interface Square { n: number; text: string; when: string; need: number; have: number; marked: boolean; free: boolean }
interface Card { id: string; size: number; status: string; hype: boolean; squares: Square[]; players: Array<{ key: string; name: string }>; wins: Array<{ name: string; noWinner: boolean; bonus: boolean; points: number; lines: string[] }> }
interface State { suggestions: Array<{ id: string; text: string }>; approved: string[]; month: string; card: Card | null; leaderboard: Array<{ key: string; displayName: string; wins: number; cards: number }>; allTime: Array<[string, number, string]>; hallOfFame: Array<{ month: string; leaders: Array<{ displayName: string; wins: number }> }>; monthWins: number }

// Six manual squares and three event squares; a 3x3 card with no free square uses exactly these nine, in this
// order. The event squares (1, 6 and 8) share no line.
const SQUARES = ['Follow x2 | follow | 2 |', 'Alpha | manual | 1 |', 'Bravo | manual | 1 |', 'Charlie | manual | 1 |', 'Golf | manual | 1 |', 'Hydrate | reward | 1 | Hydrate', 'Hotel | manual | 1 |', 'GG chat | chat | 2 | gg', 'India | manual | 1 |'];

function runtime(settings: Record<string, unknown> = {}, saved: Record<string, unknown> = {}) {
  let state: Record<string, unknown> = saved;
  const tasks: Array<() => Promise<void>> = [];
  const context = {
    settings: { enabled: true, squares: SQUARES, gridSize: '3x3', freeCenter: false, platforms: ['twitch', 'tiktok', 'youtube'], hypeMinutes: 0, ...settings },
    state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) },
    chat: { send: vi.fn(async () => []) },
    overlay: { publish: vi.fn(async () => undefined) },
    schedule: { after: vi.fn((_delay: number, task: () => Promise<void>) => { tasks.push(task); return `task-${String(tasks.length)}`; }), cancel: vi.fn(() => true) },
    viewerFoundation: {
      getProjection: vi.fn(async ({ platform, userId }: { platform: string; userId: string }) => ({ viewerId: userId.startsWith('linked') ? 'viewer-linked-0001' : `viewer-${platform}-${userId}` })),
      mutate: vi.fn(async () => ({})),
    },
    discord: { post: vi.fn(async () => ({ ok: true })) },
    streamerbot: { runApprovedAction: vi.fn(async () => undefined) },
    approvedActionIds: [] as string[],
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
    expect(state.hallOfFame).toEqual([{ month: '2026-06', cards: 4, wins: 0, leaders: [{ displayName: 'Bo', platform: '', wins: 5 }, { displayName: 'Ana', platform: '', wins: 3 }] }]);
  });

  it('does nothing while switched off, and hides the card', async () => {
    const test = runtime({ enabled: false });
    await bingo.start(test.context);
    await bingo.onEvent(command('twitch', 'Sloth'), test.context);
    expect(test.context.overlay.publish).toHaveBeenLastCalledWith('thsv.stream-bingo.bingo.hide', {}, { lane: 'persistent' });
    await expect(bingo.controlPanel({ operation: 'action', action: 'new' }, test.context)).rejects.toThrow('switched off');
  });

  it('reads command squares, where viewers count once and moderators count every use', async () => {
    expect(parseSquare('Lurkers | command | 2 | !Lurk')).toEqual({ text: 'Lurkers', when: 'command', need: 2, match: 'lurk' });
    const test = runtime({ squares: ['Lurkers | command | 2 | lurk', 'Deaths | command | 3 | !death', ...SQUARES.slice(2)] });
    await bingo.start(test.context);
    await bingo.controlPanel({ operation: 'action', action: 'new-quiet' }, test.context);
    const lurk = () => test.state().card?.squares[squareIndex(test, 'Lurkers')];
    const deaths = () => test.state().card?.squares[squareIndex(test, 'Deaths')];
    await bingo.onEvent(event('chat.message', 'twitch', 'Ann', { message: '!lurk' }), test.context);
    await bingo.onEvent(event('chat.message', 'twitch', 'Ann', { message: '!LURK' }), test.context);
    expect(lurk()).toMatchObject({ have: 1, marked: false });
    await bingo.onEvent(event('chat.message', 'tiktok', 'Ben', { message: '!lurk brb' }), test.context);
    expect(lurk()).toMatchObject({ marked: true });
    await bingo.onEvent(event('chat.message', 'twitch', 'Mod', { message: '!death' }, { roles: ['moderator'] }), test.context);
    await bingo.onEvent(event('chat.message', 'twitch', 'Mod', { message: '!death +' }, { roles: ['moderator'] }), test.context);
    await bingo.onEvent(event('chat.message', 'twitch', 'Mod', { message: '!death -' }, { roles: ['moderator'] }), test.context);
    await bingo.onEvent(event('chat.message', 'twitch', 'Mod', { message: '!death reset' }, { roles: ['moderator'] }), test.context);
    expect(deaths()).toMatchObject({ have: 2, marked: false });
    await bingo.onEvent(event('chat.message', 'twitch', 'Me', { message: '!death', fromConnectedAccount: true }), test.context);
    expect(deaths()).toMatchObject({ marked: true });
  });

  it('keeps the card going after a bingo for a full card bonus paid to another player', async () => {
    const test = runtime({ winnerPoints: 10, blackoutBonus: 500, afterWin: 'new-card', bonusWord: 'ALL DONE' });
    await bingo.start(test.context);
    await bingo.controlPanel({ operation: 'action', action: 'new-quiet' }, test.context);
    await bingo.onEvent(command('twitch', 'Ann'), test.context);
    await bingo.onEvent(command('twitch', 'Ben'), test.context);
    await bingo.onEvent(command('twitch', 'Mod', ['mark', '1', '2', '3'], ['moderator']), test.context);
    expect(test.state().card?.status).toBe('playing');
    expect(test.state().card?.wins).toHaveLength(1);
    expect(squaresAway(test.state().card)).toBe(0);
    // More lines do not pay again (the creator did not pick "keep playing"), only the full card does.
    await bingo.onEvent(command('twitch', 'Mod', ['mark', '4', '5', '6'], ['moderator']), test.context);
    expect(test.state().card?.wins).toHaveLength(1);
    const panel = await bingo.controlPanel({ operation: 'status' }, test.context);
    expect(panel.summary).toContainEqual({ label: 'Blackout bonus', value: '3 squares to go' });
    expect(test.tasks).toHaveLength(0);
    await bingo.onEvent(command('twitch', 'Mod', ['mark', '7', '8', '9'], ['moderator']), test.context);
    const card = test.state().card;
    expect(card?.status).toBe('won');
    expect(card?.wins.map((win) => win.bonus)).toEqual([false, true]);
    expect(card?.wins[1]?.name).not.toBe(card?.wins[0]?.name);
    expect(card?.wins[1]?.points).toBe(500);
    expect(test.context.viewerFoundation.mutate).toHaveBeenLastCalledWith(expect.objectContaining({ amount: 500, reason: 'Stream Bingo blackout bonus' }));
    expect(test.context.chat.send).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('FULL CARD!') }));
    expect(test.context.overlay.publish).toHaveBeenLastCalledWith('thsv.stream-bingo.bingo.update', expect.objectContaining({ win: expect.objectContaining({ bonus: true }), labels: expect.objectContaining({ bonus: 'ALL DONE' }) }), { lane: 'persistent' });
    // The bonus does not count as a second bingo win in the monthly stats.
    expect(test.state().monthWins).toBe(1);
    expect(test.tasks).toHaveLength(1);
  });

  it('posts bingos to Discord, runs the approved Streamer.bot action, and sends a monthly recap', async () => {
    const actionId = '0f8fad5b-d9cb-469f-a165-70867728950e';
    const test = runtime({ discordWebhookId: 'bingo-hook', winActionId: actionId, winnerPoints: 25 }, { month: '2000-01', monthCards: 3, monthWins: 2, leaderboard: [{ key: 'a', displayName: 'Ana', wins: 2, cards: 3 }] });
    test.context.approvedActionIds.push(actionId);
    await bingo.start(test.context);
    expect(test.context.discord.post).toHaveBeenCalledWith({ webhookId: 'bingo-hook', content: 'Stream Bingo in 2000-01: 3 cards, 2 bingos. Top players: 1. Ana (2)', username: 'Stream Bingo' });
    await bingo.controlPanel({ operation: 'action', action: 'new-quiet' }, test.context);
    await bingo.onEvent(command('twitch', 'Ann'), test.context);
    await bingo.onEvent(command('twitch', 'Mod', ['mark', '1', '2', '3'], ['moderator']), test.context);
    expect(test.context.discord.post).toHaveBeenLastCalledWith(expect.objectContaining({ content: expect.stringContaining('Ann (Twitch) wins +25 points') }));
    expect(test.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(actionId, expect.objectContaining({ bingoWinner: 'Ann', bingoPlatform: 'Twitch', bingoPoints: 25, bingoBonus: false, bingoPlayers: 1 }));
    // An action the creator has not approved never runs.
    const other = runtime({ winActionId: '1f8fad5b-d9cb-469f-a165-70867728950e' });
    await bingo.start(other.context);
    await bingo.controlPanel({ operation: 'action', action: 'new-quiet' }, other.context);
    await bingo.onEvent(command('twitch', 'Mod', ['mark', '1', '2', '3'], ['moderator']), other.context);
    expect(other.context.streamerbot.runApprovedAction).not.toHaveBeenCalled();
    expect(other.context.discord.post).not.toHaveBeenCalled();
  });

  it('takes square ideas from chat that only reach the card once the streamer adds them', async () => {
    const test = runtime({ suggestionsEnabled: true, squares: ['Only | manual | 1 |'] });
    await bingo.start(test.context);
    await bingo.onEvent(command('twitch', 'Ann', ['suggest', 'Streamer', 'rage', 'quits']), test.context);
    await bingo.onEvent(command('twitch', 'Ben', ['suggest', 'streamer', 'RAGE', 'quits']), test.context);
    await bingo.onEvent(command('twitch', 'Ben', ['idea', 'Cat on keyboard']), test.context);
    expect(test.state().suggestions.map((idea) => idea.text)).toEqual(['Streamer rage quits', 'Cat on keyboard']);
    expect(test.context.chat.send).toHaveBeenCalledWith(expect.objectContaining({ message: 'Thanks Ann! Your square idea was sent to the streamer.' }));
    let panel = await bingo.controlPanel({ operation: 'status' }, test.context);
    const ideas = panel.lists.find((list: { title: string }) => list.title === 'Square ideas from chat');
    expect(ideas.items[0]).toMatchObject({ title: 'Cat on keyboard', actions: [{ action: 'add-idea' }, { action: 'dismiss-idea' }] });
    const [rage, cat] = test.state().suggestions;
    panel = await bingo.controlPanel({ operation: 'action', action: 'add-idea', values: { id: rage?.id } }, test.context);
    expect(panel.message).toContain('Added "Streamer rage quits"');
    await bingo.controlPanel({ operation: 'action', action: 'dismiss-idea', values: { id: cat?.id } }, test.context);
    expect(test.state()).toMatchObject({ suggestions: [], approved: ['Streamer rage quits'] });
    await bingo.controlPanel({ operation: 'action', action: 'new-quiet' }, test.context);
    expect(test.state().card?.squares.map((square) => square.text)).toContain('Streamer rage quits');
    await bingo.controlPanel({ operation: 'action', action: 'remove-idea', values: { text: 'streamer rage quits' } }, test.context);
    expect(test.state().approved).toEqual([]);
    // Switched off, !bingo suggest does nothing at all.
    const off = runtime();
    await bingo.start(off.context);
    await bingo.onEvent(command('twitch', 'Ann', ['suggest', 'Anything']), off.context);
    expect(off.state().suggestions).toEqual([]);
  });

  it('hypes a quiet card once, until the next square ticks', async () => {
    const test = runtime({ hypeMinutes: 5 });
    await bingo.start(test.context);
    await bingo.controlPanel({ operation: 'action', action: 'new-quiet' }, test.context);
    expect(test.context.schedule.after).toHaveBeenLastCalledWith(300_000, expect.any(Function));
    await bingo.onEvent(command('twitch', 'Mod', ['mark', '1', '2'], ['moderator']), test.context);
    await test.tasks.at(-1)?.();
    expect(test.state().card?.hype).toBe(true);
    expect(test.context.overlay.publish).toHaveBeenLastCalledWith('thsv.stream-bingo.bingo.update', expect.objectContaining({ hype: true }), { lane: 'persistent' });
    expect(test.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'The card needs 1 more for a BINGO! Type !bingo to join.' }));
    const scheduled = test.context.schedule.after.mock.calls.length;
    const said = test.context.chat.send.mock.calls.length;
    await test.tasks.at(-1)?.();
    expect(test.context.chat.send).toHaveBeenCalledTimes(said);
    expect(test.context.schedule.after).toHaveBeenCalledTimes(scheduled);
    await bingo.onEvent(command('twitch', 'Mod', ['mark', '5'], ['moderator']), test.context);
    expect(test.state().card?.hype).toBe(false);
    expect(test.context.schedule.after).toHaveBeenCalledTimes(scheduled + 1);
  });

  it('ships a matching package, schema defaults and a wizard preview', async () => {
    const descriptor = JSON.parse(await readFile('addons/stream-bingo/module-package.json', 'utf8')) as { permissions: string[]; manifest: { eventSubscriptions: string[]; commandsProvided: unknown[]; dependencies: string[] } };
    expect(descriptor.manifest.eventSubscriptions).toEqual(manifest.eventSubscriptions);
    expect(descriptor.manifest.commandsProvided).toEqual(manifest.commandsProvided);
    expect(descriptor.manifest.dependencies).toEqual(['thsv.viewer-foundation']);
    expect(descriptor.permissions).toEqual(expect.arrayContaining(['viewer.foundation.read', 'viewer.foundation.mutate', 'overlay.publish', 'chat.send', 'discord.post', 'streamerbot.run-approved-action']));
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
