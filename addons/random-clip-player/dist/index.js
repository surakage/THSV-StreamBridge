// These two Streamer.bot action IDs are deterministically derived from the action names in
// packages/streamerbot/random-clip-player/manifest.json by stableStreamerBotUuid(). They are
// stable across rebuilds of that package as long as the package/action names do not change; if
// they ever do, rebuild the .sb (npm run package:streamerbot) and update these two constants to
// match, decoding the rebuilt package the same way tools/build-streamerbot-export.ts produces it.
const GET_CLIPS_ACTION_ID = 'f89e397b-7106-5101-a620-b0f5da4facf9';
const GET_CLIP_DOWNLOAD_ACTION_ID = 'ad3cf90f-b320-5ae2-a493-485a5485e0ce';

const GET_CLIPS_EVENT = 'addon.thsv.random-clip-player.clips-received';
const GET_CLIP_DOWNLOAD_EVENT = 'addon.thsv.random-clip-player.clip-download-received';
const CONTROL_EVENT = 'addon.thsv.random-clip-player.control';

// If Streamer.bot never responds (action not yet approved, connection down, or the request was
// simply dropped), this is how long to wait before trying again rather than stalling forever.
// Cancelled the moment the expected response actually arrives -- see arm/disarmSafetyNet.
const SAFETY_NET_MS = 90_000;
// A failed or timed-out clip is retried quickly rather than waiting a full between-clips gap.
const RETRY_DELAY_MS = 5_000;
// The creator-facing pause remains the value they chose. This fixed, non-configurable buffer gives
// the hosted overlay four seconds to fade away before the next rotation begins: 60 becomes 64.
const FADE_BUFFER_MS = 4_000;

// Fallbacks only for a context built without going through the real install/load path (bare unit
// tests, for instance). A real installed context always has a complete settings object, since the
// loader validates it against schemas/config.json with defaults applied before this ever runs.
const FALLBACKS = Object.freeze({
  secondsBetweenClips: 5,
  clipCount: 20,
  minDurationSeconds: 5,
  maxDurationSeconds: 60,
  muted: false,
  volume: 1,
});

function readSettings(context) {
  const settings = context.settings ?? {};
  const secondsBetweenClips = Number.isFinite(settings.secondsBetweenClips) && settings.secondsBetweenClips >= 0 ? settings.secondsBetweenClips : FALLBACKS.secondsBetweenClips;
  const clipCount = Number.isFinite(settings.clipCount) && settings.clipCount > 0 ? settings.clipCount : FALLBACKS.clipCount;
  const minDurationSeconds = Number.isFinite(settings.minDurationSeconds) && settings.minDurationSeconds >= 0 ? settings.minDurationSeconds : FALLBACKS.minDurationSeconds;
  const maxDurationSeconds = Number.isFinite(settings.maxDurationSeconds) && settings.maxDurationSeconds >= minDurationSeconds ? settings.maxDurationSeconds : FALLBACKS.maxDurationSeconds;
  const muted = typeof settings.muted === 'boolean' ? settings.muted : FALLBACKS.muted;
  const volume = Number.isFinite(settings.volume) && settings.volume >= 0 && settings.volume <= 1 ? settings.volume : FALLBACKS.volume;
  return { secondsBetweenClips, clipCount, minDurationSeconds, maxDurationSeconds, muted, volume };
}

const manifest = {
  contractVersion: '2.0.0-preview.1',
  moduleId: 'thsv.random-clip-player',
  name: 'Random Clip Player',
  version: '1.4.0',
  minimumCoreVersion: '2.0.0-preview.1',
  maximumTestedCoreVersion: '2.0.0-preview.1',
  dependencies: [],
  requiredCapabilities: [],
  configurationSchema: 'schemas/config.json',
  eventSubscriptions: [GET_CLIPS_EVENT, GET_CLIP_DOWNLOAD_EVENT, CONTROL_EVENT],
  commandsProvided: [],
  actionsProvided: [],
  browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.random-clip-player/', 'data/addons/.state/thsv.random-clip-player/'],
  installationSteps: [
    'Import packages/streamerbot/random-clip-player/THSV-StreamBridge-Random-Clip-Player-1.0.0.sb into Streamer.bot.',
    'In the wizard, install this add-on, then under its Approved Streamer.bot actions grant BOTH imported fetch actions: "Get Clips" and "Get Clip Download". Neither fetch action has a chat/event trigger by design.',
    'Optionally bind the imported Enable and Disable actions to Streamer.bot scene-active and scene-inactive triggers.',
    'Add an /overlay/addons/thsv.random-clip-player browser source in OBS/Meld/Streamlabs to render playback.',
  ],
  uninstallationSteps: ['Remove the add-on package; its separately owned rotation state remains preserved.'],
  migrations: [
    { from: '1.0.0', to: '1.1.0', script: 'migrations/001-interval-to-pause.mjs' },
    { from: '1.1.0', to: '1.2.0', script: 'migrations/001-interval-to-pause.mjs' },
    { from: '1.2.0', to: '1.3.0', script: 'migrations/001-interval-to-pause.mjs' },
    { from: '1.3.0', to: '1.4.0', script: 'migrations/001-interval-to-pause.mjs' },
  ],
  healthChecks: [{ id: 'thsv.random-clip-player.runtime', description: 'Confirms the add-on can request clips and receive Streamer.bot relay events.' }],
};

// Exported for direct unit testing; also used by the module logic below.
export function filterClipsByDuration(clips, minDurationSeconds, maxDurationSeconds) {
  return clips.filter((clip) => typeof clip?.durationSeconds === 'number' && clip.durationSeconds >= minDurationSeconds && clip.durationSeconds <= maxDurationSeconds);
}

export function selectNextClip(clips, seenClipIds, random = Math.random) {
  if (clips.length === 0) return undefined;
  const eligible = clips.filter((clip) => !seenClipIds.includes(clip.id));
  const pool = eligible.length > 0 ? eligible : clips;
  return pool[Math.floor(random() * pool.length)];
}

function sanitizeState(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  return {
    clips: Array.isArray(value.clips) ? value.clips : [],
    seenClipIds: Array.isArray(value.seenClipIds) ? value.seenClipIds.filter((id) => typeof id === 'string') : [],
    pendingClipId: typeof value.pendingClipId === 'string' ? value.pendingClipId : undefined,
    pendingPlaybackId: typeof value.pendingPlaybackId === 'string' ? value.pendingPlaybackId : undefined,
    playbackEnabled: value.playbackEnabled !== false,
  };
}

// Broker-held state is validated as bounded JSON, which has no concept of `undefined` -- a key
// present with an undefined value (as sanitizeState's own shape always has for an absent
// pendingClipId) fails that validation. This strips such keys before every write.
function toJsonState(state) {
  const { pendingClipId, pendingPlaybackId, ...rest } = state;
  return {
    ...rest,
    ...(pendingClipId === undefined ? {} : { pendingClipId }),
    ...(pendingPlaybackId === undefined ? {} : { pendingPlaybackId }),
  };
}

// Module-scoped, not persisted: tracks the one outstanding safety-net retry so it can be
// cancelled the instant the real response arrives instead of firing a redundant retry later.
let safetyTaskId;
let nextTaskId;

function armSafetyNet(context, task) {
  if (safetyTaskId !== undefined) context.schedule.cancel(safetyTaskId);
  safetyTaskId = context.schedule.after(SAFETY_NET_MS, task);
}

function disarmSafetyNet(context) {
  if (safetyTaskId === undefined) return;
  context.schedule.cancel(safetyTaskId);
  safetyTaskId = undefined;
}

function cancelNextTask(context) {
  if (nextTaskId === undefined) return;
  context.schedule.cancel(nextTaskId);
  nextTaskId = undefined;
}

function scheduleNext(context, delayMs) {
  cancelNextTask(context);
  nextTaskId = context.schedule.after(delayMs, () => {
    nextTaskId = undefined;
    void requestNextClip(context);
  });
}

async function requestClipList(context) {
  const state = sanitizeState(await context.state.read());
  if (!state.playbackEnabled) return;
  const settings = readSettings(context);
  armSafetyNet(context, () => { void requestClipList(context); });
  try { await context.streamerbot.runApprovedAction(GET_CLIPS_ACTION_ID, { clipCount: settings.clipCount }); }
  catch { /* Not yet approved, or Streamer.bot unavailable; the safety net retries. */ }
}

async function requestClipDownload(context, clipId) {
  const state = sanitizeState(await context.state.read());
  if (!state.playbackEnabled || state.pendingClipId !== clipId) return;
  armSafetyNet(context, () => { void requestClipDownload(context, clipId); });
  try { await context.streamerbot.runApprovedAction(GET_CLIP_DOWNLOAD_ACTION_ID, { clipId }); }
  catch { /* Not yet approved, or Streamer.bot unavailable; the safety net retries. */ }
}

// The single entry point for "what should happen now": called on first start, after a fresh clip
// list arrives, and (via onLifecycle below) a fixed pause after each clip finishes. Refreshes the
// clip list whenever there is nothing cached yet or the whole rotation pool has been played
// through, instead of on any independent timer.
async function requestNextClip(context) {
  const settings = readSettings(context);
  const state = sanitizeState(await context.state.read());
  if (!state.playbackEnabled) return;
  const eligible = filterClipsByDuration(state.clips, settings.minDurationSeconds, settings.maxDurationSeconds);
  if (eligible.length === 0 || eligible.every((clip) => state.seenClipIds.includes(clip.id))) {
    await requestClipList(context);
    return;
  }
  const clip = selectNextClip(eligible, state.seenClipIds);
  if (clip === undefined) { await requestClipList(context); return; }
  await context.state.write(toJsonState({ ...state, pendingClipId: clip.id }));
  await requestClipDownload(context, clip.id);
}

async function handleClipsReceived(event, context) {
  const clips = Array.isArray(event.payload?.clips) ? event.payload.clips.filter((clip) => clip && typeof clip.id === 'string') : [];
  const state = sanitizeState(await context.state.read());
  if (!state.playbackEnabled) return;
  if (state.pendingClipId !== undefined) return;
  disarmSafetyNet(context);
  // Drop seen-IDs for clips no longer in the refreshed list (deleted, or aged out of the fetch
  // window) so the rotation pool cannot shrink forever as the underlying clip library changes.
  const clipIds = new Set(clips.map((clip) => clip.id));
  const seenClipIds = state.seenClipIds.filter((id) => clipIds.has(id));
  await context.state.write(toJsonState({ ...state, clips, seenClipIds }));
  await requestNextClip(context);
}

async function handleClipDownloadReceived(event, context) {
  const clipId = event.payload?.clipId;
  const landscapeUrl = event.payload?.landscapeUrl;
  if (typeof clipId !== 'string' || typeof landscapeUrl !== 'string' || landscapeUrl === '') return;
  const state = sanitizeState(await context.state.read());
  if (!state.playbackEnabled || state.pendingClipId !== clipId) return; // Stale, disabled, or mismatched response; ignore.
  disarmSafetyNet(context);
  const clip = state.clips.find((candidate) => candidate.id === clipId);
  const settings = readSettings(context);
  const playbackId = `${clipId}-${Date.now()}`;
  await context.state.write(toJsonState({ ...state, pendingPlaybackId: playbackId }));
  // Keep retrying until this exact playback reports that it started. A publication sent while the
  // browser source is closed or reconnecting is therefore recoverable instead of stalling forever.
  armSafetyNet(context, () => { void requestClipDownload(context, clipId); });
  try { await context.overlay.publish(`${context.moduleId}.media.play`, {
    playbackId,
    url: landscapeUrl,
    muted: settings.muted,
    volume: settings.volume,
    ...(clip?.thumbnailUrl ? { posterUrl: clip.thumbnailUrl } : {}),
    ...(clip?.title ? { title: clip.title } : {}),
    ...(typeof clip?.durationSeconds === 'number' ? { durationMs: Math.round(clip.durationSeconds * 1_000) } : {}),
  }); } catch { /* The armed safety net retries without failing the whole optional module. */ }
}

export default {
  manifest,
  required: false,
  async start(context) {
    context.overlay.onLifecycle((event) => { void onLifecycle(event, context); });
    // No clips are cached on a fresh start, so this immediately requests a list rather than
    // waiting for anything -- see the empty-pool branch in requestNextClip.
    await requestNextClip(context);
  },
  async stop(context) { disarmSafetyNet(context); cancelNextTask(context); },
  async onEvent(event, context) {
    if (event.eventType === GET_CLIPS_EVENT) return handleClipsReceived(event, context);
    if (event.eventType === GET_CLIP_DOWNLOAD_EVENT) return handleClipDownloadReceived(event, context);
    if (event.eventType === CONTROL_EVENT) return handleControl(event, context);
  },
};

async function handleControl(event, context) {
  if (typeof event.payload?.enabled !== 'boolean') return;
  const state = sanitizeState(await context.state.read());
  if (event.payload.enabled === state.playbackEnabled) return;
  disarmSafetyNet(context);
  cancelNextTask(context);
  if (!event.payload.enabled) {
    await context.state.write(toJsonState({ clips: state.clips, seenClipIds: state.seenClipIds, playbackEnabled: false }));
    try { await context.overlay.publish(`${context.moduleId}.media.stop`, {}); } catch { /* Optional overlay may be closed. */ }
    return;
  }
  await context.state.write(toJsonState({ clips: state.clips, seenClipIds: state.seenClipIds, playbackEnabled: true }));
  await requestNextClip(context);
}

// The real driver of playback pacing: the next clip is requested a fixed pause after the current
// one actually finishes (reported by the overlay itself, so it reflects the clip's true length),
// not on any independent wall-clock timer -- matching how "minutes between rotations" used to
// work, which played clips on a schedule with no relationship to how long the current one was.
async function onLifecycle(event, context) {
  const state = sanitizeState(await context.state.read());
  if (!state.playbackEnabled || state.pendingClipId === undefined || state.pendingPlaybackId !== event.playbackId) return;
  if (event.phase === 'loading') return;
  if (event.phase === 'started' || event.phase === 'heartbeat') { disarmSafetyNet(context); return; }
  if (event.phase !== 'ended' && event.phase !== 'stopped' && event.phase !== 'failed' && event.phase !== 'timeout') return;
  disarmSafetyNet(context);
  // Only a clean finish marks the clip seen; a failed/timed-out attempt is retried without being
  // excluded from the rotation, per the retry-or-skip contract these phases are documented to
  // represent (see docs/add-on-capabilities.md).
  const seenClipIds = event.phase === 'ended' ? [...new Set([...state.seenClipIds, state.pendingClipId])] : state.seenClipIds;
  await context.state.write(toJsonState({ clips: state.clips, seenClipIds }));
  const settings = readSettings(context);
  const delayMs = event.phase === 'ended' ? Math.max(settings.secondsBetweenClips * 1_000, 1_000) + FADE_BUFFER_MS : RETRY_DELAY_MS;
  scheduleNext(context, delayMs);
}
