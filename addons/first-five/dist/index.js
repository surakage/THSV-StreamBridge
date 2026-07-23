// First Five runs a Twitch-only, five-place channel-points chain.
// It stores one bounded per-stream claim set and one monthly weighted leaderboard.
const CONTROLLER_ACTION_ID = '5807e453-1cdb-49bf-bad8-d50f785cbc77';
const CONTROLLER_RESULT_EVENT = 'addon.thsv.first-five.controller-result';
const CONTROL_EVENT = 'addon.thsv.first-five.control';
const POSITION_POINTS = Object.freeze([5, 4, 3, 2, 1]);
const ORDINALS = Object.freeze(['1st', '2nd', '3rd', '4th', '5th']);
let eventQueue = Promise.resolve();

const manifest = {
  contractVersion: '2.0.0-preview.1',
  moduleId: 'thsv.first-five',
  name: 'First Five',
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
  dataStorageOwned: ['data/addons/thsv.first-five/', 'data/addons/.state/thsv.first-five/'],
  installationSteps: [
    'Import the separate First Five Streamer.bot package.',
    'Keep its Controller action triggerless and approve only that action for this add-on.',
    'Add Twitch Reward Redemption (Any Reward) to the existing THSV Twitch - Intake action.',
    'Choose five Streamer.bot-owned Twitch reward IDs in placement order, then start with only the first reward enabled.',
  ],
  uninstallationSteps: ['Uninstall the add-on. Its compact leaderboard state remains preserved for a later reinstall.'],
  migrations: [],
  healthChecks: [{ id: 'thsv.first-five.runtime', description: 'Confirms serialized placement claims, reward transitions, and monthly leaderboard state.' }],
};

const FALLBACKS = Object.freeze({
  enabled: true,
  reward1Id: '', reward2Id: '', reward3Id: '', reward4Id: '', reward5Id: '',
  reward1Title: 'Claim 1st Place', reward2Title: 'Claim 2nd Place', reward3Title: 'Claim 3rd Place', reward4Title: 'Claim 4th Place', reward5Title: 'Claim 5th Place',
  claimedTitleTemplate: '{name} was {ordinal}',
  announceClaims: true,
  claimMessageTemplate: '{name} claimed {ordinal} place in First Five!',
  notifyRejectedClaims: false,
  rejectedMessageTemplate: '{name}, you already claimed a First Five place this stream.',
  announceMonthlyWinner: true,
  monthlyWinnerMessageTemplate: 'Last month’s First Five winner was {name} with {points} points!',
  showLeaderboardCard: true,
  leaderboardCardSeconds: 30,
});

function clean(value, maximum = 256) {
  const normalized = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '';
  return [...normalized].slice(0, maximum).join('');
}

function integer(value, minimum, maximum, fallback) {
  return Number.isInteger(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function settingsFor(context) {
  const raw = { ...FALLBACKS, ...(context.settings || {}) };
  const rewardIds = [raw.reward1Id, raw.reward2Id, raw.reward3Id, raw.reward4Id, raw.reward5Id].map((value) => clean(value, 256));
  const availableTitles = [raw.reward1Title, raw.reward2Title, raw.reward3Title, raw.reward4Title, raw.reward5Title].map((value, index) => clean(value, 45) || FALLBACKS[`reward${String(index + 1)}Title`]);
  return {
    ...raw,
    rewardIds,
    availableTitles,
    configured: rewardIds.every(Boolean) && new Set(rewardIds).size === 5,
    leaderboardCardSeconds: integer(raw.leaderboardCardSeconds, 5, 3600, 30),
  };
}

function monthKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function placement(value) {
  if (!value || typeof value !== 'object') return undefined;
  const position = integer(value.position, 1, 5, 0);
  const userId = clean(value.userId, 256);
  const displayName = clean(value.displayName, 100);
  const rewardId = clean(value.rewardId, 256);
  const redemptionId = clean(value.redemptionId, 256);
  const claimedAt = clean(value.claimedAt, 40);
  return position && userId && displayName && rewardId && redemptionId && claimedAt ? { position, userId, displayName, rewardId, redemptionId, claimedAt } : undefined;
}

function leaderboardEntry(value) {
  if (!value || typeof value !== 'object') return undefined;
  const userId = clean(value.userId, 256);
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
  const placements = Array.isArray(source.placements) ? source.placements.map(placement).filter(Boolean).slice(0, 5) : [];
  const leaderboard = Array.isArray(source.leaderboard) ? source.leaderboard.map(leaderboardEntry).filter(Boolean).slice(0, 100) : [];
  const previous = source.previousMonth && typeof source.previousMonth === 'object' ? {
    month: clean(source.previousMonth.month, 7),
    winner: leaderboardEntry(source.previousMonth.winner),
  } : undefined;
  const pending = source.pending && typeof source.pending === 'object' ? {
    requestId: clean(source.pending.requestId, 100),
    eventId: clean(source.pending.eventId, 256),
    placement: placement(source.pending.placement),
    startedAt: integer(source.pending.startedAt, 0, Number.MAX_SAFE_INTEGER, 0),
  } : undefined;
  return {
    version: 1,
    streamCycleId: clean(source.streamCycleId, 256),
    placements,
    leaderboardMonth: /^\d{4}-\d{2}$/u.test(source.leaderboardMonth) ? source.leaderboardMonth : monthKey(now),
    leaderboard,
    ...(previous?.month && previous.winner ? { previousMonth: previous } : {}),
    ...(pending?.requestId && pending.placement ? { pending } : {}),
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

async function sendChat(context, message) {
  if (!message) return;
  try { await context.chat.send({ message, routing: 'source', sourcePlatform: 'twitch', overflow: 'reject' }); }
  catch { /* Chat delivery is cosmetic and never rolls back a valid placement. */ }
}

async function publishLeaderboard(context, settings, state) {
  if (!settings.showLeaderboardCard) return;
  const placements = state.placements.length
    ? state.placements.map((item) => `${ORDINALS[item.position - 1]}: ${item.displayName}`).join(' • ')
    : 'Waiting for the first claim';
  const leaders = rankLeaderboard(state.leaderboard).slice(0, 5);
  const monthly = leaders.length ? leaders.map((entry, index) => `${String(index + 1)}. ${entry.displayName} (${String(entry.points)})`).join(' • ') : 'No monthly claims yet';
  try {
    await context.overlay.publish('thsv.first-five.card.show', {
      title: `FIRST FIVE • ${state.leaderboardMonth}`,
      text: `${placements} — Monthly: ${monthly}`,
      durationMs: settings.leaderboardCardSeconds * 1000,
    });
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
  if (!context.approvedActionIds.includes(CONTROLLER_ACTION_ID)) return state;
  const cycleId = clean(event?.source?.eventId || event?.eventId || requestId('cycle'), 256);
  const next = { ...withoutPending(state), streamCycleId: cycleId, placements: [] };
  try {
    await runController(context, {
      firstFiveOperation: 'reset',
      firstFiveRequestId: requestId('reset'),
      firstFiveReward1Id: settings.rewardIds[0], firstFiveReward1Title: settings.availableTitles[0],
      firstFiveReward2Id: settings.rewardIds[1], firstFiveReward2Title: settings.availableTitles[1],
      firstFiveReward3Id: settings.rewardIds[2], firstFiveReward3Title: settings.availableTitles[2],
      firstFiveReward4Id: settings.rewardIds[3], firstFiveReward4Title: settings.availableTitles[3],
      firstFiveReward5Id: settings.rewardIds[4], firstFiveReward5Title: settings.availableTitles[4],
    });
  } catch {
    return state;
  }
  await context.state.write(next);
  await publishLeaderboard(context, settings, next);
  return next;
}

async function handleRedemption(event, context, settings, state) {
  if (event.platform !== 'twitch' || event.metadata?.simulated === true || event.payload?.verifiedTransport !== true) return state;
  const rewardId = clean(event.payload?.rewardId, 256);
  const position = settings.rewardIds.indexOf(rewardId) + 1;
  if (position === 0) return state;
  if (!context.approvedActionIds.includes(CONTROLLER_ACTION_ID)) return state;
  const redemptionId = clean(event.payload?.redemptionId, 256);
  const userId = clean(event.user?.id, 256);
  const displayName = clean(event.user?.displayName || event.user?.name, 100);
  if (!redemptionId || !userId || !displayName) return state;
  const expectedPosition = state.placements.length + 1;
  const alreadyClaimed = state.placements.some((item) => item.userId === userId);
  if (state.pending || position !== expectedPosition || alreadyClaimed) {
    try { await dispatchCancel(event, context); } catch { /* Leave the redemption pending if cancellation dispatch is unavailable. */ }
    if (alreadyClaimed && settings.notifyRejectedClaims) {
      await sendChat(context, formatTemplate(settings.rejectedMessageTemplate, { name: displayName }, 500));
    }
    return state;
  }
  const claim = { position, userId, displayName, rewardId, redemptionId, claimedAt: new Date().toISOString() };
  const pending = { requestId: requestId('claim'), eventId: clean(event.eventId, 256), placement: claim, startedAt: Date.now() };
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
  if (!state.pending || state.pending.requestId !== request || clean(event.payload?.operation, 20) !== 'claim') return state;
  if (event.payload?.success !== true) {
    const failed = withoutPending(state);
    await context.state.write(failed);
    return failed;
  }
  const claim = state.pending.placement;
  const completed = {
    ...withoutPending(state),
    placements: [...state.placements, claim].sort((left, right) => left.position - right.position).slice(0, 5),
    leaderboard: addLeaderboardClaim(state.leaderboard, claim),
  };
  await context.state.write(completed);
  if (settings.announceClaims) {
    await sendChat(context, formatTemplate(settings.claimMessageTemplate, { name: claim.displayName, ordinal: ORDINALS[claim.position - 1], position: claim.position }, 500));
  }
  await publishLeaderboard(context, settings, completed);
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

  if (event.eventType === 'stream.online' && event.platform === 'twitch' && event.metadata?.simulated !== true) {
    await resetStream(event, context, settings, state);
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
}

const module = {
  manifest,
  required: false,
  async start(context) {
    const settings = settingsFor(context);
    if (!settings.enabled || !settings.configured) return;
    await publishLeaderboard(context, settings, sanitizeState(await context.state.read()));
  },
  async stop() { eventQueue = Promise.resolve(); },
  async onEvent(event, context) {
    eventQueue = eventQueue.then(() => handleEvent(event, context));
    await eventQueue;
  },
};

export { CONTROLLER_ACTION_ID, monthKey };
export default module;
