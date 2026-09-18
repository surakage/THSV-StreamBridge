// Raid Scout discovers bounded live Twitch candidates through one approved Streamer.bot
// controller. StreamBridge owns filters, shuffle rotation, confirmation, and private history.
const CONTROLLER_ACTION_ID = '6a78d950-17b5-4a98-9de7-1a5b4275f31c';
const RUN_ENDING_AD_ACTION_ID = '18a8de7c-1c5f-4a1e-8d58-7944c74060d5';
const CONTROLLER_RESULT_EVENT = 'addon.thsv.raid-scout.controller-result';
const CONTROL_EVENT = 'addon.thsv.raid-scout.control';
const AD_STARTED_EVENT = 'addon.thsv.ad-break-companion.started';
const RAID_SCOUT_CONTROL_ACTION_IDS = new Set([
  CONTROLLER_ACTION_ID, RUN_ENDING_AD_ACTION_ID, 'e924f0ad-36c1-4687-8c05-c39466d06963', 'b2a5681e-329a-40ac-9ce3-57d249ba80fe',
  'c3a739c4-dfdc-455b-a377-bf9d72f4cd30', '74d1914e-8b75-4cb6-90f6-977a77803082', '5e3be19a-1ab3-5b11-8dea-8cc8fe985db7',
]);
const MAXIMUM_CANDIDATES = 100;
const MAXIMUM_HISTORY = 100;
const MAXIMUM_BAG = 100;
const MAXIMUM_VIEWER_SUGGESTIONS = 25;
const MAXIMUM_PENDING_MS = 60_000;
const MAXIMUM_CLIP_PENDING_MS = 120_000;
const DISCOVERY_RESPONSE_TIMEOUT_MS = 65_000;
const CLIP_RESPONSE_TIMEOUT_MS = 25_000;
const RAID_RESPONSE_TIMEOUT_MS = 30_000;
const PROGRESS_STEP_MS = 1_350;
const CLIP_FAILURE_GRACE_MS = 12_000;
const CLIP_START_TIMEOUT_MS = 30_000;
const RAID_MEDIA_LEASE_MS = 600_000;
const BROADCAST_STOP_CONFIRMATION_MS = 15_000;
// A clip can finish a few seconds after the ending commercial. Keep that genuine Ad Run signal
// reusable across the bounded preview so Raid Scout never asks Twitch for the same ending ad twice.
const RECENT_ENDING_AD_REUSE_MS = MAXIMUM_CLIP_PENDING_MS;
// Suggest starts the ending ad before discovery. Manual confirmation can reasonably happen after
// the commercial itself has completed, so retain that flow-bound proof through the configured
// suggestion window instead of requesting a second commercial.
const PREFLIGHT_ENDING_AD_REUSE_MS = 15 * 60_000;
// Twitch will not accept another commercial until eight minutes after the previous ad begins.
// Add a small safety margin so clock and EventSub delivery differences do not cause a 429 at
// the exact boundary.
const TWITCH_COMMERCIAL_COOLDOWN_MS = 485_000;
let eventQueue = Promise.resolve();
let stopped = true;
let lifecycleUnsubscribe;
let clipFallbackTask;
let controllerWatchdogTask;
let broadcastEndTask;
let broadcastStopConfirmationTask;
let progressTasks = [];
let mediaLeaseId;
let activeAdEndsAt = 0;
let endingAdRequestedAt = 0;
let endingAdAttemptFailed = false;

// The capability broker intentionally limits each scheduled callback to five seconds. Raid and
// clip work can include Streamer.bot/Twitch I/O, so timers enqueue that work and return at once
// instead of making the scheduler wait for an external action to finish.
function queueScheduledWork(task) {
  eventQueue = eventQueue.then(task, task);
  void eventQueue.catch(() => undefined);
}

const manifest = {
  contractVersion: '2.0.0-preview.1',
  moduleId: 'thsv.raid-scout',
  name: 'Raid Scout',
  version: '4.0.10',
  minimumCoreVersion: '2.0.0-preview.1',
  maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.10', maximumTestedBridgeVersion: '4.0.10',
  dependencies: ['thsv.viewer-foundation'],
  requiredCapabilities: [],
  configurationSchema: 'schemas/config.json',
  eventSubscriptions: [CONTROLLER_RESULT_EVENT, CONTROL_EVENT, AD_STARTED_EVENT, 'reward.redemption', 'command.received', 'stream.online', 'stream.offline', 'stream.scene-changed'],
  commandsProvided: [{ id: 'raid-scout.suggest', name: 'raidsuggest' }],
  actionsProvided: [],
  browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.raid-scout/', 'data/addons/.state/thsv.raid-scout/'],
  installationSteps: [
    'Import the separate Raid Scout Streamer.bot package.',
    'Keep its Controller action triggerless and approve that stable action ID as Raid Scout\'s fixed controller grant.',
    'Attach Finish Stream, Suggest, Confirm, and Cancel only to creator-controlled hotkeys, deck buttons, or operator commands. Finish Stream is the streamlined one-press path through every enabled ending step.',
    'For optional automatic broadcast ending, keep Run Ending Ad triggerless and attach Ad Break Companion\'s Ad Run Intake to Twitch Ads > Ad Run. Choose OBS Studio, Meld Studio, or Streamlabs Desktop in the wizard, select and approve that provider\'s Stop Streaming action, and attach Broadcast Stopped only to the selected provider\'s Streaming Stopped trigger.',
    'Optionally configure Streamer.bot-owned Twitch and Kick reward IDs for stream-scoped viewer suggestions.',
    'For YouTube and TikTok, configure the suggestion command and Viewer Foundation points cost.',
    'Configure preferred channels and filters, then test Suggest before enabling automatic mode.',
    'In OBS, leave Browser Source hardware acceleration enabled and turn off Shutdown source when not visible for the Raid Scout source so its cached clip renderer is already warm when the raid preview begins.',
  ],
  uninstallationSteps: ['Uninstall the add-on. Its bounded private suggestion and raid history remains preserved for a later reinstall.'],
  migrations: [],
  healthChecks: [{ id: 'thsv.raid-scout.runtime', description: 'Confirms bounded discovery, filtering, non-repeating selection, and creator-confirmed Twitch raids.' }],
};

const FALLBACKS = Object.freeze({
  enabled: true, autoStartSceneEnabled: false, autoStartProvider: 'obs', autoStartSceneName: '', preferredChannels: '', usePreferred: true, useFollowed: true, useCategory: true,
  viewerSuggestionsEnabled: false, viewerSuggestionRewardId: '', kickViewerSuggestionRewardId: '', viewerSuggestionCommand: 'raidsuggest', viewerSuggestionPointsCost: 50, maximumViewerSuggestions: 20,
  oneViewerSuggestionPerStream: true, announceViewerSuggestions: true,
  viewerSuggestionAcceptedMessage: '{viewer}, added {channel} to tonight\'s raid list.',
  viewerSuggestionRejectedMessage: '{viewer}, that raid suggestion could not be added.',
  sourceOrder: 'preferred-followed-category', maximumPreferredLookups: 20, maximumFollowedResults: 25,
  maximumFollowedPages: 2, maximumCategoryResults: 100, minimumViewers: 1, maximumViewers: 100_000,
  allowViewerRangeFallback: true,
  currentAudienceEstimate: 0, preferSimilarSize: true, minimumAudienceRatio: 0.25, maximumAudienceRatio: 2,
  preferredLanguage: '', requireMatchingLanguage: false, excludedChannels: '', excludedCategories: '',
  excludedTags: '', recentRaidStreams: 7, confirmationMode: 'required', suggestionExpiryMinutes: 15,
  announceConfirmedRaid: true,
  confirmedRaidMessage: 'Next stop: {displayName} playing {category}! https://twitch.tv/{login}',
  announceNoCandidate: false,
  noCandidateMessage: 'Raid Scout could not find a safe live destination with the current filters.',
  showSearchProgress: true,
  showSuggestionCard: true, showConfirmedCard: true, cardSeconds: 20, overlayBackgroundMode: 'glass',
  previewClipBeforeRaid: false, pauseOtherVideoOverlays: true, clipLookupCount: 20, clipPreviewMuted: false, clipPreviewVolume: 0.8,
  endBroadcastAfterRaid: false, endBroadcastProvider: 'obs', endBroadcastActionId: '', endBroadcastTiming: 'after-ad', endBroadcastDelaySeconds: 10,
  endBroadcastAdDurationSeconds: 180, endBroadcastAdWaitSeconds: 45, endBroadcastAdEndBufferSeconds: 3, endBroadcastAcknowledged: false,
  overlayBackgroundColor: '#17122b', overlayBackgroundOpacity: 0.94, overlayAccentColor: '#9146ff',
  overlayTextColor: '#ffffff', overlayFontFamily: 'display',
});

function clean(value, maximum = 256) {
  const normalized = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '';
  return [...normalized].slice(0, maximum).join('');
}
function integer(value, minimum, maximum, fallback) {
  return Number.isInteger(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}
function decimal(value, minimum, maximum, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}
function boolean(value, fallback) { return typeof value === 'boolean' ? value : fallback; }
function safeHttps(value) {
  const text = clean(value, 2_048);
  if (!text) return '';
  try { return new URL(text).protocol === 'https:' ? text : ''; } catch { return ''; }
}
function clipMp4FromThumbnail(value) {
  const thumbnail = safeHttps(value);
  if (!thumbnail) return '';
  try {
    const parsed = new URL(thumbnail);
    if (!/^clips-media-assets(?:2)?\.twitch\.tv$/iu.test(parsed.hostname)) return '';
    const path = parsed.pathname.replace(/-preview-[0-9]+x[0-9]+\.jpg$/iu, '.mp4');
    if (path === parsed.pathname) return '';
    parsed.pathname = path;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch { return ''; }
}
function safeColor(value, fallback) {
  const color = clean(value, 7);
  return /^#[0-9a-f]{6}$/iu.test(color) ? color : fallback;
}
function normalizedLogin(value) {
  const login = clean(value, 25).replace(/^@/u, '').toLowerCase();
  return /^[a-z0-9_]{1,25}$/u.test(login) ? login : '';
}
function lines(value, maximum, mapper = clean) {
  const source = typeof value === 'string' ? value.split(/\r?\n|,/u) : [];
  return [...new Set(source.map((item) => mapper(item)).filter(Boolean))].slice(0, maximum);
}

function settingsFor(context) {
  const raw = { ...FALLBACKS, ...(context.settings || {}) };
  const sourceOrder = [
    'preferred-followed-category', 'preferred-category-followed', 'followed-preferred-category',
    'followed-category-preferred', 'category-preferred-followed', 'category-followed-preferred',
  ].includes(raw.sourceOrder) ? raw.sourceOrder : FALLBACKS.sourceOrder;
  const confirmationMode = ['required', 'suggest-only', 'automatic'].includes(raw.confirmationMode) ? raw.confirmationMode : FALLBACKS.confirmationMode;
  return {
    enabled: boolean(raw.enabled, true),
    autoStartSceneEnabled: boolean(raw.autoStartSceneEnabled, false),
    autoStartProvider: ['obs', 'meld', 'streamlabs'].includes(raw.autoStartProvider) ? raw.autoStartProvider : FALLBACKS.autoStartProvider,
    autoStartSceneName: clean(raw.autoStartSceneName, 200),
    preferredChannels: lines(raw.preferredChannels, 100, normalizedLogin),
    viewerSuggestionsEnabled: boolean(raw.viewerSuggestionsEnabled, false),
    viewerSuggestionRewardId: clean(raw.viewerSuggestionRewardId, 256),
    kickViewerSuggestionRewardId: clean(raw.kickViewerSuggestionRewardId, 256),
    viewerSuggestionCommand: clean(raw.viewerSuggestionCommand, 64).toLowerCase() || 'raidsuggest',
    viewerSuggestionPointsCost: integer(raw.viewerSuggestionPointsCost, 1, 1000000, 50),
    maximumViewerSuggestions: integer(raw.maximumViewerSuggestions, 1, MAXIMUM_VIEWER_SUGGESTIONS, FALLBACKS.maximumViewerSuggestions),
    oneViewerSuggestionPerStream: boolean(raw.oneViewerSuggestionPerStream, true),
    announceViewerSuggestions: boolean(raw.announceViewerSuggestions, true),
    viewerSuggestionAcceptedMessage: clean(raw.viewerSuggestionAcceptedMessage, 500) || FALLBACKS.viewerSuggestionAcceptedMessage,
    viewerSuggestionRejectedMessage: clean(raw.viewerSuggestionRejectedMessage, 500) || FALLBACKS.viewerSuggestionRejectedMessage,
    usePreferred: boolean(raw.usePreferred, true), useFollowed: boolean(raw.useFollowed, true),
    useCategory: boolean(raw.useCategory, true), sourceOrder: sourceOrder.split('-'),
    maximumPreferredLookups: integer(raw.maximumPreferredLookups, 1, 25, FALLBACKS.maximumPreferredLookups),
    maximumFollowedResults: integer(raw.maximumFollowedResults, 1, MAXIMUM_CANDIDATES, FALLBACKS.maximumFollowedResults),
    maximumFollowedPages: integer(raw.maximumFollowedPages, 1, 3, FALLBACKS.maximumFollowedPages),
    maximumCategoryResults: integer(raw.maximumCategoryResults, 1, MAXIMUM_CANDIDATES, FALLBACKS.maximumCategoryResults),
    minimumViewers: integer(raw.minimumViewers, 0, 10_000_000, FALLBACKS.minimumViewers),
    maximumViewers: integer(raw.maximumViewers, 1, 10_000_000, FALLBACKS.maximumViewers),
    allowViewerRangeFallback: boolean(raw.allowViewerRangeFallback, FALLBACKS.allowViewerRangeFallback),
    currentAudienceEstimate: integer(raw.currentAudienceEstimate, 0, 10_000_000, 0),
    preferSimilarSize: boolean(raw.preferSimilarSize, true),
    minimumAudienceRatio: decimal(raw.minimumAudienceRatio, 0.01, 100, FALLBACKS.minimumAudienceRatio),
    maximumAudienceRatio: decimal(raw.maximumAudienceRatio, 0.01, 100, FALLBACKS.maximumAudienceRatio),
    preferredLanguage: clean(raw.preferredLanguage, 12).toLowerCase(),
    requireMatchingLanguage: boolean(raw.requireMatchingLanguage, false),
    excludedChannels: new Set(lines(raw.excludedChannels, 200, normalizedLogin)),
    excludedCategories: lines(raw.excludedCategories, 100, (item) => clean(item, 140).toLowerCase()),
    excludedTags: lines(raw.excludedTags, 100, (item) => clean(item, 100).toLowerCase()),
    recentRaidStreams: integer(raw.recentRaidStreams, 0, 100, FALLBACKS.recentRaidStreams),
    confirmationMode, suggestionExpiryMinutes: integer(raw.suggestionExpiryMinutes, 1, 1_440, FALLBACKS.suggestionExpiryMinutes),
    announceConfirmedRaid: boolean(raw.announceConfirmedRaid, true),
    confirmedRaidMessage: clean(raw.confirmedRaidMessage, 1_000) || FALLBACKS.confirmedRaidMessage,
    announceNoCandidate: boolean(raw.announceNoCandidate, false),
    noCandidateMessage: clean(raw.noCandidateMessage, 500) || FALLBACKS.noCandidateMessage,
    showSearchProgress: boolean(raw.showSearchProgress, true),
    showSuggestionCard: boolean(raw.showSuggestionCard, true), showConfirmedCard: boolean(raw.showConfirmedCard, true),
    cardSeconds: integer(raw.cardSeconds, 5, 3_600, FALLBACKS.cardSeconds),
    previewClipBeforeRaid: boolean(raw.previewClipBeforeRaid, false),
    pauseOtherVideoOverlays: boolean(raw.pauseOtherVideoOverlays, true),
    clipLookupCount: integer(raw.clipLookupCount, 1, 40, FALLBACKS.clipLookupCount),
    clipPreviewMuted: boolean(raw.clipPreviewMuted, false),
    clipPreviewVolume: decimal(raw.clipPreviewVolume, 0, 1, FALLBACKS.clipPreviewVolume),
    endBroadcastAfterRaid: boolean(raw.endBroadcastAfterRaid, false),
    endBroadcastProvider: ['obs', 'meld', 'streamlabs'].includes(raw.endBroadcastProvider) ? raw.endBroadcastProvider : FALLBACKS.endBroadcastProvider,
    endBroadcastActionId: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(clean(raw.endBroadcastActionId, 36)) ? clean(raw.endBroadcastActionId, 36) : '',
    endBroadcastTiming: ['after-ad', 'countdown'].includes(raw.endBroadcastTiming) ? raw.endBroadcastTiming : FALLBACKS.endBroadcastTiming,
    endBroadcastDelaySeconds: integer(raw.endBroadcastDelaySeconds, 5, 60, FALLBACKS.endBroadcastDelaySeconds),
    endBroadcastAdDurationSeconds: [30, 60, 90, 120, 150, 180].includes(raw.endBroadcastAdDurationSeconds) ? raw.endBroadcastAdDurationSeconds : FALLBACKS.endBroadcastAdDurationSeconds,
    endBroadcastAdWaitSeconds: integer(raw.endBroadcastAdWaitSeconds, 30, 1_800, FALLBACKS.endBroadcastAdWaitSeconds),
    endBroadcastAdEndBufferSeconds: integer(raw.endBroadcastAdEndBufferSeconds, 0, 30, FALLBACKS.endBroadcastAdEndBufferSeconds),
    endBroadcastAcknowledged: boolean(raw.endBroadcastAcknowledged, false),
    overlayBackgroundMode: ['glass', 'solid', 'none'].includes(raw.overlayBackgroundMode) ? raw.overlayBackgroundMode : FALLBACKS.overlayBackgroundMode,
    overlayBackgroundColor: safeColor(raw.overlayBackgroundColor, FALLBACKS.overlayBackgroundColor),
    overlayBackgroundOpacity: decimal(raw.overlayBackgroundOpacity, 0, 1, FALLBACKS.overlayBackgroundOpacity),
    overlayAccentColor: safeColor(raw.overlayAccentColor, FALLBACKS.overlayAccentColor),
    overlayTextColor: safeColor(raw.overlayTextColor, FALLBACKS.overlayTextColor),
    overlayFontFamily: ['display', 'broadcast', 'serif', 'mono'].includes(raw.overlayFontFamily) ? raw.overlayFontFamily : FALLBACKS.overlayFontFamily,
  };
}

function candidateRecord(value) {
  if (!value || typeof value !== 'object') return undefined;
  const userId = clean(value.userId, 64); const login = normalizedLogin(value.login);
  const displayName = clean(value.displayName, 100);
  const source = ['preferred', 'followed', 'category'].includes(value.source) ? value.source : '';
  if (!userId || !login || !displayName || !source) return undefined;
  return {
    userId, login, displayName, source, category: clean(value.category, 140), title: clean(value.title, 300),
    viewerCount: integer(value.viewerCount, 0, 10_000_000, 0), startedAt: clean(value.startedAt, 40),
    language: clean(value.language, 12).toLowerCase(),
    tags: Array.isArray(value.tags) ? [...new Set(value.tags.map((tag) => clean(tag, 100)).filter(Boolean))].slice(0, 20) : [],
    thumbnailUrl: safeHttps(value.thumbnailUrl), profileImageUrl: safeHttps(value.profileImageUrl),
  };
}
function suggestionRecord(value) {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = candidateRecord(value.candidate); const suggestedAt = clean(value.suggestedAt, 40);
  const expiresAt = clean(value.expiresAt, 40);
  return candidate && suggestedAt && expiresAt ? { candidate, suggestedAt, expiresAt } : undefined;
}
function historyRecord(value) {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = candidateRecord(value.candidate); const at = clean(value.at, 40);
  const status = ['suggested', 'confirmed', 'failed'].includes(value.status) ? value.status : '';
  if (!candidate || !at || !status) return undefined;
  return { candidate, at, status, streamCycle: integer(value.streamCycle, 0, Number.MAX_SAFE_INTEGER, 0), error: clean(value.error, 300) };
}
function pendingRecord(value) {
  if (!value || typeof value !== 'object') return undefined;
  const operation = ['discover', 'clip', 'clip-download', 'clip-playback', 'raid-waiting-for-ad', 'raid', 'end-broadcast-waiting-for-ad', 'end-broadcast-countdown', 'end-broadcast-awaiting-stop'].includes(value.operation) ? value.operation : '';
  const requestId = clean(value.requestId, 100); const startedAt = integer(value.startedAt, 0, Number.MAX_SAFE_INTEGER, 0);
  const candidate = candidateRecord(value.candidate);
  const clip = clipRecord(value.clip);
  const remainingClips = Array.isArray(value.remainingClips) ? value.remainingClips.map(clipRecord).filter(Boolean).slice(0, MAXIMUM_CANDIDATES) : [];
  const playbackId = clean(value.playbackId, 100);
  const durationMs = integer(value.durationMs, 5_000, 90_000, 0);
  const actionId = clean(value.actionId, 36);
  const provider = ['obs', 'meld', 'streamlabs'].includes(value.provider) ? value.provider : 'obs';
  const executeAt = integer(value.executeAt, 0, Number.MAX_SAFE_INTEGER, 0);
  if (!operation || !requestId || !startedAt || (operation !== 'discover' && !candidate)
    || (operation === 'clip-download' && !clip)
    || (operation === 'clip-playback' && (!playbackId || durationMs === 0))
    || (operation.startsWith('end-broadcast-') && (!actionId || !executeAt))) return undefined;
  return { operation, requestId, startedAt, ...(candidate ? { candidate } : {}), ...(clip ? { clip, remainingClips } : {}), ...(playbackId ? { playbackId, durationMs } : {}), ...(actionId ? { actionId, provider, executeAt } : {}), ...(value.autoConfirm === true ? { autoConfirm: true } : {}) };
}

function broadcastProviderName(provider) {
  return provider === 'meld' ? 'Meld Studio' : provider === 'streamlabs' ? 'Streamlabs Desktop' : 'OBS Studio';
}

function clipRecord(value) {
  if (!value || typeof value !== 'object') return undefined;
  const id = clean(value.id, 100); const embedUrl = safeHttps(value.embedUrl);
  let parsed;
  try { parsed = new URL(embedUrl); } catch { return undefined; }
  if (!id || parsed.hostname !== 'clips.twitch.tv' || parsed.pathname !== '/embed') return undefined;
  const durationSeconds = decimal(value.durationSeconds, 5, 90, 0);
  if (durationSeconds <= 0) return undefined;
  return { id, embedUrl, title: clean(value.title, 300), thumbnailUrl: safeHttps(value.thumbnailUrl), durationSeconds };
}
function viewerSuggestionRecord(value) {
  if (!value || typeof value !== 'object') return undefined;
  const login = normalizedLogin(value.login); const storedUserId = clean(value.userId, 256);
  const userId = storedUserId && !storedUserId.includes(':') ? `twitch:${storedUserId}` : storedUserId;
  const displayName = clean(value.displayName, 100); const redemptionId = clean(value.redemptionId, 256);
  const addedAt = clean(value.addedAt, 40);
  return login && userId && displayName && redemptionId && addedAt ? { login, userId, displayName, redemptionId, addedAt } : undefined;
}
function pendingViewerSuggestionRecord(value) {
  if (!value || typeof value !== 'object') return undefined;
  const requestId = clean(value.requestId, 100); const rewardId = clean(value.rewardId, 256);
  const startedAt = integer(value.startedAt, 0, Number.MAX_SAFE_INTEGER, 0);
  const suggestion = viewerSuggestionRecord(value.suggestion);
  return requestId && rewardId && suggestion && Date.now() - startedAt <= MAXIMUM_PENDING_MS
    ? { requestId, rewardId, startedAt, suggestion }
    : undefined;
}

export function sanitizeState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const suggestion = suggestionRecord(source.suggestion); const pending = pendingRecord(source.pending); const bags = {};
  for (const tier of ['preferred', 'followed', 'category']) {
    bags[tier] = Array.isArray(source.bags?.[tier])
      ? [...new Set(source.bags[tier].map((item) => clean(item, 64)).filter(Boolean))].slice(0, MAXIMUM_BAG) : [];
  }
  return {
    version: 2, streamCycle: integer(source.streamCycle, 0, Number.MAX_SAFE_INTEGER, 0), bags,
    twitchLive: source.twitchLive === true,
    autoSceneStartedCycle: integer(source.autoSceneStartedCycle, 0, Number.MAX_SAFE_INTEGER, 0),
    lastAdStartedAt: integer(source.lastAdStartedAt, 0, Number.MAX_SAFE_INTEGER, 0),
    lastAdEndsAt: integer(source.lastAdEndsAt, 0, Number.MAX_SAFE_INTEGER, 0),
    raidFlowAdEndsAt: integer(source.raidFlowAdEndsAt, 0, Number.MAX_SAFE_INTEGER, 0),
    raidFlowStartedAt: integer(source.raidFlowStartedAt, 0, Number.MAX_SAFE_INTEGER, 0),
    raidFlowAdRequestedAt: integer(source.raidFlowAdRequestedAt, 0, Number.MAX_SAFE_INTEGER, 0),
    raidFlowAdRequestId: clean(source.raidFlowAdRequestId, 100),
    raidFlowAdRequestFailed: source.raidFlowAdRequestFailed === true,
    history: Array.isArray(source.history) ? source.history.map(historyRecord).filter(Boolean).slice(-MAXIMUM_HISTORY) : [],
    viewerSuggestions: Array.isArray(source.viewerSuggestions)
      ? source.viewerSuggestions.map(viewerSuggestionRecord).filter(Boolean).slice(-MAXIMUM_VIEWER_SUGGESTIONS) : [],
    pendingViewerSuggestions: Array.isArray(source.pendingViewerSuggestions)
      ? source.pendingViewerSuggestions.map(pendingViewerSuggestionRecord).filter(Boolean).slice(-MAXIMUM_VIEWER_SUGGESTIONS) : [],
    lastError: clean(source.lastError, 300), ...(suggestion ? { suggestion } : {}),
    ...(pending && Date.now() - pending.startedAt <= (pending.operation === 'clip-playback' ? MAXIMUM_CLIP_PENDING_MS : pending.operation === 'raid-waiting-for-ad' || pending.operation.startsWith('end-broadcast-') ? RAID_MEDIA_LEASE_MS : MAXIMUM_PENDING_MS) ? { pending } : {}),
  };
}

function shuffle(values) {
  const output = [...values];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(Math.random() * (index + 1));
    [output[index], output[selected]] = [output[selected], output[index]];
  }
  return output;
}

export function filterCandidates(candidates, state, settings, broadcaster, options = {}) {
  const ownId = clean(broadcaster?.userId, 64); const ownLogin = normalizedLogin(broadcaster?.login);
  const priorRaidCutoff = Math.max(0, state.streamCycle - settings.recentRaidStreams + 1);
  const recentlyRaided = new Set(state.history.filter((entry) => entry.status === 'confirmed' && entry.streamCycle >= priorRaidCutoff).map((entry) => entry.candidate.userId));
  const seen = new Set();
  return candidates.map(candidateRecord).filter(Boolean).filter((candidate) => {
    if (seen.has(candidate.userId)) return false; seen.add(candidate.userId);
    if (candidate.userId === ownId || candidate.login === ownLogin || settings.excludedChannels.has(candidate.login)) return false;
    if (recentlyRaided.has(candidate.userId)) return false;
    if (candidate.viewerCount < settings.minimumViewers || (!options.ignoreMaximumViewers && candidate.viewerCount > settings.maximumViewers)) return false;
    if (settings.requireMatchingLanguage && settings.preferredLanguage && candidate.language !== settings.preferredLanguage) return false;
    const category = candidate.category.toLowerCase();
    if (settings.excludedCategories.some((excluded) => category.includes(excluded))) return false;
    const tags = candidate.tags.map((tag) => tag.toLowerCase());
    return !settings.excludedTags.some((excluded) => tags.some((tag) => tag.includes(excluded)));
  }).slice(0, MAXIMUM_CANDIDATES);
}
export function selectCandidate(candidates, state) {
  const currentId = state.suggestion?.candidate?.userId;
  for (const source of ['preferred', 'followed', 'category']) {
    const ordered = candidates
      .filter((candidate) => candidate.source === source && candidate.userId !== currentId)
      .sort((left, right) => left.viewerCount - right.viewerCount || left.login.localeCompare(right.login));
    if (ordered[0]) return { candidate: ordered[0], bags: { ...state.bags } };
  }
  return { candidate: undefined, bags: { ...state.bags } };
}

function withoutPending(state) { const next = { ...state }; delete next.pending; return next; }
function withoutSuggestion(state) { const next = { ...state }; delete next.suggestion; return next; }
function withoutRaidFlow(state) {
  const next = { ...state, raidFlowAdEndsAt: 0, raidFlowStartedAt: 0, raidFlowAdRequestedAt: 0, raidFlowAdRequestId: '', raidFlowAdRequestFailed: false };
  return next;
}
function formatTemplate(template, candidate, maximum = 500) {
  const started = Date.parse(candidate.startedAt);
  const values = {
    displayName: candidate.displayName, login: candidate.login, category: candidate.category || 'No category',
    title: candidate.title, viewers: candidate.viewerCount, language: candidate.language || 'unknown',
    durationMinutes: Number.isFinite(started) ? Math.max(0, Math.floor((Date.now() - started) / 60_000)) : 0,
    source: candidate.source,
  };
  let result = clean(template, maximum * 4);
  for (const [key, value] of Object.entries(values)) result = result.replaceAll(`{${key}}`, clean(String(value), maximum));
  return [...result].slice(0, maximum).join('');
}
function formatViewerSuggestionMessage(template, suggestion, maximum = 500) {
  let result = clean(template, maximum * 4);
  const values = { viewer: suggestion.displayName, channel: suggestion.login };
  for (const [key, value] of Object.entries(values)) result = result.replaceAll(`{${key}}`, clean(String(value), maximum));
  return [...result].slice(0, maximum).join('');
}
function suggestedLogin(value) {
  const text = clean(value, 300).trim();
  if (!text) return '';
  const withoutProtocol = text.replace(/^https?:\/\//iu, '').replace(/^www\./iu, '');
  const match = /^twitch\.tv\/([^/?#]+)(?:[/?#].*)?$/iu.exec(withoutProtocol);
  return normalizedLogin(match?.[1] || text);
}
function preferredChannelsFor(settings, state) {
  return [...new Set([
    ...state.viewerSuggestions.map((entry) => entry.login),
    ...settings.preferredChannels,
  ])].slice(0, settings.maximumPreferredLookups);
}
function requestId(prefix) {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}
async function runController(context, argumentsValue) {
  if (!context.approvedActionIds.includes(CONTROLLER_ACTION_ID)) throw new Error('Raid Scout Controller is not approved.');
  await context.streamerbot.runApprovedAction(CONTROLLER_ACTION_ID, argumentsValue);
}
async function sendChat(context, message, platform = 'twitch') {
  if (!message) return;
  try { await context.chat.send({ message, routing: 'source', sourcePlatform: platform, overflow: 'reject' }); } catch { /* Cosmetic only. */ }
}
function overlayStyle(settings) {
  return {
    backgroundMode: settings.overlayBackgroundMode, backgroundColor: settings.overlayBackgroundColor,
    backgroundOpacity: settings.overlayBackgroundOpacity, accentColor: settings.overlayAccentColor,
    textColor: settings.overlayTextColor, fontFamily: settings.overlayFontFamily,
  };
}
function cancelProgress(context) {
  for (const taskId of progressTasks) context?.schedule?.cancel?.(taskId);
  progressTasks = [];
}
function cancelClipFallback(context) {
  if (clipFallbackTask) context?.schedule?.cancel?.(clipFallbackTask);
  clipFallbackTask = undefined;
}
function cancelControllerWatchdog(context) {
  if (controllerWatchdogTask) context?.schedule?.cancel?.(controllerWatchdogTask);
  controllerWatchdogTask = undefined;
}
function cancelBroadcastEndTasks(context) {
  if (broadcastEndTask) context?.schedule?.cancel?.(broadcastEndTask);
  if (broadcastStopConfirmationTask) context?.schedule?.cancel?.(broadcastStopConfirmationTask);
  broadcastEndTask = undefined;
  broadcastStopConfirmationTask = undefined;
}
async function publishStatusCard(context, settings, title, text, durationMs = PROGRESS_STEP_MS) {
  try {
    await context.overlay.publish('thsv.raid-scout.card.show', {
      title: clean(title, 200), text: clean(text, 500), durationMs, style: overlayStyle(settings),
    }, { lane: 'foreground' });
  } catch { /* Optional private dock or browser source may be closed. */ }
}
function sourceResultRecords(value, sourceOrder) {
  const incoming = Array.isArray(value) ? value : [];
  const bySource = new Map(incoming.map((item) => [clean(item?.source, 20), item]));
  return sourceOrder.map((source) => {
    const item = bySource.get(source) || {};
    const status = ['skipped', 'found', 'none', 'unavailable'].includes(item.status) ? item.status : 'none';
    return { source, status, candidateCount: integer(item.candidateCount, 0, MAXIMUM_CANDIDATES, 0) };
  });
}
function sourceLabel(source) {
  return source === 'preferred' ? 'preferred channels' : source === 'followed' ? 'followed live channels' : 'same-category channels';
}
function queueProgressCard(context, delayMs, settings, title, text, durationMs = PROGRESS_STEP_MS) {
  const taskId = context.schedule.after(Math.max(1_000, delayMs), () => queueScheduledWork(async () => {
    progressTasks = progressTasks.filter((candidate) => candidate !== taskId);
    if (stopped) return;
    await publishStatusCard(context, settings, title, text, durationMs);
  }));
  progressTasks.push(taskId);
}
function queueDiscoveryPhases(context, settings, results) {
  let delay = 1_000;
  for (const result of results) {
    const label = sourceLabel(result.source);
    queueProgressCard(context, delay, settings, 'CHECKING...', `Checking ${label}.`); delay += PROGRESS_STEP_MS;
    const summary = result.status === 'found' ? `Found ${String(result.candidateCount)} live option${result.candidateCount === 1 ? '' : 's'} — applying your safety filters.`
      : result.status === 'unavailable' ? `Could not check ${label} — moving on safely.`
        : result.status === 'skipped' ? `${label[0].toUpperCase()}${label.slice(1)} are disabled — moving on.`
          : `No live options found in ${label} — moving on.`;
    queueProgressCard(context, delay, settings, result.status === 'found' ? 'OPTIONS FOUND' : 'NONE FOUND', summary); delay += PROGRESS_STEP_MS;
  }
  return delay;
}
async function publishCard(context, settings, candidate, confirmed) {
  if ((confirmed && !settings.showConfirmedCard) || (!confirmed && !settings.showSuggestionCard)) return;
  const reason = candidate.source === 'preferred' ? 'Preferred channel' : candidate.source === 'followed' ? 'Followed live channel' : 'Same category';
  try {
    await context.overlay.publish('thsv.raid-scout.card.show', {
      title: confirmed ? 'NEXT STOP' : 'RAID SUGGESTION',
      text: clean(`${candidate.displayName} - ${candidate.category || 'No category'} - ${String(candidate.viewerCount)} viewers - ${reason}`, 500),
      ...(candidate.profileImageUrl ? { imageUrl: candidate.profileImageUrl } : {}),
      durationMs: settings.cardSeconds * 1_000, style: overlayStyle(settings),
    }, { lane: 'foreground' });
  } catch { /* Optional presentation. */ }
}

async function requestDiscovery(context, settings, state, autoConfirm = false) {
  if (state.pending) {
    await publishStatusCard(context, settings, 'RAID SCOUT BUSY', 'The current Raid Scout step is still running. Use Cancel if you need to stop it.', 5_000);
    return state;
  }
  if (!context.approvedActionIds.includes(CONTROLLER_ACTION_ID)) {
    const unavailable = { ...state, lastError: 'Raid Scout Controller is not approved.' };
    await context.state.write(unavailable);
    await publishStatusCard(context, settings, 'CONTROLLER NOT READY', 'Approve the triggerless Raid Scout Controller action in the wizard, then try again.', 8_000);
    return unavailable;
  }
  cancelProgress(context);
  if (settings.showSearchProgress) await publishStatusCard(context, settings, 'RAID SCOUT', 'Starting a safe destination search...', 1_500);
  const pending = { operation: 'discover', requestId: requestId('discover'), startedAt: Date.now(), ...(autoConfirm ? { autoConfirm: true } : {}) };
  const reserved = { ...state, pending, lastError: '' }; await context.state.write(reserved);
  try {
    await runController(context, {
      raidScoutOperation: 'discover', raidScoutRequestId: pending.requestId,
      raidScoutPreferredChannels: preferredChannelsFor(settings, state).join(','),
      raidScoutUsePreferred: settings.usePreferred || settings.viewerSuggestionsEnabled, raidScoutUseFollowed: settings.useFollowed,
      raidScoutUseCategory: settings.useCategory, raidScoutMaximumFollowedResults: settings.maximumFollowedResults,
      raidScoutMaximumFollowedPages: settings.maximumFollowedPages,
      raidScoutMaximumCategoryResults: settings.maximumCategoryResults,
      raidScoutSourceOrder: 'preferred,followed,category',
      raidScoutCurrentAudienceEstimate: settings.currentAudienceEstimate,
    });
    armControllerWatchdog(context, settings, pending);
    return reserved;
  } catch {
    const rolledBack = { ...withoutPending(reserved), lastError: 'Streamer.bot could not start Twitch discovery.' };
    await context.state.write(rolledBack); return rolledBack;
  }
}

function automaticEndingArmed(context, settings) {
  return settings.endBroadcastAfterRaid && settings.endBroadcastTiming === 'after-ad'
    && settings.endBroadcastAcknowledged && settings.endBroadcastActionId
    && !RAID_SCOUT_CONTROL_ACTION_IDS.has(settings.endBroadcastActionId)
    && context.approvedActionIds.includes(settings.endBroadcastActionId)
    && context.approvedActionIds.includes(RUN_ENDING_AD_ACTION_ID);
}

async function startOrAdoptEndingAd(context, settings, state) {
  const now = Date.now();
  const activeEndsAt = Math.max(activeAdEndsAt, state.lastAdEndsAt);
  let prepared = {
    ...withoutRaidFlow(state), raidFlowStartedAt: now,
    raidFlowAdEndsAt: activeEndsAt > now ? activeEndsAt : 0,
  };
  if (!automaticEndingArmed(context, settings) || !state.twitchLive || activeEndsAt > now) {
    await context.state.write(prepared);
    return prepared;
  }

  const requestIdValue = requestId('ending-ad');
  prepared = {
    ...prepared, raidFlowAdRequestedAt: now, raidFlowAdRequestId: requestIdValue,
    raidFlowAdRequestFailed: false, lastError: '',
  };
  await context.state.write(prepared);
  endingAdRequestedAt = now;
  endingAdAttemptFailed = false;
  const adDispatch = context.streamerbot.runApprovedAction(RUN_ENDING_AD_ACTION_ID, {
    raidScoutOperation: 'run-ending-ad', raidScoutRequestId: requestIdValue,
    raidScoutAdDurationSeconds: settings.endBroadcastAdDurationSeconds,
  });
  void adDispatch.catch(() => queueScheduledWork(async () => {
    const current = sanitizeState(await context.state.read());
    if (current.raidFlowAdRequestId !== requestIdValue) return;
    endingAdAttemptFailed = true;
    const failed = { ...current, raidFlowAdRequestFailed: true, lastError: 'Streamer.bot could not request the ending ad.' };
    await context.state.write(failed);
  }));
  await publishStatusCard(context, settings, 'STARTING END AD', `Asking Twitch to start the ${String(settings.endBroadcastAdDurationSeconds)} second ending ad while Raid Scout finds your destination.`, 8_000);
  return prepared;
}

async function settleViewerRedemption(event, context, operation, requestIdValue) {
  if (event.platform !== 'twitch') return false;
  const supported = Array.isArray(event.payload?.supportedOperations) ? event.payload.supportedOperations : [];
  const requiredCapability = operation === 'redemption-fulfill' ? 'fulfill' : 'cancel';
  if (event.payload?.skipsQueue === true || !supported.includes(requiredCapability)) return false;
  await runController(context, {
    raidScoutOperation: operation, raidScoutRequestId: requestIdValue,
    raidScoutRewardId: clean(event.payload?.rewardId, 256),
    raidScoutRedemptionId: clean(event.payload?.redemptionId, 256),
  });
  return true;
}

async function rejectViewerSuggestion(event, context, settings, suggestion) {
  try { await settleViewerRedemption(event, context, 'redemption-cancel', requestId('viewer-cancel')); } catch { /* Leave the redemption pending when refund dispatch is unavailable. */ }
  if (settings.announceViewerSuggestions) await sendChat(context, formatViewerSuggestionMessage(settings.viewerSuggestionRejectedMessage, suggestion), event.platform);
}

async function acceptViewerSuggestion(context, settings, state, suggestion, platform = 'twitch') {
  const next = {
    ...state, lastError: '',
    viewerSuggestions: [...state.viewerSuggestions, suggestion].slice(-settings.maximumViewerSuggestions),
  };
  await context.state.write(next);
  if (settings.announceViewerSuggestions) await sendChat(context, formatViewerSuggestionMessage(settings.viewerSuggestionAcceptedMessage, suggestion), platform);
  return next;
}

async function handleViewerSuggestionRedemption(event, context, settings, state) {
  const configuredRewardId = event.platform === 'twitch' ? settings.viewerSuggestionRewardId : event.platform === 'kick' ? settings.kickViewerSuggestionRewardId : '';
  if (!settings.viewerSuggestionsEnabled || !configuredRewardId || !['twitch', 'kick'].includes(event.platform)
    || event.metadata?.simulated === true || event.payload?.verifiedTransport !== true
    || clean(event.payload?.rewardId, 256) !== configuredRewardId) return state;
  const suggestion = {
    login: suggestedLogin(event.payload?.input), userId: `${event.platform}:${clean(event.user?.id, 240)}`,
    displayName: clean(event.user?.displayName || event.user?.name, 100),
    redemptionId: clean(event.payload?.redemptionId, 256), addedAt: new Date().toISOString(),
  };
  const occupied = state.viewerSuggestions.length + state.pendingViewerSuggestions.length;
  const duplicateLogin = settings.preferredChannels.includes(suggestion.login)
    || state.viewerSuggestions.some((entry) => entry.login === suggestion.login)
    || state.pendingViewerSuggestions.some((entry) => entry.suggestion.login === suggestion.login);
  const duplicateViewer = settings.oneViewerSuggestionPerStream && (
    state.viewerSuggestions.some((entry) => entry.userId === suggestion.userId)
    || state.pendingViewerSuggestions.some((entry) => entry.suggestion.userId === suggestion.userId)
  );
  const invalid = !suggestion.login || !suggestion.userId || !suggestion.displayName || !suggestion.redemptionId
    || settings.excludedChannels.has(suggestion.login) || duplicateLogin || duplicateViewer
    || occupied >= settings.maximumViewerSuggestions;
  if (invalid) { await rejectViewerSuggestion(event, context, settings, suggestion); return state; }
  if (event.platform === 'kick' || event.payload?.skipsQueue === true) return acceptViewerSuggestion(context, settings, state, suggestion, event.platform);

  const requestIdValue = requestId('viewer-fulfill');
  const pending = { requestId: requestIdValue, rewardId: settings.viewerSuggestionRewardId, startedAt: Date.now(), suggestion };
  const reserved = { ...state, pendingViewerSuggestions: [...state.pendingViewerSuggestions, pending] };
  await context.state.write(reserved);
  try {
    if (!await settleViewerRedemption(event, context, 'redemption-fulfill', requestIdValue)) throw new Error('Fulfillment is unavailable.');
    return reserved;
  } catch {
    const rolledBack = { ...reserved, pendingViewerSuggestions: reserved.pendingViewerSuggestions.filter((entry) => entry.requestId !== requestIdValue), lastError: 'Streamer.bot could not fulfill the raid-suggestion redemption.' };
    await context.state.write(rolledBack); return rolledBack;
  }
}

async function handleViewerSuggestionCommand(event, context, settings, state) {
  if (!settings.viewerSuggestionsEnabled || event.eventType !== 'command.received' || !['youtube', 'tiktok'].includes(event.platform) || event.metadata?.simulated === true || event.user?.actorType !== 'human' || clean(event.payload?.command, 64).toLowerCase() !== settings.viewerSuggestionCommand) return state;
  const providerUserId = clean(event.user?.id, 240); const stableEventId = clean(event.eventId || event.source?.eventId, 200); const args = Array.isArray(event.payload?.arguments) ? event.payload.arguments : [];
  if (!providerUserId || !stableEventId) return state;
  const suggestion = { login: suggestedLogin(args[0]), userId: `${event.platform}:${providerUserId}`, displayName: clean(event.user?.displayName || event.user?.name, 100), redemptionId: `command:${stableEventId}`, addedAt: new Date().toISOString() };
  const occupied = state.viewerSuggestions.length + state.pendingViewerSuggestions.length;
  const duplicateLogin = settings.preferredChannels.includes(suggestion.login) || state.viewerSuggestions.some((entry) => entry.login === suggestion.login) || state.pendingViewerSuggestions.some((entry) => entry.suggestion.login === suggestion.login);
  const duplicateViewer = settings.oneViewerSuggestionPerStream && (state.viewerSuggestions.some((entry) => entry.userId === suggestion.userId) || state.pendingViewerSuggestions.some((entry) => entry.suggestion.userId === suggestion.userId));
  if (!providerUserId || !suggestion.login || !suggestion.displayName || settings.excludedChannels.has(suggestion.login) || duplicateLogin || duplicateViewer || occupied >= settings.maximumViewerSuggestions) { if (settings.announceViewerSuggestions) await sendChat(context, formatViewerSuggestionMessage(settings.viewerSuggestionRejectedMessage, suggestion), event.platform); return state; }
  const projection = await context.viewerFoundation.getProjection({ platform: event.platform, userId: providerUserId }); if (!projection) return state;
  const idempotencyKey = `raid-scout-suggestion:${stableEventId}`;
  try { await context.viewerFoundation.mutate({ viewerId: projection.viewerId, operation: 'spend', amount: settings.viewerSuggestionPointsCost, reason: 'Raid Scout viewer suggestion', idempotencyKey }); }
  catch { await sendChat(context, `You need ${String(settings.viewerSuggestionPointsCost)} ${projection.currencyName || 'points'} to suggest a raid channel.`, event.platform); return state; }
  try { return await acceptViewerSuggestion(context, settings, state, suggestion, event.platform); }
  catch (error) { await context.viewerFoundation.mutate({ viewerId: projection.viewerId, operation: 'refund', amount: settings.viewerSuggestionPointsCost, reason: 'Raid Scout suggestion rollback', idempotencyKey: `${idempotencyKey}:rollback` }).catch(() => undefined); throw error; }
}

async function handleViewerRedemptionResult(event, context, settings, state) {
  const operation = clean(event.payload?.operation, 40);
  if (operation !== 'redemption-fulfill') return state;
  const requestIdValue = clean(event.payload?.requestId, 100);
  const pending = state.pendingViewerSuggestions.find((entry) => entry.requestId === requestIdValue);
  if (!pending) return state;
  const base = { ...state, pendingViewerSuggestions: state.pendingViewerSuggestions.filter((entry) => entry.requestId !== requestIdValue) };
  if (event.payload?.success !== true) {
    const failed = { ...base, lastError: clean(event.payload?.error, 300) || 'Streamer.bot could not fulfill the raid-suggestion redemption.' };
    await context.state.write(failed); return failed;
  }
  return acceptViewerSuggestion(context, settings, base, pending.suggestion);
}

async function clearViewerSuggestions(context, state, beginStream) {
  const next = {
    ...withoutRaidFlow(state), streamCycle: beginStream ? state.streamCycle + 1 : state.streamCycle,
    twitchLive: beginStream,
    viewerSuggestions: [], pendingViewerSuggestions: [],
    bags: { ...state.bags, preferred: [] },
  };
  await context.state.write(next); return next;
}

async function claimRaidMediaSlot(context, settings) {
  if (!settings.pauseOtherVideoOverlays) return true;
  if (mediaLeaseId) return true;
  const lease = await context.mediaSlot.acquire({ durationMs: RAID_MEDIA_LEASE_MS, priority: 100 });
  if (!lease.acquired || typeof lease.leaseId !== 'string') {
    await publishStatusCard(context, settings, 'VIDEO PREVIEW BUSY', 'Another THSV video overlay is currently protected. Moving directly to the raid.', 2_500);
    return false;
  }
  mediaLeaseId = lease.leaseId;
  return true;
}

async function releaseRaidMediaSlot(context) {
  const leaseId = mediaLeaseId; mediaLeaseId = undefined;
  if (!leaseId || typeof context?.mediaSlot?.release !== 'function') return;
  try { await context.mediaSlot.release(leaseId); } catch { /* Cleanup must never block the raid flow. */ }
}

function armControllerWatchdog(context, settings, pending) {
  cancelControllerWatchdog(context);
  const timeoutMs = pending.operation === 'discover' ? DISCOVERY_RESPONSE_TIMEOUT_MS
    : pending.operation === 'raid' ? RAID_RESPONSE_TIMEOUT_MS : CLIP_RESPONSE_TIMEOUT_MS;
  controllerWatchdogTask = context.schedule.after(timeoutMs, () => queueScheduledWork(async () => {
    controllerWatchdogTask = undefined;
    const current = sanitizeState(await context.state.read());
    if (current.pending?.operation !== pending.operation || current.pending.requestId !== pending.requestId) return;
    const candidate = current.pending.candidate;
    if (pending.operation === 'discover') {
      const recovered = { ...withoutPending(current), lastError: 'Twitch discovery did not answer before the safety timeout.' };
      await context.state.write(recovered);
      await publishStatusCard(context, settings, 'SEARCH TIMED OUT', 'Twitch did not answer. Raid Scout is ready to try Suggest or Finish Stream again.', 8_000);
      return;
    }
    if (pending.operation === 'clip') {
      const recovered = { ...withoutPending(current), lastError: 'Clip lookup timed out; continuing without a preview.' };
      await context.state.write(recovered); await releaseRaidMediaSlot(context);
      await publishStatusCard(context, settings, 'CLIP LOOKUP TIMED OUT', 'Moving directly to the confirmed raid.', 4_000);
      if (candidate) await requestRaid(context, recovered, candidate);
      return;
    }
    if (pending.operation === 'clip-download') {
      if (!candidate) {
        const recovered = { ...withoutPending(current), lastError: 'Clip resolution lost its confirmed raid destination.' };
        await context.state.write(recovered); await releaseRaidMediaSlot(context);
        await publishStatusCard(context, settings, 'RAID DESTINATION LOST', 'Use Suggest or Finish Stream to choose another destination.', 8_000);
        return;
      }
      await publishStatusCard(context, settings, 'CLIP SOURCE TIMED OUT', 'Trying the next available clip source.', 3_000);
      await requestNextRaidClip(context, settings, withoutPending(current), candidate, current.pending.remainingClips || []);
      return;
    }
    if (pending.operation === 'raid') {
      const error = 'Twitch did not confirm whether the raid started. Raid Scout will not retry automatically to avoid sending a duplicate raid.';
      const recovered = {
        ...withoutPending(current), lastError: error,
        history: candidate ? [...current.history, { candidate, at: new Date().toISOString(), status: 'failed', streamCycle: current.streamCycle, error }].slice(-MAXIMUM_HISTORY) : current.history,
      };
      await context.state.write(recovered); await releaseRaidMediaSlot(context);
      await publishStatusCard(context, settings, 'RAID NOT CONFIRMED', 'Twitch did not confirm the raid. The approved broadcast-ending flow will still continue after the ending ad.', 10_000);
      if (candidate) await beginBroadcastEnd(context, settingsFor(context), recovered, candidate);
    }
  }));
}

async function requestClip(context, settings, state, candidate) {
  if (state.pending || !context.approvedActionIds.includes(CONTROLLER_ACTION_ID)) return state;
  if (!await claimRaidMediaSlot(context, settings)) return requestRaid(context, state, candidate);
  const pending = { operation: 'clip', requestId: requestId('clip'), startedAt: Date.now(), candidate };
  const reserved = { ...state, pending, lastError: '' }; await context.state.write(reserved);
  await publishStatusCard(context, settings, 'RAID CLIP', `Finding one clip from ${candidate.displayName}...`, 2_000);
  try {
    await runController(context, {
      raidScoutOperation: 'clip', raidScoutRequestId: pending.requestId,
      raidScoutTargetUserId: candidate.userId, raidScoutClipLookupCount: settings.clipLookupCount,
    });
    armControllerWatchdog(context, settings, pending);
    return reserved;
  } catch {
    const next = withoutPending(reserved);
    await context.state.write(next);
    await releaseRaidMediaSlot(context);
    return requestRaid(context, next, candidate);
  }
}

async function beginConfirmedDestination(context, settings, state, candidate) {
  // Bind only an ad that is genuinely active when this raid flow begins. A prior commercial that
  // already ended is not an ending ad for this raid and must not suppress Raid Scout's own request.
  const now = Date.now();
  const activeEndsAt = Math.max(activeAdEndsAt, state.lastAdEndsAt);
  const boundEndsAt = state.raidFlowAdEndsAt > 0 && now <= state.raidFlowAdEndsAt + PREFLIGHT_ENDING_AD_REUSE_MS
    ? state.raidFlowAdEndsAt : 0;
  const prepared = {
    ...state, raidFlowStartedAt: state.raidFlowStartedAt || now,
    raidFlowAdEndsAt: Math.max(activeEndsAt > now ? activeEndsAt : 0, boundEndsAt),
  };
  await context.state.write(prepared);
  return settings.previewClipBeforeRaid ? requestClip(context, settings, prepared, candidate) : requestRaid(context, prepared, candidate);
}

async function dispatchRaid(context, state, candidate) {
  if (state.pending || !context.approvedActionIds.includes(CONTROLLER_ACTION_ID)) return state;
  const pending = { operation: 'raid', requestId: requestId('raid'), startedAt: Date.now(), candidate };
  const reserved = { ...state, pending, lastError: '' }; await context.state.write(reserved);
  // Twitch can take longer than the framework's five-second event budget to acknowledge a raid.
  // Reserve the request first, then observe the action asynchronously so a slow Twitch response
  // cannot make the framework deny Raid Scout's result handler or ending timer.
  void runController(context, {
    raidScoutOperation: 'raid', raidScoutRequestId: pending.requestId,
    raidScoutTargetLogin: candidate.login, raidScoutTargetUserId: candidate.userId,
  }).catch(() => queueScheduledWork(async () => {
    cancelControllerWatchdog(context);
    const current = sanitizeState(await context.state.read());
    if (current.pending?.operation !== 'raid' || current.pending.requestId !== pending.requestId) return;
    const failed = {
      ...withoutPending(current), lastError: 'Streamer.bot could not start the confirmed raid.',
      history: [...current.history, { candidate, at: new Date().toISOString(), status: 'failed', streamCycle: current.streamCycle, error: 'Controller dispatch failed.' }].slice(-MAXIMUM_HISTORY),
    };
    await context.state.write(failed); await releaseRaidMediaSlot(context);
    await beginBroadcastEnd(context, settingsFor(context), failed, candidate);
  }));
  armControllerWatchdog(context, settingsFor(context), pending);
  return reserved;
}

async function continueRaidWithoutEndingAd(context, requestIdValue) {
  cancelBroadcastEndTasks(context);
  const state = sanitizeState(await context.state.read());
  if (state.pending?.operation !== 'raid-waiting-for-ad' || state.pending.requestId !== requestIdValue) return state;
  const candidate = state.pending.candidate;
  endingAdAttemptFailed = true;
  endingAdRequestedAt = 0;
  const next = { ...withoutPending(state), lastError: 'Twitch did not confirm the ending ad. The raid will continue, but the broadcast will remain live.' };
  await context.state.write(next);
  await publishStatusCard(context, settingsFor(context), 'END AD UNAVAILABLE', 'Twitch did not confirm the ending ad. Starting the raid, but leaving the broadcast live for safety.', 8_000);
  return dispatchRaid(context, next, candidate);
}

async function handleEndingAdRequestResult(event, context, settings, state) {
  const requestIdValue = clean(event.payload?.requestId, 100);
  if (requestIdValue && state.raidFlowAdRequestId === requestIdValue) {
    // A genuine Ad Run event is stronger evidence than a delayed negative request result.
    if (event.payload?.success === true || reusableEndingAdEndsAt(state) > 0) return state;
    endingAdAttemptFailed = true;
    const failed = {
      ...state, raidFlowAdRequestFailed: true,
      lastError: clean(event.payload?.error, 300) || 'Twitch rejected the ending ad request.',
    };
    await context.state.write(failed);
    await publishStatusCard(context, settings, 'END AD UNAVAILABLE', 'Destination search will continue. Raid Scout will raid normally but leave every broadcast live unless a genuine Ad Run signal arrives.', 8_000);
    return failed;
  }
  if (!requestIdValue || state.pending?.requestId !== requestIdValue
    || !['raid-waiting-for-ad', 'end-broadcast-waiting-for-ad'].includes(state.pending.operation)) return state;
  // Dispatch acceptance is not proof that an ad began; the genuine Ad Run event remains the only
  // timer authority. A negative result is useful, however, because it lets us fail over now rather
  // than making the creator wait through the full watchdog window.
  if (event.payload?.success === true) return state;
  if (state.pending.operation === 'raid-waiting-for-ad') return continueRaidWithoutEndingAd(context, requestIdValue);
  return failBroadcastEnd(context, settings, state, requestIdValue,
    clean(event.payload?.error, 300) || 'Twitch rejected the ending ad request. The broadcast was left running for safety.');
}

async function requestEndingAdThenRaid(context, settings, state, candidate) {
  const requestIdValue = requestId('ending-ad');
  const pending = { operation: 'raid-waiting-for-ad', requestId: requestIdValue, startedAt: Date.now(), candidate };
  const waiting = { ...state, pending, lastError: '' };
  await context.state.write(waiting);
  const earliestAdAt = Math.max(Date.now(), state.lastAdStartedAt + TWITCH_COMMERCIAL_COOLDOWN_MS);
  const cooldownMs = Math.max(0, earliestAdAt - Date.now());
  const dispatchEndingAd = async () => {
    broadcastEndTask = undefined;
    const current = sanitizeState(await context.state.read());
    if (current.pending?.operation !== 'raid-waiting-for-ad' || current.pending.requestId !== requestIdValue) return;
    endingAdRequestedAt = Date.now();
    await publishStatusCard(context, settingsFor(context), 'STARTING END AD', `Asking Twitch to start a ${String(settingsFor(context).endBroadcastAdDurationSeconds)} second ending ad. The raid starts only after Twitch confirms it.`, 10_000);
    void context.streamerbot.runApprovedAction(RUN_ENDING_AD_ACTION_ID, {
      raidScoutOperation: 'run-ending-ad', raidScoutRequestId: requestIdValue,
      raidScoutAdDurationSeconds: settingsFor(context).endBroadcastAdDurationSeconds,
      raidScoutTargetLogin: candidate.login, raidScoutTargetUserId: candidate.userId,
    }).catch(() => undefined);
    broadcastEndTask = context.schedule.after(settingsFor(context).endBroadcastAdWaitSeconds * 1_000, () => queueScheduledWork(() => continueRaidWithoutEndingAd(context, requestIdValue)));
  };
  if (cooldownMs > 0) {
    await publishStatusCard(context, settings, 'TWITCH AD COOLDOWN', `Twitch permits the next ending ad in ${String(Math.max(1, Math.ceil(cooldownMs / 60_000)))} minute(s). Raid Scout will wait, request the ad, then start the raid after confirmation.`, Math.min(cooldownMs, 60_000));
    broadcastEndTask = context.schedule.after(cooldownMs, () => queueScheduledWork(dispatchEndingAd));
  } else {
    await dispatchEndingAd();
  }
  return waiting;
}

function reusableEndingAdEndsAt(state, now = Date.now()) {
  const activeEndsAt = Math.max(activeAdEndsAt, integer(state.lastAdEndsAt, 0, Number.MAX_SAFE_INTEGER, 0));
  if (activeEndsAt > now) return activeEndsAt;
  const boundEndsAt = integer(state.raidFlowAdEndsAt, 0, Number.MAX_SAFE_INTEGER, 0);
  const reuseMs = state.raidFlowStartedAt > 0 ? PREFLIGHT_ENDING_AD_REUSE_MS : RECENT_ENDING_AD_REUSE_MS;
  return boundEndsAt > 0 && now <= boundEndsAt + reuseMs ? boundEndsAt : 0;
}

async function requestRaid(context, state, candidate) {
  if (state.pending || !context.approvedActionIds.includes(CONTROLLER_ACTION_ID)) return state;
  const settings = settingsFor(context);
  const canRequestEndingAd = settings.endBroadcastAfterRaid && settings.endBroadcastTiming === 'after-ad'
    && settings.endBroadcastAcknowledged && settings.endBroadcastActionId
    && !RAID_SCOUT_CONTROL_ACTION_IDS.has(settings.endBroadcastActionId)
    && context.approvedActionIds.includes(settings.endBroadcastActionId)
    && context.approvedActionIds.includes(RUN_ENDING_AD_ACTION_ID);
  const reusableAdEndsAt = reusableEndingAdEndsAt(state);
  if (state.raidFlowAdRequestedAt > 0) endingAdRequestedAt = Math.max(endingAdRequestedAt, state.raidFlowAdRequestedAt);
  if (state.raidFlowAdRequestFailed) endingAdAttemptFailed = true;
  if (reusableAdEndsAt > 0) {
    // A genuine ad may have ended while the selected clip was still playing. Preserve that proof
    // for the post-raid stop timer instead of incorrectly requesting another commercial.
    activeAdEndsAt = Math.max(activeAdEndsAt, reusableAdEndsAt);
    endingAdAttemptFailed = false;
  } else if (canRequestEndingAd && endingAdRequestedAt === 0 && !endingAdAttemptFailed) {
    return requestEndingAdThenRaid(context, settings, state, candidate);
  }
  return dispatchRaid(context, state, candidate);
}

async function finishClipPreview(context, settings, state, playbackId) {
  if (state.pending?.operation !== 'clip-playback' || state.pending.playbackId !== playbackId) return state;
  cancelClipFallback(context);
  const candidate = state.pending.candidate;
  const next = withoutPending(state); await context.state.write(next);
  // The selected creator's preview owns the exclusive media slot only while that preview is
  // visible. Release it before starting the raid/ad wait so Random Clip Player can immediately
  // resume the creator's own clips for the remainder of the ending commercial.
  await releaseRaidMediaSlot(context);
  return requestRaid(context, next, candidate);
}

async function failBroadcastEnd(context, settings, state, requestIdValue, message) {
  if (!state.pending?.operation.startsWith('end-broadcast-') || state.pending.requestId !== requestIdValue) return state;
  cancelBroadcastEndTasks(context);
  const failed = { ...withoutPending(state), lastError: clean(message, 300) };
  await context.state.write(failed);
  await releaseRaidMediaSlot(context);
  await publishStatusCard(context, settings, 'END STREAM MANUALLY', message, 8_000);
  return failed;
}

async function dispatchBroadcastEnd(context, requestIdValue) {
  if (stopped) return;
  broadcastEndTask = undefined;
  let state = sanitizeState(await context.state.read());
  if (state.pending?.operation !== 'end-broadcast-countdown' || state.pending.requestId !== requestIdValue) return;
  const settings = settingsFor(context);
  const actionId = state.pending.actionId;
  if (!settings.endBroadcastAfterRaid || !settings.endBroadcastAcknowledged || settings.endBroadcastActionId !== actionId
    || settings.endBroadcastProvider !== state.pending.provider
    || RAID_SCOUT_CONTROL_ACTION_IDS.has(actionId) || !context.approvedActionIds.includes(actionId)) {
    await failBroadcastEnd(context, settings, state, requestIdValue, 'Automatic broadcast ending was canceled because its saved action or safety acknowledgement changed.');
    return;
  }
  const awaiting = {
    ...state,
    pending: { ...state.pending, operation: 'end-broadcast-awaiting-stop', startedAt: Date.now(), executeAt: Date.now() + BROADCAST_STOP_CONFIRMATION_MS },
  };
  await context.state.write(awaiting);
  const providerName = broadcastProviderName(state.pending.provider);
  await publishStatusCard(context, settings, 'ENDING BROADCAST', `The approved ${providerName} Stop Streaming action was sent. Waiting for ${providerName} to confirm it stopped.`, 8_000);
  try {
    await context.streamerbot.runApprovedAction(actionId, {
      raidScoutOperation: 'end-broadcast', raidScoutRequestId: requestIdValue,
      raidScoutBroadcastProvider: state.pending.provider,
      raidScoutTargetLogin: state.pending.candidate.login, raidScoutTargetUserId: state.pending.candidate.userId,
    });
  } catch {
    state = sanitizeState(await context.state.read());
    await failBroadcastEnd(context, settingsFor(context), state, requestIdValue, `Streamer.bot could not run the approved ${providerName} Stop Streaming action.`);
    return;
  }
  state = sanitizeState(await context.state.read());
  if (state.pending?.operation !== 'end-broadcast-awaiting-stop' || state.pending.requestId !== requestIdValue) return;
  broadcastStopConfirmationTask = context.schedule.after(BROADCAST_STOP_CONFIRMATION_MS, () => queueScheduledWork(async () => {
    broadcastStopConfirmationTask = undefined;
    const current = sanitizeState(await context.state.read());
    await failBroadcastEnd(context, settingsFor(context), current, requestIdValue, `${providerName} did not confirm Streaming Stopped. Raid Scout will not retry; stop the stream manually.`);
  }));
}

async function armBroadcastEndAt(context, settings, state, candidate, requestIdValue, executeAt) {
  cancelBroadcastEndTasks(context);
  const delayMs = Math.max(0, executeAt - Date.now());
  const pending = {
    operation: 'end-broadcast-countdown', requestId: requestIdValue, startedAt: Date.now(), candidate,
    provider: settings.endBroadcastProvider, actionId: settings.endBroadcastActionId, executeAt,
  };
  const armed = { ...state, pending, lastError: '' };
  await context.state.write(armed);
  const remainingSeconds = Math.max(1, Math.ceil(delayMs / 1_000));
  await publishStatusCard(context, settings, delayMs > 0 ? 'AD BREAK RUNNING' : 'AD COMPLETE', delayMs > 0
    ? `Broadcast ending after the Twitch ad finishes (${String(remainingSeconds)} seconds remaining). Use Raid Scout Cancel to keep streaming.`
    : 'The ending ad already finished during the clip preview. Sending the approved Stop Streaming action now.', Math.max(5_000, delayMs));
  broadcastEndTask = context.schedule.after(delayMs, () => queueScheduledWork(() => dispatchBroadcastEnd(context, requestIdValue)));
  return armed;
}

async function handleAdStarted(event, context, settings, state) {
  if (event.metadata?.simulated === true) return state;
  const adLengthSeconds = integer(event.payload?.adLength, 1, 18_000, 0);
  if (adLengthSeconds === 0) return state;
  const now = Date.now();
  activeAdEndsAt = now + adLengthSeconds * 1_000;
  endingAdRequestedAt = 0;
  endingAdAttemptFailed = false;
  const raidFlowActive = state.raidFlowStartedAt > 0
    || ['discover', 'clip', 'clip-download', 'clip-playback', 'raid-waiting-for-ad', 'raid'].includes(state.pending?.operation);
  state = {
    ...state, lastAdStartedAt: now, lastAdEndsAt: activeAdEndsAt,
    ...(raidFlowActive ? { raidFlowAdEndsAt: activeAdEndsAt, raidFlowAdRequestFailed: false } : {}),
  };
  await context.state.write(state);
  if (state.pending?.operation === 'raid-waiting-for-ad') {
    cancelBroadcastEndTasks(context);
    const candidate = state.pending.candidate;
    const next = withoutPending(state);
    await context.state.write(next);
    await publishStatusCard(context, settings, 'END AD CONFIRMED', `Twitch confirmed the ${String(adLengthSeconds)} second ending ad. Starting the raid now; the broadcast will end after the ad.`, 8_000);
    return dispatchRaid(context, next, candidate);
  }
  if (!settings.endBroadcastAfterRaid || settings.endBroadcastTiming !== 'after-ad'
    || !['end-broadcast-waiting-for-ad', 'end-broadcast-countdown'].includes(state.pending?.operation)) return state;
  const executeAt = activeAdEndsAt + settings.endBroadcastAdEndBufferSeconds * 1_000;
  return armBroadcastEndAt(context, settings, state, state.pending.candidate, state.pending.requestId, executeAt);
}

async function beginBroadcastEnd(context, settings, state, candidate) {
  if (!settings.endBroadcastAfterRaid) return state;
  if (!settings.endBroadcastAcknowledged || !settings.endBroadcastActionId || RAID_SCOUT_CONTROL_ACTION_IDS.has(settings.endBroadcastActionId)
    || !context.approvedActionIds.includes(settings.endBroadcastActionId)
    || (settings.endBroadcastTiming === 'after-ad' && !context.approvedActionIds.includes(RUN_ENDING_AD_ACTION_ID))) {
    const invalid = { ...state, lastError: 'Automatic broadcast ending is enabled but its acknowledgement, ending-ad action, selected Stop Streaming action, or action grant is missing.' };
    await context.state.write(invalid);
    await publishStatusCard(context, settings, 'AUTO END NOT ARMED', 'Approve the included Run Ending Ad action and one provider-native Stop Streaming action, then accept the safety acknowledgement.', 8_000);
    return invalid;
  }
  cancelBroadcastEndTasks(context);
  if (settings.endBroadcastTiming === 'after-ad') {
    const reusableAdEndsAt = reusableEndingAdEndsAt(state);
    if (reusableAdEndsAt > 0) {
      endingAdAttemptFailed = false;
      return armBroadcastEndAt(context, settings, state, candidate, requestId('end-broadcast'), Math.max(Date.now(), reusableAdEndsAt + settings.endBroadcastAdEndBufferSeconds * 1_000));
    }
    if (endingAdAttemptFailed) {
      endingAdAttemptFailed = false;
      const failed = { ...state, lastError: 'Twitch did not confirm the ending ad, so Raid Scout left the broadcast live after the raid attempt.' };
      await context.state.write(failed);
      await releaseRaidMediaSlot(context);
      await publishStatusCard(context, settings, 'END STREAM MANUALLY', 'The raid attempt finished, but Twitch did not confirm an ending ad. The broadcast was left live for safety.', 10_000);
      return failed;
    }
    const requestIdValue = requestId('end-broadcast');
    const waitMs = settings.endBroadcastAdWaitSeconds * 1_000;
    const pending = {
      operation: 'end-broadcast-waiting-for-ad', requestId: requestIdValue, startedAt: Date.now(), candidate,
      provider: settings.endBroadcastProvider, actionId: settings.endBroadcastActionId, executeAt: Date.now() + waitMs,
    };
    const waiting = { ...state, pending, lastError: '' };
    await context.state.write(waiting);
    const priorRequestAt = Math.max(endingAdRequestedAt, state.raidFlowAdRequestedAt || 0);
    const adWasRequestedBeforeRaid = priorRequestAt > 0 && Date.now() - priorRequestAt <= Math.max(waitMs, PREFLIGHT_ENDING_AD_REUSE_MS);
    await publishStatusCard(context, settings, adWasRequestedBeforeRaid ? 'WAITING FOR END AD' : 'STARTING END AD', adWasRequestedBeforeRaid
      ? `Raid attempt finished. Waiting for Twitch to confirm the ending ad Raid Scout requested earlier; the broadcast stays live if Twitch does not confirm it.`
      : `Raid attempt finished. Asking Twitch to start a ${String(settings.endBroadcastAdDurationSeconds)} second ending ad, then waiting for Twitch's real Ad Run timer.`, Math.min(waitMs, 15_000));
    broadcastEndTask = context.schedule.after(waitMs, () => queueScheduledWork(async () => {
      broadcastEndTask = undefined;
      const current = sanitizeState(await context.state.read());
      await failBroadcastEnd(context, settingsFor(context), current, requestIdValue, 'No real Twitch Ad Run signal arrived. The broadcast was left running for safety.');
    }));
    if (!adWasRequestedBeforeRaid) {
      endingAdRequestedAt = Date.now();
      void context.streamerbot.runApprovedAction(RUN_ENDING_AD_ACTION_ID, {
        raidScoutOperation: 'run-ending-ad', raidScoutRequestId: requestIdValue,
        raidScoutAdDurationSeconds: settings.endBroadcastAdDurationSeconds,
        raidScoutTargetLogin: candidate.login, raidScoutTargetUserId: candidate.userId,
      }).catch(() => { /* The bounded genuine-Ad watchdog leaves the broadcast live safely. */ });
    }
    return waiting;
  }
  const delayMs = settings.endBroadcastDelaySeconds * 1_000;
  const pending = {
    operation: 'end-broadcast-countdown', requestId: requestId('end-broadcast'), startedAt: Date.now(), candidate,
    provider: settings.endBroadcastProvider, actionId: settings.endBroadcastActionId, executeAt: Date.now() + delayMs,
  };
  const armed = { ...state, pending, lastError: '' };
  await context.state.write(armed);
  await publishStatusCard(context, settings, 'RAID FLOW COMPLETE', `Broadcast ending in ${String(settings.endBroadcastDelaySeconds)} seconds. Use Raid Scout Cancel to keep streaming.`, delayMs);
  broadcastEndTask = context.schedule.after(delayMs, () => queueScheduledWork(() => dispatchBroadcastEnd(context, pending.requestId)));
  return armed;
}

async function handleClipResult(event, context, settings, state) {
  if (state.pending?.operation !== 'clip' || clean(event.payload?.requestId, 100) !== state.pending.requestId) return state;
  cancelControllerWatchdog(context);
  const candidate = state.pending.candidate; const base = withoutPending(state);
  const clips = Array.isArray(event.payload?.clips) ? event.payload.clips.map(clipRecord).filter(Boolean) : [];
  if (event.payload?.success !== true || clips.length === 0) {
    await publishStatusCard(context, settings, 'NO CLIP AVAILABLE', `Moving directly to ${candidate.displayName}'s raid.`, 1_800);
    await context.state.write(base); await releaseRaidMediaSlot(context); return requestRaid(context, base, candidate);
  }
  return requestNextRaidClip(context, settings, base, candidate, shuffle(clips));
}

async function requestNextRaidClip(context, settings, state, candidate, clips) {
  const [clip, ...remainingClips] = clips;
  if (!clip) {
    await publishStatusCard(context, settings, 'NO PLAYABLE CLIP', `Twitch returned no playable clip for ${candidate.displayName}. Moving directly to the raid.`, 1_800);
    const next = withoutPending(state); await context.state.write(next); await releaseRaidMediaSlot(context);
    return requestRaid(context, next, candidate);
  }
  const pending = { operation: 'clip-download', requestId: requestId('clip-download'), startedAt: Date.now(), candidate, clip, remainingClips };
  const reserved = { ...withoutPending(state), pending, lastError: '' }; await context.state.write(reserved);
  try {
    await runController(context, {
      raidScoutOperation: 'clip-download', raidScoutRequestId: pending.requestId, raidScoutClipId: clip.id,
      raidScoutClipThumbnailUrl: clip.thumbnailUrl,
    });
    armControllerWatchdog(context, settings, pending);
    return reserved;
  } catch {
    return requestNextRaidClip(context, settings, withoutPending(reserved), candidate, remainingClips);
  }
}

async function handleClipDownloadResult(event, context, settings, state) {
  if (state.pending?.operation !== 'clip-download' || clean(event.payload?.requestId, 100) !== state.pending.requestId) return state;
  cancelControllerWatchdog(context);
  const candidate = state.pending.candidate; const clip = state.pending.clip; const base = withoutPending(state);
  const remainingClips = state.pending.remainingClips;
  // Streamer.bot 1.0.7 can return no URL for a valid public clip. Twitch's Helix thumbnail
  // contract still carries the same bounded media asset key, so use that public MP4 as a
  // playback fallback before discarding every clip and skipping the preview.
  const sourceUrl = safeHttps(event.payload?.landscapeUrl) || safeHttps(event.payload?.portraitUrl) || clipMp4FromThumbnail(clip.thumbnailUrl);
  const embedUrl = safeHttps(clip.embedUrl);
  if (!sourceUrl && !embedUrl) {
    return requestNextRaidClip(context, settings, base, candidate, remainingClips);
  }
  let playbackUrl;
  // Prefer Twitch's bounded clip embed whenever Helix supplied one. It begins immediately in the
  // warm Raid Scout browser source and avoids blocking this event on a full-file CDN cache fetch.
  // Direct/cache playback remains a compatibility fallback for clip providers without an embed.
  if (!embedUrl && sourceUrl) {
    try {
      const cached = await context.mediaCache.fetch({ sourceUrl, cacheKey: `raid-scout:${clip.id}`, ttlSeconds: 3_600, maximumBytes: 52_428_800 });
      playbackUrl = cached.url;
    } catch {
      // Streamer.bot resolved this URL immediately before the request. If the private full-file
      // cache cannot prepare it, let the dedicated warm Raid Scout browser source stream that fresh
      // URL directly. Its start and playback watchdogs still guarantee the raid continues on error.
      playbackUrl = sourceUrl;
    }
  }
  const playbackId = requestId('raid-clip');
  const durationMs = Math.round(clip.durationSeconds * 1_000);
  const pending = { operation: 'clip-playback', requestId: state.pending.requestId, startedAt: Date.now(), candidate, playbackId, durationMs };
  const reserved = { ...base, pending, lastError: '' }; await context.state.write(reserved);
  // The card and clip use separate overlay lanes (and can be separate OBS browser sources).
  // Explicitly dismiss the foreground card so the suggestion cannot sit above the video.
  try { await context.overlay.publish('thsv.raid-scout.card.hide', {}, { lane: 'foreground' }); } catch { /* Optional presentation. */ }
  try {
    await context.overlay.publish('thsv.raid-scout.media.play', {
      playbackId, ...(embedUrl ? { embedUrl } : { url: playbackUrl }), durationMs,
      muted: settings.clipPreviewMuted, volume: settings.clipPreviewVolume,
      ...(clip.title ? { title: clip.title } : {}), ...(clip.thumbnailUrl ? { posterUrl: clip.thumbnailUrl } : {}),
    }, { lane: 'media' });
  } catch {
    const next = withoutPending(reserved); await context.state.write(next); await releaseRaidMediaSlot(context); return requestRaid(context, next, candidate);
  }
  cancelClipFallback(context);
  // This timer covers a browser source that never starts. The actual playback budget is armed
  // only after the owning overlay reports `started`, so buffering cannot consume the clip.
  clipFallbackTask = context.schedule.after(CLIP_START_TIMEOUT_MS, () => queueScheduledWork(async () => {
    clipFallbackTask = undefined;
    const current = sanitizeState(await context.state.read());
    await finishClipPreview(context, settingsFor(context), current, playbackId);
  }));
  return reserved;
}

async function handleOverlayLifecycle(event, context) {
  if (!['started', 'ended', 'failed', 'timeout', 'stopped'].includes(event.phase)) return;
  eventQueue = eventQueue.then(async () => {
    const state = sanitizeState(await context.state.read());
    if (event.phase === 'started' && state.pending?.operation === 'clip-playback' && state.pending.playbackId === clean(event.playbackId, 100)) {
      cancelClipFallback(context);
      clipFallbackTask = context.schedule.after(state.pending.durationMs + CLIP_FAILURE_GRACE_MS, () => queueScheduledWork(async () => {
        clipFallbackTask = undefined;
        const current = sanitizeState(await context.state.read());
        await finishClipPreview(context, settingsFor(context), current, state.pending.playbackId);
      }));
      return;
    }
    await finishClipPreview(context, settingsFor(context), state, clean(event.playbackId, 100));
  }, async () => {
    const state = sanitizeState(await context.state.read());
    if (event.phase === 'started' && state.pending?.operation === 'clip-playback' && state.pending.playbackId === clean(event.playbackId, 100)) {
      cancelClipFallback(context);
      clipFallbackTask = context.schedule.after(state.pending.durationMs + CLIP_FAILURE_GRACE_MS, () => queueScheduledWork(async () => {
        clipFallbackTask = undefined;
        const current = sanitizeState(await context.state.read());
        await finishClipPreview(context, settingsFor(context), current, state.pending.playbackId);
      }));
      return;
    }
    await finishClipPreview(context, settingsFor(context), state, clean(event.playbackId, 100));
  });
  await eventQueue;
}

async function handleControl(event, context, settings, state) {
  if (event.metadata?.simulated === true) return state;
  const action = clean(event.payload?.action, 30);
  if (action === 'broadcast-stopped') {
    if (state.pending?.operation !== 'end-broadcast-awaiting-stop') return state;
    cancelBroadcastEndTasks(context);
    const completed = { ...withoutRaidFlow(withoutPending(state)), lastError: '' };
    await context.state.write(completed);
    await releaseRaidMediaSlot(context);
    await publishStatusCard(context, settings, 'BROADCAST ENDED', 'The broadcast app confirmed Streaming Stopped. Automatic retry is disabled.', 5_000);
    return completed;
  }
  if (action === 'suggest') {
    if (state.pending) return requestDiscovery(context, settings, state);
    const prepared = await startOrAdoptEndingAd(context, settings, state);
    return requestDiscovery(context, settings, prepared);
  }
  if (action === 'finish') {
    if (state.pending) {
      await publishStatusCard(context, settings, 'RAID SCOUT BUSY', 'Finish Stream is already working through a step. Use Cancel if you need to stop it.', 5_000);
      return state;
    }
    if (state.suggestion && Date.parse(state.suggestion.expiresAt) > Date.now()) {
      return beginConfirmedDestination(context, settings, state, state.suggestion.candidate);
    }
    const fresh = state.suggestion ? { ...withoutSuggestion(state), lastError: '' } : state;
    if (fresh !== state) await context.state.write(fresh);
    await publishStatusCard(context, settings, 'FINISH STREAM', 'Finding one safe destination, then continuing through the configured clip, ad, raid, and broadcast-ending steps.', 5_000);
    const prepared = await startOrAdoptEndingAd(context, settings, fresh);
    return requestDiscovery(context, settings, prepared, true);
  }
  if (action === 'cancel') {
    if (state.pending?.operation === 'end-broadcast-awaiting-stop') {
      await publishStatusCard(context, settings, 'STOP ALREADY SENT', 'The Stop Streaming action has already run. Check the broadcast app before continuing.', 6_000);
      return state;
    }
    if (state.pending?.operation === 'raid-waiting-for-ad' || state.pending?.operation === 'end-broadcast-countdown' || state.pending?.operation === 'end-broadcast-waiting-for-ad') {
      cancelBroadcastEndTasks(context);
      endingAdRequestedAt = 0;
      endingAdAttemptFailed = false;
      const canceled = { ...withoutRaidFlow(withoutPending(state)), lastError: '' };
      await context.state.write(canceled);
      await releaseRaidMediaSlot(context);
      await publishStatusCard(context, settings, 'AUTO END CANCELED', state.pending.operation === 'raid-waiting-for-ad'
        ? 'The ending ad wait and pending raid were canceled. Nothing else will run.'
        : 'The raid remains accepted, but Raid Scout will keep the broadcast running.', 5_000);
      return canceled;
    }
    cancelProgress(context); cancelClipFallback(context); cancelControllerWatchdog(context);
    if (state.pending?.operation === 'clip-playback') {
      try { await context.overlay.publish('thsv.raid-scout.media.stop', { fade: true }); } catch { /* Optional overlay. */ }
    }
    await releaseRaidMediaSlot(context);
    if (!state.suggestion && !state.pending && state.raidFlowStartedAt === 0) return state;
    const canceled = { ...withoutRaidFlow(withoutSuggestion(withoutPending(state))), lastError: '' }; await context.state.write(canceled); return canceled;
  }
  if (action !== 'confirm' || settings.confirmationMode === 'suggest-only') return state;
  if (state.pending) {
    await publishStatusCard(context, settings, 'RAID SCOUT BUSY', 'The current step must finish before this destination can be confirmed.', 5_000);
    return state;
  }
  if (!state.suggestion) {
    await publishStatusCard(context, settings, 'NO SUGGESTION READY', 'Use Suggest to review a destination, or Finish Stream to run the complete ending flow.', 6_000);
    return state;
  }
  if (Date.parse(state.suggestion.expiresAt) <= Date.now()) {
    const expired = { ...withoutSuggestion(state), lastError: 'The raid suggestion expired. Request another suggestion.' };
    await context.state.write(expired);
    await publishStatusCard(context, settings, 'SUGGESTION EXPIRED', 'Use Suggest for another destination, or Finish Stream to continue automatically.', 6_000);
    return expired;
  }
  return beginConfirmedDestination(context, settings, state, state.suggestion.candidate);
}
async function handleDiscoveryResult(event, context, settings, state) {
  if (state.pending?.operation !== 'discover' || clean(event.payload?.requestId, 100) !== state.pending.requestId) return state;
  cancelControllerWatchdog(context);
  const autoConfirm = state.pending.autoConfirm === true;
  const base = withoutPending(state);
  if (event.payload?.success !== true) {
    const failed = { ...base, lastError: clean(event.payload?.error, 300) || 'Twitch discovery failed.' };
    await context.state.write(failed);
    if (settings.showSearchProgress) await publishStatusCard(context, settings, 'SEARCH UNAVAILABLE', 'Twitch discovery could not finish. Try Suggest again.', 4_000);
    if (settings.announceNoCandidate) await sendChat(context, settings.noCandidateMessage); return failed;
  }
  const candidates = Array.isArray(event.payload?.candidates) ? event.payload.candidates : [];
  const broadcaster = { userId: clean(event.payload?.broadcasterUserId, 64), login: normalizedLogin(event.payload?.broadcasterLogin) };
  let eligible = filterCandidates(candidates, base, settings, broadcaster);
  const currentAudience = integer(event.payload?.currentAudience, 0, 10_000_000, settings.currentAudienceEstimate);
  let viewerFallbackUsed = false;
  if (eligible.length === 0 && settings.allowViewerRangeFallback) {
    const fallbackCeiling = Math.max(settings.maximumViewers + 25, settings.maximumViewers * 2);
    const overMaximum = filterCandidates(candidates, base, settings, broadcaster, { ignoreMaximumViewers: true })
      .filter((candidate) => candidate.viewerCount > settings.maximumViewers && candidate.viewerCount <= fallbackCeiling);
    if (overMaximum.length > 0) {
      const closestViewerCount = Math.min(...overMaximum.map((candidate) => candidate.viewerCount));
      const closestWindow = Math.max(5, Math.ceil(settings.maximumViewers * 0.25));
      eligible = overMaximum.filter((candidate) => candidate.viewerCount <= closestViewerCount + closestWindow);
      viewerFallbackUsed = true;
    }
  }
  const selected = selectCandidate(eligible, base, settings, currentAudience);
  const sourceResults = sourceResultRecords(event.payload?.sourceResults, ['preferred', 'followed', 'category']);
  cancelProgress(context);
  if (!selected.candidate) {
    const empty = { ...withoutSuggestion(base), bags: selected.bags, lastError: 'No eligible live channel matched the current filters.' };
    await context.state.write(empty);
    if (settings.showSearchProgress) {
      const delay = queueDiscoveryPhases(context, settings, sourceResults);
      queueProgressCard(context, delay, settings, 'NO SAFE MATCH', 'No live destination passed the current safety filters. Nothing was raided.', 5_000);
    }
    if (settings.announceNoCandidate) await sendChat(context, settings.noCandidateMessage); return empty;
  }
  const now = Date.now();
  const suggestion = { candidate: selected.candidate, suggestedAt: new Date(now).toISOString(), expiresAt: new Date(now + settings.suggestionExpiryMinutes * 60_000).toISOString() };
  const suggested = {
    ...base, bags: selected.bags, suggestion, lastError: '',
    history: [...base.history, { candidate: selected.candidate, at: suggestion.suggestedAt, status: 'suggested', streamCycle: base.streamCycle, error: '' }].slice(-MAXIMUM_HISTORY),
  };
  await context.state.write(suggested);
  if (viewerFallbackUsed) {
    await publishStatusCard(
      context,
      settings,
      'CLOSEST SAFE MATCH',
      `No live channel was at or below ${settings.maximumViewers} viewers. Using the closest safe match at ${selected.candidate.viewerCount}.`,
      4_000,
    );
  }
  if (autoConfirm) {
    await publishCard(context, settings, selected.candidate, false);
    return beginConfirmedDestination(context, settings, suggested, selected.candidate);
  }
  if (!settings.showSearchProgress) {
    await publishCard(context, settings, selected.candidate, false);
    return settings.confirmationMode === 'automatic' || autoConfirm ? beginConfirmedDestination(context, settings, suggested, selected.candidate) : suggested;
  }
  const delay = queueDiscoveryPhases(context, settings, sourceResults);
  const taskId = context.schedule.after(Math.max(1_000, delay), () => queueScheduledWork(async () => {
    progressTasks = progressTasks.filter((candidate) => candidate !== taskId);
    if (stopped) return;
    await publishCard(context, settingsFor(context), selected.candidate, false);
    if (settings.confirmationMode === 'automatic' || autoConfirm) {
      const current = sanitizeState(await context.state.read());
      if (current.suggestion?.candidate?.userId === selected.candidate.userId && !current.pending) {
        await beginConfirmedDestination(context, settingsFor(context), current, selected.candidate);
      }
    }
  }));
  progressTasks.push(taskId);
  return suggested;
}
async function handleRaidResult(event, context, settings, state) {
  if (state.pending?.operation !== 'raid' || clean(event.payload?.requestId, 100) !== state.pending.requestId) return state;
  cancelControllerWatchdog(context);
  const candidate = state.pending.candidate; let next = withoutPending(state);
  if (event.payload?.success !== true) {
    const error = clean(event.payload?.error, 300) || 'Twitch did not accept the raid.';
    next = {
      ...next, lastError: error,
      history: [...next.history, { candidate, at: new Date().toISOString(), status: 'failed', streamCycle: state.streamCycle, error }].slice(-MAXIMUM_HISTORY),
    };
    await context.state.write(next); await releaseRaidMediaSlot(context);
    await publishStatusCard(context, settings, 'RAID FAILED', 'Twitch did not accept the raid. The approved broadcast-ending flow will still continue after the ending ad.', 8_000);
    return beginBroadcastEnd(context, settings, withoutSuggestion(next), candidate);
  }
  next = {
    ...withoutSuggestion(next), lastError: '',
    history: [...next.history, { candidate, at: new Date().toISOString(), status: 'confirmed', streamCycle: state.streamCycle, error: '' }].slice(-MAXIMUM_HISTORY),
  };
  await context.state.write(next);
  if (settings.announceConfirmedRaid) await sendChat(context, formatTemplate(settings.confirmedRaidMessage, candidate));
  await publishCard(context, settings, candidate, true);
  return beginBroadcastEnd(context, settings, next, candidate);
}

async function handleSceneChanged(event, context, settings, state) {
  if (event.metadata?.simulated === true || !settings.autoStartSceneEnabled || !state.twitchLive) return state;
  const provider = clean(event.payload?.provider, 30).toLowerCase();
  const sceneName = clean(event.payload?.sceneName, 200);
  if ((provider && provider !== settings.autoStartProvider) || !sceneName || sceneName.toLowerCase() !== settings.autoStartSceneName.toLowerCase()) return state;
  if (state.autoSceneStartedCycle === state.streamCycle || state.pending) return state;

  // Claim this stream cycle before dispatch so duplicate broadcast-app scene-active signals cannot
  // start overlapping searches.
  const claimed = { ...state, autoSceneStartedCycle: state.streamCycle, lastError: '' };
  await context.state.write(claimed);
  const prepared = await startOrAdoptEndingAd(context, settings, claimed);
  return requestDiscovery(context, settings, prepared);
}

async function processEvent(event, context) {
  const settings = settingsFor(context); if (!settings.enabled) return;
  let state = sanitizeState(await context.state.read());
  if (event.eventType === 'stream.online' && event.platform === 'twitch' && event.metadata?.simulated !== true) {
    await clearViewerSuggestions(context, state, true); return;
  }
  if (event.eventType === 'stream.offline' && event.platform === 'twitch' && event.metadata?.simulated !== true) {
    await clearViewerSuggestions(context, state, false); return;
  }
  if (event.eventType === 'reward.redemption') { await handleViewerSuggestionRedemption(event, context, settings, state); return; }
  if (event.eventType === 'command.received') { await handleViewerSuggestionCommand(event, context, settings, state); return; }
  if (event.eventType === 'stream.scene-changed') { await handleSceneChanged(event, context, settings, state); return; }
  if (event.eventType === CONTROL_EVENT) { await handleControl(event, context, settings, state); return; }
  if (event.eventType === AD_STARTED_EVENT) { await handleAdStarted(event, context, settings, state); return; }
  if (event.eventType !== CONTROLLER_RESULT_EVENT || event.metadata?.simulated === true) return;
  const operation = clean(event.payload?.operation, 20);
  if (operation === 'redemption-fulfill' || operation === 'redemption-cancel') await handleViewerRedemptionResult(event, context, settings, state);
  else if (operation === 'discover') await handleDiscoveryResult(event, context, settings, state);
  else if (operation === 'clip') await handleClipResult(event, context, settings, state);
  else if (operation === 'clip-download') await handleClipDownloadResult(event, context, settings, state);
  else if (operation === 'raid') await handleRaidResult(event, context, settings, state);
  else if (operation === 'ending-ad-request') await handleEndingAdRequestResult(event, context, settings, state);
}

const moduleDefinition = {
  manifest,
  required: false,
  async start(context) {
    stopped = false; mediaLeaseId = undefined; activeAdEndsAt = 0; endingAdRequestedAt = 0; endingAdAttemptFailed = false; cancelControllerWatchdog(context); cancelBroadcastEndTasks(context);
    lifecycleUnsubscribe = context.overlay.onLifecycle((event) => { void handleOverlayLifecycle(event, context); });
    let state = sanitizeState(await context.state.read());
    if (state.pending?.operation === 'discover') {
      state = { ...withoutPending(state), lastError: 'An interrupted destination search was cleared. Suggest or Finish Stream can retry safely.' };
    } else if (state.pending?.operation === 'clip' || state.pending?.operation === 'clip-download' || state.pending?.operation === 'clip-playback') {
      state = { ...withoutPending(state), lastError: 'The clip preview was interrupted. Confirm the suggestion again when ready.' };
    } else if (state.pending?.operation === 'raid-waiting-for-ad' || state.pending?.operation.startsWith('end-broadcast-')) {
      state = { ...withoutPending(state), lastError: 'An interrupted automatic broadcast-ending request was cleared and will not resume.' };
    }
    await context.state.write(state);
    if (state.pending?.operation === 'raid') armControllerWatchdog(context, settingsFor(context), state.pending);
  },
  async stop(context) {
    stopped = true; endingAdRequestedAt = 0; endingAdAttemptFailed = false; cancelProgress(context); cancelClipFallback(context); cancelControllerWatchdog(context); cancelBroadcastEndTasks(context); lifecycleUnsubscribe?.(); lifecycleUnsubscribe = undefined;
    try { await context?.overlay?.publish?.('thsv.raid-scout.media.stop', { fade: true }); } catch { /* Optional overlay. */ }
    await releaseRaidMediaSlot(context);
    await eventQueue.catch(() => undefined);
  },
  async onEvent(event, context) {
    if (stopped) stopped = false;
    eventQueue = eventQueue.then(() => processEvent(event, context), () => processEvent(event, context));
    await eventQueue;
  },
};

export { CONTROLLER_ACTION_ID };
export default moduleDefinition;
