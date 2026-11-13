// Stream Bingo: one shared bingo card on stream for the whole community. Squares tick by themselves when
// things happen on stream (follows, subs, Bits, gifts, tips, raids, channel point rewards, chat words) or
// when a moderator marks them. Viewers type !bingo to join. When the card completes a line (or the pattern
// the creator picked), StreamBridge draws one fair winner from everyone who joined, posts it on every
// ticked platform and can add Viewer Foundation points. Wins are counted per month (reset on the 1st in the
// creator's time zone, with a hall of fame) and all time. No Streamer.bot import is needed.
import { randomInt } from 'node:crypto';

const MODULE_ID = 'thsv.stream-bingo';
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok', 'facebook']);
const PLATFORM_LABELS = Object.freeze({ twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick', tiktok: 'TikTok', facebook: 'Facebook' });
const LIMITS = Object.freeze({ twitch: 500, youtube: 200, kick: 500, tiktok: 150, facebook: 500 });
const POSITIONS = Object.freeze(['top-left', 'top-center', 'top-right', 'center-left', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right']);
const PATTERNS = Object.freeze(['line', 'two-lines', 'corners', 'x', 'blackout']);
const PATTERN_LABELS = Object.freeze({ line: 'a line', 'two-lines': 'two lines', corners: 'the four corners', x: 'an X', blackout: 'a full card' });
const MAX_PLAYERS = 5_000;
const ALL_TIME_LIMIT = 5_000;
const LEADERBOARD_LIMIT = 2_000;
const HALL_OF_FAME_MONTHS = 12;
const MAX_SUGGESTIONS = 50;
const MAX_APPROVED = 100;

// ---------- Village Games kit ----------
// Plumbing shared by the community games (Stream Bingo now, more later): one identity per viewer (linked
// accounts count once through Viewer Foundation), fair draws, monthly seasons in the creator's time zone,
// all-time totals, points through the Viewer Foundation wallet and platform-safe chat messages.

export function clean(value, maximum = 160) {
  return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '')].slice(0, maximum).join('');
}
function integer(value, minimum, maximum, fallback) { const number = Number(value); return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback; }
function choice(value, choices, fallback) { return choices.includes(value) ? value : fallback; }
function https(value) { return typeof value === 'string' && value.startsWith('https://') && value.length <= 2_000 ? value : ''; }
function color(value, fallback) { return typeof value === 'string' && /^#[0-9a-f]{6}$/iu.test(value) ? value : fallback; }

/** The creator's time zone (empty = this PC), checked so a typo falls back instead of breaking the game. */
export function resolveTimeZone(value) {
  const zone = clean(value, 100);
  if (zone) { try { new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(); return zone; } catch { /* fall through */ } }
  try { return new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

/** The season (calendar month) a moment belongs to in the creator's time zone, as YYYY-MM. */
export function seasonKey(timeZone, now = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(new Date(now)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}`;
}

/** One stable key per person: their Viewer Foundation ID (linked accounts share it), else platform + user. */
export function playerKey(event, viewerId = '') {
  if (/^[A-Za-z0-9_-]{8,128}$/u.test(viewerId)) return `vf:${viewerId}`;
  const id = clean(event?.user?.id, 128);
  const name = clean(event?.user?.name, 128).toLowerCase();
  return id || name ? `${event.platform}:${id ? `id:${id}` : `name:${name}`}` : '';
}

/** A fair pick: every entry has the same chance, using the operating system's secure random numbers. */
export function fairPick(entries, pick = randomInt) {
  if (!Array.isArray(entries) || entries.length === 0) return undefined;
  return entries[pick(entries.length)];
}

export function moderator(event) {
  const roles = Array.isArray(event?.user?.roles) ? event.user.roles.map((role) => String(role).toLowerCase()) : [];
  return roles.includes('broadcaster') || roles.includes('moderator') || roles.includes('mod');
}

function shorten(text, maximum) {
  const characters = [...text];
  return characters.length <= maximum ? text : `${characters.slice(0, Math.max(1, maximum - 1)).join('').trimEnd()}…`;
}

export function fill(template, values) {
  return clean(String(template ?? '').replace(/\{([a-z]+)\}/giu, (whole, key) => (Object.hasOwn(values, key) ? String(values[key]) : whole)), 1_000);
}

/** Posts one message to each platform, cut to that platform's limit (TikTok 150, YouTube 200). */
async function sayOn(context, platforms, message) {
  for (const platform of platforms) {
    if (!PLATFORMS.includes(platform)) continue;
    await context.chat.send({ message: shorten(message, LIMITS[platform]), routing: 'selected', selectedPlatforms: [platform], overflow: 'reject' }).catch(() => undefined);
  }
}

async function viewerIdFor(context, event) {
  const userId = clean(event?.user?.id, 256);
  if (!userId || !PLATFORMS.includes(event?.platform)) return '';
  try { return (await context.viewerFoundation.getProjection({ platform: event.platform, userId }))?.viewerId ?? ''; } catch { return ''; }
}

/** Adds points to a viewer's Viewer Foundation wallet. Returns how many were added and the creator's name for them. */
async function awardPoints(context, viewerId, amount, reason, idempotencyKey) {
  if (!viewerId || amount < 1) return { amount: 0, currency: '' };
  try {
    const result = await context.viewerFoundation.mutate({ viewerId, operation: 'add', amount, reason: clean(reason, 120), idempotencyKey: clean(idempotencyKey, 128) });
    return { amount, currency: clean(result?.currencyName, 40) };
  } catch { return { amount: 0, currency: '' }; }
}

// ---------- Squares ----------
// Each square row is: Square text | when it ticks | how many | reward title or chat word.
export const WHEN = Object.freeze({
  manual: { label: 'A moderator marks it', eventTypes: [] },
  follow: { label: 'New follows', eventTypes: ['channel.follow'] },
  sub: { label: 'Subs and members', eventTypes: ['channel.subscription', 'channel.membership'] },
  'gift-sub': { label: 'Gifted subs', eventTypes: ['channel.gift-subscription'], quantity: true },
  bits: { label: 'Bits cheered', eventTypes: ['engagement.cheer'], quantity: true },
  gift: { label: 'TikTok and YouTube gifts', eventTypes: ['engagement.gift'], quantity: true },
  tip: { label: 'Tips and Super Chats', eventTypes: ['engagement.donation', 'engagement.super-chat', 'engagement.super-sticker'] },
  raid: { label: 'Raids', eventTypes: ['channel.raid'] },
  reward: { label: 'A channel point reward', eventTypes: ['reward.redemption'], needsMatch: true },
  chat: { label: 'Different chatters say a word', eventTypes: ['chat.message'], needsMatch: true },
  // A chat command such as !lurk or a death counter's !death. Each viewer counts once per square; moderators and the
  // streamer count every use, so a counter command ticks the square each time it goes up.
  command: { label: 'A chat command is used', eventTypes: ['chat.message'], needsMatch: true },
});
const WHEN_IDS = Object.freeze(Object.keys(WHEN));
const EVENT_TYPES = Object.freeze([...new Set(Object.values(WHEN).flatMap((when) => when.eventTypes))]);

function matchKey(value) { return clean(value, 100).toLowerCase().normalize('NFKC'); }
function commandKey(value) { return matchKey(value).replace(/^[!?]+/u, '').split(' ')[0] ?? ''; }

export function parseSquare(line) {
  const parts = (typeof line === 'string' ? line : '').split('|').map((part) => clean(part, 100));
  const text = clean(parts[0], 60);
  if (!text) return undefined;
  const when = WHEN_IDS.includes(parts[1]?.toLowerCase()) ? parts[1].toLowerCase() : 'manual';
  const match = when === 'command' ? commandKey(parts[3]) : matchKey(parts[3]);
  if (WHEN[when].needsMatch && !match) return { text, when: 'manual', need: 1, match: '' };
  return { text, when, need: integer(Number(parts[2] || 1), 1, 100_000, 1), match };
}
function squareList(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).map(parseSquare).filter((square) => {
    if (!square) return false;
    const key = square.text.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true;
  }).slice(0, 100);
}

const FALLBACK_SQUARES = Object.freeze([
  'A new follower | follow | 1 |', '3 new followers | follow | 3 |', 'Someone subscribes | sub | 1 |', 'A gifted sub | gift-sub | 1 |',
  '100 Bits cheered | bits | 100 |', 'A tip or Super Chat | tip | 1 |', 'A raid arrives | raid | 1 |', 'A TikTok gift | gift | 1 |',
  '5 people say GG | chat | 5 | gg', '3 people say LOL | chat | 3 | lol', 'Hydrate reward | reward | 1 | Hydrate', 'Chat says hi | chat | 3 | hi',
  'Streamer laughs | manual | 1 |', 'Streamer says oops | manual | 1 |', 'Pet appears | manual | 1 |', 'Tech trouble | manual | 1 |',
  'Song request | manual | 1 |', 'Streamer forgets to unmute | manual | 1 |', 'Chat goes wild | manual | 1 |', 'Snack break | manual | 1 |',
  'Inside joke | manual | 1 |', 'Streamer sings | manual | 1 |', 'Someone lurks | manual | 1 |', 'Big win | manual | 1 |',
]);

function withoutRepeats(squares) {
  const seen = new Set();
  return squares.filter((square) => { const key = square.text.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });
}
/** A pack with too few squares for the card is topped up from the built-in squares. */
function toppedUp(squares, gridSize) {
  const result = [...squares]; const seen = new Set(squares.map((square) => square.text.toLowerCase()));
  for (const square of squareList(FALLBACK_SQUARES)) { if (result.length >= gridSize * gridSize) break; const key = square.text.toLowerCase(); if (!seen.has(key)) { seen.add(key); result.push(square); } }
  return result;
}

export function settingsFor(context) {
  const raw = context?.settings ?? {};
  const platforms = (Array.isArray(raw.platforms) ? raw.platforms : PLATFORMS).filter((platform, index, all) => PLATFORMS.includes(platform) && all.indexOf(platform) === index);
  const pack = choice(raw.squarePack, ['mine', 'gaming', 'chatting', 'mixed'], 'mine');
  const mine = squareList(raw.squares ?? FALLBACK_SQUARES);
  const gaming = squareList(raw.gamingPack); const chatting = squareList(raw.chattingPack);
  const pool = pack === 'gaming' ? gaming : pack === 'chatting' ? chatting : pack === 'mixed' ? [...mine, ...gaming, ...chatting] : mine;
  const gridSize = integer(Number(String(raw.gridSize ?? '5').charAt(0)), 3, 5, 5);
  const packPool = withoutRepeats(pool);
  return {
    enabled: raw.enabled === true, platforms,
    command: clean(raw.bingoCommand, 40).replace(/^!+/u, '').toLowerCase() || 'bingo',
    gridSize, freeCenter: raw.freeCenter !== false,
    pattern: choice(raw.winPattern, PATTERNS, 'line'), afterWin: choice(raw.afterWin, ['new-card', 'keep-playing', 'stop'], 'new-card'),
    newCardSeconds: integer(raw.newCardSeconds, 5, 600, 30),
    pool: toppedUp(packPool, gridSize), packPool, pack, ownSquares: mine.length,
    winnerPoints: integer(raw.winnerPoints, 0, 100_000, 100), joinPoints: integer(raw.joinPoints, 0, 1_000, 0),
    confirmJoins: raw.confirmJoins === true, announceNewCard: raw.announceNewCard !== false,
    joinMessage: clean(raw.joinMessage, 300) || '{name} joined Stream Bingo! {players} playing.',
    newCardMessage: clean(raw.newCardMessage, 300) || 'A new Stream Bingo card is on screen! Type !{command} to join the draw.',
    winMessage: clean(raw.winMessage, 300) || 'BINGO! The card made {pattern}. {winner} ({platform}) wins{points}! {players} were playing.',
    noWinnerMessage: clean(raw.noWinnerMessage, 300) || 'BINGO! The card made {pattern}, but nobody had joined. Type !{command} to join the next card!',
    statsMessage: clean(raw.statsMessage, 300) || '{name}: {month} bingo wins this month, {total} all time.',
    topMessage: clean(raw.topMessage, 300) || 'Bingo this month: {top}',
    noWinsMessage: clean(raw.noWinsMessage, 300) || 'No bingo wins yet this month.',
    noCardMessage: clean(raw.noCardMessage, 300) || 'There is no bingo card to join right now.',
    hintText: clean(raw.hintText, 60) || 'Type !{command} to play', playersLabel: clean(raw.playersLabel, 30) || 'playing',
    freeText: clean(raw.freeText, 20) || 'FREE', bingoWord: clean(raw.bingoWord, 20) || 'BINGO!', nobodyText: clean(raw.nobodyText, 60) || 'Nobody joined this card',
    title: clean(raw.title, 40) || 'STREAM BINGO',
    layout: choice(raw.layout, ['horizontal', 'vertical'], 'horizontal'),
    position: choice(raw.position, POSITIONS, 'bottom-right'), size: choice(raw.cardSize, ['small', 'medium', 'large'], 'medium'),
    showNumbers: raw.showNumbers !== false, showPlayers: raw.showPlayers !== false, showRecent: raw.showRecent !== false,
    winSeconds: integer(raw.winSeconds, 4, 60, 12), markColor: color(raw.markColor, '#7ff5cc'),
    patternNames: Object.fromEntries(PATTERNS.map((pattern, index) => [pattern, clean(Array.isArray(raw.patternNames) ? raw.patternNames[index] : '', 40) || PATTERN_LABELS[pattern]])),
    timeZone: resolveTimeZone(raw.timeZone),
    suggestions: raw.suggestionsEnabled === true,
    suggestMessage: clean(raw.suggestMessage, 300) || 'Thanks {name}! Your square idea was sent to the streamer.',
    blackoutBonus: integer(raw.blackoutBonus, 0, 100_000, 0),
    bonusMessage: clean(raw.bonusMessage, 300) || 'FULL CARD! {winner} ({platform}) wins the blackout bonus{points}!',
    bonusWord: clean(raw.bonusWord, 20) || 'FULL CARD!',
    discordWebhookId: /^[a-z0-9-]{1,64}$/u.test(raw.discordWebhookId) ? raw.discordWebhookId : '',
    discordWins: raw.discordWins !== false, discordMonthly: raw.discordMonthly !== false,
    discordRecapMessage: clean(raw.discordRecapMessage, 300) || 'Stream Bingo in {month}: {cards} cards, {wins} bingos. Top players: {top}',
    winActionId: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(raw.winActionId) ? raw.winActionId : '',
    hypeMinutes: integer(raw.hypeMinutes, 0, 120, 10),
    hypeMessage: clean(raw.hypeMessage, 300) || 'The card needs {left} more for a BINGO! Type !{command} to join.',
  };
}

// ---------- State ----------
function emptyState(now = Date.now(), timeZone = 'UTC') {
  return { month: seasonKey(timeZone, now), card: null, leaderboard: [], allTime: [], hallOfFame: [], monthCards: 0, monthWins: 0, seen: [], noCardReplyAt: 0, cardSequence: 0, suggestions: [], approved: [] };
}
function cleanSquare(raw, index) {
  const when = WHEN_IDS.includes(raw?.when) ? raw.when : 'manual';
  const need = integer(raw?.need, 1, 100_000, 1);
  return {
    n: index + 1, text: clean(raw?.text, 60) || '?', when, need, match: matchKey(raw?.match), free: raw?.free === true,
    have: integer(raw?.have, 0, 1_000_000_000, 0), marked: raw?.marked === true || raw?.free === true,
    markedAt: integer(raw?.markedAt, 0, Number.MAX_SAFE_INTEGER, 0), by: clean(raw?.by, 60), platform: PLATFORMS.includes(raw?.platform) ? raw.platform : '',
    chatters: Array.isArray(raw?.chatters) ? raw.chatters.filter((key) => typeof key === 'string').map((key) => clean(key, 200)).slice(-200) : [],
  };
}
function cleanPerson(raw) {
  return {
    key: clean(raw?.key, 220), viewerId: clean(raw?.viewerId, 128), name: clean(raw?.name, 60) || 'Someone',
    platform: PLATFORMS.includes(raw?.platform) ? raw.platform : '', avatarUrl: https(raw?.avatarUrl), at: integer(raw?.at, 0, Number.MAX_SAFE_INTEGER, 0),
  };
}
export function stateFor(raw, now = Date.now(), timeZone = 'UTC') {
  const state = emptyState(now, timeZone);
  if (/^\d{4}-(0[1-9]|1[0-2])$/u.test(raw?.month)) state.month = raw.month;
  const card = raw?.card;
  if (card && typeof card === 'object' && Array.isArray(card.squares)) {
    const size = integer(card.size, 3, 5, 5);
    const squares = card.squares.slice(0, size * size).map(cleanSquare);
    if (squares.length === size * size) {
      state.card = {
        id: clean(card.id, 40) || 'card', size, pattern: choice(card.pattern, PATTERNS, 'line'), squares,
        startedAt: integer(card.startedAt, 0, Number.MAX_SAFE_INTEGER, 0), status: choice(card.status, ['playing', 'won', 'ended'], 'playing'),
        keepLines: card.keepLines !== false, bonus: integer(card.bonus, 0, 100_000, 0), hype: card.hype === true,
        players: Array.isArray(card.players) ? card.players.map(cleanPerson).filter((person) => person.key).slice(-MAX_PLAYERS) : [],
        wins: Array.isArray(card.wins) ? card.wins.slice(-20).map((win) => ({
          ...cleanPerson(win), noWinner: win?.noWinner === true, bonus: win?.bonus === true, points: integer(win?.points, 0, 1_000_000, 0), currency: clean(win?.currency, 40) || 'points',
          cells: Array.isArray(win?.cells) ? win.cells.filter((cell) => Number.isInteger(cell) && cell >= 0 && cell < size * size).slice(0, 25) : [],
          lines: Array.isArray(win?.lines) ? win.lines.filter((line) => typeof line === 'string').slice(0, 12) : [],
        })) : [],
        recent: Array.isArray(card.recent) ? card.recent.slice(-5).map((item) => ({ n: integer(item?.n, 1, 25, 1), text: clean(item?.text, 60), by: clean(item?.by, 60), platform: PLATFORMS.includes(item?.platform) ? item.platform : '', at: integer(item?.at, 0, Number.MAX_SAFE_INTEGER, 0) })) : [],
      };
    }
  }
  state.leaderboard = Array.isArray(raw?.leaderboard) ? raw.leaderboard.filter((entry) => entry && typeof entry.key === 'string').slice(0, LEADERBOARD_LIMIT).map((entry) => ({
    key: clean(entry.key, 220), displayName: clean(entry.displayName, 60) || 'Someone', platform: PLATFORMS.includes(entry.platform) ? entry.platform : '',
    wins: integer(entry.wins, 0, 1_000_000, 0), points: integer(entry.points, 0, 1_000_000_000, 0), cards: integer(entry.cards, 0, 1_000_000, 0),
  })) : [];
  state.allTime = Array.isArray(raw?.allTime) ? raw.allTime.filter((row) => Array.isArray(row) && typeof row[0] === 'string' && Number.isInteger(row[1]) && row[1] > 0).map((row) => [clean(row[0], 220), Math.min(1_000_000, row[1]), clean(row[2], 60)]).slice(-ALL_TIME_LIMIT) : [];
  state.hallOfFame = Array.isArray(raw?.hallOfFame) ? raw.hallOfFame.filter((entry) => entry && /^\d{4}-\d{2}$/u.test(entry.month)).slice(-HALL_OF_FAME_MONTHS).map((entry) => ({
    month: entry.month, cards: integer(entry.cards, 0, 1_000_000, 0), wins: integer(entry.wins, 0, 1_000_000, 0),
    leaders: Array.isArray(entry.leaders) ? entry.leaders.slice(0, 3).map((leader) => ({ displayName: clean(leader?.displayName, 60) || 'Someone', platform: PLATFORMS.includes(leader?.platform) ? leader.platform : '', wins: integer(leader?.wins, 0, 1_000_000, 0) })) : [],
  })) : [];
  state.monthCards = integer(raw?.monthCards, 0, 1_000_000, 0); state.monthWins = integer(raw?.monthWins, 0, 1_000_000, 0);
  state.seen = Array.isArray(raw?.seen) ? raw.seen.filter((id) => typeof id === 'string').slice(-300) : [];
  state.noCardReplyAt = integer(raw?.noCardReplyAt, 0, Number.MAX_SAFE_INTEGER, 0);
  state.cardSequence = integer(raw?.cardSequence, 0, Number.MAX_SAFE_INTEGER, 0);
  state.suggestions = Array.isArray(raw?.suggestions) ? raw.suggestions.filter((item) => item && typeof item.id === 'string').slice(-MAX_SUGGESTIONS).map((item) => ({
    id: clean(item.id, 40), text: clean(item.text, 60), name: clean(item.name, 60) || 'Someone', key: clean(item.key, 220),
    platform: PLATFORMS.includes(item.platform) ? item.platform : '', at: integer(item.at, 0, Number.MAX_SAFE_INTEGER, 0),
  })).filter((item) => item.id && item.text) : [];
  state.approved = Array.isArray(raw?.approved) ? raw.approved.map((text) => clean(text, 60)).filter(Boolean).slice(0, MAX_APPROVED) : [];
  return state;
}

/** Starts a new season on the 1st: last month's top three go to the hall of fame; all-time totals stay. */
export function rollSeason(state, timeZone, now = Date.now()) {
  const current = seasonKey(timeZone, now);
  if (state.month === current) return false;
  if (current < state.month) return false;
  const leaders = [...state.leaderboard].sort((a, b) => b.wins - a.wins || b.points - a.points).filter((entry) => entry.wins > 0).slice(0, 3);
  if (leaders.length > 0 || state.monthCards > 0) {
    state.hallOfFame.push({ month: state.month, cards: state.monthCards, wins: state.monthWins, leaders: leaders.map((entry) => ({ displayName: entry.displayName, platform: entry.platform, wins: entry.wins })) });
    state.hallOfFame = state.hallOfFame.slice(-HALL_OF_FAME_MONTHS);
  }
  state.month = current; state.leaderboard = []; state.monthCards = 0; state.monthWins = 0;
  return true;
}

function leaderboardEntry(state, person) {
  let entry = state.leaderboard.find((item) => item.key === person.key);
  if (!entry) {
    entry = { key: person.key, displayName: person.name, platform: person.platform, wins: 0, points: 0, cards: 0 };
    state.leaderboard.push(entry);
    if (state.leaderboard.length > LEADERBOARD_LIMIT) state.leaderboard = [...state.leaderboard].sort((a, b) => b.wins - a.wins || b.cards - a.cards).slice(0, LEADERBOARD_LIMIT);
  }
  entry.displayName = person.name; entry.platform = person.platform || entry.platform;
  return entry;
}
function addAllTime(state, person) {
  const index = state.allTime.findIndex((row) => row[0] === person.key);
  const total = (index >= 0 ? state.allTime[index][1] : 0) + 1;
  if (index >= 0) state.allTime.splice(index, 1);
  state.allTime.push([person.key, total, person.name]);
  if (state.allTime.length > ALL_TIME_LIMIT) state.allTime = state.allTime.slice(-ALL_TIME_LIMIT);
  return total;
}

// ---------- Cards and patterns ----------
export function newCard(settings, sequence = 1, pick = randomInt, now = Date.now()) {
  const size = settings.gridSize;
  const center = size % 2 === 1 && settings.freeCenter ? Math.floor((size * size) / 2) : -1;
  const needed = size * size - (center >= 0 ? 1 : 0);
  const pool = [...settings.pool];
  for (let index = pool.length - 1; index > 0; index -= 1) { const other = pick(index + 1); [pool[index], pool[other]] = [pool[other], pool[index]]; }
  const chosen = pool.slice(0, needed);
  while (chosen.length < needed) chosen.push({ text: `Square ${String(chosen.length + 1)}`, when: 'manual', need: 1, match: '' });
  const squares = [];
  for (let index = 0; index < size * size; index += 1) {
    if (index === center) squares.push(cleanSquare({ text: 'FREE', free: true }, index));
    else squares.push(cleanSquare(chosen.shift(), index));
  }
  return {
    id: `card-${String(sequence)}`, size, pattern: settings.pattern, squares, startedAt: now, status: 'playing', players: [], wins: [], recent: [],
    keepLines: settings.afterWin === 'keep-playing', bonus: settings.pattern === 'blackout' ? 0 : settings.blackoutBonus ?? 0, hype: false,
  };
}

export function lines(size) {
  const result = [];
  for (let row = 0; row < size; row += 1) result.push({ id: `r${String(row)}`, cells: Array.from({ length: size }, (_, column) => row * size + column) });
  for (let column = 0; column < size; column += 1) result.push({ id: `c${String(column)}`, cells: Array.from({ length: size }, (_, row) => row * size + column) });
  result.push({ id: 'd0', cells: Array.from({ length: size }, (_, index) => index * size + index) });
  result.push({ id: 'd1', cells: Array.from({ length: size }, (_, index) => index * size + (size - 1 - index)) });
  return result;
}

/** What the card has completed that has not been paid yet: { cells, lines } or undefined. */
export function newWin(card) {
  const regular = patternWin(card);
  if (regular) return regular;
  // The blackout bonus: once the card is full, one more fair draw pays the bonus.
  if (bonusPending(card) && card.squares.every((square) => square.marked)) return { cells: card.squares.map((_, index) => index), lines: ['blackout'], bonus: true };
  return undefined;
}
function bonusPending(card) { return (card.bonus ?? 0) > 0 && card.pattern !== 'blackout' && !card.wins.some((win) => win.bonus); }
function patternWin(card) {
  const marked = (cell) => card.squares[cell]?.marked === true;
  const size = card.size; const regularWins = card.wins.filter((win) => !win.bonus);
  const paid = new Set(regularWins.flatMap((win) => win.lines));
  const done = lines(size).filter((line) => line.cells.every(marked));
  if (card.pattern === 'line') {
    if (regularWins.length > 0 && card.keepLines === false) return undefined;
    const fresh = done.filter((line) => !paid.has(line.id));
    return fresh.length > 0 ? { cells: [...new Set(fresh.flatMap((line) => line.cells))], lines: fresh.map((line) => line.id) } : undefined;
  }
  if (regularWins.length > 0) return undefined;
  if (card.pattern === 'two-lines') return done.length >= 2 ? { cells: [...new Set(done.flatMap((line) => line.cells))], lines: done.map((line) => line.id) } : undefined;
  if (card.pattern === 'corners') { const cells = [0, size - 1, size * (size - 1), size * size - 1]; return cells.every(marked) ? { cells, lines: ['corners'] } : undefined; }
  if (card.pattern === 'x') { const both = done.filter((line) => line.id === 'd0' || line.id === 'd1'); return both.length === 2 ? { cells: [...new Set(both.flatMap((line) => line.cells))], lines: ['x'] } : undefined; }
  return card.squares.every((square) => square.marked) ? { cells: card.squares.map((_, index) => index), lines: ['blackout'] } : undefined;
}

/** The fewest unmarked squares any line still needs (used by hype mode's "only N away" nudge). */
export function squaresAway(card) {
  return Math.min(...lines(card.size).map((line) => line.cells.filter((cell) => card.squares[cell]?.marked !== true).length));
}

// ---------- Overlay ----------
export function cardView(settings, state) {
  const card = state.card;
  if (!settings.enabled || !card || card.status === 'ended') return { moduleId: MODULE_ID, cardKind: 'stream-bingo', visible: false };
  const win = card.wins.at(-1);
  return {
    moduleId: MODULE_ID, cardKind: 'stream-bingo', visible: true, title: settings.title, layout: settings.layout, position: settings.position,
    size: settings.size, grid: card.size, showNumbers: settings.showNumbers, showPlayers: settings.showPlayers, showRecent: settings.showRecent,
    markColor: settings.markColor, pattern: settings.patternNames[card.pattern], joinHint: fill(settings.hintText, { command: settings.command }), players: card.players.length,
    labels: { players: settings.playersLabel, bingo: settings.bingoWord, nobody: settings.nobodyText, bonus: settings.bonusWord },
    platforms: settings.platforms, status: card.status, hype: card.status === 'playing' && card.hype === true,
    squares: card.squares.map((square) => ({ n: square.n, text: square.free ? settings.freeText : square.text, marked: square.marked, free: square.free, progress: !square.marked && square.need > 1 ? `${String(Math.min(square.have, square.need))}/${String(square.need)}` : '', platform: square.platform })),
    winCells: card.wins.flatMap((item) => item.cells),
    win: win ? { bonus: win.bonus === true, pattern: settings.patternNames[win.bonus ? 'blackout' : card.pattern], name: win.noWinner ? '' : win.name, platform: win.platform, avatarUrl: win.avatarUrl, points: win.points, currency: win.currency, noWinner: win.noWinner, at: win.at, showMs: settings.winSeconds * 1_000 } : null,
    recent: settings.showRecent ? card.recent.slice(-3).reverse().map((item) => ({ n: item.n, text: item.text, platform: item.platform })) : [],
  };
}
async function publish(context, settings, state) {
  const view = cardView(settings, state);
  if (!view.visible) { await context.overlay.publish(`${MODULE_ID}.bingo.hide`, {}, { lane: 'persistent' }).catch(() => undefined); return; }
  await context.overlay.publish(`${MODULE_ID}.bingo.update`, { ...view, emittedAt: new Date().toISOString() }, { lane: 'persistent' }).catch(() => undefined);
}

// ---------- Game flow ----------
let stopped = true;
let operation = Promise.resolve();
let newCardTask;
let hypeTask;

async function load(context, settings) {
  const state = stateFor(await context.state.read(), Date.now(), settings.timeZone);
  if (rollSeason(state, settings.timeZone)) {
    await save(context, state);
    const month = state.hallOfFame.at(-1);
    if (month && settings.discordMonthly) await postDiscord(context, settings, fill(settings.discordRecapMessage, {
      month: month.month, cards: String(month.cards), wins: String(month.wins),
      top: month.leaders.length ? month.leaders.map((leader, index) => `${String(index + 1)}. ${leader.displayName} (${String(leader.wins)})`).join(', ') : '—',
    }));
  }
  return state;
}
async function save(context, state) { await context.state.write(JSON.parse(JSON.stringify(state))); }

/** Posts to the creator's chosen Discord webhook (a text channel). Never stops the game when Discord is down. */
async function postDiscord(context, settings, content) {
  if (!settings.discordWebhookId || !content || typeof context?.discord?.post !== 'function') return;
  try { await context.discord.post({ webhookId: settings.discordWebhookId, content: [...content].slice(0, 1_900).join(''), username: 'Stream Bingo' }); } catch { /* Discord is optional */ }
}

/** Runs the creator's own Streamer.bot action after a bingo (confetti, a sound, a scene), if they approved it. */
async function runWinAction(context, settings, values) {
  if (!settings.winActionId || !Array.isArray(context?.approvedActionIds) || !context.approvedActionIds.includes(settings.winActionId)) return;
  try { await context.streamerbot.runApprovedAction(settings.winActionId, values); } catch { /* the action is optional */ }
}

function cancelNewCard(context) { if (newCardTask !== undefined) context?.schedule?.cancel(newCardTask); newCardTask = undefined; }
function cancelHype(context) { if (hypeTask !== undefined) context?.schedule?.cancel(hypeTask); hypeTask = undefined; }

/** Hype mode: after a quiet stretch with no squares ticking, the card pulses on screen and chat gets one nudge. */
function scheduleHype(context, settings, state) {
  cancelHype(context);
  const card = state.card;
  if (stopped || settings.hypeMinutes < 1 || !card || card.status !== 'playing' || card.hype) return;
  const cardId = card.id;
  try {
    hypeTask = context.schedule.after(settings.hypeMinutes * 60_000, async () => {
      hypeTask = undefined; if (stopped) return;
      await serialize(async () => {
        const fresh = settingsFor(context); if (!fresh.enabled || fresh.hypeMinutes < 1) return;
        const latest = await load(context, fresh);
        const current = latest.card;
        if (current?.id !== cardId || current.status !== 'playing' || current.hype) return;
        current.hype = true;
        await save(context, latest); await publish(context, fresh, latest);
        const away = squaresAway(current);
        await sayOn(context, fresh.platforms, fill(fresh.hypeMessage, { left: String(away), players: String(current.players.length), command: fresh.command }));
      });
    });
  } catch { hypeTask = undefined; }
}

/** The squares a new card is drawn from: the chosen pack plus square ideas the streamer added from chat. */
function poolFor(settings, state) {
  if (!['mine', 'mixed'].includes(settings.pack) || state.approved.length === 0) return settings.pool;
  const ideas = state.approved.map((text) => ({ text, when: 'manual', need: 1, match: '' }));
  return toppedUp(withoutRepeats([...settings.packPool, ...ideas]), settings.gridSize);
}

async function startCard(context, settings, state, { announce = true } = {}) {
  cancelNewCard(context);
  state.cardSequence += 1; state.monthCards += 1;
  state.card = newCard({ ...settings, pool: poolFor(settings, state) }, state.cardSequence);
  await save(context, state); await publish(context, settings, state);
  scheduleHype(context, settings, state);
  if (announce && settings.announceNewCard) await sayOn(context, settings.platforms, fill(settings.newCardMessage, { command: settings.command }));
}

/** Pays out a completed line, pattern or blackout bonus: one fair winner from the players, points, chat, stats. */
async function payWin(context, settings, state, found) {
  const card = state.card;
  const earlier = new Set(card.wins.map((win) => win.key));
  const fresh = card.players.filter((player) => !earlier.has(player.key));
  const winner = fairPick(fresh.length > 0 ? fresh : card.players);
  const bonus = found.bonus === true;
  const now = Date.now();
  let points = 0; let currency = '';
  if (winner) {
    const amount = bonus ? card.bonus : settings.winnerPoints;
    const key = bonus ? `bingo-${card.id}-bonus-${String(card.startedAt)}` : `bingo-${card.id}-${String(card.wins.length + 1)}-${String(card.startedAt)}`;
    ({ amount: points, currency } = await awardPoints(context, winner.viewerId, amount, bonus ? 'Stream Bingo blackout bonus' : 'Stream Bingo win', key));
    const entry = leaderboardEntry(state, winner); entry.points += points;
    if (!bonus) { entry.wins += 1; addAllTime(state, winner); state.monthWins += 1; }
  }
  card.wins.push({ ...(winner ?? cleanPerson({ key: 'none' })), noWinner: !winner, bonus, points, currency: currency || 'points', at: now, cells: found.cells, lines: found.lines });
  const full = card.squares.every((square) => square.marked);
  const morePossible = !full && (bonusPending(card) || (card.pattern === 'line' && card.keepLines !== false));
  card.status = morePossible ? 'playing' : 'won';
  card.hype = false;
  await save(context, state); await publish(context, settings, state);
  const values = { pattern: settings.patternNames[card.pattern], players: String(card.players.length), command: settings.command, winner: winner?.name ?? '', platform: winner ? PLATFORM_LABELS[winner.platform] ?? '' : '', points: points > 0 ? ` +${String(points)} ${currency || 'points'}` : '' };
  // A full card nobody joined already had its "nobody joined" message at the first bingo.
  if (!winner && bonus) return;
  const message = fill(!winner ? settings.noWinnerMessage : bonus ? settings.bonusMessage : settings.winMessage, values);
  await sayOn(context, settings.platforms, message);
  if (settings.discordWins) await postDiscord(context, settings, message);
  if (winner) await runWinAction(context, settings, { bingoWinner: winner.name, bingoPlatform: PLATFORM_LABELS[winner.platform] ?? '', bingoPattern: values.pattern, bingoPoints: points, bingoBonus: bonus, bingoPlayers: card.players.length, bingoCard: card.id });
}

function scheduleNewCard(context, settings, state) {
  const card = state.card;
  if (!card || card.status !== 'won' || settings.afterWin !== 'new-card') return;
  cancelNewCard(context);
  const cardId = card.id;
  newCardTask = context.schedule.after(settings.newCardSeconds * 1_000, async () => {
    newCardTask = undefined; if (stopped) return;
    await serialize(async () => {
      const fresh = settingsFor(context); if (!fresh.enabled) return;
      const latest = await load(context, fresh);
      if (latest.card?.id === cardId && latest.card.status === 'won') await startCard(context, fresh, latest);
    });
  });
}

/** Ticks squares by `amount`; returns true when something changed. */
function tick(card, predicate, amount, who) {
  let changed = false;
  for (const square of card.squares) {
    if (square.marked || square.free || !predicate(square)) continue;
    square.have = Math.min(1_000_000_000, square.have + amount); changed = true;
    if (square.have >= square.need) {
      square.marked = true; square.markedAt = Date.now(); square.by = who.name; square.platform = who.platform;
      card.recent.push({ n: square.n, text: square.text, by: who.name, platform: who.platform, at: square.markedAt }); card.recent = card.recent.slice(-5);
    }
  }
  return changed;
}

async function afterTick(context, settings, state) {
  if (state.card) state.card.hype = false;
  // One tick can finish a line and the full card at once, so keep paying until nothing new is complete.
  let paid = false;
  for (let guard = 0; guard < 16 && state.card?.status === 'playing'; guard += 1) {
    const found = newWin(state.card);
    if (!found) break;
    await payWin(context, settings, state, found); paid = true;
  }
  if (!paid) { await save(context, state); await publish(context, settings, state); }
  scheduleNewCard(context, settings, state);
  scheduleHype(context, settings, state);
}

function amountOf(event, when) {
  if (!WHEN[when].quantity) return 1;
  const value = Number(event.payload?.quantity ?? event.payload?.bits ?? event.payload?.amount);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 1_000_000) : 1;
}

/** Ticks chat squares (different chatters saying a word) and command squares (!lurk, a death counter's !death). */
function tickChat(event, card, who) {
  let changed = false;
  const text = matchKey(event.payload?.message);
  const chatter = playerKey(event);
  if (!chatter) return false;
  const fromOwnAccount = event.payload?.fromConnectedAccount === true;
  const command = /^[!?]/u.test(text) ? commandKey(text) : '';
  if (command) {
    const argument = text.split(' ')[1] ?? '';
    // "!death -", "!death reset" and similar take a counter down, so they never tick a square.
    if (!argument.startsWith('-') && !['reset', 'remove', 'undo', 'set', 'clear'].includes(argument)) {
      const counts = moderator(event) || fromOwnAccount;
      for (const square of card.squares) {
        if (square.marked || square.when !== 'command' || square.match !== command) continue;
        if (!counts) { if (square.chatters.includes(chatter)) continue; square.chatters.push(chatter); square.chatters = square.chatters.slice(-200); }
        changed = tick(card, (candidate) => candidate === square, 1, who) || changed;
      }
    }
  }
  if (fromOwnAccount) return changed;
  const words = ` ${text.replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  for (const square of card.squares) {
    if (square.marked || square.when !== 'chat' || !square.match || square.chatters.includes(chatter)) continue;
    const word = square.match.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    // Chinese, Japanese and Korean chat has no spaces between words, so those words match anywhere.
    const spaceless = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(word);
    if (!word || !(spaceless ? words.includes(word) : words.includes(` ${word} `))) continue;
    square.chatters.push(chatter); square.chatters = square.chatters.slice(-200);
    changed = tick(card, (candidate) => candidate === square, 1, who) || changed;
  }
  return changed;
}

async function onStreamEvent(event, context, settings) {
  if (!settings.platforms.includes(event.platform) && event.eventType !== 'engagement.donation') return;
  const state = await load(context, settings);
  const card = state.card;
  if (!card || card.status !== 'playing') return;
  const eventId = clean(event.eventId, 256);
  if (eventId && state.seen.includes(eventId)) return;
  const who = { name: clean(event.user?.displayName || event.user?.name, 60) || 'Someone', platform: PLATFORMS.includes(event.platform) ? event.platform : '' };
  let changed = false;
  if (event.eventType === 'chat.message') {
    if (event.user?.actorType && event.user.actorType !== 'human') return;
    changed = tickChat(event, card, who);
  } else {
    for (const when of WHEN_IDS) {
      if (when === 'chat' || when === 'command' || !WHEN[when].eventTypes.includes(event.eventType)) continue;
      const title = matchKey(event.payload?.rewardTitle);
      changed = tick(card, (square) => square.when === when && (when !== 'reward' || square.match === title), amountOf(event, when), who) || changed;
    }
  }
  if (!changed) return;
  if (eventId) { state.seen.push(eventId); state.seen = state.seen.slice(-300); }
  await afterTick(context, settings, state);
}

function squareNumbers(args, card) {
  return [...new Set(args.flatMap((arg) => clean(String(arg), 20).split(/[,\s]+/u)).map((part) => Number(part)).filter((number) => Number.isInteger(number) && number >= 1 && number <= card.squares.length))].slice(0, 25);
}

/** Marks or unmarks squares by number (1 is top left, counting across each row). */
async function setMarked(context, settings, state, numbers, marked, who) {
  const card = state.card;
  if (!card || card.status === 'ended') return 'There is no bingo card right now.';
  let changed = 0;
  for (const number of numbers) {
    const square = card.squares[number - 1];
    if (!square || square.free || square.marked === marked) continue;
    square.marked = marked; square.have = marked ? square.need : 0; square.chatters = [];
    square.markedAt = marked ? Date.now() : 0; square.by = marked ? who.name : ''; square.platform = marked ? who.platform : '';
    if (marked) { card.recent.push({ n: square.n, text: square.text, by: who.name, platform: who.platform, at: Date.now() }); card.recent = card.recent.slice(-5); }
    changed += 1;
  }
  if (changed === 0) return marked ? 'Those squares are already marked.' : 'Those squares are not marked.';
  if (!marked && card.status === 'won' && settings.afterWin !== 'new-card') card.status = 'playing';
  await afterTick(context, settings, state);
  return `${marked ? 'Marked' : 'Unmarked'} ${String(changed)} square${changed === 1 ? '' : 's'}.`;
}

async function join(context, settings, state, event) {
  const card = state.card;
  if (!card || card.status !== 'playing') {
    if (Date.now() - state.noCardReplyAt > 30_000) { state.noCardReplyAt = Date.now(); await save(context, state); await sayOn(context, [event.platform], fill(settings.noCardMessage, { command: settings.command })); }
    return;
  }
  const viewerId = await viewerIdFor(context, event);
  const key = playerKey(event, viewerId);
  if (!key || card.players.some((player) => player.key === key)) return;
  if (card.players.length >= MAX_PLAYERS) return;
  const person = cleanPerson({ key, viewerId, name: event.user?.displayName || event.user?.name, platform: event.platform, avatarUrl: event.user?.avatarUrl, at: Date.now() });
  card.players.push(person);
  leaderboardEntry(state, person).cards += 1;
  if (settings.joinPoints > 0) await awardPoints(context, viewerId, settings.joinPoints, 'Stream Bingo join', `bingo-join-${card.id}-${String(card.startedAt)}-${key}`);
  await save(context, state); await publish(context, settings, state);
  if (settings.confirmJoins) await sayOn(context, [event.platform], fill(settings.joinMessage, { name: person.name, players: String(card.players.length), command: settings.command }));
}

/** "!bingo suggest Streamer rage quits": a square idea from chat. It waits for the streamer to add it in the Control Panel. */
async function suggest(context, settings, state, event, text, who) {
  if (!text) return;
  const viewerId = await viewerIdFor(context, event);
  const key = playerKey(event, viewerId);
  if (!key || state.suggestions.filter((item) => item.key === key).length >= 3) return;
  const lower = text.toLowerCase();
  if (state.suggestions.some((item) => item.text.toLowerCase() === lower) || state.approved.some((item) => item.toLowerCase() === lower)) return;
  const base = `idea-${Date.now().toString(36)}-${String(randomInt(1_000_000))}`;
  let id = base;
  for (let extra = 1; state.suggestions.some((item) => item.id === id); extra += 1) id = `${base}-${String(extra)}`;
  state.suggestions.push({ id, text, name: who.name, key, platform: who.platform, at: Date.now() });
  state.suggestions = state.suggestions.slice(-MAX_SUGGESTIONS);
  await save(context, state);
  await sayOn(context, [event.platform], fill(settings.suggestMessage, { name: who.name, command: settings.command }));
}

async function onCommand(event, context, settings) {
  if (clean(event.payload?.command, 40).toLowerCase() !== settings.command) return;
  if (!settings.platforms.includes(event.platform) && event.platform !== 'system') return;
  if (event.user?.actorType && event.user.actorType !== 'human') return;
  const args = Array.isArray(event.payload?.arguments) ? event.payload.arguments.map((arg) => clean(String(arg), 40)) : [];
  const sub = (args[0] ?? '').toLowerCase();
  const state = await load(context, settings);
  const who = { name: clean(event.user?.displayName || event.user?.name, 60) || 'A moderator', platform: PLATFORMS.includes(event.platform) ? event.platform : '' };
  if (['mark', 'unmark', 'new', 'end', 'show'].includes(sub)) {
    if (!moderator(event)) return;
    let reply = '';
    if (sub === 'new') { await startCard(context, settings, state); return; }
    if (sub === 'end') { if (state.card) { cancelNewCard(context); cancelHype(context); state.card.status = 'ended'; await save(context, state); await publish(context, settings, state); reply = 'Bingo card closed.'; } }
    else if (sub === 'show') { await publish(context, settings, state); }
    else reply = await setMarked(context, settings, state, squareNumbers(args.slice(1), state.card ?? { squares: [] }), sub === 'mark', who);
    if (reply) await sayOn(context, [event.platform], reply);
    return;
  }
  if (sub === 'suggest' || sub === 'idea') {
    if (!settings.suggestions) return;
    await suggest(context, settings, state, event, clean(args.slice(1).join(' '), 60), who);
    return;
  }
  if (sub === 'stats' || sub === 'me') {
    const viewerId = await viewerIdFor(context, event);
    const key = playerKey(event, viewerId);
    const month = state.leaderboard.find((entry) => entry.key === key)?.wins ?? 0;
    const total = state.allTime.find((row) => row[0] === key)?.[1] ?? 0;
    await sayOn(context, [event.platform], fill(settings.statsMessage, { name: who.name, month: String(month), total: String(total) }));
    return;
  }
  if (sub === 'top') {
    const top = [...state.leaderboard].filter((entry) => entry.wins > 0).sort((a, b) => b.wins - a.wins || b.points - a.points).slice(0, 3);
    await sayOn(context, [event.platform], top.length ? fill(settings.topMessage, { top: top.map((entry, index) => `${String(index + 1)}. ${entry.displayName} (${String(entry.wins)})`).join(', ') }) : settings.noWinsMessage);
    return;
  }
  await join(context, settings, state, event);
}

async function process(event, context) {
  const settings = settingsFor(context);
  if (!settings.enabled) return;
  if (event.eventType === 'command.received') { await onCommand(event, context, settings); return; }
  if (event.metadata?.simulated === true) return;
  if (EVENT_TYPES.includes(event.eventType)) await onStreamEvent(event, context, settings);
}

function serialize(task) { const next = operation.then(task, task); operation = next.catch(() => undefined); return next; }

// ---------- Control Panel ----------
function whenLabel(square) {
  if (square.free) return 'Free square';
  const base = WHEN[square.when]?.label ?? 'A moderator marks it';
  const target = square.when === 'reward' ? `: ${square.match}` : square.when === 'chat' ? `: "${square.match}"` : '';
  const progress = !square.marked && square.need > 1 ? ` · ${String(Math.min(square.have, square.need))} of ${String(square.need)}` : '';
  return `${base}${target}${progress}${square.marked && square.by ? ` · by ${square.by}` : ''}`;
}

async function bingoPanel(request, context) {
  const settings = settingsFor(context);
  let message = '';
  if (request?.operation === 'settings-changed') { const state = await load(context, settings); await publish(context, settings, state); if (settings.enabled) scheduleHype(context, settings, state); return {}; }
  if (request?.operation === 'action') {
    if (!settings.enabled) throw new Error('Stream Bingo is switched off in its settings.');
    const action = clean(request.action, 40);
    const state = await load(context, settings);
    const host = { name: 'The streamer', platform: '' };
    if (action === 'new') { await startCard(context, settings, state); message = 'New card on screen.'; }
    else if (action === 'new-quiet') { await startCard(context, settings, state, { announce: false }); message = 'New card on screen. Chat was not told.'; }
    else if (action === 'end') { if (state.card) { cancelNewCard(context); cancelHype(context); state.card.status = 'ended'; await save(context, state); await publish(context, settings, state); } message = 'Card closed.'; }
    else if (action === 'mark' || action === 'unmark') message = await setMarked(context, settings, state, squareNumbers([String(request.values?.square ?? '')], state.card ?? { squares: [] }), action === 'mark', host);
    else if (action === 'add-idea' || action === 'dismiss-idea') {
      const id = clean(String(request.values?.id ?? ''), 40);
      const idea = state.suggestions.find((item) => item.id === id);
      if (!idea) throw new Error('That square idea is gone. Refresh and try again.');
      state.suggestions = state.suggestions.filter((item) => item.id !== id);
      if (action === 'add-idea' && !state.approved.some((text) => text.toLowerCase() === idea.text.toLowerCase())) state.approved = [...state.approved, idea.text].slice(-MAX_APPROVED);
      await save(context, state);
      message = action === 'add-idea' ? `Added "${idea.text}". It can show up from the next card.` : 'Idea dismissed.';
    } else if (action === 'remove-idea') {
      const text = clean(String(request.values?.text ?? ''), 60).toLowerCase();
      state.approved = state.approved.filter((item) => item.toLowerCase() !== text);
      await save(context, state); message = 'Square removed from the pool.';
    } else throw new Error('Unknown Stream Bingo control.');
  }
  const state = await load(context, settings);
  const card = state.card;
  const marked = card ? card.squares.filter((square) => square.marked).length : 0;
  const leaders = [...state.leaderboard].filter((entry) => entry.wins > 0).sort((a, b) => b.wins - a.wins || b.points - a.points).slice(0, 10);
  return {
    ...(message ? { message } : {}),
    ...(settings.enabled ? {} : { notice: 'Stream Bingo is switched off in its settings.' }),
    summary: [
      { label: 'Card', value: !card || card.status === 'ended' ? 'None' : card.status === 'won' ? 'BINGO!' : `${String(marked)} of ${String(card.squares.length)} marked` },
      { label: 'Players', value: String(card && card.status !== 'ended' ? card.players.length : 0) },
      { label: `Wins in ${state.month}`, value: String(state.monthWins) },
      { label: 'Last winner', value: card?.wins.at(-1)?.noWinner === false ? card.wins.at(-1).name : '—' },
      ...(card && card.status === 'playing' && bonusPending(card) && card.wins.length > 0 ? [{ label: 'Blackout bonus', value: `${String(card.squares.filter((square) => !square.marked).length)} squares to go` }] : []),
    ],
    actions: [
      { action: 'new', label: 'New card', style: 'primary' },
      { action: 'new-quiet', label: 'New card (no chat)' },
      { action: 'mark', label: 'Mark square', inputs: [{ name: 'square', label: 'Square number', type: 'number', minimum: 1, maximum: 25 }] },
      { action: 'end', label: 'Close the card', style: 'danger', confirm: 'Take the bingo card off screen?' },
    ],
    lists: [
      {
        title: 'Squares', empty: 'Press New card to start.',
        items: card && card.status !== 'ended' ? card.squares.map((square) => ({
          title: `${String(square.n)}. ${square.text}`, badge: square.marked ? '✓' : '', detail: whenLabel(square),
          ...(square.free ? {} : { actions: [square.marked ? { action: 'unmark', label: 'Unmark', values: { square: square.n } } : { action: 'mark', label: 'Mark', style: 'primary', values: { square: square.n } }] }),
        })) : [],
      },
      { title: `Winners in ${state.month}`, empty: 'No wins yet this month.', items: leaders.map((entry, index) => ({ title: `${String(index + 1)}. ${entry.displayName}`, detail: `${String(entry.wins)} win${entry.wins === 1 ? '' : 's'} · ${String(entry.cards)} cards played${entry.platform ? ` · ${PLATFORM_LABELS[entry.platform]}` : ''}` })) },
      ...(settings.suggestions || state.suggestions.length > 0 ? [{
        title: 'Square ideas from chat', empty: `Viewers send ideas with !${settings.command} suggest.`,
        items: [...state.suggestions].reverse().map((idea) => ({
          title: idea.text, detail: `From ${idea.name}${idea.platform ? ` · ${PLATFORM_LABELS[idea.platform]}` : ''}`,
          actions: [{ action: 'add-idea', label: 'Add', style: 'primary', values: { id: idea.id } }, { action: 'dismiss-idea', label: 'Dismiss', values: { id: idea.id } }],
        })),
      }] : []),
      ...(state.approved.length > 0 ? [{
        title: 'Chat squares in the pool', empty: '',
        items: state.approved.map((text) => ({ title: text, detail: ['mine', 'mixed'].includes(settings.pack) ? 'Marked by a moderator' : 'Used with the "My squares" or "All mixed" pack', actions: [{ action: 'remove-idea', label: 'Remove', values: { text } }] })),
      }] : []),
      { title: 'Hall of fame', empty: 'Past months show here after the 1st.', items: [...state.hallOfFame].reverse().map((entry) => ({ title: entry.month, detail: entry.leaders.length ? entry.leaders.map((leader, index) => `${String(index + 1)}. ${leader.displayName} (${String(leader.wins)})`).join(' · ') : `${String(entry.cards)} cards, no winners` })) },
    ],
  };
}

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Stream Bingo', version: '4.1.92',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.1.92', maximumTestedBridgeVersion: '4.1.92',
  dependencies: ['thsv.viewer-foundation'], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: [...EVENT_TYPES, 'command.received'],
  commandsProvided: [{ id: 'stream-bingo.play', name: 'bingo' }], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: [`data/addons/${MODULE_ID}/`, `data/addons/.state/${MODULE_ID}/`],
  installationSteps: [
    'Pick a square pack or write your own squares, and choose what ticks each square.',
    'Add the overlay as a browser source in the scenes where the card should show.',
    'Enable the extension, restart StreamBridge, and press New card in the Control Panel.',
  ],
  uninstallationSteps: ['Disable the extension and remove its browser source. Monthly and all-time wins are kept until you delete its data.'], migrations: [],
  healthChecks: [{ id: `${MODULE_ID}.runtime`, description: 'Confirms squares tick from stream events and moderators, viewers can join, wins are drawn fairly and paid once, and monthly stats reset on the 1st.' }],
};

export { manifest };

export default {
  manifest, required: false,
  async start(context) {
    stopped = false; operation = Promise.resolve(); newCardTask = undefined; hypeTask = undefined;
    const settings = settingsFor(context);
    const state = await load(context, settings);
    // A card that was waiting for its next card when StreamBridge stopped gets a fresh one now.
    if (settings.enabled && state.card?.status === 'won' && settings.afterWin === 'new-card') state.card.status = 'ended';
    await save(context, state);
    await publish(context, settings, state);
    if (settings.enabled) scheduleHype(context, settings, state);
  },
  async stop(context) { stopped = true; cancelNewCard(context); cancelHype(context); await operation.catch(() => undefined); },
  async onEvent(event, context) { if (!stopped) await serialize(() => process(event, context)); },
  async controlPanel(request, context) { return serialize(() => bingoPanel(request, context)); },
};
