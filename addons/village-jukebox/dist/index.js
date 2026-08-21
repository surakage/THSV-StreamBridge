// Village Jukebox owns a bounded YouTube request queue. Streamer.bot resolves API metadata;
// StreamBridge owns fairness, point spending, playback order, and the shared browser overlay.
const MODULE_ID = 'thsv.village-jukebox';
const RESOLVE_ACTION_ID = '0f16105e-7c92-47ad-a61b-c6d1b934fdf0';
const SETTLE_REWARD_ACTION_ID = 'fa5b3b6d-a639-48a6-9999-7e5b11f31590';
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok']);
const COLORS = /^#[0-9a-f]{6}$/iu;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/u;
const FALLBACKS = Object.freeze({
  enabled: false, rightsAcknowledged: false, requestCommand: 'sr', queueCommand: 'songqueue', whenCommand: 'when', wrongSongCommand: 'wrongsong', voteSkipCommand: 'voteskip', moderatorSkipCommand: 'skip', allowTextSearch: true, dailyTextSearchLimit: 50,
  enabledPlatforms: PLATFORMS, pointsPlatforms: ['youtube', 'tiktok'], pointsCost: 100, rewardRequestsEnabled: false, twitchRewardId: '', kickRewardId: '',
  maximumQueueSize: 25, maximumRequestsPerViewer: 1, viewerCooldownSeconds: 60, maximumTrackMinutes: 8, recentNoRepeatCount: 20, voteSkipRequired: 5,
  secondsBetweenTracks: 4, announceNowPlaying: true, volume: 0.7, backgroundColor: '#101820', accentColor: '#7ff5cc', textColor: '#ffffff', fontFamily: 'broadcast',
});
const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Village Jukebox', version: '4.0.2',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.2', maximumTestedBridgeVersion: '4.0.2',
  dependencies: ['thsv.viewer-foundation'], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: ['command.received', 'reward.redemption', 'addon.thsv.village-jukebox.track-resolved', 'stream.online', 'stream.offline'],
  commandsProvided: [
    { id: 'village-jukebox.request', name: 'sr' }, { id: 'village-jukebox.queue', name: 'songqueue' }, { id: 'village-jukebox.when', name: 'when' },
    { id: 'village-jukebox.wrongsong', name: 'wrongsong' }, { id: 'village-jukebox.voteskip', name: 'voteskip' }, { id: 'village-jukebox.skip', name: 'skip' },
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
  uninstallationSteps: ['Uninstalling preserves the bounded queue, cooldowns, and recently played IDs for a later reinstall.'], migrations: [],
  healthChecks: [{ id: 'thsv.village-jukebox.runtime', description: 'Confirms bounded resolution, fair persistent queueing, serialized media playback, and source-routed chat responses.' }],
};

let operation = Promise.resolve();
let stopped = true;
let currentLeaseId;
let nextTaskId;
let unregisterLifecycle;
let unregisterMedia;
let votes = new Set();
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
    allowTextSearch: raw.allowTextSearch !== false, dailyTextSearchLimit: integer(raw.dailyTextSearchLimit, 1, 100, 50),
    enabledPlatforms: platformSet(raw.enabledPlatforms, PLATFORMS), pointsPlatforms: platformSet(raw.pointsPlatforms, ['youtube', 'tiktok']), pointsCost: integer(raw.pointsCost, 1, 1_000_000, 100),
    rewardRequestsEnabled: raw.rewardRequestsEnabled === true, twitchRewardId: clean(raw.twitchRewardId, 256), kickRewardId: clean(raw.kickRewardId, 256),
    maximumQueueSize: integer(raw.maximumQueueSize, 1, 50, 25), maximumRequestsPerViewer: integer(raw.maximumRequestsPerViewer, 1, 5, 1), viewerCooldownSeconds: integer(raw.viewerCooldownSeconds, 0, 86_400, 60),
    maximumTrackMinutes: integer(raw.maximumTrackMinutes, 1, 10, 8), recentNoRepeatCount: integer(raw.recentNoRepeatCount, 0, 100, 20), voteSkipRequired: integer(raw.voteSkipRequired, 1, 100, 5),
    secondsBetweenTracks: integer(raw.secondsBetweenTracks, 1, 60, 4), announceNowPlaying: raw.announceNowPlaying === true, volume: number(raw.volume, 0, 1, 0.7),
    backgroundColor: COLORS.test(raw.backgroundColor) ? raw.backgroundColor : '#101820', accentColor: COLORS.test(raw.accentColor) ? raw.accentColor : '#7ff5cc',
    textColor: COLORS.test(raw.textColor) ? raw.textColor : '#ffffff', fontFamily: ['broadcast', 'display', 'serif', 'mono'].includes(raw.fontFamily) ? raw.fontFamily : 'broadcast',
  };
}
function safeTrack(value) {
  if (!value || typeof value !== 'object') return undefined;
  const id = clean(value.id, 20); const title = clean(value.title, 200); const channel = clean(value.channel, 120); const thumbnailUrl = clean(value.thumbnailUrl, 2048);
  const durationSeconds = Number.isSafeInteger(value.durationSeconds) && value.durationSeconds >= 1 && value.durationSeconds <= 600 ? value.durationSeconds : 0; const platform = clean(value.platform, 20); const requesterKey = clean(value.requesterKey, 300);
  const requesterName = clean(value.requesterName, 80); const requestEventId = clean(value.requestEventId, 256); const requestId = clean(value.requestId, 100);
  if (!YOUTUBE_ID.test(id) || !title || !channel || !PLATFORMS.includes(platform) || !requesterKey || !requesterName || !requestEventId || !requestId || durationSeconds < 1) return undefined;
  const points = value.points && typeof value.points === 'object' && clean(value.points.viewerId, 64) && Number.isSafeInteger(value.points.amount) && value.points.amount >= 1 && value.points.amount <= 1_000_000 && clean(value.points.idempotencyKey, 128)
    ? { viewerId: clean(value.points.viewerId, 64), amount: value.points.amount, idempotencyKey: clean(value.points.idempotencyKey, 128) }
    : undefined;
  const reward = value.reward && typeof value.reward === 'object' && ['twitch', 'kick'].includes(clean(value.reward.platform, 20)) && clean(value.reward.rewardId, 256) && clean(value.reward.redemptionId, 256)
    ? { platform: clean(value.reward.platform, 20), rewardId: clean(value.reward.rewardId, 256), redemptionId: clean(value.reward.redemptionId, 256) }
    : undefined;
  if ((value.points !== undefined && !points) || (value.reward !== undefined && !reward)) return undefined;
  return { id, title, channel, thumbnailUrl: thumbnailUrl.startsWith('https://') ? thumbnailUrl : '', durationSeconds, platform, requesterKey, requesterName, requestEventId, requestId, ...(points ? { points } : {}), ...(reward ? { reward } : {}) };
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
  return { queue, ...(current ? { current } : {}), recentIds, cooldowns, pending, processedRequestIds: processed, searchDay, searchCount };
}
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
async function resolvedTrack(event, context, settings) {
  const payload = event.payload || {}; const requestId = clean(payload.requestId, 100); const state = stateFor(await context.state.read());
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
  if (!YOUTUBE_ID.test(id) || durationSeconds < 1 || durationSeconds > settings.maximumTrackMinutes * 60 || state.recentIds.slice(0, settings.recentNoRepeatCount).includes(id) || state.queue.some((track) => track.id === id) || state.current?.id === id) {
    await context.state.write(state); await settleReward(context, reward, 'refund').catch(() => undefined);
    const reason = durationSeconds > settings.maximumTrackMinutes * 60 ? `Tracks must be ${settings.maximumTrackMinutes} minutes or shorter.` : 'That track is already queued or was played recently.';
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
  const track = safeTrack({ id, title: payload.title, channel: payload.channel, thumbnailUrl: payload.thumbnailUrl, durationSeconds, platform, requesterKey: pending.requesterKey, requesterName: pending.requesterName, requestEventId: pending.requestEventId, requestId, ...(points ? { points } : {}), ...(reward ? { reward } : {}) });
  if (!track) { if (points) await context.viewerFoundation.mutate({ viewerId: points.viewerId, operation: 'refund', amount: points.amount, reason: 'Village Jukebox invalid result refund', idempotencyKey: `${points.idempotencyKey}:invalid` }).catch(() => undefined); await settleReward(context, reward, 'refund').catch(() => undefined); await context.state.write(state); return { accepted: false, reason: 'invalid-result' }; }
  state.queue.push(track); await context.state.write(state); await settleReward(context, reward, 'fulfill').catch(() => undefined);
  await say(context, platform, `Added ${track.title} by ${track.channel} to Village Jukebox. Queue position: ${state.queue.length}.`);
  await playNext(context); return { accepted: true, queued: true, trackId: track.id };
}
async function playNext(context) {
  if (stopped || nextTaskId !== undefined) return;
  const settings = settingsFor(context); if (!settings.enabled || !settings.rightsAcknowledged) return;
  const state = stateFor(await context.state.read()); if (state.current || state.queue.length === 0) return;
  const candidate = state.queue[0]; const durationMs = Math.min(600_000, candidate.durationSeconds * 1000 + 15_000);
  const lease = await context.mediaSlot.acquire({ durationMs, priority: 25 });
  if (!lease.acquired) { nextTaskId = context.schedule.after(5_000, () => { nextTaskId = undefined; return serialize(() => playNext(context)); }); return; }
  currentLeaseId = lease.leaseId; state.current = state.queue.shift(); await context.state.write(state); votes = new Set();
  const track = state.current; const playbackId = `jukebox-${track.requestId}`;
  try {
    await context.overlay.publish(`${MODULE_ID}.media.play`, {
      embedUrl: `https://www.youtube.com/embed/${track.id}`, playbackId, durationMs: track.durationSeconds * 1000, muted: false, volume: settings.volume,
      title: `${track.title} — ${track.channel} • requested by ${track.requesterName}`,
      style: { backgroundColor: settings.backgroundColor, accentColor: settings.accentColor, textColor: settings.textColor, fontFamily: settings.fontFamily },
    }, { lane: 'media' });
    if (settings.announceNowPlaying) await say(context, track.platform, `Now playing: ${track.title} by ${track.channel}, requested by ${track.requesterName}.`);
  } catch (error) {
    state.current = undefined; state.queue.unshift(track); await context.state.write(state); await context.mediaSlot.release(currentLeaseId).catch(() => undefined); currentLeaseId = undefined;
    nextTaskId = context.schedule.after(5_000, () => { nextTaskId = undefined; return serialize(() => playNext(context)); });
  }
}
async function finishCurrent(context, reason) {
  const state = stateFor(await context.state.read()); const track = state.current; if (!track) return;
  state.current = undefined; state.recentIds.unshift(track.id); state.recentIds = [...new Set(state.recentIds)].slice(0, 100); await context.state.write(state); votes = new Set();
  if (currentLeaseId) await context.mediaSlot.release(currentLeaseId).catch(() => undefined); currentLeaseId = undefined;
  if (reason === 'failed' || reason === 'timeout') await say(context, track.platform, `Village Jukebox skipped ${track.title} because playback failed.`);
  const settings = settingsFor(context); nextTaskId = context.schedule.after(settings.secondsBetweenTracks * 1000, () => { nextTaskId = undefined; return serialize(() => playNext(context)); });
}
async function handleCommand(event, context, settings) {
  const name = clean(event.payload?.command, 40).toLowerCase(); const state = stateFor(await context.state.read()); const key = eventUserKey(event);
  if (name === settings.requestCommand) return beginResolution(event, context, settings, queryFrom(event));
  if (name === settings.queueCommand) { await say(context, event.platform, state.current ? `Now playing ${state.current.title}. ${state.queue.length} track${state.queue.length === 1 ? '' : 's'} queued.` : `${state.queue.length} track${state.queue.length === 1 ? '' : 's'} queued.`); return { accepted: true }; }
  if (name === settings.whenCommand) { const position = state.queue.findIndex((track) => track.requesterKey === key); await say(context, event.platform, position < 0 ? 'You do not have a queued Village Jukebox request.' : `Your next song is number ${position + 1} in the queue.`); return { accepted: position >= 0 }; }
  if (name === settings.wrongSongCommand) {
    const index = state.queue.map((track) => track.requesterKey).lastIndexOf(key); if (index < 0) { await say(context, event.platform, 'You do not have a removable queued request.'); return { accepted: false }; }
    const [removed] = state.queue.splice(index, 1); await context.state.write(state); await refundTrack(context, removed, 'viewer-removed', false);
    await say(context, event.platform, removed.reward?.platform === 'twitch' ? `Removed ${removed.title} from the queue. The already-fulfilled Twitch reward cannot be refunded.` : `Removed ${removed.title} from the queue. Viewer Foundation points were refunded when applicable.`); return { accepted: true };
  }
  if (name === settings.voteSkipCommand) {
    if (!state.current || !key) return { accepted: false }; votes.add(key); const remaining = Math.max(0, settings.voteSkipRequired - votes.size);
    if (remaining > 0) { await say(context, event.platform, `${remaining} more unique vote${remaining === 1 ? '' : 's'} needed to skip.`); return { accepted: true, remaining }; }
    await context.overlay.publish(`${MODULE_ID}.media.stop`, { fade: true }); await finishCurrent(context, 'vote-skip'); return { accepted: true, skipped: true };
  }
  if (name === settings.moderatorSkipCommand && isModerator(event)) { await context.overlay.publish(`${MODULE_ID}.media.stop`, { fade: true }); await finishCurrent(context, 'moderator-skip'); return { accepted: true, skipped: true }; }
  return undefined;
}
async function processEvent(event, context) {
  const settings = settingsFor(context);
  if (event.eventType === 'stream.online') { livePlatforms.add(event.platform); return; }
  if (event.eventType === 'stream.offline') { livePlatforms.delete(event.platform); return; }
  if (event.eventType === `addon.${MODULE_ID}.track-resolved`) return resolvedTrack(event, context, settings);
  if (!settings.enabled || !settings.rightsAcknowledged || event.metadata?.simulated === true || event.user?.actorType !== 'human' || !settings.enabledPlatforms.has(event.platform)) return;
  if (event.eventType === 'command.received') return handleCommand(event, context, settings);
  if (event.eventType !== 'reward.redemption' || !settings.rewardRequestsEnabled || !['twitch', 'kick'].includes(event.platform) || event.payload?.verifiedTransport !== true) return;
  const configuredId = event.platform === 'twitch' ? settings.twitchRewardId : settings.kickRewardId;
  const rewardId = clean(event.payload?.rewardId, 256); const redemptionId = clean(event.payload?.redemptionId, 256); const query = clean(event.payload?.input, 300);
  if (!configuredId || rewardId !== configuredId || !redemptionId) return;
  return beginResolution(event, context, settings, query, { platform: event.platform, rewardId, redemptionId });
}
function serialize(task) { operation = operation.then(task, task); return operation; }
export function resetVillageJukeboxRuntime() { operation = Promise.resolve(); stopped = true; currentLeaseId = undefined; nextTaskId = undefined; unregisterLifecycle = undefined; unregisterMedia = undefined; votes = new Set(); resolutionTasks.clear(); livePlatforms.clear(); }
export { finishCurrent, manifest, playNext, processEvent as processVillageJukeboxEvent, resolvedTrack, settingsFor, stateFor };
export default {
  manifest, required: false,
  async start(context) {
    stopped = false; operation = Promise.resolve(); votes = new Set(); livePlatforms.clear();
    const state = stateFor(await context.state.read());
    if (state.current) { state.queue.unshift(state.current); state.current = undefined; }
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
};
