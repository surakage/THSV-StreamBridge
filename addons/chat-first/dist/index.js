// Chat First: the first real person to chat on each platform each stream gets a spot on a small
// on-stream card, with their picture, name and how many times they have been first. Free and
// automatic: no rewards or points. Everyone can be first again when a stream starts, or after chat
// has been quiet for a while. No Streamer.bot import is needed.
const MODULE_ID = 'thsv.chat-first';
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok', 'facebook']);
const PLATFORM_LABELS = Object.freeze({ twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick', tiktok: 'TikTok', facebook: 'Facebook' });
const POSITIONS = Object.freeze(['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right']);
const COUNT_LIMIT = 5_000;
// The quiet-time clock is saved at most once a minute while nothing else changes.
const LAST_CHAT_SAVE_MS = 60_000;
// Going live on a second platform (or coming back after a drop) within this window is the same stream.
const SAME_STREAM_MS = 30 * 60_000;
const FALLBACKS = Object.freeze({
  enabled: false, platforms: [...PLATFORMS], title: 'First in chat', layout: 'row', position: 'top-left',
  displayMode: 'stream', showSeconds: 15, showCount: true,
  chatMessage: true, message: '🥇 {name} is first in chat on {platform}! First {times} so far.',
  skipModerators: false, skipNames: '', resetHours: 8,
});

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Chat First', version: '4.1.27',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.1.27', maximumTestedBridgeVersion: '4.1.27',
  dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: ['chat.message', 'stream.online'],
  commandsProvided: [], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: [`data/addons/${MODULE_ID}/`, `data/addons/.state/${MODULE_ID}/`],
  installationSteps: [
    'Tick the platforms where the first chatter gets a spot.',
    'Pick the card layout and whether it stays on screen all stream or shows for a few seconds.',
    'Add the overlay as a browser source (1920x1080) in the scenes where the card should show.',
    'Enable the extension and restart StreamBridge.',
  ],
  uninstallationSteps: ['Disable the extension and remove its browser source.'], migrations: [],
  healthChecks: [{ id: `${MODULE_ID}.runtime`, description: 'Confirms first-chat detection per platform, the stream reset, the times-first count and the card overlay.' }],
};

let stopped = true;
let operation = Promise.resolve();
let savedLastChatAt = 0;

function clean(value, maximum = 160) { return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '')].slice(0, maximum).join(''); }
function integer(value, minimum, maximum, fallback) { const number = Number(value); return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback; }
function choice(value, choices, fallback) { return choices.includes(value) ? value : fallback; }
function https(value) { return typeof value === 'string' && value.startsWith('https://') && value.length <= 2_000 ? value : ''; }
function names(value) { return (typeof value === 'string' ? value.split(/[,\n]/u) : Array.isArray(value) ? value : []).map((name) => clean(String(name), 64).replace(/^@/u, '').toLowerCase()).filter(Boolean).slice(0, 100); }

export function settingsFor(context) {
  const raw = { ...FALLBACKS, ...(context?.settings ?? {}) };
  const platforms = (Array.isArray(raw.platforms) ? raw.platforms : PLATFORMS).filter((platform, index, all) => PLATFORMS.includes(platform) && all.indexOf(platform) === index);
  return {
    enabled: raw.enabled === true, platforms, title: clean(raw.title, 40),
    layout: choice(raw.layout, ['podium', 'row', 'column'], 'row'), position: choice(raw.position, POSITIONS, 'top-left'),
    displayMode: choice(raw.displayMode, ['stream', 'timed'], 'stream'), showSeconds: integer(raw.showSeconds, 3, 120, 15),
    showCount: raw.showCount !== false, chatMessage: raw.chatMessage !== false, message: clean(raw.message, 300) || FALLBACKS.message,
    skipModerators: raw.skipModerators === true, skipNames: names(raw.skipNames), resetHours: integer(raw.resetHours, 1, 48, 8),
  };
}

function emptyState() { return { firsts: {}, counts: [], lastChatAt: 0, shownAt: 0, resetAt: 0 }; }
export function stateFor(raw) {
  const state = emptyState();
  const firsts = raw?.firsts && typeof raw.firsts === 'object' ? raw.firsts : {};
  for (const platform of PLATFORMS) {
    const entry = firsts[platform];
    if (!entry || typeof entry !== 'object' || !clean(entry.key, 200) || !clean(entry.name, 60)) continue;
    state.firsts[platform] = { key: clean(entry.key, 200), name: clean(entry.name, 60), avatarUrl: https(entry.avatarUrl), at: integer(entry.at, 0, Number.MAX_SAFE_INTEGER, 0), count: integer(entry.count, 1, 1_000_000, 1) };
  }
  // [viewer key, times first], oldest first, so the list can drop the longest-unseen viewers when full.
  if (Array.isArray(raw?.counts)) {
    state.counts = raw.counts.filter((pair) => Array.isArray(pair) && typeof pair[0] === 'string' && pair[0] && Number.isInteger(pair[1]) && pair[1] > 0)
      .map((pair) => [clean(pair[0], 200), Math.min(1_000_000, pair[1])]).slice(-COUNT_LIMIT);
  }
  state.lastChatAt = integer(raw?.lastChatAt, 0, Number.MAX_SAFE_INTEGER, 0);
  state.shownAt = integer(raw?.shownAt, 0, Number.MAX_SAFE_INTEGER, 0);
  state.resetAt = integer(raw?.resetAt, 0, Number.MAX_SAFE_INTEGER, 0);
  return state;
}

/** One key per viewer per platform: the platform user ID when there is one, otherwise the login name. */
export function viewerKey(event) {
  const id = clean(event?.user?.id, 128);
  const name = clean(event?.user?.name, 128).toLowerCase();
  return id || name ? `${event.platform}:${id ? `id:${id}` : `name:${name}`}` : '';
}

/** Who cannot be first: bots, the streamer, skipped names and (optionally) moderators. */
export function skipped(event, settings) {
  if (event?.user?.actorType && event.user.actorType !== 'human') return true;
  const roles = Array.isArray(event?.user?.roles) ? event.user.roles.map((role) => String(role).toLowerCase()) : [];
  if (roles.includes('broadcaster')) return true;
  if (settings.skipModerators && (roles.includes('moderator') || roles.includes('mod'))) return true;
  const handles = [event?.user?.name, event?.user?.displayName].map((name) => clean(name, 64).toLowerCase()).filter(Boolean);
  return handles.some((name) => settings.skipNames.includes(name));
}

/** Adds one to a viewer's all-time count and moves them to the newest end of the list. */
export function bump(state, viewer) {
  const index = state.counts.findIndex((pair) => pair[0] === viewer);
  const count = (index >= 0 ? state.counts[index][1] : 0) + 1;
  if (index >= 0) state.counts.splice(index, 1);
  state.counts.push([viewer, count]);
  if (state.counts.length > COUNT_LIMIT) state.counts = state.counts.slice(-COUNT_LIMIT);
  return count;
}

function times(count) { return `${String(count)} ${count === 1 ? 'time' : 'times'}`; }

/** What the overlay draws: this stream's firsts in the order the platforms are ticked. */
export function cardView(settings, state, latest = '') {
  const entries = settings.platforms.filter((platform) => state.firsts[platform]).map((platform) => {
    const entry = state.firsts[platform];
    return { platform, platformLabel: PLATFORM_LABELS[platform], name: entry.name, avatarUrl: entry.avatarUrl, count: entry.count, at: entry.at };
  });
  return {
    moduleId: MODULE_ID, cardKind: 'chat-first', visible: settings.enabled && entries.length > 0,
    title: settings.title, layout: settings.layout, position: settings.position, showCount: settings.showCount,
    displayMode: settings.displayMode, shownAt: state.shownAt, hideAfterMs: settings.displayMode === 'timed' ? settings.showSeconds * 1_000 : 0,
    latest: PLATFORMS.includes(latest) ? latest : '', entries,
  };
}

async function publish(context, settings, state, latest = '') {
  const view = cardView(settings, state, latest);
  const expired = view.displayMode === 'timed' && Date.now() >= view.shownAt + view.hideAfterMs;
  // The hide topic also clears the retained copy, so a reloaded OBS source does not bring back an old card.
  if (!view.visible || expired) { await context.overlay.publish(`${MODULE_ID}.firsts.hide`, {}, { lane: 'persistent' }).catch(() => undefined); return; }
  await context.overlay.publish(`${MODULE_ID}.firsts.update`, { ...view, emittedAt: new Date().toISOString() }, { lane: 'persistent' }).catch(() => undefined);
}

async function save(context, state) { await context.state.write(JSON.parse(JSON.stringify(state))); savedLastChatAt = state.lastChatAt; }

async function newStream(context, settings, { force = false } = {}) {
  const state = stateFor(await context.state.read());
  const now = Date.now();
  if (!force && state.resetAt > 0 && now - state.resetAt < SAME_STREAM_MS) return;
  state.firsts = {}; state.shownAt = 0; state.resetAt = now;
  await save(context, state);
  await publish(context, settings, state);
}

async function process(event, context) {
  const settings = settingsFor(context);
  if (!settings.enabled || event?.metadata?.simulated === true) return;
  if (event.eventType === 'stream.online') { await newStream(context, settings); return; }
  if (event.eventType !== 'chat.message' || !settings.platforms.includes(event.platform) || skipped(event, settings)) return;
  const viewer = viewerKey(event);
  if (!viewer) return;
  const state = stateFor(await context.state.read());
  const now = Date.now();
  // A long quiet gap counts as a new stream, for creators whose stream-start event does not reach the Bridge.
  if (state.lastChatAt > 0 && now - state.lastChatAt > settings.resetHours * 3_600_000) { state.firsts = {}; state.resetAt = now; }
  state.lastChatAt = now;
  if (state.firsts[event.platform]) {
    if (now - savedLastChatAt >= LAST_CHAT_SAVE_MS) await save(context, state);
    return;
  }
  const name = clean(event.user?.displayName || event.user?.name, 60) || 'Someone';
  const count = bump(state, viewer);
  state.firsts[event.platform] = { key: viewer, name, avatarUrl: https(event.user?.avatarUrl), at: now, count };
  state.shownAt = now;
  await save(context, state);
  await publish(context, settings, state, event.platform);
  if (settings.chatMessage) {
    const values = { name, platform: PLATFORM_LABELS[event.platform], count: String(count), times: times(count) };
    const message = clean(settings.message.replace(/\{(name|platform|count|times)\}/gu, (_, key) => values[key]), 450);
    await context.chat.send({ message, routing: 'source', sourcePlatform: event.platform, overflow: 'truncate' }).catch(() => undefined);
  }
}

function serialize(task) { operation = operation.then(task, task); return operation; }

// Control Panel tab: this stream's firsts, with a reset for a new stream.
async function firstsPanel(request, context) {
  const settings = settingsFor(context);
  let message = '';
  if (request?.operation === 'settings-changed') { await publish(context, settings, stateFor(await context.state.read())); return {}; }
  if (request?.operation === 'action') {
    const action = clean(request.action, 40);
    if (action === 'reset') { await newStream(context, settings, { force: true }); message = 'Everyone can be first again.'; }
    else if (action === 'show') {
      const state = stateFor(await context.state.read()); state.shownAt = Date.now(); await save(context, state); await publish(context, settings, state);
      message = 'Card shown.';
    } else throw new Error('Unknown Chat First control.');
  }
  const state = stateFor(await context.state.read());
  return {
    ...(message ? { message } : {}),
    ...(settings.enabled ? {} : { notice: 'Chat First is switched off in its settings.' }),
    summary: settings.platforms.map((platform) => ({ label: PLATFORM_LABELS[platform], value: state.firsts[platform] ? `${state.firsts[platform].name} (${times(state.firsts[platform].count)})` : 'Nobody yet' })),
    actions: [{ action: 'reset', label: 'New stream: reset firsts', style: 'danger', confirm: 'Let everyone be first again?' }, { action: 'show', label: 'Show the card again' }],
  };
}

export { manifest };

export default {
  manifest, required: false,
  async start(context) {
    stopped = false; operation = Promise.resolve();
    const settings = settingsFor(context);
    const state = stateFor(await context.state.read());
    savedLastChatAt = state.lastChatAt;
    // After a long break the old card belongs to an earlier stream.
    if (state.lastChatAt > 0 && Date.now() - state.lastChatAt > settings.resetHours * 3_600_000 && Object.keys(state.firsts).length > 0) { state.firsts = {}; await save(context, state); }
    await publish(context, settings, state);
  },
  async stop() { stopped = true; await operation; },
  async onEvent(event, context) { if (!stopped) await serialize(() => process(event, context)); },
  async controlPanel(request, context) { const task = () => firstsPanel(request, context); const pending = operation.then(task, task); operation = pending.catch(() => undefined); return pending; },
};
