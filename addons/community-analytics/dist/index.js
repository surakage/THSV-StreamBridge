// Community Analytics records bounded session attendance and interaction counters.
// Viewer Foundation remains the only identity authority; this module stores no names or chat text.
const COUNTERS = Object.freeze({
  'chat.message': 'messages', 'command.received': 'commands', 'channel.follow': 'follows',
  'channel.subscription': 'subscriptions', 'channel.membership': 'memberships',
  'channel.gift-subscription': 'giftSubscriptions', 'engagement.gift': 'gifts',
  'engagement.cheer': 'cheers', 'engagement.super-chat': 'superChats',
  'channel.raid': 'raids', 'reward.redemption': 'rewardRedemptions',
});
const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: 'thsv.community-analytics', name: 'Community Analytics', version: '4.0.9',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.9', maximumTestedBridgeVersion: '4.0.9',
  dependencies: ['thsv.viewer-foundation'], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: ['stream.online', 'stream.offline', ...Object.keys(COUNTERS)], commandsProvided: [], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.community-analytics/', 'data/addons/.state/thsv.community-analytics/'],
  installationSteps: ['Community Analytics is installed and updated with StreamBridge after Viewer Foundation.', 'No Community Analytics Streamer.bot package or direct trigger is required. Keep chat and lifecycle triggers attached only to the main THSV platform intake actions.', 'Choose the platforms to count, keep simulated events excluded for normal use, and add any stable account or Viewer Foundation exclusions.', 'Leave monthly participation scoring off unless Viewer Spotlight or another approved consumer needs it; money and provider support never contribute.', 'Save, restart StreamBridge, then use Reports, session summary, and privacy tools in the wizard to confirm data is being observed.'],
  uninstallationSteps: ['Community Analytics is a built-in Bridge integration and cannot be uninstalled separately. Its bounded private counters remain preserved across updates.'], migrations: [],
  healthChecks: [{ id: 'thsv.community-analytics.runtime', description: 'Confirms Viewer Foundation identity resolution and bounded private session counters.' }],
};
const FALLBACKS = Object.freeze({ enabled: true, includeSimulated: false, enabledPlatforms: ['twitch', 'youtube', 'kick', 'tiktok'], ignoredAccounts: ['twitch|name:nightbot', 'twitch|name:streamelements', 'youtube|name:streamelements', 'kick|name:streamelements', 'twitch|name:fossabot', 'twitch|name:moobot', 'twitch|name:sery_bot', 'twitch|name:soundalerts', 'twitch|name:wizebot', 'twitch|name:kofistreambot', 'twitch|name:streamlabs', 'twitch|name:botrix', 'youtube|name:botrix', 'kick|name:botrix', 'tiktok|name:botrix'], ignoredViewerIds: [], maximumViewers: 500, retainedSessions: 30, processedEventLimit: 500,
  engagementScoreEnabled: false, scoreMessagePoints: 1, scoreMessageCap: 200, scoreCommandPoints: 2, scoreCommandCap: 50, scoreSessionPoints: 10, scoreSessionCap: 20, minimumRankCohort: 5 });
const VIEWER_ID = /^[a-z][a-z0-9-]{0,63}$/u;
const PLATFORM = /^(twitch|youtube|kick|tiktok)$/u;
const MAXIMUM_STATE_BYTES = 60_000;
let operation = Promise.resolve();
let unregisterProvider; let unregisterDeletion;

function clean(value, maximum = 256) { return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, '').trim() : '')].slice(0, maximum).join(''); }
function integer(value, minimum, maximum, fallback) { return Number.isSafeInteger(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback; }
async function digest(value) { const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(hash)].map((item) => item.toString(16).padStart(2, '0')).join(''); }
function settingsFor(context) {
  const raw = { ...FALLBACKS, ...(context.settings || {}) };
  return { ...raw, enabledPlatforms: new Set(Array.isArray(raw.enabledPlatforms) ? raw.enabledPlatforms.filter((item) => PLATFORM.test(item)) : FALLBACKS.enabledPlatforms),
    ignoredAccounts: new Set(Array.isArray(raw.ignoredAccounts) ? raw.ignoredAccounts.map((item) => clean(item, 330).toLowerCase()).filter(Boolean).slice(0, 500) : []),
    ignoredViewerIds: new Set(Array.isArray(raw.ignoredViewerIds) ? raw.ignoredViewerIds.map((item) => clean(item, 64)).filter((item) => VIEWER_ID.test(item)).slice(0, 500) : []),
    maximumViewers: integer(raw.maximumViewers, 25, 2000, 500), retainedSessions: integer(raw.retainedSessions, 1, 100, 30), processedEventLimit: integer(raw.processedEventLimit, 50, 2000, 500),
    scoreMessagePoints: integer(raw.scoreMessagePoints, 0, 100, 1), scoreMessageCap: integer(raw.scoreMessageCap, 1, 10000, 200), scoreCommandPoints: integer(raw.scoreCommandPoints, 0, 100, 2), scoreCommandCap: integer(raw.scoreCommandCap, 1, 5000, 50), scoreSessionPoints: integer(raw.scoreSessionPoints, 0, 1000, 10), scoreSessionCap: integer(raw.scoreSessionCap, 1, 1000, 20), minimumRankCohort: integer(raw.minimumRankCohort, 2, 100, 5) };
}
function seasonId(now = Date.now()) { return new Date(now).toISOString().slice(0, 7); }
function emptySeason(id = seasonId()) { return { id, viewers: {} }; }
function sanitizeSeason(value, maximumViewers) { const id = typeof value?.id === 'string' && /^\d{4}-\d{2}$/u.test(value.id) ? value.id : seasonId(); const viewers = {};
  if (value?.viewers && typeof value.viewers === 'object') for (const [viewerId, record] of Object.entries(value.viewers).filter(([key]) => VIEWER_ID.test(key)).slice(0, maximumViewers)) if (record && typeof record === 'object') viewers[viewerId] = { sessions: integer(record.sessions, 0, 1000, 0), messages: integer(record.messages, 0, 10000, 0), commands: integer(record.commands, 0, 5000, 0) };
  return { id, viewers }; }
function ensureSeason(state, now) { const id = seasonId(now); if (state.season.id !== id) state.season = emptySeason(id); return state.season; }
function engagementScore(record, settings) { return Math.min(record.messages, settings.scoreMessageCap) * settings.scoreMessagePoints + Math.min(record.commands, settings.scoreCommandCap) * settings.scoreCommandPoints + Math.min(record.sessions, settings.scoreSessionCap) * settings.scoreSessionPoints; }
function emptyCounters() { return Object.fromEntries([...new Set(Object.values(COUNTERS))].map((key) => [key, 0])); }
function sanitizeCounters(value) { const result = emptyCounters(); if (value && typeof value === 'object') for (const key of Object.keys(result)) result[key] = integer(value[key], 0, Number.MAX_SAFE_INTEGER, 0); return result; }
function sanitizeState(value, settings = FALLBACKS) {
  const source = value && typeof value === 'object' ? value : {}; const viewers = {};
  const entries = source.viewers && typeof source.viewers === 'object' ? Object.entries(source.viewers) : [];
  for (const [viewerId, viewer] of entries.filter(([id]) => VIEWER_ID.test(id)).sort((a, b) => Number(b[1]?.lastSeenAt || 0) - Number(a[1]?.lastSeenAt || 0)).slice(0, settings.maximumViewers)) {
    if (!viewer || typeof viewer !== 'object') continue;
    viewers[viewerId] = { firstSeenAt: integer(viewer.firstSeenAt, 0, Number.MAX_SAFE_INTEGER, 0), lastSeenAt: integer(viewer.lastSeenAt, 0, Number.MAX_SAFE_INTEGER, 0), sessions: integer(viewer.sessions, 0, Number.MAX_SAFE_INTEGER, 0), counters: sanitizeCounters(viewer.counters) };
  }
  const sessions = Array.isArray(source.sessions) ? source.sessions.filter((item) => item && typeof item === 'object' && typeof item.id === 'string' && Number.isSafeInteger(item.startedAt)).map((item) => ({ id: clean(item.id, 32), startedAt: item.startedAt, endedAt: integer(item.endedAt, 0, Number.MAX_SAFE_INTEGER, 0), approximate: item.approximate === true, uniqueViewers: integer(item.uniqueViewers, 0, Number.MAX_SAFE_INTEGER, 0), counters: sanitizeCounters(item.counters) })).slice(-settings.retainedSessions) : [];
  let current;
  if (source.current && typeof source.current === 'object' && typeof source.current.id === 'string') {
    const attendees = {}; if (source.current.attendees && typeof source.current.attendees === 'object') for (const [id, at] of Object.entries(source.current.attendees)) if (VIEWER_ID.test(id) && Number.isSafeInteger(at)) attendees[id] = at;
    current = { id: clean(source.current.id, 32), startedAt: integer(source.current.startedAt, 0, Number.MAX_SAFE_INTEGER, Date.now()), approximate: source.current.approximate === true,
      livePlatforms: Array.isArray(source.current.livePlatforms) ? [...new Set(source.current.livePlatforms.filter((item) => PLATFORM.test(item)))].slice(0, 4) : [], attendees, counters: sanitizeCounters(source.current.counters) };
  }
  const processed = Array.isArray(source.processed) ? source.processed.filter((item) => item && typeof item === 'object' && /^[a-f0-9]{32}$/u.test(item.id) && Number.isSafeInteger(item.at)).slice(-settings.processedEventLimit) : [];
  const season = sanitizeSeason(source.season, settings.maximumViewers); const state = { version: 1, viewers, sessions, ...(current ? { current } : {}), processed, season };
  while (new TextEncoder().encode(`${JSON.stringify(state, null, 2)}\n`).byteLength > MAXIMUM_STATE_BYTES) {
    if (state.processed.length > 50) { state.processed.shift(); continue; }
    if (state.sessions.length > 1) { state.sessions.shift(); continue; }
    const ids = Object.keys(state.viewers); if (ids.length > 25) { const removed = ids.at(-1); delete state.viewers[removed]; delete state.season.viewers[removed]; continue; }
    throw new Error('Community Analytics state cannot fit within its private-state safety limit.');
  }
  return state;
}
function beginSession(state, platform, now, approximate) { if (!state.current) state.current = { id: `session-${now.toString(36)}`, startedAt: now, approximate, livePlatforms: [], attendees: {}, counters: emptyCounters() }; if (!state.current.livePlatforms.includes(platform)) state.current.livePlatforms.push(platform); }
function closeSession(state, now) { if (!state.current) return; state.sessions.push({ id: state.current.id, startedAt: state.current.startedAt, endedAt: now, approximate: state.current.approximate, uniqueViewers: Object.keys(state.current.attendees).length, counters: state.current.counters }); delete state.current; }
function ignored(event, settings) { const platform = clean(event.platform, 64); const id = clean(event.user?.id, 256); const name = clean(event.user?.name, 256); const displayName = clean(event.user?.displayName, 256); return !settings.enabledPlatforms.has(platform) || !id || [`${platform}|${id}`, `${platform}|id:${id}`, `${platform}|name:${name}`, `${platform}|name:${displayName}`].some((rule) => settings.ignoredAccounts.has(rule.toLowerCase())); }

export async function processAnalyticsEvent(event, context, now = Date.now()) {
  const settings = settingsFor(context); if (!settings.enabled || (event.metadata?.simulated === true && !settings.includeSimulated)) return undefined;
  const state = sanitizeState(await context.state.read(), settings); ensureSeason(state, now);
  if (event.eventType === 'stream.online') { if (settings.enabledPlatforms.has(event.platform)) beginSession(state, event.platform, now, false); await context.state.write(sanitizeState(state, settings)); return { session: 'started' }; }
  if (event.eventType === 'stream.offline') { if (!state.current) return undefined; state.current.livePlatforms = state.current.livePlatforms.filter((item) => item !== event.platform); if (state.current.livePlatforms.length === 0) closeSession(state, now); await context.state.write(sanitizeState(state, settings)); return { session: state.current ? 'active' : 'closed' }; }
  const counter = COUNTERS[event.eventType]; if (!counter || event.user?.actorType !== 'human' || ignored(event, settings)) return undefined;
  const stable = clean(event.source?.eventId || event.eventId, 256); if (!stable) return undefined;
  const eventHash = (await digest(`${event.platform}\u0000${event.eventType}\u0000${stable}`)).slice(0, 32); if (state.processed.some((item) => item.id === eventHash)) return { duplicate: true };
  const projection = await context.viewerFoundation.getProjection({ platform: event.platform, userId: event.user.id }); if (!projection || settings.ignoredViewerIds.has(projection.viewerId)) return undefined;
  if (!state.current) beginSession(state, event.platform, now, true);
  const viewer = state.viewers[projection.viewerId] || { firstSeenAt: now, lastSeenAt: 0, sessions: 0, counters: emptyCounters() };
  const firstSessionObservation = !Object.hasOwn(state.current.attendees, projection.viewerId);
  if (firstSessionObservation) { state.current.attendees[projection.viewerId] = now; viewer.sessions += 1; }
  else state.current.attendees[projection.viewerId] = now;
  const seasonViewer = state.season.viewers[projection.viewerId] || { sessions: 0, messages: 0, commands: 0 }; if (firstSessionObservation) seasonViewer.sessions += 1;
  if (counter === 'messages') seasonViewer.messages += 1; if (counter === 'commands') seasonViewer.commands += 1; state.season.viewers[projection.viewerId] = seasonViewer;
  viewer.lastSeenAt = now; viewer.counters[counter] += 1; state.current.counters[counter] += 1; state.viewers[projection.viewerId] = viewer; state.processed.push({ id: eventHash, at: now });
  await context.state.write(sanitizeState(state, settings)); return { duplicate: false, viewerId: projection.viewerId, counter, total: viewer.counters[counter] };
}
export async function administerCommunityAnalytics(request, context) {
  const settings = settingsFor(context); const state = sanitizeState(await context.state.read(), settings);
  if (request.operation === 'status') return { operation: 'status', trackedViewerCount: Object.keys(state.viewers).length, retainedSessionCount: state.sessions.length,
    activeSession: state.current !== undefined, engagementScoreEnabled: settings.engagementScoreEnabled === true, scoreSeason: state.season.id, rankCohortSize: Object.keys(state.season.viewers).length, current: state.current ? { startedAt: state.current.startedAt, approximate: state.current.approximate, livePlatforms: state.current.livePlatforms, uniqueViewers: Object.keys(state.current.attendees).length, counters: state.current.counters } : null,
    recentSessions: state.sessions.slice(-10).map((session) => ({ startedAt: session.startedAt, endedAt: session.endedAt, approximate: session.approximate, uniqueViewers: session.uniqueViewers, counters: session.counters })) };
  if (request.operation === 'report') return buildAnalyticsReport(request.reportKind, state);
  const viewerId = clean(request.viewerId, 64); if (!VIEWER_ID.test(viewerId)) throw new Error('A valid lowercase Viewer Foundation ID is required.');
  if (request.operation === 'export') { const record = state.viewers[viewerId]; return { operation: 'export', viewerId, found: record !== undefined, record: record || null,
    scoreSeason: state.season.id, scoreInputs: state.season.viewers[viewerId] || null, activeSession: { present: Object.hasOwn(state.current?.attendees || {}, viewerId), lastSeenAt: state.current?.attendees?.[viewerId] || null } }; }
  if (request.operation !== 'delete' || request.approvedByCreator !== true) throw new Error('Creator approval is required to delete analytics data.');
  const removed = Object.hasOwn(state.viewers, viewerId); const activeAttendanceRemoved = Object.hasOwn(state.current?.attendees || {}, viewerId);
  delete state.viewers[viewerId]; delete state.season.viewers[viewerId]; if (state.current) delete state.current.attendees[viewerId];
  await context.state.write(sanitizeState(state, settings));
  return { operation: 'delete', viewerId, removed, activeAttendanceRemoved, completedSessionAggregatesRetained: true };
}
function reportStamp(now = new Date()) { return now.toISOString().replace(/[:.]/gu, '-'); }
function csvCell(value) { const text = String(value ?? ''); return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text; }
export function buildAnalyticsReport(reportKind, state, now = new Date()) {
  const generatedAt = now.toISOString();
  if (reportKind === 'session-json') {
    const report = { contractVersion: '1.0.0', generatedAt, notice: 'Local StreamBridge observations only; not official platform analytics, revenue, payout, or tax data.',
      activeSession: state.current ? { startedAt: state.current.startedAt, approximate: state.current.approximate, livePlatforms: state.current.livePlatforms, uniqueViewers: Object.keys(state.current.attendees).length, counters: state.current.counters } : null,
      completedSessions: state.sessions.map((session) => ({ startedAt: session.startedAt, endedAt: session.endedAt, approximate: session.approximate, uniqueViewers: session.uniqueViewers, counters: session.counters })) };
    const content = `${JSON.stringify(report, null, 2)}\n`; if (new TextEncoder().encode(content).byteLength > MAXIMUM_STATE_BYTES) throw new Error('The session report exceeds the safe download size; reduce retained sessions and try again.');
    return { operation: 'report', reportKind, filename: `thsv-community-sessions-${reportStamp(now)}.json`, mimeType: 'application/json', content };
  }
  if (reportKind !== 'viewers-csv') throw new Error('Unsupported Community Analytics report kind.');
  const counterKeys = Object.keys(emptyCounters()); const header = ['viewerId', 'firstSeenAt', 'lastSeenAt', 'sessions', 'activeSession', 'activeLastSeenAt', ...counterKeys];
  const rows = Object.entries(state.viewers).sort(([left], [right]) => left.localeCompare(right)).map(([viewerId, viewer]) => {
    const activeLastSeenAt = state.current?.attendees?.[viewerId]; return [viewerId, viewer.firstSeenAt, viewer.lastSeenAt, viewer.sessions, activeLastSeenAt !== undefined, activeLastSeenAt ?? '', ...counterKeys.map((key) => viewer.counters[key])].map(csvCell).join(',');
  });
  const content = `${[header.join(','), ...rows].join('\r\n')}\r\n`; if (new TextEncoder().encode(content).byteLength > MAXIMUM_STATE_BYTES) throw new Error('The viewer report exceeds the safe download size; reduce maximum tracked viewers and try again.');
  return { operation: 'report', reportKind, filename: `thsv-community-viewers-${reportStamp(now)}.csv`, mimeType: 'text/csv', content };
}
export async function communityAnalyticsViewerProjection(viewerId, context) {
  const settings = settingsFor(context); const state = sanitizeState(await context.state.read(), settings); const id = clean(viewerId, 64);
  if (!VIEWER_ID.test(id)) throw new Error('A valid lowercase Viewer Foundation ID is required.');
  const record = state.viewers[id]; const activeLastSeenAt = state.current?.attendees?.[id];
  const scoreRecord = state.season.viewers[id]; const ranked = Object.entries(state.season.viewers).map(([candidateId, candidate]) => ({ viewerId: candidateId, score: engagementScore(candidate, settings) })).sort((left, right) => right.score - left.score || left.viewerId.localeCompare(right.viewerId));
  const cohortSize = ranked.length; const rank = ranked.findIndex((candidate) => candidate.viewerId === id) + 1;
  return { contractVersion: '1.0.0', viewerId: id, observed: record !== undefined,
    ...(record ? { firstSeenAt: record.firstSeenAt, lastSeenAt: record.lastSeenAt, sessions: record.sessions, counters: record.counters } : { sessions: 0, counters: emptyCounters() }),
    activeSession: activeLastSeenAt !== undefined, ...(activeLastSeenAt === undefined ? {} : { activeLastSeenAt }),
    ...(settings.engagementScoreEnabled && scoreRecord ? { scoreSeason: state.season.id, engagementScore: engagementScore(scoreRecord, settings), rankCohortSize: cohortSize, ...(cohortSize >= settings.minimumRankCohort && rank > 0 ? { seasonRank: rank } : {}) } : {}) };
}
export async function communityAnalyticsSessionProjection(context) {
  const settings = settingsFor(context); const state = sanitizeState(await context.state.read(), settings); const current = state.current;
  return { contractVersion: '1.0.0', active: current !== undefined, ...(current ? { startedAt: current.startedAt } : {}), approximate: current?.approximate === true,
    livePlatforms: current?.livePlatforms || [], uniqueViewers: current ? Object.keys(current.attendees).length : 0, counters: current?.counters || emptyCounters(), retainedSessionCount: state.sessions.length };
}
export async function purgeCommunityAnalyticsViewer(viewerId, context) {
  const settings = settingsFor(context); const id = clean(viewerId, 64); if (!VIEWER_ID.test(id)) return false;
  const state = sanitizeState(await context.state.read(), settings); const removed = Object.hasOwn(state.viewers, id) || Object.hasOwn(state.current?.attendees || {}, id);
  delete state.viewers[id]; delete state.season.viewers[id]; if (state.current) delete state.current.attendees[id];
  await context.state.write(sanitizeState(state, settings)); return removed;
}
function serialize(task) { operation = operation.then(task, task); return operation; }
export function resetCommunityAnalyticsRuntime() { operation = Promise.resolve(); unregisterProvider = undefined; unregisterDeletion = undefined; }
export { sanitizeState as sanitizeCommunityAnalyticsState };
export default { manifest, required: false, async start(context) { operation = Promise.resolve(); const settings = settingsFor(context); if (settings.enabled) await context.state.write(sanitizeState(await context.state.read(), settings)); unregisterProvider = context.communityAnalytics.provide({ getViewerProjection: (viewerId) => serialize(() => communityAnalyticsViewerProjection(viewerId, context)), getSessionProjection: () => serialize(() => communityAnalyticsSessionProjection(context)) }); unregisterDeletion = context.viewerFoundation.onDeleted?.((viewerId) => serialize(() => purgeCommunityAnalyticsViewer(viewerId, context))); }, async stop() { unregisterDeletion?.(); unregisterDeletion = undefined; unregisterProvider?.(); unregisterProvider = undefined; await operation; operation = Promise.resolve(); }, async onEvent(event, context) { await serialize(() => processAnalyticsEvent(event, context)); }, async administerCommunityAnalytics(request, context) { return serialize(() => administerCommunityAnalytics(request, context)); } };
