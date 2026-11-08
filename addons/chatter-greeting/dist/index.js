// Chatter Greeting: the first time a viewer chats in a stream, a bubble with their picture, name and platform
// pops up on stream. The line depends on who they are: a first-timer, someone back again, a regular, or someone
// returning after a long break, and each kind can have several lines that rotate. Viewers can type !nogreet to
// stop being greeted and !greetme to start again. {community} becomes the community name set in the Wizard. Works on every platform the chat intakes cover. No Streamer.bot
// import is needed.
const MODULE_ID = 'thsv.chatter-greeting';
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok', 'facebook']);
const POSITIONS = Object.freeze(['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right']);
const KNOWN_LIMIT = 5_000;
const GREETED_LIMIT = 2_000;
const OPTED_OUT_LIMIT = 5_000;
const DAY_MS = 86_400_000;
const FALLBACKS = Object.freeze({
  newMessage: 'Welcome to {community}, {name}! First time here, so grab a cozy spot and say hi anytime.',
  newMessageAlternates: ['{name} just found {community}! So glad you are here.', 'A new face! Welcome in, {name}. Make yourself at home.'],
  returningMessage: 'Welcome back, {name}! That makes {visits} streams together.',
  returningMessageAlternates: ['{name} is back in {community}! Thanks for hanging out again.', 'Good to see you again, {name}! Visit number {visits}.'],
  regularMessage: '{name}, a true regular! {visits} streams and counting. Your usual spot is saved.',
  awayMessage: '{name}! It has been {away}. {community} missed you, welcome home.',
  optOutReply: 'Got it, {name}. No more greetings from me. Type !{optIn} anytime to turn them back on.',
  optInReply: 'Yay, {name}! Your greetings are back on.',
});

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Chatter Greeting', version: '4.1.61',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.1.61', maximumTestedBridgeVersion: '4.1.61',
  dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: ['chat.message', 'stream.online', 'command.received'],
  commandsProvided: [{ id: 'chatter-greeting.opt-out', name: 'nogreet' }, { id: 'chatter-greeting.opt-in', name: 'greetme' }],
  actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: [`data/addons/${MODULE_ID}/`, `data/addons/.state/${MODULE_ID}/`],
  installationSteps: [
    'Pick the platforms to greet and write the welcome lines.',
    'Add the overlay as a browser source (1920x1080) in the scenes where greetings should show.',
    'Enable the extension and restart StreamBridge.',
  ],
  uninstallationSteps: ['Disable the extension and remove its browser source.'], migrations: [],
  healthChecks: [{ id: `${MODULE_ID}.runtime`, description: 'Confirms first-chat detection, visit memory, opt-out and the greeting overlay.' }],
};

let stopped = true;
let operation = Promise.resolve();
const lastLine = new Map();

function clean(value, maximum = 160) { return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '')].slice(0, maximum).join(''); }
function integer(value, minimum, maximum, fallback) { const number = Number(value); return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback; }
function names(value) { return (typeof value === 'string' ? value.split(/[,\n]/u) : Array.isArray(value) ? value : []).map((name) => clean(String(name), 64).replace(/^@/u, '').toLowerCase()).filter(Boolean).slice(0, 100); }
function lines(value, fallback) { return (Array.isArray(value) ? value : fallback).map((line) => clean(line, 120)).filter(Boolean).slice(0, 10); }
function command(value, fallback) { return clean(value, 40).replace(/^!+/u, '').toLowerCase() || fallback; }

export function settingsFor(context) {
  const raw = context?.settings ?? {};
  const platforms = (Array.isArray(raw.platforms) ? raw.platforms : PLATFORMS).filter((platform, index, all) => PLATFORMS.includes(platform) && all.indexOf(platform) === index);
  return {
    enabled: raw.enabled === true, platforms,
    newMessage: clean(raw.newMessage, 120) || FALLBACKS.newMessage,
    newMessageAlternates: lines(raw.newMessageAlternates, FALLBACKS.newMessageAlternates),
    returningMessage: clean(raw.returningMessage, 120) || FALLBACKS.returningMessage,
    returningMessageAlternates: lines(raw.returningMessageAlternates, FALLBACKS.returningMessageAlternates),
    regularMessage: clean(raw.regularMessage, 120) || FALLBACKS.regularMessage,
    regularVisits: integer(raw.regularVisits, 2, 1000, 10),
    awayMessage: clean(raw.awayMessage, 120) || FALLBACKS.awayMessage,
    awayDays: integer(raw.awayDays, 2, 365, 14),
    greetReturning: raw.greetReturning !== false,
    showChatMessage: raw.showChatMessage !== false,
    durationSeconds: integer(raw.durationSeconds, 3, 30, 7),
    position: POSITIONS.includes(raw.position) ? raw.position : 'bottom-left',
    resetHours: integer(raw.resetHours, 1, 48, 8),
    skipNames: names(raw.skipNames),
    skipModerators: raw.skipModerators === true,
    optOutEnabled: raw.optOutEnabled !== false,
    optOutCommand: command(raw.optOutCommand, 'nogreet'),
    optInCommand: command(raw.optInCommand, 'greetme'),
    optOutReply: clean(raw.optOutReply, 200) || FALLBACKS.optOutReply,
    optInReply: clean(raw.optInReply, 200) || FALLBACKS.optInReply,
  };
}

function emptyState() { return { greeted: [], visits: {}, optedOut: [], lastChatAt: 0 }; }
/** visits: one [streams chatted in, last stream seen at] pair per viewer. Older saves only had a `known` list. */
function sanitize(raw) {
  const state = emptyState();
  if (Array.isArray(raw?.greeted)) state.greeted = raw.greeted.filter((key) => typeof key === 'string').slice(-GREETED_LIMIT);
  if (raw?.visits && typeof raw.visits === 'object' && !Array.isArray(raw.visits)) {
    for (const [key, value] of Object.entries(raw.visits)) {
      if (Array.isArray(value)) state.visits[key] = [integer(value[0], 1, 1_000_000, 1), integer(value[1], 0, Number.MAX_SAFE_INTEGER, 0)];
    }
  }
  if (Array.isArray(raw?.known)) for (const key of raw.known) if (typeof key === 'string' && !state.visits[key]) state.visits[key] = [1, 0];
  if (Array.isArray(raw?.optedOut)) state.optedOut = raw.optedOut.filter((key) => typeof key === 'string').slice(-OPTED_OUT_LIMIT);
  state.lastChatAt = integer(raw?.lastChatAt, 0, Number.MAX_SAFE_INTEGER, 0);
  return state;
}
function trimVisits(visits) {
  const entries = Object.entries(visits);
  if (entries.length <= KNOWN_LIMIT) return visits;
  return Object.fromEntries(entries.sort((left, right) => right[1][1] - left[1][1]).slice(0, KNOWN_LIMIT));
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

/** "3 days", "2 weeks", "4 months": how long since the viewer's last stream. */
export function awayText(milliseconds) {
  const days = Math.max(1, Math.round(milliseconds / DAY_MS));
  if (days < 14) return `${String(days)} day${days === 1 ? '' : 's'}`;
  if (days < 60) return `${String(Math.round(days / 7))} weeks`;
  const months = Math.round(days / 30);
  return months < 12 ? `${String(months)} months` : 'over a year';
}

/** Which kind of welcome a viewer gets. `visits` includes this stream. */
export function greetingKind(visits, lastSeenAt, now, settings) {
  if (visits <= 1) return 'new';
  if (lastSeenAt > 0 && now - lastSeenAt >= settings.awayDays * DAY_MS) return 'away';
  if (visits >= settings.regularVisits) return 'regular';
  return 'returning';
}

function pickLine(kind, settings, random) {
  const choices = kind === 'new' ? [settings.newMessage, ...settings.newMessageAlternates]
    : kind === 'returning' ? [settings.returningMessage, ...settings.returningMessageAlternates]
      : [kind === 'regular' ? settings.regularMessage : settings.awayMessage];
  // Never the same line twice in a row for one kind, so back-to-back greetings read differently.
  const fresh = choices.length > 1 ? choices.filter((line) => line !== lastLine.get(kind)) : choices;
  const line = fresh[Math.min(fresh.length - 1, Math.floor(random() * fresh.length))];
  lastLine.set(kind, line);
  return line;
}

function fill(template, values) { return template.replace(/\{(name|visits|away|platform|community|optIn|optOut)\}/gu, (_, key) => String(values[key] ?? '')); }

const PLATFORM_NAMES = Object.freeze({ twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick', tiktok: 'TikTok', facebook: 'Facebook' });

/** The bubble shown on stream for one greeting. */
export function greetingView(event, settings, returning, detail = {}) {
  const name = clean(event.user?.displayName || event.user?.name, 60) || 'friend';
  const kind = detail.kind ?? (returning ? 'returning' : 'new');
  const template = detail.template ?? (kind === 'new' ? settings.newMessage : kind === 'returning' ? settings.returningMessage : kind === 'regular' ? settings.regularMessage : settings.awayMessage);
  const avatar = typeof event.user?.avatarUrl === 'string' && event.user.avatarUrl.startsWith('https://') ? event.user.avatarUrl : '';
  return {
    id: clean(event.eventId, 200), platform: event.platform, name, avatarUrl: avatar, returning, kind,
    greeting: fill(template, { name, visits: detail.visits ?? (returning ? 2 : 1), away: detail.away ?? '', platform: PLATFORM_NAMES[event.platform] ?? '', community: detail.community || 'the stream' }),
    message: settings.showChatMessage ? clean(event.payload?.message ?? event.payload?.text, 140) : '',
    nameColor: /^#[0-9a-f]{6}$/iu.test(event.user?.nameColor ?? '') ? event.user.nameColor : '',
    durationMs: settings.durationSeconds * 1_000, position: settings.position,
  };
}

function commandOf(event) {
  if (event.eventType === 'command.received') return command(event.payload?.command, '');
  const text = clean(event.payload?.message ?? event.payload?.text, 60);
  return text.startsWith('!') ? command(text.slice(1).split(' ')[0], '') : '';
}

async function reply(context, event, template, settings) {
  const name = clean(event.user?.displayName || event.user?.name, 60) || 'friend';
  await context.chat?.send({ message: fill(template, { name, optIn: settings.optInCommand, optOut: settings.optOutCommand }), routing: 'source', sourcePlatform: event.platform, overflow: 'truncate' }).catch(() => undefined);
}

async function optCommand(event, context, settings, wanted) {
  const key = viewerKey(event);
  if (!key) return;
  const state = sanitize(await context.state.read());
  const optedOut = state.optedOut.includes(key);
  if (wanted === 'out' && !optedOut) state.optedOut = [...state.optedOut, key].slice(-OPTED_OUT_LIMIT);
  if (wanted === 'in' && optedOut) state.optedOut = state.optedOut.filter((entry) => entry !== key);
  await context.state.write(state);
  await reply(context, event, wanted === 'out' ? settings.optOutReply : settings.optInReply, settings);
}

async function process(event, context, random = Math.random) {
  const settings = settingsFor(context);
  if (!settings.enabled) return;
  if (event.eventType === 'stream.online') {
    if (event.metadata?.simulated === true) return;
    const state = sanitize(await context.state.read());
    state.greeted = [];
    await context.state.write(state);
    return;
  }
  if (event.metadata?.simulated === true || !settings.platforms.includes(event.platform)) return;
  if (event.eventType === 'command.received') {
    const name = commandOf(event);
    if (settings.optOutEnabled && name === settings.optOutCommand) await optCommand(event, context, settings, 'out');
    else if (settings.optOutEnabled && name === settings.optInCommand) await optCommand(event, context, settings, 'in');
    return;
  }
  if (event.eventType !== 'chat.message' || skipped(event, settings)) return;
  const key = viewerKey(event);
  if (!key) return;
  const state = sanitize(await context.state.read());
  const now = Date.now();
  // A long quiet gap counts as a new stream, for creators whose stream-start event does not reach the Bridge.
  if (state.lastChatAt > 0 && now - state.lastChatAt > settings.resetHours * 3_600_000) state.greeted = [];
  state.lastChatAt = now;
  if (state.greeted.includes(key)) { await context.state.write(state); return; }
  state.greeted = [...state.greeted, key].slice(-GREETED_LIMIT);
  const [previousVisits, lastSeenAt] = state.visits[key] ?? [0, 0];
  // Twitch marks a viewer's first message in the channel; that viewer is new even if an old record exists.
  const visits = event.payload?.firstMessage === true ? 1 : previousVisits + 1;
  state.visits = trimVisits({ ...state.visits, [key]: [visits, now] });
  await context.state.write(state);
  // A viewer who opted out, or whose first message is the opt-out command itself, never gets a bubble.
  const typed = commandOf(event);
  if (state.optedOut.includes(key) || (settings.optOutEnabled && typed === settings.optOutCommand)) return;
  const kind = greetingKind(visits, lastSeenAt, now, settings);
  if (kind !== 'new' && !settings.greetReturning) return;
  const view = greetingView(event, settings, kind !== 'new', { kind, template: pickLine(kind, settings, random), visits, away: lastSeenAt > 0 ? awayText(now - lastSeenAt) : '', community: clean(context.community?.name, 80) });
  await context.overlay.publish(`${MODULE_ID}.greeting.show`, view, { lane: 'independent' }).catch(() => undefined);
}

function serialize(task) { operation = operation.then(task, task); return operation; }

export { FALLBACKS, manifest };

export default {
  manifest, required: false,
  async start() { stopped = false; operation = Promise.resolve(); lastLine.clear(); },
  async stop() { stopped = true; await operation; },
  async onEvent(event, context) { if (!stopped) await serialize(() => process(event, context)); },
};
