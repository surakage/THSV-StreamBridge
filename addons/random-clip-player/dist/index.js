// These two Streamer.bot action IDs are deterministically derived from the action names in
// packages/streamerbot/random-clip-player/manifest.json by stableStreamerBotUuid(). They are
// stable across rebuilds of that package as long as the package/action names do not change; if
// they ever do, rebuild the .sb (npm run package:streamerbot) and update these two constants to
// match, decoding the rebuilt package the same way tools/build-streamerbot-export.ts produces it.
const GET_CLIPS_ACTION_ID = 'f89e397b-7106-5101-a620-b0f5da4facf9';
const GET_CLIP_DOWNLOAD_ACTION_ID = 'ad3cf90f-b320-5ae2-a493-485a5485e0ce';

const GET_CLIPS_EVENT = 'addon.thsv.random-clip-player.clips-received';
const SHARED_CLIPS_EVENT = 'addon.thsv.clip-library-cache.snapshot';
const GET_CLIP_DOWNLOAD_EVENT = 'addon.thsv.random-clip-player.clip-download-received';
const CONTROL_EVENT = 'addon.thsv.random-clip-player.control';

// If Streamer.bot never responds (action not yet approved, connection down, or the request was
// simply dropped), this is how long to wait before trying again rather than stalling forever.
// Cancelled the moment the expected response actually arrives -- see arm/disarmSafetyNet.
const SAFETY_NET_MS = 90_000;
const CONNECTION_RETRY_MS = 1_000;
// The shared cache normally answers immediately. Keep the fallback window short so enabling the
// player never appears unresponsive when the cache is cold, disabled, or still starting.
const SHARED_CACHE_WAIT_MS = 1_000;
// A failed or timed-out clip is retried quickly rather than waiting a full between-clips gap.
const RETRY_DELAY_MS = 5_000;
// A valid response can still contain no clips inside the creator's duration range. Back off
// before refreshing again so an empty/filtered library cannot flood Streamer.bot's action queue.
const EMPTY_POOL_RETRY_MS = 30_000;

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
  cacheVideo: false,
  cacheTtlHours: 12,
  cacheMaximumFileMb: 40,
});

function readSettings(context) {
  const settings = context.settings ?? {};
  const secondsBetweenClips = Number.isFinite(settings.secondsBetweenClips) && settings.secondsBetweenClips >= 0 ? settings.secondsBetweenClips : FALLBACKS.secondsBetweenClips;
  const clipCount = Number.isFinite(settings.clipCount) && settings.clipCount > 0 ? settings.clipCount : FALLBACKS.clipCount;
  const minDurationSeconds = Number.isFinite(settings.minDurationSeconds) && settings.minDurationSeconds >= 0 ? settings.minDurationSeconds : FALLBACKS.minDurationSeconds;
  const maxDurationSeconds = Number.isFinite(settings.maxDurationSeconds) && settings.maxDurationSeconds >= minDurationSeconds ? settings.maxDurationSeconds : FALLBACKS.maxDurationSeconds;
  const muted = typeof settings.muted === 'boolean' ? settings.muted : FALLBACKS.muted;
  const volume = Number.isFinite(settings.volume) && settings.volume >= 0 && settings.volume <= 1 ? settings.volume : FALLBACKS.volume;
  const cacheVideo = settings.cacheVideo === true;
  const cacheTtlHours = Number.isInteger(settings.cacheTtlHours) ? Math.min(24, Math.max(1, settings.cacheTtlHours)) : FALLBACKS.cacheTtlHours;
  const cacheMaximumFileMb = Number.isInteger(settings.cacheMaximumFileMb) ? Math.min(50, Math.max(5, settings.cacheMaximumFileMb)) : FALLBACKS.cacheMaximumFileMb;
  return { secondsBetweenClips, clipCount, minDurationSeconds, maxDurationSeconds, muted, volume, cacheVideo, cacheTtlHours, cacheMaximumFileMb };
}

const manifest = {
  contractVersion: '2.0.0-preview.1',
  moduleId: 'thsv.random-clip-player',
  name: 'Random Clip Player',
  version: '3.0.0',
  minimumCoreVersion: '2.0.0-preview.1',
  maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '3.0.0', maximumTestedBridgeVersion: '3.0.0',
  // Clip Library Cache is an optional event source. The built-in Get Clips action remains
  // a compatibility fallback, so the player must still load when the cache is not installed.
  dependencies: [],
  requiredCapabilities: [],
  configurationSchema: 'schemas/config.json',
  eventSubscriptions: [GET_CLIPS_EVENT, SHARED_CLIPS_EVENT, GET_CLIP_DOWNLOAD_EVENT, CONTROL_EVENT],
  commandsProvided: [],
  actionsProvided: [],
  browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.random-clip-player/', 'data/addons/.state/thsv.random-clip-player/'],
  installationSteps: [
    'Import the bundled Streamer.bot/THSV-StreamBridge-Random-Clip-Player-3.0.0.sb into Streamer.bot.',
    'In the wizard, install this add-on, then under its Approved Streamer.bot actions grant BOTH imported fetch actions: "Get Clips" and "Get Clip Download". Neither fetch action has a chat/event trigger by design.',
    'Bind or manually run the imported Enable and Disable actions. Playback always starts off after StreamBridge launches and cannot begin until Enable is triggered.',
    'Add the /overlay/clips browser source in OBS/Meld/Streamlabs to render playback.',
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
    playbackEnabled: value.playbackEnabled === true,
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
let mediaSlotUnsubscribe;
let lifecycleUnsubscribe;
let suspendedByMediaSlot = false;
let operation = Promise.resolve();
let stopped = true;

function serialize(task) {
  operation = operation.then(task, task);
  return operation;
}

function armSafetyNet(context, task) {
  if (safetyTaskId !== undefined) context.schedule.cancel(safetyTaskId);
  safetyTaskId = context.schedule.after(SAFETY_NET_MS, () => serialize(task));
}

function armConnectionRetry(context, task) {
  if (safetyTaskId !== undefined) context.schedule.cancel(safetyTaskId);
  safetyTaskId = context.schedule.after(CONNECTION_RETRY_MS, () => serialize(task));
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
  nextTaskId = context.schedule.after(delayMs, () => serialize(async () => {
    nextTaskId = undefined;
    if (stopped) return;
    await requestNextClip(context);
  }));
}

async function requestClipList(context) {
  if (stopped) return;
  const state = sanitizeState(await context.state.read());
  if (!state.playbackEnabled || suspendedByMediaSlot) return;
  const settings = readSettings(context);
  // Give the shared Clip Library Cache a short opportunity to publish its snapshot. The
  // legacy action remains a compatibility fallback when that helper is unavailable.
  disarmSafetyNet(context);
  safetyTaskId = context.schedule.after(SHARED_CACHE_WAIT_MS, () => serialize(async () => {
    safetyTaskId = undefined;
    if (stopped) return;
    // Arm before dispatch so an unusually fast relay response cannot race with timer setup.
    armSafetyNet(context, () => requestClipList(context));
    try { await context.streamerbot.runApprovedAction(GET_CLIPS_ACTION_ID, { clipCount: settings.clipCount }); }
    catch { armConnectionRetry(context, () => requestClipList(context)); }
  }));
}

async function requestClipDownload(context, clipId) {
  if (stopped) return;
  const state = sanitizeState(await context.state.read());
  if (!state.playbackEnabled || suspendedByMediaSlot || state.pendingClipId !== clipId) return;
  armSafetyNet(context, () => requestClipDownload(context, clipId));
  try { await context.streamerbot.runApprovedAction(GET_CLIP_DOWNLOAD_ACTION_ID, { clipId }); }
  catch { armConnectionRetry(context, () => requestClipDownload(context, clipId)); }
}

// The single entry point for "what should happen now": called on first start, after a fresh clip
// list arrives, and (via onLifecycle below) a fixed pause after each clip finishes. An exhausted
// playable pool asks for one refreshed batch; handleClipsReceived then resets the completed bag
// against that response. This admits newly created clips without repeatedly fetching an unchanged
// response when some returned clips are outside the configured duration range.
async function requestNextClip(context) {
  if (stopped) return;
  const settings = readSettings(context);
  const state = sanitizeState(await context.state.read());
  if (!state.playbackEnabled || suspendedByMediaSlot) return;
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
  if (stopped) return;
  const clips = Array.isArray(event.payload?.clips) ? event.payload.clips.filter((clip) => clip && typeof clip.id === 'string') : [];
  const state = sanitizeState(await context.state.read());
  if (!state.playbackEnabled || suspendedByMediaSlot) return;
  if (state.pendingClipId !== undefined) return;
  disarmSafetyNet(context);
  // Drop seen-IDs for clips no longer in the refreshed list (deleted, or aged out of the fetch
  // window) so the rotation pool cannot shrink forever as the underlying clip library changes.
  const clipIds = new Set(clips.map((clip) => clip.id));
  const stillSeenClipIds = state.seenClipIds.filter((id) => clipIds.has(id));
  const settings = readSettings(context);
  const eligible = filterClipsByDuration(clips, settings.minDurationSeconds, settings.maxDurationSeconds);
  // Reset only the playable bag. An unseen clip outside the configured duration range must not
  // prevent a completed playable batch from beginning its next no-repeat cycle.
  const eligibleIds = new Set(eligible.map((clip) => clip.id));
  const seenClipIds = eligible.length > 0 && eligible.every((clip) => stillSeenClipIds.includes(clip.id))
    ? stillSeenClipIds.filter((id) => !eligibleIds.has(id))
    : stillSeenClipIds;
  await context.state.write(toJsonState({ ...state, clips, seenClipIds }));
  if (eligible.length === 0) {
    scheduleNext(context, EMPTY_POOL_RETRY_MS);
    return;
  }
  await requestNextClip(context);
}

async function handleClipDownloadReceived(event, context) {
  if (stopped) return;
  const clipId = event.payload?.clipId;
  const landscapeUrl = event.payload?.landscapeUrl;
  if (typeof clipId !== 'string' || typeof landscapeUrl !== 'string' || landscapeUrl === '') return;
  const state = sanitizeState(await context.state.read());
  if (!state.playbackEnabled || suspendedByMediaSlot || state.pendingClipId !== clipId) return; // Stale, disabled, suspended, or mismatched response; ignore.
  disarmSafetyNet(context);
  const clip = state.clips.find((candidate) => candidate.id === clipId);
  const settings = readSettings(context);
  let playbackUrl = landscapeUrl;
  if (settings.cacheVideo) {
    try { playbackUrl = (await context.mediaCache.fetch({ sourceUrl: landscapeUrl, cacheKey: clipId, ttlSeconds: settings.cacheTtlHours * 3_600, maximumBytes: settings.cacheMaximumFileMb * 1_048_576 })).url; }
    catch { /* Cache is optional. A provider/cache failure falls back to the original temporary Twitch URL. */ }
  }
  const playbackId = `${clipId}-${Date.now()}`;
  await context.state.write(toJsonState({ ...state, pendingPlaybackId: playbackId }));
  // Keep retrying until this exact playback reports that it started. A publication sent while the
  // browser source is closed or reconnecting is therefore recoverable instead of stalling forever.
  armSafetyNet(context, () => requestClipDownload(context, clipId));
  try { await context.overlay.publish(`${context.moduleId}.media.play`, {
    playbackId,
    url: playbackUrl,
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
    operation = Promise.resolve();
    stopped = false;
    lifecycleUnsubscribe = context.overlay.onLifecycle((event) => { void serialize(() => onLifecycle(event, context)); });
    mediaSlotUnsubscribe = context.mediaSlot.onChange((slot) => serialize(() => onMediaSlotChanged(slot, context)));
    const slot = context.mediaSlot.current();
    suspendedByMediaSlot = typeof slot.ownerModuleId === 'string' && slot.ownerModuleId !== context.moduleId;
    // Playback is deliberately session-scoped. A prior run's enabled flag must never make clips
    // start merely because StreamBridge restarted; only the creator-controlled Enable action may
    // begin a new session. Preserve the rotation bag, but clear stale in-flight playback state.
    const state = sanitizeState(await context.state.read());
    await context.state.write(toJsonState({ clips: state.clips, seenClipIds: state.seenClipIds, playbackEnabled: false }));
    try { await context.overlay.publish(`${context.moduleId}.media.stop`, { fade: true }); } catch { /* Optional overlay may be closed. */ }
  },
  async stop(context) {
    stopped = true;
    disarmSafetyNet(context);
    cancelNextTask(context);
    lifecycleUnsubscribe?.();
    lifecycleUnsubscribe = undefined;
    mediaSlotUnsubscribe?.();
    mediaSlotUnsubscribe = undefined;
    await operation.catch(() => undefined);
    const state = sanitizeState(await context.state.read().catch(() => ({})));
    await context.state.write(toJsonState({ clips: state.clips, seenClipIds: state.seenClipIds, playbackEnabled: false })).catch(() => undefined);
    await context.overlay.publish(`${context.moduleId}.media.stop`, { fade: true }).catch(() => undefined);
    operation = Promise.resolve();
    suspendedByMediaSlot = false;
  },
  async onEvent(event, context) {
    return serialize(async () => {
      if (stopped) return;
      if (event.eventType === GET_CLIPS_EVENT || event.eventType === SHARED_CLIPS_EVENT) return handleClipsReceived(event, context);
      if (event.eventType === GET_CLIP_DOWNLOAD_EVENT) return handleClipDownloadReceived(event, context);
      if (event.eventType === CONTROL_EVENT) return handleControl(event, context);
    });
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
    try { await context.overlay.publish(`${context.moduleId}.media.stop`, { fade: true }); } catch { /* Optional overlay may be closed. */ }
    return;
  }
  await context.state.write(toJsonState({ clips: state.clips, seenClipIds: state.seenClipIds, playbackEnabled: true }));
  if (suspendedByMediaSlot) return;
  await requestNextClip(context);
}

async function onMediaSlotChanged(slot, context) {
  if (stopped) return;
  const shouldSuspend = typeof slot?.ownerModuleId === 'string' && slot.ownerModuleId !== context.moduleId;
  if (shouldSuspend === suspendedByMediaSlot) return;
  suspendedByMediaSlot = shouldSuspend;
  disarmSafetyNet(context); cancelNextTask(context);
  const state = sanitizeState(await context.state.read());
  if (shouldSuspend) {
    // Keep the creator's Enable state and no-repeat bag, but discard the interrupted in-flight
    // request so a released slot starts a clean clip instead of accepting a stale response.
    await context.state.write(toJsonState({ clips: state.clips, seenClipIds: state.seenClipIds, playbackEnabled: state.playbackEnabled }));
    if (state.playbackEnabled) {
      try { await context.overlay.publish(`${context.moduleId}.media.stop`, { fade: true }); } catch { /* Optional overlay may be closed. */ }
    }
    return;
  }
  if (state.playbackEnabled) scheduleNext(context, 1_000);
}

// The real driver of playback pacing: the next clip is requested a fixed pause after the current
// one actually finishes (reported by the overlay itself, so it reflects the clip's true length),
// not on any independent wall-clock timer -- matching how "minutes between rotations" used to
// work, which played clips on a schedule with no relationship to how long the current one was.
async function onLifecycle(event, context) {
  if (stopped) return;
  const state = sanitizeState(await context.state.read());
  if (!state.playbackEnabled || suspendedByMediaSlot || state.pendingClipId === undefined || state.pendingPlaybackId !== event.playbackId) return;
  if (event.phase === 'loading') return;
  if (event.phase === 'started' || event.phase === 'heartbeat') { disarmSafetyNet(context); return; }
  if (event.phase !== 'ended' && event.phase !== 'stopped' && event.phase !== 'failed' && event.phase !== 'timeout') return;
  disarmSafetyNet(context);
  // Only a clean finish marks the clip seen; a failed/timed-out attempt is retried without being
  // excluded from the rotation, per the retry-or-skip contract these phases are documented to
  // represent (see docs/add-on-capabilities.md).
  const seenClipIds = event.phase === 'ended' ? [...new Set([...state.seenClipIds, state.pendingClipId])] : state.seenClipIds;
  await context.state.write(toJsonState({ clips: state.clips, seenClipIds, playbackEnabled: true }));
  const settings = readSettings(context);
  // The configured pause is the complete post-clip wait. The overlay's short fade runs inside
  // that window instead of adding an undocumented delay on top of the creator's setting.
  const delayMs = event.phase === 'ended' ? Math.max(settings.secondsBetweenClips * 1_000, 1_000) : RETRY_DELAY_MS;
  scheduleNext(context, delayMs);
}
