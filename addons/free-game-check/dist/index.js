// Free Game Check performs one bounded GamerPower lookup only after a valid viewer redemption.
// Twitch and Kick use native rewards; YouTube and TikTok use Viewer Foundation points.
const MODULE_ID = 'thsv.free-game-check';
const REFRESH_ACTION_ID = '1f8e660b-3ee9-4a9a-9390-68d7e5257c11';
const DISCORD_ACTION_ID = '7e9b4db8-5d33-4ed2-a8d1-11f8d04ab662';
const SETTLE_REWARD_ACTION_ID = 'd12e5b98-4dc5-5f0c-b54d-85cfe3a4f7b2';
const RESULTS_EVENT = 'addon.thsv.free-game-check.results';
const DISCORD_RESULT_EVENT = 'addon.thsv.free-game-check.discord-result';
const DEFAULT_DISCORD_INVITE_URL = 'https://discord.gg/PKHzdhppMu';
const LIVE_PLATFORMS = ['twitch', 'youtube', 'kick', 'tiktok'];
let stopped = true;
let operation = Promise.resolve();
let activeRequest;
let requestTimeoutId;
const pendingDiscord = new Map();
const livePlatforms = new Set();

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Free Game Check', version: '4.0.8',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.8', maximumTestedBridgeVersion: '4.0.8', dependencies: ['thsv.viewer-foundation'], requiredCapabilities: [],
  configurationSchema: 'schemas/config.json',
  eventSubscriptions: [RESULTS_EVENT, DISCORD_RESULT_EVENT, 'reward.redemption', 'command.received', 'chat.message', 'stream.online', 'stream.offline'],
  commandsProvided: [{ id: 'free-game-check.command', name: 'freegames' }],
  actionsProvided: [
    { id: 'free-game-check.refresh', name: 'THSV Addon - Free Game Check - Refresh' },
    { id: 'free-game-check.discord', name: 'THSV Addon - Free Game Check - Discord Deliver' },
    { id: 'free-game-check.settle-reward', name: 'THSV Addon - Free Game Check - Settle Twitch Reward' },
  ],
  browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.free-game-check/', 'data/addons/.state/thsv.free-game-check/'],
  installationSteps: [
    'Install and enable Viewer Foundation before using YouTube or TikTok points.',
    'Import the Free Game Check Streamer.bot package and leave all three actions triggerless.',
    'Approve Refresh, approve Settle Twitch Reward for Twitch refunds, and approve Discord Deliver only when Discord posting is enabled.',
    'Create Twitch and Kick Free Games rewards and paste their stable IDs. Keep one Reward Redemption trigger on each existing platform intake.',
    'Choose the YouTube and TikTok command and points cost. It registers automatically after restart.',
  ],
  uninstallationSteps: ['Uninstalling preserves only bounded request, giveaway, cooldown, and delivery status.'], migrations: [],
  healthChecks: [{ id: 'thsv.free-game-check.runtime', description: 'Confirms redemption-only giveaway lookup, source-chat guidance, and supported refund paths are available.' }],
};

function text(value, max = 500) { return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '')].slice(0, max).join(''); }
function integer(value, min, max, fallback) { return Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback; }
function safeDiscordInvite(value) { const candidate = text(value, 160); if (!candidate) return ''; try { const parsed = new URL(candidate); const host = parsed.hostname.toLowerCase(); if (parsed.protocol !== 'https:' || !['discord.gg', 'discord.com'].includes(host)) return ''; if (host === 'discord.com' && !parsed.pathname.startsWith('/invite/')) return ''; return parsed.href; } catch { return ''; } }
function settingsFor(context) {
  const raw = context.settings || {};
  return {
    enabled: raw.enabled === true,
    rewardId: text(raw.rewardId, 256), kickRewardId: text(raw.kickRewardId, 256),
    commandName: text(raw.commandName, 64).toLowerCase() || 'freegames', pointsCost: integer(raw.pointsCost, 1, 1000000, 100),
    discordInviteUrl: safeDiscordInvite(raw.discordInviteUrl),
    guideMessage: text(raw.guideMessage, 350) || '{name}, new free games are available. View and redeem them in Discord: {discord}',
    noGamesMessage: text(raw.noGamesMessage, 350) || '{name}, no free games are available right now.',
    unavailableMessage: text(raw.unavailableMessage, 350) || '{name}, I could not check the free-game list right now.',
    maximumPostsPerRefresh: integer(raw.maximumPostsPerRefresh, 1, 5, 2),
    discordEnabled: raw.discordEnabled === true,
    discordMode: raw.discordDestinationMode === 'forum' ? 'forum' : 'channel',
    discordThreadId: /^[0-9]{5,30}$/u.test(text(raw.discordThreadId, 30)) ? text(raw.discordThreadId, 30) : '',
    discordThreadName: text(raw.discordThreadName, 100) || 'Free Game - {title}',
    discordWebhookName: text(raw.discordWebhookName, 80) || 'THSV Free Game Check',
  };
}
function validGame(raw) { const id = text(raw?.id, 80); const title = text(raw?.title, 160); const url = text(raw?.url, 500); let parsed; try { parsed = new URL(url); } catch { return undefined; } if (!id || !title || parsed.protocol !== 'https:' || !['gamerpower.com', 'www.gamerpower.com'].includes(parsed.hostname.toLowerCase())) return undefined; return { id, title, url: parsed.href, platforms: text(raw?.platforms, 120), endDate: text(raw?.endDate, 80) }; }
function stateFor(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const seenIds = Array.isArray(value.seenIds) ? value.seenIds.map((item) => text(item, 80)).filter(Boolean).slice(-1000) : [];
  const discordDeliveredIds = Array.isArray(value.discordDeliveredIds) ? value.discordDeliveredIds.map((item) => text(item, 80)).filter(Boolean).slice(-1000) : [...seenIds];
  const processedRequestIds = Array.isArray(value.processedRequestIds) ? value.processedRequestIds.map((item) => text(item, 256)).filter(Boolean).slice(-1000) : [];
  const delivery = value.lastDiscordDelivery && typeof value.lastDiscordDelivery === 'object' ? value.lastDiscordDelivery : undefined;
  return {
    initialized: value.initialized === true, seenIds, discordDeliveredIds, processedRequestIds,
    lastRefreshAt: text(value.lastRefreshAt, 40), lastError: text(value.lastError, 180),
    ...(delivery ? { lastDiscordDelivery: { at: text(delivery.at, 40), success: delivery.success === true, messageId: text(delivery.messageId, 100), threadId: text(delivery.threadId, 100), error: text(delivery.error, 180) } } : {}),
  };
}
function format(template, values) { let result = text(template, 700); for (const [key, value] of Object.entries(values)) result = result.replaceAll(`{${key}}`, text(String(value), 200)); return text(result, 500); }
async function sendSource(context, platform, message) { if (!message || !livePlatforms.has(platform)) return; try { await context.chat.send({ message, routing: 'source', sourcePlatform: platform, overflow: 'truncate' }); } catch { /* Source chat delivery is best effort. */ } }
async function settleTwitch(context, request, settlement) { if (request?.reward?.platform !== 'twitch') return; await context.streamerbot.runApprovedAction(SETTLE_REWARD_ACTION_ID, { freeGameRewardOperation: settlement, freeGameRewardId: request.reward.rewardId, freeGameRedemptionId: request.reward.redemptionId }); }
async function refundRequest(context, request, suffix) {
  if (!request) return;
  if (request.points) await context.viewerFoundation.mutate({ viewerId: request.points.viewerId, operation: 'refund', amount: request.points.amount, reason: 'Free Game Check refund', idempotencyKey: `${request.points.idempotencyKey}:${suffix}` }).catch(() => undefined);
  await settleTwitch(context, request, 'refund').catch(() => undefined);
}
function matchingRequest(event, settings) {
  const configuredReward = event.platform === 'twitch' ? settings.rewardId : event.platform === 'kick' ? settings.kickRewardId : '';
  const reward = event.eventType === 'reward.redemption' && ['twitch', 'kick'].includes(event.platform) && event.payload?.verifiedTransport === true && configuredReward && text(event.payload?.rewardId, 256) === configuredReward;
  const command = text(event.payload?.command, 64).toLowerCase();
  const chat = text(event.payload?.message, 520).toLowerCase();
  const phrase = `!${settings.commandName}`;
  const points = ['youtube', 'tiktok'].includes(event.platform) && ((event.eventType === 'command.received' && command === settings.commandName) || (event.eventType === 'chat.message' && (chat === phrase || chat.startsWith(`${phrase} `))));
  return reward ? 'reward' : points ? 'points' : '';
}
async function expireRequest(context, requestId) {
  if (!activeRequest || activeRequest.requestId !== requestId) return;
  const request = activeRequest; activeRequest = undefined; requestTimeoutId = undefined;
  await refundRequest(context, request, 'timeout');
  const suffix = request.points || request.reward?.platform === 'twitch' ? ' Your points were refunded.' : '';
  await sendSource(context, request.platform, `${format(settingsFor(context).unavailableMessage, { name: request.displayName })}${suffix}`);
}
async function beginRequest(event, context) {
  const settings = settingsFor(context); const kind = matchingRequest(event, settings);
  if (!settings.enabled || !kind || event.metadata?.simulated === true || !livePlatforms.has(event.platform)) return;
  const providerUserId = text(event.user?.id, 240); const displayName = text(event.user?.displayName || event.user?.name, 100) || 'Villager';
  const requestKey = text(kind === 'reward' ? (event.payload?.redemptionId || event.source?.eventId || event.eventId) : event.eventId, 256);
  if (!providerUserId || !requestKey) return;
  const state = stateFor(await context.state.read());
  if (state.processedRequestIds.includes(requestKey)) return;
  const reward = kind === 'reward' ? { platform: event.platform, rewardId: text(event.payload?.rewardId, 256), redemptionId: text(event.payload?.redemptionId || event.source?.eventId || event.eventId, 256) } : undefined;
  let points;
  if (kind === 'points') {
    const projection = await context.viewerFoundation.getProjection({ platform: event.platform, userId: providerUserId });
    if (!projection) { await sendSource(context, event.platform, `${displayName}, your Village Points profile is not available yet.`); return; }
    const idempotencyKey = `free-game-check:${requestKey}`;
    try { await context.viewerFoundation.mutate({ viewerId: projection.viewerId, operation: 'spend', amount: settings.pointsCost, reason: 'Free Game Check request', idempotencyKey }); points = { viewerId: projection.viewerId, amount: settings.pointsCost, idempotencyKey }; }
    catch { await sendSource(context, event.platform, `${displayName}, you need ${String(settings.pointsCost)} ${projection.currencyName || 'points'} to check for free games.`); return; }
  }
  const request = { requestId: `free-game-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, requestKey, platform: event.platform, displayName, reward, points };
  if (activeRequest) {
    await refundRequest(context, request, 'busy');
    const suffix = points || reward?.platform === 'twitch' ? ' Your points were refunded.' : '';
    await sendSource(context, event.platform, `${displayName}, another free-game check is already running.${suffix}`);
    return;
  }
  activeRequest = request;
  try { await context.streamerbot.runApprovedAction(REFRESH_ACTION_ID, { freeGameCheckRequestId: request.requestId }); }
  catch {
    activeRequest = undefined; await refundRequest(context, request, 'dispatch');
    const suffix = points || reward?.platform === 'twitch' ? ' Your points were refunded.' : '';
    await sendSource(context, event.platform, `${format(settings.unavailableMessage, { name: displayName })}${suffix}`);
    state.lastError = 'The approved giveaway lookup could not be dispatched.'; await context.state.write(state); return;
  }
  requestTimeoutId = context.schedule.after(30_000, () => serialize(() => expireRequest(context, request.requestId)));
}
async function processResults(event, context) {
  const requestId = text(event.payload?.requestId, 100);
  if (!activeRequest || event.platform !== 'system' || event.metadata?.simulated === true || requestId !== activeRequest.requestId) return;
  const request = activeRequest; activeRequest = undefined;
  if (requestTimeoutId) context.schedule.cancel(requestTimeoutId); requestTimeoutId = undefined;
  const settings = settingsFor(context); const state = stateFor(await context.state.read());
  const rawGames = Array.isArray(event.payload?.games) ? event.payload.games.slice(0, 100) : [];
  const games = rawGames.map(validGame).filter(Boolean);
  state.processedRequestIds = [...new Set([...state.processedRequestIds, request.requestKey])].slice(-1000);
  state.lastRefreshAt = text(event.receivedAt, 40);
  if (rawGames.length > 0 && games.length === 0) {
    state.lastError = 'The giveaway provider returned entries without safe GamerPower links.'; await context.state.write(state);
    await refundRequest(context, request, 'invalid-results');
    const suffix = request.points || request.reward?.platform === 'twitch' ? ' Your points were refunded.' : '';
    await sendSource(context, request.platform, `${format(settings.unavailableMessage, { name: request.displayName })}${suffix}`); return;
  }
  state.initialized = true; state.seenIds = [...new Set([...state.seenIds, ...games.map((game) => game.id)])].slice(-1000); state.lastError = '';
  if (games.length === 0) {
    await context.state.write(state); await refundRequest(context, request, 'none-available');
    const suffix = request.points || request.reward?.platform === 'twitch' ? ' Your points were refunded.' : '';
    await sendSource(context, request.platform, `${format(settings.noGamesMessage, { name: request.displayName })}${suffix}`); return;
  }
  await context.state.write(state);
  if (settings.discordEnabled) {
    const delivered = new Set(state.discordDeliveredIds);
    const pendingIds = new Set([...pendingDiscord.values()].map((item) => item.gameId));
    for (const game of games.filter((item) => !delivered.has(item.id) && !pendingIds.has(item.id)).slice(0, settings.maximumPostsPerRefresh)) {
      const deliveryId = `game-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      pendingDiscord.set(deliveryId, { expires: Date.now() + 60_000, gameId: game.id });
      if (pendingDiscord.size > 20) pendingDiscord.delete(pendingDiscord.keys().next().value);
      try { await context.streamerbot.runApprovedAction(DISCORD_ACTION_ID, { freeGameDiscordDeliveryId: deliveryId, freeGameDiscordTitle: game.title, freeGameDiscordUrl: game.url, freeGameDiscordPlatforms: game.platforms, freeGameDiscordEndDate: game.endDate, freeGameDiscordDestinationMode: settings.discordMode, freeGameDiscordThreadId: settings.discordThreadId, freeGameDiscordThreadName: settings.discordThreadName.replaceAll('{title}', game.title).slice(0, 100), freeGameDiscordWebhookName: settings.discordWebhookName }); }
      catch { pendingDiscord.delete(deliveryId); state.lastError = 'Discord delivery could not be dispatched and will retry on the next redemption.'; await context.state.write(state); }
    }
  }
  await settleTwitch(context, request, 'fulfill').catch(() => undefined);
  const invite = settings.discordInviteUrl || DEFAULT_DISCORD_INVITE_URL;
  await sendSource(context, request.platform, format(settings.guideMessage, { name: request.displayName, discord: invite, count: games.length }));
}
async function processDiscordResult(event, context) {
  const id = text(event.payload?.deliveryId, 100); const pending = pendingDiscord.get(id);
  if (!pending || pending.expires < Date.now()) { pendingDiscord.delete(id); return; }
  pendingDiscord.delete(id); const state = stateFor(await context.state.read()); const success = event.payload?.success === true;
  state.lastDiscordDelivery = { at: text(event.receivedAt, 40), success, messageId: text(event.payload?.messageId, 100), threadId: text(event.payload?.threadId, 100), error: text(event.payload?.error, 180) };
  if (success) { state.discordDeliveredIds = [...new Set([...state.discordDeliveredIds, pending.gameId])].slice(-1000); state.lastError = ''; }
  else state.lastError = `Discord delivery failed${state.lastDiscordDelivery.error ? `: ${state.lastDiscordDelivery.error}` : ''}. It will retry on the next redemption.`;
  await context.state.write(state);
}
function serialize(work) { operation = operation.then(work, work); return operation; }
export default {
  manifest, required: false,
  async start(context) { stopped = false; activeRequest = undefined; requestTimeoutId = undefined; pendingDiscord.clear(); livePlatforms.clear(); operation = Promise.resolve(); await context.state.write(stateFor(await context.state.read())); },
  async stop(context) { stopped = true; if (requestTimeoutId) context.schedule.cancel(requestTimeoutId); requestTimeoutId = undefined; const request = activeRequest; activeRequest = undefined; if (request) await refundRequest(context, request, 'shutdown'); pendingDiscord.clear(); livePlatforms.clear(); await operation.catch(() => undefined); operation = Promise.resolve(); },
  async onEvent(event, context) {
    if (stopped) return;
    if ((event.eventType === 'stream.online' || event.eventType === 'stream.offline') && event.metadata?.simulated !== true && LIVE_PLATFORMS.includes(event.platform)) { if (event.eventType === 'stream.online') livePlatforms.add(event.platform); else livePlatforms.delete(event.platform); return; }
    if (event.eventType === RESULTS_EVENT) await serialize(() => processResults(event, context));
    else if (event.eventType === DISCORD_RESULT_EVENT && event.platform === 'system' && event.metadata?.simulated !== true) await serialize(() => processDiscordResult(event, context));
    else if (['reward.redemption', 'command.received', 'chat.message'].includes(event.eventType)) await serialize(() => beginRequest(event, context));
  },
};
export { RESULTS_EVENT, DISCORD_RESULT_EVENT, stateFor, validGame, safeDiscordInvite };
