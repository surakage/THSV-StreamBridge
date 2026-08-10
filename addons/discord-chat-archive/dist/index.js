// Discord Chat Archive mirrors only normalized public chat selected by creator policy.
// Message text stays in a bounded in-memory queue until a creator-approved Streamer.bot
// action delivers it; the add-on never writes chat content or the Discord webhook to disk.
const DELIVERY_ACTION_ID = 'df40969d-5923-4432-bdca-ecdee451f150';
const DELIVERY_EVENT = 'addon.thsv.discord-chat-archive.delivery-received';
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok']);
const DISCORD_CONTENT_LIMIT = 1900;
const RESULT_TIMEOUT_MS = 15_000;

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: 'thsv.discord-chat-archive', name: 'Discord Chat Archive', version: '3.5.0',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '3.5.0', maximumTestedBridgeVersion: '3.5.0', dependencies: [], requiredCapabilities: [],
  configurationSchema: 'schemas/config.json', eventSubscriptions: ['chat.message', 'stream.online', 'stream.offline', DELIVERY_EVENT], commandsProvided: [],
  actionsProvided: [{ id: 'discord-chat-archive.deliver', name: 'Required Discord webhook delivery' }], browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.discord-chat-archive/', 'data/addons/.state/thsv.discord-chat-archive/'],
  installationSteps: [
    'Create a private Discord webhook for the archive channel and never share its URL.',
    'Import the Discord Chat Archive Streamer.bot package, edit its webhook Set Argument, compile it, and run it manually once for a safe test.',
    'Install this add-on, approve only the imported Deliver action, review the privacy notice and ignore list, then enable it.',
  ],
  uninstallationSteps: ['Uninstall the add-on. No chat transcript or webhook URL is stored by StreamBridge.'], migrations: [],
  healthChecks: [{ id: 'thsv.discord-chat-archive.runtime', description: 'Confirms bounded public-chat filtering, batching, and approved Discord delivery are available.' }],
};

const FALLBACKS = Object.freeze({
  enabled: false,
  enabledPlatforms: PLATFORMS,
  ignoreBots: true,
  ignoredUsers: ['twitch:nightbot', 'twitch:streamelements', 'youtube:streamelements', 'kick:streamelements', 'twitch:fossabot', 'twitch:moobot', 'twitch:sery_bot', 'twitch:soundalerts', 'twitch:wizebot', 'twitch:kofistreambot', 'twitch:streamlabs', 'twitch:botrix', 'youtube:botrix', 'kick:botrix', 'tiktok:botrix'],
  ignoreCommands: false,
  commandPrefix: '!',
  includeSimulatedMessages: false,
  destinationMode: 'channel',
  forumThreadName: 'Village chat · {date} · {time}',
  forumTagIds: [],
  layoutStyle: 'clean-embeds',
  showSessionHeader: true,
  sessionHeaderTitle: 'Village Stream Chat Archive',
  showMessageTimes: true,
  twitchColor: '#9146ff',
  youtubeColor: '#ff0033',
  kickColor: '#53fc18',
  tiktokColor: '#25f4ee',
  messageTemplate: '[{time}] [{platform}] {displayName}: {message}',
  webhookDisplayName: 'THSV Chat Archive',
  useViewerIdentityForSingleMessage: false,
  useViewerAvatarForSingleMessage: false,
  batchWindowSeconds: 5,
  maximumMessagesPerBatch: 10,
  maximumQueueMessages: 100,
  maximumMessageCharacters: 500,
  retryCount: 1,
  retryDelaySeconds: 10,
  showDroppedMessageNotice: true,
});

let queuedMessages = [];
let droppedMessages = 0;
let flushTaskId;
let stopped = true;
let requestSequence = 0;
let forumThreadId = '';
let sessionHeaderSent = false;
let sessionStartedAt = '';
let archiveSessionKey = '';
const livePlatforms = new Set();
let operation = Promise.resolve();
const pendingDeliveries = new Map();
const resultTimeouts = new Map();
const retryTasks = new Map();
const recentEventIds = new Map();

function cleanText(value, maximum = 500) {
  const normalized = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '';
  return [...normalized].slice(0, maximum).join('');
}

function clampInteger(value, fallback, minimum, maximum) {
  return Number.isInteger(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function settingsFor(context) {
  const raw = { ...FALLBACKS, ...(context.settings ?? {}) };
  return {
    ...raw,
    enabledPlatforms: Array.isArray(raw.enabledPlatforms) ? raw.enabledPlatforms.filter((entry) => PLATFORMS.includes(entry)) : PLATFORMS,
    ignoredUsers: Array.isArray(raw.ignoredUsers) ? raw.ignoredUsers.slice(0, 500) : [],
    destinationMode: raw.destinationMode === 'forum' ? 'forum' : 'channel',
    forumThreadName: cleanText(raw.forumThreadName, 100) || FALLBACKS.forumThreadName,
    forumTagIds: Array.isArray(raw.forumTagIds) ? raw.forumTagIds.filter((id) => /^\d{5,30}$/u.test(id)).slice(0, 5) : [],
    layoutStyle: raw.layoutStyle === 'plain-text' ? 'plain-text' : 'clean-embeds',
    sessionHeaderTitle: cleanText(raw.sessionHeaderTitle, 80) || FALLBACKS.sessionHeaderTitle,
    twitchColor: /^#[0-9a-f]{6}$/iu.test(raw.twitchColor) ? raw.twitchColor : FALLBACKS.twitchColor,
    youtubeColor: /^#[0-9a-f]{6}$/iu.test(raw.youtubeColor) ? raw.youtubeColor : FALLBACKS.youtubeColor,
    kickColor: /^#[0-9a-f]{6}$/iu.test(raw.kickColor) ? raw.kickColor : FALLBACKS.kickColor,
    tiktokColor: /^#[0-9a-f]{6}$/iu.test(raw.tiktokColor) ? raw.tiktokColor : FALLBACKS.tiktokColor,
    batchWindowSeconds: clampInteger(raw.batchWindowSeconds, 5, 5, 30),
    maximumMessagesPerBatch: clampInteger(raw.maximumMessagesPerBatch, 10, 1, 20),
    maximumQueueMessages: clampInteger(raw.maximumQueueMessages, 100, 10, 500),
    maximumMessageCharacters: clampInteger(raw.maximumMessageCharacters, 500, 40, 1000),
    retryCount: clampInteger(raw.retryCount, 1, 0, 2),
    retryDelaySeconds: clampInteger(raw.retryDelaySeconds, 10, 5, 60),
    commandPrefix: cleanText(raw.commandPrefix, 1) || '!',
    messageTemplate: cleanText(raw.messageTemplate, 500) || FALLBACKS.messageTemplate,
    webhookDisplayName: cleanText(raw.webhookDisplayName, 80) || FALLBACKS.webhookDisplayName,
  };
}

function platformOf(value) {
  return PLATFORMS.includes(value) ? value : undefined;
}

function actorOf(event) {
  return event?.user ?? event?.actor;
}

function cleanUserName(value) {
  return cleanText(value, 256).replace(/^@+/u, '');
}

function normalizedRule(value) {
  return cleanText(value, 300).toLocaleLowerCase('en-US');
}

export function matchesIgnoredViewer(rule, platform, user) {
  const expected = normalizedRule(rule);
  const name = cleanUserName(user?.name).toLocaleLowerCase('en-US');
  const displayName = cleanUserName(user?.displayName).toLocaleLowerCase('en-US');
  const id = cleanText(user?.id, 256).toLocaleLowerCase('en-US');
  if (!expected) return false;
  if (expected === name || (displayName && expected === displayName)) return true;
  if (expected === `${platform}:${name}` || (displayName && expected === `${platform}:${displayName}`)) return true;
  return Boolean(id) && expected === `${platform}:id:${id}`;
}

function actorTypeOf(user) {
  const explicit = cleanText(user?.actorType, 20).toLocaleLowerCase('en-US');
  if (explicit === 'bot' || explicit === 'system') return explicit;
  const roles = Array.isArray(user?.roles) ? user.roles.map((role) => cleanText(role, 64).toLocaleLowerCase('en-US')) : [];
  return roles.includes('bot') ? 'bot' : 'human';
}

function escapeDiscordValue(value, maximum = 1000) {
  return cleanText(value, maximum)
    .replace(/\\/gu, '\\\\')
    .replace(/([`*_~|>])/gu, '\\$1');
}

function defangMentions(value) {
  return value.replace(/@/gu, '@\u200b');
}

function formatTime(receivedAt) {
  const date = new Date(receivedAt);
  if (!Number.isFinite(date.valueOf())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(receivedAt) {
  const date = new Date(receivedAt);
  if (!Number.isFinite(date.valueOf())) return '';
  return date.toLocaleDateString();
}

function platformLabel(platform) {
  if (platform === 'tiktok') return 'TikTok';
  if (platform === 'youtube') return 'YouTube';
  return `${platform.slice(0, 1).toLocaleUpperCase('en-US')}${platform.slice(1)}`;
}

function localDateKey(receivedAt) {
  const date = new Date(receivedAt);
  if (!Number.isFinite(date.valueOf())) return new Date().toLocaleDateString('en-CA');
  return date.toLocaleDateString('en-CA');
}

function platformColor(platform, settings) {
  return Number.parseInt(settings[`${platform}Color`].slice(1), 16);
}

function renderEmbedLine(item, settings) {
  const name = escapeDiscordValue(item.user.displayName || item.user.name, 256);
  const message = defangMentions(escapeDiscordValue(item.message, 1000));
  const time = settings.showMessageTimes ? `${escapeDiscordValue(formatTime(item.receivedAt), 32)} · ` : '';
  return `**${time}${name}** — ${message}`;
}

export function buildArchiveEmbeds(items, settings) {
  if (settings.layoutStyle !== 'clean-embeds') return [];
  const embeds = [];
  for (const item of items) {
    const line = renderEmbedLine(item, settings);
    const current = embeds.at(-1);
    if (current?.platform === item.platform && [...`${current.description}\n${line}`].length <= 3800) current.description += `\n${line}`;
    else if (embeds.length < 10) embeds.push({ platform: item.platform, title: `${platformLabel(item.platform)} chat`, description: line, color: platformColor(item.platform, settings) });
  }
  return embeds.map(({ platform: _platform, ...embed }) => embed);
}

function sessionHeader(settings, receivedAt) {
  return `## ${escapeDiscordValue(settings.sessionHeaderTitle, 80)}\n**${escapeDiscordValue(formatDate(receivedAt), 64)} · ${escapeDiscordValue(formatTime(receivedAt), 32)}**\nTwitch, YouTube, Kick, and TikTok messages are color-coded below.`;
}

export function renderArchiveLine(template, item) {
  const values = {
    time: formatTime(item.receivedAt),
    date: formatDate(item.receivedAt),
    platform: platformLabel(item.platform),
    displayName: item.user.displayName || item.user.name,
    user: item.user.name,
    message: item.message,
    channel: item.channelName,
  };
  let result = cleanText(template, 500);
  for (const [token, value] of Object.entries(values)) result = result.split(`{${token}}`).join(escapeDiscordValue(value, token === 'message' ? 1000 : 256));
  return defangMentions(cleanText(result, 1800));
}

function takeCodePoints(value, maximum) {
  const points = [...value];
  return points.length <= maximum ? value : `${points.slice(0, Math.max(0, maximum - 1)).join('')}…`;
}

export function selectArchiveBatch(queue, settings, dropped = 0) {
  const selected = [];
  const lines = [];
  if (dropped > 0 && settings.showDroppedMessageNotice) lines.push(`⚠ ${String(dropped)} earlier message${dropped === 1 ? '' : 's'} omitted because the archive queue was full.`);
  while (selected.length < settings.maximumMessagesPerBatch && queue.length > 0) {
    const candidate = queue[0];
    const rendered = renderArchiveLine(settings.messageTemplate, candidate);
    const separatorLength = lines.length === 0 ? 0 : 1;
    const used = lines.reduce((sum, line) => sum + [...line].length, 0) + Math.max(0, lines.length - 1);
    const remaining = DISCORD_CONTENT_LIMIT - used - separatorLength;
    if (remaining <= 1) break;
    if ([...rendered].length > remaining && selected.length > 0) break;
    queue.shift();
    selected.push(candidate);
    lines.push(takeCodePoints(rendered, remaining));
  }
  if (selected.length === 0) return undefined;
  const single = selected.length === 1 ? selected[0] : undefined;
  return {
    content: settings.layoutStyle === 'plain-text' ? lines.join('\n') : (dropped > 0 && settings.showDroppedMessageNotice ? lines[0] : ''),
    embeds: buildArchiveEmbeds(selected, settings),
    firstReceivedAt: selected[0]?.receivedAt,
    count: selected.length,
    username: single && settings.useViewerIdentityForSingleMessage ? takeCodePoints(`${platformLabel(single.platform)} · ${single.user.displayName || single.user.name}`, 80) : settings.webhookDisplayName,
    avatarUrl: single && settings.useViewerAvatarForSingleMessage ? single.user.avatarUrl : '',
  };
}

function rememberEvent(eventId, now = Date.now()) {
  if (!eventId || recentEventIds.has(eventId)) return false;
  recentEventIds.set(eventId, now);
  const cutoff = now - 120_000;
  for (const [key, at] of recentEventIds) if (at < cutoff || recentEventIds.size > 500) recentEventIds.delete(key);
  return true;
}

export function selectChatMessage(event, settings) {
  if (!settings.enabled || event?.eventType !== 'chat.message') return undefined;
  const platform = platformOf(event.platform);
  if (!platform || !settings.enabledPlatforms.includes(platform)) return undefined;
  if (event.metadata?.simulated === true && !settings.includeSimulatedMessages) return undefined;
  const user = actorOf(event);
  if (!user || actorTypeOf(user) === 'system' || (settings.ignoreBots && actorTypeOf(user) === 'bot')) return undefined;
  if (settings.ignoredUsers.some((rule) => matchesIgnoredViewer(rule, platform, user))) return undefined;
  const message = cleanText(event.payload?.message, settings.maximumMessageCharacters);
  if (!message || (settings.ignoreCommands && message.startsWith(settings.commandPrefix))) return undefined;
  const name = cleanUserName(user.name);
  if (!name) return undefined;
  return {
    eventId: cleanText(event.eventId, 256),
    platform,
    receivedAt: cleanText(event.receivedAt, 64) || new Date().toISOString(),
    channelName: cleanText(event.channel?.name, 256),
    message,
    user: {
      id: cleanText(user.id, 256),
      name,
      displayName: cleanUserName(user.displayName) || name,
      avatarUrl: cleanText(user.avatarUrl, 2048).startsWith('https://') ? cleanText(user.avatarUrl, 2048) : '',
    },
  };
}

function serialize(task) {
  operation = operation.then(task, task);
  return operation;
}

function cancelTask(context, taskId) {
  if (taskId !== undefined) context.schedule.cancel(taskId);
}

function scheduleFlush(context, settings) {
  if (stopped || flushTaskId !== undefined || queuedMessages.length === 0 || pendingDeliveries.size > 0) return;
  flushTaskId = context.schedule.after(settings.batchWindowSeconds * 1000, () => serialize(async () => {
    flushTaskId = undefined;
    flush(context, settings);
  }));
}

function flush(context, settings) {
  if (stopped || queuedMessages.length === 0 || pendingDeliveries.size > 0) return;
  const batch = selectArchiveBatch(queuedMessages, settings, droppedMessages);
  if (!batch) return;
  droppedMessages = 0;
  const sessionKey = sessionStartedAt ? `live:${sessionStartedAt}` : `date:${localDateKey(batch.firstReceivedAt)}`;
  if (archiveSessionKey !== sessionKey) { archiveSessionKey = sessionKey; forumThreadId = ''; sessionHeaderSent = false; }
  const includesHeader = settings.showSessionHeader !== false && !sessionHeaderSent;
  const requestId = `discord-archive-${Date.now().toString(36)}-${String(++requestSequence)}`;
  const delivery = { requestId, ...batch, content: [includesHeader ? sessionHeader(settings, batch.firstReceivedAt) : '', batch.content].filter(Boolean).join('\n'), embedsJson: JSON.stringify(batch.embeds), includesHeader, mode: settings.destinationMode, attempts: 0 };
  pendingDeliveries.set(requestId, delivery);
  void sendAttempt(delivery, context, settings);
}

async function sendAttempt(delivery, context, settings) {
  if (stopped || !pendingDeliveries.has(delivery.requestId)) return;
  delivery.attempts += 1;
  try {
    await context.streamerbot.runApprovedAction(DELIVERY_ACTION_ID, {
      discordArchiveRequestId: delivery.requestId,
      discordArchiveContent: delivery.content,
      discordArchiveEmbedsJson: delivery.embedsJson,
      discordArchiveUsername: delivery.username,
      discordArchiveAvatarUrl: delivery.avatarUrl,
      discordArchiveDestinationMode: delivery.mode,
      discordArchiveThreadId: delivery.mode === 'forum' ? forumThreadId : '',
      discordArchiveThreadName: settings.forumThreadName.replaceAll('{date}', formatDate(delivery.firstReceivedAt)).replaceAll('{time}', formatTime(delivery.firstReceivedAt)),
      discordArchiveForumTagIds: settings.forumTagIds.join(','),
      discordArchiveSimulated: false,
    });
    if (!pendingDeliveries.has(delivery.requestId)) return;
    const timeoutId = context.schedule.after(RESULT_TIMEOUT_MS, () => serialize(async () => {
      resultTimeouts.delete(delivery.requestId);
      handleDeliveryFailure(delivery, context, settings);
    }));
    resultTimeouts.set(delivery.requestId, timeoutId);
  } catch {
    handleDeliveryFailure(delivery, context, settings);
  }
}

function handleDeliveryFailure(delivery, context, settings) {
  cancelTask(context, resultTimeouts.get(delivery.requestId));
  resultTimeouts.delete(delivery.requestId);
  if (!pendingDeliveries.has(delivery.requestId)) return;
  if (retryTasks.has(delivery.requestId)) return;
  if (delivery.attempts > settings.retryCount || stopped) {
    pendingDeliveries.delete(delivery.requestId);
    scheduleFlush(context, settings);
    return;
  }
  const taskId = context.schedule.after(settings.retryDelaySeconds * 1000, () => serialize(async () => {
    retryTasks.delete(delivery.requestId);
    void sendAttempt(delivery, context, settings);
  }));
  retryTasks.set(delivery.requestId, taskId);
}

function receiveDeliveryResult(event, context, settings) {
  const requestId = cleanText(event.payload?.requestId, 100);
  const delivery = pendingDeliveries.get(requestId);
  if (!delivery) return;
  cancelTask(context, resultTimeouts.get(requestId));
  resultTimeouts.delete(requestId);
  if (event.payload?.succeeded === true) {
    if (delivery.mode === 'forum' && /^\d{5,30}$/u.test(cleanText(event.payload?.threadId, 30))) forumThreadId = cleanText(event.payload.threadId, 30);
    if (delivery.includesHeader) sessionHeaderSent = true;
    pendingDeliveries.delete(requestId);
    scheduleFlush(context, settings);
    return;
  }
  handleDeliveryFailure(delivery, context, settings);
}

function enqueueMessage(event, context, settings) {
  if (!context.approvedActionIds.includes(DELIVERY_ACTION_ID)) return;
  const selected = selectChatMessage(event, settings);
  if (!selected || !rememberEvent(selected.eventId)) return;
  if (queuedMessages.length >= settings.maximumQueueMessages) {
    queuedMessages.shift();
    droppedMessages += 1;
  }
  queuedMessages.push(selected);
  scheduleFlush(context, settings);
}

export function resetDiscordChatArchiveRuntime() {
  queuedMessages = [];
  droppedMessages = 0;
  flushTaskId = undefined;
  stopped = true;
  requestSequence = 0;
  forumThreadId = '';
  sessionHeaderSent = false;
  sessionStartedAt = '';
  archiveSessionKey = '';
  livePlatforms.clear();
  operation = Promise.resolve();
  pendingDeliveries.clear();
  resultTimeouts.clear();
  retryTasks.clear();
  recentEventIds.clear();
}

const module = {
  manifest,
  required: false,
  async start() {
    stopped = false;
  },
  async stop(context) {
    stopped = true;
    cancelTask(context, flushTaskId);
    for (const taskId of resultTimeouts.values()) cancelTask(context, taskId);
    for (const taskId of retryTasks.values()) cancelTask(context, taskId);
    queuedMessages = [];
    droppedMessages = 0;
    flushTaskId = undefined;
    pendingDeliveries.clear();
    resultTimeouts.clear();
    retryTasks.clear();
    recentEventIds.clear();
    forumThreadId = '';
    sessionHeaderSent = false;
    sessionStartedAt = '';
    archiveSessionKey = '';
    livePlatforms.clear();
  },
  async onEvent(event, context) {
    const settings = settingsFor(context);
    if (event?.eventType === DELIVERY_EVENT) return serialize(async () => receiveDeliveryResult(event, context, settings));
    if (event?.eventType === 'stream.online') { if (livePlatforms.size === 0) { sessionStartedAt = cleanText(event.receivedAt, 64) || new Date().toISOString(); archiveSessionKey = ''; forumThreadId = ''; sessionHeaderSent = false; } livePlatforms.add(event.platform); return; }
    if (event?.eventType === 'stream.offline') { livePlatforms.delete(event.platform); if (livePlatforms.size === 0) { sessionStartedAt = ''; archiveSessionKey = ''; forumThreadId = ''; sessionHeaderSent = false; } return; }
    return serialize(async () => enqueueMessage(event, context, settings));
  },
};

export default module;
