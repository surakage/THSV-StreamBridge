// Raid Scout discovers bounded live Twitch candidates through one approved Streamer.bot
// controller. StreamBridge owns filters, shuffle rotation, confirmation, and private history.
const CONTROLLER_ACTION_ID = '6a78d950-17b5-4a98-9de7-1a5b4275f31c';
const CONTROLLER_RESULT_EVENT = 'addon.thsv.raid-scout.controller-result';
const CONTROL_EVENT = 'addon.thsv.raid-scout.control';
const MAXIMUM_CANDIDATES = 40;
const MAXIMUM_HISTORY = 100;
const MAXIMUM_BAG = 40;
const MAXIMUM_PENDING_MS = 60_000;
let eventQueue = Promise.resolve();
let stopped = true;

const manifest = {
  contractVersion: '2.0.0-preview.1',
  moduleId: 'thsv.raid-scout',
  name: 'Raid Scout',
  version: '2.4.0',
  minimumCoreVersion: '2.0.0-preview.1',
  maximumTestedCoreVersion: '2.0.0-preview.1',
  dependencies: [],
  requiredCapabilities: [],
  configurationSchema: 'schemas/config.json',
  eventSubscriptions: [CONTROLLER_RESULT_EVENT, CONTROL_EVENT, 'stream.online'],
  commandsProvided: [],
  actionsProvided: [],
  browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.raid-scout/', 'data/addons/.state/thsv.raid-scout/'],
  installationSteps: [
    'Import the separate Raid Scout Streamer.bot package.',
    'Keep its Controller action triggerless and approve only that stable action ID for this add-on.',
    'Attach Suggest, Confirm, and Cancel only to creator-controlled hotkeys, deck buttons, or operator commands.',
    'Configure preferred channels and filters, then test Suggest before enabling automatic mode.',
  ],
  uninstallationSteps: ['Uninstall the add-on. Its bounded private suggestion and raid history remains preserved for a later reinstall.'],
  migrations: [],
  healthChecks: [{ id: 'thsv.raid-scout.runtime', description: 'Confirms bounded discovery, filtering, non-repeating selection, and creator-confirmed Twitch raids.' }],
};

const FALLBACKS = Object.freeze({
  enabled: true, preferredChannels: '', usePreferred: true, useFollowed: true, useCategory: true,
  sourceOrder: 'preferred-followed-category', maximumPreferredLookups: 20, maximumFollowedResults: 25,
  maximumFollowedPages: 2, maximumCategoryResults: 25, minimumViewers: 1, maximumViewers: 100_000,
  currentAudienceEstimate: 0, preferSimilarSize: true, minimumAudienceRatio: 0.25, maximumAudienceRatio: 2,
  preferredLanguage: '', requireMatchingLanguage: false, excludedChannels: '', excludedCategories: '',
  excludedTags: '', recentRaidStreams: 7, confirmationMode: 'required', suggestionExpiryMinutes: 15,
  announceConfirmedRaid: true,
  confirmedRaidMessage: 'Next stop: {displayName} playing {category}! https://twitch.tv/{login}',
  announceNoCandidate: false,
  noCandidateMessage: 'Raid Scout could not find a safe live destination with the current filters.',
  showSuggestionCard: true, showConfirmedCard: true, cardSeconds: 20, overlayBackgroundMode: 'glass',
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
    showSuggestionCard: boolean(raw.showSuggestionCard, true), showConfirmedCard: boolean(raw.showConfirmedCard, true),
    cardSeconds: integer(raw.cardSeconds, 5, 3_600, FALLBACKS.cardSeconds),
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
  const operation = ['discover', 'raid'].includes(value.operation) ? value.operation : '';
  const requestId = clean(value.requestId, 100); const startedAt = integer(value.startedAt, 0, Number.MAX_SAFE_INTEGER, 0);
  const candidate = candidateRecord(value.candidate);
  if (!operation || !requestId || !startedAt || (operation === 'raid' && !candidate)) return undefined;
  return { operation, requestId, startedAt, ...(candidate ? { candidate } : {}) };
}

export function sanitizeState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const suggestion = suggestionRecord(source.suggestion); const pending = pendingRecord(source.pending); const bags = {};
  for (const tier of ['preferred', 'followed', 'category']) {
    bags[tier] = Array.isArray(source.bags?.[tier])
      ? [...new Set(source.bags[tier].map((item) => clean(item, 64)).filter(Boolean))].slice(0, MAXIMUM_BAG) : [];
  }
  return {
    version: 1, streamCycle: integer(source.streamCycle, 0, Number.MAX_SAFE_INTEGER, 0), bags,
    history: Array.isArray(source.history) ? source.history.map(historyRecord).filter(Boolean).slice(-MAXIMUM_HISTORY) : [],
    lastError: clean(source.lastError, 300), ...(suggestion ? { suggestion } : {}),
    ...(pending && Date.now() - pending.startedAt <= MAXIMUM_PENDING_MS ? { pending } : {}),
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
function requestId(prefix) {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}
async function runController(context, argumentsValue) {
  if (!context.approvedActionIds.includes(CONTROLLER_ACTION_ID)) throw new Error('Raid Scout Controller is not approved.');
  await context.streamerbot.runApprovedAction(CONTROLLER_ACTION_ID, argumentsValue);
}
async function sendChat(context, message) {
  if (!message) return;
  try { await context.chat.send({ message, routing: 'source', sourcePlatform: 'twitch', overflow: 'reject' }); } catch { /* Cosmetic only. */ }
}
function overlayStyle(settings) {
  return {
    backgroundMode: settings.overlayBackgroundMode, backgroundColor: settings.overlayBackgroundColor,
    backgroundOpacity: settings.overlayBackgroundOpacity, accentColor: settings.overlayAccentColor,
    textColor: settings.overlayTextColor, fontFamily: settings.overlayFontFamily,
  };
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
  const pending = { operation: 'discover', requestId: requestId('discover'), startedAt: Date.now() };
  const reserved = { ...state, pending, lastError: '' }; await context.state.write(reserved);
  try {
    await runController(context, {
      raidScoutOperation: 'discover', raidScoutRequestId: pending.requestId,
      raidScoutPreferredChannels: settings.preferredChannels.slice(0, settings.maximumPreferredLookups).join(','),
      raidScoutUsePreferred: settings.usePreferred, raidScoutUseFollowed: settings.useFollowed,
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
    await context.state.write(failed); return failed;
  }
}

async function handleControl(event, context, settings, state) {
  if (event.metadata?.simulated === true) return state;
  const action = clean(event.payload?.action, 30);
  if (action === 'suggest') return requestDiscovery(context, settings, state);
  if (action === 'cancel') {
    if (!state.suggestion) return state;
    const canceled = { ...withoutSuggestion(state), lastError: '' }; await context.state.write(canceled); return canceled;
  }
  if (action !== 'confirm' || !state.suggestion || settings.confirmationMode === 'suggest-only') return state;
  if (Date.parse(state.suggestion.expiresAt) <= Date.now()) {
    const expired = { ...withoutSuggestion(state), lastError: 'The raid suggestion expired. Request another suggestion.' };
    await context.state.write(expired); return expired;
  }
  return requestRaid(context, state, state.suggestion.candidate);
}
async function handleDiscoveryResult(event, context, settings, state) {
  if (state.pending?.operation !== 'discover' || clean(event.payload?.requestId, 100) !== state.pending.requestId) return state;
  const base = withoutPending(state);
  if (event.payload?.success !== true) {
    const failed = { ...base, lastError: clean(event.payload?.error, 300) || 'Twitch discovery failed.' };
    await context.state.write(failed); if (settings.announceNoCandidate) await sendChat(context, settings.noCandidateMessage); return failed;
  }
  const candidates = Array.isArray(event.payload?.candidates) ? event.payload.candidates : [];
  const broadcaster = { userId: clean(event.payload?.broadcasterUserId, 64), login: normalizedLogin(event.payload?.broadcasterLogin) };
  const eligible = filterCandidates(candidates, base, settings, broadcaster);
  const currentAudience = integer(event.payload?.currentAudience, 0, 10_000_000, settings.currentAudienceEstimate);
  const selected = selectCandidate(eligible, base, settings, currentAudience);
  if (!selected.candidate) {
    const empty = { ...withoutSuggestion(base), bags: selected.bags, lastError: 'No eligible live channel matched the current filters.' };
    await context.state.write(empty); if (settings.announceNoCandidate) await sendChat(context, settings.noCandidateMessage); return empty;
  }
  const now = Date.now();
  const suggestion = { candidate: selected.candidate, suggestedAt: new Date(now).toISOString(), expiresAt: new Date(now + settings.suggestionExpiryMinutes * 60_000).toISOString() };
  const suggested = {
    ...base, bags: selected.bags, suggestion, lastError: '',
    history: [...base.history, { candidate: selected.candidate, at: suggestion.suggestedAt, status: 'suggested', streamCycle: base.streamCycle, error: '' }].slice(-MAXIMUM_HISTORY),
  };
  await context.state.write(suggested); await publishCard(context, settings, selected.candidate, false);
  return settings.confirmationMode === 'automatic' ? requestRaid(context, suggested, selected.candidate) : suggested;
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
    await context.state.write(next); return next;
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
    state = { ...state, streamCycle: state.streamCycle + 1 }; await context.state.write(state); return;
  }
  if (event.eventType === CONTROL_EVENT) { await handleControl(event, context, settings, state); return; }
  if (event.eventType !== CONTROLLER_RESULT_EVENT || event.metadata?.simulated === true) return;
  const operation = clean(event.payload?.operation, 20);
  if (operation === 'discover') await handleDiscoveryResult(event, context, settings, state);
  else if (operation === 'raid') await handleRaidResult(event, context, settings, state);
}

const moduleDefinition = {
  manifest,
  async start(context) { stopped = false; await context.state.write(sanitizeState(await context.state.read())); },
  async stop() { stopped = true; await eventQueue.catch(() => undefined); },
  async onEvent(event, context) {
    if (stopped) stopped = false;
    eventQueue = eventQueue.then(() => processEvent(event, context), () => processEvent(event, context));
    await eventQueue;
  },
};

export { CONTROLLER_ACTION_ID };
export default moduleDefinition;
