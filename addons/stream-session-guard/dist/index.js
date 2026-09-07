// Stream Break & End Guard is a bundled StreamBridge extension. It owns one persisted
// live-session schedule and delegates only exact, wizard-selected scene changes to one
// triggerless Streamer.bot controller.
const MODULE_ID = 'thsv.stream-session-guard';
const RESULT_EVENT = 'addon.thsv.stream-session-guard.scene-result';
const CONTROLLER_ACTION_ID = 'f4e7fcb4-617b-4438-a6ac-5e6a6dc9ad92';
const LIFECYCLE_EVENTS = Object.freeze(['stream.online', 'stream.offline']);
const SCENE_EVENTS = Object.freeze(['stream.scene-changed', 'system.scene-catalog']);
const PROVIDERS = Object.freeze(['obs', 'meld', 'streamlabs']);

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Stream Break & End Guard', version: '4.0.10',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.10', maximumTestedBridgeVersion: '4.0.10',
  dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: [...LIFECYCLE_EVENTS, ...SCENE_EVENTS, RESULT_EVENT], commandsProvided: [], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: [`data/addons/${MODULE_ID}/`, `data/addons/.state/${MODULE_ID}/`],
  installationSteps: [
    'Enable this built-in extension and choose the broadcast app, break scene, break interval, break length, maximum stream length, and ending scene.',
    'Import the bundled Stream Break & End Guard Streamer.bot helper and approve only its triggerless Scene Controller action.',
    'Refresh the scene catalogue and select exact detected scene names in the wizard instead of copying and pasting them.',
    'Add the extension overlay URL to the scenes where the five-minute warning should be visible.',
    'Run an offline overlay preview, then verify one short private test stream before relying on automatic scene changes.',
  ],
  uninstallationSteps: ['Disable the extension. Its small local schedule audit remains preserved unless extension data is explicitly deleted.'],
  migrations: [], healthChecks: [{ id: `${MODULE_ID}.runtime`, description: 'Confirms persisted live timing, bounded warnings, and guarded scene-switch dispatch.' }],
};

const FALLBACKS = Object.freeze({
  enabled: false, provider: 'obs', connectionIndex: 0,
  breaksEnabled: true, breakScheduleMode: 'automatic', breakIntervalMinutes: 60, warningMinutes: 5, breakDurationMinutes: 5,
  breakSceneName: 'BRB', returnMode: 'previous', returnSceneName: '',
  streamLimitEnabled: true, maximumStreamMinutes: 240, endingSceneName: 'Stream Ending',
  showOverlayWarning: true, overlayBackgroundMode: 'glass',
  overlayBackgroundColor: '#101722', overlayBackgroundOpacity: 0.92, overlayAccentColor: '#f4c95d',
  overlayTextColor: '#ffffff', overlayMutedColor: '#d9e2ef', overlayWarningColor: '#f4c95d',
  overlayCriticalColor: '#ff6b7d', overlayBorderColor: '#f4c95d', overlayFontFamily: 'broadcast',
});

function clean(value, maximum = 200) { const text = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : ''; return [...text].slice(0, maximum).join(''); }
function integer(value, minimum, maximum, fallback) { return Number.isInteger(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback; }
function number(value, minimum, maximum, fallback) { return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Number(value))) : fallback; }
function color(value, fallback) { const text = clean(value, 16); return /^#[0-9a-f]{6}$/iu.test(text) ? text : fallback; }
function settingsFor(context) { return { ...FALLBACKS, ...(context.settings ?? {}) }; }
function provider(value) { return PROVIDERS.includes(value) ? value : 'obs'; }
function platform(value) { return ['twitch', 'youtube', 'kick', 'tiktok'].includes(value) ? value : ''; }
function iso(value) { const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN; return Number.isFinite(parsed) ? parsed : Date.now(); }
function formatRemaining(totalSeconds) { const value = Math.max(0, Math.floor(totalSeconds)); const hours = Math.floor(value / 3600); const minutes = Math.floor((value % 3600) / 60); const seconds = value % 60; return hours > 0 ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`; }

export function sanitizeState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const livePlatforms = Array.isArray(source.livePlatforms) ? [...new Set(source.livePlatforms.filter((item) => platform(item)))].slice(0, 4) : [];
  return {
    livePlatforms, sessionStartedAt: integer(source.sessionStartedAt, 0, Number.MAX_SAFE_INTEGER, 0),
    nextBreakAt: integer(source.nextBreakAt, 0, Number.MAX_SAFE_INTEGER, 0), endAt: integer(source.endAt, 0, Number.MAX_SAFE_INTEGER, 0),
    breakEndsAt: integer(source.breakEndsAt, 0, Number.MAX_SAFE_INTEGER, 0), phase: ['idle', 'live', 'break', 'ending'].includes(source.phase) ? source.phase : 'idle',
    breakWarningFor: integer(source.breakWarningFor, 0, Number.MAX_SAFE_INTEGER, 0), endWarningSent: source.endWarningSent === true,
    currentSceneName: clean(source.currentSceneName, 256), previousSceneName: clean(source.previousSceneName, 256),
    pendingRequest: source.pendingRequest && typeof source.pendingRequest === 'object' ? { requestId: clean(source.pendingRequest.requestId, 100), purpose: clean(source.pendingRequest.purpose, 30), sceneName: clean(source.pendingRequest.sceneName, 256), sentAt: integer(source.pendingRequest.sentAt, 0, Number.MAX_SAFE_INTEGER, 0) } : null,
    lastSceneResult: source.lastSceneResult && typeof source.lastSceneResult === 'object' ? { purpose: clean(source.lastSceneResult.purpose, 30), sceneName: clean(source.lastSceneResult.sceneName, 256), success: source.lastSceneResult.success === true, at: clean(source.lastSceneResult.at, 40), error: clean(source.lastSceneResult.error, 200) } : null,
    completedBreaks: integer(source.completedBreaks, 0, 10_000, 0), sessionSequence: integer(source.sessionSequence, 0, Number.MAX_SAFE_INTEGER, 0), lastReason: clean(source.lastReason, 80),
  };
}

export function automaticBreakIntervalMinutes(maximumStreamMinutes) {
  const duration = integer(maximumStreamMinutes, 30, 1_440, 240);
  return Math.min(60, Math.max(15, Math.round((duration / 2) / 5) * 5));
}

export function breakIntervalFor(settings) {
  return settings.breakScheduleMode === 'manual'
    ? integer(settings.breakIntervalMinutes, 15, 360, 60)
    : automaticBreakIntervalMinutes(settings.maximumStreamMinutes);
}

export function createSessionState(state, settings, startedAt) {
  const breakIntervalMs = breakIntervalFor(settings) * 60_000;
  const maximumMs = integer(settings.maximumStreamMinutes, 30, 1_440, 240) * 60_000;
  return { ...state, sessionStartedAt: startedAt, nextBreakAt: settings.breaksEnabled === false ? 0 : startedAt + breakIntervalMs,
    endAt: settings.streamLimitEnabled === false ? 0 : startedAt + maximumMs, breakEndsAt: 0, phase: 'live', breakWarningFor: 0,
    endWarningSent: false, previousSceneName: '', pendingRequest: null, completedBreaks: 0, sessionSequence: state.sessionSequence + 1, lastReason: 'stream-online' };
}

export function nextBreakDeadline(now, sessionStartedAt, intervalMinutes) {
  const interval = integer(intervalMinutes, 15, 360, 60) * 60_000;
  if (sessionStartedAt <= 0) return now + interval;
  return sessionStartedAt + (Math.floor(Math.max(0, now - sessionStartedAt) / interval) + 1) * interval;
}

function overlayStyle(settings) { return { fontFamily: ['broadcast', 'display', 'mono'].includes(settings.overlayFontFamily) ? settings.overlayFontFamily : 'broadcast', backgroundMode: ['glass', 'solid', 'none'].includes(settings.overlayBackgroundMode) ? settings.overlayBackgroundMode : 'glass', backgroundColor: color(settings.overlayBackgroundColor, FALLBACKS.overlayBackgroundColor), backgroundOpacity: number(settings.overlayBackgroundOpacity, 0, 1, FALLBACKS.overlayBackgroundOpacity), accentColor: color(settings.overlayAccentColor, FALLBACKS.overlayAccentColor), textColor: color(settings.overlayTextColor, FALLBACKS.overlayTextColor), mutedColor: color(settings.overlayMutedColor, FALLBACKS.overlayMutedColor), warningColor: color(settings.overlayWarningColor, FALLBACKS.overlayWarningColor), criticalColor: color(settings.overlayCriticalColor, FALLBACKS.overlayCriticalColor), borderColor: color(settings.overlayBorderColor, FALLBACKS.overlayBorderColor), showProgressBar: true }; }

let timer; let stopped = false; let operation = Promise.resolve();
function serialize(task) { operation = operation.then(task, task); return operation; }
function cancelTimer(context) { if (timer !== undefined) context.schedule.cancel(timer); timer = undefined; }
function schedule(context, delayMs = 1_000) { cancelTimer(context); if (!stopped) timer = context.schedule.after(Math.max(250, Math.min(2_147_000_000, delayMs)), () => { timer = undefined; return serialize(() => evaluate(context)); }); }
async function hideOverlay(context) { try { await context.overlay.publish(`${MODULE_ID}.timer.hide`, { moduleId: MODULE_ID }, { lane: 'timer' }); } catch { /* An optional closed overlay never stops scheduling. */ } }
async function showOverlay(context, settings, state, label, remainingMs, totalMs, reason) {
  if (settings.showOverlayWarning === false) return;
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1_000));
  try { await context.overlay.publish(`${MODULE_ID}.timer.update`, { moduleId: MODULE_ID, label: clean(label, 80), remainingSeconds, maximumSeconds: Math.max(1, Math.ceil(totalMs / 1_000)), remainingText: formatRemaining(remainingSeconds), running: true, live: true, livePlatforms: state.livePlatforms, contextText: reason, warning: true, critical: remainingSeconds <= 60, lastReason: reason, lastAwardSeconds: 0, style: overlayStyle(settings), emittedAt: new Date().toISOString() }, { lane: 'timer' }); } catch { /* Optional overlay. */ }
}

async function dispatchScene(context, settings, state, sceneName, purpose, now) {
  const exactScene = clean(sceneName, 256); if (!exactScene) { state.lastReason = `${purpose}-scene-missing`; return false; }
  if (!context.approvedActionIds.includes(CONTROLLER_ACTION_ID)) { state.lastReason = 'scene-controller-not-approved'; return false; }
  const requestId = `${state.sessionSequence}-${purpose}-${now}`;
  state.pendingRequest = { requestId, purpose, sceneName: exactScene, sentAt: now }; state.lastReason = `${purpose}-scene-dispatched`;
  await context.state.write(state);
  try { await context.streamerbot.runApprovedAction(CONTROLLER_ACTION_ID, { sessionGuardModuleId: MODULE_ID, sessionGuardResultEvent: RESULT_EVENT, sessionGuardRequestId: requestId, sessionGuardPurpose: purpose, sessionGuardProvider: provider(settings.provider), sessionGuardConnectionIndex: integer(settings.connectionIndex, 0, 23, 0), sessionGuardSceneName: exactScene }); return true; }
  catch (error) { state.pendingRequest = null; state.lastSceneResult = { purpose, sceneName: exactScene, success: false, at: new Date(now).toISOString(), error: clean(error instanceof Error ? error.message : String(error), 200) }; state.lastReason = `${purpose}-scene-dispatch-failed`; return false; }
}

async function beginBreak(context, settings, state, now) {
  if (state.phase !== 'live') return;
  state.previousSceneName = state.currentSceneName; state.phase = 'break'; state.breakEndsAt = now + integer(settings.breakDurationMinutes, 1, 60, 5) * 60_000;
  state.nextBreakAt = nextBreakDeadline(now, state.sessionStartedAt, breakIntervalFor(settings)); state.breakWarningFor = 0;
  await dispatchScene(context, settings, state, settings.breakSceneName, 'break', now);
}
async function finishBreak(context, settings, state, now) {
  const returnScene = settings.returnMode === 'selected' ? settings.returnSceneName : state.previousSceneName;
  state.phase = 'live'; state.breakEndsAt = 0; state.completedBreaks += 1; state.lastReason = 'break-completed';
  if (clean(returnScene, 256)) await dispatchScene(context, settings, state, returnScene, 'return', now);
}
async function finishStream(context, settings, state, now) {
  state.phase = 'ending'; state.breakEndsAt = 0; state.endWarningSent = true; state.lastReason = 'stream-limit-reached';
  await hideOverlay(context); await dispatchScene(context, settings, state, settings.endingSceneName, 'ending', now);
}

export async function evaluate(context, now = Date.now()) {
  const settings = settingsFor(context); const state = sanitizeState(await context.state.read()); cancelTimer(context);
  if (!settings.enabled || state.livePlatforms.length === 0 || state.phase === 'idle' || state.phase === 'ending') { await hideOverlay(context); await context.state.write(state); return; }
  const warningMs = integer(settings.warningMinutes, 1, 15, 5) * 60_000;
  if (state.endAt > 0 && now >= state.endAt) { await finishStream(context, settings, state, now); await context.state.write(state); return; }
  if (state.phase === 'break') {
    if (state.breakEndsAt > 0 && now >= state.breakEndsAt) { await finishBreak(context, settings, state, now); await hideOverlay(context); await context.state.write(state); schedule(context, 1_000); return; }
    const remaining = Math.max(0, state.breakEndsAt - now); await showOverlay(context, settings, state, 'BREAK', remaining, integer(settings.breakDurationMinutes, 1, 60, 5) * 60_000, 'Break in progress'); await context.state.write(state); schedule(context, Math.min(1_000, Math.max(250, remaining))); return;
  }
  const endWarningAt = state.endAt > 0 ? state.endAt - warningMs : Number.POSITIVE_INFINITY;
  if (state.endAt > 0 && now >= endWarningAt) { state.endWarningSent = true; await showOverlay(context, settings, state, 'STREAM ENDS IN', state.endAt - now, warningMs, 'Maximum stream length'); await context.state.write(state); schedule(context, 1_000); return; }
  const breakCanRun = settings.breaksEnabled !== false && state.nextBreakAt > 0 && (state.endAt === 0 || state.nextBreakAt + integer(settings.breakDurationMinutes, 1, 60, 5) * 60_000 < endWarningAt);
  if (breakCanRun && now >= state.nextBreakAt) { await beginBreak(context, settings, state, now); await context.state.write(state); schedule(context, 1_000); return; }
  const breakWarningAt = breakCanRun ? state.nextBreakAt - warningMs : Number.POSITIVE_INFINITY;
  if (breakCanRun && now >= breakWarningAt) { state.breakWarningFor = state.nextBreakAt; await showOverlay(context, settings, state, 'BREAK IN', state.nextBreakAt - now, warningMs, 'Scheduled wellness break'); await context.state.write(state); schedule(context, 1_000); return; }
  await hideOverlay(context); await context.state.write(state);
  const nextAt = Math.min(endWarningAt, breakWarningAt); if (Number.isFinite(nextAt)) schedule(context, Math.max(1_000, nextAt - now));
}

async function lifecycle(event, context) {
  const settings = settingsFor(context); const state = sanitizeState(await context.state.read()); const source = platform(event.platform); if (!source || event.metadata?.simulated === true) return;
  const live = new Set(state.livePlatforms); const wasLive = live.size > 0;
  if (event.eventType === 'stream.online') live.add(source); else live.delete(source); state.livePlatforms = [...live];
  if (!wasLive && live.size > 0) Object.assign(state, createSessionState(state, settings, iso(event.receivedAt)));
  if (live.size === 0) Object.assign(state, { livePlatforms: [], sessionStartedAt: 0, nextBreakAt: 0, endAt: 0, breakEndsAt: 0, phase: 'idle', breakWarningFor: 0, endWarningSent: false, previousSceneName: '', pendingRequest: null, lastReason: 'stream-offline' });
  await context.state.write(state); if (live.size === 0) { cancelTimer(context); await hideOverlay(context); } else await evaluate(context);
}

async function sceneEvent(event, context) { const settings = settingsFor(context); const eventProvider = clean(event.payload?.provider, 20); if (event.metadata?.simulated === true || !PROVIDERS.includes(eventProvider) || eventProvider !== provider(settings.provider)) return; const name = clean(event.payload?.sceneName ?? event.payload?.currentScene, 256); if (!name) return; const state = sanitizeState(await context.state.read()); state.currentSceneName = name; await context.state.write(state); }
async function sceneResult(event, context) { const state = sanitizeState(await context.state.read()); const requestId = clean(event.payload?.requestId, 100); if (!state.pendingRequest || requestId !== state.pendingRequest.requestId) return; state.lastSceneResult = { purpose: state.pendingRequest.purpose, sceneName: state.pendingRequest.sceneName, success: event.payload?.success === true, at: clean(event.receivedAt, 40), error: clean(event.payload?.error, 200) }; state.pendingRequest = null; state.lastReason = state.lastSceneResult.success ? `${state.lastSceneResult.purpose}-scene-confirmed` : `${state.lastSceneResult.purpose}-scene-failed`; await context.state.write(state); }

export default {
  manifest, required: false,
  async start(context) { stopped = false; operation = Promise.resolve(); const state = sanitizeState(await context.state.read()); await context.state.write(state); if (settingsFor(context).enabled && state.livePlatforms.length > 0 && state.phase !== 'idle') await evaluate(context); },
  async stop(context) { stopped = true; cancelTimer(context); await operation; },
  async onEvent(event, context) { if (!settingsFor(context).enabled) return; if (LIFECYCLE_EVENTS.includes(event.eventType)) return serialize(() => lifecycle(event, context)); if (SCENE_EVENTS.includes(event.eventType)) return serialize(() => sceneEvent(event, context)); if (event.eventType === RESULT_EVENT) return serialize(() => sceneResult(event, context)); },
};

export { CONTROLLER_ACTION_ID, RESULT_EVENT };
