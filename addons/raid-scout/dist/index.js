// Raid Scout discovers bounded live Twitch candidates through one approved Streamer.bot
// controller. StreamBridge owns filters, shuffle rotation, confirmation, and private history.
const CONTROLLER_ACTION_ID = '6a78d950-17b5-4a98-9de7-1a5b4275f31c';
const CONTROLLER_RESULT_EVENT = 'addon.thsv.raid-scout.controller-result';
const CONTROL_EVENT = 'addon.thsv.raid-scout.control';
const MAXIMUM_CANDIDATES = 40;
const MAXIMUM_HISTORY = 100;
const MAXIMUM_BAG = 40;
const MAXIMUM_VIEWER_SUGGESTIONS = 25;
const MAXIMUM_PENDING_MS = 60_000;
const MAXIMUM_CLIP_PENDING_MS = 120_000;
const PROGRESS_STEP_MS = 1_350;
const CLIP_FAILURE_GRACE_MS = 12_000;
const CLIP_START_TIMEOUT_MS = 30_000;
const RAID_MEDIA_LEASE_MS = 600_000;
let eventQueue = Promise.resolve();
let stopped = true;
let lifecycleUnsubscribe;
let clipFallbackTask;
let progressTasks = [];
let mediaLeaseId;

const manifest = {
  contractVersion: '2.0.0-preview.1',
  moduleId: 'thsv.raid-scout',
  name: 'Raid Scout',
  version: '2.6.0',
  minimumCoreVersion: '2.0.0-preview.1',
  maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '2.6.0', maximumTestedBridgeVersion: '2.6.0',
  dependencies: ['thsv.viewer-foundation'],
  requiredCapabilities: [],
  configurationSchema: 'schemas/config.json',
  eventSubscriptions: [CONTROLLER_RESULT_EVENT, CONTROL_EVENT, 'reward.redemption', 'command.received', 'stream.online', 'stream.offline'],
  commandsProvided: [{ id: 'raid-scout.suggest', name: 'raidsuggest' }],
  actionsProvided: [],
  browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.raid-scout/', 'data/addons/.state/thsv.raid-scout/'],
  installationSteps: [
    'Import the separate Raid Scout Streamer.bot package.',
    'Keep its Controller action triggerless and approve only that stable action ID for this add-on.',
    'Attach Suggest, Confirm, and Cancel only to creator-controlled hotkeys, deck buttons, or operator commands.',
    'Optionally configure Streamer.bot-owned Twitch and Kick reward IDs for stream-scoped viewer suggestions.',
    'For YouTube and TikTok, configure the suggestion command and Viewer Foundation points cost.',
    'Configure preferred channels and filters, then test Suggest before enabling automatic mode.',
  ],
  uninstallationSteps: ['Uninstall the add-on. Its bounded private suggestion and raid history remains preserved for a later reinstall.'],
  migrations: [],
  healthChecks: [{ id: 'thsv.raid-scout.runtime', description: 'Confirms bounded discovery, filtering, non-repeating selection, and creator-confirmed Twitch raids.' }],
};

const FALLBACKS = Object.freeze({
  enabled: true, preferredChannels: '', usePreferred: true, useFollowed: true, useCategory: true,
  viewerSuggestionsEnabled: false, viewerSuggestionRewardId: '', kickViewerSuggestionRewardId: '', viewerSuggestionCommand: 'raidsuggest', viewerSuggestionPointsCost: 50, maximumViewerSuggestions: 20,
  oneViewerSuggestionPerStream: true, announceViewerSuggestions: true,
  viewerSuggestionAcceptedMessage: '{viewer}, added {channel} to tonight\'s raid list.',
  viewerSuggestionRejectedMessage: '{viewer}, that raid suggestion could not be added.',
  sourceOrder: 'preferred-followed-category', maximumPreferredLookups: 20, maximumFollowedResults: 25,
  maximumFollowedPages: 2, maximumCategoryResults: 25, minimumViewers: 1, maximumViewers: 100_000,
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
    maximumFollowedResults: integer(raw.maximumFollowedResults, 1, 40, FALLBACKS.maximumFollowedResults),
    maximumFollowedPages: integer(raw.maximumFollowedPages, 1, 3, FALLBACKS.maximumFollowedPages),
    maximumCategoryResults: integer(raw.maximumCategoryResults, 1, 40, FALLBACKS.maximumCategoryResults),
    minimumViewers: integer(raw.minimumViewers, 0, 10_000_000, FALLBACKS.minimumViewers),
    maximumViewers: integer(raw.maximumViewers, 1, 10_000_000, FALLBACKS.maximumViewers),
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
  const operation = ['discover', 'clip', 'clip-playback', 'raid'].includes(value.operation) ? value.operation : '';
  const requestId = clean(value.requestId, 100); const startedAt = integer(value.startedAt, 0, Number.MAX_SAFE_INTEGER, 0);
  const candidate = candidateRecord(value.candidate);
  const playbackId = clean(value.playbackId, 100);
  const durationMs = integer(value.durationMs, 5_000, 90_000, 0);
  if (!operation || !requestId || !startedAt || (operation !== 'discover' && !candidate)
    || (operation === 'clip-playback' && (!playbackId || durationMs === 0))) return undefined;
  return { operation, requestId, startedAt, ...(candidate ? { candidate } : {}), ...(playbackId ? { playbackId, durationMs } : {}) };
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
    history: Array.isArray(source.history) ? source.history.map(historyRecord).filter(Boolean).slice(-MAXIMUM_HISTORY) : [],
    viewerSuggestions: Array.isArray(source.viewerSuggestions)
      ? source.viewerSuggestions.map(viewerSuggestionRecord).filter(Boolean).slice(-MAXIMUM_VIEWER_SUGGESTIONS) : [],
    pendingViewerSuggestions: Array.isArray(source.pendingViewerSuggestions)
      ? source.pendingViewerSuggestions.map(pendingViewerSuggestionRecord).filter(Boolean).slice(-MAXIMUM_VIEWER_SUGGESTIONS) : [],
    lastError: clean(source.lastError, 300), ...(suggestion ? { suggestion } : {}),
    ...(pending && Date.now() - pending.startedAt <= (pending.operation === 'clip-playback' ? MAXIMUM_CLIP_PENDING_MS : MAXIMUM_PENDING_MS) ? { pending } : {}),
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

export function filterCandidates(candidates, state, settings, broadcaster) {
  const ownId = clean(broadcaster?.userId, 64); const ownLogin = normalizedLogin(broadcaster?.login);
  const priorRaidCutoff = Math.max(0, state.streamCycle - settings.recentRaidStreams + 1);
  const recentlyRaided = new Set(state.history.filter((entry) => entry.status === 'confirmed' && entry.streamCycle >= priorRaidCutoff).map((entry) => entry.candidate.userId));
  const seen = new Set();
  return candidates.map(candidateRecord).filter(Boolean).filter((candidate) => {
    if (seen.has(candidate.userId)) return false; seen.add(candidate.userId);
    if (candidate.userId === ownId || candidate.login === ownLogin || settings.excludedChannels.has(candidate.login)) return false;
    if (recentlyRaided.has(candidate.userId)) return false;
    if (candidate.viewerCount < settings.minimumViewers || candidate.viewerCount > settings.maximumViewers) return false;
    if (settings.requireMatchingLanguage && settings.preferredLanguage && candidate.language !== settings.preferredLanguage) return false;
    const category = candidate.category.toLowerCase();
    if (settings.excludedCategories.some((excluded) => category.includes(excluded))) return false;
    const tags = candidate.tags.map((tag) => tag.toLowerCase());
    return !settings.excludedTags.some((excluded) => tags.some((tag) => tag.includes(excluded)));
  }).slice(0, MAXIMUM_CANDIDATES);
}
function audienceDistance(candidate, currentAudience) {
  return currentAudience <= 0 ? 0 : Math.abs(Math.log((candidate.viewerCount + 1) / (currentAudience + 1)));
}
export function selectCandidate(candidates, state, settings, currentAudience = 0) {
  const currentId = state.suggestion?.candidate?.userId; const nextBags = { ...state.bags };
  for (const source of settings.sourceOrder) {
    const tier = candidates.filter((candidate) => candidate.source === source && candidate.userId !== currentId);
    if (tier.length === 0) continue;
    const similar = settings.preferSimilarSize && currentAudience > 0 ? tier.filter((candidate) => {
      const ratio = candidate.viewerCount / currentAudience;
      return ratio >= settings.minimumAudienceRatio && ratio <= settings.maximumAudienceRatio;
    }) : [];
    const pool = similar.length > 0 ? similar : tier; const eligibleIds = new Set(pool.map((candidate) => candidate.userId));
    let bag = (nextBags[source] || []).filter((id) => eligibleIds.has(id));
    if (bag.length === 0) {
      const ordered = settings.preferSimilarSize && currentAudience > 0
        ? [...pool].sort((left, right) => audienceDistance(left, currentAudience) - audienceDistance(right, currentAudience)) : pool;
      const window = ordered.slice(0, Math.max(5, Math.ceil(ordered.length / 2)));
      bag = [...shuffle(window), ...shuffle(ordered.slice(window.length))].map((candidate) => candidate.userId);
    }
    const selectedId = bag.shift(); nextBags[source] = bag;
    const selected = pool.find((candidate) => candidate.userId === selectedId);
    if (selected) return { candidate: selected, bags: nextBags };
  }
  return { candidate: undefined, bags: nextBags };
}

function withoutPending(state) { const next = { ...state }; delete next.pending; return next; }
function withoutSuggestion(state) { const next = { ...state }; delete next.suggestion; return next; }
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
async function publishStatusCard(context, settings, title, text, durationMs = PROGRESS_STEP_MS) {
  try {
    await context.overlay.publish('thsv.raid-scout.card.show', {
      title: clean(title, 200), text: clean(text, 500), durationMs, style: overlayStyle(settings),
    });
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
  const taskId = context.schedule.after(Math.max(1_000, delayMs), async () => {
    progressTasks = progressTasks.filter((candidate) => candidate !== taskId);
    if (stopped) return;
    await publishStatusCard(context, settings, title, text, durationMs);
  });
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
    });
  } catch { /* Optional presentation. */ }
}

async function requestDiscovery(context, settings, state) {
  if (state.pending || !context.approvedActionIds.includes(CONTROLLER_ACTION_ID)) return state;
  cancelProgress(context);
  if (settings.showSearchProgress) await publishStatusCard(context, settings, 'RAID SCOUT', 'Starting a safe destination search...', 1_500);
  const pending = { operation: 'discover', requestId: requestId('discover'), startedAt: Date.now() };
  const reserved = { ...state, pending, lastError: '' }; await context.state.write(reserved);
  try {
    await runController(context, {
      raidScoutOperation: 'discover', raidScoutRequestId: pending.requestId,
      raidScoutPreferredChannels: preferredChannelsFor(settings, state).join(','),
      raidScoutUsePreferred: settings.usePreferred || settings.viewerSuggestionsEnabled, raidScoutUseFollowed: settings.useFollowed,
      raidScoutUseCategory: settings.useCategory, raidScoutMaximumFollowedResults: settings.maximumFollowedResults,
      raidScoutMaximumFollowedPages: settings.maximumFollowedPages,
      raidScoutMaximumCategoryResults: settings.maximumCategoryResults,
      raidScoutSourceOrder: settings.sourceOrder.join(','),
      raidScoutCurrentAudienceEstimate: settings.currentAudienceEstimate,
    });
    return reserved;
  } catch {
    const rolledBack = { ...withoutPending(reserved), lastError: 'Streamer.bot could not start Twitch discovery.' };
    await context.state.write(rolledBack); return rolledBack;
  }
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
    ...state, streamCycle: beginStream ? state.streamCycle + 1 : state.streamCycle,
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
    return reserved;
  } catch {
    const next = withoutPending(reserved);
    await context.state.write(next);
    await releaseRaidMediaSlot(context);
    return requestRaid(context, next, candidate);
  }
}

async function beginConfirmedDestination(context, settings, state, candidate) {
  return settings.previewClipBeforeRaid ? requestClip(context, settings, state, candidate) : requestRaid(context, state, candidate);
}

async function requestRaid(context, state, candidate) {
  if (state.pending || !context.approvedActionIds.includes(CONTROLLER_ACTION_ID)) return state;
  const pending = { operation: 'raid', requestId: requestId('raid'), startedAt: Date.now(), candidate };
  const reserved = { ...state, pending, lastError: '' }; await context.state.write(reserved);
  try {
    await runController(context, {
      raidScoutOperation: 'raid', raidScoutRequestId: pending.requestId,
      raidScoutTargetLogin: candidate.login, raidScoutTargetUserId: candidate.userId,
    });
    return reserved;
  } catch {
    const failed = {
      ...withoutPending(reserved), lastError: 'Streamer.bot could not start the confirmed raid.',
      history: [...reserved.history, { candidate, at: new Date().toISOString(), status: 'failed', streamCycle: state.streamCycle, error: 'Controller dispatch failed.' }].slice(-MAXIMUM_HISTORY),
    };
    await context.state.write(failed); await releaseRaidMediaSlot(context); return failed;
  }
}

async function finishClipPreview(context, settings, state, playbackId) {
  if (state.pending?.operation !== 'clip-playback' || state.pending.playbackId !== playbackId) return state;
  cancelClipFallback(context);
  const candidate = state.pending.candidate;
  const next = withoutPending(state); await context.state.write(next);
  return requestRaid(context, next, candidate);
}

async function handleClipResult(event, context, settings, state) {
  if (state.pending?.operation !== 'clip' || clean(event.payload?.requestId, 100) !== state.pending.requestId) return state;
  const candidate = state.pending.candidate; const base = withoutPending(state);
  const clips = Array.isArray(event.payload?.clips) ? event.payload.clips.map(clipRecord).filter(Boolean) : [];
  if (event.payload?.success !== true || clips.length === 0) {
    await publishStatusCard(context, settings, 'NO CLIP AVAILABLE', `Moving directly to ${candidate.displayName}'s raid.`, 1_800);
    await context.state.write(base); await releaseRaidMediaSlot(context); return requestRaid(context, base, candidate);
  }
  const clip = clips[Math.floor(Math.random() * clips.length)];
  const playbackId = requestId('raid-clip');
  const durationMs = Math.round(clip.durationSeconds * 1_000);
  const pending = { operation: 'clip-playback', requestId: state.pending.requestId, startedAt: Date.now(), candidate, playbackId, durationMs };
  const reserved = { ...base, pending, lastError: '' }; await context.state.write(reserved);
  try {
    await context.overlay.publish('thsv.raid-scout.media.play', {
      playbackId, embedUrl: clip.embedUrl, durationMs,
      muted: settings.clipPreviewMuted, volume: settings.clipPreviewVolume,
      ...(clip.title ? { title: clip.title } : {}), ...(clip.thumbnailUrl ? { posterUrl: clip.thumbnailUrl } : {}),
    });
  } catch {
    const next = withoutPending(reserved); await context.state.write(next); await releaseRaidMediaSlot(context); return requestRaid(context, next, candidate);
  }
  cancelClipFallback(context);
  // This timer covers a browser source that never starts. The actual playback budget is armed
  // only after the owning overlay reports `started`, so buffering cannot consume the clip.
  clipFallbackTask = context.schedule.after(CLIP_START_TIMEOUT_MS, async () => {
    clipFallbackTask = undefined;
    const current = sanitizeState(await context.state.read());
    await finishClipPreview(context, settingsFor(context), current, playbackId);
  });
  return reserved;
}

async function handleOverlayLifecycle(event, context) {
  if (!['started', 'ended', 'failed', 'timeout', 'stopped'].includes(event.phase)) return;
  eventQueue = eventQueue.then(async () => {
    const state = sanitizeState(await context.state.read());
    if (event.phase === 'started' && state.pending?.operation === 'clip-playback' && state.pending.playbackId === clean(event.playbackId, 100)) {
      cancelClipFallback(context);
      clipFallbackTask = context.schedule.after(state.pending.durationMs + CLIP_FAILURE_GRACE_MS, async () => {
        clipFallbackTask = undefined;
        const current = sanitizeState(await context.state.read());
        await finishClipPreview(context, settingsFor(context), current, state.pending.playbackId);
      });
      return;
    }
    await finishClipPreview(context, settingsFor(context), state, clean(event.playbackId, 100));
  }, async () => {
    const state = sanitizeState(await context.state.read());
    if (event.phase === 'started' && state.pending?.operation === 'clip-playback' && state.pending.playbackId === clean(event.playbackId, 100)) {
      cancelClipFallback(context);
      clipFallbackTask = context.schedule.after(state.pending.durationMs + CLIP_FAILURE_GRACE_MS, async () => {
        clipFallbackTask = undefined;
        const current = sanitizeState(await context.state.read());
        await finishClipPreview(context, settingsFor(context), current, state.pending.playbackId);
      });
      return;
    }
    await finishClipPreview(context, settingsFor(context), state, clean(event.playbackId, 100));
  });
  await eventQueue;
}

async function handleControl(event, context, settings, state) {
  if (event.metadata?.simulated === true) return state;
  const action = clean(event.payload?.action, 30);
  if (action === 'suggest') return requestDiscovery(context, settings, state);
  if (action === 'cancel') {
    cancelProgress(context); cancelClipFallback(context);
    if (state.pending?.operation === 'clip-playback') {
      try { await context.overlay.publish('thsv.raid-scout.media.stop', { fade: true }); } catch { /* Optional overlay. */ }
    }
    await releaseRaidMediaSlot(context);
    if (!state.suggestion && !state.pending) return state;
    const canceled = { ...withoutSuggestion(withoutPending(state)), lastError: '' }; await context.state.write(canceled); return canceled;
  }
  if (action !== 'confirm' || !state.suggestion || settings.confirmationMode === 'suggest-only') return state;
  if (Date.parse(state.suggestion.expiresAt) <= Date.now()) {
    const expired = { ...withoutSuggestion(state), lastError: 'The raid suggestion expired. Request another suggestion.' };
    await context.state.write(expired); return expired;
  }
  return beginConfirmedDestination(context, settings, state, state.suggestion.candidate);
}
async function handleDiscoveryResult(event, context, settings, state) {
  if (state.pending?.operation !== 'discover' || clean(event.payload?.requestId, 100) !== state.pending.requestId) return state;
  const base = withoutPending(state);
  if (event.payload?.success !== true) {
    const failed = { ...base, lastError: clean(event.payload?.error, 300) || 'Twitch discovery failed.' };
    await context.state.write(failed);
    if (settings.showSearchProgress) await publishStatusCard(context, settings, 'SEARCH UNAVAILABLE', 'Twitch discovery could not finish. Try Suggest again.', 4_000);
    if (settings.announceNoCandidate) await sendChat(context, settings.noCandidateMessage); return failed;
  }
  const candidates = Array.isArray(event.payload?.candidates) ? event.payload.candidates : [];
  const broadcaster = { userId: clean(event.payload?.broadcasterUserId, 64), login: normalizedLogin(event.payload?.broadcasterLogin) };
  const eligible = filterCandidates(candidates, base, settings, broadcaster);
  const currentAudience = integer(event.payload?.currentAudience, 0, 10_000_000, settings.currentAudienceEstimate);
  const selected = selectCandidate(eligible, base, settings, currentAudience);
  const sourceResults = sourceResultRecords(event.payload?.sourceResults, settings.sourceOrder);
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
  if (!settings.showSearchProgress) {
    await publishCard(context, settings, selected.candidate, false);
    return settings.confirmationMode === 'automatic' ? beginConfirmedDestination(context, settings, suggested, selected.candidate) : suggested;
  }
  const delay = queueDiscoveryPhases(context, settings, sourceResults);
  const taskId = context.schedule.after(Math.max(1_000, delay), async () => {
    progressTasks = progressTasks.filter((candidate) => candidate !== taskId);
    if (stopped) return;
    await publishCard(context, settingsFor(context), selected.candidate, false);
    if (settings.confirmationMode === 'automatic') {
      const current = sanitizeState(await context.state.read());
      if (current.suggestion?.candidate?.userId === selected.candidate.userId && !current.pending) {
        await beginConfirmedDestination(context, settingsFor(context), current, selected.candidate);
      }
    }
  });
  progressTasks.push(taskId);
  return suggested;
}
async function handleRaidResult(event, context, settings, state) {
  if (state.pending?.operation !== 'raid' || clean(event.payload?.requestId, 100) !== state.pending.requestId) return state;
  const candidate = state.pending.candidate; let next = withoutPending(state);
  if (event.payload?.success !== true) {
    const error = clean(event.payload?.error, 300) || 'Twitch did not accept the raid.';
    next = {
      ...next, lastError: error,
      history: [...next.history, { candidate, at: new Date().toISOString(), status: 'failed', streamCycle: state.streamCycle, error }].slice(-MAXIMUM_HISTORY),
    };
    await context.state.write(next); await releaseRaidMediaSlot(context); return next;
  }
  next = {
    ...withoutSuggestion(next), lastError: '',
    history: [...next.history, { candidate, at: new Date().toISOString(), status: 'confirmed', streamCycle: state.streamCycle, error: '' }].slice(-MAXIMUM_HISTORY),
  };
  await context.state.write(next);
  if (settings.announceConfirmedRaid) await sendChat(context, formatTemplate(settings.confirmedRaidMessage, candidate));
  await publishCard(context, settings, candidate, true); return next;
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
  if (event.eventType === CONTROL_EVENT) { await handleControl(event, context, settings, state); return; }
  if (event.eventType !== CONTROLLER_RESULT_EVENT || event.metadata?.simulated === true) return;
  const operation = clean(event.payload?.operation, 20);
  if (operation === 'redemption-fulfill' || operation === 'redemption-cancel') await handleViewerRedemptionResult(event, context, settings, state);
  else if (operation === 'discover') await handleDiscoveryResult(event, context, settings, state);
  else if (operation === 'clip') await handleClipResult(event, context, settings, state);
  else if (operation === 'raid') await handleRaidResult(event, context, settings, state);
}

const moduleDefinition = {
  manifest,
  required: false,
  async start(context) {
    stopped = false; mediaLeaseId = undefined;
    lifecycleUnsubscribe = context.overlay.onLifecycle((event) => { void handleOverlayLifecycle(event, context); });
    let state = sanitizeState(await context.state.read());
    if (state.pending?.operation === 'clip' || state.pending?.operation === 'clip-playback') {
      state = { ...withoutPending(state), lastError: 'The clip preview was interrupted. Confirm the suggestion again when ready.' };
    }
    await context.state.write(state);
  },
  async stop(context) {
    stopped = true; cancelProgress(context); cancelClipFallback(context); lifecycleUnsubscribe?.(); lifecycleUnsubscribe = undefined;
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
