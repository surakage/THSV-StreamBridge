// End Credits collects this stream's supporters into short per-section name lists and rolls them
// as scrolling credits. It stores display names and platforms only, and starts fresh when the
// stream goes live.
const MODULE_ID = 'thsv.end-credits';
const SECTION_KEYS = Object.freeze(['followers', 'members', 'gifters', 'supporters', 'raiders', 'moderators', 'chatters']);
const PLATFORM = /^(twitch|youtube|kick|tiktok|streamlabs|kofi)$/u;
const FALLBACKS = Object.freeze({
  enabled: true,
  enabledPlatforms: ['twitch', 'youtube', 'kick', 'tiktok', 'streamlabs', 'kofi'],
  enabledSections: ['followers', 'members', 'gifters', 'supporters', 'raiders', 'moderators'],
  showSimulatedPreviews: true,
  maximumNamesPerSection: 200,
  maximumNameLength: 40,
  headline: "That's a wrap!",
  subtitle: 'Thank you for hanging out today',
  endMessage: 'Thanks for watching!',
  followersTitle: 'New Followers',
  membersTitle: 'Subscribers & Members',
  giftersTitle: 'Gifters',
  supportersTitle: 'Supporters',
  raidersTitle: 'Raiders',
  moderatorsTitle: 'Moderators',
  chattersTitle: 'Chat',
  showGiftCounts: true,
  autoRollOnShow: true,
  loop: false,
  scrollSpeed: 70,
  columns: 2,
  platformColors: true,
  backgroundMode: 'none',
  backgroundColor: '#0b0f17',
  backgroundOpacity: 0.72,
  accentColor: '#7ff5cc',
  textColor: '#ffffff',
  fontFamily: 'broadcast',
  fontSize: 38,
  enableModeratorCommand: true,
  commandName: 'credits',
});
const TITLE_SETTING = Object.freeze({
  followers: 'followersTitle', members: 'membersTitle', gifters: 'giftersTitle', supporters: 'supportersTitle',
  raiders: 'raidersTitle', moderators: 'moderatorsTitle', chatters: 'chattersTitle',
});
const manifest = {
  contractVersion: '2.0.0-preview.1',
  moduleId: MODULE_ID,
  name: 'End Credits',
  version: '4.0.64',
  minimumCoreVersion: '2.0.0-preview.1',
  maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.64', maximumTestedBridgeVersion: '4.0.64',
  dependencies: [],
  requiredCapabilities: [],
  configurationSchema: 'schemas/config.json',
  eventSubscriptions: [
    'channel.follow', 'channel.subscription', 'channel.membership', 'channel.gift-subscription',
    'engagement.gift', 'engagement.donation', 'engagement.cheer', 'engagement.super-chat',
    'channel.raid', 'chat.message', 'command.received', 'stream.online',
  ],
  commandsProvided: [{ id: 'end-credits.roll', name: 'credits' }],
  actionsProvided: [],
  browserSourcesProvided: [],
  dataStorageOwned: [`data/addons/${MODULE_ID}/`, `data/addons/.state/${MODULE_ID}/`],
  installationSteps: [
    'Install and enable End Credits. No separate Streamer.bot import or direct trigger is required.',
    'Choose the sections, wording and style in the wizard.',
    'Add the browser-source URL to your ending scene at 1920 x 1080. The credits roll each time that scene is shown.',
    'Moderators can also type !credits to roll them, or !credits reset to start a fresh list.',
  ],
  uninstallationSteps: ['Uninstall the add-on. The current list stays saved for a later reinstall.'],
  migrations: [],
  healthChecks: [{ id: `${MODULE_ID}.runtime`, description: 'Confirms bounded per-stream name lists and namespaced overlay publication.' }],
};
let simulated = emptySections();
let operation = Promise.resolve();

function clean(value, maximum = 256) {
  return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '')].slice(0, maximum).join('');
}
function integer(value, minimum, maximum, fallback) {
  return Number.isSafeInteger(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}
function number(value, minimum, maximum, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}
function color(value, fallback) { return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/u.test(value) ? value : fallback; }
function oneOf(value, allowed, fallback) { return allowed.includes(value) ? value : fallback; }
function cleanCommandName(value, fallback) {
  const name = clean(value, 40).replace(/^!+/u, '').toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,39}$/u.test(name) ? name : fallback;
}
export function settingsFor(context) {
  const raw = { ...FALLBACKS, ...(context.settings || {}) };
  return {
    ...raw,
    enabledPlatforms: new Set(Array.isArray(raw.enabledPlatforms) ? raw.enabledPlatforms.filter((item) => PLATFORM.test(item)) : FALLBACKS.enabledPlatforms),
    enabledSections: new Set(Array.isArray(raw.enabledSections) ? raw.enabledSections.filter((item) => SECTION_KEYS.includes(item)) : FALLBACKS.enabledSections),
    maximumNamesPerSection: integer(raw.maximumNamesPerSection, 10, 1000, 200),
    maximumNameLength: integer(raw.maximumNameLength, 12, 100, 40),
    scrollSpeed: integer(raw.scrollSpeed, 20, 300, 70),
    columns: integer(raw.columns, 1, 4, 2),
    backgroundOpacity: number(raw.backgroundOpacity, 0, 1, 0.72),
    fontSize: integer(raw.fontSize, 18, 96, 38),
    commandName: cleanCommandName(raw.commandName, 'credits'),
  };
}
function emptySections() { return Object.fromEntries(SECTION_KEYS.map((key) => [key, []])); }
function emptyState(now = 0) { return { version: 1, sessionStartedAt: now, sections: emptySections() }; }
function safeEntry(value) {
  if (!value || typeof value !== 'object') return undefined;
  const name = clean(value.name, 100);
  const platform = clean(value.platform, 32);
  if (!name || !PLATFORM.test(platform)) return undefined;
  const key = clean(value.key, 160) || `${platform}:${name.toLowerCase()}`;
  const count = Number.isSafeInteger(value.count) && value.count > 0 ? Math.min(value.count, 1_000_000) : 1;
  return { key, name, platform, count };
}
export function sanitizeCreditsState(value) {
  const result = emptyState();
  if (!value || typeof value !== 'object') return result;
  if (Number.isSafeInteger(value.sessionStartedAt) && value.sessionStartedAt >= 0) result.sessionStartedAt = value.sessionStartedAt;
  const sections = value.sections && typeof value.sections === 'object' ? value.sections : {};
  for (const key of SECTION_KEYS) {
    const seen = new Set();
    for (const raw of Array.isArray(sections[key]) ? sections[key].slice(0, 1000) : []) {
      const entry = safeEntry(raw);
      if (!entry || seen.has(entry.key)) continue;
      seen.add(entry.key);
      result.sections[key].push(entry);
    }
  }
  return result;
}
function roles(user) { return Array.isArray(user?.roles) ? user.roles.map((role) => clean(role, 40).toLowerCase()) : []; }
function isModeratorLike(user) { const list = roles(user); return list.includes('moderator') || list.includes('mod') || list.includes('broadcaster') || list.includes('host'); }
function isBroadcaster(user) { const list = roles(user); return list.includes('broadcaster') || list.includes('host'); }
function quantity(payload) { return Number.isSafeInteger(payload?.quantity) && payload.quantity > 0 ? payload.quantity : 1; }

// Maps one normalized event to the credits section it belongs to, or undefined.
export function sectionFor(event) {
  switch (event.eventType) {
    case 'channel.follow': return { key: 'followers', count: 1 };
    case 'channel.subscription': case 'channel.membership': return { key: 'members', count: 1 };
    case 'channel.gift-subscription': case 'engagement.gift': return { key: 'gifters', count: quantity(event.payload) };
    case 'engagement.cheer': case 'engagement.donation': case 'engagement.super-chat': return { key: 'supporters', count: 1 };
    case 'channel.raid': return { key: 'raiders', count: 1 };
    case 'chat.message':
      if (isModeratorLike(event.user) && !isBroadcaster(event.user)) return { key: 'moderators', count: 1, alsoChatter: true };
      if (isBroadcaster(event.user)) return undefined;
      return { key: 'chatters', count: 1 };
    default: return undefined;
  }
}
function displayName(event, settings) {
  return clean(event.user?.displayName || event.user?.name || event.channel?.name || '', settings.maximumNameLength);
}
function addEntry(list, entry, settings, sumCounts) {
  const existing = list.find((item) => item.key === entry.key);
  if (existing) {
    if (sumCounts) existing.count = Math.min(existing.count + entry.count, 1_000_000);
    existing.name = entry.name;
    return false;
  }
  if (list.length >= settings.maximumNamesPerSection) return false;
  list.push(entry);
  return true;
}
function mergedSections(state) {
  const sections = emptySections();
  for (const key of SECTION_KEYS) {
    const seen = new Set();
    for (const entry of [...state.sections[key], ...simulated[key]]) {
      if (seen.has(entry.key)) continue;
      seen.add(entry.key);
      sections[key].push(entry);
    }
  }
  return sections;
}
export function overlayPayload(state, settings, { preview = false, sections = state.sections } = {}) {
  return {
    headline: clean(settings.headline, 80),
    subtitle: clean(settings.subtitle, 160),
    endMessage: clean(settings.endMessage, 120),
    sessionStartedAt: state.sessionStartedAt,
    preview,
    sections: SECTION_KEYS.filter((key) => settings.enabledSections.has(key)).map((key) => ({
      key,
      title: clean(settings[TITLE_SETTING[key]], 80) || FALLBACKS[TITLE_SETTING[key]],
      names: sections[key].map((entry) => ({
        name: entry.name,
        platform: entry.platform,
        ...(key === 'gifters' && settings.showGiftCounts === true && entry.count > 1 ? { count: entry.count } : {}),
      })),
    })),
    style: {
      autoRollOnShow: settings.autoRollOnShow === true,
      loop: settings.loop === true,
      scrollSpeed: settings.scrollSpeed,
      columns: settings.columns,
      platformColors: settings.platformColors === true,
      backgroundMode: oneOf(settings.backgroundMode, ['glass', 'solid', 'none'], 'none'),
      backgroundColor: color(settings.backgroundColor, FALLBACKS.backgroundColor),
      backgroundOpacity: settings.backgroundOpacity,
      accentColor: color(settings.accentColor, FALLBACKS.accentColor),
      textColor: color(settings.textColor, FALLBACKS.textColor),
      fontFamily: oneOf(settings.fontFamily, ['broadcast', 'display', 'serif', 'mono'], 'broadcast'),
      fontSize: settings.fontSize,
    },
  };
}
async function publish(state, settings, context, { preview = false, roll = false } = {}) {
  const payload = overlayPayload(state, settings, { preview, sections: preview ? mergedSections(state) : state.sections });
  await context.overlay.publish(`${MODULE_ID}.credits.update`, payload, { lane: preview ? 'preview' : 'persistent' });
  if (roll) await context.overlay.publish(`${MODULE_ID}.credits.roll`, payload, { lane: 'preview' });
}
function commandFor(event, settings) {
  if (event.eventType !== 'command.received' || settings.enableModeratorCommand !== true || !isModeratorLike(event.user)) return undefined;
  if (clean(event.payload?.command, 80).toLowerCase() !== settings.commandName) return undefined;
  const argument = clean(Array.isArray(event.payload?.arguments) ? event.payload.arguments[0] : '', 20).toLowerCase();
  if (argument === 'reset' || argument === 'clear') return 'reset';
  if (argument === 'stop' || argument === 'hide') return 'hide';
  return 'roll';
}

export async function processEndCreditsEvent(event, context, now = Date.now()) {
  const settings = settingsFor(context);
  if (!settings.enabled) return undefined;
  if (event.eventType === 'stream.online' && event.metadata?.simulated !== true) {
    simulated = emptySections();
    const fresh = emptyState(now);
    await context.state.write(fresh);
    await publish(fresh, settings, context);
    return { action: 'reset' };
  }
  const command = commandFor(event, settings);
  if (command) {
    const state = sanitizeCreditsState(await context.state.read());
    if (command === 'reset') {
      simulated = emptySections();
      const fresh = emptyState(now);
      await context.state.write(fresh);
      await publish(fresh, settings, context);
    } else if (command === 'hide') {
      await context.overlay.publish(`${MODULE_ID}.credits.hide`, {}, { lane: 'preview' });
    } else {
      await publish(state, settings, context, { roll: true });
    }
    return { action: command };
  }
  if (!settings.enabledPlatforms.has(event.platform)) return undefined;
  const target = sectionFor(event);
  if (!target) return undefined;
  const isSimulated = event.metadata?.simulated === true;
  if (isSimulated && settings.showSimulatedPreviews !== true) return undefined;
  const name = displayName(event, settings);
  if (!name) return undefined;
  const id = clean(event.user?.id, 120);
  const entry = { key: `${event.platform}:${(id || name).toLowerCase()}`, name, platform: event.platform, count: target.count };
  const keys = [target.key, ...(target.alsoChatter ? ['chatters'] : [])].filter((key) => settings.enabledSections.has(key));
  if (!keys.length) return undefined;
  const state = sanitizeCreditsState(await context.state.read());
  if (!state.sessionStartedAt) state.sessionStartedAt = now;
  let added = false;
  for (const key of keys) {
    const list = isSimulated ? simulated[key] : state.sections[key];
    added = addEntry(list, { ...entry }, settings, key === 'gifters') || added;
  }
  // Chat messages arrive constantly; only a new name or a changed count needs a save and a publish.
  if (!added && target.key !== 'gifters') return { section: target.key, added: false, simulated: isSimulated };
  if (!isSimulated) await context.state.write(state);
  await publish(state, settings, context, { preview: isSimulated });
  return { section: target.key, added, simulated: isSimulated };
}
export { SECTION_KEYS, emptyState as emptyCreditsState };
export default {
  manifest,
  required: false,
  async start(context) {
    simulated = emptySections();
    operation = Promise.resolve();
    const settings = settingsFor(context);
    if (!settings.enabled) return;
    const state = sanitizeCreditsState(await context.state.read());
    await context.state.write(state);
    await publish(state, settings, context);
  },
  async stop() { await operation.catch(() => undefined); operation = Promise.resolve(); simulated = emptySections(); },
  async onEvent(event, context) { operation = operation.then(() => processEndCreditsEvent(event, context), () => processEndCreditsEvent(event, context)); await operation; },
};
