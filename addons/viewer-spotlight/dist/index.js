// Viewer Spotlight is presentation-only. Identity and progression remain in Viewer Foundation;
// observed counters remain in Community Analytics; names and avatars live only in this process queue.
const MODULE_ID = 'thsv.viewer-spotlight';
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok']);
const VIEWER_ID = /^[a-z][a-z0-9-]{0,63}$/u;
const COLOR = /^#[0-9a-f]{6}$/iu;
const REWARD_ACTION_ID = '764a4658-e7fc-4b25-a792-e262759c76b7';
const DISCORD_ACTION_ID = 'e0907527-94ec-466b-a05f-b5b21930ac55';
const FALLBACKS = Object.freeze({ enabled: false, disclosureAccepted: false, commandName: 'card', enabledPlatforms: PLATFORMS, displayMode: 'single',
  rewardRequestsEnabled: false, rewardId: '', kickRewardId: '', pointsRequestCost: 100, refundRejectedRewards: true, discordSnapshotsEnabled: false, discordSnapshotOnReward: false, discordDestinationMode: 'channel', discordWebhookName: 'THSV Viewer Spotlight',
  viewerCooldownMinutes: 15, globalCooldownSeconds: 10, maximumQueueSize: 8, queueExpirySeconds: 120, maximumCardsPerSession: 50, durationSeconds: 10,
  ignoredViewerIds: [], showPlatformBadge: true, showAvatar: true, showPoints: true, showLevel: true, showLatestAchievement: true, showObservedSessions: false, showObservedMessages: false, showObservedCommands: false, showEngagementScore: false, showSeasonRank: false,
  backgroundMode: 'glass', backgroundColor: '#140d1f', backgroundOpacity: 0.94, accentColor: '#7ff5cc', textColor: '#ffffff', fontFamily: 'broadcast' });
const manifest = { contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Viewer Spotlight', version: '4.0.9', minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.9', maximumTestedBridgeVersion: '4.0.9',
  dependencies: ['thsv.viewer-foundation', 'thsv.community-analytics'], requiredCapabilities: [], configurationSchema: 'schemas/config.json', eventSubscriptions: ['command.received', 'reward.redemption', 'stream.online', 'stream.offline'],
  commandsProvided: [{ id: 'viewer-spotlight.card', name: 'card' }], actionsProvided: [{ id: 'viewer-spotlight.settle-reward', name: 'THSV Addon - Viewer Spotlight - Settle Reward' }, { id: 'viewer-spotlight.discord-snapshot', name: 'THSV Addon - Viewer Spotlight - Discord Snapshot' }], browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.viewer-spotlight/', 'data/addons/.state/thsv.viewer-spotlight/'], installationSteps: ['Install and enable Viewer Foundation and Community Analytics first.', 'Install Viewer Spotlight, review public fields, accept the disclosure, and enable it.', 'Create Twitch and Kick Viewer Spotlight rewards, then choose the YouTube and TikTok card command. It registers automatically after restart.', 'Add /overlay/addons/thsv.viewer-spotlight as a browser source.'],
  uninstallationSteps: ['Uninstall the add-on. Its pseudonymous cooldown state remains preserved for a later reinstall.'], migrations: [], healthChecks: [{ id: 'thsv.viewer-spotlight.runtime', description: 'Confirms bounded self-request handling and projection-only overlay publication.' }] };

let operation = Promise.resolve(); let queue = []; let active = false; let activeViewerId; let scheduledDrain; let unregisterDeletion; let stopped = true; const livePlatforms = new Set();
function clean(value, maximum = 256) { return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '')].slice(0, maximum).join(''); }
function integer(value, minimum, maximum, fallback) { return Number.isSafeInteger(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback; }
function settingsFor(context) { const raw = { ...FALLBACKS, ...(context.settings || {}) }; return { ...raw, commandName: clean(raw.commandName, 64).toLowerCase(), enabledPlatforms: new Set(Array.isArray(raw.enabledPlatforms) ? raw.enabledPlatforms.filter((item) => PLATFORMS.includes(item)) : PLATFORMS),
  ignoredViewerIds: new Set(Array.isArray(raw.ignoredViewerIds) ? raw.ignoredViewerIds.filter((item) => VIEWER_ID.test(item)).slice(0, 500) : []), rewardId: clean(raw.rewardId, 256), kickRewardId: clean(raw.kickRewardId, 256), pointsRequestCost: integer(raw.pointsRequestCost, 1, 1000000, 100), discordDestinationMode: raw.discordDestinationMode === 'forum' ? 'forum' : 'channel', discordWebhookName: clean(raw.discordWebhookName, 80) || 'THSV Viewer Spotlight', viewerCooldownMinutes: integer(raw.viewerCooldownMinutes, 1, 1440, 15), globalCooldownSeconds: integer(raw.globalCooldownSeconds, 2, 3600, 10), maximumQueueSize: integer(raw.maximumQueueSize, 1, 20, 8), queueExpirySeconds: integer(raw.queueExpirySeconds, 15, 600, 120), maximumCardsPerSession: integer(raw.maximumCardsPerSession, 1, 500, 50), durationSeconds: integer(raw.durationSeconds, 3, 60, 10), displayMode: ['single', 'fade-carousel', 'credits-scroll'].includes(raw.displayMode) ? raw.displayMode : 'single', backgroundMode: ['glass', 'solid', 'none'].includes(raw.backgroundMode) ? raw.backgroundMode : 'glass', backgroundColor: COLOR.test(raw.backgroundColor) ? raw.backgroundColor : '#140d1f', backgroundOpacity: typeof raw.backgroundOpacity === 'number' ? Math.max(0, Math.min(1, raw.backgroundOpacity)) : 0.94, accentColor: COLOR.test(raw.accentColor) ? raw.accentColor : '#7ff5cc', textColor: COLOR.test(raw.textColor) ? raw.textColor : '#ffffff', fontFamily: ['broadcast', 'display', 'serif', 'mono'].includes(raw.fontFamily) ? raw.fontFamily : 'broadcast' }; }
function sanitizeState(value) { const source = value && typeof value === 'object' ? value : {}; const cooldowns = {}; if (source.cooldowns && typeof source.cooldowns === 'object') for (const [id, at] of Object.entries(source.cooldowns).filter(([id, at]) => VIEWER_ID.test(id) && Number.isSafeInteger(at)).sort((a, b) => b[1] - a[1]).slice(0, 500)) cooldowns[id] = at;
  return { cooldowns, lastShownAt: integer(source.lastShownAt, 0, Number.MAX_SAFE_INTEGER, 0), cardsThisSession: integer(source.cardsThisSession, 0, 500, 0) }; }
function safeAvatar(value) { const url = clean(value, 2048); if (!url.startsWith('https://')) return undefined; try { const parsed = new URL(url); return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : undefined; } catch { return undefined; } }
async function platformIsLive(platform, context) {
  try {
    const session = await context.communityAnalytics.getSessionProjection();
    if (session && typeof session === 'object') {
      const platforms = Array.isArray(session.livePlatforms) ? session.livePlatforms : [];
      return session.active === true && platforms.includes(platform);
    }
  } catch { /* Fall back to lifecycle events when the optional projection is temporarily unavailable. */ }
  return livePlatforms.has(platform);
}
function requestFromEvent(event, viewerId, now) { const avatarUrl = safeAvatar(event.user?.avatarUrl); return { viewerId, platform: event.platform, displayName: clean(event.user?.displayName || event.user?.name, 80) || 'Viewer', ...(avatarUrl ? { avatarUrl } : {}), queuedAt: now }; }
async function enqueueRequest(request, context, settings, state, now) {
  if (settings.ignoredViewerIds.has(request.viewerId)) return { accepted: false, reason: 'ignored-or-unavailable' };
  if (state.cardsThisSession >= settings.maximumCardsPerSession) return { accepted: false, reason: 'session-limit' };
  const previous = state.cooldowns[request.viewerId] || 0; if (previous > 0 && now - previous < settings.viewerCooldownMinutes * 60000) return { accepted: false, reason: 'viewer-cooldown' };
  if (queue.length >= settings.maximumQueueSize) return { accepted: false, reason: 'queue-full' };
  state.cooldowns[request.viewerId] = now; await context.state.write(state); queue.push(request); await drain(context, now);
  return { accepted: true, viewerId: request.viewerId, queued: active || queue.length > 0 };
}
async function settleReward(request, operationName, context) { if (!request?.reward || request.reward.platform !== 'twitch') return; await context.streamerbot.runApprovedAction(REWARD_ACTION_ID, { viewerSpotlightRewardOperation: operationName, viewerSpotlightRewardId: request.reward.rewardId, viewerSpotlightRedemptionId: request.reward.redemptionId }); }
async function refundPoints(request, context, suffix) { if (!request?.points) return; await context.viewerFoundation.mutate({ viewerId: request.points.viewerId, operation: 'refund', amount: request.points.amount, reason: 'Viewer Spotlight request refund', idempotencyKey: `${request.points.idempotencyKey}:${suffix}` }); }
async function refundRequest(request, context, suffix) { await settleReward(request, 'refund', context).catch(() => undefined); await refundPoints(request, context, suffix).catch(() => undefined); }
async function sendDiscordSnapshot(card, displayName, context, settings) { if (!settings.discordSnapshotsEnabled) return; await context.streamerbot.runApprovedAction(DISCORD_ACTION_ID, { viewerSpotlightDiscordMessage: `${card.title}\n${card.text}`.slice(0, 1900), viewerSpotlightDiscordMode: settings.discordDestinationMode, viewerSpotlightDiscordThreadName: `${displayName} viewer spotlight`.slice(0, 100), viewerSpotlightDiscordWebhookName: settings.discordWebhookName }); }
export function buildViewerSpotlightCard(request, foundation, analytics, settings) { const platformLabel = request.platform === 'tiktok' ? 'TikTok' : request.platform === 'youtube' ? 'YouTube' : request.platform[0].toUpperCase() + request.platform.slice(1); const title = `${request.displayName}${settings.showPlatformBadge ? ` • ${platformLabel}` : ''}`; const fields = [];
  if (settings.showPoints) fields.push(`${foundation.points.toLocaleString('en-US')} points`); if (settings.showLevel) fields.push(`Level ${foundation.level}`);
  if (settings.showLatestAchievement && foundation.latestAchievement?.label) fields.push(clean(foundation.latestAchievement.label, 80));
  if (settings.showObservedSessions && analytics.observed) fields.push(`${analytics.sessions.toLocaleString('en-US')} observed sessions`);
  if (settings.showObservedMessages && analytics.observed) fields.push(`${analytics.counters.messages.toLocaleString('en-US')} observed messages`);
  if (settings.showObservedCommands && analytics.observed) fields.push(`${analytics.counters.commands.toLocaleString('en-US')} observed commands`);
  if (settings.showEngagementScore && Number.isSafeInteger(analytics.engagementScore)) fields.push(`${analytics.engagementScore.toLocaleString('en-US')} engagement score`);
  if (settings.showSeasonRank && Number.isSafeInteger(analytics.seasonRank) && Number.isSafeInteger(analytics.rankCohortSize)) fields.push(`#${analytics.seasonRank.toLocaleString('en-US')} of ${analytics.rankCohortSize.toLocaleString('en-US')} this month`);
  return { title, text: fields.join(' • ') || 'Viewer card', ...(settings.showAvatar && request.avatarUrl ? { imageUrl: request.avatarUrl } : {}), durationMs: settings.durationSeconds * 1000, presentationMode: settings.displayMode,
    style: { backgroundMode: settings.backgroundMode, backgroundColor: settings.backgroundColor, backgroundOpacity: settings.backgroundOpacity, accentColor: settings.accentColor, textColor: settings.textColor, fontFamily: settings.fontFamily } };
}
async function armDrain(context, delayMs) { if (scheduledDrain !== undefined || stopped) return; scheduledDrain = context.schedule.after(Math.max(1000, Math.min(86400000, Math.ceil(delayMs))), () => { scheduledDrain = undefined; active = false; activeViewerId = undefined; return serialize(() => drain(context)); }); }
async function drain(context, now = Date.now()) { if (stopped || active) return; const settings = settingsFor(context); const state = sanitizeState(await context.state.read());
  const expired = queue.filter((item) => now - item.queuedAt > settings.queueExpirySeconds * 1000); queue = queue.filter((item) => now - item.queuedAt <= settings.queueExpirySeconds * 1000); for (const item of expired) if (item.points || settings.refundRejectedRewards) await refundRequest(item, context, 'expired');
  if (!queue.length || state.cardsThisSession >= settings.maximumCardsPerSession) { if (state.cardsThisSession >= settings.maximumCardsPerSession) { const rejected = queue; queue = []; for (const item of rejected) if (item.points || settings.refundRejectedRewards) await refundRequest(item, context, 'session-limit'); } return; }
  const remainingGlobal = state.lastShownAt > 0 ? state.lastShownAt + settings.globalCooldownSeconds * 1000 - now : 0; if (remainingGlobal > 0) return armDrain(context, remainingGlobal);
  const request = queue.shift(); if (!request) return; const foundation = await context.viewerFoundation.getProjection({ viewerId: request.viewerId }); const analytics = await context.communityAnalytics.getViewerProjection(request.viewerId);
  if (!foundation || !analytics.observed || settings.ignoredViewerIds.has(request.viewerId)) { if (request.points || settings.refundRejectedRewards) await refundRequest(request, context, 'projection-rejected'); return drain(context, now); }
  const card = buildViewerSpotlightCard(request, foundation, analytics, settings);
  try { await context.overlay.publish(`${MODULE_ID}.card.show`, card, { lane: 'foreground' }); } catch (error) { if (request.points || settings.refundRejectedRewards) await refundRequest(request, context, 'overlay-failed'); throw error; }
  if (request.reward) { try { await settleReward(request, 'fulfill', context); } catch { if (settings.refundRejectedRewards) await settleReward(request, 'refund', context).catch(() => undefined); } }
  if (request.discord === true) await sendDiscordSnapshot(card, request.displayName, context, settings).catch(() => undefined);
  state.lastShownAt = now; state.cardsThisSession += 1; await context.state.write(state); active = true; activeViewerId = request.viewerId; await armDrain(context, settings.durationSeconds * 1000 + 1000); }
export async function processViewerSpotlightEvent(event, context, now = Date.now()) { const settings = settingsFor(context); const state = sanitizeState(await context.state.read());
  if (event.eventType === 'stream.online' && event.metadata?.simulated !== true) { const wasOffline = livePlatforms.size === 0; livePlatforms.add(event.platform); if (wasOffline) { state.cardsThisSession = 0; await context.state.write(state); } return { session: 'active' }; }
  if (event.eventType === 'stream.offline' && event.metadata?.simulated !== true) { livePlatforms.delete(event.platform); if (livePlatforms.size === 0) { const rejected = queue; queue = []; for (const item of rejected) if (item.points || settings.refundRejectedRewards) await refundRequest(item, context, 'stream-ended'); active = false; activeViewerId = undefined; if (scheduledDrain !== undefined) context.schedule.cancel(scheduledDrain); scheduledDrain = undefined; await context.overlay.publish(`${MODULE_ID}.card.hide`, {}); } return { session: livePlatforms.size ? 'active' : 'closed' }; }
  if (!settings.enabled || !settings.disclosureAccepted || event.metadata?.simulated === true || event.user?.actorType !== 'human' || !settings.enabledPlatforms.has(event.platform)) return undefined;
  if (event.eventType === 'reward.redemption') {
    const configuredRewardId = event.platform === 'twitch' ? settings.rewardId : event.platform === 'kick' ? settings.kickRewardId : '';
    if (!settings.rewardRequestsEnabled || !configuredRewardId || !['twitch', 'kick'].includes(event.platform)
      || event.payload?.verifiedTransport !== true || clean(event.payload?.rewardId, 256) !== configuredRewardId) return undefined;
    const redemptionId = clean(event.payload?.redemptionId, 256); const userId = clean(event.user?.id, 256); if (!redemptionId || !userId) return { accepted: false, reason: 'stable-reward-identifiers-required' };
    const reward = { platform: event.platform, rewardId: configuredRewardId, redemptionId };
    if (!await platformIsLive(event.platform, context)) { if (settings.refundRejectedRewards) await refundRequest({ reward }, context, 'platform-offline'); return { accepted: false, reason: 'platform-offline' }; }
    const foundation = await context.viewerFoundation.getProjection({ platform: event.platform, userId });
    if (!foundation) { if (settings.refundRejectedRewards) await refundRequest({ reward }, context, 'viewer-unavailable'); return { accepted: false, reason: 'viewer-unavailable' }; }
    const request = { ...requestFromEvent(event, foundation.viewerId, now), reward, discord: settings.discordSnapshotOnReward === true };
    try { const result = await enqueueRequest(request, context, settings, state, now); if (!result.accepted && settings.refundRejectedRewards) await refundRequest(request, context, 'queue-rejected'); return result; }
    catch (error) { if (settings.refundRejectedRewards) await refundRequest(request, context, 'enqueue-failed'); throw error; }
  }
  if (event.eventType !== 'command.received' || clean(event.payload?.command, 64).toLowerCase() !== settings.commandName) return undefined;
  if (Array.isArray(event.payload?.arguments) && event.payload.arguments.length > 0) return { accepted: false, reason: 'self-only' }; const userId = clean(event.user?.id, 256); if (!userId) return { accepted: false, reason: 'stable-user-id-required' };
  if (!['youtube', 'tiktok'].includes(event.platform)) return { accepted: false, reason: 'native-reward-required' };
  if (!await platformIsLive(event.platform, context)) return { accepted: false, reason: 'platform-offline' };
  const foundation = await context.viewerFoundation.getProjection({ platform: event.platform, userId }); if (!foundation) return { accepted: false, reason: 'ignored-or-unavailable' };
  const stableEventId = clean(event.eventId || event.source?.eventId, 100); if (!stableEventId) return { accepted: false, reason: 'stable-event-id-required' };
  const idempotencyKey = `viewer-spotlight:${stableEventId}`;
  try { await context.viewerFoundation.mutate({ viewerId: foundation.viewerId, operation: 'spend', amount: settings.pointsRequestCost, reason: 'Viewer Spotlight card request', idempotencyKey }); }
  catch { return { accepted: false, reason: 'insufficient-points' }; }
  const request = { ...requestFromEvent(event, foundation.viewerId, now), points: { viewerId: foundation.viewerId, amount: settings.pointsRequestCost, idempotencyKey } };
  try { const result = await enqueueRequest(request, context, settings, state, now); if (!result.accepted) await refundRequest(request, context, 'queue-rejected'); return result; }
  catch (error) { await refundRequest(request, context, 'enqueue-failed'); throw error; }
}
export async function administerViewerSpotlight(request, context, now = Date.now()) {
  const settings = settingsFor(context); const state = sanitizeState(await context.state.read());
  if (request.operation === 'status') return { operation: 'status', enabled: settings.enabled === true, disclosureAccepted: settings.disclosureAccepted === true, displayMode: settings.displayMode, activeCard: active, queuedRequests: queue.length, cardsThisSession: state.cardsThisSession, maximumCardsPerSession: settings.maximumCardsPerSession };
  if (!settings.enabled || !settings.disclosureAccepted) return { operation: 'display', accepted: false, reason: 'disabled-or-disclosure-required' };
  if (request.operation === 'stream-score') {
    if (request.approvedByCreator !== true) return { operation: 'stream-score', accepted: false, reason: 'creator-approval-required' };
    const session = await context.communityAnalytics.getSessionProjection(); const counters = session.counters || {};
    const interactions = ['messages', 'commands', 'follows', 'subscriptions', 'memberships', 'giftSubscriptions', 'gifts', 'cheers', 'superChats', 'raids', 'rewardRedemptions'].reduce((total, key) => total + (Number.isSafeInteger(counters[key]) ? counters[key] : 0), 0);
    await context.overlay.publish(`${MODULE_ID}.card.show`, { title: 'Stream Score', text: `${session.uniqueViewers.toLocaleString('en-US')} observed viewers • ${interactions.toLocaleString('en-US')} observed interactions`, durationMs: settings.durationSeconds * 1000, presentationMode: settings.displayMode, style: { backgroundMode: settings.backgroundMode, backgroundColor: settings.backgroundColor, backgroundOpacity: settings.backgroundOpacity, accentColor: settings.accentColor, textColor: settings.textColor, fontFamily: settings.fontFamily } }, { lane: 'foreground' });
    return { operation: 'stream-score', accepted: true, uniqueViewers: session.uniqueViewers, interactions, approximate: session.approximate };
  }
  const platform = clean(request.platform, 64); const userId = clean(request.userId, 256); const displayName = clean(request.displayName, 80); if (!PLATFORMS.includes(platform) || !userId || !displayName || request.approvedByCreator !== true) return { operation: 'display', accepted: false, reason: 'invalid-request' };
  const foundation = await context.viewerFoundation.getProjection({ platform, userId }); if (!foundation) return { operation: 'display', accepted: false, reason: 'viewer-unavailable' };
  const analytics = await context.communityAnalytics.getViewerProjection(foundation.viewerId); if (!analytics.observed) return { operation: 'display', accepted: false, reason: 'viewer-unobserved' };
  const avatarUrl = safeAvatar(request.avatarUrl); const result = await enqueueRequest({ viewerId: foundation.viewerId, platform, displayName, ...(avatarUrl ? { avatarUrl } : {}), queuedAt: now, discord: request.sendDiscord === true }, context, settings, state, now);
  return { operation: 'display', ...result };
}
export async function purgeViewerSpotlightViewer(viewerId, context) {
  const id = clean(viewerId, 64); if (!VIEWER_ID.test(id)) return false; const state = sanitizeState(await context.state.read());
  const queuedBefore = queue.length; queue = queue.filter((request) => request.viewerId !== id); const hadCooldown = Object.hasOwn(state.cooldowns, id); delete state.cooldowns[id];
  const wasActive = activeViewerId === id; if (wasActive) { active = false; activeViewerId = undefined; if (scheduledDrain !== undefined) context.schedule.cancel(scheduledDrain); scheduledDrain = undefined; await context.overlay.publish(`${MODULE_ID}.card.hide`, {}); }
  if (hadCooldown) await context.state.write(state); if (wasActive || queue.length < queuedBefore) await drain(context); return hadCooldown || wasActive || queue.length < queuedBefore;
}
function serialize(task) { operation = operation.then(task, task); return operation; }
export function resetViewerSpotlightRuntime() { operation = Promise.resolve(); queue = []; active = false; activeViewerId = undefined; scheduledDrain = undefined; unregisterDeletion = undefined; stopped = true; livePlatforms.clear(); }
export { sanitizeState as sanitizeViewerSpotlightState };
export default { manifest, required: false, async start(context) { operation = Promise.resolve(); queue = []; active = false; activeViewerId = undefined; scheduledDrain = undefined; stopped = false; livePlatforms.clear(); await context.state.write(sanitizeState(await context.state.read())); unregisterDeletion = context.viewerFoundation.onDeleted?.((viewerId) => serialize(() => purgeViewerSpotlightViewer(viewerId, context))); await serialize(() => drain(context)); }, async stop(context) { stopped = true; unregisterDeletion?.(); unregisterDeletion = undefined; if (scheduledDrain !== undefined) context.schedule.cancel(scheduledDrain); scheduledDrain = undefined; await operation.catch(() => undefined); const rejected = queue; queue = []; const settings = settingsFor(context); for (const item of rejected) if (item.points || settings.refundRejectedRewards) await refundRequest(item, context, 'stopped'); active = false; activeViewerId = undefined; livePlatforms.clear(); operation = Promise.resolve(); }, async onEvent(event, context) { await serialize(() => processViewerSpotlightEvent(event, context)); }, async administerViewerSpotlight(request, context) { return serialize(() => administerViewerSpotlight(request, context)); } };
