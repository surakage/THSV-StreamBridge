// Village Voice turns normalized alerts and opt-in viewer requests into one bounded Speaker.bot queue.
const CONTROL_EVENT = 'addon.thsv.voice-relay.control';
const MODULE_ID = 'thsv.voice-relay';
const SPEAK_ACTION_ID = '9d7b9f62-8f33-41a0-b7d8-a2d247a02fd3';
const ALERT_TYPES = Object.freeze(['channel.follow', 'channel.subscription', 'channel.membership', 'channel.gift-subscription', 'engagement.gift', 'engagement.donation', 'engagement.cheer', 'engagement.raid', 'engagement.super-chat', 'engagement.milestone']);
const ALL_TYPES = Object.freeze([...ALERT_TYPES, 'chat.message', 'reward.redemption', 'command.received']);
const REQUEST_PLATFORMS = Object.freeze(['youtube', 'tiktok']);
// Every normalized alert receives its creator-authored acknowledgement by default.
// Viewer chat and viewer-authored alert messages remain separate, explicit opt-ins.
const DEFAULT_TYPES = Object.freeze([...ALERT_TYPES]);
const DEFAULT_TEMPLATES = Object.freeze({
  'channel.follow': 'Welcome to The Hidden Sloth Village, {actor}! Glad to have you join the village.',
  'channel.subscription': 'Thank you for becoming part of the village, {actor}!',
  'channel.membership': 'Thank you for becoming part of the village, {actor}!',
  'channel.gift-subscription': 'Thank you for sharing the village love, {actor}!',
  'engagement.gift': 'Thank you for the {quantity} {itemName}, {actor}!',
  'engagement.donation': 'Thank you for supporting the village, {actor}!',
  'engagement.cheer': 'Thank you for the {quantity} bits, {actor}!',
  'engagement.raid': 'Welcome, raiders! Thank you for bringing {quantity} villagers, {actor}!',
  'engagement.super-chat': 'Thank you for supporting the village, {actor}!',
  'engagement.milestone': 'Thank you, village! We reached {value} {metric}!'
});
const TEMPLATE_SETTINGS = Object.freeze({
  'channel.follow': 'followTemplate', 'channel.subscription': 'subscriptionTemplate', 'channel.membership': 'membershipTemplate',
  'channel.gift-subscription': 'giftSubscriptionTemplate', 'engagement.gift': 'giftTemplate', 'engagement.donation': 'donationTemplate',
  'engagement.cheer': 'cheerTemplate', 'engagement.raid': 'raidTemplate', 'engagement.super-chat': 'superChatTemplate',
  'engagement.milestone': 'milestoneTemplate'
});
let queue = [];
let speaking = false;
let paused = false;
let taskId;
let operation = Promise.resolve();
let stopped = true;
const pendingAggregates = new Map();
const viewerCooldowns = new Map();
const MAXIMUM_VIEWER_COOLDOWNS = 5000;

const manifest = { contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Village Voice', version: '4.0.3', minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.3', maximumTestedBridgeVersion: '4.0.3', dependencies: ['thsv.viewer-foundation'], requiredCapabilities: [], configurationSchema: 'schemas/config.json', eventSubscriptions: [...ALL_TYPES, CONTROL_EVENT], commandsProvided: [{ id: 'village-voice.speak', name: 'speak' }], actionsProvided: [], browserSourcesProvided: [], dataStorageOwned: ['data/addons/thsv.voice-relay/', 'data/addons/.state/thsv.voice-relay/'], installationSteps: ['Connect Speaker.bot in Streamer.bot.', 'Import Village Voice, approve only Speak, and test a harmless phrase.', 'For Twitch and Kick, attach the matching native Reward Redemption trigger to the existing platform intake.', 'For YouTube and TikTok, choose the request command and enable Viewer Foundation points. The command registers automatically after restart.', 'Add /overlay/addons/thsv.voice-relay as a browser source for the optional speaking card.'], uninstallationSteps: ['Uninstall Village Voice. It retains no spoken text history.'], migrations: [], healthChecks: [{ id: 'thsv.voice-relay.runtime', description: 'Confirms bounded filtered Speaker.bot dispatch and viewer-request routing are available.' }] };

function clean(value, maximum = 400) {
  return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/https?:\/\/\S+/giu, ' link ').replace(/\s+/gu, ' ').trim() : '')].slice(0, maximum).join('');
}

function boundedNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function settingsFor(context) {
  const raw = context.settings || {};
  const templates = {};
  for (const eventType of ALERT_TYPES) {
    const key = TEMPLATE_SETTINGS[eventType];
    templates[eventType] = clean(raw[key], 400) || DEFAULT_TEMPLATES[eventType];
  }
  return {
    enabled: raw.enabled === true,
    eventTypes: new Set(Array.isArray(raw.eventTypes) ? raw.eventTypes.filter((value) => ALL_TYPES.includes(value)) : DEFAULT_TYPES),
    viewerMessageEventTypes: new Set(Array.isArray(raw.viewerMessageEventTypes) ? raw.viewerMessageEventTypes.filter((value) => ALERT_TYPES.includes(value)) : []),
    templates,
    voiceAlias: clean(raw.voiceAlias, 80),
    maximumCharacters: Math.trunc(boundedNumber(raw.maximumCharacters, 20, 400, 240)),
    queueLimit: Math.trunc(boundedNumber(raw.queueLimit, 1, 30, 10)),
    gapSeconds: Math.trunc(boundedNumber(raw.gapSeconds, 1, 30, 2)),
    minimumDonationAmount: boundedNumber(raw.minimumDonationAmount, 0, 1000000, 0),
    minimumCheerQuantity: Math.trunc(boundedNumber(raw.minimumCheerQuantity, 0, 10000000, 0)),
    likeMilestoneInterval: Math.trunc(boundedNumber(raw.likeMilestoneInterval, 100, 100000, 1000)),
    allowChatRoles: new Set(Array.isArray(raw.allowChatRoles) ? raw.allowChatRoles : ['broadcaster', 'moderator']),
    blockedTerms: Array.isArray(raw.blockedTerms) ? raw.blockedTerms.map((value) => clean(value, 80).toLowerCase()).filter(Boolean).slice(0, 200) : [],
    viewerRequestsEnabled: raw.viewerRequestsEnabled === true,
    twitchRewardId: clean(raw.twitchRewardId, 256),
    kickRewardId: clean(raw.kickRewardId, 256),
    pointsCommand: clean(raw.pointsCommand, 64).toLowerCase() || 'speak',
    pointsPlatforms: new Set(Array.isArray(raw.pointsPlatforms) ? raw.pointsPlatforms.filter((value) => REQUEST_PLATFORMS.includes(value)) : REQUEST_PLATFORMS),
    pointsCost: Math.trunc(boundedNumber(raw.pointsCost, 1, 1000000, 100)),
    viewerCooldownSeconds: Math.trunc(boundedNumber(raw.viewerCooldownSeconds, 0, 86400, 30)),
    twitchRequestCharacters: Math.trunc(boundedNumber(raw.twitchRequestCharacters, 20, 400, 300)),
    kickRequestCharacters: Math.trunc(boundedNumber(raw.kickRequestCharacters, 20, 400, 300)),
    youtubeRequestCharacters: Math.trunc(boundedNumber(raw.youtubeRequestCharacters, 20, 400, 200)),
    tiktokRequestCharacters: Math.trunc(boundedNumber(raw.tiktokRequestCharacters, 20, 400, 150)),
    showSpeechOverlay: raw.showSpeechOverlay !== false,
    wordsPerMinute: Math.trunc(boundedNumber(raw.wordsPerMinute, 80, 260, 165)),
    overlayBackgroundMode: ['glass', 'solid', 'none'].includes(raw.overlayBackgroundMode) ? raw.overlayBackgroundMode : 'glass',
    overlayBackgroundColor: /^#[0-9a-f]{6}$/iu.test(raw.overlayBackgroundColor) ? raw.overlayBackgroundColor : '#101820',
    overlayBackgroundOpacity: boundedNumber(raw.overlayBackgroundOpacity, 0, 1, 0.94),
    overlayAccentColor: /^#[0-9a-f]{6}$/iu.test(raw.overlayAccentColor) ? raw.overlayAccentColor : '#7ff5cc',
    overlayTextColor: /^#[0-9a-f]{6}$/iu.test(raw.overlayTextColor) ? raw.overlayTextColor : '#ffffff',
    overlayFontSize: Math.trunc(boundedNumber(raw.overlayFontSize, 20, 72, 38))
  };
}

function renderTemplate(template, values) {
  return template.replace(/\{([a-z][a-zA-Z]*)\}/gu, (_match, token) => values[token] || '');
}

function textFor(event, settings) {
  if (event.metadata?.simulated === true || !settings.eventTypes.has(event.eventType)) return '';
  if (event.eventType === 'chat.message') {
    if (event.user?.actorType === 'bot' || event.user?.actorType === 'system') return '';
    const roles = new Set(Array.isArray(event.user?.roles) ? event.user.roles.map((value) => String(value).toLowerCase()) : []);
    if (![...settings.allowChatRoles].some((role) => roles.has(role))) return '';
    return filtered(clean(event.payload?.message, settings.maximumCharacters), settings);
  }
  if (event.user?.actorType === 'bot' || event.user?.actorType === 'system') return '';
  const amountNumber = Number(event.payload?.amount);
  const quantityNumber = Number(event.payload?.quantity);
  if (['engagement.donation', 'engagement.super-chat'].includes(event.eventType) && Number.isFinite(amountNumber) && amountNumber < settings.minimumDonationAmount) return '';
  if (event.eventType === 'engagement.cheer' && Number.isFinite(quantityNumber) && quantityNumber < settings.minimumCheerQuantity) return '';
  if (event.eventType === 'engagement.milestone' && clean(event.payload?.metric, 40).toLowerCase().includes('like')) {
    const milestoneValue = Number(event.payload?.value);
    if (!Number.isSafeInteger(milestoneValue) || milestoneValue <= 0 || milestoneValue % settings.likeMilestoneInterval !== 0) return '';
  }
  const values = {
    actor: clean(event.user?.displayName || event.user?.name, 80) || 'The community',
    amount: clean(event.payload?.amount, 30), currency: clean(event.payload?.currency, 10),
    quantity: Number.isFinite(quantityNumber) ? String(Math.max(0, Math.trunc(quantityNumber))) : '',
    itemName: clean(event.payload?.itemName, 80), tier: clean(event.payload?.tier, 80),
    metric: clean(event.payload?.metric, 40), value: Number.isFinite(Number(event.payload?.value)) ? String(event.payload.value) : ''
  };
  const template = settings.templates[event.eventType] || DEFAULT_TEMPLATES[event.eventType] || 'Thank you, {actor}!';
  const thankYou = clean(renderTemplate(template, values), settings.maximumCharacters);
  const viewerMessage = settings.viewerMessageEventTypes.has(event.eventType) ? clean(event.payload?.message, settings.maximumCharacters) : '';
  return filtered(clean([thankYou, viewerMessage].filter(Boolean).join(' '), settings.maximumCharacters), settings);
}

function filtered(output, settings) {
  if (!output) return '';
  const lower = output.toLowerCase();
  return settings.blockedTerms.some((term) => lower.includes(term)) ? '' : output;
}

function requestLimit(settings, platform) {
  return settings[`${platform}RequestCharacters`] || settings.maximumCharacters;
}

function estimatedDuration(text, wordsPerMinute) {
  const words = text.split(/\s+/u).filter(Boolean).length;
  return Math.max(2500, Math.min(30000, Math.ceil(words / wordsPerMinute * 60000) + 900));
}

function serialize(task) {
  operation = operation.then(task, task);
  return operation;
}

function rememberViewerCooldown(key, now, maximumAgeMs) {
  viewerCooldowns.delete(key);
  viewerCooldowns.set(key, now);
  for (const [candidate, at] of viewerCooldowns) {
    if (now - at <= maximumAgeMs && viewerCooldowns.size <= MAXIMUM_VIEWER_COOLDOWNS) break;
    viewerCooldowns.delete(candidate);
  }
}

async function reply(context, event, message) {
  try { await context.chat.send({ message: clean(message, 240), routing: 'source', sourcePlatform: event.platform, overflow: 'reject' }); }
  catch { /* A reply failure must never corrupt points or the speech queue. */ }
}

async function refundPoints(context, item, suffix) {
  if (!item.points) return;
  await context.viewerFoundation.mutate({ viewerId: item.points.viewerId, operation: 'refund', amount: item.points.amount, reason: 'Village Voice request refund', idempotencyKey: `${item.points.idempotencyKey}:${suffix}` });
}

async function drain(context) {
  if (stopped || speaking || paused || !queue.length) return;
  speaking = true;
  const item = queue.shift();
  const durationMs = estimatedDuration(item.text, item.wordsPerMinute);
  try {
    if (item.showOverlay) await context.overlay?.publish?.(`${MODULE_ID}.card.show`, {
      title: `${item.displayName} • ${String(item.platform).toUpperCase()}`,
      text: item.text,
      ...(item.avatarUrl ? { imageUrl: item.avatarUrl } : {}),
      durationMs,
      revealDurationMs: Math.max(1000, durationMs - 700),
      presentationMode: 'typewriter',
      style: item.overlayStyle
    });
    await context.streamerbot.runApprovedAction(SPEAK_ACTION_ID, { voiceRelayMessage: item.text, voiceRelayVoiceAlias: item.voiceAlias });
  } catch {
    await refundPoints(context, item, 'dispatch-failed').catch(() => undefined);
    if (item.showOverlay) await context.overlay?.publish?.(`${MODULE_ID}.card.hide`, {})?.catch(() => undefined);
    speaking = false;
    if (queue.length && !paused && !stopped) taskId = context.schedule.after(item.gapSeconds * 1000, () => serialize(async () => { taskId = undefined; await drain(context); }));
    return;
  }
  taskId = context.schedule.after(durationMs + item.gapSeconds * 1000, () => serialize(async () => {
    taskId = undefined;
    if (item.showOverlay) await context.overlay?.publish?.(`${MODULE_ID}.card.hide`, {})?.catch(() => undefined);
    speaking = false;
    await drain(context);
  }));
}

async function enqueueText(event, text, context, settings, points) {
  if (stopped || !text || queue.length >= settings.queueLimit) return false;
  queue.push({
    text, voiceAlias: settings.voiceAlias, gapSeconds: settings.gapSeconds, wordsPerMinute: settings.wordsPerMinute,
    displayName: clean(event.user?.displayName || event.user?.name, 80) || 'Viewer', platform: event.platform,
    avatarUrl: /^https:\/\//iu.test(event.user?.avatarUrl || '') ? clean(event.user.avatarUrl, 2048) : '',
    showOverlay: settings.showSpeechOverlay, points,
    overlayStyle: { backgroundMode: settings.overlayBackgroundMode, backgroundColor: settings.overlayBackgroundColor, backgroundOpacity: settings.overlayBackgroundOpacity, accentColor: settings.overlayAccentColor, textColor: settings.overlayTextColor, fontFamily: 'broadcast', fontSize: settings.overlayFontSize }
  });
  await drain(context);
  return true;
}

async function enqueueEvent(event, context, settings) {
  return enqueueText(event, textFor(event, settings), context, settings);
}

function viewerRequestText(event, settings) {
  const maximum = requestLimit(settings, event.platform);
  const raw = event.eventType === 'reward.redemption'
    ? event.payload?.input
    : Array.isArray(event.payload?.arguments) ? event.payload.arguments.join(' ') : '';
  return filtered(clean(raw, maximum), settings);
}

async function handleViewerRequest(event, context, settings) {
  if (!settings.viewerRequestsEnabled || event.metadata?.simulated === true || event.user?.actorType !== 'human') return false;
  const rewardId = clean(event.payload?.rewardId, 256);
  const nativeReward = event.eventType === 'reward.redemption'
    && event.payload?.verifiedTransport === true
    && ((event.platform === 'twitch' && settings.twitchRewardId && rewardId === settings.twitchRewardId)
      || (event.platform === 'kick' && settings.kickRewardId && rewardId === settings.kickRewardId));
  const pointsCommand = event.eventType === 'command.received'
    && settings.pointsPlatforms.has(event.platform)
    && clean(event.payload?.command, 64).toLowerCase() === settings.pointsCommand;
  if (!nativeReward && !pointsCommand) return false;
  const message = viewerRequestText(event, settings);
  if (!message) { await reply(context, event, `Please include a message after !${settings.pointsCommand}.`); return true; }
  const userId = clean(event.user?.id, 256);
  if (!userId) return true;
  const cooldownKey = `${event.platform}:${userId}`;
  const now = Date.now(); const lastAt = viewerCooldowns.get(cooldownKey) || 0;
  if (settings.viewerCooldownSeconds > 0 && now - lastAt < settings.viewerCooldownSeconds * 1000) { await reply(context, event, 'Please wait before requesting another TTS message.'); return true; }
  let points;
  if (pointsCommand) {
    const projection = await context.viewerFoundation.getProjection({ platform: event.platform, userId });
    if (!projection) { await reply(context, event, 'Your viewer points profile is not ready yet. Send another chat message and try again.'); return true; }
    const stableEventId = clean(event.eventId || event.source?.eventId, 100);
    if (!stableEventId) { await reply(context, event, 'This TTS request did not include a stable event ID, so no points were charged.'); return true; }
    const idempotencyKey = `village-voice:${stableEventId}`;
    try {
      await context.viewerFoundation.mutate({ viewerId: projection.viewerId, operation: 'spend', amount: settings.pointsCost, reason: 'Village Voice TTS request', idempotencyKey });
      points = { viewerId: projection.viewerId, amount: settings.pointsCost, idempotencyKey };
    } catch { await reply(context, event, `You need ${String(settings.pointsCost)} ${projection.currencyName || 'points'} for a TTS request.`); return true; }
  }
  const accepted = await enqueueText(event, message, context, settings, points);
  if (!accepted) {
    if (points) await refundPoints(context, { points }, 'queue-full').catch(() => undefined);
    await reply(context, event, 'The TTS queue is full. Your points were not kept.');
    return true;
  }
  rememberViewerCooldown(cooldownKey, now, Math.max(60_000, settings.viewerCooldownSeconds * 2000));
  return true;
}

function aggregationKey(event) {
  if (!['engagement.cheer', 'engagement.gift', 'channel.gift-subscription'].includes(event.eventType)) return '';
  return [event.eventType, event.platform, event.user?.id || event.user?.name || 'community', event.payload?.itemName || event.payload?.tier || ''].join(':');
}

async function queueEvent(event, context, settings) {
  const key = aggregationKey(event);
  if (!key) return enqueueEvent(event, context, settings);
  const existing = pendingAggregates.get(key);
  if (existing) {
    const current = Number(existing.event.payload?.quantity || 0);
    const added = Number(event.payload?.quantity || 0);
    existing.event = { ...existing.event, payload: { ...existing.event.payload, quantity: current + added } };
    return;
  }
  const pending = { event, taskId: undefined };
  pending.taskId = context.schedule.after(5000, () => serialize(async () => {
    pendingAggregates.delete(key);
    await enqueueEvent(pending.event, context, settings);
  }));
  pendingAggregates.set(key, pending);
}

async function processEvent(event, context) {
  const settings = settingsFor(context);
  if (event.eventType === CONTROL_EVENT) {
    const action = clean(event.payload?.action, 20);
    if (action === 'pause') paused = true;
    if (action === 'resume') { paused = false; await drain(context); }
    if (action === 'stop') {
      const abandoned = queue; paused = true; queue = []; speaking = false;
      for (const item of abandoned) await refundPoints(context, item, 'creator-stop').catch(() => undefined);
      if (taskId) context.schedule.cancel(taskId);
      taskId = undefined;
      for (const pending of pendingAggregates.values()) if (pending.taskId) context.schedule.cancel(pending.taskId);
      pendingAggregates.clear();
      await context.overlay?.publish?.(`${MODULE_ID}.card.hide`, {})?.catch(() => undefined);
    }
    return;
  }
  // TtsSpeak requires the exact name of an existing Speaker.bot voice alias.
  // Fail closed when setup is incomplete instead of filling Streamer.bot history
  // with requests Speaker.bot cannot render.
  if (!settings.enabled || !settings.voiceAlias || paused || stopped) return;
  if (await handleViewerRequest(event, context, settings)) return;
  await queueEvent(event, context, settings);
}

const module = {
  manifest,
  required: false,
  async start() { operation = Promise.resolve(); queue = []; speaking = false; paused = false; stopped = false; taskId = undefined; pendingAggregates.clear(); viewerCooldowns.clear(); },
  async stop(context) {
    stopped = true;
    if (taskId) context.schedule.cancel(taskId);
    taskId = undefined;
    for (const pending of pendingAggregates.values()) if (pending.taskId) context.schedule.cancel(pending.taskId);
    await operation.catch(() => undefined);
    const abandoned = queue; queue = []; paused = true; speaking = false;
    for (const item of abandoned) await refundPoints(context, item, 'stopped').catch(() => undefined);
    pendingAggregates.clear();
    viewerCooldowns.clear();
    await context.overlay?.publish?.(`${MODULE_ID}.card.hide`, {})?.catch(() => undefined);
    operation = Promise.resolve();
  },
  async onEvent(event, context) {
    await serialize(() => processEvent(event, context));
  }
};

export { textFor };
export default module;
