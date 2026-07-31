// Voice Relay turns normalized alerts into bounded, filtered Speaker.bot requests.
const CONTROL_EVENT = 'addon.thsv.voice-relay.control';
const SPEAK_ACTION_ID = '9d7b9f62-8f33-41a0-b7d8-a2d247a02fd3';
const ALERT_TYPES = Object.freeze(['channel.follow', 'channel.subscription', 'channel.membership', 'channel.gift-subscription', 'engagement.gift', 'engagement.donation', 'engagement.cheer', 'engagement.raid', 'engagement.super-chat', 'engagement.milestone']);
const ALL_TYPES = Object.freeze([...ALERT_TYPES, 'chat.message']);
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
const pendingAggregates = new Map();

const manifest = { contractVersion: '2.0.0-preview.1', moduleId: 'thsv.voice-relay', name: 'Voice Relay', version: '2.5.2', minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '2.5.2', maximumTestedBridgeVersion: '2.5.2', dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json', eventSubscriptions: [...ALL_TYPES, CONTROL_EVENT], commandsProvided: [], actionsProvided: [], browserSourcesProvided: [], dataStorageOwned: ['data/addons/thsv.voice-relay/', 'data/addons/.state/thsv.voice-relay/'], installationSteps: ['Connect Speaker.bot in Streamer.bot.', 'Import Voice Relay, approve only Speak, and test a harmless phrase.', 'Review filters and event types before enabling; attach Pause/Resume/Stop only to creator controls.'], uninstallationSteps: ['Uninstall Voice Relay. It retains no spoken text history.'], migrations: [], healthChecks: [{ id: 'thsv.voice-relay.runtime', description: 'Confirms bounded filtered Speaker.bot dispatch is available.' }] };

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
    allowChatRoles: new Set(Array.isArray(raw.allowChatRoles) ? raw.allowChatRoles : ['broadcaster', 'moderator']),
    blockedTerms: Array.isArray(raw.blockedTerms) ? raw.blockedTerms.map((value) => clean(value, 80).toLowerCase()).filter(Boolean).slice(0, 200) : []
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

async function drain(context) {
  if (speaking || paused || !queue.length) return;
  speaking = true;
  const item = queue.shift();
  try { await context.streamerbot.runApprovedAction(SPEAK_ACTION_ID, { voiceRelayMessage: item.text, voiceRelayVoiceAlias: item.voiceAlias }); }
  catch { /* Broker diagnostics retain the failure without retaining speech text. */ }
  finally {
    speaking = false;
    if (queue.length && !paused) taskId = context.schedule.after(item.gapSeconds * 1000, async () => { taskId = undefined; await drain(context); });
  }
}

async function enqueueEvent(event, context, settings) {
  const text = textFor(event, settings);
  if (!text || queue.length >= settings.queueLimit) return;
  queue.push({ text, voiceAlias: settings.voiceAlias, gapSeconds: settings.gapSeconds });
  await drain(context);
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
  pending.taskId = context.schedule.after(5000, async () => {
    pendingAggregates.delete(key);
    await enqueueEvent(pending.event, context, settings);
  });
  pendingAggregates.set(key, pending);
}

const module = {
  manifest,
  required: false,
  async stop(context) {
    queue = []; paused = true;
    if (taskId) context.schedule.cancel(taskId);
    taskId = undefined;
    for (const pending of pendingAggregates.values()) if (pending.taskId) context.schedule.cancel(pending.taskId);
    pendingAggregates.clear();
  },
  async onEvent(event, context) {
    const settings = settingsFor(context);
    if (event.eventType === CONTROL_EVENT) {
      const action = clean(event.payload?.action, 20);
      if (action === 'pause') paused = true;
      if (action === 'resume') { paused = false; await drain(context); }
      if (action === 'stop') {
        paused = true; queue = [];
        if (taskId) context.schedule.cancel(taskId);
        taskId = undefined;
        for (const pending of pendingAggregates.values()) if (pending.taskId) context.schedule.cancel(pending.taskId);
        pendingAggregates.clear();
      }
      return;
    }
    // TtsSpeak requires the exact name of an existing Speaker.bot voice alias.
    // Fail closed when setup is incomplete instead of filling Streamer.bot history
    // with requests Speaker.bot cannot render.
    if (!settings.enabled || !settings.voiceAlias || paused) return;
    await queueEvent(event, context, settings);
  }
};

export { textFor };
export default module;
