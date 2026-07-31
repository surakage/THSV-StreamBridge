// Subathon Timer keeps one bounded cross-platform countdown using StreamBridge's normalized
// live-state and alert events. It stores only timer counters, timestamps, and threshold progress.
const RESULT_EVENT_TYPES = Object.freeze([
  'stream.online',
  'stream.offline',
  'channel.follow',
  'channel.subscription',
  'channel.membership',
  'channel.gift-subscription',
  'engagement.gift',
  'engagement.cheer',
  'engagement.donation',
  'engagement.purchase',
  'engagement.milestone',
  'channel.raid',
  'command.received',
  'system.custom',
  'addon.thsv.subathon-timer.control',
]);
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok', 'streamlabs', 'kofi']);
const CONTROL_ACTIONS = Object.freeze(['start', 'pause', 'resume', 'reset', 'add-time']);

const manifest = {
  contractVersion: '2.0.0-preview.1',
  moduleId: 'thsv.subathon-timer',
  name: 'Subathon Timer',
  version: '2.6.0',
  minimumCoreVersion: '2.0.0-preview.1',
  maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '2.6.0', maximumTestedBridgeVersion: '2.6.0',
  dependencies: [],
  requiredCapabilities: [],
  configurationSchema: 'schemas/config.json',
  eventSubscriptions: RESULT_EVENT_TYPES,
  commandsProvided: [
    { id: 'subathon-timer.start', name: 'subathon-start' },
    { id: 'subathon-timer.pause', name: 'subathon-pause' },
    { id: 'subathon-timer.resume', name: 'subathon-resume' },
    { id: 'subathon-timer.reset', name: 'subathon-reset' },
    { id: 'subathon-timer.add-time', name: 'subathon-addtime' },
  ],
  actionsProvided: [],
  browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.subathon-timer/', 'data/addons/.state/thsv.subathon-timer/'],
  installationSteps: [
    'Install and enable the add-on, then choose your starting time, cap, and per-event bonuses.',
    'Use stream.online and stream.offline from your connected platform relays so the timer starts and pauses from real live state.',
    'Import the bundled Streamer.bot/THSV-StreamBridge-Subathon-Timer-2.6.0.sb package for Start, Pause, Resume, Reset, and Add Time actions.',
    'Attach those optional control actions to hotkeys, scene triggers, or buttons in Streamer.bot. The imported actions relay only bounded local timer controls.',
    'Optional: enable the moderator commands if you also want chat-based controls.',
    'Use the core-owned hosted add-on overlay URL shown in the wizard. It renders the timer without executing add-on-supplied browser code.',
    'The timer uses only normalized StreamBridge events. It does not invent a separate Streamer.bot timer or external API dependency.',
  ],
  uninstallationSteps: [
    'Uninstall the add-on. The timer state is preserved for a later reinstall unless you explicitly delete add-on data.',
  ],
  migrations: [],
  healthChecks: [
    { id: 'thsv.subathon-timer.runtime', description: 'Confirms bounded timer updates, live-state tracking, and per-event bonus handling.' },
  ],
};

const FALLBACKS = Object.freeze({
  enabled: true,
  enabledPlatforms: PLATFORMS,
  autoStartWhenLive: true,
  pauseWhenOffline: true,
  resetToStartingMinutesOnStreamOnline: true,
  allowSimulatedEvents: false,
  enableModeratorCommands: false,
  startCommandName: 'subathon-start',
  pauseCommandName: 'subathon-pause',
  resumeCommandName: 'subathon-resume',
  resetCommandName: 'subathon-reset',
  addTimeCommandName: 'subathon-addtime',
  defaultManualAddSeconds: 300,
  startingMinutes: 60,
  maximumMinutes: 720,
  followSeconds: 30,
  subscriptionSeconds: 300,
  membershipSeconds: 300,
  giftSubscriptionSecondsEach: 180,
  giftSecondsEach: 15,
  cheerBitsThreshold: 100,
  cheerThresholdAwardSeconds: 0,
  financialCurrency: 'USD',
  requireVerifiedFinancialEvents: true,
  donationSecondsPerWholeUnit: 0,
  purchaseSecondsPerWholeUnit: 0,
  raidBaseSeconds: 300,
  raidPerViewerSeconds: 5,
  minimumRaidViewers: 1,
  likeThreshold: 100,
  likeThresholdAwardSeconds: 45,
  hypeTrainLevelSeconds: 0,
  watchStreakSeconds: 0,
  modiversarySecondsPerMonth: 0,
  showOverlay: true,
  overlayLabel: 'SUBATHON',
  overlayFontFamily: 'display',
  overlayBackgroundMode: 'glass',
  overlayBackgroundColor: '#0b1017',
  overlayBackgroundOpacity: 0.88,
  overlayAccentColor: '#7ee0ff',
  overlayTextColor: '#eff7ff',
  overlayMutedColor: '#dfefff',
  overlayWarningColor: '#f0c15a',
  overlayCriticalColor: '#ff6b7d',
  overlayLiveColor: '#61f2a4',
  overlayBorderColor: '#85cbff',
  overlayShowProgressBar: true,
  warningMinutes: 15,
  criticalMinutes: 5,
});

function cleanText(value, maximum = 200) {
  const normalized = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '';
  return [...normalized].slice(0, maximum).join('');
}

function platformOf(value) {
  return PLATFORMS.includes(value) ? value : undefined;
}

function positiveInteger(value, minimum = 1, fallback = 0) {
  return Number.isInteger(value) && value >= minimum ? value : fallback;
}

function nonNegativeInteger(value, fallback = 0) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function settingsFor(context) {
  return { ...FALLBACKS, ...(context.settings ?? {}) };
}

function cleanCommandName(value, fallback) {
  const normalized = cleanText(value, 64).toLowerCase();
  return /^[a-z][a-z0-9-]{0,63}$/u.test(normalized) ? normalized : fallback;
}

function clampNumber(value, minimum, maximum, fallback) {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Number(value))) : fallback;
}

function hexColor(value, fallback) {
  const normalized = cleanText(value, 16);
  return /^#[0-9a-fA-F]{6}$/u.test(normalized) ? normalized : fallback;
}

function overlayStyle(settings) {
  return {
    fontFamily: ['display', 'broadcast', 'mono'].includes(settings.overlayFontFamily) ? settings.overlayFontFamily : 'display',
    backgroundMode: ['glass', 'solid', 'none'].includes(settings.overlayBackgroundMode) ? settings.overlayBackgroundMode : 'glass',
    backgroundColor: hexColor(settings.overlayBackgroundColor, '#0b1017'),
    backgroundOpacity: clampNumber(settings.overlayBackgroundOpacity, 0, 1, 0.88),
    accentColor: hexColor(settings.overlayAccentColor, '#7ee0ff'),
    textColor: hexColor(settings.overlayTextColor, '#eff7ff'),
    mutedColor: hexColor(settings.overlayMutedColor, '#dfefff'),
    warningColor: hexColor(settings.overlayWarningColor, '#f0c15a'),
    criticalColor: hexColor(settings.overlayCriticalColor, '#ff6b7d'),
    liveColor: hexColor(settings.overlayLiveColor, '#61f2a4'),
    borderColor: hexColor(settings.overlayBorderColor, '#85cbff'),
    showProgressBar: settings.overlayShowProgressBar !== false,
  };
}

function sanitizeTimestamp(value) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function sanitizeThresholds(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item.key === 'string' && Number.isFinite(item.buckets))
    .slice(-20)
    .map((item) => ({ key: cleanText(item.key, 120), buckets: nonNegativeInteger(item.buckets) }))
    .filter((item) => item.key.length > 0);
}

function sanitizeCounters(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item.key === 'string' && Number.isFinite(item.value))
    .slice(-40)
    .map((item) => ({ key: cleanText(item.key, 120), value: nonNegativeInteger(item.value) }))
    .filter((item) => item.key.length > 0);
}

export function sanitizeState(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    initialized: source.initialized === true,
    remainingSeconds: nonNegativeInteger(source.remainingSeconds),
    running: source.running === true,
    updatedAt: sanitizeTimestamp(source.updatedAt),
    livePlatforms: Array.isArray(source.livePlatforms) ? [...new Set(source.livePlatforms.map(platformOf).filter(Boolean))] : [],
    sessionCount: nonNegativeInteger(source.sessionCount),
    lastReason: cleanText(source.lastReason, 120),
    lastAwardSeconds: nonNegativeInteger(source.lastAwardSeconds),
    thresholds: sanitizeThresholds(source.thresholds),
    counters: sanitizeCounters(source.counters),
  };
}

function initializeState(state, settings) {
  if (state.initialized) return state;
  return {
    ...state,
    initialized: true,
    remainingSeconds: Math.min(settings.maximumMinutes * 60, Math.max(0, settings.startingMinutes * 60)),
    running: false,
    updatedAt: Date.now(),
  };
}

export function formatRemaining(totalSeconds) {
  const seconds = Math.max(0, nonNegativeInteger(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function applyElapsed(state, now = Date.now()) {
  const next = { ...state };
  if (!next.running) {
    next.updatedAt = sanitizeTimestamp(now);
    return next;
  }
  const updatedAt = sanitizeTimestamp(next.updatedAt);
  const elapsed = Math.floor((sanitizeTimestamp(now) - updatedAt) / 1000);
  if (elapsed <= 0) return next;
  next.remainingSeconds = Math.max(0, next.remainingSeconds - elapsed);
  next.updatedAt = updatedAt + elapsed * 1000;
  if (next.remainingSeconds === 0) {
    next.running = false;
    next.lastReason = 'expired';
    next.lastAwardSeconds = 0;
  }
  return next;
}

function isModeratorLike(user) {
  const roles = Array.isArray(user?.roles) ? user.roles.map((role) => cleanText(role, 40).toLowerCase()) : [];
  return roles.includes('moderator') || roles.includes('mod') || roles.includes('broadcaster') || roles.includes('host');
}

function thresholdBuckets(state, key) {
  return state.thresholds.find((entry) => entry.key === key)?.buckets ?? 0;
}

function setThresholdBuckets(state, key, buckets) {
  const next = state.thresholds.filter((entry) => entry.key !== key);
  next.push({ key, buckets: nonNegativeInteger(buckets) });
  return { ...state, thresholds: next.slice(-20) };
}

function counterValue(state, key) {
  return state.counters.find((entry) => entry.key === key)?.value ?? 0;
}

function setCounterValue(state, key, value) {
  const next = state.counters.filter((entry) => entry.key !== key);
  next.push({ key, value: nonNegativeInteger(value) });
  return { ...state, counters: next.slice(-40) };
}

function amountValue(value) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/u.test(value)) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function hasVerifiedSource(event) {
  const unverified = Array.isArray(event.metadata?.unverifiedFields) ? event.metadata.unverifiedFields : [];
  return !unverified.includes('source.eventId');
}

export function awardForEvent(event, settings, state) {
  if (!event || !RESULT_EVENT_TYPES.includes(event.eventType)) return { seconds: 0, reason: '' };
  if (event.metadata?.simulated === true && settings.allowSimulatedEvents !== true) return { seconds: 0, reason: '' };
  if (!platformOf(event.platform) || !settings.enabledPlatforms.includes(event.platform)) return { seconds: 0, reason: '' };

  if (event.eventType === 'channel.follow') return { seconds: Math.max(0, settings.followSeconds), reason: 'follow' };
  if (event.eventType === 'channel.subscription') return { seconds: Math.max(0, settings.subscriptionSeconds), reason: 'subscription' };
  if (event.eventType === 'channel.membership') return { seconds: Math.max(0, settings.membershipSeconds), reason: 'membership' };
  if (event.eventType === 'channel.gift-subscription') {
    const quantity = positiveInteger(event.payload?.quantity, 1, 1);
    return { seconds: Math.max(0, settings.giftSubscriptionSecondsEach) * quantity, reason: 'gift-subscription' };
  }
  if (event.eventType === 'engagement.gift') {
    const quantity = positiveInteger(event.payload?.quantity, 1, 1);
    return { seconds: Math.max(0, settings.giftSecondsEach) * quantity, reason: 'gift' };
  }
  if (event.eventType === 'engagement.cheer') {
    const bits = positiveInteger(event.payload?.quantity, 1, 0);
    const threshold = positiveInteger(settings.cheerBitsThreshold, 1, 0);
    if (bits === 0 || threshold === 0) return { seconds: 0, reason: '' };
    const key = `${event.platform}:cheer-bits`;
    const previous = counterValue(state, key);
    const total = previous + bits;
    const completed = Math.max(0, Math.floor(total / threshold) - Math.floor(previous / threshold));
    return {
      seconds: completed * Math.max(0, settings.cheerThresholdAwardSeconds),
      reason: completed > 0 ? 'cheer-threshold' : '',
      counterKey: key,
      counterValue: total,
    };
  }
  if (event.eventType === 'engagement.donation' || event.eventType === 'engagement.purchase') {
    if (settings.requireVerifiedFinancialEvents !== false && !hasVerifiedSource(event)) return { seconds: 0, reason: '' };
    const expectedCurrency = cleanText(settings.financialCurrency, 3).toUpperCase();
    const currency = cleanText(event.payload?.currency, 3).toUpperCase();
    if (!/^[A-Z]{3}$/u.test(expectedCurrency) || currency !== expectedCurrency) return { seconds: 0, reason: '' };
    const wholeUnits = Math.floor(amountValue(event.payload?.amount));
    const secondsPerUnit = event.eventType === 'engagement.donation'
      ? Math.max(0, settings.donationSecondsPerWholeUnit)
      : Math.max(0, settings.purchaseSecondsPerWholeUnit);
    return {
      seconds: wholeUnits * secondsPerUnit,
      reason: wholeUnits > 0 && secondsPerUnit > 0 ? (event.eventType === 'engagement.donation' ? 'donation' : 'purchase') : '',
    };
  }
  if (event.eventType === 'channel.raid') {
    const viewers = positiveInteger(event.payload?.quantity, 1, 0);
    if (viewers < settings.minimumRaidViewers) return { seconds: 0, reason: '' };
    return { seconds: Math.max(0, settings.raidBaseSeconds) + Math.max(0, settings.raidPerViewerSeconds) * viewers, reason: 'raid' };
  }
  if (event.eventType === 'engagement.milestone' && cleanText(event.payload?.metric, 40).toLowerCase() === 'likes') {
    const threshold = positiveInteger(settings.likeThreshold, 1, 0);
    if (threshold === 0) return { seconds: 0, reason: '' };
    const totalLikes = nonNegativeInteger(event.payload?.value);
    const key = `${event.platform}:likes`;
    const previous = thresholdBuckets(state, key);
    const nextBuckets = Math.floor(totalLikes / threshold);
    const delta = Math.max(0, nextBuckets - previous);
    return { seconds: delta * Math.max(0, settings.likeThresholdAwardSeconds), reason: delta > 0 ? 'likes-threshold' : '', thresholdKey: key, thresholdBuckets: nextBuckets };
  }
  if (event.eventType === 'engagement.milestone' && cleanText(event.payload?.metric, 40).toLowerCase() === 'hype-train') {
    const level = nonNegativeInteger(event.payload?.value);
    const id = cleanText(event.payload?.hypeTrainId, 80) || 'current';
    const key = `${event.platform}:hype-train:${id}`;
    const previous = thresholdBuckets(state, key);
    const delta = Math.max(0, level - previous);
    return {
      seconds: delta * Math.max(0, settings.hypeTrainLevelSeconds),
      reason: delta > 0 && settings.hypeTrainLevelSeconds > 0 ? 'hype-train-level' : '',
      thresholdKey: key,
      thresholdBuckets: Math.max(previous, level),
    };
  }
  if (event.eventType === 'engagement.milestone' && cleanText(event.payload?.metric, 40).toLowerCase() === 'watch-streak') {
    return { seconds: Math.max(0, settings.watchStreakSeconds), reason: settings.watchStreakSeconds > 0 ? 'watch-streak' : '' };
  }
  if (event.eventType === 'engagement.milestone' && cleanText(event.payload?.metric, 40).toLowerCase() === 'modiversary') {
    const months = nonNegativeInteger(event.payload?.value);
    return { seconds: months * Math.max(0, settings.modiversarySecondsPerMonth), reason: months > 0 && settings.modiversarySecondsPerMonth > 0 ? 'modiversary' : '' };
  }
  return { seconds: 0, reason: '' };
}

let tickTimer;
let stopped = false;
let operation = Promise.resolve();

function serialize(task) {
  operation = operation.then(task, task);
  return operation;
}

function cancelTick(context) {
  if (tickTimer !== undefined) context.schedule.cancel(tickTimer);
  tickTimer = undefined;
}

async function publishState(context, settings, state) {
  if (!settings.showOverlay) return;
  const moduleId = cleanText(context.moduleId, 120) || manifest.moduleId;
  try {
    await context.overlay.publish(`${moduleId}.timer.update`, {
      moduleId,
      label: cleanText(settings.overlayLabel, 80) || 'SUBATHON',
      remainingSeconds: state.remainingSeconds,
      maximumSeconds: Math.max(0, settings.maximumMinutes * 60),
      remainingText: formatRemaining(state.remainingSeconds),
      running: state.running,
      live: state.livePlatforms.length > 0,
      livePlatforms: state.livePlatforms,
      warning: state.remainingSeconds > 0 && state.remainingSeconds <= settings.warningMinutes * 60,
      critical: state.remainingSeconds > 0 && state.remainingSeconds <= settings.criticalMinutes * 60,
      sessionCount: state.sessionCount,
      lastReason: state.lastReason,
      lastAwardSeconds: state.lastAwardSeconds,
      style: overlayStyle(settings),
      emittedAt: new Date().toISOString(),
    });
  } catch {
    // A closed optional overlay must never stop timer processing.
  }
}

function scheduleTick(context, state) {
  cancelTick(context);
  if (!state.running || state.remainingSeconds === 0 || stopped) return;
  tickTimer = context.schedule.after(1_000, () => {
    tickTimer = undefined;
    return serialize(() => handleTick(context));
  });
}

async function persist(context, settings, state) {
  await context.state.write(state);
  await publishState(context, settings, state);
  scheduleTick(context, state);
}

async function handleTick(context) {
  const settings = settingsFor(context);
  let state = initializeState(sanitizeState(await context.state.read()), settings);
  state = applyElapsed(state);
  await persist(context, settings, state);
}

async function handleStreamLifecycle(event, context, settings) {
  let state = initializeState(sanitizeState(await context.state.read()), settings);
  state = applyElapsed(state);
  const platform = platformOf(event.platform);
  if (!platform || !settings.enabledPlatforms.includes(platform)) return persist(context, settings, state);

  const livePlatforms = new Set(state.livePlatforms);
  const wasLive = livePlatforms.size > 0;
  if (event.eventType === 'stream.online') livePlatforms.add(platform);
  if (event.eventType === 'stream.offline') livePlatforms.delete(platform);
  state.livePlatforms = [...livePlatforms];

  if (event.eventType === 'stream.online' && !wasLive && settings.resetToStartingMinutesOnStreamOnline) {
    state.remainingSeconds = Math.min(settings.maximumMinutes * 60, Math.max(0, settings.startingMinutes * 60));
    state.thresholds = [];
    state.counters = [];
    state.sessionCount += 1;
  }
  if (event.eventType === 'stream.online' && settings.autoStartWhenLive && state.remainingSeconds > 0) {
    state.running = true;
    state.updatedAt = Date.now();
  }
  if (event.eventType === 'stream.offline' && livePlatforms.size === 0 && settings.pauseWhenOffline) {
    state.running = false;
    state.updatedAt = Date.now();
  }

  state.lastReason = event.eventType === 'stream.online' ? 'stream-online' : 'stream-offline';
  state.lastAwardSeconds = 0;
  await persist(context, settings, state);
}

async function handleAward(event, context, settings) {
  let state = initializeState(sanitizeState(await context.state.read()), settings);
  state = applyElapsed(state);
  const award = awardForEvent(event, settings, state);
  if (award.thresholdKey) state = setThresholdBuckets(state, award.thresholdKey, award.thresholdBuckets);
  if (award.counterKey) state = setCounterValue(state, award.counterKey, award.counterValue);
  if (award.seconds <= 0) return persist(context, settings, state);

  const maximumSeconds = Math.max(0, settings.maximumMinutes * 60);
  state.remainingSeconds = Math.min(maximumSeconds, state.remainingSeconds + award.seconds);
  if (state.livePlatforms.length > 0) {
    state.running = true;
    state.updatedAt = Date.now();
  }
  state.lastReason = award.reason;
  state.lastAwardSeconds = award.seconds;
  await persist(context, settings, state);
}

async function applyControl(action, seconds, context, settings, reason) {
  let state = initializeState(sanitizeState(await context.state.read()), settings);
  state = applyElapsed(state);
  const capSeconds = Math.max(0, settings.maximumMinutes * 60);
  if (action === 'start') {
    if (state.remainingSeconds > 0) state.running = true;
    state.updatedAt = Date.now();
  } else if (action === 'pause') {
    state.running = false;
    state.updatedAt = Date.now();
  } else if (action === 'resume') {
    if (state.remainingSeconds > 0) state.running = true;
    state.updatedAt = Date.now();
  } else if (action === 'reset') {
    state.remainingSeconds = Math.min(capSeconds, Math.max(0, settings.startingMinutes * 60));
    state.running = state.livePlatforms.length > 0 ? settings.autoStartWhenLive : false;
    state.updatedAt = Date.now();
    state.thresholds = [];
    state.counters = [];
  } else if (action === 'add-time') {
    state.remainingSeconds = Math.min(capSeconds, Math.max(0, state.remainingSeconds + Math.max(0, seconds)));
    if (state.livePlatforms.length > 0 && state.remainingSeconds > 0) state.running = true;
    state.updatedAt = Date.now();
  }
  state.lastReason = reason;
  state.lastAwardSeconds = action === 'add-time' ? Math.max(0, seconds) : 0;
  await persist(context, settings, state);
}

function controlPayload(event) {
  if (event.eventType !== 'system.custom' && event.eventType !== 'addon.thsv.subathon-timer.control') return undefined;
  const moduleId = event.eventType === 'addon.thsv.subathon-timer.control'
    ? 'thsv.subathon-timer'
    : cleanText(event.payload?.moduleId, 120);
  const action = cleanText(event.payload?.action, 40).toLowerCase();
  if (moduleId !== 'thsv.subathon-timer' || !CONTROL_ACTIONS.includes(action)) return undefined;
  return { action, seconds: nonNegativeInteger(event.payload?.seconds) };
}

function commandControl(event, settings) {
  if (event.eventType !== 'command.received' || settings.enableModeratorCommands !== true) return undefined;
  if (!isModeratorLike(event.user)) return undefined;
  const command = cleanText(event.payload?.command, 80).toLowerCase();
  const start = cleanCommandName(settings.startCommandName, 'subathon-start');
  const pause = cleanCommandName(settings.pauseCommandName, 'subathon-pause');
  const resume = cleanCommandName(settings.resumeCommandName, 'subathon-resume');
  const reset = cleanCommandName(settings.resetCommandName, 'subathon-reset');
  const addTime = cleanCommandName(settings.addTimeCommandName, 'subathon-addtime');
  if (command === start) return { action: 'start', seconds: 0 };
  if (command === pause) return { action: 'pause', seconds: 0 };
  if (command === resume) return { action: 'resume', seconds: 0 };
  if (command === reset) return { action: 'reset', seconds: 0 };
  if (command === addTime) {
    const raw = Array.isArray(event.payload?.arguments) ? event.payload.arguments[0] : undefined;
    const parsed = Number.parseInt(cleanText(raw, 20), 10);
    return { action: 'add-time', seconds: Number.isFinite(parsed) && parsed > 0 ? parsed : Math.max(0, settings.defaultManualAddSeconds) };
  }
  return undefined;
}

async function handleEvent(event, context) {
  const settings = settingsFor(context);
  if (!settings.enabled) return;
  if (!RESULT_EVENT_TYPES.includes(event.eventType)) return;
  const control = controlPayload(event) ?? commandControl(event, settings);
  if (control !== undefined) return applyControl(control.action, control.seconds, context, settings, `manual-${control.action}`);
  if (event.eventType === 'stream.online' || event.eventType === 'stream.offline') return handleStreamLifecycle(event, context, settings);
  if (event.eventType === 'command.received' || event.eventType === 'system.custom') return;
  return handleAward(event, context, settings);
}

export default {
  manifest,
  required: false,
  async start(context) {
    stopped = false;
    operation = Promise.resolve();
    const settings = settingsFor(context);
    const state = initializeState(sanitizeState(await context.state.read()), settings);
    await persist(context, settings, applyElapsed(state));
  },
  async stop(context) {
    stopped = true;
    cancelTick(context);
    await operation;
  },
  async onEvent(event, context) {
    await serialize(() => handleEvent(event, context));
  },
};
