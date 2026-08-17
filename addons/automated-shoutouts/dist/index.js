// Automated Shoutouts is intentionally event-driven: it consumes StreamBridge's normalized
// events and uses only brokered chat, overlay, action, scheduler, and private-state capabilities.
const NATIVE_TWITCH_SHOUTOUT_ACTION_ID = 'c84fdb40-d06f-5b0a-9ddf-f6d21c68922e';
const LOOKUP_TWITCH_CREATOR_ACTION_ID = 'e3d92d7e-193a-5bba-8b8c-4f17e605c9d2';
const TWITCH_PROFILE_EVENT = 'addon.thsv.automated-shoutouts.twitch-profile-received';
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok']);
const PLATFORM_MESSAGE_LIMITS = Object.freeze({ twitch: 500, youtube: 200, kick: 500, tiktok: 150 });
const PLATFORM_LABELS = Object.freeze({ twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick', tiktok: 'TikTok' });
const NATIVE_GLOBAL_COOLDOWN_MS = 120_000;
const NATIVE_USER_COOLDOWN_MS = 3_600_000;
const DEFAULT_IGNORED_USERS = Object.freeze([
  'twitch:nightbot', 'twitch:streamelements', 'youtube:streamelements', 'kick:streamelements',
  'twitch:fossabot', 'twitch:moobot', 'twitch:sery_bot', 'twitch:soundalerts', 'twitch:wizebot',
  'twitch:kofistreambot', 'twitch:streamlabs', 'twitch:botrix', 'youtube:botrix', 'kick:botrix',
  'tiktok:botrix', 'twitch:commanderroot', 'twitch:deepbot', 'twitch:phantombot',
  'twitch:stay_hydrated_bot', 'twitch:coebot', 'twitch:pretzelrocks', 'twitch:streamavatars',
  'twitch:suraruisuh', 'twitch:suraruisuh_bot',
]);
const DEFAULT_SPAM_TERMS = Object.freeze([
  'want to become famous', 'buy followers', 'buy viewers', 'cheap viewers',
  'get more viewers at', 'promote your channel at', 'grow your channel fast', 'best viewers on',
]);
const DEFAULT_SPAM_DOMAINS = Object.freeze(['bigfollows.com', 'streamboo.com', 'bestviewers.com', 'viewers.shop']);

const manifest = {
  contractVersion: '2.0.0-preview.1',
  moduleId: 'thsv.automated-shoutouts',
  name: 'Automated Shoutouts',
  version: '4.0.0',
  minimumCoreVersion: '2.0.0-preview.1',
  maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.0', maximumTestedBridgeVersion: '4.0.0',
  dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: ['channel.raid', 'chat.message', 'command.received', 'stream.online', 'stream.offline', TWITCH_PROFILE_EVENT],
  commandsProvided: [{ id: 'automated-shoutouts.shoutout', name: 'shoutout (recommended alias: so)' }],
  actionsProvided: [
    { id: 'automated-shoutouts.twitch-lookup', name: 'Required Twitch creator category lookup' },
    { id: 'automated-shoutouts.twitch-native', name: 'Optional Twitch native shoutout' },
  ],
  browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.automated-shoutouts/', 'data/addons/.state/thsv.automated-shoutouts/'],
  installationSteps: [
    'Install and enable the add-on in the StreamBridge wizard, then review its chat.send and overlay.publish permissions.',
    'Choose the manual shoutout command in the wizard. It registers automatically through the existing chat intakes after save and restart.',
    'Import the Automated Shoutouts Streamer.bot package and approve Lookup Twitch Creator whenever Twitch triggers are enabled.',
    'Optional: also approve Twitch Native Shoutout when Twitch shoutout mode is native or both.',
    'For TikTok output, enable Allow Streamer.bot to push messages to TikFinity in TikFinity Chatbot settings.',
  ],
  uninstallationSteps: ['Uninstall the add-on. Its private cooldown state remains preserved for a later reinstall.'],
  migrations: [],
  healthChecks: [{ id: 'thsv.automated-shoutouts.runtime', description: 'Confirms shoutout event handling, bounded state, and broker access are healthy.' }],
};

const FALLBACKS = Object.freeze({
  enabled: true, enabledPlatforms: PLATFORMS, triggerOnRaids: true, minimumRaidViewers: 1,
  triggerOnFirstChat: false, firstChatResetHours: 12, firstChatAudience: 'safe-all', firstChatAllowlist: [], triggerOnManualCommand: true,
  welcomeTimeZone: 'UTC', welcomeSafetyMode: 'balanced', welcomeDelaySeconds: 3, welcomeRequireStableId: true,
  welcomeRejectLinks: true, welcomeBlockedTerms: DEFAULT_SPAM_TERMS, welcomeBlockedDomains: DEFAULT_SPAM_DOMAINS,
  manualCommandName: 'shoutout', ignoreConnectedAccounts: true, ignoredUsers: DEFAULT_IGNORED_USERS, deliveryMode: 'source', selectedPlatforms: ['twitch'],
  raidTemplate: 'Thank you {displayName} for the raid with {viewers} viewers! They stream {category}. Watch them at {channelUrl}',
  twitchFirstChatTemplate: 'Go watch {displayName} streaming {category}: {channelUrl}',
  twitchViewerWelcomeTemplate: 'Welcome to the stream, {displayName}! Thanks for joining us on Twitch.',
  twitchViewerWelcomeAlternates: ['Glad you made it, {displayName}! Welcome to the Twitch side of the village.', 'Hey {displayName}! Settle in and enjoy the stream with us.', 'A new Villager has arrived! Welcome in, {displayName}.'],
  youtubeWelcomeTemplate: 'Welcome to the stream, {displayName}! Thanks for joining us on YouTube.',
  youtubeWelcomeAlternates: ['Glad you found the village, {displayName}! Welcome to the YouTube stream.', 'Hey {displayName}! Thanks for spending some time with us on YouTube.', 'Welcome in, {displayName}! The village is happy to have you here.'],
  kickWelcomeTemplate: 'Welcome to the stream, {displayName}! Thanks for joining us on Kick.',
  kickWelcomeAlternates: ['Glad you made it, {displayName}! Welcome to the Kick side of the village.', 'Hey {displayName}! Pull up a seat and enjoy the Kick stream.', 'A new Villager has arrived on Kick! Welcome, {displayName}.'],
  tiktokWelcomeTemplate: 'Welcome, {displayName}! Thanks for joining the TikTok live.',
  tiktokWelcomeAlternates: ['Hey {displayName}! Welcome to the village on TikTok LIVE.', 'Glad you found us, {displayName}! Enjoy the TikTok LIVE.', 'Welcome in, {displayName}! Thanks for joining the village.'],
  manualTwitchTemplate: 'Go watch {displayName} streaming {category}: {channelUrl}',
  manualChannelTemplate: 'Go check out {displayName} at {channelUrl} and show them some love!',
  globalCooldownSeconds: 30, userCooldownMinutes: 60, onePerStream: true,
  maximumQueueSize: 10, queueExpiryMinutes: 10, twitchShoutoutMode: 'text',
  showOverlayCard: true, overlayPlatforms: PLATFORMS, twitchVisualTriggers: ['raid', 'first-chat', 'manual'], twitchVisualType: 'profile-card',
  overlayCardTemplate: 'Go show {displayName} some love! They stream {category}. {channelUrl}', overlayDurationSeconds: 10,
});

function settingsFor(context) {
  return { ...FALLBACKS, ...(context.settings ?? {}) };
}

function cleanText(value, maximum = 300) {
  const normalized = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '';
  return [...normalized].slice(0, maximum).join('');
}

function cleanUserName(value) {
  return cleanText(value, 256).replace(/^@+/u, '');
}

export function displayNameForPresentation(user) {
  const characters = [...cleanUserName(user?.displayName || user?.name).toLocaleLowerCase('en-US')];
  if (characters.length === 0) return '';
  return `${characters[0]?.toLocaleUpperCase('en-US') ?? ''}${characters.slice(1).join('')}`;
}

function platformOf(value) {
  return PLATFORMS.includes(value) ? value : undefined;
}

export function viewerKey(platform, user) {
  return viewerKeys(platform, user)[0];
}

// Keep both provider ID and normalized login as durable aliases. Some relays can omit or change
// the ID field between messages; reserving both aliases gives every platform the requested
// first-message 0/1 gate without letting that transport drift create another welcome.
export function viewerKeys(platform, user) {
  const id = cleanText(user?.id, 256);
  const name = cleanUserName(user?.name).toLocaleLowerCase('en-US');
  return [...new Set([
    ...(id ? [`${platform}:id:${id}`] : []),
    ...(name ? [`${platform}:name:${name}`] : []),
  ])];
}

function aliasesOverlap(left, right) { return left.some((key) => right.includes(key)); }
function candidateAliases(candidate) { return viewerKeys(candidate.platform, candidate.user); }
function stateHasAlias(values, aliases) { return aliases.some((key) => values.includes(key)); }
function latestAliasCooldown(entries, aliases) { return Math.max(0, ...entries.filter((entry) => aliases.includes(entry.key)).map((entry) => entry.at)); }
function queueHasAliases(queue, aliases) { return queue.some((item) => aliasesOverlap(candidateAliases(item), aliases)); }

function normalizedRule(rule) {
  return cleanText(rule, 300).toLocaleLowerCase('en-US');
}

export function matchesViewerRule(rule, platform, user) {
  const expected = normalizedRule(rule);
  const name = cleanUserName(user?.name).toLocaleLowerCase('en-US');
  const displayName = cleanUserName(user?.displayName).toLocaleLowerCase('en-US');
  const id = cleanText(user?.id, 256).toLocaleLowerCase('en-US');
  if (!expected) return false;
  if (expected === name || expected === displayName) return true;
  if (expected === `${platform}:${name}` || (displayName && expected === `${platform}:${displayName}`)) return true;
  return Boolean(id) && expected === `${platform}:id:${id}`;
}

export function channelUrl(platform, user) {
  const name = cleanUserName(user?.name);
  const id = cleanText(user?.id, 256);
  if (platform === 'twitch') return `https://twitch.tv/${encodeURIComponent(name.toLocaleLowerCase('en-US'))}`;
  if (platform === 'youtube') return id ? `https://youtube.com/channel/${encodeURIComponent(id)}` : `https://youtube.com/@${encodeURIComponent(name)}`;
  if (platform === 'kick') return `https://kick.com/${encodeURIComponent(name.toLocaleLowerCase('en-US'))}`;
  if (platform === 'tiktok') return `https://tiktok.com/@${encodeURIComponent(name)}`;
  return '';
}

export function renderTemplate(template, candidate) {
  const tokens = {
    '{displayName}': displayNameForPresentation(candidate.user),
    '{user}': candidate.user.name,
    '{platform}': candidate.platform,
    '{channelUrl}': channelUrl(candidate.platform, candidate.user),
    '{category}': candidate.category || '',
    '{viewers}': String(candidate.viewers ?? 0),
    '{trigger}': candidate.trigger,
  };
  let result = cleanText(template, 1000);
  for (const [token, replacement] of Object.entries(tokens)) result = result.split(token).join(cleanText(replacement, 500));
  return cleanText(result, 1000);
}

function sanitizeTimestamp(value) { return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0; }

function sanitizeCandidate(value) {
  const platform = platformOf(value?.platform);
  const name = cleanUserName(value?.user?.name);
  if (!platform || !name || !['raid', 'first-chat', 'manual'].includes(value?.trigger)) return undefined;
  return {
    id: cleanText(value.id, 100) || `${platform}-${Date.now()}`,
    platform, trigger: value.trigger,
    user: {
      ...(cleanText(value.user.id, 256) ? { id: cleanText(value.user.id, 256) } : {}),
      name,
      ...(cleanText(value.user.displayName, 256) ? { displayName: cleanText(value.user.displayName, 256) } : {}),
      ...(cleanText(value.user.avatarUrl, 2048).startsWith('https://') ? { avatarUrl: cleanText(value.user.avatarUrl, 2048) } : {}),
    },
    viewers: Number.isInteger(value.viewers) && value.viewers >= 0 ? value.viewers : 0,
    ...(cleanText(value.category, 140) ? { category: cleanText(value.category, 140) } : {}),
    ...(value.categoryVerified === true ? { categoryVerified: true } : {}),
    ...(value.firstMessageEver === true ? { firstMessageEver: true } : {}),
    ...(cleanText(value.welcomeTemplate, 1000) ? { welcomeTemplate: cleanText(value.welcomeTemplate, 1000) } : {}),
    eligibleAt: sanitizeTimestamp(value.eligibleAt),
    queuedAt: sanitizeTimestamp(value.queuedAt) || Date.now(),
  };
}

function sanitizeEntries(value, maximum) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => entry && typeof entry.key === 'string' && Number.isFinite(entry.at)).slice(-maximum).map((entry) => ({ key: cleanText(entry.key, 600), at: sanitizeTimestamp(entry.at) }));
}

function sanitizeState(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    queue: (Array.isArray(source.queue) ? source.queue.map(sanitizeCandidate).filter(Boolean) : []).slice(0, 20),
    pendingLookups: (Array.isArray(source.pendingLookups) ? source.pendingLookups.map(sanitizeCandidate).filter(Boolean) : []).slice(-20),
    firstChatSeen: Array.isArray(source.firstChatSeen) ? source.firstChatSeen.filter((item) => typeof item === 'string').map((item) => cleanText(item, 600)).slice(-500) : [],
    welcomeDay: cleanText(source.welcomeDay, 20),
    welcomedUsers: Array.isArray(source.welcomedUsers) ? source.welcomedUsers.filter((item) => typeof item === 'string').map((item) => cleanText(item, 600)).slice(-2_000) : [],
    sentUsers: Array.isArray(source.sentUsers) ? source.sentUsers.filter((item) => typeof item === 'string').map((item) => cleanText(item, 600)).slice(-500) : [],
    connectedAccountIds: Array.isArray(source.connectedAccountIds) ? [...new Set(source.connectedAccountIds.filter((item) => typeof item === 'string').map((item) => cleanText(item, 600)).filter(Boolean))].slice(-100) : [],
    connectedAccountNames: Array.isArray(source.connectedAccountNames) ? [...new Set(source.connectedAccountNames.filter((item) => typeof item === 'string').map((item) => cleanUserName(item).toLocaleLowerCase('en-US')).filter(Boolean))].slice(-100) : [],
    userCooldowns: sanitizeEntries(source.userCooldowns, 500), nativeUserCooldowns: sanitizeEntries(source.nativeUserCooldowns, 500),
    onlinePlatforms: Array.isArray(source.onlinePlatforms) ? [...new Set(source.onlinePlatforms.map(platformOf).filter(Boolean))] : [],
    lastSentAt: sanitizeTimestamp(source.lastSentAt), lastNativeAt: sanitizeTimestamp(source.lastNativeAt), lastChatAt: sanitizeTimestamp(source.lastChatAt), session: cleanText(source.session, 100),
  };
}

function eventUser(event) {
  if (!event?.user || event.user.actorType === 'bot' || event.user.actorType === 'system') return undefined;
  const name = cleanUserName(event.user.name);
  if (!name) return undefined;
  return { ...(event.user.id ? { id: event.user.id } : {}), name, ...(event.user.displayName ? { displayName: event.user.displayName } : {}), ...(event.user.avatarUrl ? { avatarUrl: event.user.avatarUrl } : {}) };
}

function isIgnored(settings, platform, user) { return settings.ignoredUsers.some((rule) => matchesViewerRule(rule, platform, user)); }

function connectedIdKey(platform, value) {
  const id = cleanText(value, 256);
  return id ? `${platform}:id:${id}` : '';
}

function connectedNames(user) {
  return [...new Set([cleanUserName(user?.name), cleanUserName(user?.displayName)].map((item) => item.toLocaleLowerCase('en-US')).filter(Boolean))];
}

function eventMarksConnectedAccount(event) {
  const roles = Array.isArray(event?.user?.roles) ? event.user.roles.map((role) => cleanText(String(role), 64).toLocaleLowerCase('en-US')) : [];
  return event?.payload?.fromConnectedAccount === true || roles.includes('broadcaster');
}

function learnConnectedAccounts(state, event) {
  const platform = platformOf(event?.platform);
  if (!platform) return false;
  const ids = new Set(state.connectedAccountIds);
  const names = new Set(state.connectedAccountNames);
  const addId = (value) => { const key = connectedIdKey(platform, value); if (key) ids.add(key); };
  const addName = (value) => { const name = cleanUserName(value).toLocaleLowerCase('en-US'); if (name && !PLATFORMS.includes(name) && name !== 'system') names.add(name); };
  addId(event.channel?.id);
  addName(event.channel?.name);
  for (const value of Array.isArray(event.payload?.connectedAccountIds) ? event.payload.connectedAccountIds : []) addId(value);
  for (const value of Array.isArray(event.payload?.connectedAccountNames) ? event.payload.connectedAccountNames : []) addName(value);
  if (eventMarksConnectedAccount(event) && event.user) {
    addId(event.user.id);
    addName(event.user.name);
    addName(event.user.displayName);
  }
  const nextIds = [...ids].slice(-100);
  const nextNames = [...names].slice(-100);
  const changed = nextIds.length !== state.connectedAccountIds.length || nextNames.length !== state.connectedAccountNames.length;
  state.connectedAccountIds = nextIds;
  state.connectedAccountNames = nextNames;
  return changed;
}

export function isConnectedAutomaticAccount(event, settingsValue = {}, stateValue = {}) {
  const settings = { ...FALLBACKS, ...settingsValue };
  if (settings.ignoreConnectedAccounts === false || !event?.user) return false;
  if (eventMarksConnectedAccount(event)) return true;
  const state = sanitizeState(stateValue);
  const platform = platformOf(event.platform);
  if (!platform) return false;
  const idKey = connectedIdKey(platform, event.user.id);
  if (idKey && state.connectedAccountIds.includes(idKey)) return true;
  return connectedNames(event.user).some((name) => state.connectedAccountNames.includes(name));
}

function candidateIsConnected(settings, state, candidate) {
  if (candidate.trigger === 'manual' || settings.ignoreConnectedAccounts === false) return false;
  const idKey = connectedIdKey(candidate.platform, candidate.user?.id);
  if (idKey && state.connectedAccountIds.includes(idKey)) return true;
  return connectedNames(candidate.user).some((name) => state.connectedAccountNames.includes(name));
}
function isAllowedFirstChat(settings, platform, user) {
  return settings.firstChatAudience !== 'allowlist-only' || settings.firstChatAllowlist.some((rule) => matchesViewerRule(rule, platform, user));
}

export function localDayKey(timeZone, now = Date.now()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: cleanText(timeZone, 80) || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now));
    const part = (type) => parts.find((item) => item.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch { return new Date(now).toISOString().slice(0, 10); }
}

function normalizeHost(value) {
  try { return new URL(/^https?:\/\//iu.test(value) ? value : `https://${value}`).hostname.toLocaleLowerCase('en-US').replace(/^www\./u, ''); }
  catch { return ''; }
}

function domainMatches(host, blocked) { return host === blocked || host.endsWith(`.${blocked}`); }

export function welcomeSafetyVerdict(event, settingsValue = {}, stateValue = {}) {
  const settings = { ...FALLBACKS, ...settingsValue };
  const user = eventUser(event);
  if (!user) return { accepted: false, reason: 'non-human-actor' };
  if (isIgnored(settings, event.platform, user)) return { accepted: false, reason: 'ignored-account' };
  if (isConnectedAutomaticAccount(event, settings, stateValue)) return { accepted: false, reason: 'connected-account' };
  const mode = ['open', 'balanced', 'strict'].includes(settings.welcomeSafetyMode) ? settings.welcomeSafetyMode : 'balanced';
  if (settings.welcomeRequireStableId !== false && !cleanText(user.id, 256)) return { accepted: false, reason: 'missing-stable-id' };
  const message = cleanText(event.payload?.message, 1_000);
  if (!message) return { accepted: false, reason: 'empty-message' };
  const lowered = message.toLocaleLowerCase('en-US');
  const blockedTerm = (Array.isArray(settings.welcomeBlockedTerms) ? settings.welcomeBlockedTerms : []).some((term) => lowered.includes(cleanText(term, 120).toLocaleLowerCase('en-US')));
  if (blockedTerm) return { accepted: false, reason: 'blocked-term' };
  const urls = message.match(/(?:https?:\/\/|www\.)[^\s]+/giu) ?? [];
  const hosts = urls.map(normalizeHost).filter(Boolean);
  const blockedDomain = (Array.isArray(settings.welcomeBlockedDomains) ? settings.welcomeBlockedDomains : []).map(normalizeHost).filter(Boolean).some((domain) => hosts.some((host) => domainMatches(host, domain)));
  if (blockedDomain) return { accepted: false, reason: 'blocked-domain' };
  if (mode !== 'open' && settings.welcomeRejectLinks !== false && urls.length > 0) return { accepted: false, reason: 'link-in-first-message' };
  if (mode !== 'open' && /(.)\1{7,}/iu.test(message)) return { accepted: false, reason: 'repeated-characters' };
  if (mode === 'strict' && ([...message].length > 280 || !/[\p{L}\p{N}]/u.test(message))) return { accepted: false, reason: 'strict-message-shape' };
  return { accepted: true, reason: 'accepted' };
}

function welcomeTemplates(settings, platform) {
  const primary = platform === 'twitch' ? settings.twitchViewerWelcomeTemplate : platform === 'youtube' ? settings.youtubeWelcomeTemplate : platform === 'kick' ? settings.kickWelcomeTemplate : settings.tiktokWelcomeTemplate;
  const alternates = platform === 'twitch' ? settings.twitchViewerWelcomeAlternates : platform === 'youtube' ? settings.youtubeWelcomeAlternates : platform === 'kick' ? settings.kickWelcomeAlternates : settings.tiktokWelcomeAlternates;
  return [...new Set([primary, ...(Array.isArray(alternates) ? alternates : [])].map((item) => cleanText(item, 1000)).filter(Boolean))];
}

function chooseWelcomeTemplate(settings, candidate) {
  const templates = welcomeTemplates(settings, candidate.platform);
  if (templates.length === 0) return '';
  let hash = 2166136261;
  for (const character of `${candidate.id}|${viewerKey(candidate.platform, candidate.user)}`) { hash ^= character.codePointAt(0) ?? 0; hash = Math.imul(hash, 16777619); }
  return templates[(hash >>> 0) % templates.length];
}

function templateFor(settings, candidate) {
  if (candidate.trigger === 'raid') return settings.raidTemplate;
  if (candidate.trigger === 'manual') return candidate.platform === 'twitch' ? settings.manualTwitchTemplate : settings.manualChannelTemplate;
  if (candidate.platform === 'twitch' && candidate.category) return settings.twitchFirstChatTemplate;
  return candidate.welcomeTemplate || chooseWelcomeTemplate(settings, candidate);
}

function codePoints(value) { return [...value]; }

export function fitMessageToPlatforms(message, candidate, platforms) {
  const destinations = platforms.length > 0 ? platforms : [candidate.platform];
  const maximum = Math.min(...destinations.map((platform) => PLATFORM_MESSAGE_LIMITS[platform]));
  if (codePoints(message).length <= maximum) return message;
  const url = channelUrl(candidate.platform, candidate.user);
  if (url && message.includes(url) && codePoints(url).length + 3 < maximum) {
    const prefix = cleanText(message.slice(0, message.indexOf(url)), 1000);
    const available = maximum - codePoints(url).length - 2;
    const clipped = codePoints(prefix).slice(0, Math.max(1, available - 1)).join('').trimEnd();
    return `${clipped}… ${url}`;
  }
  return `${codePoints(message).slice(0, Math.max(1, maximum - 1)).join('').trimEnd()}…`;
}

let scheduledDrain;
let stopped = false;
let operation = Promise.resolve();

function cancelDrain(context) {
  if (scheduledDrain !== undefined) context.schedule.cancel(scheduledDrain);
  scheduledDrain = undefined;
}

function serialize(task) {
  operation = operation.then(task, task);
  return operation;
}

async function preview(candidate, message, context, settings) {
  if (!settings.showOverlayCard || !settings.overlayPlatforms.includes(candidate.platform)) return;
  const isWelcome = candidate.trigger === 'first-chat' && !candidate.category;
  const cardText = isWelcome ? message : renderTemplate(settings.overlayCardTemplate, candidate) || message;
  try {
    await context.overlay.publish(`${context.moduleId}.card.show`, {
      cardKind: 'shoutout-spotlight', trigger: candidate.trigger, presentation: isWelcome ? 'welcome' : 'creator', platform: candidate.platform,
      creator: {
        displayName: displayNameForPresentation(candidate.user), userName: candidate.user.name,
        category: candidate.category || '', channelUrl: channelUrl(candidate.platform, candidate.user),
        avatarUrl: candidate.user.avatarUrl || '', viewers: candidate.viewers ?? 0,
      },
      title: isWelcome ? `Welcome ${displayNameForPresentation(candidate.user)}` : `Meet ${displayNameForPresentation(candidate.user)} on ${PLATFORM_LABELS[candidate.platform]}`,
      text: cardText,
      ...(candidate.user.avatarUrl ? { imageUrl: candidate.user.avatarUrl } : {}),
      durationMs: settings.overlayDurationSeconds * 1000,
    }, { lane: 'foreground' });
  } catch { /* A closed optional overlay must never stop chat processing. */ }
}

function scheduleDrain(context, delayMs) {
  cancelDrain(context);
  scheduledDrain = context.schedule.after(Math.max(1_000, Math.min(86_400_000, Math.ceil(delayMs))), () => {
    scheduledDrain = undefined;
    return serialize(() => drain(context));
  });
}

async function enqueueReady(candidate, event, context) {
  const settings = settingsFor(context);
  const rendered = renderTemplate(templateFor(settings, candidate), candidate);
  const destinations = settings.deliveryMode === 'source' ? [candidate.platform] : settings.selectedPlatforms;
  const message = fitMessageToPlatforms(rendered, candidate, destinations);
  if (!message) return;
  if (event.metadata?.simulated === true) { await preview(candidate, message, context, settings); return; }
  const state = sanitizeState(await context.state.read());
  const aliases = viewerKeys(candidate.platform, candidate.user);
  const now = Date.now();
  if (isIgnored(settings, candidate.platform, candidate.user)) return;
  if (candidateIsConnected(settings, state, candidate)) return;
  if (candidate.trigger === 'first-chat') {
    const day = localDayKey(settings.welcomeTimeZone, now);
    if (state.welcomeDay !== day) { state.welcomeDay = day; state.welcomedUsers = []; }
    if (stateHasAlias(state.welcomedUsers, aliases)) { await context.state.write(state); return; }
  }
  if (settings.onePerStream && stateHasAlias(state.sentUsers, aliases)) return;
  const lastUser = latestAliasCooldown(state.userCooldowns, aliases);
  if (now - lastUser < settings.userCooldownMinutes * 60_000) return;
  if (queueHasAliases(state.queue, aliases)) return;
  if (state.queue.length >= settings.maximumQueueSize) return;
  if (candidate.trigger === 'first-chat') state.welcomedUsers = [...new Set([...state.welcomedUsers, ...aliases])].slice(-2_000);
  state.queue.push({ ...candidate, eligibleAt: candidate.eligibleAt || (candidate.trigger === 'first-chat' ? now + settings.welcomeDelaySeconds * 1_000 : now) });
  await context.state.write(state);
  await drain(context);
}

async function requestTwitchCreator(candidate, event, context) {
  const settings = settingsFor(context);
  if (event.metadata?.simulated === true) {
    // Offline fixtures may supply a category explicitly for visual testing, but a simulation may
    // never call Twitch or claim an unverified viewer is a creator.
    if (candidate.category || candidate.trigger === 'first-chat') {
      const previewCandidate = { ...candidate, categoryVerified: true };
      await preview(previewCandidate, fitMessageToPlatforms(renderTemplate(templateFor(settings, previewCandidate), previewCandidate), previewCandidate, ['twitch']), context, settings);
    }
    return;
  }
  if (!context.approvedActionIds.includes(LOOKUP_TWITCH_CREATOR_ACTION_ID)) return;
  const state = sanitizeState(await context.state.read());
  const cutoff = Date.now() - settings.queueExpiryMinutes * 60_000;
  state.pendingLookups = state.pendingLookups.filter((item) => item.queuedAt >= cutoff);
  const aliases = viewerKeys('twitch', candidate.user);
  const lastUser = latestAliasCooldown(state.userCooldowns, aliases);
  if (isIgnored(settings, 'twitch', candidate.user)
      || candidateIsConnected(settings, state, candidate)
      || (settings.onePerStream && stateHasAlias(state.sentUsers, aliases))
      || Date.now() - lastUser < settings.userCooldownMinutes * 60_000
      || queueHasAliases(state.queue, aliases)) {
    await context.state.write(state);
    return;
  }
  if (queueHasAliases(state.pendingLookups, aliases)) { await context.state.write(state); return; }
  state.pendingLookups.push(candidate);
  await context.state.write(state);
  try {
    await context.streamerbot.runApprovedAction(LOOKUP_TWITCH_CREATOR_ACTION_ID, {
      lookupId: candidate.id,
      targetUserName: candidate.user.name,
      ...(candidate.user.id ? { targetUserId: candidate.user.id } : {}),
    });
  } catch {
    const latest = sanitizeState(await context.state.read());
    latest.pendingLookups = latest.pendingLookups.filter((item) => item.id !== candidate.id);
    await context.state.write(latest);
  }
}

async function considerCandidate(candidate, event, context) {
  if (candidate.platform === 'twitch' && !candidate.category) return requestTwitchCreator(candidate, event, context);
  return enqueueReady(candidate, event, context);
}

async function handleTwitchProfile(event, context) {
  const lookupId = cleanText(event.payload?.lookupId, 100);
  const category = cleanText(event.payload?.category, 140);
  if (!lookupId) return;
  const state = sanitizeState(await context.state.read());
  const candidate = state.pendingLookups.find((item) => item.id === lookupId);
  state.pendingLookups = state.pendingLookups.filter((item) => item.id !== lookupId);
  await context.state.write(state);
  if (!candidate) return;
  // A category is required for raids and manual promotions. A safety-approved daily first chatter
  // without one receives a viewer welcome instead of being presented as a streamer.
  if (!category && candidate.trigger !== 'first-chat') return;
  const profileImageUrl = cleanText(event.payload?.profileImageUrl, 2048);
  const enriched = {
    ...candidate,
    categoryVerified: true,
    ...(category ? { category } : {}),
    user: { ...candidate.user, ...(profileImageUrl.startsWith('https://') ? { avatarUrl: profileImageUrl } : {}) },
  };
  await enqueueReady(enriched, event, context);
}

async function sendCandidate(candidate, context, settings, state) {
  const rendered = renderTemplate(templateFor(settings, candidate), candidate);
  const aliases = viewerKeys(candidate.platform, candidate.user);
  const key = viewerKey(candidate.platform, candidate.user);
  let nativeSucceeded = false;
  const wantsNative = candidate.platform === 'twitch' && settings.twitchShoutoutMode !== 'text';
  const nativeReady = Date.now() - state.lastNativeAt >= NATIVE_GLOBAL_COOLDOWN_MS && Date.now() - (state.nativeUserCooldowns.find((entry) => entry.key === key)?.at ?? 0) >= NATIVE_USER_COOLDOWN_MS;
  if (wantsNative && nativeReady && context.approvedActionIds.includes(NATIVE_TWITCH_SHOUTOUT_ACTION_ID)) {
    state.lastNativeAt = Date.now();
    state.nativeUserCooldowns = [...state.nativeUserCooldowns.filter((entry) => entry.key !== key), { key, at: state.lastNativeAt }].slice(-500);
    await context.state.write(state); // Reserve the native cooldown before external execution to prevent duplicate API calls after a crash.
    try {
      await context.streamerbot.runApprovedAction(NATIVE_TWITCH_SHOUTOUT_ACTION_ID, {
        targetUserName: candidate.user.name, ...(candidate.user.id ? { targetUserId: candidate.user.id } : {}), simulated: false,
      });
      nativeSucceeded = true;
    } catch { /* Text fallback below keeps the shoutout useful if Twitch or Streamer.bot rejects it. */ }
  }

  const suppressTwitchText = candidate.platform === 'twitch' && settings.twitchShoutoutMode === 'native' && nativeSucceeded;
  let routing = settings.deliveryMode;
  let selectedPlatforms = [...settings.selectedPlatforms];
  if (routing === 'selected' && suppressTwitchText) selectedPlatforms = selectedPlatforms.filter((platform) => platform !== 'twitch');
  const shouldSendText = routing === 'source' ? !suppressTwitchText : selectedPlatforms.length > 0;
  const destinations = routing === 'source' ? [candidate.platform] : selectedPlatforms;
  const message = fitMessageToPlatforms(rendered, candidate, destinations);
  if (shouldSendText) {
    await context.chat.send(routing === 'source'
      ? { message, routing: 'source', sourcePlatform: candidate.platform, overflow: 'reject' }
      : { message, routing: 'selected', selectedPlatforms, overflow: 'reject' });
  }
  if (settings.showOverlayCard && settings.overlayPlatforms.includes(candidate.platform) && settings.twitchVisualTriggers.includes(candidate.trigger)) await preview(candidate, message, context, settings);
}

async function drain(context) {
  if (stopped) return;
  cancelDrain(context);
  const settings = settingsFor(context);
  if (!settings.enabled) return;
  const state = sanitizeState(await context.state.read());
  const now = Date.now();
  state.queue = state.queue.filter((candidate) => now - candidate.queuedAt <= settings.queueExpiryMinutes * 60_000);
  state.queue = state.queue.filter((candidate) => !candidateIsConnected(settings, state, candidate));
  if (state.queue.length === 0) { await context.state.write(state); return; }
  const waitMs = Math.max(settings.globalCooldownSeconds * 1000 - (now - state.lastSentAt), (state.queue[0]?.eligibleAt ?? 0) - now);
  if (waitMs > 0) { await context.state.write(state); scheduleDrain(context, waitMs); return; }
  const candidate = state.queue.shift();
  const aliases = viewerKeys(candidate.platform, candidate.user);
  state.lastSentAt = now;
  state.userCooldowns = [...state.userCooldowns.filter((entry) => !aliases.includes(entry.key)), ...aliases.map((key) => ({ key, at: now }))].slice(-500);
  state.sentUsers = [...new Set([...state.sentUsers, ...aliases])].slice(-500);
  await context.state.write(state); // At-most-once: reserve and dequeue before any external call.
  try { await sendCandidate(candidate, context, settings, state); } catch { /* Cosmetic failure is consumed rather than replayed into chat. */ }
  const refreshed = sanitizeState(await context.state.read());
  if (refreshed.queue.length > 0) scheduleDrain(context, settings.globalCooldownSeconds * 1000);
}

async function handleLifecycle(event, context) {
  const platform = platformOf(event.platform);
  if (!platform) return;
  const state = sanitizeState(await context.state.read());
  if (event.eventType === 'stream.online') {
    if (state.onlinePlatforms.length === 0) {
      state.session = event.receivedAt;
      state.sentUsers = [];
    }
    state.onlinePlatforms = [...new Set([...state.onlinePlatforms, platform])];
  } else state.onlinePlatforms = state.onlinePlatforms.filter((item) => item !== platform);
  await context.state.write(state);
}

async function handleEvent(event, context) {
  const settings = settingsFor(context);
  if (!settings.enabled) return;
  const identityState = sanitizeState(await context.state.read());
  if (learnConnectedAccounts(identityState, event)) await context.state.write(identityState);
  if (event.eventType === TWITCH_PROFILE_EVENT) return handleTwitchProfile(event, context);
  if (event.eventType === 'stream.online' || event.eventType === 'stream.offline') return handleLifecycle(event, context);
  const platform = platformOf(event.platform);
  if (!platform || !settings.enabledPlatforms.includes(platform)) return;
  if (event.eventType === 'channel.raid' && settings.triggerOnRaids) {
    const user = eventUser(event);
    const viewers = Number(event.payload?.quantity ?? 0);
    if (platform === 'twitch' && user && Number.isInteger(viewers) && viewers >= settings.minimumRaidViewers) {
      await considerCandidate({ id: event.eventId, platform, trigger: 'raid', user, viewers, ...(cleanText(event.payload?.category, 140) ? { category: cleanText(event.payload.category, 140) } : {}), queuedAt: Date.now() }, event, context);
    }
    return;
  }
  if (event.eventType === 'chat.message' && settings.triggerOnFirstChat) {
    const user = eventUser(event);
    if (!user) return;
    const state = sanitizeState(await context.state.read());
    const now = Date.now();
    const day = localDayKey(settings.welcomeTimeZone, now);
    if (state.welcomeDay !== day) { state.welcomeDay = day; state.welcomedUsers = []; state.firstChatSeen = []; }
    state.lastChatAt = now;
    const aliases = viewerKeys(platform, user);
    if (stateHasAlias(state.welcomedUsers, aliases) || queueHasAliases(state.pendingLookups, aliases) || queueHasAliases(state.queue, aliases)) { await context.state.write(state); return; }
    await context.state.write(state);
    if (!isAllowedFirstChat(settings, platform, user) || welcomeSafetyVerdict(event, settings, state).accepted !== true) return;
    const draft = {
      id: event.eventId, platform, trigger: 'first-chat', user, viewers: 0,
      ...(platform === 'twitch' && event.payload?.firstMessage === true ? { firstMessageEver: true } : {}),
      queuedAt: now, eligibleAt: now + settings.welcomeDelaySeconds * 1_000,
    };
    await considerCandidate({ ...draft, welcomeTemplate: chooseWelcomeTemplate(settings, draft) }, event, context);
    return;
  }
  if (event.eventType === 'command.received' && settings.triggerOnManualCommand) {
    if (cleanText(event.payload?.command, 64).toLocaleLowerCase('en-US') !== settings.manualCommandName) return;
    const roles = Array.isArray(event.user?.roles) ? event.user.roles.map((role) => String(role).toLocaleLowerCase('en-US')) : [];
    if (!roles.includes('moderator') && !roles.includes('broadcaster')) return;
    const targetName = cleanUserName(Array.isArray(event.payload?.arguments) ? event.payload.arguments[0] : '');
    if (!targetName) return;
    await considerCandidate({ id: event.eventId, platform, trigger: 'manual', user: { name: targetName, displayName: targetName }, viewers: 0, queuedAt: Date.now() }, event, context);
  }
}

export default {
  manifest, required: false,
  async start(context) { stopped = false; operation = Promise.resolve(); await serialize(() => drain(context)); },
  async stop(context) { stopped = true; cancelDrain(context); await operation; },
  async onEvent(event, context) { await serialize(() => handleEvent(event, context)); },
};
