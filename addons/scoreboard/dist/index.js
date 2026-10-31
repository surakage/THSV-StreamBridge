// Scoreboard: this stream's follows, subs, Bits, gifts, tips, raids and chat, split by platform, next to the
// best stream on record. A new record lights up its row. Counts survive restarts and reset when a new stream
// starts. No Streamer.bot import is needed.
const MODULE_ID = 'thsv.scoreboard';
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok', 'facebook', 'tips']);
export const STATS = Object.freeze({
  follows: { label: 'Follows', eventTypes: ['channel.follow'] },
  subs: { label: 'Subs & members', eventTypes: ['channel.subscription', 'channel.membership'] },
  giftedSubs: { label: 'Gifted subs', eventTypes: ['channel.gift-subscription'], quantity: true },
  bits: { label: 'Bits', eventTypes: ['engagement.cheer'], quantity: true },
  gifts: { label: 'Gifts', eventTypes: ['engagement.gift'], quantity: true },
  tips: { label: 'Tips & Super Chats', eventTypes: ['engagement.donation', 'engagement.super-chat'], money: true },
  raids: { label: 'Raids', eventTypes: ['channel.raid'] },
  chatters: { label: 'Chatters', eventTypes: ['chat.message'], unique: true },
  messages: { label: 'Chat messages', eventTypes: ['chat.message'] },
});
const STAT_IDS = Object.freeze(Object.keys(STATS));
const EVENT_TYPES = Object.freeze([...new Set(Object.values(STATS).flatMap((stat) => stat.eventTypes))]);
const POSITIONS = Object.freeze(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
// After every platform has gone offline, a stream start within this window is treated as the same stream (a reconnect).
const RECONNECT_WINDOW_MS = 30 * 60_000;

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Scoreboard', version: '4.1.3',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.1.3', maximumTestedBridgeVersion: '4.1.3',
  dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: [...EVENT_TYPES, 'stream.online', 'stream.offline', 'command.received'],
  commandsProvided: [], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: [`data/addons/${MODULE_ID}/`, `data/addons/.state/${MODULE_ID}/`],
  installationSteps: [
    'Tick the rows to show on the scoreboard.',
    'Add the overlay as a browser source (1920x1080) in the scenes where the scoreboard should show.',
    'Enable the extension and restart StreamBridge.',
  ],
  uninstallationSteps: ['Disable the extension and remove its browser source.'], migrations: [],
  healthChecks: [{ id: `${MODULE_ID}.runtime`, description: 'Confirms per-stream counting, records, stream resets and the scoreboard overlay.' }],
};

let stopped = true;
let operation = Promise.resolve();

function clean(value, maximum = 160) { return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '')].slice(0, maximum).join(''); }
function integer(value, minimum, maximum, fallback) { const number = Number(value); return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback; }
function command(value) { return clean(value, 40).replace(/^!+/u, '').toLowerCase(); }
function positiveQuantity(value) { const number = Number(value); return Number.isInteger(number) && number > 0 ? Math.min(number, 1_000_000) : 1; }
function wholeAmount(value) { const number = Number(value); return Number.isFinite(number) && number > 0 ? Math.min(Math.floor(number), 1_000_000) : 0; }

export function settingsFor(context) {
  const raw = context?.settings ?? {};
  const rows = (Array.isArray(raw.rows) ? raw.rows : ['follows', 'subs', 'giftedSubs', 'bits', 'tips', 'raids', 'chatters']).filter((id, index, all) => STAT_IDS.includes(id) && all.indexOf(id) === index);
  return {
    enabled: raw.enabled === true, rows,
    title: clean(raw.title, 60) || "Today's stream",
    showRecords: raw.showRecords !== false, showPlatforms: raw.showPlatforms !== false, hideZeroRows: raw.hideZeroRows === true,
    currency: clean(raw.tipsCurrency, 3).toUpperCase(),
    position: POSITIONS.includes(raw.position) ? raw.position : 'top-right',
    resetCommand: command(raw.resetCommand ?? 'scorereset'),
  };
}

/** Which stat an event adds to and by how much: [[statId, platform, amount], ...]. */
export function contributions(event, settings) {
  const result = [];
  if (event?.user?.actorType === 'bot') return result;
  const platform = event?.eventType === 'engagement.donation' && !['twitch', 'youtube', 'kick', 'tiktok', 'facebook'].includes(event.platform) ? 'tips' : event?.platform;
  if (!PLATFORMS.includes(platform)) return result;
  for (const id of STAT_IDS) {
    const stat = STATS[id];
    if (!stat.eventTypes.includes(event.eventType) || stat.unique) continue;
    if (stat.money) {
      const currency = clean(event.payload?.currency, 3).toUpperCase();
      if (settings.currency && currency && currency !== settings.currency) continue;
      const amount = wholeAmount(event.payload?.amount);
      if (amount > 0) result.push([id, platform, amount]);
      continue;
    }
    result.push([id, platform, stat.quantity ? positiveQuantity(event.payload?.quantity) : 1]);
  }
  return result;
}

function emptyCounts() { return Object.fromEntries(STAT_IDS.map((id) => [id, {}])); }
function emptyState() { return { counts: emptyCounts(), records: {}, startRecords: {}, newRecords: [], chatters: [], seen: [], live: [], offlineAt: 0, startedAt: 0 }; }
function sanitize(raw) {
  const state = emptyState();
  for (const id of STAT_IDS) {
    const source = raw?.counts?.[id];
    if (source && typeof source === 'object') for (const platform of PLATFORMS) { const value = integer(source[platform], 0, 1_000_000_000_000, 0); if (value > 0) state.counts[id][platform] = value; }
    const record = integer(raw?.records?.[id], 0, 1_000_000_000_000, 0); if (record > 0) state.records[id] = record;
    const before = integer(raw?.startRecords?.[id], 0, 1_000_000_000_000, 0); if (before > 0) state.startRecords[id] = before;
  }
  state.newRecords = Array.isArray(raw?.newRecords) ? raw.newRecords.filter((id) => STAT_IDS.includes(id)) : [];
  state.chatters = Array.isArray(raw?.chatters) ? raw.chatters.filter((key) => typeof key === 'string').slice(-20_000) : [];
  state.seen = Array.isArray(raw?.seen) ? raw.seen.filter((id) => typeof id === 'string').slice(-300) : [];
  state.live = Array.isArray(raw?.live) ? raw.live.filter((platform) => PLATFORMS.includes(platform)) : [];
  state.offlineAt = integer(raw?.offlineAt, 0, Number.MAX_SAFE_INTEGER, 0);
  state.startedAt = integer(raw?.startedAt, 0, Number.MAX_SAFE_INTEGER, 0);
  return state;
}
const total = (counts) => Object.values(counts ?? {}).reduce((sum, value) => sum + value, 0);

/** The overlay payload: one row per ticked stat with today's total, the platform split and the record. */
export function scoreboardView(settings, state) {
  const rows = settings.rows.map((id) => {
    const today = total(state.counts[id]);
    return {
      id, label: STATS[id].label, today,
      platforms: settings.showPlatforms ? PLATFORMS.filter((platform) => (state.counts[id][platform] ?? 0) > 0).map((platform) => ({ platform, value: state.counts[id][platform] })) : [],
      record: settings.showRecords ? Math.max(state.records[id] ?? 0, today) : undefined,
      newRecord: settings.showRecords && state.newRecords.includes(id),
    };
  }).filter((row) => !settings.hideZeroRows || row.today > 0);
  return { title: settings.title, position: settings.position, money: settings.currency, rows };
}

async function publish(context, settings, state) {
  const view = scoreboardView(settings, state);
  await context.overlay.publish(`${MODULE_ID}.scoreboard.${view.rows.length === 0 ? 'hide' : 'update'}`, view.rows.length === 0 ? {} : view, { lane: 'persistent' }).catch(() => undefined);
}

function resetCounts(state, now) { state.counts = emptyCounts(); state.startRecords = { ...state.records }; state.newRecords = []; state.chatters = []; state.startedAt = now; }

async function process(event, context) {
  const settings = settingsFor(context);
  if (!settings.enabled) return;
  const now = Date.now();
  if (event.eventType === 'command.received') {
    if (!settings.resetCommand || command(event.payload?.command) !== settings.resetCommand) return;
    const roles = Array.isArray(event.user?.roles) ? event.user.roles.map((role) => String(role).toLowerCase()) : [];
    if (!roles.includes('moderator') && !roles.includes('broadcaster')) return;
    const state = sanitize(await context.state.read());
    resetCounts(state, now);
    await context.state.write(state);
    await publish(context, settings, state);
    await context.chat?.send({ message: 'Scoreboard reset for this stream.', routing: 'source', sourcePlatform: event.platform, overflow: 'truncate' }).catch(() => undefined);
    return;
  }
  if (event.metadata?.simulated === true) return;
  const state = sanitize(await context.state.read());
  if (event.eventType === 'stream.online') {
    // The first platform to go live starts a new stream, unless every platform only dropped for a moment.
    const reconnect = state.offlineAt > 0 && now - state.offlineAt < RECONNECT_WINDOW_MS;
    if (state.live.length === 0 && !reconnect) resetCounts(state, now);
    if (!state.live.includes(event.platform) && PLATFORMS.includes(event.platform)) state.live.push(event.platform);
    state.offlineAt = 0;
    await context.state.write(state);
    await publish(context, settings, state);
    return;
  }
  if (event.eventType === 'stream.offline') {
    state.live = state.live.filter((platform) => platform !== event.platform);
    if (state.live.length === 0) state.offlineAt = now;
    await context.state.write(state);
    return;
  }
  const id = clean(event.eventId, 200);
  if (id && state.seen.includes(id)) return;
  let changes = contributions(event, settings);
  if (event.eventType === 'chat.message' && event.user?.actorType !== 'bot' && PLATFORMS.includes(event.platform)) {
    const key = `${event.platform}:${clean(event.user?.id, 128) || clean(event.user?.name, 128).toLowerCase()}`;
    if (!key.endsWith(':') && !state.chatters.includes(key)) { state.chatters.push(key); changes = [...changes, ['chatters', event.platform, 1]]; }
  }
  if (changes.length === 0) return;
  for (const [stat, platform, amount] of changes) {
    state.counts[stat][platform] = (state.counts[stat][platform] ?? 0) + amount;
    const today = total(state.counts[stat]);
    if (today > (state.records[stat] ?? 0)) state.records[stat] = today;
    // A new record means beating the best stream before this one; the very first stream only sets the bar.
    const before = state.startRecords[stat] ?? 0;
    if (before > 0 && today > before && !state.newRecords.includes(stat)) state.newRecords.push(stat);
  }
  if (id) state.seen = [...state.seen, id].slice(-300);
  await context.state.write(state);
  await publish(context, settings, state);
}

function serialize(task) { operation = operation.then(task, task); return operation; }

export default {
  manifest, required: false,
  async start(context) {
    stopped = false; operation = Promise.resolve();
    const settings = settingsFor(context);
    if (settings.enabled) await publish(context, settings, sanitize(await context.state.read()));
  },
  async stop() { stopped = true; await operation; },
  async onEvent(event, context) { if (!stopped) await serialize(() => process(event, context)); },
};
