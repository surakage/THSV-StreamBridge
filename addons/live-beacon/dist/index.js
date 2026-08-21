// Live Beacon validates stream-online signals and dispatches one bounded Discord embed per platform.
// Webhook secrets remain exclusively in its creator-edited Streamer.bot action.
const RESULT_EVENT = 'addon.thsv.live-beacon.delivery-result';
const CONTROL_EVENT = 'addon.thsv.live-beacon.broadcast-control';
const DELIVERY_ACTION_ID = 'b99f5eae-d962-4b71-b2c5-64c19917189f';
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok']);
const DEFAULT_WELCOMES = Object.freeze({
  twitch: "Welcome to the official Twitch live notifications thread!\n\nWhenever {channel} goes live on Twitch, an automatic notification will be posted here with:\n\n🎮 Game being streamed\n📝 Stream title\n🔗 Direct link to the stream\n⏰ Time the stream started\n\nIf Twitch is your preferred platform, keep an eye on this thread so you'll never miss a live stream.\n\nSee you in chat, Villagers! 🌿",
  youtube: 'Welcome to the official YouTube live notifications thread!\n\nEvery YouTube livestream will automatically be announced here with:\n\n🎮 Game or category\n📝 Stream title\n🔗 Watch link\n⏰ Stream start time\n\nSubscribe to the YouTube channel and follow this thread so you never miss a broadcast.',
  kick: 'Welcome to the official Kick live notifications thread!\n\nWhenever {channel} starts streaming on Kick, a notification will automatically appear here containing:\n\n🎮 Game being streamed\n📝 Stream title\n🔗 Direct link to the stream\n⏰ Stream start time\n\nIf you enjoy watching on Kick, this is the place to stay updated.',
  tiktok: 'Welcome to the official TikTok LIVE notifications thread!\n\nWhenever {channel} goes live on TikTok, an automatic notification will be posted here including:\n\n🎮 Stream category\n📝 Live title\n🔗 Join the LIVE\n⏰ Stream start time\n\nPerfect for anyone who prefers watching on TikTok.',
});
const pending = new Map(); let taskId; let stopped = true;
const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: 'thsv.live-beacon', name: 'Live Beacon', version: '4.0.3', minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.3', maximumTestedBridgeVersion: '4.0.3', dependencies: [], requiredCapabilities: [],
  configurationSchema: 'schemas/config.json', eventSubscriptions: ['stream.online', CONTROL_EVENT, RESULT_EVENT], commandsProvided: [], actionsProvided: [{ id: 'live-beacon.broadcast-started', name: 'THSV Addon - Live Beacon - Broadcast Started' }], browserSourcesProvided: [], dataStorageOwned: ['data/addons/thsv.live-beacon/', 'data/addons/.state/thsv.live-beacon/'],
  installationSteps: ['Import the Live Beacon Streamer.bot package.', 'Set the one shared private Discord webhook in Deliver. Advanced creators may manually add a platform-specific webhook argument only when a platform uses a different parent channel or forum.', 'Choose Create for me or Use existing posts. Create for me makes and remembers each permanent post on its first genuine live event; existing mode uses copied Discord Channel IDs.', 'Leave Deliver triggerless. Attach OBS, Meld, or Streamlabs Desktop Streaming Started to Broadcast Started only when selected platforms need a broadcast-app fallback.', 'Approve only its triggerless Deliver action, configure platform links/templates, then enable the add-on.'],
  uninstallationSteps: ['Uninstall the add-on. Its bounded stream deduplication history remains preserved.'], migrations: [], healthChecks: [{ id: 'thsv.live-beacon.runtime', description: 'Confirms verified online events can produce guarded per-platform Discord deliveries.' }],
};
function clean(value, maximum = 500) { return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '')].slice(0, maximum).join(''); }
function cleanMultiline(value, maximum = 1500) { return [...(typeof value === 'string' ? value.replace(/\r\n?/gu, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/gu, ' ').replace(/[ \t]+/gu, ' ').replace(/\n{3,}/gu, '\n\n').trim() : '')].slice(0, maximum).join(''); }
function destinationMode(value, fallback) { return value === 'channel' || value === 'forum' ? value : fallback; }
function settingsFor(context) {
  const raw = context.settings || {}; const sharedDestinationMode = destinationMode(raw.destinationMode, 'channel');
  return {
    enabled: raw.enabled === true,
    platforms: new Set(Array.isArray(raw.platforms) ? raw.platforms.filter((value) => PLATFORMS.includes(value)) : []),
    fallbackPlatforms: new Set(Array.isArray(raw.fallbackPlatforms) ? raw.fallbackPlatforms.filter((value) => PLATFORMS.includes(value)) : ['tiktok']),
    destinationModes: Object.fromEntries(PLATFORMS.map((platform) => [platform, destinationMode(raw[`${platform}DestinationMode`], sharedDestinationMode)])),
    forumThreadIds: Object.fromEntries(PLATFORMS.map((platform) => [platform, /^\d{5,30}$/u.test(clean(raw[`${platform}ForumThreadId`], 30)) ? clean(raw[`${platform}ForumThreadId`], 30) : ''])),
    forumPostSetupMode: raw.forumPostSetupMode === 'existing' ? 'existing' : 'create',
    forumWelcomeMessages: Object.fromEntries(PLATFORMS.map((platform) => [platform, cleanMultiline(raw[`${platform}ForumWelcome`], 1500) || DEFAULT_WELCOMES[platform]])),
    coalesceSeconds: Number.isInteger(raw.coalesceSeconds) ? Math.min(60, Math.max(1, raw.coalesceSeconds)) : 15,
    webhookName: clean(raw.webhookName, 80) || 'THSV Live Beacon',
    roleMentionId: /^\d{5,30}$/u.test(clean(raw.roleMentionId, 30)) ? clean(raw.roleMentionId, 30) : '',
    twitchLogin: platformLogin(raw.twitchLogin, 'twitch'), youtubeChannelUrl: youtubeLiveUrl(raw.youtubeChannelUrl),
    kickLogin: platformLogin(raw.kickLogin, 'kick'), tiktokLogin: platformLogin(raw.tiktokLogin, 'tiktok'),
    messageTemplate: clean(raw.messageTemplate, 1000) || '{platform} is live! Join the stream now.',
  };
}
function safeUrl(value) { try { const url = new URL(clean(value, 500)); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } }
function platformLogin(value, platform) {
  const input = clean(value, 500); if (!input) return '';
  let candidate = input.replace(/^@/u, '');
  try {
    const url = new URL(input); const host = url.hostname.toLowerCase().replace(/^www\./u, '');
    const expected = platform === 'twitch' ? 'twitch.tv' : platform === 'kick' ? 'kick.com' : 'tiktok.com';
    if (url.protocol !== 'https:' || host !== expected) return '';
    candidate = url.pathname.split('/').filter(Boolean)[0] || '';
    if (platform === 'tiktok') candidate = candidate.replace(/^@/u, '');
  } catch { /* Plain logins are preferred and remain supported. */ }
  const pattern = platform === 'twitch' ? /^[A-Za-z0-9_]{1,80}$/u : platform === 'kick' ? /^[A-Za-z0-9_-]{1,80}$/u : /^[A-Za-z0-9._-]{1,80}$/u;
  return pattern.test(candidate) ? candidate : '';
}
function youtubeLiveUrl(value) {
  const input = safeUrl(value); if (!input) return '';
  const url = new URL(input); const host = url.hostname.toLowerCase().replace(/^www\./u, '');
  if (host !== 'youtube.com' && host !== 'youtu.be') return '';
  if (host === 'youtu.be') return url.href;
  if (url.pathname === '/watch' && url.searchParams.get('v')) return url.href;
  const path = url.pathname.replace(/\/+$/u, '');
  if (!path || path === '/') return '';
  url.pathname = path.endsWith('/live') ? path : `${path}/live`; url.search = ''; url.hash = '';
  return url.href;
}
function urlFor(event, settings) { const channel = clean(event.channel?.name, 100); if (event.platform === 'twitch') return settings.twitchLogin ? `https://www.twitch.tv/${encodeURIComponent(settings.twitchLogin)}` : channel ? `https://www.twitch.tv/${encodeURIComponent(channel)}` : ''; if (event.platform === 'youtube') return clean(event.payload?.streamId, 256) ? `https://www.youtube.com/watch?v=${encodeURIComponent(clean(event.payload.streamId, 256))}` : settings.youtubeChannelUrl; if (event.platform === 'kick') return settings.kickLogin ? `https://kick.com/${encodeURIComponent(settings.kickLogin)}` : channel ? `https://kick.com/${encodeURIComponent(channel)}` : ''; if (event.platform === 'tiktok') return settings.tiktokLogin ? `https://www.tiktok.com/@${encodeURIComponent(settings.tiktokLogin)}/live` : ''; return ''; }
function stateFor(value) {
  const source = value && typeof value === 'object' ? value : {}; const managedSource = source.managedForumThreads && typeof source.managedForumThreads === 'object' ? source.managedForumThreads : {};
  return {
    notified: Array.isArray(source.notified) ? source.notified.filter((item) => item && typeof item.key === 'string' && typeof item.at === 'string').slice(-99) : [],
    managedForumThreads: Object.fromEntries(PLATFORMS.map((platform) => [platform, /^\d{5,30}$/u.test(clean(managedSource[platform], 30)) ? clean(managedSource[platform], 30) : ''])),
    lastDelivery: source.lastDelivery && typeof source.lastDelivery === 'object' ? source.lastDelivery : undefined,
  };
}
function verifiedKey(event) { if (event.metadata?.unverifiedFields?.includes('source.eventId')) return ''; const identity = clean(event.payload?.streamId, 256) || clean(event.payload?.startedAt, 100) || clean(event.source?.eventId, 256); return identity ? `${event.platform}|${identity}` : ''; }
function platformLabel(platform) { return platform === 'tiktok' ? 'TikTok' : platform === 'youtube' ? 'YouTube' : platform[0].toUpperCase() + platform.slice(1); }
function renderMessage(entry, settings) { const platform = platformLabel(entry.platform); return settings.messageTemplate.replaceAll('{platforms}', platform).replaceAll('{platform}', platform).replaceAll('{links}', entry.url).replaceAll('{url}', entry.url).replaceAll('{title}', entry.title).replaceAll('{category}', entry.category).replaceAll('{startedAt}', entry.startedAt).slice(0, 2000); }
function renderWelcome(entry, settings) { return settings.forumWelcomeMessages[entry.platform].replaceAll('{platform}', platformLabel(entry.platform)).replaceAll('{channel}', entry.channelName || platformLabel(entry.platform)).slice(0, 1500); }
async function flush(context) {
  taskId = undefined; const settings = settingsFor(context); const entries = [...pending.values()]; pending.clear(); if (!entries.length || stopped) return;
  const state = stateFor(await context.state.read());
  for (const entry of entries) {
    const mode = settings.destinationModes[entry.platform];
    const configuredThreadId = settings.forumThreadIds[entry.platform];
    const managedThreadId = settings.forumPostSetupMode === 'create' ? state.managedForumThreads[entry.platform] : '';
    const threadId = configuredThreadId || managedThreadId;
    if (mode === 'forum' && settings.forumPostSetupMode === 'existing' && !threadId) continue;
    const creatingManagedPost = mode === 'forum' && settings.forumPostSetupMode === 'create' && !threadId;
    const threadName = creatingManagedPost ? `${platformLabel(entry.platform)} Live Notifications` : `${platformLabel(entry.platform)} live - ${entry.title || new Date(entry.startedAt).toISOString().slice(0, 10)}`;
    try {
      await context.streamerbot.runApprovedAction(DELIVERY_ACTION_ID, {
        liveBeaconMessage: renderMessage(entry, settings), liveBeaconPlatform: entry.platform, liveBeaconUrl: entry.url,
        liveBeaconTitle: entry.title, liveBeaconCategory: entry.category, liveBeaconStartedAt: entry.startedAt,
        liveBeaconDestinationMode: mode, liveBeaconThreadId: threadId,
        liveBeaconForumWelcome: creatingManagedPost ? renderWelcome(entry, settings) : '',
        liveBeaconThreadName: threadName.slice(0, 100), liveBeaconWebhookName: settings.webhookName, liveBeaconAllowedRoleId: settings.roleMentionId,
        liveBeaconDeliveryId: encodeURIComponent(entry.key).slice(0, 500),
      });
    } catch { /* A delivery failure is visible in broker diagnostics and never marks the stream notified. */ }
  }
}
function fallbackEntry(platform, settings, startedAt) {
  const url = platform === 'twitch' && settings.twitchLogin ? `https://www.twitch.tv/${encodeURIComponent(settings.twitchLogin)}` : platform === 'youtube' ? settings.youtubeChannelUrl : platform === 'kick' && settings.kickLogin ? `https://kick.com/${encodeURIComponent(settings.kickLogin)}` : platform === 'tiktok' && settings.tiktokLogin ? `https://www.tiktok.com/@${encodeURIComponent(settings.tiktokLogin)}/live` : '';
  const timestamp = Date.parse(startedAt); if (!url || !Number.isFinite(timestamp)) return undefined;
  const channelName = platform === 'twitch' ? settings.twitchLogin : platform === 'kick' ? settings.kickLogin : platform === 'tiktok' ? settings.tiktokLogin : 'YouTube';
  return { key: `${platform}|fallback-${String(Math.floor(timestamp / 300_000))}`, platform, url, title: '', category: '', channelName, startedAt: new Date(timestamp).toISOString() };
}
const module = { manifest, required: false, async start() { stopped = false; }, async stop(context) { stopped = true; if (taskId) context.schedule.cancel(taskId); taskId = undefined; pending.clear(); }, async onEvent(event, context) {
  const settings = settingsFor(context); if (!settings.enabled) return;
  if (event.eventType === 'stream.online') {
    if (event.metadata?.simulated === true || !settings.platforms.has(event.platform)) return; const key = verifiedKey(event); const url = urlFor(event, settings); if (!key || !url) return;
    const state = stateFor(await context.state.read()); if (state.notified.some((entry) => entry.key === key)) return;
    const startedAtValue = clean(event.payload?.startedAt, 100); const startedAt = Number.isFinite(Date.parse(startedAtValue)) ? new Date(startedAtValue).toISOString() : event.receivedAt;
    pending.set(event.platform, { key, platform: event.platform, url, title: clean(event.payload?.title, 200), category: clean(event.payload?.categoryName, 100), channelName: clean(event.channel?.name, 100), startedAt });
    if (!taskId) taskId = context.schedule.after(settings.coalesceSeconds * 1000, async () => { await flush(context); }); return;
  }
  if (event.eventType === CONTROL_EVENT) {
    if (event.metadata?.simulated === true || event.payload?.action !== 'online') return;
    const state = stateFor(await context.state.read()); const startedAt = clean(event.payload?.startedAt, 100) || event.receivedAt;
    for (const platform of settings.fallbackPlatforms) {
      if (!settings.platforms.has(platform)) continue; const entry = fallbackEntry(platform, settings, startedAt);
      if (entry && !state.notified.some((item) => item.key === entry.key)) pending.set(platform, entry);
    }
    if (pending.size && !taskId) taskId = context.schedule.after(settings.coalesceSeconds * 1000, async () => { await flush(context); });
    return;
  }
  if (event.eventType !== RESULT_EVENT) return; const keys = clean(event.payload?.deliveryId, 500).split(',').filter(Boolean).slice(0, 4).map((key) => { try { return decodeURIComponent(key); } catch { return ''; } }).filter(Boolean); if (!keys.length) return;
  const state = stateFor(await context.state.read()); const now = event.receivedAt; const platform = clean(event.payload?.platform, 20); const confirmedThreadId = clean(event.payload?.threadId, 30);
  const notified = event.payload?.success === true ? [...state.notified, ...keys.map((key) => ({ key, at: now }))].slice(-100) : state.notified;
  const managedForumThreads = { ...state.managedForumThreads };
  if (event.payload?.success === true && settings.forumPostSetupMode === 'create' && PLATFORMS.includes(platform) && /^\d{5,30}$/u.test(confirmedThreadId)) managedForumThreads[platform] = confirmedThreadId;
  await context.state.write({ notified, managedForumThreads, lastDelivery: { at: now, platform, success: event.payload?.success === true, count: keys.length, messageId: clean(event.payload?.messageId, 100), threadId: confirmedThreadId, error: clean(event.payload?.error, 200) } });
} };
export default module;
