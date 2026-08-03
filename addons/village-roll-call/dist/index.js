// Village Roll Call accepts Twitch/Kick rewards and YouTube/TikTok point commands.
const MODULE_ID = 'thsv.village-roll-call';
const FALLBACKS = Object.freeze({
  enabled: false,
  rewardId: '',
  kickRewardId: '',
  commandName: 'checkin',
  pointsCost: 25,
  timeZone: 'America/Chicago',
  successfulMessage: '{name} checked in! You have {count} check-ins for {month} and rank #{rank}.',
  duplicateMessage: '{name}, you already checked in today.',
  announceDuplicates: true,
  announceMonthlyWinner: true,
  monthlyWinnerMessage: '{name} won the {month} Village Roll Call with {count} check-ins!',
  showLeaderboardCard: true,
  leaderboardSize: 5,
  cardSeconds: 20,
});
let operation = Promise.resolve();

const manifest = {
  contractVersion: '2.0.0-preview.1',
  moduleId: MODULE_ID,
  name: 'Village Roll Call',
  version: '3.5.0',
  minimumCoreVersion: '2.0.0-preview.1',
  maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '3.5.0', maximumTestedBridgeVersion: '3.5.0',
  dependencies: ['thsv.viewer-foundation'],
  requiredCapabilities: [],
  configurationSchema: 'schemas/config.json',
  eventSubscriptions: ['reward.redemption', 'command.received', 'stream.online'],
  commandsProvided: [{ id: 'village-roll-call.checkin', name: 'checkin' }],
  actionsProvided: [],
  browserSourcesProvided: [],
  dataStorageOwned: [`data/addons/${MODULE_ID}/`, `data/addons/.state/${MODULE_ID}/`],
  installationSteps: [
    'Create Twitch and Kick check-in rewards. Keep both Reward Redemption triggers attached to their platform intakes.',
    'Create the configured no-response check-in command for YouTube and TikTok through Command Sync.',
    'Enable Viewer Foundation, choose the points cost and calendar time zone, then enable Village Roll Call.',
    'Optionally add the hosted browser source to OBS, Meld, or Streamlabs and send a preview.',
  ],
  uninstallationSteps: ['Uninstall the add-on. Its bounded private leaderboard remains preserved for a later reinstall.'],
  migrations: [],
  healthChecks: [{ id: `${MODULE_ID}.runtime`, description: 'Confirms daily uniqueness, monthly rollover, bounded state, and overlay cards.' }],
};

function clean(value, maximum = 256) {
  return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '')].slice(0, maximum).join('');
}
function integer(value, minimum, maximum, fallback) {
  return Number.isSafeInteger(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}
function scopedUserId(value) {
  const userId = clean(value, 256);
  return userId && !userId.includes(':') ? `twitch:${userId}` : userId;
}
function validTimeZone(value) {
  const candidate = clean(value, 100) || FALLBACKS.timeZone;
  try { new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(); return candidate; }
  catch { return FALLBACKS.timeZone; }
}
function settingsFor(context) {
  const raw = { ...FALLBACKS, ...(context.settings || {}) };
  return {
    ...raw,
    rewardId: clean(raw.rewardId, 256),
    kickRewardId: clean(raw.kickRewardId, 256),
    commandName: clean(raw.commandName, 64).toLowerCase() || 'checkin',
    pointsCost: integer(raw.pointsCost, 1, 1000000, 25),
    timeZone: validTimeZone(raw.timeZone),
    leaderboardSize: integer(raw.leaderboardSize, 1, 10, 5),
    cardSeconds: integer(raw.cardSeconds, 5, 3600, 20),
  };
}
function calendarParts(timestamp, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(timestamp)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, month: `${parts.year}-${parts.month}` };
}
function monthName(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
}
function safeEntry(value) {
  if (!value || typeof value !== 'object') return undefined;
  const userId = scopedUserId(value.userId);
  const displayName = clean(value.displayName, 100);
  const count = integer(value.count, 0, 31, 0);
  const lastDay = clean(value.lastDay, 10);
  const firstAt = clean(value.firstAt, 40);
  const lastAt = clean(value.lastAt, 40);
  return userId && displayName && count > 0 && /^\d{4}-\d{2}-\d{2}$/u.test(lastDay)
    ? { userId, displayName, count, lastDay, firstAt, lastAt }
    : undefined;
}
function rank(entries) {
  return [...entries].sort((left, right) => right.count - left.count
    || left.firstAt.localeCompare(right.firstAt)
    || left.displayName.localeCompare(right.displayName));
}
function emptyState(now, timeZone) {
  return { version: 1, month: calendarParts(now, timeZone).month, entries: [], processedRedemptions: [], announcedMonth: '' };
}
function sanitizeState(value, now, timeZone) {
  const fallback = emptyState(now, timeZone);
  if (!value || typeof value !== 'object') return fallback;
  const entries = Array.isArray(value.entries) ? value.entries.map(safeEntry).filter(Boolean).slice(0, 500) : [];
  const processedRedemptions = Array.isArray(value.processedRedemptions)
    ? [...new Set(value.processedRedemptions.map((item) => clean(item, 256)).filter(Boolean))].slice(-1000)
    : [];
  const previousWinner = safeEntry(value.previousWinner);
  return {
    version: 1,
    month: /^\d{4}-\d{2}$/u.test(value.month) ? value.month : fallback.month,
    entries: rank(entries),
    processedRedemptions,
    announcedMonth: clean(value.announcedMonth, 7),
    ...(previousWinner ? { previousWinner, previousMonth: clean(value.previousMonth, 7) } : {}),
  };
}
function rollover(state, now, timeZone) {
  const currentMonth = calendarParts(now, timeZone).month;
  if (state.month === currentMonth) return { state, winner: undefined };
  const winner = rank(state.entries)[0];
  return {
    state: {
      version: 1,
      month: currentMonth,
      entries: [],
      processedRedemptions: [],
      announcedMonth: '',
      ...(winner ? { previousWinner: winner, previousMonth: state.month } : {}),
    },
    winner,
  };
}
function format(template, values, maximum = 500) {
  let result = clean(template, maximum * 2);
  for (const [key, value] of Object.entries(values)) result = result.replaceAll(`{${key}}`, clean(String(value), maximum));
  return [...result].slice(0, maximum).join('');
}
async function sendChat(context, message, platform = 'twitch') {
  if (!message) return;
  try { await context.chat.send({ message, routing: 'source', sourcePlatform: platform, overflow: 'reject' }); }
  catch { /* A cosmetic chat failure never corrupts a valid check-in. */ }
}
async function publishCard(context, settings, state, title = 'VILLAGE ROLL CALL') {
  if (!settings.showLeaderboardCard) return;
  const leaders = rank(state.entries).slice(0, settings.leaderboardSize);
  const text = leaders.length
    ? leaders.map((entry, index) => `${String(index + 1)}. ${entry.displayName} (${String(entry.count)})`).join(' • ')
    : 'No check-ins yet this month.';
  try { await context.overlay.publish(`${MODULE_ID}.card.show`, { title, text, durationMs: settings.cardSeconds * 1000 }); }
  catch { /* OBS presentation is optional. */ }
}
async function announceWinner(context, settings, state, winner, platform) {
  if (!settings.announceMonthlyWinner || !winner || state.announcedMonth === state.previousMonth) return state;
  await sendChat(context, format(settings.monthlyWinnerMessage, {
    name: winner.displayName, count: winner.count, month: monthName(state.previousMonth || ''),
  }), platform);
  return { ...state, announcedMonth: state.previousMonth || '' };
}
export async function processRollCallEvent(event, context, now = Date.now()) {
  const settings = settingsFor(context);
  if (!settings.enabled) return { accepted: false, reason: 'disabled-or-unconfigured' };
  const configuredReward = event.platform === 'twitch' ? settings.rewardId : event.platform === 'kick' ? settings.kickRewardId : '';
  const matchingReward = event.eventType === 'reward.redemption' && ['twitch', 'kick'].includes(event.platform)
    && event.payload?.verifiedTransport === true && configuredReward && clean(event.payload?.rewardId, 256) === configuredReward;
  const matchingCommand = event.eventType === 'command.received' && ['youtube', 'tiktok'].includes(event.platform) && clean(event.payload?.command, 64).toLowerCase() === settings.commandName;
  if (event.metadata?.simulated === true) {
    if (!matchingReward && !matchingCommand) return { accepted: false, reason: 'simulated-unrelated' };
    const displayName = clean(event.user?.displayName || event.user?.name, 100) || 'Sample Villager';
    await context.overlay.publish(`${MODULE_ID}.card.show`, {
      title: 'VILLAGE ROLL CALL • PREVIEW',
      text: `1. ${displayName} (7) • 2. Sample Villager (5) • 3. CozySloth (4)`,
      durationMs: settings.cardSeconds * 1000,
    });
    return { accepted: true, simulated: true };
  }
  let state = sanitizeState(await context.state.read(), now, settings.timeZone);
  const rolled = rollover(state, now, settings.timeZone);
  state = await announceWinner(context, settings, rolled.state, rolled.winner, event.platform);
  if (event.eventType === 'stream.online') {
    await context.state.write(state);
    return { accepted: false, reason: 'rollover-only' };
  }
  if (!matchingReward && !matchingCommand) return { accepted: false, reason: 'unrelated' };
  const providerUserId = clean(event.user?.id, 240);
  const userId = providerUserId ? `${event.platform}:${providerUserId}` : '';
  const displayName = clean(event.user?.displayName || event.user?.name, 100);
  const redemptionId = clean(event.payload?.redemptionId || event.source?.eventId || event.eventId, 256);
  if (!userId || !displayName || !redemptionId) return { accepted: false, reason: 'missing-stable-identity' };
  if (state.processedRedemptions.includes(redemptionId)) return { accepted: false, reason: 'duplicate-redemption' };
  const day = calendarParts(now, settings.timeZone).day;
  const entries = state.entries.map((entry) => ({ ...entry }));
  let entry = entries.find((candidate) => candidate.userId === userId);
  if (entry?.lastDay === day) {
    state = { ...state, processedRedemptions: [...state.processedRedemptions, redemptionId].slice(-1000) };
    await context.state.write(state);
    if (settings.announceDuplicates) await sendChat(context, format(settings.duplicateMessage, { name: displayName }), event.platform);
    return { accepted: false, reason: 'already-checked-in' };
  }
  let points;
  if (matchingCommand) {
    const projection = await context.viewerFoundation.getProjection({ platform: event.platform, userId: providerUserId });
    if (!projection) return { accepted: false, reason: 'viewer-profile-unavailable' };
    const idempotencyKey = `village-roll-call:${redemptionId}`;
    try { await context.viewerFoundation.mutate({ viewerId: projection.viewerId, operation: 'spend', amount: settings.pointsCost, reason: 'Village Roll Call check-in', idempotencyKey }); points = { viewerId: projection.viewerId, idempotencyKey }; }
    catch { await sendChat(context, `You need ${String(settings.pointsCost)} ${projection.currencyName || 'points'} to check in.`, event.platform); return { accepted: false, reason: 'insufficient-points' }; }
  }
  const timestamp = new Date(now).toISOString();
  if (!entry) {
    entry = { userId, displayName, count: 0, lastDay: day, firstAt: timestamp, lastAt: timestamp };
    entries.push(entry);
  }
  entry.displayName = displayName;
  entry.count += 1;
  entry.lastDay = day;
  entry.lastAt = timestamp;
  state = { ...state, entries: rank(entries).slice(0, 500), processedRedemptions: [...state.processedRedemptions, redemptionId].slice(-1000) };
  try { await context.state.write(state); }
  catch (error) {
    if (points) await context.viewerFoundation.mutate({ viewerId: points.viewerId, operation: 'refund', amount: settings.pointsCost, reason: 'Village Roll Call write rollback', idempotencyKey: `${points.idempotencyKey}:rollback` }).catch(() => undefined);
    throw error;
  }
  const position = state.entries.findIndex((candidate) => candidate.userId === userId) + 1;
  await sendChat(context, format(settings.successfulMessage, {
    name: displayName, count: entry.count, rank: position, month: monthName(state.month),
  }), event.platform);
  await publishCard(context, settings, state);
  return { accepted: true, simulated: false, count: entry.count, rank: position };
}
export { calendarParts, rank as rankRollCall, rollover as rolloverRollCall, sanitizeState as sanitizeRollCallState };
export default {
  manifest,
  required: false,
  async start(context) {
    operation = Promise.resolve();
    const settings = settingsFor(context);
    const state = sanitizeState(await context.state.read(), Date.now(), settings.timeZone);
    await context.state.write(state);
  },
  async stop() { await operation.catch(() => undefined); operation = Promise.resolve(); },
  async onEvent(event, context) { operation = operation.then(() => processRollCallEvent(event, context), () => processRollCallEvent(event, context)); await operation; },
};
