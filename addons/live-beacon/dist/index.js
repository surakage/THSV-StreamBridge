// Live Beacon validates stream-online signals and posts one bounded Discord embed per platform.
// Posts go to webhooks from the creator's shared Discord webhook list; the add-on only knows their IDs.
const CONTROL_EVENT = 'addon.thsv.live-beacon.broadcast-control';
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok', 'facebook']);
const PLATFORM_COLORS = Object.freeze({ twitch: 9529087, youtube: 16711680, kick: 5504024, facebook: 1603570 });
const WEBHOOK_ID = /^[a-z0-9-]{1,64}$/u;
const DEFAULT_WELCOMES = Object.freeze({
  facebook: 'Welcome to the official Facebook live notifications thread!\n\nWhenever {channel} goes live on Facebook, an automatic notification will be posted here with:\n\n🎮 Game or category\n📝 Stream title\n🔗 Direct link to the video\n⏰ Stream start time\n\nSee you in chat, Villagers! 🌿',
  twitch: "Welcome to the official Twitch live notifications thread!\n\nWhenever {channel} goes live on Twitch, an automatic notification will be posted here with:\n\n🎮 Game being streamed\n📝 Stream title\n🔗 Direct link to the stream\n⏰ Time the stream started\n\nIf Twitch is your preferred platform, keep an eye on this thread so you'll never miss a live stream.\n\nSee you in chat, Villagers! 🌿",
  youtube: 'Welcome to the official YouTube live notifications thread!\n\nEvery YouTube livestream will automatically be announced here with:\n\n🎮 Game or category\n📝 Stream title\n🔗 Watch link\n⏰ Stream start time\n\nSubscribe to the YouTube channel and follow this thread so you never miss a broadcast.',
  kick: 'Welcome to the official Kick live notifications thread!\n\nWhenever {channel} starts streaming on Kick, a notification will automatically appear here containing:\n\n🎮 Game being streamed\n📝 Stream title\n🔗 Direct link to the stream\n⏰ Stream start time\n\nIf you enjoy watching on Kick, this is the place to stay updated.',
  tiktok: 'Welcome to the official TikTok LIVE notifications thread!\n\nWhenever {channel} goes live on TikTok, an automatic notification will be posted here including:\n\n🎮 Stream category\n📝 Live title\n🔗 Join the LIVE\n⏰ Stream start time\n\nPerfect for anyone who prefers watching on TikTok.',
});
const pending = new Map(); const activeStreams = new Map(); let taskId; let stopped = true;
const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: 'thsv.live-beacon', name: 'Live Beacon', version: '4.1.2', minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.1.2', maximumTestedBridgeVersion: '4.1.2', dependencies: [], requiredCapabilities: [],
  configurationSchema: 'schemas/config.json', eventSubscriptions: ['stream.online', 'stream.offline', CONTROL_EVENT], commandsProvided: [], actionsProvided: [{ id: 'live-beacon.broadcast-started', name: 'THSV Addon - Live Beacon - Broadcast Started' }], browserSourcesProvided: [], dataStorageOwned: ['data/addons/thsv.live-beacon/', 'data/addons/.state/thsv.live-beacon/'],
  installationSteps: ['Add your Discord webhook under Platforms > Discord webhooks and choose it in Live Beacon settings. A platform can use a different webhook when it posts to a different channel or forum.', 'Choose Create for me or Use existing posts. Create for me makes and remembers each permanent post on its first genuine live event; existing mode uses copied Discord Channel IDs.', 'Only when selected platforms need a broadcast-app fallback, import the Live Beacon Streamer.bot package and attach OBS, Meld, or Streamlabs Desktop Streaming Started to Broadcast Started.', 'Configure platform links and templates, then enable the add-on.'],
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
    forumPostSetupModes: Object.fromEntries(PLATFORMS.map(platform => [platform, platform === 'facebook' && ['create', 'existing'].includes(raw.facebookForumPostSetupMode) ? raw.facebookForumPostSetupMode : raw.forumPostSetupMode === 'existing' ? 'existing' : 'create'])),
    forumWelcomeMessages: Object.fromEntries(PLATFORMS.map((platform) => [platform, cleanMultiline(raw[`${platform}ForumWelcome`], 1500) || DEFAULT_WELCOMES[platform]])),
    coalesceSeconds: Number.isInteger(raw.coalesceSeconds) ? Math.min(60, Math.max(1, raw.coalesceSeconds)) : 15,
    webhookName: clean(raw.webhookName, 80) || 'THSV Live Beacon',
    webhookId: WEBHOOK_ID.test(clean(raw.webhookId, 64)) ? clean(raw.webhookId, 64) : '',
    platformWebhookIds: Object.fromEntries(PLATFORMS.map((platform) => [platform, WEBHOOK_ID.test(clean(raw[`${platform}WebhookId`], 64)) ? clean(raw[`${platform}WebhookId`], 64) : ''])),
    shareMissingMetadata: raw.shareMissingMetadata !== false,
    showArtwork: raw.showArtwork !== false,
    roleMentionId: /^\d{5,30}$/u.test(clean(raw.roleMentionId, 30)) ? clean(raw.roleMentionId, 30) : '',
    twitchLogin: platformLogin(raw.twitchLogin, 'twitch'), youtubeChannelUrl: youtubeLiveUrl(raw.youtubeChannelUrl),
    kickLogin: platformLogin(raw.kickLogin, 'kick'), tiktokLogin: platformLogin(raw.tiktokLogin, 'tiktok'), facebookPageUrl: facebookUrl(raw.facebookPageUrl),
    messageTemplate: clean(raw.messageTemplate, 1000) || '{platform} is live! Join the stream now.',
  };
}
function safeUrl(value) { try { const url = new URL(clean(value, 500)); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } }
function facebookUrl(value) {
  const input = safeUrl(value); if (!input) return '';
  const url = new URL(input);
  return !url.username && !url.password && ['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(url.hostname.toLowerCase()) && url.pathname !== '/' ? url.href : '';
}
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
function urlFor(event, settings) { if (event.platform === 'facebook') { const direct = facebookUrl(event.payload?.streamUrl); const videoId = clean(event.payload?.videoId, 100); const pageId = clean(event.channel?.id, 100); return direct || (/^\d{1,100}$/u.test(videoId) ? `https://www.facebook.com/watch/?v=${videoId}` : settings.facebookPageUrl || (/^\d{1,100}$/u.test(pageId) ? `https://www.facebook.com/${pageId}/live` : '')); } const channel = clean(event.channel?.name, 100); if (event.platform === 'twitch') return settings.twitchLogin ? `https://www.twitch.tv/${encodeURIComponent(settings.twitchLogin)}` : channel ? `https://www.twitch.tv/${encodeURIComponent(channel)}` : ''; if (event.platform === 'youtube') return clean(event.payload?.streamId, 256) ? `https://www.youtube.com/watch?v=${encodeURIComponent(clean(event.payload.streamId, 256))}` : settings.youtubeChannelUrl; if (event.platform === 'kick') return settings.kickLogin ? `https://kick.com/${encodeURIComponent(settings.kickLogin)}` : channel ? `https://kick.com/${encodeURIComponent(channel)}` : ''; if (event.platform === 'tiktok') return settings.tiktokLogin ? `https://www.tiktok.com/@${encodeURIComponent(settings.tiktokLogin)}/live` : ''; return ''; }
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
function safeImage(value) { const url = safeUrl(value); try { return url && !new URL(url).username && !new URL(url).password ? url.slice(0, 2048) : ''; } catch { return ''; } }
export function buildEmbed(entry, description, showArtwork) {
  const label = platformLabel(entry.platform); const profile = showArtwork ? safeImage(entry.profileImageUrl) : ''; const art = showArtwork ? safeImage(entry.categoryArtUrl) : ''; const preview = showArtwork ? safeImage(entry.thumbnailUrl) : '';
  const shared = PLATFORMS.includes(entry.metadataSource) && entry.metadataSource !== entry.platform ? ` · Shared details from ${platformLabel(entry.metadataSource)}` : '';
  const embed = {
    title: `🔴 LIVE · ${label}`, url: entry.url, description: [...description].slice(0, 1000).join(''), color: PLATFORM_COLORS[entry.platform] ?? 2487534,
    footer: { text: `THSV Live Beacon${shared}` },
    author: { name: [...(entry.channelName ? `${entry.channelName} · Join the stream` : 'Join the stream')].slice(0, 256).join(''), url: entry.url, ...(profile ? { icon_url: profile } : {}) },
  };
  if (art || profile) embed.thumbnail = { url: art || profile };
  if (preview) embed.image = { url: preview };
  const fields = [
    { name: 'Stream title', value: entry.title ? entry.title.slice(0, 500) : 'Not supplied by the connected platforms', inline: false },
    { name: 'Game / Category', value: entry.category ? entry.category.slice(0, 200) : 'Not supplied by the connected platforms', inline: true },
    { name: 'Direct link', value: `[▶ Watch live on ${label}](${entry.url})`, inline: true },
  ];
  const started = Date.parse(entry.startedAt);
  if (Number.isFinite(started)) { const unix = String(Math.floor(started / 1000)); embed.timestamp = new Date(started).toISOString(); fields.push({ name: 'Started', value: `<t:${unix}:F>\n<t:${unix}:R>`, inline: false }); }
  embed.fields = fields;
  return embed;
}
async function recordDelivery(context, settings, entry, result) {
  const state = stateFor(await context.state.read()); const now = new Date().toISOString(); const threadId = clean(result.threadId, 30);
  const managedForumThreads = { ...state.managedForumThreads };
  if (result.ok && settings.forumPostSetupModes[entry.platform] === 'create' && /^\d{5,30}$/u.test(threadId)) managedForumThreads[entry.platform] = threadId;
  await context.state.write({ notified: result.ok ? [...state.notified, { key: entry.key, at: now }].slice(-100) : state.notified, managedForumThreads, lastDelivery: { at: now, platform: entry.platform, success: result.ok === true, count: 1, messageId: clean(result.messageId, 100), threadId, error: clean(result.error, 200) } });
}
function renderWelcome(entry, settings) { return settings.forumWelcomeMessages[entry.platform].replaceAll('{platform}', platformLabel(entry.platform)).replaceAll('{channel}', entry.channelName || platformLabel(entry.platform)).slice(0, 1500); }
export function enrichFromActiveStreams(entry, streams, enabled = true) {
  const enriched = { ...entry };
  if (!enabled) return enriched;
  const donors = ['twitch', 'kick', 'youtube', 'facebook', 'tiktok'].map(platform => streams.get(platform)).filter(donor => donor && donor.platform !== entry.platform);
  for (const key of ['title', 'category', 'profileImageUrl']) {
    if (enriched[key]) continue;
    const donor = donors.find(value => value[key]);
    if (donor) { enriched[key] = donor[key]; enriched.metadataSource ||= donor.platform; }
  }
  const matching = donors.find(donor => donor.category && donor.category.toLowerCase() === (enriched.category || '').toLowerCase());
  if (matching) {
    enriched.categoryArtUrl ||= matching.categoryArtUrl;
    enriched.thumbnailUrl ||= matching.thumbnailUrl;
  }
  return enriched;
}
async function flush(context) {
  taskId = undefined; const settings = settingsFor(context); const entries = [...pending.values()]; pending.clear(); if (!entries.length || stopped) return;
  const state = stateFor(await context.state.read());
  for (const queued of entries) {
    // A platform that stopped during coalescing must not get a delayed live announcement.
    if (queued.native && !activeStreams.has(queued.platform)) continue;
    const entry = enrichFromActiveStreams(queued, activeStreams, settings.shareMissingMetadata);
    const mode = settings.destinationModes[entry.platform];
    const configuredThreadId = settings.forumThreadIds[entry.platform];
    const postSetupMode = settings.forumPostSetupModes[entry.platform];
    const managedThreadId = postSetupMode === 'create' ? state.managedForumThreads[entry.platform] : '';
    const threadId = configuredThreadId || managedThreadId;
    if (mode === 'forum' && postSetupMode === 'existing' && !threadId) continue;
    const creatingManagedPost = mode === 'forum' && postSetupMode === 'create' && !threadId;
    const threadName = creatingManagedPost ? `${platformLabel(entry.platform)} Live Notifications` : `${platformLabel(entry.platform)} live - ${entry.title || new Date(entry.startedAt).toISOString().slice(0, 10)}`;
    const webhookId = settings.platformWebhookIds[entry.platform] || settings.webhookId;
    if (!webhookId) { await recordDelivery(context, settings, entry, { ok: false, error: 'Choose a Discord webhook in Live Beacon settings.' }); continue; }
    const content = [settings.roleMentionId ? `<@&${settings.roleMentionId}>` : '', creatingManagedPost ? renderWelcome(entry, settings) : ''].filter(Boolean).join('\n\n');
    const profile = settings.showArtwork ? safeImage(entry.profileImageUrl) : '';
    let result;
    try {
      result = await context.discord.post({
        webhookId, username: settings.webhookName, ...(profile ? { avatarUrl: profile } : {}), ...(content ? { content: content.slice(0, 2000) } : {}),
        embeds: [buildEmbed(entry, renderMessage(entry, settings), settings.showArtwork)],
        ...(settings.roleMentionId ? { mentionRoleIds: [settings.roleMentionId] } : {}),
        ...(mode === 'forum' ? (threadId ? { threadId } : { threadName: threadName.slice(0, 100) }) : {}),
      });
    } catch { result = { ok: false, error: 'Discord delivery failed.' }; }
    // A failed post never marks the stream notified, so the next genuine online event can try again.
    await recordDelivery(context, settings, entry, result || { ok: false });
  }
}
function fallbackEntry(platform, settings, startedAt) {
  const url = platform === 'facebook' ? settings.facebookPageUrl : platform === 'twitch' && settings.twitchLogin ? `https://www.twitch.tv/${encodeURIComponent(settings.twitchLogin)}` : platform === 'youtube' ? settings.youtubeChannelUrl : platform === 'kick' && settings.kickLogin ? `https://kick.com/${encodeURIComponent(settings.kickLogin)}` : platform === 'tiktok' && settings.tiktokLogin ? `https://www.tiktok.com/@${encodeURIComponent(settings.tiktokLogin)}/live` : '';
  const timestamp = Date.parse(startedAt); if (!url || !Number.isFinite(timestamp)) return undefined;
  const channelName = platform === 'twitch' ? settings.twitchLogin : platform === 'kick' ? settings.kickLogin : platform === 'tiktok' ? settings.tiktokLogin : platform === 'facebook' ? 'Facebook' : 'YouTube';
  return { key: `${platform}|fallback-${String(Math.floor(timestamp / 300_000))}`, platform, url, title: '', category: '', channelName, startedAt: new Date(timestamp).toISOString() };
}
const module = { manifest, required: false, async start() { stopped = false; activeStreams.clear(); }, async stop(context) { stopped = true; if (taskId) context.schedule.cancel(taskId); taskId = undefined; pending.clear(); activeStreams.clear(); }, async onEvent(event, context) {
  const settings = settingsFor(context); if (!settings.enabled) return;
  if (event.eventType === 'stream.offline') {
    if (event.metadata?.simulated !== true) { activeStreams.delete(event.platform); pending.delete(event.platform); }
    return;
  }
  if (event.eventType === 'stream.online') {
    if (event.metadata?.simulated === true || !PLATFORMS.includes(event.platform)) return; const key = verifiedKey(event); const url = urlFor(event, settings); if (!key || !url) return;
    const startedAtValue = clean(event.payload?.startedAt, 100); const startedAt = Number.isFinite(Date.parse(startedAtValue)) ? new Date(startedAtValue).toISOString() : event.receivedAt;
    const entry = { key, native: true, platform: event.platform, url, title: clean(event.payload?.title, 200), category: clean(event.payload?.categoryName, 100), channelName: clean(event.channel?.name, 100), startedAt,
      thumbnailUrl: safeUrl(event.payload?.thumbnailUrl), profileImageUrl: safeUrl(event.payload?.profileImageUrl), categoryArtUrl: safeUrl(event.payload?.categoryArtUrl) };
    activeStreams.set(event.platform, entry);
    if (!settings.platforms.has(event.platform)) return;
    const state = stateFor(await context.state.read()); if (state.notified.some((entry) => entry.key === key)) return;
    pending.set(event.platform, entry);
    if (!taskId) taskId = context.schedule.after(settings.coalesceSeconds * 1000, () => { void flush(context).catch(() => undefined); }); return;
  }
  if (event.eventType === CONTROL_EVENT) {
    if (event.metadata?.simulated === true || event.payload?.action !== 'online') return;
    const state = stateFor(await context.state.read()); const startedAt = clean(event.payload?.startedAt, 100) || event.receivedAt;
    for (const platform of settings.fallbackPlatforms) {
      if (!settings.platforms.has(platform)) continue; const entry = fallbackEntry(platform, settings, startedAt);
      if (entry && !state.notified.some((item) => item.key === entry.key) && !pending.get(platform)?.native) pending.set(platform, entry);
    }
    if (pending.size && !taskId) taskId = context.schedule.after(settings.coalesceSeconds * 1000, () => { void flush(context).catch(() => undefined); });
  }
} };
export default module;
