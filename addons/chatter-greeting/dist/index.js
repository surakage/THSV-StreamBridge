// Chatter Greeting: the first time a viewer chats in a stream, a bubble with their picture, name and platform
// pops up on stream ("Welcome in, Sloth!"). Viewers seen in an earlier stream get the welcome-back line.
// Works on every platform the chat intakes cover. No Streamer.bot import is needed.
// Viewers can type the opt-out command (default !nogreet) to stop or restart their own greetings.
const MODULE_ID = 'thsv.chatter-greeting';
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok', 'facebook']);
const POSITIONS = Object.freeze(['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right']);
const KNOWN_LIMIT = 5_000;
const GREETED_LIMIT = 2_000;
const OPT_OUT_LIMIT = 5_000;
const OLD_NEW_DEFAULT = 'Welcome in, {name}! Glad you found us.';
const OLD_RETURNING_DEFAULT = 'Welcome back, {name}!';
export const DEFAULT_NEW_MESSAGES = Object.freeze([
  'Welcome in, {name}! First time in chat, so make yourself at home.',
  'Hey {name}, so glad you found us! Pull up a seat and hang out.',
  '{name} just said hi for the first time. Welcome to the crew!',
]);
export const DEFAULT_RETURNING_MESSAGES = Object.freeze([
  'Welcome back, {name}! Last time we saw you was {since}.',
  '{name} is here for their {visits} stream with us. Good to see you!',
  'Hey {name}, missed you since {since}. Your seat is still warm.',
]);
const PLATFORM_NAMES = Object.freeze({ twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick', tiktok: 'TikTok', facebook: 'Facebook' });

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Chatter Greeting', version: '4.1.21',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.1.21', maximumTestedBridgeVersion: '4.1.21',
  dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: ['chat.message', 'stream.online'],
  commandsProvided: [], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: [`data/addons/${MODULE_ID}/`, `data/addons/.state/${MODULE_ID}/`],
  installationSteps: [
    'Pick the platforms to greet and write the welcome lines.',
    'Add the overlay as a browser source (1920x1080) in the scenes where greetings should show.',
    'Enable the extension and restart StreamBridge.',
  ],
  uninstallationSteps: ['Disable the extension and remove its browser source.'], migrations: [],
  healthChecks: [{ id: `${MODULE_ID}.runtime`, description: 'Confirms first-chat detection, welcome-back memory and the greeting overlay.' }],
};

let stopped = true;
let operation = Promise.resolve();

function clean(value, maximum = 160) { return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '')].slice(0, maximum).join(''); }
function integer(value, minimum, maximum, fallback) { const number = Number(value); return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback; }
function lines(value, maximum) { return (Array.isArray(value) ? value : typeof value === 'string' ? value.split('\n') : []).map((line) => clean(String(line), 120)).filter(Boolean).slice(0, maximum); }
function command(value, fallback) { const text = clean(value, 32).toLowerCase(); return /^[!/]?[a-z0-9_-]{2,30}$/u.test(text) ? (text.startsWith('!') || text.startsWith('/') ? text : `!${text}`) : fallback; }
function names(value) { return (typeof value === 'string' ? value.split(/[,\n]/u) : Array.isArray(value) ? value : []).map((name) => clean(String(name), 64).replace(/^@/u, '').toLowerCase()).filter(Boolean).slice(0, 100); }

export function settingsFor(context) {
  const raw = context?.settings ?? {};
  const platforms = (Array.isArray(raw.platforms) ? raw.platforms : PLATFORMS).filter((platform, index, all) => PLATFORMS.includes(platform) && all.indexOf(platform) === index);
  return {
    enabled: raw.enabled === true, platforms,
    newMessages: messageList(raw.newMessage, raw.newMessageAlternates, OLD_NEW_DEFAULT, DEFAULT_NEW_MESSAGES),
    returningMessages: messageList(raw.returningMessage, raw.returningMessageAlternates, OLD_RETURNING_DEFAULT, DEFAULT_RETURNING_MESSAGES),
    allowOptOut: raw.allowOptOut !== false,
    optOutCommand: command(raw.optOutCommand, '!nogreet'),
    confirmOptOut: raw.confirmOptOut !== false,
    greetReturning: raw.greetReturning !== false,
    showChatMessage: raw.showChatMessage !== false,
    durationSeconds: integer(raw.durationSeconds, 3, 30, 7),
    position: POSITIONS.includes(raw.position) ? raw.position : 'bottom-left',
    resetHours: integer(raw.resetHours, 1, 48, 8),
    skipNames: names(raw.skipNames),
    skipModerators: raw.skipModerators === true,
  };
}

/** The main line plus any extra lines. A main line still on the old stock wording moves to the new, warmer set. */
function messageList(main, alternates, oldDefault, defaults) {
  const first = clean(main, 120);
  const extra = lines(alternates, 20);
  if (!first || (first === oldDefault && extra.length === 0)) return [...defaults];
  return [first, ...extra.filter((line) => line !== first)];
}

function emptyState() { return { greeted: [], known: [], visits: {}, optedOut: [], lastChatAt: 0 }; }
function sanitize(raw) {
  const state = emptyState();
  if (Array.isArray(raw?.greeted)) state.greeted = raw.greeted.filter((key) => typeof key === 'string').slice(-GREETED_LIMIT);
  if (Array.isArray(raw?.known)) state.known = raw.known.filter((key) => typeof key === 'string').slice(-KNOWN_LIMIT);
  if (Array.isArray(raw?.optedOut)) state.optedOut = raw.optedOut.filter((key) => typeof key === 'string').slice(-OPT_OUT_LIMIT);
  if (raw?.visits && typeof raw.visits === 'object' && !Array.isArray(raw.visits)) {
    const known = new Set(state.known);
    for (const [key, value] of Object.entries(raw.visits)) {
      if (!known.has(key) || !Array.isArray(value)) continue;
      state.visits[key] = [integer(value[0], 1, 1_000_000, 1), integer(value[1], 0, Number.MAX_SAFE_INTEGER, 0)];
    }
  }
  state.lastChatAt = integer(raw?.lastChatAt, 0, Number.MAX_SAFE_INTEGER, 0);
  return state;
}

/** "1st", "2nd", "3rd", "11th", "22nd". */
export function ordinal(number) {
  const tens = number % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[number % 10] ?? 'th';
  return `${String(number)}${suffix}`;
}

/** How long ago the viewer's last stream was, in plain words. */
export function sinceText(lastSeenAt, now) {
  const days = Math.floor((now - lastSeenAt) / 86_400_000);
  if (days < 2) return 'yesterday';
  if (days < 7) return `${String(days)} days ago`;
  if (days < 14) return 'last week';
  if (days < 60) return `${String(Math.floor(days / 7))} weeks ago`;
  return 'a while ago';
}

/** One key per viewer per platform: the platform user ID when there is one, otherwise the login name. */
export function viewerKey(event) {
  const id = clean(event?.user?.id, 128);
  const name = clean(event?.user?.name, 128).toLowerCase();
  return id || name ? `${event.platform}:${id ? `id:${id}` : `name:${name}`}` : '';
}

/** Who should not get a bubble: bots, the streamer, skipped names and (optionally) moderators. */
export function skipped(event, settings) {
  if (event?.user?.actorType && event.user.actorType !== 'human') return true;
  const roles = Array.isArray(event?.user?.roles) ? event.user.roles.map((role) => String(role).toLowerCase()) : [];
  if (roles.includes('broadcaster')) return true;
  if (settings.skipModerators && roles.includes('moderator')) return true;
  const handles = [event?.user?.name, event?.user?.displayName].map((name) => clean(name, 64).toLowerCase()).filter(Boolean);
  return handles.some((name) => settings.skipNames.includes(name));
}

/**
 * Picks one line at random. Lines that need {since} or {visits} are only used when the viewer's history has them,
 * so a viewer seen before this update still gets a line that reads well.
 */
export function pickLine(templates, details, random = Math.random) {
  const usable = templates.filter((line) => (!line.includes('{since}') || details.since) && (!line.includes('{visits}') || details.visits));
  const pool = usable.length > 0 ? usable : [details.returning ? OLD_RETURNING_DEFAULT : OLD_NEW_DEFAULT];
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

/** The bubble shown on stream for one greeting. */
export function greetingView(event, settings, returning, history = {}, random = Math.random) {
  const name = clean(event.user?.displayName || event.user?.name, 60) || 'friend';
  const details = { returning, since: history.since ?? '', visits: history.visits ?? '' };
  const template = pickLine(returning ? settings.returningMessages : settings.newMessages, details, random)
    .split('{platform}').join(PLATFORM_NAMES[event.platform] ?? 'chat')
    .split('{since}').join(details.since).split('{visits}').join(details.visits);
  const avatar = typeof event.user?.avatarUrl === 'string' && event.user.avatarUrl.startsWith('https://') ? event.user.avatarUrl : '';
  return {
    id: clean(event.eventId, 200), platform: event.platform, name, avatarUrl: avatar, returning,
    greeting: template.split('{name}').join(name),
    message: settings.showChatMessage ? clean(event.payload?.message ?? event.payload?.text, 140) : '',
    nameColor: /^#[0-9a-f]{6}$/iu.test(event.user?.nameColor ?? '') ? event.user.nameColor : '',
    durationMs: settings.durationSeconds * 1_000, position: settings.position,
  };
}

async function process(event, context) {
  const settings = settingsFor(context);
  if (!settings.enabled) return;
  if (event.eventType === 'stream.online') {
    if (event.metadata?.simulated === true) return;
    const state = sanitize(await context.state.read());
    state.greeted = [];
    await context.state.write(state);
    return;
  }
  if (event.eventType !== 'chat.message' || event.metadata?.simulated === true) return;
  if (!settings.platforms.includes(event.platform) || skipped(event, settings)) return;
  const key = viewerKey(event);
  if (!key) return;
  const state = sanitize(await context.state.read());
  const now = Date.now();
  const text = clean(event.payload?.message ?? event.payload?.text, 200).toLowerCase();
  if (settings.allowOptOut && text.split(' ')[0] === settings.optOutCommand) {
    const optingOut = !state.optedOut.includes(key);
    state.optedOut = optingOut ? [...state.optedOut, key].slice(-OPT_OUT_LIMIT) : state.optedOut.filter((item) => item !== key);
    if (!state.greeted.includes(key)) state.greeted = [...state.greeted, key].slice(-GREETED_LIMIT);
    state.lastChatAt = now;
    await context.state.write(state);
    if (settings.confirmOptOut) await confirm(context, event, optingOut, settings.optOutCommand);
    return;
  }
  if (state.optedOut.includes(key)) return;
  // A long quiet gap counts as a new stream, for creators whose stream-start event does not reach the Bridge.
  if (state.lastChatAt > 0 && now - state.lastChatAt > settings.resetHours * 3_600_000) state.greeted = [];
  state.lastChatAt = now;
  if (state.greeted.includes(key)) { await context.state.write(state); return; }
  state.greeted = [...state.greeted, key].slice(-GREETED_LIMIT);
  const returning = state.known.includes(key) && event.payload?.firstMessage !== true;
  const previous = state.visits[key];
  const history = returning && previous ? { visits: ordinal(previous[0] + 1), since: previous[1] > 0 ? sinceText(previous[1], now) : '' } : {};
  if (!state.known.includes(key)) state.known = [...state.known, key].slice(-KNOWN_LIMIT);
  state.visits[key] = [returning && previous ? previous[0] + 1 : 1, now];
  if (Object.keys(state.visits).length > KNOWN_LIMIT) {
    const known = new Set(state.known);
    for (const visitKey of Object.keys(state.visits)) if (!known.has(visitKey)) delete state.visits[visitKey];
  }
  await context.state.write(state);
  if (returning && !settings.greetReturning) return;
  await context.overlay.publish(`${MODULE_ID}.greeting.show`, greetingView(event, settings, returning, history), { lane: 'independent' }).catch(() => undefined);
}

async function confirm(context, event, optedOut, commandText) {
  const name = clean(event.user?.displayName || event.user?.name, 60) || 'friend';
  const message = optedOut
    ? `Got it, ${name}. No more greeting pop-ups for you. Type ${commandText} again any time to turn them back on.`
    : `Welcome greetings are back on for you, ${name}.`;
  try { await context.chat?.send?.({ message, routing: 'source', sourcePlatform: event.platform, overflow: 'truncate' }); } catch { /* Never retry a chat message that may have gone out. */ }
}

function serialize(task) { operation = operation.then(task, task); return operation; }

export default {
  manifest, required: false,
  async start() { stopped = false; operation = Promise.resolve(); },
  async stop() { stopped = true; await operation; },
  async onEvent(event, context) { if (!stopped) await serialize(() => process(event, context)); },
};
