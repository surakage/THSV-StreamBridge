// Stream Labels projects equivalent multi-platform events into a small set of persistent,
// privacy-minimal OBS labels. It stores only the latest display value for each label.
const MODULE_ID = 'thsv.stream-labels';
const LABEL_KEYS = Object.freeze(['follower', 'member', 'gift-membership', 'support', 'raid', 'reward', 'latest']);
const PLATFORM = /^(twitch|youtube|kick|tiktok|streamlabs|kofi)$/u;
const FALLBACKS = Object.freeze({
  enabled: true,
  enabledPlatforms: ['twitch', 'youtube', 'kick', 'tiktok', 'streamlabs', 'kofi'],
  enabledLabels: [...LABEL_KEYS],
  showSimulatedPreviews: true,
  maximumNameLength: 48,
  followerTitle: 'Latest Follower',
  memberTitle: 'Latest Member',
  giftMembershipTitle: 'Latest Gift Membership',
  supportTitle: 'Latest Support',
  raidTitle: 'Latest Raid',
  rewardTitle: 'Latest Reward',
  latestTitle: 'Latest Event',
  showLabelTitle: true,
  showPlatform: true,
  backgroundMode: 'glass',
  backgroundColor: '#101820',
  backgroundOpacity: 0.88,
  accentColor: '#7ff5cc',
  textColor: '#ffffff',
  fontFamily: 'broadcast',
  fontSize: 42,
  textAlign: 'left',
});
const manifest = {
  contractVersion: '2.0.0-preview.1',
  moduleId: MODULE_ID,
  name: 'Stream Labels',
  version: '4.0.9',
  minimumCoreVersion: '2.0.0-preview.1',
  maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.9', maximumTestedBridgeVersion: '4.0.9',
  dependencies: [],
  requiredCapabilities: [],
  configurationSchema: 'schemas/config.json',
  eventSubscriptions: [
    'channel.follow', 'channel.subscription', 'channel.membership', 'channel.gift-subscription',
    'engagement.gift', 'engagement.donation', 'engagement.cheer', 'engagement.super-chat',
    'channel.raid', 'engagement.milestone', 'reward.redemption',
  ],
  commandsProvided: [],
  actionsProvided: [],
  browserSourcesProvided: [],
  dataStorageOwned: [`data/addons/${MODULE_ID}/`, `data/addons/.state/${MODULE_ID}/`],
  installationSteps: [
    'Install and enable Stream Labels. No separate Streamer.bot import or direct trigger is required.',
    'Choose the platforms, label groups, and simple visual style in the wizard.',
    'Copy one individual label URL or the combined preview URL into an OBS, Meld, or Streamlabs browser source.',
    'Use the normal StreamBridge simulator to verify mappings before going live.',
  ],
  uninstallationSteps: ['Uninstall the add-on. Its latest label values remain preserved for a later reinstall.'],
  migrations: [],
  healthChecks: [{ id: `${MODULE_ID}.runtime`, description: 'Confirms bounded latest-event persistence and namespaced overlay publication.' }],
};
let simulatedLabels = {};
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
function settingsFor(context) {
  const raw = { ...FALLBACKS, ...(context.settings || {}) };
  return {
    ...raw,
    enabledPlatforms: new Set(Array.isArray(raw.enabledPlatforms) ? raw.enabledPlatforms.filter((item) => PLATFORM.test(item)) : FALLBACKS.enabledPlatforms),
    enabledLabels: new Set(Array.isArray(raw.enabledLabels) ? raw.enabledLabels.filter((item) => LABEL_KEYS.includes(item)) : FALLBACKS.enabledLabels),
    maximumNameLength: integer(raw.maximumNameLength, 12, 100, 48),
    backgroundOpacity: number(raw.backgroundOpacity, 0, 1, 0.88),
    fontSize: integer(raw.fontSize, 18, 96, 42),
  };
}
function emptyState() { return { version: 1, labels: {} }; }
function safeLabel(value) {
  if (!value || typeof value !== 'object') return undefined;
  const key = clean(value.key, 32);
  if (!LABEL_KEYS.includes(key)) return undefined;
  const at = Number.isSafeInteger(value.at) && value.at >= 0 ? value.at : 0;
  const eventId = clean(value.eventId, 256);
  const title = clean(value.title, 80);
  const valueText = clean(value.value, 240);
  const platform = clean(value.platform, 32);
  if (!eventId || !title || !valueText || !PLATFORM.test(platform)) return undefined;
  return { key, eventId, title, value: valueText, platform, eventType: clean(value.eventType, 80), at };
}
function sanitizeState(value) {
  const result = emptyState();
  if (!value || typeof value !== 'object' || !value.labels || typeof value.labels !== 'object') return result;
  for (const key of LABEL_KEYS) {
    const label = safeLabel(value.labels[key]);
    if (label) result.labels[key] = label;
  }
  return result;
}
function displayName(event, settings) {
  return clean(event.user?.displayName || event.user?.name || event.channel?.name || 'Someone', settings.maximumNameLength) || 'Someone';
}
function titleFor(key, settings) {
  const names = {
    follower: settings.followerTitle,
    member: settings.memberTitle,
    'gift-membership': settings.giftMembershipTitle,
    support: settings.supportTitle,
    raid: settings.raidTitle,
    reward: settings.rewardTitle,
    latest: settings.latestTitle,
  };
  return clean(names[key], 80) || FALLBACKS[`${key.replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())}Title`] || 'Latest Event';
}
function amountText(payload) {
  const amount = clean(payload?.amount, 40);
  const currency = clean(payload?.currency, 12);
  return amount ? `${amount}${currency ? ` ${currency}` : ''}` : '';
}
function positiveQuantity(payload) {
  return Number.isSafeInteger(payload?.quantity) && payload.quantity > 0 ? payload.quantity : undefined;
}
function eventDescription(event, settings) {
  const name = displayName(event, settings);
  const quantity = positiveQuantity(event.payload);
  const amount = amountText(event.payload);
  if (event.eventType === 'channel.follow') return name;
  if (event.eventType === 'channel.subscription' || event.eventType === 'channel.membership') {
    const months = Number.isSafeInteger(event.payload?.months) && event.payload.months > 1 ? ` · ${event.payload.months} months` : '';
    return `${name}${months}`;
  }
  if (event.eventType === 'channel.gift-subscription') return `${name}${quantity ? ` · ${quantity} gifted` : ' · gifted membership'}`;
  if (event.eventType === 'engagement.gift') return `${name}${quantity ? ` · ${quantity}×` : ''}${clean(event.payload?.itemName, 80) ? ` ${clean(event.payload.itemName, 80)}` : ' · gift'}`;
  if (event.eventType === 'engagement.cheer') return `${name}${quantity ? ` · ${quantity} bits` : amount ? ` · ${amount}` : ' · cheer'}`;
  if (event.eventType === 'engagement.super-chat' || event.eventType === 'engagement.donation') return `${name}${amount ? ` · ${amount}` : ''}`;
  if (event.eventType === 'engagement.milestone') return `${name}${Number.isFinite(event.payload?.value) ? ` · ${event.payload.value}` : ''}${clean(event.payload?.metric, 40) ? ` ${clean(event.payload.metric, 40)}` : ''}`;
  if (event.eventType === 'channel.raid') return `${name}${quantity ? ` · ${quantity} viewers` : ''}`;
  if (event.eventType === 'reward.redemption') return `${name}${clean(event.payload?.rewardTitle, 100) ? ` · ${clean(event.payload.rewardTitle, 100)}` : ''}`;
  return name;
}
function primaryKey(event) {
  if (event.eventType === 'channel.follow') return 'follower';
  if (event.eventType === 'channel.subscription' || event.eventType === 'channel.membership') return 'member';
  if (event.eventType === 'channel.gift-subscription') return 'gift-membership';
  if (['engagement.gift', 'engagement.donation', 'engagement.cheer', 'engagement.super-chat', 'engagement.milestone'].includes(event.eventType)) return 'support';
  if (event.eventType === 'channel.raid') return 'raid';
  if (event.eventType === 'reward.redemption') return 'reward';
  return undefined;
}
function overlayPayload(state, settings, preview = false) {
  return {
    labels: Object.fromEntries(Object.entries(state.labels).filter(([key]) => settings.enabledLabels.has(key))),
    enabledLabels: [...settings.enabledLabels],
    preview,
    style: {
      showLabelTitle: settings.showLabelTitle === true,
      showPlatform: settings.showPlatform === true,
      backgroundMode: ['glass', 'solid', 'none'].includes(settings.backgroundMode) ? settings.backgroundMode : 'glass',
      backgroundColor: settings.backgroundColor,
      backgroundOpacity: settings.backgroundOpacity,
      accentColor: settings.accentColor,
      textColor: settings.textColor,
      fontFamily: ['broadcast', 'display', 'serif', 'mono'].includes(settings.fontFamily) ? settings.fontFamily : 'broadcast',
      fontSize: settings.fontSize,
      textAlign: ['left', 'center', 'right'].includes(settings.textAlign) ? settings.textAlign : 'left',
    },
  };
}
async function publish(state, settings, context, preview = false) {
  await context.overlay.publish(`${MODULE_ID}.labels.update`, overlayPayload(state, settings, preview), { lane: preview ? 'preview' : 'persistent' });
}
export async function processStreamLabelEvent(event, context, now = Date.now()) {
  const settings = settingsFor(context);
  if (!settings.enabled || !settings.enabledPlatforms.has(event.platform)) return undefined;
  const key = primaryKey(event);
  if (!key) return undefined;
  const simulated = event.metadata?.simulated === true;
  if (simulated && settings.showSimulatedPreviews !== true) return undefined;
  const state = sanitizeState(await context.state.read());
  const eventId = clean(event.source?.eventId || event.eventId, 256);
  if (!eventId) return undefined;
  const value = eventDescription(event, settings);
  const label = { key, eventId, title: titleFor(key, settings), value, platform: event.platform, eventType: event.eventType, at: now };
  const latest = { ...label, key: 'latest', title: titleFor('latest', settings) };
  if (simulated) simulatedLabels = { ...simulatedLabels, [key]: label, latest };
  else { delete simulatedLabels[key]; delete simulatedLabels.latest; }
  const previewState = { ...state, labels: { ...state.labels, ...(simulated ? simulatedLabels : {}), [key]: label, latest } };
  if (!simulated) await context.state.write(previewState);
  await publish(previewState, settings, context, simulated);
  return { key, value, simulated, persisted: !simulated };
}
export { LABEL_KEYS, emptyState as emptyStreamLabelState, overlayPayload, primaryKey, sanitizeState as sanitizeStreamLabelState };
export default {
  manifest,
  required: false,
  async start(context) {
    simulatedLabels = {};
    operation = Promise.resolve();
    const settings = settingsFor(context);
    if (!settings.enabled) return;
    const state = sanitizeState(await context.state.read());
    await context.state.write(state);
    await publish(state, settings, context);
  },
  async stop() { await operation.catch(() => undefined); operation = Promise.resolve(); simulatedLabels = {}; },
  async onEvent(event, context) { operation = operation.then(() => processStreamLabelEvent(event, context), () => processStreamLabelEvent(event, context)); await operation; },
};
