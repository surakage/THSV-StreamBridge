// Fan Crown runs one Twitch-only rotating channel-points crown.
// StreamBridge owns bounded state and decisions; one approved Streamer.bot controller owns reward mutations.
const CONTROLLER_ACTION_ID = 'ad2b29a1-4e8e-4f0b-9ac2-6c4e5f473e12';
const CONTROLLER_RESULT_EVENT = 'addon.thsv.fan-crown.controller-result';
const CONTROL_EVENT = 'addon.thsv.fan-crown.control';
const MAXIMUM_COST = 2_000_000_000;
const MAXIMUM_HISTORY = 200;
const MAXIMUM_LEADERS = 100;
const MAXIMUM_DAY_MS = 86_400_000;
let eventQueue = Promise.resolve();
let resetCheckTaskId;
let stopped = true;

const manifest = {
  contractVersion: '2.0.0-preview.1',
  moduleId: 'thsv.fan-crown',
  name: 'Fan Crown',
  version: '1.0.0',
  minimumCoreVersion: '2.0.0-preview.1',
  maximumTestedCoreVersion: '2.0.0-preview.1',
  dependencies: [],
  requiredCapabilities: [],
  configurationSchema: 'schemas/config.json',
  eventSubscriptions: ['reward.redemption', 'stream.online', CONTROLLER_RESULT_EVENT, CONTROL_EVENT],
  commandsProvided: [],
  actionsProvided: [],
  browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.fan-crown/', 'data/addons/.state/thsv.fan-crown/'],
  installationSteps: [
    'Import the separate Fan Crown Streamer.bot package.',
    'Keep its Controller action triggerless and approve only that stable action ID for this add-on.',
    'Add Twitch Reward Redemption (Any Reward) to the existing THSV Twitch - Intake action.',
    'Create one Streamer.bot-owned Twitch reward, copy its Reward ID, and match its initial title and cost to the wizard settings.',
  ],
  uninstallationSteps: ['Uninstall the add-on. Its compact private season state remains preserved for a later reinstall.'],
  migrations: [],
  healthChecks: [{ id: 'thsv.fan-crown.runtime', description: 'Confirms serialized crown captures, bounded pricing, and monthly private leaderboard state.' }],
};

const FALLBACKS = Object.freeze({
  enabled: true,
  rewardId: '',
  baseRewardTitle: 'No. 1 Fan',
  holderTitleTemplate: '{name} is No. 1 Fan',
  pricingMode: 'fixed',
  baseCost: 500,
  fixedIncrease: 250,
  multiplier: 1.25,
  maximumCost: 10_000,
  roundingIncrement: 50,
  resetEachStream: false,
  blockCurrentHolder: true,
  userCooldownMinutes: 0,
  allowBroadcaster: true,
  allowModerators: true,
  announceCaptures: true,
  captureMessageTemplate: '{name} captured the Fan Crown for {cost} points! Next challenge: {nextCost}.',
  notifyRejectedClaims: false,
  rejectedMessageTemplate: '{name}, that Fan Crown redemption was refunded: {reason}.',
  announceMonthlyWinner: true,
  monthlyWinnerMessageTemplate: '{name} won the {month} Fan Crown season with {points} points and {captures} captures!',
  showCrownCard: true,
  crownCardSeconds: 20,
  overlayBackgroundMode: 'glass',
  overlayBackgroundColor: '#201335',
  overlayBackgroundOpacity: 0.94,
  overlayAccentColor: '#f4cc63',
  overlayTextColor: '#ffffff',
  overlayFontFamily: 'display',
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

function boolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function safeHttps(value) {
  const text = clean(value, 2_048);
  if (!text) return '';
  try { return new URL(text).protocol === 'https:' ? text : ''; }
  catch { return ''; }
}

function safeColor(value, fallback) {
  const color = clean(value, 7);
  return /^#[0-9a-f]{6}$/iu.test(color) ? color : fallback;
}

function settingsFor(context) {
  const raw = { ...FALLBACKS, ...(context.settings || {}) };
  const pricingMode = raw.pricingMode === 'multiplier' ? 'multiplier' : 'fixed';
  const baseCost = integer(raw.baseCost, 1, MAXIMUM_COST, FALLBACKS.baseCost);
  const maximumCost = Math.max(baseCost, integer(raw.maximumCost, 1, MAXIMUM_COST, FALLBACKS.maximumCost));
  return {
    enabled: boolean(raw.enabled, true),
    rewardId: clean(raw.rewardId, 256),
    baseRewardTitle: clean(raw.baseRewardTitle, 45) || FALLBACKS.baseRewardTitle,
    holderTitleTemplate: clean(raw.holderTitleTemplate, 100) || FALLBACKS.holderTitleTemplate,
    pricingMode,
    baseCost,
    fixedIncrease: integer(raw.fixedIncrease, 1, MAXIMUM_COST, FALLBACKS.fixedIncrease),
    multiplier: decimal(raw.multiplier, 1.01, 10, FALLBACKS.multiplier),
    maximumCost,
    roundingIncrement: integer(raw.roundingIncrement, 1, 1_000_000, FALLBACKS.roundingIncrement),
    resetEachStream: boolean(raw.resetEachStream, false),
    blockCurrentHolder: boolean(raw.blockCurrentHolder, true),
    userCooldownMinutes: integer(raw.userCooldownMinutes, 0, 43_200, 0),
    allowBroadcaster: boolean(raw.allowBroadcaster, true),
    allowModerators: boolean(raw.allowModerators, true),
    announceCaptures: boolean(raw.announceCaptures, true),
    captureMessageTemplate: clean(raw.captureMessageTemplate, 1_000) || FALLBACKS.captureMessageTemplate,
    notifyRejectedClaims: boolean(raw.notifyRejectedClaims, false),
    rejectedMessageTemplate: clean(raw.rejectedMessageTemplate, 1_000) || FALLBACKS.rejectedMessageTemplate,
    announceMonthlyWinner: boolean(raw.announceMonthlyWinner, true),
    monthlyWinnerMessageTemplate: clean(raw.monthlyWinnerMessageTemplate, 1_000) || FALLBACKS.monthlyWinnerMessageTemplate,
    showCrownCard: boolean(raw.showCrownCard, true),
    crownCardSeconds: integer(raw.crownCardSeconds, 5, 3_600, FALLBACKS.crownCardSeconds),
    overlayBackgroundMode: ['glass', 'solid', 'none'].includes(raw.overlayBackgroundMode) ? raw.overlayBackgroundMode : FALLBACKS.overlayBackgroundMode,
    overlayBackgroundColor: safeColor(raw.overlayBackgroundColor, FALLBACKS.overlayBackgroundColor),
    overlayBackgroundOpacity: decimal(raw.overlayBackgroundOpacity, 0, 1, FALLBACKS.overlayBackgroundOpacity),
    overlayAccentColor: safeColor(raw.overlayAccentColor, FALLBACKS.overlayAccentColor),
    overlayTextColor: safeColor(raw.overlayTextColor, FALLBACKS.overlayTextColor),
    overlayFontFamily: ['display', 'broadcast', 'serif', 'mono'].includes(raw.overlayFontFamily) ? raw.overlayFontFamily : FALLBACKS.overlayFontFamily,
    configured: clean(raw.rewardId, 256).length > 0,
  };
}

export function monthKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function crownRecord(value) {
  if (!value || typeof value !== 'object') return undefined;
  const userId = clean(value.userId, 256);
  const displayName = clean(value.displayName, 100);
  const claimedAt = clean(value.claimedAt, 40);
  if (!userId || !displayName || !claimedAt) return undefined;
  return { userId, displayName, avatarUrl: safeHttps(value.avatarUrl), claimedAt };
}

function leaderRecord(value) {
  if (!value || typeof value !== 'object') return undefined;
  const userId = clean(value.userId, 256);
  const displayName = clean(value.displayName, 100);
  if (!userId || !displayName) return undefined;
  return {
    userId,
    displayName,
    avatarUrl: safeHttps(value.avatarUrl),
    totalSpent: integer(value.totalSpent, 0, Number.MAX_SAFE_INTEGER, 0),
    captures: integer(value.captures, 0, 1_000_000, 0),
    totalReignSeconds: integer(value.totalReignSeconds, 0, Number.MAX_SAFE_INTEGER, 0),
    longestReignSeconds: integer(value.longestReignSeconds, 0, Number.MAX_SAFE_INTEGER, 0),
    firstScoredAt: clean(value.firstScoredAt, 40),
    lastCapturedAt: clean(value.lastCapturedAt, 40),
  };
}

function pendingClaim(value) {
  if (!value || typeof value !== 'object') return undefined;
  const userId = clean(value.userId, 256);
  const displayName = clean(value.displayName, 100);
  const rewardId = clean(value.rewardId, 256);
  const redemptionId = clean(value.redemptionId, 256);
  const claimedAt = clean(value.claimedAt, 40);
  const paidCost = integer(value.paidCost, 1, MAXIMUM_COST, 0);
  const nextCost = integer(value.nextCost, 1, MAXIMUM_COST, 0);
  const rewardTitle = clean(value.rewardTitle, 45);
  if (!userId || !displayName || !rewardId || !redemptionId || !claimedAt || !paidCost || !nextCost || !rewardTitle) return undefined;
  return { userId, displayName, avatarUrl: safeHttps(value.avatarUrl), rewardId, redemptionId, claimedAt, paidCost, nextCost, rewardTitle };
}

function pendingRecord(value) {
  if (!value || typeof value !== 'object') return undefined;
  const operation = ['claim', 'reset-crown', 'reset-month'].includes(value.operation) ? value.operation : '';
  const requestId = clean(value.requestId, 100);
  const startedAt = integer(value.startedAt, 0, Number.MAX_SAFE_INTEGER, 0);
  const claim = pendingClaim(value.claim);
  if (!operation || !requestId || !startedAt || (operation === 'claim' && !claim)) return undefined;
  return { operation, requestId, startedAt, ...(claim ? { claim } : {}), announceWinner: boolean(value.announceWinner, false) };
}

export function rankLeaderboard(entries) {
  return [...entries].sort((left, right) => right.totalSpent - left.totalSpent
    || right.captures - left.captures
    || right.longestReignSeconds - left.longestReignSeconds
    || left.firstScoredAt.localeCompare(right.firstScoredAt)
    || left.displayName.localeCompare(right.displayName));
}

export function sanitizeState(value, baseCost = FALLBACKS.baseCost, now = Date.now()) {
  const source = value && typeof value === 'object' ? value : {};
  const crown = crownRecord(source.crown);
  const leaderboard = Array.isArray(source.leaderboard)
    ? rankLeaderboard(source.leaderboard.map(leaderRecord).filter(Boolean)).slice(0, MAXIMUM_LEADERS)
    : [];
  const previousWinner = leaderRecord(source.previousSeason?.winner);
  const previousMonth = clean(source.previousSeason?.month, 7);
  const pending = pendingRecord(source.pending);
  const recentRedemptionIds = Array.isArray(source.recentRedemptionIds)
    ? [...new Set(source.recentRedemptionIds.map((item) => clean(item, 256)).filter(Boolean))].slice(-MAXIMUM_HISTORY)
    : [];
  return {
    version: 1,
    seasonMonth: /^\d{4}-\d{2}$/u.test(source.seasonMonth) ? source.seasonMonth : monthKey(now),
    currentCost: integer(source.currentCost, 1, MAXIMUM_COST, baseCost),
    ...(crown ? { crown } : {}),
    leaderboard,
    recentRedemptionIds,
    ...(previousMonth && previousWinner ? { previousSeason: { month: previousMonth, winner: previousWinner } } : {}),
    announcedMonth: clean(source.announcedMonth, 7),
    streamCycleId: clean(source.streamCycleId, 256),
    ...(pending ? { pending } : {}),
  };
}

export function calculateNextCost(currentCost, settings) {
  const boundedCurrent = integer(currentCost, 1, MAXIMUM_COST, settings.baseCost);
  const raw = settings.pricingMode === 'multiplier'
    ? Math.ceil(boundedCurrent * settings.multiplier)
    : boundedCurrent + settings.fixedIncrease;
  const rounded = Math.ceil(raw / settings.roundingIncrement) * settings.roundingIncrement;
  return Math.max(1, Math.min(settings.maximumCost, rounded));
}

function closeActiveReign(state, now = Date.now()) {
  if (!state.crown) return state;
  const startedAt = Date.parse(state.crown.claimedAt);
  const duration = Number.isFinite(startedAt) ? Math.max(0, Math.floor((now - startedAt) / 1_000)) : 0;
  const leaderboard = state.leaderboard.map((entry) => entry.userId === state.crown.userId ? {
    ...entry,
    totalReignSeconds: entry.totalReignSeconds + duration,
    longestReignSeconds: Math.max(entry.longestReignSeconds, duration),
  } : entry);
  return { ...state, leaderboard: rankLeaderboard(leaderboard).slice(0, MAXIMUM_LEADERS) };
}

export function applyCapture(state, claim, now = Date.now()) {
  const closed = closeActiveReign(state, now);
  const leaderboard = closed.leaderboard.map((entry) => ({ ...entry }));
  let leader = leaderboard.find((entry) => entry.userId === claim.userId);
  if (!leader) {
    leader = {
      userId: claim.userId,
      displayName: claim.displayName,
      avatarUrl: claim.avatarUrl,
      totalSpent: 0,
      captures: 0,
      totalReignSeconds: 0,
      longestReignSeconds: 0,
      firstScoredAt: claim.claimedAt,
      lastCapturedAt: claim.claimedAt,
    };
    leaderboard.push(leader);
  }
  leader.displayName = claim.displayName;
  leader.avatarUrl = claim.avatarUrl;
  leader.totalSpent += claim.paidCost;
  leader.captures += 1;
  leader.lastCapturedAt = claim.claimedAt;
  return {
    ...closed,
    crown: { userId: claim.userId, displayName: claim.displayName, avatarUrl: claim.avatarUrl, claimedAt: claim.claimedAt },
    currentCost: claim.nextCost,
    leaderboard: rankLeaderboard(leaderboard).slice(0, MAXIMUM_LEADERS),
    recentRedemptionIds: [...closed.recentRedemptionIds, claim.redemptionId].slice(-MAXIMUM_HISTORY),
  };
}

export function resetCrownState(state, settings, now = Date.now()) {
  const closed = closeActiveReign(state, now);
  const next = { ...closed, currentCost: settings.baseCost };
  delete next.crown;
  return next;
}

export function resetSeasonState(state, settings, now = Date.now()) {
  const closed = closeActiveReign(state, now);
  const winner = rankLeaderboard(closed.leaderboard)[0];
  const next = {
    ...closed,
    seasonMonth: monthKey(now),
    currentCost: settings.baseCost,
    leaderboard: [],
    recentRedemptionIds: [],
    announcedMonth: '',
    ...(winner ? { previousSeason: { month: closed.seasonMonth, winner } } : {}),
  };
  delete next.crown;
  return { state: next, winner };
}

function formatTemplate(template, values, maximum) {
  let result = clean(template, maximum * 3);
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

function holderTitle(settings, displayName) {
  return formatTemplate(settings.holderTitleTemplate, { name: displayName }, 45) || settings.baseRewardTitle;
}

function rolesFor(event) {
  return Array.isArray(event.user?.roles) ? event.user.roles.map((role) => clean(role, 64).toLowerCase()) : [];
}

function rejectionReason(event, settings, state, now) {
  if (event.user?.actorType !== 'human') return 'only a human viewer can capture the crown';
  const roles = rolesFor(event);
  if (!settings.allowBroadcaster && roles.includes('broadcaster')) return 'the broadcaster is not eligible';
  if (!settings.allowModerators && (roles.includes('moderator') || roles.includes('mod'))) return 'moderators are not eligible';
  if (settings.blockCurrentHolder && state.crown?.userId === event.user?.id) return 'the current holder must be challenged by someone else';
  const prior = state.leaderboard.find((entry) => entry.userId === event.user?.id);
  const lastCapture = Date.parse(prior?.lastCapturedAt || '');
  if (settings.userCooldownMinutes > 0 && Number.isFinite(lastCapture)) {
    const remaining = settings.userCooldownMinutes * 60_000 - (now - lastCapture);
    if (remaining > 0) return `your cooldown has ${String(Math.ceil(remaining / 60_000))} minute(s) remaining`;
  }
  return '';
}

async function sendChat(context, message) {
  if (!message) return;
  try { await context.chat.send({ message, routing: 'source', sourcePlatform: 'twitch', overflow: 'reject' }); }
  catch { /* Chat delivery is cosmetic and never rolls back a valid reward operation. */ }
}

async function publishCrown(context, settings, state, title = 'FAN CROWN') {
  if (!settings.showCrownCard) return;
  const leaders = rankLeaderboard(state.leaderboard).slice(0, 5);
  const holder = state.crown ? `${state.crown.displayName} holds the crown` : 'The crown is open';
  const ranking = leaders.length > 0
    ? leaders.map((entry, index) => `${String(index + 1)}. ${entry.displayName} (${String(entry.totalSpent)} pts)`).join(' | ')
    : 'No captures this season';
  try {
    await context.overlay.publish('thsv.fan-crown.card.show', {
      title,
      text: `${holder} - Next cost: ${String(state.currentCost)} - ${ranking}`,
      ...(state.crown?.avatarUrl ? { imageUrl: state.crown.avatarUrl } : {}),
      durationMs: settings.crownCardSeconds * 1_000,
      style: {
        backgroundMode: settings.overlayBackgroundMode,
        backgroundColor: settings.overlayBackgroundColor,
        backgroundOpacity: settings.overlayBackgroundOpacity,
        accentColor: settings.overlayAccentColor,
        textColor: settings.overlayTextColor,
        fontFamily: settings.overlayFontFamily,
      },
    });
  } catch { /* Overlay presentation is optional. */ }
}

async function runController(context, argumentsValue) {
  if (!context.approvedActionIds.includes(CONTROLLER_ACTION_ID)) throw new Error('Fan Crown Controller is not approved.');
  await context.streamerbot.runApprovedAction(CONTROLLER_ACTION_ID, argumentsValue);
}

async function dispatchCancel(event, context) {
  if (!Array.isArray(event.payload?.supportedOperations) || !event.payload.supportedOperations.includes('cancel')) return;
  await runController(context, {
    fanCrownOperation: 'cancel',
    fanCrownRequestId: requestId('cancel'),
    fanCrownRewardId: clean(event.payload.rewardId, 256),
    fanCrownRedemptionId: clean(event.payload.redemptionId, 256),
  });
}

async function requestReset(context, settings, state, operation, announceWinner = false) {
  if (state.pending || !context.approvedActionIds.includes(CONTROLLER_ACTION_ID)) return state;
  const pending = { operation, requestId: requestId(operation), startedAt: Date.now(), announceWinner };
  const reserved = { ...state, pending };
  await context.state.write(reserved);
  try {
    await runController(context, {
      fanCrownOperation: 'reset',
      fanCrownRequestId: pending.requestId,
      fanCrownRewardId: settings.rewardId,
      fanCrownRewardTitle: settings.baseRewardTitle,
      fanCrownRewardCost: settings.baseCost,
    });
    return reserved;
  } catch {
    const rolledBack = withoutPending(reserved);
    await context.state.write(rolledBack);
    return rolledBack;
  }
}

async function announceWinner(context, settings, state, winner) {
  if (!settings.announceMonthlyWinner || !winner || state.announcedMonth === state.previousSeason?.month) return state;
  const message = formatTemplate(settings.monthlyWinnerMessageTemplate, {
    name: winner.displayName,
    points: winner.totalSpent,
    captures: winner.captures,
    longestReignMinutes: Math.floor(winner.longestReignSeconds / 60),
    month: state.previousSeason?.month || '',
  }, 500);
  await sendChat(context, message);
  return { ...state, announcedMonth: state.previousSeason?.month || '' };
}

async function handleRedemption(event, context, settings, state) {
  if (event.platform !== 'twitch' || event.metadata?.simulated === true || event.payload?.verifiedTransport !== true) return state;
  if (clean(event.payload?.rewardId, 256) !== settings.rewardId) return state;
  if (!context.approvedActionIds.includes(CONTROLLER_ACTION_ID)) return state;
  const redemptionId = clean(event.payload?.redemptionId, 256);
  if (!redemptionId || state.recentRedemptionIds.includes(redemptionId)) return state;
  if (state.seasonMonth !== monthKey()) {
    try { await dispatchCancel(event, context); } catch { /* A failed refund is logged by the controller. */ }
    return requestReset(context, settings, state, 'reset-month', true);
  }
  if (state.pending) {
    try { await dispatchCancel(event, context); } catch { /* A concurrent redemption remains visible in Twitch's queue if refund dispatch is unavailable. */ }
    return state;
  }
  const userId = clean(event.user?.id, 256);
  const displayName = clean(event.user?.displayName || event.user?.name, 100);
  const paidCost = integer(event.payload?.rewardCost, 1, MAXIMUM_COST, 0);
  if (!userId || !displayName || !paidCost) {
    try { await dispatchCancel(event, context); } catch { /* Invalid identity stays pending when administration is unavailable. */ }
    return state;
  }
  const now = Date.now();
  const reason = rejectionReason(event, settings, state, now);
  if (reason) {
    try { await dispatchCancel(event, context); } catch { /* Rejection remains pending when administration is unavailable. */ }
    if (settings.notifyRejectedClaims) {
      await sendChat(context, formatTemplate(settings.rejectedMessageTemplate, { name: displayName, reason }, 500));
    }
    return state;
  }
  const nextCost = calculateNextCost(Math.max(paidCost, state.currentCost), settings);
  const claim = {
    userId,
    displayName,
    avatarUrl: safeHttps(event.user?.avatarUrl),
    rewardId: settings.rewardId,
    redemptionId,
    claimedAt: new Date(now).toISOString(),
    paidCost,
    nextCost,
    rewardTitle: holderTitle(settings, displayName),
  };
  const pending = { operation: 'claim', requestId: requestId('claim'), startedAt: now, claim, announceWinner: false };
  const reserved = { ...state, pending };
  await context.state.write(reserved);
  try {
    await runController(context, {
      fanCrownOperation: 'claim',
      fanCrownRequestId: pending.requestId,
      fanCrownRewardId: settings.rewardId,
      fanCrownRedemptionId: redemptionId,
      fanCrownRewardTitle: claim.rewardTitle,
      fanCrownRewardCost: nextCost,
      fanCrownPreviousTitle: state.crown ? holderTitle(settings, state.crown.displayName) : settings.baseRewardTitle,
      fanCrownPreviousCost: state.currentCost,
    });
    return reserved;
  } catch {
    const rolledBack = withoutPending(reserved);
    await context.state.write(rolledBack);
    return rolledBack;
  }
}

async function handleControllerResult(event, context, settings, state) {
  const request = clean(event.payload?.requestId, 100);
  if (!state.pending || state.pending.requestId !== request) return state;
  if (event.payload?.success !== true) {
    const failed = withoutPending(state);
    await context.state.write(failed);
    return failed;
  }
  const operation = state.pending.operation;
  if (operation === 'claim' && state.pending.claim) {
    const completed = withoutPending(applyCapture(state, state.pending.claim));
    await context.state.write(completed);
    const leader = completed.leaderboard.find((entry) => entry.userId === state.pending.claim.userId);
    if (settings.announceCaptures) {
      await sendChat(context, formatTemplate(settings.captureMessageTemplate, {
        name: state.pending.claim.displayName,
        cost: state.pending.claim.paidCost,
        nextCost: state.pending.claim.nextCost,
        captures: leader?.captures || 1,
      }, 500));
    }
    await publishCrown(context, settings, completed, 'NEW FAN CROWN');
    return completed;
  }
  if (operation === 'reset-crown') {
    const completed = withoutPending(resetCrownState(state, settings));
    await context.state.write(completed);
    await publishCrown(context, settings, completed, 'FAN CROWN RESET');
    return completed;
  }
  if (operation === 'reset-month') {
    const result = resetSeasonState(state, settings);
    let completed = withoutPending(result.state);
    completed = state.pending.announceWinner ? await announceWinner(context, settings, completed, result.winner) : completed;
    await context.state.write(completed);
    await publishCrown(context, settings, completed, 'NEW FAN CROWN SEASON');
    return completed;
  }
  return state;
}

async function handleEvent(event, context) {
  const settings = settingsFor(context);
  if (!settings.enabled || !settings.configured) return;
  const state = sanitizeState(await context.state.read(), settings.baseCost);
  if (event.eventType === CONTROLLER_RESULT_EVENT) {
    await handleControllerResult(event, context, settings, state);
    return;
  }
  if (event.eventType === CONTROL_EVENT) {
    const action = clean(event.payload?.action, 30);
    if (action === 'reset-crown') await requestReset(context, settings, state, 'reset-crown');
    else if (action === 'reset-month') await requestReset(context, settings, state, 'reset-month');
    return;
  }
  if (state.seasonMonth !== monthKey()) {
    if (event.eventType === 'reward.redemption' && clean(event.payload?.rewardId, 256) === settings.rewardId) {
      try { await dispatchCancel(event, context); } catch { /* The controller logs refund failures. */ }
    }
    await requestReset(context, settings, state, 'reset-month', true);
    return;
  }
  if (event.eventType === 'stream.online' && event.platform === 'twitch' && event.metadata?.simulated !== true && settings.resetEachStream) {
    const cycleId = clean(event.source?.eventId || event.eventId, 256);
    if (cycleId && cycleId !== state.streamCycleId) {
      const next = { ...state, streamCycleId: cycleId };
      await context.state.write(next);
      await requestReset(context, settings, next, 'reset-crown');
    }
    return;
  }
  if (event.eventType === 'reward.redemption') await handleRedemption(event, context, settings, state);
}

function enqueue(task) {
  eventQueue = eventQueue.then(task, task);
  return eventQueue;
}

function cancelResetCheck(context) {
  if (resetCheckTaskId) context.schedule.cancel(resetCheckTaskId);
  resetCheckTaskId = undefined;
}

function scheduleResetCheck(context) {
  cancelResetCheck(context);
  if (stopped) return;
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const delay = Math.max(1_000, Math.min(MAXIMUM_DAY_MS, nextMidnight - now.getTime() + 1_000));
  resetCheckTaskId = context.schedule.after(delay, () => enqueue(async () => {
    resetCheckTaskId = undefined;
    const settings = settingsFor(context);
    if (settings.enabled && settings.configured) {
      const state = sanitizeState(await context.state.read(), settings.baseCost);
      if (state.seasonMonth !== monthKey()) await requestReset(context, settings, state, 'reset-month', true);
    }
    scheduleResetCheck(context);
  }));
}

const module = {
  manifest,
  required: false,
  async start(context) {
    stopped = false;
    const settings = settingsFor(context);
    if (settings.enabled && settings.configured) {
      const state = sanitizeState(await context.state.read(), settings.baseCost);
      if (state.seasonMonth !== monthKey()) await requestReset(context, settings, state, 'reset-month', true);
      else await publishCrown(context, settings, state);
      scheduleResetCheck(context);
    }
  },
  async stop(context) {
    stopped = true;
    cancelResetCheck(context);
    eventQueue = Promise.resolve();
  },
  async onEvent(event, context) {
    await enqueue(() => handleEvent(event, context));
  },
};

export { CONTROLLER_ACTION_ID };
export default module;
