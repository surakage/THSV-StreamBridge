// Stream Launch Countdown owns one creator-controlled countdown for a Starting Soon scene.
// It stores only bounded timer state and accepts only the add-on's approved local controls.
const MODULE_ID = 'thsv.starting-soon-countdown';
const CONTROL_EVENT = 'addon.thsv.starting-soon-countdown.control';
const SCENE_EVENT = 'stream.scene-changed';
const SCENE_SNAPSHOT_EVENT = 'system.scene-catalog';
const CONTROL_ACTIONS = Object.freeze(['start', 'stop', 'pause', 'resume', 'reset', 'complete', 'set-and-start']);

const manifest = {
  contractVersion: '2.0.0-preview.1',
  moduleId: MODULE_ID,
  name: 'Stream Launch Countdown',
  version: '4.0.8',
  minimumCoreVersion: '2.0.0-preview.1',
  maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.8', maximumTestedBridgeVersion: '4.0.8',
  dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: [CONTROL_EVENT, SCENE_EVENT, SCENE_SNAPSHOT_EVENT], commandsProvided: [], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: [`data/addons/${MODULE_ID}/`, `data/addons/.state/${MODULE_ID}/`],
  installationSteps: [
    'Install and enable the add-on, then configure the duration, exact program-scene name, completion message, optional tone, and overlay style.',
    'Import the bundled Streamer.bot package.',
    'Do not attach OBS, Meld, or Streamlabs scene triggers to the imported Start or Stop actions; StreamBridge follows normalized program-scene changes directly.',
    'Use the imported controls only as optional hotkeys or Stream Deck buttons for manual overrides.',
    'Optional: approve exactly one triggerless Streamer.bot action and enable the completion action to switch scenes at zero.',
    'Add the countdown overlay URL shown by the wizard to OBS, Meld, or Streamlabs Desktop.',
  ],
  uninstallationSteps: ['Uninstall the add-on. Its small timer state remains available unless add-on data is explicitly deleted.'],
  migrations: [],
  healthChecks: [{ id: `${MODULE_ID}.runtime`, description: 'Confirms bounded countdown controls, persistence, and overlay publishing.' }],
};

const FALLBACKS = Object.freeze({
  enabled: true, durationHours: 0, durationMinutes: 10, durationSeconds: 0,
  automaticSceneNames: ['Starting Soon'], stopOutsideAutomaticScenes: true,
  completionMessage: 'The stream is starting now!', completionTone: 'soft-chime', toneVolume: 0.6,
  completionDisplaySeconds: 10, runCompletionAction: false, completionActionDelaySeconds: 0,
  showOverlay: true, overlayLabel: 'STARTING SOON',
  overlayFontFamily: 'display', overlayBackgroundMode: 'glass', overlayBackgroundColor: '#0b1017',
  overlayBackgroundOpacity: 0.88, overlayAccentColor: '#7ee0ff', overlayTextColor: '#eff7ff',
  overlayMutedColor: '#dfefff', overlayWarningColor: '#f0c15a', overlayCriticalColor: '#ff6b7d',
  overlayLiveColor: '#61f2a4', overlayBorderColor: '#85cbff', overlayShowProgressBar: true,
  warningMinutes: 2, criticalSeconds: 30,
});

function cleanText(value, maximum = 200) {
  const normalized = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '';
  return [...normalized].slice(0, maximum).join('');
}

function integer(value, minimum, maximum, fallback = minimum) {
  return Number.isInteger(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function number(value, minimum, maximum, fallback) {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Number(value))) : fallback;
}

function hexColor(value, fallback) {
  const normalized = cleanText(value, 16);
  return /^#[0-9a-fA-F]{6}$/u.test(normalized) ? normalized : fallback;
}

function settingsFor(context) { return { ...FALLBACKS, ...(context.settings ?? {}) }; }

function normalizedSceneName(value) { return cleanText(value, 256).toLocaleLowerCase('en-US'); }

export function sceneShouldStart(sceneName, configuredNames) {
  const current = normalizedSceneName(sceneName);
  if (!current || !Array.isArray(configuredNames)) return false;
  return configuredNames.some((candidate) => normalizedSceneName(candidate) === current);
}

export function configuredDurationSeconds(settings) {
  const hours = integer(settings.durationHours, 0, 24, 0);
  const minutes = integer(settings.durationMinutes, 0, 59, 0);
  const seconds = integer(settings.durationSeconds, 0, 59, 0);
  return Math.max(1, Math.min(86_400, hours * 3600 + minutes * 60 + seconds));
}

export function formatRemaining(totalSeconds) {
  const value = integer(totalSeconds, 0, 86_400, 0);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function sanitizeState(value, configuredSeconds = 600) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    initialized: source.initialized === true,
    remainingSeconds: integer(source.remainingSeconds, 0, 86_400, configuredSeconds),
    maximumSeconds: integer(source.maximumSeconds, 1, 86_400, configuredSeconds),
    running: source.running === true, visible: source.visible === true, completed: source.completed === true,
    updatedAt: integer(source.updatedAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
    completedAt: integer(source.completedAt, 0, Number.MAX_SAFE_INTEGER, 0),
    completionSequence: integer(source.completionSequence, 0, Number.MAX_SAFE_INTEGER, 0),
    completionActionSent: source.completionActionSent === true,
    completionActionDueAt: integer(source.completionActionDueAt, 0, Number.MAX_SAFE_INTEGER, 0),
    lastReason: cleanText(source.lastReason, 80),
  };
}

function initializeState(state, configuredSeconds) {
  if (state.initialized) return state;
  return { ...state, initialized: true, remainingSeconds: configuredSeconds, maximumSeconds: configuredSeconds,
    running: false, visible: false, completed: false, updatedAt: Date.now() };
}

export function applyElapsed(state, now = Date.now()) {
  const next = { ...state };
  if (!next.running) { next.updatedAt = now; return { state: next, completedNow: false }; }
  const elapsed = Math.max(0, Math.floor((now - next.updatedAt) / 1000));
  if (elapsed === 0) return { state: next, completedNow: false };
  next.remainingSeconds = Math.max(0, next.remainingSeconds - elapsed);
  next.updatedAt += elapsed * 1000;
  if (next.remainingSeconds > 0) return { state: next, completedNow: false };
  next.running = false; next.completed = true; next.completedAt = now;
  next.completionSequence += 1; next.completionActionSent = false; next.completionActionDueAt = 0; next.lastReason = 'completed';
  return { state: next, completedNow: true };
}

function overlayStyle(settings) {
  return {
    fontFamily: ['display', 'broadcast', 'mono'].includes(settings.overlayFontFamily) ? settings.overlayFontFamily : 'display',
    backgroundMode: ['glass', 'solid', 'none'].includes(settings.overlayBackgroundMode) ? settings.overlayBackgroundMode : 'glass',
    backgroundColor: hexColor(settings.overlayBackgroundColor, FALLBACKS.overlayBackgroundColor),
    backgroundOpacity: number(settings.overlayBackgroundOpacity, 0, 1, FALLBACKS.overlayBackgroundOpacity),
    accentColor: hexColor(settings.overlayAccentColor, FALLBACKS.overlayAccentColor),
    textColor: hexColor(settings.overlayTextColor, FALLBACKS.overlayTextColor),
    mutedColor: hexColor(settings.overlayMutedColor, FALLBACKS.overlayMutedColor),
    warningColor: hexColor(settings.overlayWarningColor, FALLBACKS.overlayWarningColor),
    criticalColor: hexColor(settings.overlayCriticalColor, FALLBACKS.overlayCriticalColor),
    liveColor: hexColor(settings.overlayLiveColor, FALLBACKS.overlayLiveColor),
    borderColor: hexColor(settings.overlayBorderColor, FALLBACKS.overlayBorderColor),
    showProgressBar: settings.overlayShowProgressBar !== false,
  };
}

let tickTimer; let hideTimer; let completionActionTimer; let stopped = false; let operation = Promise.resolve();
function serialize(task) { operation = operation.then(task, task); return operation; }
function cancelTimers(context) {
  if (tickTimer !== undefined) context.schedule.cancel(tickTimer);
  if (hideTimer !== undefined) context.schedule.cancel(hideTimer);
  if (completionActionTimer !== undefined) context.schedule.cancel(completionActionTimer);
  tickTimer = undefined; hideTimer = undefined; completionActionTimer = undefined;
}

function approvedCompletionAction(context) {
  return Array.isArray(context.approvedActionIds) && context.approvedActionIds.length === 1
    ? context.approvedActionIds[0]
    : undefined;
}

async function dispatchCompletionAction(context, settings) {
  const configured = configuredDurationSeconds(settings);
  const state = initializeState(sanitizeState(await context.state.read(), configured), configured);
  if (state.completionActionSent || !state.completed || state.remainingSeconds !== 0 || state.completedAt === 0) return;
  if (Date.now() - state.completedAt > 300_000) {
    state.completionActionSent = true; state.lastReason = 'completion-action-expired';
    await context.state.write(state); return;
  }
  const actionId = approvedCompletionAction(context);
  if (!actionId) return;
  state.completionActionSent = true; state.lastReason = 'completion-action-dispatched';
  await context.state.write(state);
  try {
    await context.streamerbot.runApprovedAction(actionId, {
      countdownModule: MODULE_ID,
      countdownTrigger: 'completed',
      countdownMessage: cleanText(settings.completionMessage, 200) || FALLBACKS.completionMessage,
      countdownCompletedAt: new Date(state.completedAt).toISOString(),
    });
  } catch { /* At-most-once dispatch prevents a reconnect from switching scenes unexpectedly. */ }
}

async function publishState(context, settings, state, playCompletionTone = false) {
  if (!settings.showOverlay || !state.visible) {
    try { await context.overlay.publish(`${MODULE_ID}.timer.hide`, { moduleId: MODULE_ID }); } catch { /* Optional overlay. */ }
    return;
  }
  try {
    await context.overlay.publish(`${MODULE_ID}.timer.update`, {
      moduleId: MODULE_ID, label: cleanText(settings.overlayLabel, 80) || FALLBACKS.overlayLabel,
      remainingSeconds: state.remainingSeconds, maximumSeconds: state.maximumSeconds,
      remainingText: formatRemaining(state.remainingSeconds), running: state.running, live: state.running,
      livePlatforms: [], contextText: 'Starting Soon scene',
      warning: !state.completed && state.remainingSeconds > 0 && state.remainingSeconds <= integer(settings.warningMinutes, 1, 60, 2) * 60,
      critical: !state.completed && state.remainingSeconds > 0 && state.remainingSeconds <= integer(settings.criticalSeconds, 1, 300, 30),
      completed: state.completed, completionMessage: cleanText(settings.completionMessage, 200) || FALLBACKS.completionMessage,
      completionTone: ['none', 'soft-chime', 'digital-pop', 'celebration'].includes(settings.completionTone) ? settings.completionTone : 'none',
      toneVolume: number(settings.toneVolume, 0, 1, FALLBACKS.toneVolume),
      completionSequence: state.completionSequence, playCompletionTone, lastReason: state.lastReason,
      lastAwardSeconds: 0, style: overlayStyle(settings), emittedAt: new Date().toISOString(),
    }, { lane: 'timer' });
  } catch { /* A closed browser source must never stop countdown processing. */ }
}

function schedule(context, settings, state) {
  cancelTimers(context);
  if (stopped) return;
  if (state.running && state.remainingSeconds > 0) {
    tickTimer = context.schedule.after(1_000, () => { tickTimer = undefined; return serialize(() => handleTick(context)); });
  }
  const displaySeconds = integer(settings.completionDisplaySeconds, 0, 600, FALLBACKS.completionDisplaySeconds);
  if (state.completed && state.visible && displaySeconds > 0) {
    const elapsed = Math.max(0, Math.floor((Date.now() - state.completedAt) / 1000));
    hideTimer = context.schedule.after(Math.max(1, displaySeconds - elapsed) * 1_000, () => serialize(() => hideCompleted(context)));
  }
  if (settings.runCompletionAction === true && state.completed && !state.completionActionSent && state.completionActionDueAt > 0 && approvedCompletionAction(context)) {
    const delay = Math.max(0, state.completionActionDueAt - Date.now());
    completionActionTimer = context.schedule.after(Math.max(1_000, delay), () => {
      completionActionTimer = undefined;
      return serialize(() => dispatchCompletionAction(context, settings));
    });
  }
}

async function persist(context, settings, state, playCompletionTone = false) {
  await context.state.write(state); await publishState(context, settings, state, playCompletionTone); schedule(context, settings, state);
}

async function handleTick(context) {
  const settings = settingsFor(context); const configured = configuredDurationSeconds(settings);
  const elapsed = applyElapsed(initializeState(sanitizeState(await context.state.read(), configured), configured));
  const completionActionDelaySeconds = integer(settings.completionActionDelaySeconds, 0, 60, 0);
  if (elapsed.completedNow && settings.runCompletionAction === true) {
    elapsed.state.completionActionDueAt = Date.now() + completionActionDelaySeconds * 1_000;
  }
  await persist(context, settings, elapsed.state, elapsed.completedNow);
  if (elapsed.completedNow && settings.runCompletionAction === true && completionActionDelaySeconds === 0) {
    await dispatchCompletionAction(context, settings);
  }
}

async function hideCompleted(context) {
  const settings = settingsFor(context); const configured = configuredDurationSeconds(settings);
  const state = initializeState(sanitizeState(await context.state.read(), configured), configured);
  if (!state.completed) return schedule(context, settings, state);
  state.visible = false; state.lastReason = 'completion-hidden'; await persist(context, settings, state);
}

function controlPayload(event) {
  if (event.eventType !== CONTROL_EVENT) return undefined;
  const action = cleanText(event.payload?.action, 40).toLowerCase();
  if (!CONTROL_ACTIONS.includes(action)) return undefined;
  const seconds = integer(event.payload?.seconds, 1, 86_400, 0);
  if (action === 'set-and-start' && seconds === 0) return undefined;
  return { action, seconds };
}

async function applyControl(control, context) {
  const settings = settingsFor(context); const configured = configuredDurationSeconds(settings);
  let state = initializeState(sanitizeState(await context.state.read(), configured), configured);
  state = applyElapsed(state).state;
  const now = Date.now();
  let reason = control.action;
  if (control.action === 'start') {
    // OBS Studio Mode can emit scene-inactive followed by another scene-active event
    // for the same program scene. Normal Start is idempotent: it preserves an
    // in-progress value (or resumes it after Stop/Pause) instead of resetting.
    const inProgress = !state.completed && state.remainingSeconds > 0 && (state.running || state.remainingSeconds < state.maximumSeconds);
    if (inProgress) {
      reason = state.lastReason === 'stop' || state.lastReason === 'pause' ? 'start-resumed' : 'duplicate-start-ignored';
      Object.assign(state, { running: true, visible: true });
    } else Object.assign(state, { remainingSeconds: configured, maximumSeconds: configured, running: true, visible: true, completed: false, completedAt: 0, completionActionSent: false, completionActionDueAt: 0 });
  } else if (control.action === 'set-and-start') {
    Object.assign(state, { remainingSeconds: control.seconds, maximumSeconds: control.seconds, running: true, visible: true, completed: false, completedAt: 0, completionActionSent: false, completionActionDueAt: 0 });
  } else if (control.action === 'pause') state.running = false;
  else if (control.action === 'resume') { if (state.remainingSeconds > 0 && !state.completed) state.running = true; state.visible = true; }
  else if (control.action === 'reset') Object.assign(state, { remainingSeconds: configured, maximumSeconds: configured, running: false, visible: true, completed: false, completedAt: 0, completionActionSent: false, completionActionDueAt: 0 });
  else if (control.action === 'stop') Object.assign(state, { running: false, visible: false, completed: false, completionActionSent: false, completionActionDueAt: 0 });
  else if (control.action === 'complete') Object.assign(state, { remainingSeconds: 0, running: false, visible: true, completed: true, completedAt: now, completionSequence: state.completionSequence + 1, completionActionSent: true, completionActionDueAt: 0 });
  state.updatedAt = now; state.lastReason = reason;
  await persist(context, settings, state, control.action === 'complete');
}

async function handleSceneChanged(event, context) {
  const settings = settingsFor(context);
  const sceneName = event.payload?.sceneName ?? event.payload?.currentScene;
  if (!cleanText(sceneName, 256)) return;
  if (sceneShouldStart(sceneName, settings.automaticSceneNames)) {
    await applyControl({ action: 'start', seconds: 0 }, context);
  } else if (settings.stopOutsideAutomaticScenes !== false) {
    await applyControl({ action: 'stop', seconds: 0 }, context);
  }
}

export default {
  manifest, required: false,
  async start(context) {
    stopped = false; operation = Promise.resolve();
    const settings = settingsFor(context); const configured = configuredDurationSeconds(settings);
    const elapsed = applyElapsed(initializeState(sanitizeState(await context.state.read(), configured), configured));
    const completionActionDelaySeconds = integer(settings.completionActionDelaySeconds, 0, 60, 0);
    if (elapsed.completedNow && settings.runCompletionAction === true) {
      elapsed.state.completionActionDueAt = Date.now() + completionActionDelaySeconds * 1_000;
    }
    await persist(context, settings, elapsed.state, false);
    if (elapsed.completedNow && settings.runCompletionAction === true && completionActionDelaySeconds === 0) {
      await dispatchCompletionAction(context, settings);
    }
  },
  async stop(context) { stopped = true; cancelTimers(context); await operation; },
  async onEvent(event, context) {
    if (!settingsFor(context).enabled) return;
    if (event.eventType === SCENE_EVENT || event.eventType === SCENE_SNAPSHOT_EVENT) { await serialize(() => handleSceneChanged(event, context)); return; }
    const control = controlPayload(event); if (control) await serialize(() => applyControl(control, context));
  },
};
