// Village Jukebox owns a bounded YouTube request queue. Streamer.bot resolves API metadata;
// StreamBridge owns fairness, point spending, playback order, and the shared browser overlay.
const MODULE_ID = 'thsv.village-jukebox';
const RESOLVE_ACTION_ID = '0f16105e-7c92-47ad-a61b-c6d1b934fdf0';
const SETTLE_REWARD_ACTION_ID = 'fa5b3b6d-a639-48a6-9999-7e5b11f31590';
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok', 'facebook']);
const COLORS = /^#[0-9a-f]{6}$/iu;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/u;
const FALLBACKS = Object.freeze({
  enabled: false, rightsAcknowledged: false, requestCommand: 'sr', queueCommand: 'songqueue', whenCommand: 'when', wrongSongCommand: 'wrongsong', voteSkipCommand: 'voteskip', moderatorSkipCommand: 'skip', pauseCommand: 'pausesong', resumeCommand: 'resumesong', blockCommand: 'blocksong', allowTextSearch: true, dailyTextSearchLimit: 50,
  enabledPlatforms: PLATFORMS, pointsPlatforms: ['youtube', 'tiktok'], pointsCost: 100, rewardRequestsEnabled: false, twitchRewardId: '', kickRewardId: '',
  maximumQueueSize: 25, maximumRequestsPerViewer: 1, viewerCooldownSeconds: 60, maximumTrackMinutes: 8, recentNoRepeatCount: 20, voteSkipRequired: 5,
  secondsBetweenTracks: 4, approveRequests: true, announceNowPlaying: true, volume: 0.7, backgroundColor: '#101820', accentColor: '#7ff5cc', textColor: '#ffffff', fontFamily: 'broadcast',
});
const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Village Jukebox', version: '4.1.95',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.1.95', maximumTestedBridgeVersion: '4.1.95',
  dependencies: ['thsv.viewer-foundation'], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: ['command.received', 'reward.redemption', 'addon.thsv.village-jukebox.track-resolved', 'addon.thsv.village-jukebox.control', 'stream.online', 'stream.offline'],
  commandsProvided: [
    { id: 'village-jukebox.request', name: 'sr' }, { id: 'village-jukebox.queue', name: 'songqueue' }, { id: 'village-jukebox.when', name: 'when' },
    { id: 'village-jukebox.wrongsong', name: 'wrongsong' }, { id: 'village-jukebox.voteskip', name: 'voteskip' }, { id: 'village-jukebox.skip', name: 'skip' },
    { id: 'village-jukebox.pause', name: 'pausesong' }, { id: 'village-jukebox.resume', name: 'resumesong' }, { id: 'village-jukebox.block', name: 'blocksong' },
  ],
  actionsProvided: [
    { id: 'village-jukebox.resolve', name: 'THSV Addon - Village Jukebox - Resolve YouTube Track' },
    { id: 'village-jukebox.settle-reward', name: 'THSV Addon - Village Jukebox - Settle Twitch Reward' },
  ],
  browserSourcesProvided: [], dataStorageOwned: ['data/addons/thsv.village-jukebox/', 'data/addons/.state/thsv.village-jukebox/'],
  installationSteps: [
    'Install and enable Viewer Foundation.',
    'Import the Village Jukebox Streamer.bot package, put the private YouTube API key in Resolve YouTube Track, and leave both actions triggerless.',
    'Approve the resolver and Twitch reward helper, choose the command names in the wizard, and add the hosted browser source. Commands register automatically after restart.',
    'Configure optional reward IDs, save, restart StreamBridge, preview the source, then enable playback.',
  ],
  uninstallationSteps: ['Uninstalling keeps the queue, cooldowns, and recently played songs for a later reinstall.'], migrations: [],
  healthChecks: [{ id: 'thsv.village-jukebox.runtime', description: 'Checks that song lookups, the fair saved queue, one-at-a-time playback, and replies to the right platform all work.' }],
};

let operation = Promise.resolve();
let stopped = true;
let currentLeaseId;
let nextTaskId;
let unregisterLifecycle;
let unregisterMedia;
let votes = new Set();
// The creator's last "Test the YouTube key" run. Kept in memory only: it holds no viewer data.
let keyTest;
const KEY_TEST_VIDEO = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const KEY_TEST_PREFIX = 'jukebox-test-';
const resolutionTasks = new Map();
const livePlatforms = new Set();

function clean(value, maximum = 500) { return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '')].slice(0, maximum).join(''); }
function integer(value, minimum, maximum, fallback) { return Number.isSafeInteger(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback; }
function number(value, minimum, maximum, fallback) { return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback; }
function command(value, fallback) { return clean(value, 40).toLowerCase() || fallback; }
function platformSet(value, fallback) { return new Set(Array.isArray(value) ? value.filter((item) => PLATFORMS.includes(item)) : fallback); }
function settingsFor(context) {
  const raw = { ...FALLBACKS, ...(context.settings || {}) };
  return {
    enabled: raw.enabled === true, rightsAcknowledged: raw.rightsAcknowledged === true, requestCommand: command(raw.requestCommand, 'sr'), queueCommand: command(raw.queueCommand, 'songqueue'), whenCommand: command(raw.whenCommand, 'when'),
    wrongSongCommand: command(raw.wrongSongCommand, 'wrongsong'), voteSkipCommand: command(raw.voteSkipCommand, 'voteskip'), moderatorSkipCommand: command(raw.moderatorSkipCommand, 'skip'),
    pauseCommand: command(raw.pauseCommand, 'pausesong'), resumeCommand: command(raw.resumeCommand, 'resumesong'), blockCommand: command(raw.blockCommand, 'blocksong'),
    allowTextSearch: raw.allowTextSearch !== false, dailyTextSearchLimit: integer(raw.dailyTextSearchLimit, 1, 100, 50),
    enabledPlatforms: platformSet(raw.enabledPlatforms, PLATFORMS), pointsPlatforms: platformSet(raw.pointsPlatforms, ['youtube', 'tiktok']), pointsCost: integer(raw.pointsCost, 1, 1_000_000, 100),
    rewardRequestsEnabled: raw.rewardRequestsEnabled === true, twitchRewardId: clean(raw.twitchRewardId, 256), kickRewardId: clean(raw.kickRewardId, 256),
    maximumQueueSize: integer(raw.maximumQueueSize, 1, 50, 25), maximumRequestsPerViewer: integer(raw.maximumRequestsPerViewer, 1, 5, 1), viewerCooldownSeconds: integer(raw.viewerCooldownSeconds, 0, 86_400, 60),
    maximumTrackMinutes: integer(raw.maximumTrackMinutes, 1, 60, 8), recentNoRepeatCount: integer(raw.recentNoRepeatCount, 0, 100, 20), voteSkipRequired: integer(raw.voteSkipRequired, 1, 100, 5),
    secondsBetweenTracks: integer(raw.secondsBetweenTracks, 1, 60, 4), approveRequests: raw.approveRequests !== false, announceNowPlaying: raw.announceNowPlaying === true, volume: number(raw.volume, 0, 1, 0.7),
    backgroundColor: COLORS.test(raw.backgroundColor) ? raw.backgroundColor : '#101820', accentColor: COLORS.test(raw.accentColor) ? raw.accentColor : '#7ff5cc',
    textColor: COLORS.test(raw.textColor) ? raw.textColor : '#ffffff', fontFamily: ['broadcast', 'display', 'serif', 'mono'].includes(raw.fontFamily) ? raw.fontFamily : 'broadcast',
  };
}
function safeTrack(value) {
  if (!value || typeof value !== 'object') return undefined;
  const id = clean(value.id, 20); const title = clean(value.title, 200); const channel = clean(value.channel, 120); const thumbnailUrl = clean(value.thumbnailUrl, 2048);
  const durationSeconds = Number.isSafeInteger(value.durationSeconds) && value.durationSeconds >= 1 && value.durationSeconds <= 3_600 ? value.durationSeconds : 0; const platform = clean(value.platform, 20); const requesterKey = clean(value.requesterKey, 300);
  const requesterName = clean(value.requesterName, 80); const requestEventId = clean(value.requestEventId, 256); const requestId = clean(value.requestId, 100);
  if (!YOUTUBE_ID.test(id) || !title || !channel || !PLATFORMS.includes(platform) || !requesterKey || !requesterName || !requestEventId || !requestId || durationSeconds < 1) return undefined;
  const points = value.points && typeof value.points === 'object' && clean(value.points.viewerId, 64) && Number.isSafeInteger(value.points.amount) && value.points.amount >= 1 && value.points.amount <= 1_000_000 && clean(value.points.idempotencyKey, 128)
    ? { viewerId: clean(value.points.viewerId, 64), amount: value.points.amount, idempotencyKey: clean(value.points.idempotencyKey, 128) }
    : undefined;
  const reward = value.reward && typeof value.reward === 'object' && ['twitch', 'kick'].includes(clean(value.reward.platform, 20)) && clean(value.reward.rewardId, 256) && clean(value.reward.redemptionId, 256)
    ? { platform: clean(value.reward.platform, 20), rewardId: clean(value.reward.rewardId, 256), redemptionId: clean(value.reward.redemptionId, 256) }
    : undefined;
  if ((value.points !== undefined && !points) || (value.reward !== undefined && !reward)) return undefined;
  return { id, title, channel, thumbnailUrl: thumbnailUrl.startsWith('https://') ? thumbnailUrl : '', durationSeconds, platform, requesterKey, requesterName, requestEventId, requestId, approved: value.approved !== false, ...(points ? { points } : {}), ...(reward ? { reward } : {}) };
}
function stateFor(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const queue = Array.isArray(raw.queue) ? raw.queue.map(safeTrack).filter(Boolean).slice(0, 50) : [];
  const current = safeTrack(raw.current);
  const recentIds = Array.isArray(raw.recentIds) ? [...new Set(raw.recentIds.map((id) => clean(id, 20)).filter((id) => YOUTUBE_ID.test(id)))].slice(0, 100) : [];
  const cooldowns = {};
  if (raw.cooldowns && typeof raw.cooldowns === 'object') for (const [key, at] of Object.entries(raw.cooldowns).filter(([, at]) => Number.isSafeInteger(at)).sort((a, b) => b[1] - a[1]).slice(0, 500)) cooldowns[clean(key, 300)] = at;
  const pending = {};
  if (raw.pending && typeof raw.pending === 'object') for (const [id, item] of Object.entries(raw.pending).slice(0, 50)) {
    const requestId = clean(id, 100); if (!item || typeof item !== 'object' || !requestId) continue;
    const candidate = {
      requesterKey: clean(item.requesterKey, 300), requesterName: clean(item.requesterName, 80), userId: clean(item.userId, 256), platform: clean(item.platform, 20),
      requestEventId: clean(item.requestEventId, 256), pointCost: integer(item.pointCost, 0, 1_000_000, -1), requestedAt: integer(item.requestedAt, 1, Number.MAX_SAFE_INTEGER, 0),
      rewardPlatform: clean(item.rewardPlatform, 20), rewardId: clean(item.rewardId, 256), redemptionId: clean(item.redemptionId, 256),
    };
    const rewardFields = [candidate.rewardPlatform, candidate.rewardId, candidate.redemptionId]; const hasReward = rewardFields.some(Boolean);
    if (!candidate.requesterKey || !candidate.requesterName || !candidate.userId || !PLATFORMS.includes(candidate.platform) || !candidate.requestEventId || candidate.pointCost < 0 || candidate.requestedAt < 1) continue;
    if (hasReward && (!['twitch', 'kick'].includes(candidate.rewardPlatform) || !candidate.rewardId || !candidate.redemptionId)) continue;
    pending[requestId] = candidate;
  }
  const processed = Array.isArray(raw.processedRequestIds) ? [...new Set(raw.processedRequestIds.map((id) => clean(id, 100)).filter(Boolean))].slice(0, 200) : [];
  const searchDay = /^\d{4}-\d{2}-\d{2}$/u.test(clean(raw.searchDay, 10)) ? clean(raw.searchDay, 10) : '';
  const searchCount = integer(raw.searchCount, 0, 100, 0);
  const blocked = Array.isArray(raw.blocked) ? raw.blocked.map((item) => ({ id: clean(item?.id, 20), title: clean(item?.title, 200), blockedAt: integer(item?.blockedAt, 1, Number.MAX_SAFE_INTEGER, 0) })).filter((item) => YOUTUBE_ID.test(item.id) && item.blockedAt > 0).slice(0, MAXIMUM_BLOCKED) : [];
  const history = Array.isArray(raw.history) ? raw.history.map(safeHistory).filter(Boolean).slice(0, MAXIMUM_HISTORY) : [];
  const paused = raw.paused === true; const elapsedMs = integer(raw.elapsedMs, 0, 3_600_000, 0); const currentStartedAt = integer(raw.currentStartedAt, 0, Number.MAX_SAFE_INTEGER, 0);
  const volumeOverride = Number.isFinite(raw.volumeOverride) ? Math.max(0, Math.min(1, raw.volumeOverride)) : undefined;
  return { queue, ...(current ? { current } : {}), recentIds, cooldowns, pending, processedRequestIds: processed, searchDay, searchCount, blocked, history, paused, elapsedMs, currentStartedAt, ...(volumeOverride === undefined ? {} : { volumeOverride }) };
}
const MAXIMUM_BLOCKED = 500; const MAXIMUM_HISTORY = 200;
const HISTORY_STATUSES = ['queued', 'playing', 'played', 'skipped', 'stopped', 'removed', 'blocked', 'failed'];
function safeHistory(item) {
  if (!item || typeof item !== 'object') return undefined;
  const entry = { requestId: clean(item.requestId, 100), id: clean(item.id, 20), title: clean(item.title, 200), channel: clean(item.channel, 120), requesterName: clean(item.requesterName, 80), platform: clean(item.platform, 20), durationSeconds: integer(item.durationSeconds, 0, 3_600, 0), at: integer(item.at, 1, Number.MAX_SAFE_INTEGER, 0), status: HISTORY_STATUSES.includes(item.status) ? item.status : 'queued' };
  return entry.requestId && YOUTUBE_ID.test(entry.id) && entry.at > 0 ? entry : undefined;
}
/** Records a request in the saved history (newest first) or updates its status. */
function remember(state, track, status, now = Date.now()) {
  const existing = state.history.find((entry) => entry.requestId === track.requestId);
  if (existing) { existing.status = status; existing.at = now; return; }
  state.history.unshift({ requestId: track.requestId, id: track.id, title: track.title, channel: track.channel, requesterName: track.requesterName, platform: track.platform, durationSeconds: track.durationSeconds, at: now, status });
  state.history = state.history.slice(0, MAXIMUM_HISTORY);
}
function youtubeLink(id) { return `https://www.youtube.com/watch?v=${id}`; }
/** The 11-character video ID from a YouTube link or a bare ID, or an empty string. */
export function youtubeIdFrom(value) {
  const query = clean(value, 300); if (YOUTUBE_ID.test(query)) return query;
  try {
    const url = new URL(query); if (!['https:', 'http:'].includes(url.protocol)) return ''; const host = url.hostname.toLowerCase();
    if (host === 'youtu.be') { const id = url.pathname.split('/').filter(Boolean)[0] || ''; return YOUTUBE_ID.test(id) ? id : ''; }
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) return '';
    const id = /^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})(?:\/|$)/u.exec(url.pathname)?.[1] || url.searchParams.get('v') || '';
    return YOUTUBE_ID.test(id) ? id : '';
  } catch { return ''; }
}
function isBlocked(state, id) { return state.blocked.some((item) => item.id === id); }
function eventUserKey(event) { const id = clean(event.user?.id, 256); return id ? `${event.platform}:${id}` : ''; }
function isModerator(event) { const roles = new Set((event.user?.roles || []).map((role) => clean(role, 30).toLowerCase())); return roles.has('broadcaster') || roles.has('moderator') || roles.has('mod'); }
function queryFrom(event) { const args = Array.isArray(event.payload?.arguments) ? event.payload.arguments.map((part) => clean(part, 200)).filter(Boolean) : []; return clean(args.join(' ') || event.payload?.input, 300); }
function isDirectYouTubeRequest(value) {
  const query = clean(value, 300); if (YOUTUBE_ID.test(query)) return true;
  try {
    const url = new URL(query); if (url.protocol !== 'https:') return false; const host = url.hostname.toLowerCase();
    if (host === 'youtu.be') return YOUTUBE_ID.test(url.pathname.split('/').filter(Boolean)[0] || '');
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) return false;
    const pathId = /^\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})(?:\/|$)/u.exec(url.pathname)?.[1];
    return YOUTUBE_ID.test(pathId || url.searchParams.get('v') || '');
  } catch { return false; }
}
async function say(context, platform, message) { if (!PLATFORMS.includes(platform) || !message) return; await context.chat.send({ message: clean(message, platform === 'youtube' ? 200 : platform === 'tiktok' ? 150 : 500), routing: 'source', sourcePlatform: platform, overflow: 'reject' }).catch(() => undefined); }
async function settleReward(context, reward, operationName) { if (!reward || reward.platform !== 'twitch') return; await context.streamerbot.runApprovedAction(SETTLE_REWARD_ACTION_ID, { villageJukeboxRewardOperation: operationName, villageJukeboxRewardId: reward.rewardId, villageJukeboxRedemptionId: reward.redemptionId }); }
async function refundTrack(context, track, suffix, refundNativeReward = true) {
  if (track?.points) await context.viewerFoundation.mutate({ viewerId: track.points.viewerId, operation: 'refund', amount: track.points.amount, reason: 'Village Jukebox request refund', idempotencyKey: `${track.points.idempotencyKey}:${suffix}` }).catch(() => undefined);
  if (refundNativeReward) await settleReward(context, track?.reward, 'refund').catch(() => undefined);
}
function countViewerRequests(state, requesterKey) { return state.queue.filter((track) => track.requesterKey === requesterKey).length + (state.current?.requesterKey === requesterKey ? 1 : 0) + Object.values(state.pending).filter((item) => item.requesterKey === requesterKey).length; }
async function beginResolution(event, context, settings, query, reward) {
  const requesterKey = eventUserKey(event); const requesterName = clean(event.user?.displayName || event.user?.name, 80); const userId = clean(event.user?.id, 256);
  if (!requesterKey || !requesterName || !query) { await say(context, event.platform, `Usage: !${settings.requestCommand} <YouTube link or song title>`); return { accepted: false, reason: 'missing-request' }; }
  const state = stateFor(await context.state.read()); const now = Date.now();
  if (state.queue.length + Object.keys(state.pending).length >= settings.maximumQueueSize) { await say(context, event.platform, 'The Village Jukebox queue is full. Try again after a track plays.'); return { accepted: false, reason: 'queue-full' }; }
  if (countViewerRequests(state, requesterKey) >= settings.maximumRequestsPerViewer) { await say(context, event.platform, 'You already have the maximum number of active song requests.'); return { accepted: false, reason: 'viewer-limit' }; }
  if (now - (state.cooldowns[requesterKey] || 0) < settings.viewerCooldownSeconds * 1000) { await say(context, event.platform, 'Your song-request cooldown is still active.'); return { accepted: false, reason: 'cooldown' }; }
  // A blocked link is refused straight away: no YouTube lookup, no cooldown, nothing spent.
  const directId = youtubeIdFrom(query);
  if (directId && isBlocked(state, directId)) { await say(context, event.platform, 'That video is blocked on this stream. Try another song.'); return { accepted: false, reason: 'blocked' }; }
  const searchDay = new Date(now).toISOString().slice(0, 10); if (state.searchDay !== searchDay) { state.searchDay = searchDay; state.searchCount = 0; }
  const titleSearch = !isDirectYouTubeRequest(query);
  if (titleSearch && !settings.allowTextSearch) { await say(context, event.platform, `Village Jukebox currently accepts direct YouTube links only. Use !${settings.requestCommand} <YouTube link>.`); return { accepted: false, reason: 'links-only' }; }
  if (titleSearch && state.searchCount >= settings.dailyTextSearchLimit) { await say(context, event.platform, 'The daily song-title search allowance is used up. Direct YouTube links still work.'); return { accepted: false, reason: 'search-limit' }; }
  if (titleSearch) state.searchCount += 1;
  const requestId = clean(`jukebox-${event.eventId}`, 100); const pointCost = reward ? 0 : settings.pointsPlatforms.has(event.platform) ? settings.pointsCost : 0;
  state.pending[requestId] = {
    requesterKey, requesterName, userId, platform: event.platform, requestEventId: clean(event.eventId, 256), pointCost, requestedAt: now,
    rewardPlatform: reward?.platform || '', rewardId: reward?.rewardId || '', redemptionId: reward?.redemptionId || '',
  };
  state.cooldowns[requesterKey] = now; await context.state.write(state);
  const timeoutTask = context.schedule.after(45_000, () => serialize(async () => {
    resolutionTasks.delete(requestId);
    const latest = stateFor(await context.state.read()); const expired = latest.pending[requestId];
    if (!expired) return;
    delete latest.pending[requestId]; delete latest.cooldowns[expired.requesterKey]; latest.processedRequestIds.unshift(requestId); latest.processedRequestIds = [...new Set(latest.processedRequestIds)].slice(0, 200); await context.state.write(latest);
    const expiredReward = expired.rewardId && expired.redemptionId ? { platform: expired.rewardPlatform, rewardId: expired.rewardId, redemptionId: expired.redemptionId } : undefined;
    await settleReward(context, expiredReward, 'refund').catch(() => undefined);
    await say(context, expired.platform, 'Village Jukebox timed out while checking YouTube. No points were spent; try again shortly.');
  }));
  resolutionTasks.set(requestId, timeoutTask);
  try {
    await context.streamerbot.runApprovedAction(RESOLVE_ACTION_ID, {
      villageJukeboxRequestId: requestId, villageJukeboxQuery: query, villageJukeboxPlatform: event.platform, villageJukeboxUserId: userId,
      villageJukeboxRequesterName: requesterName, villageJukeboxRequestEventId: clean(event.eventId, 256), villageJukeboxPointCost: pointCost,
      villageJukeboxRewardPlatform: reward?.platform || '', villageJukeboxRewardId: reward?.rewardId || '', villageJukeboxRedemptionId: reward?.redemptionId || '',
    });
  } catch (error) {
    context.schedule.cancel(timeoutTask); resolutionTasks.delete(requestId);
    delete state.pending[requestId]; delete state.cooldowns[requesterKey]; if (titleSearch && state.searchDay === searchDay) state.searchCount = Math.max(0, state.searchCount - 1); await context.state.write(state); await settleReward(context, reward, 'refund').catch(() => undefined);
    await say(context, event.platform, 'Village Jukebox could not start the YouTube lookup. Check its approved action and API key.');
    return { accepted: false, reason: 'resolver-unavailable' };
  }
  await say(context, event.platform, `Checking ${query} for the Village Jukebox queue...`);
  return { accepted: true, pending: true, requestId };
}
/** Asks the Streamer.bot resolver to look up one well-known public video, so the creator can check the YouTube key. */
async function startKeyTest(context) {
  if (typeof context.streamerbot?.runApprovedAction !== 'function') throw new Error('Streamer.bot is not connected to StreamBridge.');
  const requestId = `${KEY_TEST_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  keyTest = { requestId, status: 'waiting', startedAt: new Date().toISOString() };
  context.schedule.after(30_000, () => serialize(async () => {
    if (keyTest?.requestId === requestId && keyTest.status === 'waiting') keyTest = { ...keyTest, status: 'failed', error: 'Streamer.bot did not answer within 30 seconds. Check that Streamer.bot is running, the Village Jukebox import is in Streamer.bot, and Resolve YouTube Track is approved below.' };
  }));
  try {
    await context.streamerbot.runApprovedAction(RESOLVE_ACTION_ID, {
      villageJukeboxRequestId: requestId, villageJukeboxQuery: KEY_TEST_VIDEO, villageJukeboxPlatform: 'twitch', villageJukeboxUserId: 'key-test',
      villageJukeboxRequesterName: 'Key test', villageJukeboxRequestEventId: requestId, villageJukeboxPointCost: 0,
      villageJukeboxRewardPlatform: '', villageJukeboxRewardId: '', villageJukeboxRedemptionId: '',
    });
  } catch (error) {
    keyTest = { ...keyTest, status: 'failed', error: clean(error instanceof Error ? error.message : String(error), 200) || 'Streamer.bot could not run Resolve YouTube Track. Approve it below first.' };
  }
  return { keyTest };
}
function finishKeyTest(payload, requestId) {
  if (keyTest?.requestId !== requestId) return { accepted: false, reason: 'old-key-test' };
  keyTest = payload.succeeded === true
    ? { ...keyTest, status: 'passed', title: clean(payload.title, 120) }
    : { ...keyTest, status: 'failed', error: clean(payload.error, 180) || 'YouTube could not find the test video.' };
  return { accepted: true, keyTest: keyTest.status };
}

async function resolvedTrack(event, context, settings) {
  const payload = event.payload || {}; const requestId = clean(payload.requestId, 100);
  // A key test never touches the queue, cooldowns or points.
  if (requestId.startsWith(KEY_TEST_PREFIX)) return finishKeyTest(payload, requestId);
  const state = stateFor(await context.state.read());
  if (!requestId || state.processedRequestIds.includes(requestId)) return { accepted: false, reason: 'duplicate-result' };
  const pending = state.pending[requestId]; if (!pending) return { accepted: false, reason: 'unknown-or-expired-request' };
  const resolutionTask = resolutionTasks.get(requestId); if (resolutionTask !== undefined) context.schedule.cancel(resolutionTask); resolutionTasks.delete(requestId);
  delete state.pending[requestId]; state.processedRequestIds.unshift(requestId); state.processedRequestIds = state.processedRequestIds.slice(0, 200);
  const platform = pending.platform; const reward = pending.rewardId && pending.redemptionId ? { platform: pending.rewardPlatform, rewardId: pending.rewardId, redemptionId: pending.redemptionId } : undefined;
  if (payload.succeeded !== true) {
    await context.state.write(state); await settleReward(context, reward, 'refund').catch(() => undefined);
    await say(context, platform, `Song request rejected: ${clean(payload.error, 140) || 'YouTube could not resolve a playable video.'}`);
    return { accepted: false, reason: 'resolution-failed' };
  }
  const durationSeconds = integer(payload.durationSeconds, 1, 86_400, 0); const id = clean(payload.videoId, 20);
  if (!YOUTUBE_ID.test(id) || durationSeconds < 1 || durationSeconds > settings.maximumTrackMinutes * 60 || isBlocked(state, id) || state.recentIds.slice(0, settings.recentNoRepeatCount).includes(id) || state.queue.some((track) => track.id === id) || state.current?.id === id) {
    await context.state.write(state); await settleReward(context, reward, 'refund').catch(() => undefined);
    const reason = isBlocked(state, id) ? 'That video is blocked on this stream. Try another song.' : durationSeconds > settings.maximumTrackMinutes * 60 ? `Tracks must be ${settings.maximumTrackMinutes} minutes or shorter.` : 'That track is already queued or was played recently.';
    await say(context, platform, reason); return { accepted: false, reason: 'track-policy' };
  }
  const userId = pending.userId; const pointCost = pending.pointCost; let points;
  if (pointCost > 0) {
    const projection = await context.viewerFoundation.getProjection({ platform, userId });
    if (!projection) { await context.state.write(state); await say(context, platform, 'Your Viewer Foundation points account is not available yet.'); return { accepted: false, reason: 'viewer-unavailable' }; }
    const idempotencyKey = `village-jukebox:${clean(pending.requestEventId, 100)}`;
    try { await context.viewerFoundation.mutate({ viewerId: projection.viewerId, operation: 'spend', amount: pointCost, reason: 'Village Jukebox song request', idempotencyKey }); points = { viewerId: projection.viewerId, amount: pointCost, idempotencyKey }; }
    catch { await context.state.write(state); await say(context, platform, `You need ${pointCost} ${projection.currencyName || 'points'} for this request.`); return { accepted: false, reason: 'insufficient-points' }; }
  }
  const track = safeTrack({ id, title: payload.title, channel: payload.channel, thumbnailUrl: payload.thumbnailUrl, durationSeconds, platform, requesterKey: pending.requesterKey, requesterName: pending.requesterName, requestEventId: pending.requestEventId, requestId, approved: !settings.approveRequests, ...(points ? { points } : {}), ...(reward ? { reward } : {}) });
  if (!track) { if (points) await context.viewerFoundation.mutate({ viewerId: points.viewerId, operation: 'refund', amount: points.amount, reason: 'Village Jukebox invalid result refund', idempotencyKey: `${points.idempotencyKey}:invalid` }).catch(() => undefined); await settleReward(context, reward, 'refund').catch(() => undefined); await context.state.write(state); return { accepted: false, reason: 'invalid-result' }; }
  state.queue.push(track); remember(state, track, 'queued'); await context.state.write(state); await settleReward(context, reward, 'fulfill').catch(() => undefined);
  await say(context, platform, track.approved ? `Added ${track.title} by ${track.channel} to Village Jukebox. Queue position: ${state.queue.length}.` : `Added ${track.title} by ${track.channel} to Village Jukebox. It plays once the streamer approves it. Queue position: ${state.queue.length}.`);
  await playNext(context); return { accepted: true, queued: true, trackId: track.id };
}
async function playNext(context) {
  if (stopped || nextTaskId !== undefined) return;
  const settings = settingsFor(context); if (!settings.enabled || !settings.rightsAcknowledged) return;
  const state = stateFor(await context.state.read()); if (state.paused || state.current) return;
  // With "Review each video before it plays" on, only approved videos play; the rest wait in the queue with their titles showing.
  const index = settings.approveRequests ? state.queue.findIndex((track) => track.approved) : 0; if (index < 0 || !state.queue[index]) return;
  const candidate = state.queue[index]; const durationMs = Math.min(3_600_000, candidate.durationSeconds * 1000 + 15_000);
  const lease = await context.mediaSlot.acquire({ durationMs, priority: 25 });
  if (!lease.acquired) { nextTaskId = context.schedule.after(5_000, () => { nextTaskId = undefined; return serialize(() => playNext(context)); }); return; }
  currentLeaseId = lease.leaseId; [state.current] = state.queue.splice(index, 1); state.currentStartedAt = Date.now(); state.elapsedMs = 0; remember(state, state.current, 'playing');
  await context.state.write(state); votes = new Set();
  const track = state.current; const playbackId = `jukebox-${track.requestId}`;
  try {
    await context.overlay.publish(`${MODULE_ID}.media.play`, {
      embedUrl: `https://www.youtube.com/embed/${track.id}`, playbackId, durationMs: track.durationSeconds * 1000, muted: false, volume: state.volumeOverride ?? settings.volume,
      title: `${track.title} — ${track.channel} • requested by ${track.requesterName}`,
      style: { backgroundColor: settings.backgroundColor, accentColor: settings.accentColor, textColor: settings.textColor, fontFamily: settings.fontFamily },
    }, { lane: 'media' });
    if (settings.announceNowPlaying) await say(context, track.platform, `Now playing: ${track.title} by ${track.channel}, requested by ${track.requesterName}.`);
  } catch (error) {
    state.current = undefined; state.queue.unshift(track); await context.state.write(state); await context.mediaSlot.release(currentLeaseId).catch(() => undefined); currentLeaseId = undefined;
    nextTaskId = context.schedule.after(5_000, () => { nextTaskId = undefined; return serialize(() => playNext(context)); });
  }
}
const FINISH_STATUS = Object.freeze({ ended: 'played', failed: 'failed', timeout: 'failed', blocked: 'blocked', stopped: 'stopped' });
async function finishCurrent(context, reason) {
  const state = stateFor(await context.state.read()); const track = state.current; if (!track) return;
  state.current = undefined; state.currentStartedAt = 0; state.elapsedMs = 0; state.recentIds.unshift(track.id); state.recentIds = [...new Set(state.recentIds)].slice(0, 100);
  remember(state, track, FINISH_STATUS[reason] || 'skipped'); await context.state.write(state); votes = new Set();
  if (currentLeaseId) await context.mediaSlot.release(currentLeaseId).catch(() => undefined); currentLeaseId = undefined;
  if (reason === 'failed' || reason === 'timeout') await say(context, track.platform, `Village Jukebox skipped ${track.title} because playback failed.`);
  // A song that ends on its own gets the usual gap; a manual skip moves straight on.
  const settings = settingsFor(context); const manual = ['vote-skip', 'moderator-skip', 'skipped', 'blocked', 'stopped'].includes(reason);
  if (nextTaskId !== undefined) context.schedule.cancel(nextTaskId);
  nextTaskId = context.schedule.after(manual ? 1_000 : settings.secondsBetweenTracks * 1000, () => { nextTaskId = undefined; return serialize(() => playNext(context)); });
}
async function skipCurrent(context, reason = 'skipped') {
  const state = stateFor(await context.state.read()); if (!state.current) return false;
  await context.overlay.publish(`${MODULE_ID}.media.stop`, { fade: true }).catch(() => undefined);
  if (state.paused) { state.paused = false; await context.state.write(state); }
  await finishCurrent(context, reason); return true;
}
/** Pauses the song in place (or holds the queue when nothing is playing) and frees the shared media slot. */
async function pausePlayback(context) {
  const state = stateFor(await context.state.read()); if (state.paused) return { paused: true, changed: false };
  state.paused = true;
  if (state.current) {
    if (state.currentStartedAt > 0) state.elapsedMs = Math.min(state.current.durationSeconds * 1000, state.elapsedMs + Math.max(0, Date.now() - state.currentStartedAt));
    state.currentStartedAt = 0;
    await context.overlay.publish(`${MODULE_ID}.media.pause`, { playbackId: `jukebox-${state.current.requestId}` }).catch(() => undefined);
  }
  await context.state.write(state);
  if (currentLeaseId) { const leaseId = currentLeaseId; currentLeaseId = undefined; await context.mediaSlot.release(leaseId).catch(() => undefined); }
  return { paused: true, changed: true };
}
/** Resumes the paused song where it stopped, or starts the queue again. */
async function resumePlayback(context) {
  const state = stateFor(await context.state.read()); if (!state.paused) return { paused: false, changed: false };
  if (state.current) {
    const remainingMs = Math.max(5_000, state.current.durationSeconds * 1000 - state.elapsedMs);
    const lease = await context.mediaSlot.acquire({ durationMs: Math.min(3_600_000, remainingMs + 15_000), priority: 25 });
    if (!lease.acquired) return { paused: true, changed: false, reason: 'media-busy' };
    currentLeaseId = lease.leaseId; state.paused = false; state.currentStartedAt = Date.now(); await context.state.write(state);
    await context.overlay.publish(`${MODULE_ID}.media.resume`, { playbackId: `jukebox-${state.current.requestId}` }).catch(() => undefined);
    return { paused: false, changed: true };
  }
  state.paused = false; await context.state.write(state); await playNext(context);
  return { paused: false, changed: true };
}
/** Blocks a video for good: it can never be requested again, queued copies are removed with a refund, and it stops if it is playing. */
async function blockVideo(context, id, title = '') {
  if (!YOUTUBE_ID.test(id)) return { blocked: false, reason: 'not-a-youtube-video' };
  const state = stateFor(await context.state.read());
  const known = state.current?.id === id ? state.current : state.queue.find((track) => track.id === id) || state.history.find((entry) => entry.id === id);
  if (!isBlocked(state, id)) { state.blocked.unshift({ id, title: clean(title || known?.title, 200), blockedAt: Date.now() }); state.blocked = state.blocked.slice(0, MAXIMUM_BLOCKED); }
  const removed = state.queue.filter((track) => track.id === id); state.queue = state.queue.filter((track) => track.id !== id);
  for (const track of removed) remember(state, track, 'blocked');
  const playing = state.current?.id === id; await context.state.write(state);
  for (const track of removed) await refundTrack(context, track, 'blocked');
  if (playing) await skipCurrent(context, 'blocked');
  return { blocked: true, removedFromQueue: removed.length, stoppedPlaying: playing };
}
/** Stop: ends the video on screen and holds the queue until Play is pressed. */
async function stopPlayback(context) {
  const state = stateFor(await context.state.read()); state.paused = true; await context.state.write(state);
  if (!state.current) return { stopped: false };
  await context.overlay.publish(`${MODULE_ID}.media.stop`, { fade: true }).catch(() => undefined);
  await finishCurrent(context, 'stopped'); return { stopped: true };
}
/** Play this now: the chosen queued video jumps to the front and starts straight away. */
async function playNow(context, requestId) {
  const state = stateFor(await context.state.read()); const index = state.queue.findIndex((track) => track.requestId === requestId);
  if (index < 0) throw new Error('That request is no longer in the queue.');
  const [chosen] = state.queue.splice(index, 1); chosen.approved = true; state.queue.unshift(chosen); state.paused = false; await context.state.write(state);
  if (state.current) { await skipCurrent(context, 'skipped'); return { playing: chosen.title }; }
  await playNext(context);
  return { playing: chosen.title };
}
/** Play again: puts a video from the history back at the front of the queue. Nobody is charged for a creator replay. */
async function replay(context, requestId) {
  const state = stateFor(await context.state.read()); const entry = state.history.find((item) => item.requestId === requestId);
  if (!entry || entry.durationSeconds < 1) throw new Error('That video cannot be played again from here. Ask for it with a new request.');
  if (isBlocked(state, entry.id)) throw new Error('That video is blocked. Unblock it first.');
  const track = safeTrack({ id: entry.id, title: entry.title, channel: entry.channel || 'YouTube', durationSeconds: entry.durationSeconds, platform: entry.platform, requesterKey: `creator:${entry.platform}`, requesterName: entry.requesterName || 'Streamer', requestEventId: `replay-${entry.requestId}`, requestId: clean(`replay-${Date.now()}-${entry.id}`, 100) });
  if (!track) throw new Error('That video cannot be played again from here.');
  state.queue.unshift(track); remember(state, track, 'queued'); await context.state.write(state); await playNext(context);
  return { queued: track.title };
}
async function removeQueued(context, requestId, suffix) {
  const state = stateFor(await context.state.read()); const index = state.queue.findIndex((track) => track.requestId === requestId);
  if (index < 0) return undefined;
  const [removed] = state.queue.splice(index, 1); remember(state, removed, 'removed'); await context.state.write(state);
  await refundTrack(context, removed, suffix); return removed;
}
async function handleCommand(event, context, settings) {
  const name = clean(event.payload?.command, 40).toLowerCase(); const state = stateFor(await context.state.read()); const key = eventUserKey(event);
  if (name === settings.requestCommand) return beginResolution(event, context, settings, queryFrom(event));
  if (name === settings.queueCommand) { await say(context, event.platform, state.current ? `Now playing ${state.current.title}. ${state.queue.length} track${state.queue.length === 1 ? '' : 's'} queued.` : `${state.queue.length} track${state.queue.length === 1 ? '' : 's'} queued.`); return { accepted: true }; }
  if (name === settings.whenCommand) { const position = state.queue.findIndex((track) => track.requesterKey === key); await say(context, event.platform, position < 0 ? 'You do not have a queued Village Jukebox request.' : `Your next song is number ${position + 1} in the queue.`); return { accepted: position >= 0 }; }
  if (name === settings.wrongSongCommand) {
    const index = state.queue.map((track) => track.requesterKey).lastIndexOf(key); if (index < 0) { await say(context, event.platform, 'You do not have a removable queued request.'); return { accepted: false }; }
    const [removed] = state.queue.splice(index, 1); remember(state, removed, 'removed'); await context.state.write(state); await refundTrack(context, removed, 'viewer-removed', false);
    await say(context, event.platform, removed.reward?.platform === 'twitch' ? `Removed ${removed.title} from the queue. The already-fulfilled Twitch reward cannot be refunded.` : `Removed ${removed.title} from the queue. Viewer Foundation points were refunded when applicable.`); return { accepted: true };
  }
  if (name === settings.voteSkipCommand) {
    if (!state.current || !key) return { accepted: false }; votes.add(key); const remaining = Math.max(0, settings.voteSkipRequired - votes.size);
    if (remaining > 0) { await say(context, event.platform, `${remaining} more unique vote${remaining === 1 ? '' : 's'} needed to skip.`); return { accepted: true, remaining }; }
    await context.overlay.publish(`${MODULE_ID}.media.stop`, { fade: true }); await finishCurrent(context, 'vote-skip'); return { accepted: true, skipped: true };
  }
  if (name === settings.moderatorSkipCommand && isModerator(event)) { await context.overlay.publish(`${MODULE_ID}.media.stop`, { fade: true }); await finishCurrent(context, 'moderator-skip'); return { accepted: true, skipped: true }; }
  if (name === settings.pauseCommand && isModerator(event)) { const result = await pausePlayback(context); await say(context, event.platform, result.changed ? 'Village Jukebox paused.' : 'Village Jukebox is already paused.'); return { accepted: true, ...result }; }
  if (name === settings.resumeCommand && isModerator(event)) {
    const result = await resumePlayback(context);
    await say(context, event.platform, result.reason === 'media-busy' ? 'Other media is playing right now. Try again in a moment.' : result.changed ? 'Village Jukebox resumed.' : 'Village Jukebox is already playing.');
    return { accepted: true, ...result };
  }
  if (name === settings.blockCommand && isModerator(event)) {
    // !blocksong blocks the current song, or the video in a link: !blocksong <YouTube link>.
    const id = youtubeIdFrom(queryFrom(event)) || state.current?.id || '';
    if (!id) { await say(context, event.platform, `Nothing to block. Use !${settings.blockCommand} while a song plays, or add a YouTube link.`); return { accepted: false }; }
    const result = await blockVideo(context, id); await say(context, event.platform, 'Blocked. That video can no longer be requested on this stream.'); return { accepted: true, ...result };
  }
  return undefined;
}
// Streamer.bot creator controls (Stream Deck buttons or hotkeys). StreamBridge only relays the fixed action names.
const CONTROL_ACTIONS = Object.freeze(['toggle', 'skip', 'stop', 'approve-next', 'approve-all']);
async function creatorControl(event, context) {
  const action = clean(event.payload?.action, 20); if (event.metadata?.simulated === true || !CONTROL_ACTIONS.includes(action)) return { accepted: false, reason: 'unknown-control' };
  if (action === 'toggle') { const state = stateFor(await context.state.read()); return { accepted: true, ...(await administer({ operation: state.paused ? 'resume' : 'pause' }, context)) }; }
  if (action === 'approve-next') {
    const state = stateFor(await context.state.read()); const next = state.queue.find((track) => !track.approved);
    if (!next) return { accepted: true, approved: '' };
    return { accepted: true, ...(await administer({ operation: 'approve', requestId: next.requestId }, context)) };
  }
  return { accepted: true, ...(await administer({ operation: action }, context)) };
}
async function processEvent(event, context) {
  const settings = settingsFor(context);
  if (event.eventType === 'stream.online') { livePlatforms.add(event.platform); return; }
  if (event.eventType === 'stream.offline') { livePlatforms.delete(event.platform); return; }
  if (event.eventType === `addon.${MODULE_ID}.track-resolved`) return resolvedTrack(event, context, settings);
  if (event.eventType === `addon.${MODULE_ID}.control`) return creatorControl(event, context);
  if (!settings.enabled || !settings.rightsAcknowledged || event.metadata?.simulated === true || event.user?.actorType !== 'human' || !settings.enabledPlatforms.has(event.platform)) return;
  if (event.eventType === 'command.received') return handleCommand(event, context, settings);
  if (event.eventType !== 'reward.redemption' || !settings.rewardRequestsEnabled || event.payload?.pointsReward === true || !['twitch', 'kick'].includes(event.platform) || event.payload?.verifiedTransport !== true) return;
  const configuredId = event.platform === 'twitch' ? settings.twitchRewardId : settings.kickRewardId;
  const rewardId = clean(event.payload?.rewardId, 256); const redemptionId = clean(event.payload?.redemptionId, 256); const query = clean(event.payload?.input, 300);
  if (!configuredId || rewardId !== configuredId || !redemptionId) return;
  return beginResolution(event, context, settings, query, { platform: event.platform, rewardId, redemptionId });
}
/** What the Wizard's Jukebox panel shows: the song playing, the queue, the blocklist and the request history (with links). */
function jukeboxStatus(context, state) {
  const settings = settingsFor(context); const now = Date.now();
  const track = (item) => ({ requestId: item.requestId, videoId: item.id, link: youtubeLink(item.id), title: item.title, channel: item.channel, requesterName: item.requesterName, platform: item.platform, durationSeconds: item.durationSeconds, approved: item.approved || !settings.approveRequests });
  const elapsedMs = state.current ? Math.min(state.current.durationSeconds * 1000, state.elapsedMs + (state.currentStartedAt > 0 ? now - state.currentStartedAt : 0)) : 0;
  return {
    enabled: settings.enabled, ready: settings.enabled && settings.rightsAcknowledged, paused: state.paused, approveRequests: settings.approveRequests, volume: state.volumeOverride ?? settings.volume,
    current: state.current ? { ...track(state.current), elapsedSeconds: Math.floor(elapsedMs / 1000) } : null,
    queue: state.queue.map(track), blocked: state.blocked.map((item) => ({ videoId: item.id, link: youtubeLink(item.id), title: item.title, blockedAt: new Date(item.blockedAt).toISOString() })),
    history: state.history.map((entry) => ({ requestId: entry.requestId, videoId: entry.id, link: youtubeLink(entry.id), title: entry.title, channel: entry.channel, requesterName: entry.requesterName, platform: entry.platform, durationSeconds: entry.durationSeconds, status: entry.status, at: new Date(entry.at).toISOString() })),
    ...(keyTest ? { keyTest: { ...keyTest } } : {}),
  };
}
async function administer(request, context) {
  const operationName = request?.operation; const requestId = clean(request?.requestId, 100);
  let result = {};
  if (operationName === 'test-key') result = await startKeyTest(context);
  else if (operationName === 'approve') {
    const state = stateFor(await context.state.read()); const track = state.queue.find((item) => item.requestId === requestId);
    if (!track) throw new Error('That request is no longer in the queue.');
    track.approved = true; await context.state.write(state); await playNext(context); result = { approved: track.title };
  } else if (operationName === 'approve-all') {
    const state = stateFor(await context.state.read()); const waiting = state.queue.filter((track) => !track.approved);
    for (const track of waiting) track.approved = true; await context.state.write(state); await playNext(context); result = { approved: waiting.length };
  } else if (operationName === 'skip') result = { skipped: await skipCurrent(context, 'skipped') };
  else if (operationName === 'stop') result = await stopPlayback(context);
  else if (operationName === 'play-now') result = await playNow(context, requestId);
  else if (operationName === 'replay') result = await replay(context, requestId);
  else if (operationName === 'pause') result = await pausePlayback(context);
  else if (operationName === 'resume') result = await resumePlayback(context);
  else if (operationName === 'remove') { const removed = await removeQueued(context, requestId, 'creator-removed'); if (!removed) throw new Error('That request is no longer in the queue.'); result = { removed: removed.title }; }
  else if (operationName === 'play-next') {
    const state = stateFor(await context.state.read()); const index = state.queue.findIndex((track) => track.requestId === requestId);
    if (index < 0) throw new Error('That request is no longer in the queue.');
    const [moved] = state.queue.splice(index, 1); state.queue.unshift(moved); await context.state.write(state); result = { moved: moved.title };
  } else if (operationName === 'clear') {
    const state = stateFor(await context.state.read()); const cleared = state.queue; state.queue = []; for (const track of cleared) remember(state, track, 'removed'); await context.state.write(state);
    for (const track of cleared) await refundTrack(context, track, 'creator-cleared'); result = { cleared: cleared.length };
  } else if (operationName === 'block') {
    const id = youtubeIdFrom(request?.video); if (!id) throw new Error('Paste a YouTube link or an 11-character video ID to block.');
    result = await blockVideo(context, id, request?.title);
  } else if (operationName === 'unblock') {
    const id = youtubeIdFrom(request?.video); const state = stateFor(await context.state.read()); const before = state.blocked.length;
    state.blocked = state.blocked.filter((item) => item.id !== id); await context.state.write(state); result = { unblocked: before !== state.blocked.length };
  } else if (operationName === 'volume') {
    const volume = Number(request?.volume); if (!Number.isFinite(volume)) throw new Error('Volume must be between 0 and 100.');
    const state = stateFor(await context.state.read()); state.volumeOverride = Math.max(0, Math.min(1, volume)); await context.state.write(state);
    if (state.current) await context.overlay.publish(`${MODULE_ID}.media.volume`, { playbackId: `jukebox-${state.current.requestId}`, volume: state.volumeOverride }).catch(() => undefined);
    result = { volume: state.volumeOverride };
  } else if (operationName !== 'status') throw new Error('Unknown Village Jukebox control.');
  return { ...result, status: jukeboxStatus(context, stateFor(await context.state.read())) };
}
// The Control Panel tab: the same controls as the Jukebox remote, described for the shared panel.
const PANEL_OPERATIONS = Object.freeze(['skip', 'stop', 'pause', 'resume', 'clear', 'approve-all', 'approve', 'play-now', 'play-next', 'remove', 'replay', 'block', 'unblock', 'volume']);
function minutes(seconds) { const value = Math.max(0, Math.floor(Number(seconds) || 0)); return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`; }
function panelView(status) {
  const waiting = status.queue.filter((item) => !item.approved).length;
  const summary = [
    { label: 'Now playing', value: status.current ? `${status.current.title} (${status.current.requesterName}) ${minutes(status.current.elapsedSeconds)} / ${minutes(status.current.durationSeconds)}` : status.paused ? 'Stopped' : 'Nothing playing' },
    { label: 'In the queue', value: String(status.queue.length) },
    ...(status.approveRequests ? [{ label: 'Waiting for approval', value: String(waiting) }] : []),
    { label: 'Volume', value: `${String(Math.round(status.volume * 100))}%` },
  ];
  const actions = [
    status.paused ? { action: 'resume', label: 'Play', style: 'primary' } : { action: 'pause', label: 'Pause' },
    { action: 'skip', label: 'Skip' }, { action: 'stop', label: 'Stop' },
    ...(waiting > 0 ? [{ action: 'approve-all', label: 'Approve all', style: 'primary' }] : []),
    { action: 'volume', label: 'Set volume', inputs: [{ name: 'percent', label: 'Volume %', type: 'number', minimum: 0, maximum: 100, defaultValue: Math.round(status.volume * 100) }] },
    { action: 'block', label: 'Block a link', style: 'danger', inputs: [{ name: 'video', label: 'YouTube link', type: 'text', maxLength: 300 }] },
    { action: 'clear', label: 'Clear queue', style: 'danger', confirm: 'Clear the whole queue? Everyone gets their points back.' },
  ];
  const queueItems = status.queue.map((item, index) => ({
    title: item.title, link: item.link, detail: `${item.channel} · ${item.requesterName} · ${minutes(item.durationSeconds)}`, badge: item.approved ? '' : 'Waiting for approval', thumbnail: item.videoId,
    actions: [
      ...(item.approved ? [] : [{ action: 'approve', label: 'Approve', style: 'primary', values: { requestId: item.requestId } }]),
      { action: 'play-now', label: 'Play now', values: { requestId: item.requestId } },
      ...(index > 0 ? [{ action: 'play-next', label: 'Next', values: { requestId: item.requestId } }] : []),
      { action: 'remove', label: 'Remove', values: { requestId: item.requestId } },
      { action: 'block', label: 'Block', style: 'danger', confirm: `Block "${item.title}" for good?`, values: { video: item.videoId, title: item.title } },
    ],
  }));
  const blockedIds = new Set(status.blocked.map((item) => item.videoId));
  return {
    summary, actions,
    lists: [
      { title: 'Up next', empty: 'The queue is empty.', items: queueItems },
      { title: 'Played and requested', empty: 'No requests yet.', items: status.history.slice(0, 25).map((item) => ({ title: item.title, link: item.link, detail: `${item.requesterName} · ${item.status}`, thumbnail: item.videoId, actions: item.durationSeconds > 0 && !['queued', 'playing'].includes(item.status) && !blockedIds.has(item.videoId) ? [{ action: 'replay', label: 'Play again', values: { requestId: item.requestId } }] : [] })) },
      { title: 'Blocked videos', empty: 'Nothing blocked.', items: status.blocked.map((item) => ({ title: item.title || item.videoId, link: item.link, actions: [{ action: 'unblock', label: 'Unblock', values: { video: item.videoId } }] })) },
    ],
  };
}
async function controlPanel(request, context) {
  if (request?.operation === 'status') return panelView(jukeboxStatus(context, stateFor(await context.state.read())));
  if (request?.operation === 'settings-changed') { await playNext(context); return {}; }
  const action = clean(request?.action, 40); const values = request?.values && typeof request.values === 'object' ? request.values : {};
  if (!PANEL_OPERATIONS.includes(action)) throw new Error('Unknown Village Jukebox control.');
  const operationRequest = action === 'volume' ? { operation: 'volume', volume: Math.max(0, Math.min(100, Number(values.percent))) / 100 }
    : ['block', 'unblock'].includes(action) ? { operation: action, video: clean(values.video, 300), title: clean(values.title, 200) }
      : ['approve', 'play-now', 'play-next', 'remove', 'replay'].includes(action) ? { operation: action, requestId: clean(values.requestId, 100) } : { operation: action };
  const result = await administer(operationRequest, context);
  return panelView(result.status);
}
function serialize(task) { operation = operation.then(task, task); return operation; }
export function resetVillageJukeboxRuntime() { operation = Promise.resolve(); stopped = true; currentLeaseId = undefined; nextTaskId = undefined; unregisterLifecycle = undefined; unregisterMedia = undefined; votes = new Set(); keyTest = undefined; resolutionTasks.clear(); livePlatforms.clear(); }
export { administer as administerVillageJukebox, blockVideo, finishCurrent, manifest, pausePlayback, playNext, processEvent as processVillageJukeboxEvent, resolvedTrack, resumePlayback, settingsFor, stateFor };
export default {
  manifest, required: false,
  async start(context) {
    stopped = false; operation = Promise.resolve(); votes = new Set(); livePlatforms.clear();
    const state = stateFor(await context.state.read());
    if (state.current) { state.queue.unshift(state.current); state.current = undefined; }
    state.elapsedMs = 0; state.currentStartedAt = 0;
    const abandoned = Object.values(state.pending); state.pending = {};
    for (const pending of abandoned) if (pending.rewardPlatform === 'twitch' && pending.rewardId && pending.redemptionId) await settleReward(context, { platform: 'twitch', rewardId: pending.rewardId, redemptionId: pending.redemptionId }, 'refund').catch(() => undefined);
    await context.state.write(state);
    unregisterLifecycle = context.overlay.onLifecycle((event) => {
      if (!event.playbackId.startsWith('jukebox-')) return;
      if (['ended', 'failed', 'timeout'].includes(event.phase)) void serialize(() => finishCurrent(context, event.phase));
    });
    unregisterMedia = context.mediaSlot.onChange((mediaState) => {
      if (!currentLeaseId || mediaState.leaseId === currentLeaseId || mediaState.ownerModuleId === MODULE_ID) return;
      void serialize(async () => { await context.overlay.publish(`${MODULE_ID}.media.stop`, { fade: true }); await finishCurrent(context, 'preempted'); });
    });
    await serialize(() => playNext(context));
  },
  async stop(context) {
    stopped = true; unregisterLifecycle?.(); unregisterMedia?.(); unregisterLifecycle = undefined; unregisterMedia = undefined;
    if (nextTaskId !== undefined) context.schedule.cancel(nextTaskId); nextTaskId = undefined;
    for (const taskId of resolutionTasks.values()) context.schedule.cancel(taskId); resolutionTasks.clear();
    await context.overlay.publish(`${MODULE_ID}.media.stop`, { fade: true }).catch(() => undefined);
    if (currentLeaseId) await context.mediaSlot.release(currentLeaseId).catch(() => undefined); currentLeaseId = undefined;
    await operation.catch(() => undefined);
    const state = stateFor(await context.state.read()); const abandoned = Object.entries(state.pending);
    state.pending = {};
    for (const [requestId, pending] of abandoned) { delete state.cooldowns[pending.requesterKey]; state.processedRequestIds.unshift(requestId); }
    state.processedRequestIds = [...new Set(state.processedRequestIds)].slice(0, 200); await context.state.write(state);
    for (const [, pending] of abandoned) if (pending.rewardPlatform === 'twitch' && pending.rewardId && pending.redemptionId) await settleReward(context, { platform: 'twitch', rewardId: pending.rewardId, redemptionId: pending.redemptionId }, 'refund').catch(() => undefined);
    operation = Promise.resolve(); votes = new Set(); livePlatforms.clear();
  },
  async onEvent(event, context) { await serialize(() => processEvent(event, context)); },
  async administerVillageJukebox(request, context) { return serialize(() => administer(request, context)); },
  async controlPanel(request, context) { const pending = operation.then(() => controlPanel(request, context), () => controlPanel(request, context)); operation = pending.catch(() => undefined); return pending; },
};
