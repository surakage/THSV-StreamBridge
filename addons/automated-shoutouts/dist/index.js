// Automated Shoutouts is intentionally event-driven: it consumes StreamBridge's normalized
// events and uses only brokered chat, overlay, action, scheduler, and private-state capabilities.
const NATIVE_TWITCH_SHOUTOUT_ACTION_ID = 'c84fdb40-d06f-5b0a-9ddf-f6d21c68922e';
const LOOKUP_TWITCH_CREATOR_ACTION_ID = 'e3d92d7e-193a-5bba-8b8c-4f17e605c9d2';
const TWITCH_PROFILE_EVENT = 'addon.thsv.automated-shoutouts.twitch-profile-received';
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok']);
const PLATFORM_MESSAGE_LIMITS = Object.freeze({ twitch: 500, youtube: 200, kick: 500, tiktok: 150 });
const NATIVE_GLOBAL_COOLDOWN_MS = 120_000;
const NATIVE_USER_COOLDOWN_MS = 3_600_000;

const manifest = {
  contractVersion: '2.0.0-preview.1',
  moduleId: 'thsv.automated-shoutouts',
  name: 'Automated Shoutouts',
  version: '1.0.0',
  minimumCoreVersion: '2.0.0-preview.1',
  maximumTestedCoreVersion: '2.0.0-preview.1',
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
    'In Command Sync, create the configured shoutout command (recommended aliases: so and shoutout) with Moderator permission.',
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
  triggerOnFirstChat: false, firstChatResetHours: 12, firstChatAllowlist: [], triggerOnManualCommand: true,
  manualCommandName: 'shoutout', ignoredUsers: [], deliveryMode: 'source', selectedPlatforms: ['twitch'],
  raidTemplate: 'Thank you {displayName} for the raid with {viewers} viewers! They stream {category}. Watch them at {channelUrl}',
  twitchFirstChatTemplate: 'Go watch {displayName} streaming {category}: {channelUrl}',
  twitchViewerWelcomeTemplate: 'Welcome to the stream, {displayName}! Thanks for joining us on Twitch.',
  youtubeWelcomeTemplate: 'Welcome to the stream, {displayName}! Thanks for joining us on YouTube.',
  kickWelcomeTemplate: 'Welcome to the stream, {displayName}! Thanks for joining us on Kick.',
  tiktokWelcomeTemplate: 'Welcome, {displayName}! Thanks for joining the TikTok live.',
  manualTwitchTemplate: 'Go watch {displayName} streaming {category}: {channelUrl}',
  manualChannelTemplate: 'Go check out {displayName} at {channelUrl} and show them some love!',
  globalCooldownSeconds: 30, userCooldownMinutes: 60, onePerStream: true,
  maximumQueueSize: 10, queueExpiryMinutes: 10, twitchShoutoutMode: 'text',
  showOverlayCard: true, overlayDurationSeconds: 10,
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

function platformOf(value) {
  return PLATFORMS.includes(value) ? value : undefined;
}

export function viewerKey(platform, user) {
  const id = cleanText(user?.id, 256);
  const name = cleanUserName(user?.name).toLocaleLowerCase('en-US');
  return `${platform}:${id ? `id:${id}` : `name:${name}`}`;
}

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
    '{displayName}': candidate.user.displayName || candidate.user.name,
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
    sentUsers: Array.isArray(source.sentUsers) ? source.sentUsers.filter((item) => typeof item === 'string').map((item) => cleanText(item, 600)).slice(-500) : [],
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
function isAllowedFirstChat(settings, platform, user) { return settings.firstChatAllowlist.some((rule) => matchesViewerRule(rule, platform, user)); }

function templateFor(settings, candidate) {
  if (candidate.trigger === 'raid') return settings.raidTemplate;
  if (candidate.trigger === 'manual') return candidate.platform === 'twitch' ? settings.manualTwitchTemplate : settings.manualChannelTemplate;
  if (candidate.platform === 'twitch') return candidate.category ? settings.twitchFirstChatTemplate : settings.twitchViewerWelcomeTemplate;
  if (candidate.platform === 'youtube') return settings.youtubeWelcomeTemplate;
  if (candidate.platform === 'kick') return settings.kickWelcomeTemplate;
  return settings.tiktokWelcomeTemplate;
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
  if (!settings.showOverlayCard) return;
  try {
    await context.overlay.publish(`${context.moduleId}.card.show`, {
      title: `${candidate.user.displayName || candidate.user.name} · ${candidate.platform}`,
      text: message,
      ...(candidate.user.avatarUrl ? { imageUrl: candidate.user.avatarUrl } : {}),
      durationMs: settings.overlayDurationSeconds * 1000,
    });
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
  const key = viewerKey(candidate.platform, candidate.user);
  const now = Date.now();
  if (isIgnored(settings, candidate.platform, candidate.user)) return;
  if (settings.onePerStream && state.sentUsers.includes(key)) return;
  const lastUser = state.userCooldowns.find((entry) => entry.key === key)?.at ?? 0;
  if (now - lastUser < settings.userCooldownMinutes * 60_000) return;
  if (state.queue.some((item) => viewerKey(item.platform, item.user) === key)) return;
  if (state.queue.length >= settings.maximumQueueSize) return;
  state.queue.push(candidate);
  await context.state.write(state);
  await drain(context);
}

async function requestTwitchCreator(candidate, event, context) {
  const settings = settingsFor(context);
  if (event.metadata?.simulated === true) {
    // Offline fixtures may supply a category explicitly for visual testing, but a simulation may
    // never call Twitch or claim an unverified viewer is a creator.
    if (candidate.category || (candidate.trigger === 'first-chat' && candidate.firstMessageEver === true)) {
      const previewCandidate = { ...candidate, categoryVerified: true };
      await preview(previewCandidate, fitMessageToPlatforms(renderTemplate(templateFor(settings, previewCandidate), previewCandidate), previewCandidate, ['twitch']), context, settings);
    }
    return;
  }
  if (!context.approvedActionIds.includes(LOOKUP_TWITCH_CREATOR_ACTION_ID)) return;
  const state = sanitizeState(await context.state.read());
  const cutoff = Date.now() - settings.queueExpiryMinutes * 60_000;
  state.pendingLookups = state.pendingLookups.filter((item) => item.queuedAt >= cutoff);
  const key = viewerKey('twitch', candidate.user);
  const lastUser = state.userCooldowns.find((entry) => entry.key === key)?.at ?? 0;
  if (isIgnored(settings, 'twitch', candidate.user)
      || (settings.onePerStream && state.sentUsers.includes(key))
      || Date.now() - lastUser < settings.userCooldownMinutes * 60_000
      || state.queue.some((item) => viewerKey(item.platform, item.user) === key)) {
    await context.state.write(state);
    return;
  }
  if (state.pendingLookups.some((item) => viewerKey('twitch', item.user) === key)) { await context.state.write(state); return; }
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
  // A category is required for raids and manual promotions. An allowlisted first-time chatter
  // without one receives the editable viewer welcome instead of being presented as a streamer.
  if (!category && (candidate.trigger !== 'first-chat' || candidate.firstMessageEver !== true)) return;
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
  await preview(candidate, message, context, settings);
}

async function drain(context) {
  if (stopped) return;
  cancelDrain(context);
  const settings = settingsFor(context);
  if (!settings.enabled) return;
  const state = sanitizeState(await context.state.read());
  const now = Date.now();
  state.queue = state.queue.filter((candidate) => now - candidate.queuedAt <= settings.queueExpiryMinutes * 60_000);
  if (state.queue.length === 0) { await context.state.write(state); return; }
  const waitMs = settings.globalCooldownSeconds * 1000 - (now - state.lastSentAt);
  if (waitMs > 0) { await context.state.write(state); scheduleDrain(context, waitMs); return; }
  const candidate = state.queue.shift();
  const key = viewerKey(candidate.platform, candidate.user);
  state.lastSentAt = now;
  state.userCooldowns = [...state.userCooldowns.filter((entry) => entry.key !== key), { key, at: now }].slice(-500);
  state.sentUsers = [...new Set([...state.sentUsers, key])].slice(-500);
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
      state.firstChatSeen = [];
      state.sentUsers = [];
    }
    state.onlinePlatforms = [...new Set([...state.onlinePlatforms, platform])];
  } else state.onlinePlatforms = state.onlinePlatforms.filter((item) => item !== platform);
  await context.state.write(state);
}

async function handleEvent(event, context) {
  const settings = settingsFor(context);
  if (!settings.enabled) return;
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
    // TikFinity's relay does not currently give StreamBridge a reliable live/offline pair. For a
    // TikTok-only setup, a creator-set inactivity window provides an honest reset fallback.
    if (state.onlinePlatforms.length === 0 && state.lastChatAt > 0 && now - state.lastChatAt >= settings.firstChatResetHours * 3_600_000) {
      state.firstChatSeen = [];
      state.sentUsers = [];
      state.session = event.receivedAt;
    }
    state.lastChatAt = now;
    const key = viewerKey(platform, user);
    if (state.firstChatSeen.includes(key)) { await context.state.write(state); return; }
    state.firstChatSeen = [...state.firstChatSeen, key].slice(-500);
    await context.state.write(state);
    if (isAllowedFirstChat(settings, platform, user)) await considerCandidate({
      id: event.eventId, platform, trigger: 'first-chat', user, viewers: 0,
      ...(platform === 'twitch' && event.payload?.firstMessage === true ? { firstMessageEver: true } : {}),
      queuedAt: Date.now(),
    }, event, context);
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
