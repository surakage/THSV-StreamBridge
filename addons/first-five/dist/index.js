// First Five uses Twitch/Kick rewards and Viewer Foundation commands on YouTube/TikTok.
// It stores one bounded per-stream claim set and one monthly weighted leaderboard.
const CONTROLLER_ACTION_ID = '5807e453-1cdb-49bf-bad8-d50f785cbc77';
const CONTROLLER_RESULT_EVENT = 'addon.thsv.first-five.controller-result';
const CONTROL_EVENT = 'addon.thsv.first-five.control';
const POSITION_POINTS = Object.freeze([5, 4, 3, 2, 1]);
const ORDINALS = Object.freeze(['1st', '2nd', '3rd', '4th', '5th']);
let eventQueue = Promise.resolve();
const livePlatforms = new Set();

const manifest = {
  contractVersion: '2.0.0-preview.1',
  moduleId: 'thsv.first-five',
  name: 'First Five',
  version: '4.0.10',
  minimumCoreVersion: '2.0.0-preview.1',
  maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.10', maximumTestedBridgeVersion: '4.0.10',
  dependencies: ['thsv.viewer-foundation'],
  requiredCapabilities: [],
  configurationSchema: 'schemas/config.json',
  eventSubscriptions: ['reward.redemption', 'command.received', 'stream.online', 'stream.offline', CONTROLLER_RESULT_EVENT, CONTROL_EVENT],
  commandsProvided: [{ id: 'first-five.claim', name: 'firstfive' }],
  actionsProvided: [],
  browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.first-five/', 'data/addons/.state/thsv.first-five/'],
  installationSteps: [
    'Import the separate First Five Streamer.bot package.',
    'Keep its Controller action triggerless and approve only that action for this add-on.',
    'Keep Twitch and Kick Reward Redemption attached to their existing platform intake actions.',
    'Choose five Twitch IDs and five Kick IDs in placement order. The saved YouTube and TikTok command registers automatically after restart.',
  ],
  uninstallationSteps: ['Uninstall the add-on. Its compact leaderboard state remains preserved for a later reinstall.'],
  migrations: [],
  healthChecks: [{ id: 'thsv.first-five.runtime', description: 'Confirms serialized placement claims, reward transitions, and monthly leaderboard state.' }],
};

const FALLBACKS = Object.freeze({
  enabled: true,
  reward1Id: '', reward2Id: '', reward3Id: '', reward4Id: '', reward5Id: '',
  kickReward1Id: '', kickReward2Id: '', kickReward3Id: '', kickReward4Id: '', kickReward5Id: '',
  commandName: 'firstfive', pointsCost: 25,
  reward1Title: 'First Five: Claim 1st Place', reward2Title: 'First Five: Claim 2nd Place', reward3Title: 'First Five: Claim 3rd Place', reward4Title: 'First Five: Claim 4th Place', reward5Title: 'First Five: Claim 5th Place',
  claimedTitleTemplate: '{name} was {ordinal}',
  announceClaims: true,
  claimMessageTemplate: '{name} claimed {ordinal} place in First Five!',
  notifyRejectedClaims: false,
  rejectedMessageTemplate: '{name}, you already claimed a First Five place this stream.',
  announceMonthlyWinner: true,
  monthlyWinnerMessageTemplate: 'Last month’s First Five winner was {name} with {points} points!',
  showLeaderboardCard: true,
  leaderboardCardSeconds: 30,
  crossPlatformGapSeconds: 2,
});

function clean(value, maximum = 256) {
  const normalized = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '';
  return [...normalized].slice(0, maximum).join('');
}

function integer(value, minimum, maximum, fallback) {
  return Number.isInteger(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function scopedUserId(value) {
  const userId = clean(value, 256);
  return userId && !userId.includes(':') ? `twitch:${userId}` : userId;
}

function settingsFor(context) {
  const raw = { ...FALLBACKS, ...(context.settings || {}) };
  const rewardIds = [raw.reward1Id, raw.reward2Id, raw.reward3Id, raw.reward4Id, raw.reward5Id].map((value) => clean(value, 256));
  const kickRewardIds = [raw.kickReward1Id, raw.kickReward2Id, raw.kickReward3Id, raw.kickReward4Id, raw.kickReward5Id].map((value) => clean(value, 256));
  const availableTitles = [raw.reward1Title, raw.reward2Title, raw.reward3Title, raw.reward4Title, raw.reward5Title].map((value, index) => clean(value, 45) || FALLBACKS[`reward${String(index + 1)}Title`]);
  return {
    ...raw,
    rewardIds,
    kickRewardIds,
    commandName: clean(raw.commandName, 64).toLowerCase() || 'firstfive',
    pointsCost: integer(raw.pointsCost, 1, 1000000, 25),
    availableTitles,
    configured: (rewardIds.every(Boolean) && new Set(rewardIds).size === 5) || (kickRewardIds.every(Boolean) && new Set(kickRewardIds).size === 5) || clean(raw.commandName, 64).length > 0,
    leaderboardCardSeconds: integer(raw.leaderboardCardSeconds, 5, 3600, 30),
    crossPlatformGapSeconds: integer(raw.crossPlatformGapSeconds, 1, 10, 2),
  };
}

function monthKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function placement(value) {
  if (!value || typeof value !== 'object') return undefined;
  const position = integer(value.position, 1, 5, 0);
  const userId = scopedUserId(value.userId);
  const displayName = clean(value.displayName, 100);
  const rewardId = clean(value.rewardId, 256);
  const redemptionId = clean(value.redemptionId, 256);
  const claimedAt = clean(value.claimedAt, 40);
  return position && userId && displayName && rewardId && redemptionId && claimedAt ? { position, userId, displayName, rewardId, redemptionId, claimedAt } : undefined;
}

function leaderboardEntry(value) {
  if (!value || typeof value !== 'object') return undefined;
  const userId = scopedUserId(value.userId);
  const displayName = clean(value.displayName, 100);
  const placements = Array.isArray(value.placements) ? value.placements.slice(0, 5).map((count) => integer(count, 0, 10000, 0)) : [0, 0, 0, 0, 0];
  while (placements.length < 5) placements.push(0);
  if (!userId || !displayName) return undefined;
  return {
    userId,
    displayName,
    points: placements.reduce((total, count, index) => total + count * POSITION_POINTS[index], 0),
    placements,
    firstScoredAt: clean(value.firstScoredAt, 40),
    lastClaimedAt: clean(value.lastClaimedAt, 40),
  };
}

export function rankLeaderboard(entries) {
  return [...entries].sort((left, right) => right.points - left.points
    || right.placements[0] - left.placements[0]
    || left.firstScoredAt.localeCompare(right.firstScoredAt)
    || left.displayName.localeCompare(right.displayName));
}

export function sanitizeState(value, now = Date.now()) {
  const source = value && typeof value === 'object' ? value : {};
  // Persist one flat, backward-compatible list containing up to five claims per platform.
  const placements = Array.isArray(source.placements) ? source.placements.map(placement).filter(Boolean).slice(0, 20) : [];
  const leaderboard = Array.isArray(source.leaderboard) ? source.leaderboard.map(leaderboardEntry).filter(Boolean).slice(0, 100) : [];
  const previous = source.previousMonth && typeof source.previousMonth === 'object' ? {
    month: clean(source.previousMonth.month, 7),
    winner: leaderboardEntry(source.previousMonth.winner),
  } : undefined;
  const pendingPlacement = source.pending && typeof source.pending === 'object' ? placement(source.pending.placement) : undefined;
  const pendingOperation = source.pending && typeof source.pending === 'object'
    ? clean(source.pending.operation, 20) || (pendingPlacement ? 'claim' : '')
    : '';
  const pending = source.pending && typeof source.pending === 'object' ? {
    operation: pendingOperation,
    requestId: clean(source.pending.requestId, 100),
    eventId: clean(source.pending.eventId, 256),
    placement: pendingPlacement,
    streamCycleId: clean(source.pending.streamCycleId, 256),
    startedAt: integer(source.pending.startedAt, 0, Number.MAX_SAFE_INTEGER, 0),
  } : undefined;
  return {
    version: 1,
    streamCycleId: clean(source.streamCycleId, 256),
    placements,
    leaderboardMonth: /^\d{4}-\d{2}$/u.test(source.leaderboardMonth) ? source.leaderboardMonth : monthKey(now),
    leaderboard,
    ...(previous?.month && previous.winner ? { previousMonth: previous } : {}),
    ...(pending?.requestId && pending.operation && (pending.operation !== 'claim' || pending.placement) ? { pending } : {}),
    announcedMonth: clean(source.announcedMonth, 7),
  };
}

export function rolloverMonth(state, now = Date.now()) {
  const current = monthKey(now);
  if (state.leaderboardMonth === current) return { state, winner: undefined };
  const winner = rankLeaderboard(state.leaderboard)[0];
  return {
    state: {
      ...state,
      leaderboardMonth: current,
      leaderboard: [],
      ...(winner ? { previousMonth: { month: state.leaderboardMonth, winner } } : {}),
      announcedMonth: '',
    },
    winner,
  };
}

export function addLeaderboardClaim(entries, claim) {
  const next = entries.map((entry) => ({ ...entry, placements: [...entry.placements] }));
  let entry = next.find((candidate) => candidate.userId === claim.userId);
  if (!entry) {
    entry = { userId: claim.userId, displayName: claim.displayName, points: 0, placements: [0, 0, 0, 0, 0], firstScoredAt: claim.claimedAt, lastClaimedAt: claim.claimedAt };
    next.push(entry);
  }
  entry.displayName = claim.displayName;
  entry.placements[claim.position - 1] += 1;
  entry.points = entry.placements.reduce((total, count, index) => total + count * POSITION_POINTS[index], 0);
  entry.lastClaimedAt = claim.claimedAt;
  return rankLeaderboard(next).slice(0, 100);
}

function formatTemplate(template, values, maximum) {
  let result = clean(template, maximum * 2);
  for (const [key, value] of Object.entries(values)) result = result.replaceAll(`{${key}}`, clean(String(value), maximum));
  return [...result].slice(0, maximum).join('');
}

function requestId(prefix) {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}

function withoutPending(state) {
  const next = { ...state };
  delete next.pending;
  return next;
}

async function sendChat(context, message, platform = 'twitch') {
  if (!message) return;
  try { await context.chat.send({ message, routing: 'source', sourcePlatform: platform, overflow: 'reject' }); }
  catch { /* Chat delivery is cosmetic and never rolls back a valid placement. */ }
}

function platformForUserId(userId) {
  const separator = typeof userId === 'string' ? userId.indexOf(':') : -1;
  return separator > 0 ? userId.slice(0, separator) : 'twitch';
}

function platformPlacements(state, platform) {
  return state.placements.filter((item) => platformForUserId(item.userId) === platform).sort((left, right) => left.position - right.position).slice(0, 5);
}

async function publishLeaderboard(context, settings, state, requestedPlatform = 'twitch') {
  if (!settings.showLeaderboardCard) return;
  const platform = ['twitch', 'youtube', 'kick', 'tiktok'].includes(requestedPlatform) ? requestedPlatform : 'twitch';
  const currentPlacements = platformPlacements(state, platform);
  const placements = state.placements.length
    ? state.placements.map((item) => `${ORDINALS[item.position - 1]}: ${item.displayName}`).join(' • ')
    : 'Waiting for the first claim';
  const leaders = rankLeaderboard(state.leaderboard.filter((entry) => platformForUserId(entry.userId) === platform)).slice(0, 5);
  const monthly = leaders.length ? leaders.map((entry, index) => `${String(index + 1)}. ${entry.displayName} (${String(entry.points)})`).join(' • ') : 'No monthly claims yet';
  try {
    await context.overlay.publish('thsv.first-five.card.show', {
      cardKind: 'first-five',
      headline: `${platform[0].toUpperCase()}${platform.slice(1)} First Five`,
      subtitle: currentPlacements.length >= 5 ? 'The arrival board is complete' : 'The first villagers have arrived',
      monthLabel: state.leaderboardMonth,
      platform,
      placements: currentPlacements.map((item) => ({
        position: item.position,
        displayName: item.displayName,
        platform: item.userId.includes(':') ? item.userId.split(':', 1)[0] : '',
      })),
      leaders: leaders.map((entry, index) => ({ rank: index + 1, displayName: entry.displayName, points: entry.points })),
      title: `FIRST FIVE • ${state.leaderboardMonth}`,
      text: `${placements} — Monthly: ${monthly}`,
      durationMs: settings.leaderboardCardSeconds * 1000,
      queueGapMs: settings.crossPlatformGapSeconds * 1000,
    }, { lane: 'foreground' });
  } catch { /* Overlay presentation is optional. */ }
}

function claimedTitle(settings, claim) {
  const ordinal = ORDINALS[claim.position - 1];
  const rendered = formatTemplate(settings.claimedTitleTemplate, { name: claim.displayName, ordinal }, 45);
  if (rendered.includes(ordinal)) return rendered;
  return `${[...rendered].slice(0, 44 - ordinal.length).join('').trimEnd()} ${ordinal}`.trim();
}

async function runController(context, argumentsValue) {
  if (!context.approvedActionIds.includes(CONTROLLER_ACTION_ID)) throw new Error('First Five Controller is not approved.');
  await context.streamerbot.runApprovedAction(CONTROLLER_ACTION_ID, argumentsValue);
}

async function dispatchCancel(event, context) {
  if (event.platform !== 'twitch') return;
  if (!Array.isArray(event.payload?.supportedOperations) || !event.payload.supportedOperations.includes('cancel')) return;
  await runController(context, {
    firstFiveOperation: 'cancel',
    firstFiveRequestId: requestId('cancel'),
    firstFiveRewardId: clean(event.payload.rewardId, 256),
    firstFiveRedemptionId: clean(event.payload.redemptionId, 256),
  });
}

async function announcePreviousWinner(context, settings, state, winner) {
  if (!settings.announceMonthlyWinner || !winner || state.announcedMonth === state.previousMonth?.month) return state;
  const message = formatTemplate(settings.monthlyWinnerMessageTemplate, {
    name: winner.displayName,
    points: winner.points,
    firsts: winner.placements[0],
    month: state.previousMonth?.month || '',
  }, 500);
  await sendChat(context, message);
  return { ...state, announcedMonth: state.previousMonth?.month || '' };
}

async function resetStream(event, context, settings, state) {
  if (state.pending || !context.approvedActionIds.includes(CONTROLLER_ACTION_ID)) return state;
  const cycleId = clean(event?.source?.eventId || event?.eventId || requestId('cycle'), 256);
  if (cycleId && cycleId === state.streamCycleId) return state;
  const pending = { operation: 'reset', requestId: requestId('reset'), eventId: '', streamCycleId: cycleId, startedAt: Date.now() };
  const reserved = { ...state, pending };
  await context.state.write(reserved);
  try {
    await runController(context, {
      firstFiveOperation: 'reset',
      firstFiveRequestId: pending.requestId,
      firstFiveReward1Id: settings.rewardIds[0], firstFiveReward1Title: settings.availableTitles[0],
      firstFiveReward2Id: settings.rewardIds[1], firstFiveReward2Title: settings.availableTitles[1],
      firstFiveReward3Id: settings.rewardIds[2], firstFiveReward3Title: settings.availableTitles[2],
      firstFiveReward4Id: settings.rewardIds[3], firstFiveReward4Title: settings.availableTitles[3],
      firstFiveReward5Id: settings.rewardIds[4], firstFiveReward5Title: settings.availableTitles[4],
    });
  } catch {
    const rolledBack = withoutPending(reserved);
    await context.state.write(rolledBack);
    return state;
  }
  return reserved;
}

async function deactivateStream(context, settings) {
  if (!context.approvedActionIds.includes(CONTROLLER_ACTION_ID)) return;
  try {
    await runController(context, {
      firstFiveOperation: 'deactivate',
      firstFiveRequestId: requestId('deactivate'),
      firstFiveReward1Id: settings.rewardIds[0], firstFiveReward2Id: settings.rewardIds[1],
      firstFiveReward3Id: settings.rewardIds[2], firstFiveReward4Id: settings.rewardIds[3],
      firstFiveReward5Id: settings.rewardIds[4],
    });
  } catch { /* The next verified stream-online reset retries the complete reward repair. */ }
}

async function completeDirectClaim(context, settings, state, claim, platform) {
  const completed = { ...state, placements: [...state.placements, claim].sort((left, right) => left.userId.localeCompare(right.userId) || left.position - right.position).slice(0, 20), leaderboard: addLeaderboardClaim(state.leaderboard, claim) };
  await context.state.write(completed);
  if (settings.announceClaims) await sendChat(context, formatTemplate(settings.claimMessageTemplate, { name: claim.displayName, ordinal: ORDINALS[claim.position - 1], position: claim.position }, 500), platform);
  await publishLeaderboard(context, settings, completed, platform);
  return completed;
}

async function handleRedemption(event, context, settings, state) {
  if (!['twitch', 'kick'].includes(event.platform) || event.metadata?.simulated === true || event.payload?.verifiedTransport !== true) return state;
  const platformRewardIds = event.platform === 'twitch' ? settings.rewardIds : settings.kickRewardIds;
  const rewardId = clean(event.payload?.rewardId, 256);
  const position = platformRewardIds.indexOf(rewardId) + 1;
  if (position === 0) return state;
  if (event.platform === 'twitch' && !context.approvedActionIds.includes(CONTROLLER_ACTION_ID)) return state;
  const redemptionId = clean(event.payload?.redemptionId, 256);
  const providerUserId = clean(event.user?.id, 240);
  const userId = providerUserId ? `${event.platform}:${providerUserId}` : '';
  const displayName = clean(event.user?.displayName || event.user?.name, 100);
  if (!redemptionId || !userId || !displayName) return state;
  const expectedPosition = platformPlacements(state, event.platform).length + 1;
  const alreadyClaimed = state.placements.some((item) => item.userId === userId);
  if (state.pending || position !== expectedPosition || alreadyClaimed) {
    try { await dispatchCancel(event, context); } catch { /* Leave the redemption pending if cancellation dispatch is unavailable. */ }
    if (alreadyClaimed && settings.notifyRejectedClaims) {
      await sendChat(context, formatTemplate(settings.rejectedMessageTemplate, { name: displayName }, 500), event.platform);
    }
    return state;
  }
  const claim = { position, userId, displayName, rewardId, redemptionId, claimedAt: new Date().toISOString() };
  if (event.platform === 'kick') return completeDirectClaim(context, settings, state, claim, 'kick');
  const pending = { operation: 'claim', requestId: requestId('claim'), eventId: clean(event.eventId, 256), placement: claim, streamCycleId: '', startedAt: Date.now() };
  const reserved = { ...state, pending };
  await context.state.write(reserved);
  try {
    await runController(context, {
      firstFiveOperation: 'claim',
      firstFiveRequestId: pending.requestId,
      firstFiveRewardId: rewardId,
      firstFiveRedemptionId: redemptionId,
      firstFiveAvailableTitle: settings.availableTitles[position - 1],
      firstFiveClaimedTitle: claimedTitle(settings, claim),
      firstFiveNextRewardId: settings.rewardIds[position] || '',
      firstFiveRedemptionAlreadyFulfilled: event.payload?.skipsQueue === true,
    });
    return reserved;
  } catch {
    const rolledBack = withoutPending(reserved);
    await context.state.write(rolledBack);
    return rolledBack;
  }
}

async function handlePointsCommand(event, context, settings, state) {
  if (event.eventType !== 'command.received' || !['youtube', 'tiktok'].includes(event.platform) || event.metadata?.simulated === true || clean(event.payload?.command, 64).toLowerCase() !== settings.commandName) return state;
  const providerUserId = clean(event.user?.id, 240); const displayName = clean(event.user?.displayName || event.user?.name, 100); const eventId = clean(event.eventId || event.source?.eventId, 200);
  const userId = providerUserId ? `${event.platform}:${providerUserId}` : ''; const position = platformPlacements(state, event.platform).length + 1;
  if (!userId || !displayName || !eventId || position > 5) return state;
  if (state.placements.some((item) => item.userId === userId)) { if (settings.notifyRejectedClaims) await sendChat(context, formatTemplate(settings.rejectedMessageTemplate, { name: displayName }, 500), event.platform); return state; }
  const projection = await context.viewerFoundation.getProjection({ platform: event.platform, userId: providerUserId }); if (!projection) return state;
  const idempotencyKey = `first-five:${eventId}`;
  try { await context.viewerFoundation.mutate({ viewerId: projection.viewerId, operation: 'spend', amount: settings.pointsCost, reason: 'First Five placement', idempotencyKey }); }
  catch { await sendChat(context, `You need ${String(settings.pointsCost)} ${projection.currencyName || 'points'} to claim a First Five place.`, event.platform); return state; }
  const claim = { position, userId, displayName, rewardId: 'viewer-foundation', redemptionId: `command:${eventId}`, claimedAt: new Date().toISOString() };
  try { return await completeDirectClaim(context, settings, state, claim, event.platform); }
  catch (error) { await context.viewerFoundation.mutate({ viewerId: projection.viewerId, operation: 'refund', amount: settings.pointsCost, reason: 'First Five write rollback', idempotencyKey: `${idempotencyKey}:rollback` }).catch(() => undefined); throw error; }
}

async function handleControllerResult(event, context, settings, state) {
  const request = clean(event.payload?.requestId, 100);
  const operation = clean(event.payload?.operation, 20);
  if (!state.pending || state.pending.requestId !== request || operation !== state.pending.operation) return state;
  if (event.payload?.success !== true) {
    const failed = withoutPending(state);
    await context.state.write(failed);
    return failed;
  }
  if (state.pending.operation === 'reset') {
    const completed = {
      ...withoutPending(state),
      streamCycleId: state.pending.streamCycleId,
      placements: [],
    };
    await context.state.write(completed);
    return completed;
  }
  if (state.pending.operation !== 'claim' || !state.pending.placement) return state;
  const claim = state.pending.placement;
  const completed = {
    ...withoutPending(state),
    placements: [...state.placements, claim].sort((left, right) => left.userId.localeCompare(right.userId) || left.position - right.position).slice(0, 20),
    leaderboard: addLeaderboardClaim(state.leaderboard, claim),
  };
  await context.state.write(completed);
  if (settings.announceClaims) {
    await sendChat(context, formatTemplate(settings.claimMessageTemplate, { name: claim.displayName, ordinal: ORDINALS[claim.position - 1], position: claim.position }, 500));
  }
  await publishLeaderboard(context, settings, completed, platformForUserId(claim.userId));
  return completed;
}

async function handleEvent(event, context) {
  const settings = settingsFor(context);
  if (!settings.enabled || !settings.configured) return;
  let state = sanitizeState(await context.state.read());
  const rollover = rolloverMonth(state);
  state = rollover.state;
  state = await announcePreviousWinner(context, settings, state, rollover.winner);
  if (rollover.winner) await context.state.write(state);

  if (event.eventType === 'stream.online' && event.metadata?.simulated !== true) {
    const firstLivePlatform = livePlatforms.size === 0; livePlatforms.add(event.platform);
    if (!firstLivePlatform) return;
    if (settings.rewardIds.every(Boolean) && context.approvedActionIds.includes(CONTROLLER_ACTION_ID)) await resetStream(event, context, settings, state);
    else { const reset = { ...state, streamCycleId: clean(event.source?.eventId || event.eventId, 256), placements: [] }; await context.state.write(reset); }
    return;
  }
  if (event.eventType === 'stream.offline' && event.metadata?.simulated !== true) {
    livePlatforms.delete(event.platform); if (livePlatforms.size === 0 && settings.rewardIds.every(Boolean)) await deactivateStream(context, settings);
    return;
  }
  if (event.eventType === CONTROL_EVENT && event.payload?.action === 'reset') {
    await resetStream(event, context, settings, state);
    return;
  }
  if (event.eventType === CONTROLLER_RESULT_EVENT) {
    await handleControllerResult(event, context, settings, state);
    return;
  }
  if (event.eventType === 'reward.redemption') await handleRedemption(event, context, settings, state);
  else if (event.eventType === 'command.received') await handlePointsCommand(event, context, settings, state);
}

const module = {
  manifest,
  required: false,
  async start(context) {
    livePlatforms.clear();
    const settings = settingsFor(context);
    if (!settings.enabled || !settings.configured) return;
    // Startup only normalizes persisted state. Visible cards are claim-driven so
    // restarting StreamBridge or beginning a stream never displays First Five.
    await context.state.write(sanitizeState(await context.state.read()));
  },
  async stop() {
    livePlatforms.clear();
    await eventQueue.catch(() => undefined);
    eventQueue = Promise.resolve();
  },
  async onEvent(event, context) {
    eventQueue = eventQueue.then(() => handleEvent(event, context), () => handleEvent(event, context));
    await eventQueue;
  },
};

export { CONTROLLER_ACTION_ID, monthKey };
export default module;
