// Ad Break Companion turns Twitch's Upcoming Ad and Ad Run triggers into one compact countdown overlay.
// It stores only bounded timing state and never starts, snoozes, or otherwise controls Twitch ads.
const MODULE_ID = 'thsv.ad-break-companion';
const UPCOMING_EVENT = `${MODULE_ID.replace(/^thsv\./u, 'addon.thsv.')}.upcoming`;
const STARTED_EVENT = `${MODULE_ID.replace(/^thsv\./u, 'addon.thsv.')}.started`;
const CONTROL_EVENT = `${MODULE_ID.replace(/^thsv\./u, 'addon.thsv.')}.control`;

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Ad Break Companion', version: '4.0.4',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.4', maximumTestedBridgeVersion: '4.0.4',
  dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: [UPCOMING_EVENT, STARTED_EVENT, CONTROL_EVENT], commandsProvided: [], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: [`data/addons/${MODULE_ID}/`, `data/addons/.state/${MODULE_ID}/`],
  installationSteps: [
    'Install and enable the add-on, then review the countdown wording and colors.',
    'Import the bundled Streamer.bot package into its own THSV Addon - Ad Break Companion group.',
    'Attach Twitch > Ads > Upcoming Ad to the Upcoming Ad Intake action.',
    'Attach Twitch > Ads > Ad Run to the Ad Run Intake action.',
    'Add the Ad Break Companion overlay URL shown by the wizard to OBS, Meld, or Streamlabs Desktop.',
    'Run Preview Upcoming and Preview Active while offline to size both states, then run Clear Display.',
  ],
  uninstallationSteps: ['Uninstall the add-on. Its small timing state remains unless add-on data is explicitly deleted.'], migrations: [],
  healthChecks: [{ id: `${MODULE_ID}.runtime`, description: 'Confirms Twitch ad timing events, bounded scheduling, persistence, and overlay publishing.' }],
};

const FALLBACKS = Object.freeze({
  enabled: true, leadSeconds: 60, startGraceSeconds: 15, allowTriggerTests: true,
  upcomingLabel: 'AD BREAK IN', activeLabel: 'AD BREAK', upcomingMessage: 'A quick break is coming up', activeMessage: 'The stream will continue after this break',
  overlayBackgroundMode: 'glass', overlayBackgroundColor: '#101722', overlayBackgroundOpacity: 0.9,
  overlayAccentColor: '#f4c95d', overlayTextColor: '#ffffff', overlayMutedColor: '#d9e2ef', overlayCriticalColor: '#ff6b7d', overlayBorderColor: '#f4c95d',
});

function cleanText(value, maximum = 160) {
  const normalized = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '';
  return [...normalized].slice(0, maximum).join('');
}
function integer(value, minimum, maximum, fallback) { return Number.isInteger(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback; }
function number(value, minimum, maximum, fallback) { return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Number(value))) : fallback; }
function hexColor(value, fallback) { const text = cleanText(value, 16); return /^#[0-9a-fA-F]{6}$/u.test(text) ? text : fallback; }
function settingsFor(context) { return { ...FALLBACKS, ...(context.settings ?? {}) }; }
function formatRemaining(seconds) { const value = integer(seconds, 0, 18_000, 0); return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }

export function sanitizeAdState(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    phase: ['idle', 'scheduled', 'awaiting-start', 'active'].includes(source.phase) ? source.phase : 'idle',
    targetAt: integer(source.targetAt, 0, Number.MAX_SAFE_INTEGER, 0),
    expiresAt: integer(source.expiresAt, 0, Number.MAX_SAFE_INTEGER, 0),
    maximumSeconds: integer(source.maximumSeconds, 1, 18_000, 60),
    adLengthSeconds: integer(source.adLengthSeconds, 1, 18_000, 30),
    snoozesLeft: integer(source.snoozesLeft, 0, 100, 0),
    simulated: source.simulated === true,
    updatedAt: integer(source.updatedAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
  };
}

export function deriveAdView(stateValue, settingsValue, now = Date.now()) {
  const state = sanitizeAdState(stateValue); const settings = { ...FALLBACKS, ...(settingsValue ?? {}) };
  const leadSeconds = integer(settings.leadSeconds, 15, 300, FALLBACKS.leadSeconds);
  if (state.phase === 'idle') return { state, visible: false, remainingSeconds: 0, nextDelayMs: 0 };
  if (state.phase === 'active') {
    const remainingSeconds = Math.max(0, Math.ceil((state.targetAt - now) / 1_000));
    if (remainingSeconds === 0) return { state: { ...state, phase: 'idle', targetAt: 0, expiresAt: 0, updatedAt: now }, visible: false, remainingSeconds: 0, nextDelayMs: 0 };
    return { state, visible: true, remainingSeconds, nextDelayMs: 1_000 };
  }
  const remainingSeconds = Math.max(0, Math.ceil((state.targetAt - now) / 1_000));
  if (remainingSeconds > leadSeconds) return { state, visible: false, remainingSeconds, nextDelayMs: Math.max(1_000, (remainingSeconds - leadSeconds) * 1_000) };
  if (remainingSeconds > 0) return { state, visible: true, remainingSeconds, nextDelayMs: 1_000 };
  if (now <= state.expiresAt) return { state: { ...state, phase: 'awaiting-start', updatedAt: now }, visible: true, remainingSeconds: 0, nextDelayMs: 1_000 };
  return { state: { ...state, phase: 'idle', targetAt: 0, expiresAt: 0, updatedAt: now }, visible: false, remainingSeconds: 0, nextDelayMs: 0 };
}

function styleFor(settings) {
  return {
    fontFamily: 'broadcast', backgroundMode: ['glass', 'solid', 'none'].includes(settings.overlayBackgroundMode) ? settings.overlayBackgroundMode : 'glass',
    backgroundColor: hexColor(settings.overlayBackgroundColor, FALLBACKS.overlayBackgroundColor), backgroundOpacity: number(settings.overlayBackgroundOpacity, 0, 1, FALLBACKS.overlayBackgroundOpacity),
    accentColor: hexColor(settings.overlayAccentColor, FALLBACKS.overlayAccentColor), textColor: hexColor(settings.overlayTextColor, FALLBACKS.overlayTextColor),
    mutedColor: hexColor(settings.overlayMutedColor, FALLBACKS.overlayMutedColor), warningColor: hexColor(settings.overlayAccentColor, FALLBACKS.overlayAccentColor),
    criticalColor: hexColor(settings.overlayCriticalColor, FALLBACKS.overlayCriticalColor), liveColor: hexColor(settings.overlayAccentColor, FALLBACKS.overlayAccentColor),
    borderColor: hexColor(settings.overlayBorderColor, FALLBACKS.overlayBorderColor), showProgressBar: true,
  };
}

let timer; let stopped = false; let operation = Promise.resolve();
function serialize(task) { operation = operation.then(task, task); return operation; }
function cancelTimer(context) { if (timer !== undefined) context.schedule.cancel(timer); timer = undefined; }
function scheduleNext(context, delayMs) { cancelTimer(context); if (!stopped && delayMs > 0) timer = context.schedule.after(Math.min(delayMs, 2_147_000_000), () => { timer = undefined; return serialize(() => refresh(context)); }); }
async function hide(context) { try { await context.overlay.publish(`${MODULE_ID}.timer.hide`, { moduleId: MODULE_ID }); } catch { /* Closed overlays never stop timing. */ } }

async function publish(context, settings, state, view) {
  if (!view.visible) return hide(context);
  const active = state.phase === 'active'; const awaiting = state.phase === 'awaiting-start';
  const label = cleanText(active ? settings.activeLabel : settings.upcomingLabel, 80) || (active ? FALLBACKS.activeLabel : FALLBACKS.upcomingLabel);
  const message = cleanText(active ? settings.activeMessage : settings.upcomingMessage, 160) || (active ? FALLBACKS.activeMessage : FALLBACKS.upcomingMessage);
  try {
    await context.overlay.publish(`${MODULE_ID}.timer.update`, {
      moduleId: MODULE_ID, variant: 'ad-break', phase: state.phase, label,
      remainingSeconds: view.remainingSeconds, maximumSeconds: active ? state.adLengthSeconds : integer(settings.leadSeconds, 15, 300, 60),
      remainingText: formatRemaining(view.remainingSeconds), running: true, live: true, completed: false,
      badgeText: active ? 'IN PROGRESS' : awaiting ? 'STARTING' : 'UPCOMING', lastReason: message,
      contextText: active ? `${String(state.adLengthSeconds)} second Twitch ad break` : `Twitch · ${String(state.snoozesLeft)} snoozes available`,
      warning: !active && view.remainingSeconds <= 30, critical: !active && view.remainingSeconds <= 10,
      style: styleFor(settings), emittedAt: new Date().toISOString(),
    }, { lane: 'timer' });
  } catch { /* Closed overlays never stop timing. */ }
}

async function refresh(context) {
  const settings = settingsFor(context);
  if (settings.enabled !== true) {
    cancelTimer(context);
    const idle = sanitizeAdState({ phase: 'idle', targetAt: 0, expiresAt: 0, maximumSeconds: 60, adLengthSeconds: 30, snoozesLeft: 0, simulated: false, updatedAt: Date.now() });
    await context.state.write(idle);
    await hide(context);
    return;
  }
  const state = sanitizeAdState(await context.state.read());
  const view = deriveAdView(state, settings); await context.state.write(view.state); await publish(context, settings, view.state, view); scheduleNext(context, view.nextDelayMs);
}

function boundedDate(value, fallback) { const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN; return Number.isFinite(parsed) ? parsed : fallback; }
function eventPayload(event, settings) {
  if (event.metadata?.simulated === true && settings.allowTriggerTests !== true) return undefined;
  if (event.eventType === UPCOMING_EVENT) {
    const minutes = integer(event.payload?.minutes, 1, 60, 1); const now = Date.now();
    const targetAt = boundedDate(event.payload?.nextAdAt, now + minutes * 60_000);
    return { phase: 'scheduled', targetAt: Math.max(now + 1_000, targetAt), expiresAt: Math.max(now + 1_000, targetAt) + integer(settings.startGraceSeconds, 5, 60, 15) * 1_000,
      maximumSeconds: integer(settings.leadSeconds, 15, 300, 60), adLengthSeconds: integer(event.payload?.adLength, 1, 18_000, 30), snoozesLeft: integer(event.payload?.snoozesLeft, 0, 100, 0), simulated: event.metadata?.simulated === true, updatedAt: now };
  }
  if (event.eventType === STARTED_EVENT) {
    const now = Date.now(); const adLengthSeconds = integer(event.payload?.adLength, 1, 18_000, 30);
    return { phase: 'active', targetAt: now + adLengthSeconds * 1_000, expiresAt: now + adLengthSeconds * 1_000, maximumSeconds: adLengthSeconds,
      adLengthSeconds, snoozesLeft: 0, simulated: event.metadata?.simulated === true, updatedAt: now };
  }
  if (event.eventType === CONTROL_EVENT && event.payload?.action === 'preview-upcoming') {
    const now = Date.now(); const seconds = integer(event.payload?.seconds, 5, 300, 60);
    return { phase: 'scheduled', targetAt: now + seconds * 1_000, expiresAt: now + (seconds + 15) * 1_000, maximumSeconds: seconds, adLengthSeconds: 90, snoozesLeft: 0, simulated: true, updatedAt: now };
  }
  if (event.eventType === CONTROL_EVENT && event.payload?.action === 'preview-active') {
    const now = Date.now(); const seconds = integer(event.payload?.seconds, 5, 300, 90);
    return { phase: 'active', targetAt: now + seconds * 1_000, expiresAt: now + seconds * 1_000, maximumSeconds: seconds, adLengthSeconds: seconds, snoozesLeft: 0, simulated: true, updatedAt: now };
  }
  if (event.eventType === CONTROL_EVENT && event.payload?.action === 'hide') return { phase: 'idle', targetAt: 0, expiresAt: 0, maximumSeconds: 60, adLengthSeconds: 30, snoozesLeft: 0, simulated: true, updatedAt: Date.now() };
  return undefined;
}

export default {
  manifest, required: false,
  async start(context) { stopped = false; operation = Promise.resolve(); await refresh(context); },
  async stop(context) { stopped = true; cancelTimer(context); await operation; },
  async onEvent(event, context) {
    const settings = settingsFor(context);
    if (!settings.enabled) { await serialize(() => refresh(context)); return; }
    const next = eventPayload(event, settings); if (!next) return;
    await serialize(async () => { await context.state.write(next); await refresh(context); });
  },
};
