// Chatter Greeting: the first time a viewer chats in a stream, a bubble with their picture, name and platform
// pops up on stream ("Welcome in, Sloth!"). Viewers seen in an earlier stream get the welcome-back line.
// Works on every platform the chat intakes cover. No Streamer.bot import is needed.
const MODULE_ID = 'thsv.chatter-greeting';
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok', 'facebook']);
const POSITIONS = Object.freeze(['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right']);
const KNOWN_LIMIT = 5_000;
const GREETED_LIMIT = 2_000;

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Chatter Greeting', version: '4.1.7',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.1.7', maximumTestedBridgeVersion: '4.1.7',
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
function names(value) { return (typeof value === 'string' ? value.split(/[,\n]/u) : Array.isArray(value) ? value : []).map((name) => clean(String(name), 64).replace(/^@/u, '').toLowerCase()).filter(Boolean).slice(0, 100); }

export function settingsFor(context) {
  const raw = context?.settings ?? {};
  const platforms = (Array.isArray(raw.platforms) ? raw.platforms : PLATFORMS).filter((platform, index, all) => PLATFORMS.includes(platform) && all.indexOf(platform) === index);
  return {
    enabled: raw.enabled === true, platforms,
    newMessage: clean(raw.newMessage, 120) || 'Welcome in, {name}! Glad you found us.',
    returningMessage: clean(raw.returningMessage, 120) || 'Welcome back, {name}!',
    greetReturning: raw.greetReturning !== false,
    showChatMessage: raw.showChatMessage !== false,
    durationSeconds: integer(raw.durationSeconds, 3, 30, 7),
    position: POSITIONS.includes(raw.position) ? raw.position : 'bottom-left',
    resetHours: integer(raw.resetHours, 1, 48, 8),
    skipNames: names(raw.skipNames),
    skipModerators: raw.skipModerators === true,
  };
}

function emptyState() { return { greeted: [], known: [], lastChatAt: 0 }; }
function sanitize(raw) {
  const state = emptyState();
  if (Array.isArray(raw?.greeted)) state.greeted = raw.greeted.filter((key) => typeof key === 'string').slice(-GREETED_LIMIT);
  if (Array.isArray(raw?.known)) state.known = raw.known.filter((key) => typeof key === 'string').slice(-KNOWN_LIMIT);
  state.lastChatAt = integer(raw?.lastChatAt, 0, Number.MAX_SAFE_INTEGER, 0);
  return state;
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

/** The bubble shown on stream for one greeting. */
export function greetingView(event, settings, returning) {
  const name = clean(event.user?.displayName || event.user?.name, 60) || 'friend';
  const template = returning ? settings.returningMessage : settings.newMessage;
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
  // A long quiet gap counts as a new stream, for creators whose stream-start event does not reach the Bridge.
  if (state.lastChatAt > 0 && now - state.lastChatAt > settings.resetHours * 3_600_000) state.greeted = [];
  state.lastChatAt = now;
  if (state.greeted.includes(key)) { await context.state.write(state); return; }
  state.greeted = [...state.greeted, key].slice(-GREETED_LIMIT);
  const returning = state.known.includes(key) && event.payload?.firstMessage !== true;
  if (!state.known.includes(key)) state.known = [...state.known, key].slice(-KNOWN_LIMIT);
  await context.state.write(state);
  if (returning && !settings.greetReturning) return;
  await context.overlay.publish(`${MODULE_ID}.greeting.show`, greetingView(event, settings, returning), { lane: 'independent' }).catch(() => undefined);
}

function serialize(task) { operation = operation.then(task, task); return operation; }

export default {
  manifest, required: false,
  async start() { stopped = false; operation = Promise.resolve(); },
  async stop() { stopped = true; await operation; },
  async onEvent(event, context) { if (!stopped) await serialize(() => process(event, context)); },
};
