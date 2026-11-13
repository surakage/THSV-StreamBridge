// Viewer Foundation owns pseudonymous cross-platform identity and replay-safe progression.
// It stores each viewer's latest display name and login so the creator can find them in the points list,
// but never chat text, avatars, OAuth data, or raw platform IDs.
const EVENT_POINTS = Object.freeze({
  'chat.message': 'chatMessagePoints',
  'channel.follow': 'followPoints',
  'channel.subscription': 'subscriptionPoints',
  'channel.membership': 'membershipPoints',
  'channel.gift-subscription': 'giftSubscriptionPoints',
  'engagement.gift': 'giftPoints',
  'engagement.cheer': 'cheerPoints',
  'engagement.super-chat': 'superChatPoints',
  'channel.raid': 'raidPoints',
  'reward.redemption': 'rewardRedemptionPoints',
});
const ACTIVITY_KEYS = Object.freeze([...Object.keys(EVENT_POINTS), 'chat.consistency', 'time.active', 'time.lurk']);
const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first-steps', label: 'First Steps', points: 100 }),
  Object.freeze({ id: 'village-regular', label: 'Regular', points: 500 }),
  Object.freeze({ id: 'community-supporter', label: 'Community Supporter', points: 1_000 }),
  Object.freeze({ id: 'village-veteran', label: 'Veteran', points: 2_500 }),
  Object.freeze({ id: 'village-legend', label: 'Legend', points: 5_000 }),
]);

const manifest = {
  contractVersion: '2.0.0-preview.1',
  moduleId: 'thsv.viewer-foundation',
  name: 'Viewer Foundation',
  version: '4.1.93',
  minimumCoreVersion: '2.0.0-preview.1',
  maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.1.93', maximumTestedBridgeVersion: '4.1.93',
  dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: [...Object.keys(EVENT_POINTS), 'command.received', 'stream.online', 'stream.offline'],
  commandsProvided: [{ id: 'viewer-foundation.balance', name: 'points' }, { id: 'viewer-foundation.add-points', name: 'addpoints' }, { id: 'viewer-foundation.remove-points', name: 'removepoints' }], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.viewer-foundation/', 'data/addons/.state/thsv.viewer-foundation/'],
  installationSteps: [
    'Open the built-in Viewer Foundation page and review its private identity and progression settings.',
    'Optionally add explicit account links using viewer-id|platform|stable-user-id. Never link accounts by display name.',
    'Name the currency and choose chat, consistency, observed time, lurk, and event awards; then save and restart StreamBridge.',
    'Choose the balance and lurk command names. They work through your existing chat connection after restart.',
  ],
  uninstallationSteps: ['Viewer Foundation is a required Bridge integration and cannot be uninstalled separately.'],
  migrations: [],
  healthChecks: [{ id: 'thsv.viewer-foundation.runtime', description: 'Checks your points name, private viewer matching, chat/watch-time/event points within their limits, protection against counting an event twice, and safe saving of private progress.' }],
};

const FALLBACKS = Object.freeze({
  enabled: true, includeSimulated: false, currencyName: 'Points', pointsCommand: 'points', accountLinks: [],
  chatMessagePoints: 1, chatCooldownSeconds: 60,
  chatConsistencyMessages: 5, chatConsistencyPoints: 5,
  activeMinutesRequired: 10, activeMinutesPoints: 5, activeWindowMinutes: 20,
  lurkCommand: 'lurk', lurkMinutesRequired: 10, lurkMinutesPoints: 5, maximumTimeAwardsPerEvent: 6,
  followPoints: 25, subscriptionPoints: 100, membershipPoints: 100,
  giftSubscriptionPoints: 75, giftPoints: 50, cheerPoints: 25,
  superChatPoints: 100, raidPoints: 100, rewardRedemptionPoints: 25,
  maximumViewers: 2000, processedEventLimit: 200, processedEventTtlHours: 168,
  modCommandsEnabled: false, addPointsCommand: 'addpoints', removePointsCommand: 'removepoints',
  levelStepPoints: 100, achievementsEnabled: true,
  pointsRewards: [], pointsRewardPlatforms: ['twitch', 'youtube', 'kick', 'tiktok', 'facebook'],
  pointsRewardBoughtMessage: '{user} spent {cost} {currency} on {reward}.',
  pointsRewardShortMessage: '{user}, {reward} costs {cost} {currency}. You have {points}.',
  pointsRewardCooldownMessage: '{user}, {reward} is ready again in {seconds} seconds.',
});

const PLATFORM = /^(twitch|youtube|kick|tiktok|facebook)$/u;
const VIEWER_ID = /^[a-z][a-z0-9-]{0,63}$/u;
const GENERATED_VIEWER_ID = /^(?:twitch|youtube|kick|tiktok|facebook)-[a-f0-9]{24}$/u;
// Stays below the broker's 1 MB private-state limit; the least recently seen viewers are dropped first.
const MAXIMUM_STATE_BYTES = 900_000;
const MAXIMUM_PENDING = 3_000;
const MAXIMUM_IMPORT_ROWS = 3_000;
const LIST_PAGE_SIZE = 50;
const EXPORT_PAGE_SIZE = 400;
const MAXIMUM_POINTS_REWARDS = 40;
const ALL_PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok', 'facebook']);
const CHAT_LIMITS = Object.freeze({ twitch: 500, youtube: 200, kick: 500, tiktok: 150, facebook: 500 });
let operation = Promise.resolve();
let unregisterProvider;
const livePlatforms = new Set();

function clean(value, maximum = 256) {
  const normalized = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, '').trim() : '';
  return [...normalized].slice(0, maximum).join('');
}

function integer(value, minimum, maximum, fallback) {
  return Number.isSafeInteger(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function randomSalt() {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((item) => item.toString(16).padStart(2, '0')).join('');
}

export function parseAccountLinks(values) {
  const result = new Map();
  const viewerIds = new Set();
  const conflicts = [];
  for (const raw of Array.isArray(values) ? values.slice(0, 100) : []) {
    const parts = clean(raw, 600).split('|').map((part) => part.trim());
    if (parts.length !== 3 || !VIEWER_ID.test(parts[0]) || GENERATED_VIEWER_ID.test(parts[0]) || !PLATFORM.test(parts[1]) || !parts[2] || parts[2].length > 256) continue;
    const key = `${parts[1]}\u0000${parts[2]}`;
    if (result.has(key) && result.get(key) !== parts[0]) { conflicts.push(key); continue; }
    result.set(key, parts[0]); viewerIds.add(parts[0]);
  }
  return { accounts: result, viewerIds, conflicts };
}

function commandWord(value) {
  const match = clean(value, 80).normalize('NFKC').match(/^!?(\S+)/u);
  return match ? match[1].toLowerCase().slice(0, 40) : '';
}

/** Each row: "Reward name | !command | cost | Twitch reward ID | cooldown seconds". The Twitch ID is optional;
 *  when it is set, extensions that listen for that Twitch reward react to the points purchase too. */
export function parsePointsRewards(values) {
  const rewards = []; const seen = new Set();
  for (const raw of Array.isArray(values) ? values.slice(0, MAXIMUM_POINTS_REWARDS) : []) {
    const parts = clean(raw, 600).split('|').map((part) => part.trim());
    const title = clean(parts[0], 100); const command = commandWord(parts[1]);
    const cost = Number.parseInt(parts[2] || '', 10);
    if (!title || !command || !Number.isSafeInteger(cost) || cost < 0 || cost > 1_000_000 || seen.has(command)) continue;
    const cooldown = Number.parseInt(parts[4] || '0', 10);
    seen.add(command);
    rewards.push(Object.freeze({ title, command, cost, twitchRewardId: clean(parts[3], 256), cooldownSeconds: Number.isSafeInteger(cooldown) ? Math.min(86_400, Math.max(0, cooldown)) : 0 }));
  }
  return rewards;
}

function fillTemplate(template, values) {
  let result = clean(template, 500);
  for (const [key, value] of Object.entries(values)) result = result.replaceAll(`{${key}}`, String(value));
  return result;
}

function settingsFor(context) {
  const raw = { ...FALLBACKS, ...(context.settings || {}) };
  const links = parseAccountLinks(raw.accountLinks);
  const activeMinutesRequired = integer(raw.activeMinutesRequired, 1, 120, 10);
  const activeWindowMinutes = Math.max(activeMinutesRequired, integer(raw.activeWindowMinutes, 1, 240, 20));
  if (links.conflicts.length > 0) throw new Error('One stable platform account is assigned to more than one Viewer Foundation ID.');
  return {
    ...raw,
    links,
    currencyName: clean(raw.currencyName, 40) || 'Points',
    pointsCommand: clean(raw.pointsCommand, 40).toLowerCase() || 'points',
    chatMessagePoints: integer(raw.chatMessagePoints, 0, 10000, 1),
    chatCooldownSeconds: integer(raw.chatCooldownSeconds, 0, 86400, 60),
    chatConsistencyMessages: integer(raw.chatConsistencyMessages, 2, 100, 5),
    chatConsistencyPoints: integer(raw.chatConsistencyPoints, 0, 10000, 5),
    activeMinutesRequired,
    activeMinutesPoints: integer(raw.activeMinutesPoints, 0, 10000, 5),
    activeWindowMinutes,
    lurkCommand: clean(raw.lurkCommand, 40).toLowerCase() || 'lurk',
    lurkMinutesRequired: integer(raw.lurkMinutesRequired, 1, 120, 10),
    lurkMinutesPoints: integer(raw.lurkMinutesPoints, 0, 10000, 5),
    maximumTimeAwardsPerEvent: integer(raw.maximumTimeAwardsPerEvent, 1, 24, 6),
    followPoints: integer(raw.followPoints, 0, 10000, 25),
    subscriptionPoints: integer(raw.subscriptionPoints, 0, 10000, 100),
    membershipPoints: integer(raw.membershipPoints, 0, 10000, 100),
    giftSubscriptionPoints: integer(raw.giftSubscriptionPoints, 0, 10000, 75),
    giftPoints: integer(raw.giftPoints, 0, 10000, 50),
    cheerPoints: integer(raw.cheerPoints, 0, 10000, 25),
    superChatPoints: integer(raw.superChatPoints, 0, 10000, 100),
    raidPoints: integer(raw.raidPoints, 0, 10000, 100),
    rewardRedemptionPoints: integer(raw.rewardRedemptionPoints, 0, 10000, 25),
    // 250 was the old default limit; it now means the new, larger default.
    maximumViewers: raw.maximumViewers === 250 ? 2000 : integer(raw.maximumViewers, 25, 3000, 2000),
    modCommandsEnabled: raw.modCommandsEnabled === true,
    addPointsCommand: clean(raw.addPointsCommand, 40).toLowerCase() || 'addpoints',
    removePointsCommand: clean(raw.removePointsCommand, 40).toLowerCase() || 'removepoints',
    processedEventLimit: integer(raw.processedEventLimit, 25, 500, 200),
    processedEventTtlHours: integer(raw.processedEventTtlHours, 1, 720, 168),
    levelStepPoints: integer(raw.levelStepPoints, 10, 1000000, 100),
    pointsRewards: parsePointsRewards(raw.pointsRewards),
    pointsRewardPlatforms: new Set((Array.isArray(raw.pointsRewardPlatforms) ? raw.pointsRewardPlatforms : ALL_PLATFORMS).filter((platform) => ALL_PLATFORMS.includes(platform))),
  };
}

function sanitizeViewer(value, levelStepPoints) {
  if (!value || typeof value !== 'object') return undefined;
  const points = integer(value.points, 0, Number.MAX_SAFE_INTEGER, 0);
  const lastAwardAt = {};
  if (value.lastAwardAt && typeof value.lastAwardAt === 'object') {
    for (const eventType of ACTIVITY_KEYS) {
      const time = value.lastAwardAt[eventType];
      if (Number.isSafeInteger(time) && time >= 0) lastAwardAt[eventType] = time;
    }
  }
  return {
    points, level: Math.floor(points / levelStepPoints) + 1, lastAwardAt,
    lastSeenAt: integer(value.lastSeenAt, 0, Number.MAX_SAFE_INTEGER, 0),
    lastChatAt: integer(value.lastChatAt, 0, Number.MAX_SAFE_INTEGER, 0),
    attendanceAwardedAt: integer(value.attendanceAwardedAt, 0, Number.MAX_SAFE_INTEGER, 0),
    lurkSince: integer(value.lurkSince, 0, Number.MAX_SAFE_INTEGER, 0),
    chatProgress: integer(value.chatProgress, 0, 99, 0),
    ...identityFields(value),
  };
}

// The viewer's latest display name, login and platform, so the creator can find them by name.
function identityFields(value) {
  const name = clean(value?.name, 80); const login = clean(value?.login, 80).toLowerCase(); const platform = clean(value?.platform, 16);
  return { ...(name ? { name } : {}), ...(login ? { login } : {}), ...(PLATFORM.test(platform) ? { platform } : {}) };
}
function eventIdentityFields(event) {
  return identityFields({ name: event.user?.displayName || event.user?.name, login: event.user?.name || event.user?.displayName, platform: event.platform });
}
function nameKey(value) { return clean(value, 80).replace(/^@/u, '').toLowerCase(); }
function pendingKey(platform, login) { return `${PLATFORM.test(platform) ? platform : 'any'}:${nameKey(login)}`; }
function sanitizePending(value) {
  const result = {};
  const entries = value && typeof value === 'object' ? Object.entries(value) : [];
  for (const [key, item] of entries.slice(0, MAXIMUM_PENDING)) {
    const match = /^(any|twitch|youtube|kick|tiktok|facebook):(.{1,80})$/u.exec(key);
    if (!match || !item || typeof item !== 'object') continue;
    const points = integer(item.points, 0, Number.MAX_SAFE_INTEGER, -1); if (points < 0) continue;
    result[key] = { name: clean(item.name, 80) || match[2], points, at: integer(item.at, 0, Number.MAX_SAFE_INTEGER, 0) };
  }
  return result;
}
function sanitizeLastImport(value) {
  if (!value || typeof value !== 'object' || !/^[a-f0-9]{32}$/u.test(value.id)) return undefined;
  const viewers = {}; const pending = {};
  for (const [viewerId, points] of Object.entries(value.viewers && typeof value.viewers === 'object' ? value.viewers : {}).slice(0, MAXIMUM_IMPORT_ROWS)) if (VIEWER_ID.test(viewerId) && Number.isSafeInteger(points) && points >= 0) viewers[viewerId] = points;
  for (const [key, points] of Object.entries(value.pending && typeof value.pending === 'object' ? value.pending : {}).slice(0, MAXIMUM_IMPORT_ROWS)) if (typeof key === 'string' && key.length <= 100 && Number.isSafeInteger(points) && points >= -1) pending[key] = points;
  return { id: value.id, at: integer(value.at, 0, Number.MAX_SAFE_INTEGER, 0), viewers, pending };
}

export function sanitizeViewerFoundationState(value, settings = FALLBACKS, now = Date.now()) {
  const source = value && typeof value === 'object' ? value : {};
  const salt = /^[a-f0-9]{48}$/u.test(source.salt) ? source.salt : randomSalt();
  const viewers = {};
  const entries = source.viewers && typeof source.viewers === 'object' ? Object.entries(source.viewers) : [];
  const sanitized = entries
    .filter(([viewerId]) => VIEWER_ID.test(viewerId))
    .map(([viewerId, viewer]) => [viewerId, sanitizeViewer(viewer, settings.levelStepPoints)])
    .filter((entry) => entry[1])
    .sort((left, right) => right[1].lastSeenAt - left[1].lastSeenAt)
    .slice(0, settings.maximumViewers);
  for (const [viewerId, viewer] of sanitized) viewers[viewerId] = viewer;
  const cutoff = now - settings.processedEventTtlHours * 3600000;
  const processed = Array.isArray(source.processed) ? source.processed
    .filter((item) => item && typeof item === 'object' && /^[a-f0-9]{32}$/u.test(item.id) && Number.isSafeInteger(item.at) && item.at > cutoff)
    .slice(-settings.processedEventLimit) : [];
  const mutations = Array.isArray(source.mutations) ? source.mutations
    .filter((item) => item && typeof item === 'object' && /^[a-f0-9]{32}$/u.test(item.id) && VIEWER_ID.test(item.viewerId)
      && ['add', 'spend', 'refund'].includes(item.operation) && Number.isSafeInteger(item.amount) && item.amount > 0
      && Number.isSafeInteger(item.previousPoints) && item.previousPoints >= 0 && Number.isSafeInteger(item.totalPoints) && item.totalPoints >= 0
      && Number.isSafeInteger(item.at) && item.at >= 0 && typeof item.callerModuleId === 'string' && typeof item.reason === 'string')
    .map((item) => ({ id: item.id, viewerId: item.viewerId, operation: item.operation, amount: item.amount,
      previousPoints: item.previousPoints, totalPoints: item.totalPoints, at: item.at,
      callerModuleId: clean(item.callerModuleId, 128), reason: clean(item.reason, 120) }))
    .slice(-200) : [];
  const adminAudit = Array.isArray(source.adminAudit) ? source.adminAudit
    .filter((item) => item && typeof item === 'object' && ['correct', 'undo-correction', 'delete', 'delete-all', 'import-legacy', 'link-add', 'link-remove', 'bulk-add', 'import', 'undo-import', 'pending-merge'].includes(item.operation)
      && typeof item.subject === 'string' && Number.isSafeInteger(item.at) && item.at >= 0
      && typeof item.reason === 'string')
    .map((item) => ({ operation: item.operation, subject: clean(item.subject, 64), at: item.at,
      reason: clean(item.reason, 200), ...(Number.isSafeInteger(item.previousPoints) ? { previousPoints: item.previousPoints } : {}),
      ...(Number.isSafeInteger(item.totalPoints) ? { totalPoints: item.totalPoints } : {}),
      ...(/^[a-f0-9]{32}$/u.test(item.id) ? { id: item.id } : {}),
      ...(/^[a-f0-9]{32}$/u.test(item.revertsAuditId) ? { revertsAuditId: item.revertsAuditId } : {}),
      ...(PLATFORM.test(item.platform) ? { platform: item.platform } : {}),
      ...(/^[a-f0-9]{24}$/u.test(item.accountFingerprint) ? { accountFingerprint: item.accountFingerprint } : {}) }))
    .slice(-100) : [];
  const legacyImports = Array.isArray(source.legacyImports) ? source.legacyImports
    .filter((item) => item && typeof item === 'object' && /^[a-f0-9]{64}$/u.test(item.digest) && Number.isSafeInteger(item.at) && item.at >= 0 && Number.isSafeInteger(item.records) && item.records >= 0)
    .map((item) => ({ digest: item.digest, at: item.at, records: item.records })).slice(-10) : [];
  const pending = sanitizePending(source.pending);
  const lastImport = sanitizeLastImport(source.lastImport);
  const rewardCooldowns = {};
  if (source.rewardCooldowns && typeof source.rewardCooldowns === 'object') {
    for (const [key, at] of Object.entries(source.rewardCooldowns).slice(0, MAXIMUM_POINTS_REWARDS)) {
      if (/^points-reward:\S{1,40}$/u.test(key) && Number.isSafeInteger(at) && at > now - 86_400_000) rewardCooldowns[key] = at;
    }
  }
  const state = { version: 1, salt, viewers, processed, mutations, adminAudit, legacyImports, pending, rewardCooldowns, ...(lastImport ? { lastImport } : {}) };
  while (JSON.stringify(state).length > MAXIMUM_STATE_BYTES) {
    if (state.processed.length > 25) { state.processed.shift(); continue; }
    if (state.mutations.length > 25) { state.mutations.shift(); continue; }
    if (state.adminAudit.length > 25) { state.adminAudit.shift(); continue; }
    if (state.legacyImports.length > 2) { state.legacyImports.shift(); continue; }
    if (state.lastImport) { delete state.lastImport; continue; }
    const pendingKeys = Object.keys(state.pending);
    if (pendingKeys.length > 0) { delete state.pending[pendingKeys[0]]; continue; }
    const viewerIds = Object.keys(state.viewers);
    if (viewerIds.length > 25) { delete state.viewers[viewerIds.at(-1)]; continue; }
    throw new Error('Viewer Foundation state cannot fit within the private-state safety limit.');
  }
  return state;
}

async function resolveViewer(event, state, settings) {
  const platform = clean(event.platform, 64);
  const userId = clean(event.user?.id, 256);
  if (!PLATFORM.test(platform) || !userId) return undefined;
  const linked = settings.links.accounts.get(`${platform}\u0000${userId}`);
  if (linked) return { viewerId: linked, linked: true };
  const hash = await digest(`${state.salt}\u0000${platform}\u0000${userId}`);
  return { viewerId: `${platform}-${hash.slice(0, 24)}`, linked: false };
}

async function eventIdentity(event) {
  const stable = clean(event.source?.eventId || event.eventId, 256);
  if (!stable) return undefined;
  return (await digest(`${event.platform}\u0000${event.eventType}\u0000${stable}`)).slice(0, 32);
}

function pointValue(settings, eventType) {
  const key = EVENT_POINTS[eventType];
  return key ? settings[key] : 0;
}

function emptyViewer() {
  return { points: 0, level: 1, lastAwardAt: {}, lastSeenAt: 0, lastChatAt: 0, attendanceAwardedAt: 0, lurkSince: 0, chatProgress: 0 };
}

// Imported points for someone who has not chatted yet wait under their name; the first time they show up, they move onto their real record.
function mergePending(state, viewer, event, now) {
  const login = nameKey(event.user?.name || event.user?.displayName); if (!login) return { viewer, merged: 0 };
  let merged = 0;
  for (const key of [pendingKey(event.platform, login), pendingKey('any', login), pendingKey(event.platform, event.user?.displayName), pendingKey('any', event.user?.displayName)]) {
    const waiting = state.pending[key]; if (!waiting) continue;
    merged += waiting.points; delete state.pending[key];
  }
  if (merged <= 0) return { viewer, merged: 0 };
  const points = Math.min(Number.MAX_SAFE_INTEGER, viewer.points + merged);
  state.adminAudit.push({ operation: 'pending-merge', subject: 'imported-points', at: now, reason: `Imported points joined a viewer record`, totalPoints: merged });
  return { viewer: { ...viewer, points }, merged };
}

function completedIntervals(now, startedAt, awardedAt, minutes, maximum) {
  if (!Number.isSafeInteger(startedAt) || startedAt <= 0) return { count: 0, awardedAt: now };
  const intervalMs = minutes * 60_000;
  const baseline = Math.max(startedAt, Number.isSafeInteger(awardedAt) && awardedAt > 0 ? awardedAt : startedAt);
  const count = Math.min(maximum, Math.max(0, Math.floor((now - baseline) / intervalMs)));
  return { count, awardedAt: baseline + count * intervalMs };
}

function applyObservedActivity(viewerValue, settings, now) {
  const viewer = { ...emptyViewer(), ...viewerValue, lastAwardAt: { ...(viewerValue?.lastAwardAt || {}) } };
  let awarded = 0;
  if (viewer.lurkSince > 0) {
    const settled = completedIntervals(now, viewer.lurkSince, viewer.attendanceAwardedAt, settings.lurkMinutesRequired, settings.maximumTimeAwardsPerEvent);
    awarded += settled.count * settings.lurkMinutesPoints;
    if (settled.count > 0) viewer.lastAwardAt['time.lurk'] = now;
    viewer.lurkSince = 0;
    viewer.attendanceAwardedAt = now;
  } else if (viewer.lastChatAt > 0 && now - viewer.lastChatAt <= settings.activeWindowMinutes * 60_000) {
    const settled = completedIntervals(now, viewer.lastChatAt, viewer.attendanceAwardedAt, settings.activeMinutesRequired, settings.maximumTimeAwardsPerEvent);
    awarded += settled.count * settings.activeMinutesPoints;
    if (settled.count > 0) viewer.lastAwardAt['time.active'] = now;
    viewer.attendanceAwardedAt = settled.count > 0 ? settled.awardedAt : (viewer.attendanceAwardedAt || viewer.lastChatAt);
  } else {
    viewer.attendanceAwardedAt = now;
  }
  return { viewer, awarded };
}

async function sendBalance(context, event, displayName, viewer, settings) {
  const maximum = CHAT_LIMITS[event.platform] || 150;
  const message = clean(`${displayName}, you have ${String(viewer.points)} ${settings.currencyName} and are level ${String(viewer.level)}.`, maximum);
  try { await context.chat.send({ message, routing: 'source', sourcePlatform: event.platform, overflow: 'reject' }); }
  catch { /* A balance reply failure cannot change progression state. */ }
}

function achievementProjection(points, settings) {
  if (settings.achievementsEnabled !== true) return {};
  const achievements = ACHIEVEMENTS.filter((achievement) => points >= achievement.points).map((achievement) => ({ ...achievement }));
  return achievements.length > 0 ? { achievements, latestAchievement: achievements.at(-1) } : {};
}

function isModerator(event) {
  const roles = new Set((event.user?.roles || []).map((role) => clean(role, 30).toLowerCase()));
  return roles.has('broadcaster') || roles.has('moderator') || roles.has('mod');
}

// Viewers whose stored display name or login matches, newest first.
function viewersNamed(state, name, platform = '') {
  const wanted = nameKey(name); if (!wanted) return [];
  return Object.entries(state.viewers)
    .filter(([, viewer]) => (viewer.login === wanted || nameKey(viewer.name) === wanted) && (!platform || viewer.platform === platform))
    .sort((left, right) => right[1].lastSeenAt - left[1].lastSeenAt);
}

async function moderatorPointsCommand(event, context, state, settings, command, now) {
  const args = Array.isArray(event.payload?.arguments) ? event.payload.arguments.map((item) => clean(item, 80)).filter(Boolean) : [];
  const target = args[0] || ''; const amount = Number.parseInt(args[1] || '', 10);
  const reply = async (message) => { try { await context.chat.send({ message: clean(message, CHAT_LIMITS[event.platform] || 150), routing: 'source', sourcePlatform: event.platform, overflow: 'reject' }); } catch { /* reply failures never change points */ } };
  const usage = `Use ${'!'}${settings.addPointsCommand} name amount or ${'!'}${settings.removePointsCommand} name amount.`;
  const matches = viewersNamed(state, target);
  if (!target) { await reply(usage); return { moderatorCommand: true, changed: false }; }
  if (matches.length === 0) { await reply(`I don't know ${nameKey(target)} yet. They need to chat once first.`); return { moderatorCommand: true, changed: false }; }
  const [viewerId, viewer] = matches[0];
  const shown = viewer.name || viewer.login || viewerId;
  if (command === settings.pointsCommand) { await reply(`${shown} has ${String(viewer.points)} ${settings.currencyName} (level ${String(viewer.level)}).`); return { moderatorCommand: true, changed: false }; }
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000) { await reply(usage); return { moderatorCommand: true, changed: false }; }
  const adding = command === settings.addPointsCommand;
  const totalPoints = adding ? Math.min(Number.MAX_SAFE_INTEGER, viewer.points + amount) : Math.max(0, viewer.points - amount);
  const level = Math.floor(totalPoints / settings.levelStepPoints) + 1;
  state.viewers[viewerId] = { ...viewer, points: totalPoints, level };
  const auditId = (await digest(`correct\u0000${viewerId}\u0000${String(viewer.points)}\u0000${String(totalPoints)}\u0000${String(now)}`)).slice(0, 32);
  state.adminAudit.push({ id: auditId, operation: 'correct', subject: viewerId, at: now, reason: clean(`Chat command by ${clean(event.user?.displayName || event.user?.name, 60) || 'a moderator'}`, 200), previousPoints: viewer.points, totalPoints });
  await context.state.write(sanitizeViewerFoundationState(state, settings, now));
  await reply(`${shown} now has ${String(totalPoints)} ${settings.currencyName}.`);
  return { moderatorCommand: true, changed: true, viewerId, totalPoints };
}

// Records made before names were stored still carry their platform at the front of the ID (tiktok-1a2b...).
function platformOf(viewerId, viewer) {
  if (viewer?.platform) return viewer.platform;
  const prefix = GENERATED_VIEWER_ID.test(viewerId) ? viewerId.split('-', 1)[0] : '';
  return PLATFORM.test(prefix) ? prefix : '';
}
function listRow(viewerId, viewer, settings) {
  return { viewerId, name: viewer.name || '', login: viewer.login || '', platform: platformOf(viewerId, viewer), points: viewer.points, level: viewer.level,
    lastSeenAt: viewer.lastSeenAt, linked: settings.links.viewerIds.has(viewerId) };
}
function pendingRows(state) {
  return Object.entries(state.pending).map(([key, item]) => ({ key, name: item.name, platform: key.split(':')[0] === 'any' ? '' : key.split(':')[0], points: item.points, at: item.at }));
}
function matchesQuery(row, query) {
  if (!query) return true;
  return [row.name, row.login, row.viewerId, row.key].some((value) => typeof value === 'string' && value.toLowerCase().includes(query));
}
function sortRows(rows, sort) {
  const byName = (left, right) => (left.name || left.login || left.viewerId || '').localeCompare(right.name || right.login || right.viewerId || '', undefined, { sensitivity: 'base' });
  if (sort === 'name') return rows.sort(byName);
  if (sort === 'recent') return rows.sort((left, right) => (right.lastSeenAt || 0) - (left.lastSeenAt || 0) || byName(left, right));
  return rows.sort((left, right) => right.points - left.points || byName(left, right));
}

// Finds which record an imported row belongs to: the exact Viewer Foundation ID, else one viewer with that name.
function importTarget(state, row) {
  const viewerId = clean(row.viewerId, 64);
  if (VIEWER_ID.test(viewerId) && state.viewers[viewerId]) return { kind: 'viewer', viewerId };
  const name = row.login || row.name; const platform = PLATFORM.test(clean(row.platform, 16)) ? clean(row.platform, 16) : '';
  if (!nameKey(name)) return { kind: 'skip', reason: 'no name' };
  const matches = viewersNamed(state, name, platform);
  if (matches.length === 1) return { kind: 'viewer', viewerId: matches[0][0] };
  if (matches.length > 1) return { kind: 'skip', reason: 'more than one viewer has that name' };
  return { kind: 'pending', key: pendingKey(platform, name), name: clean(row.name || row.login, 80).replace(/^@/u, '') };
}
function importedPoints(mode, current, incoming) {
  if (mode === 'add') return Math.min(Number.MAX_SAFE_INTEGER, current + incoming);
  if (mode === 'replace') return incoming;
  return Math.max(current, incoming);
}

export async function processViewerEvent(event, context, now = Date.now()) {
  const settings = settingsFor(context);
  if (!settings.enabled) return undefined;
  if (event.metadata?.simulated === true && !settings.includeSimulated) return undefined;
  const state = sanitizeViewerFoundationState(await context.state.read(), settings, now);

  if (event.eventType === 'stream.online') {
    livePlatforms.add(clean(event.platform, 64));
    return { streamStarted: true, livePlatforms: livePlatforms.size };
  }

  if (event.eventType === 'stream.offline') {
    livePlatforms.delete(clean(event.platform, 64));
    if (livePlatforms.size > 0) return { streamEnded: false, livePlatforms: livePlatforms.size };
    let pointsAwarded = 0; let viewersSettled = 0;
    for (const viewer of Object.values(state.viewers)) {
      if (viewer.lurkSince <= 0) continue;
      const settled = completedIntervals(now, viewer.lurkSince, viewer.attendanceAwardedAt, settings.lurkMinutesRequired, settings.maximumTimeAwardsPerEvent);
      const points = settled.count * settings.lurkMinutesPoints;
      viewer.points = Math.min(Number.MAX_SAFE_INTEGER, viewer.points + points);
      viewer.level = Math.floor(viewer.points / settings.levelStepPoints) + 1;
      viewer.lurkSince = 0; viewer.attendanceAwardedAt = now; viewer.lastSeenAt = now;
      if (points > 0) viewer.lastAwardAt['time.lurk'] = now;
      pointsAwarded += points; viewersSettled += 1;
    }
    if (viewersSettled > 0) await context.state.write(sanitizeViewerFoundationState(state, settings, now));
    return { streamEnded: true, viewersSettled, pointsAwarded };
  }

  if (event.user?.actorType !== 'human' || !event.user?.id) return undefined;
  const identity = await resolveViewer(event, state, settings);
  if (!identity) return undefined;
  // Any event from a viewer already in the list refreshes their name, so older nameless records fill in over time.
  const known = state.viewers[identity.viewerId]; const seenAs = eventIdentityFields(event);
  if (known && seenAs.name && (known.name !== seenAs.name || known.login !== seenAs.login || known.platform !== seenAs.platform) && !EVENT_POINTS[event.eventType]) {
    state.viewers[identity.viewerId] = { ...known, ...seenAs };
    await context.state.write(sanitizeViewerFoundationState(state, settings, now));
  }
  const command = event.eventType === 'command.received' ? clean(event.payload?.command, 40).toLowerCase() : '';
  if (settings.modCommandsEnabled && isModerator(event) && (command === settings.addPointsCommand || command === settings.removePointsCommand || (command === settings.pointsCommand && clean(event.payload?.arguments?.[0], 80)))) {
    return moderatorPointsCommand(event, context, state, settings, command, now);
  }
  if (command === settings.pointsCommand) {
    const viewer = state.viewers[identity.viewerId] || emptyViewer();
    await sendBalance(context, event, clean(event.user?.displayName || event.user?.name, 80) || 'Viewer', viewer, settings);
    return { ...identity, balance: true, totalPoints: viewer.points, level: viewer.level, currencyName: settings.currencyName };
  }
  if (command === settings.lurkCommand) {
    const eventId = await eventIdentity(event);
    if (!eventId || state.processed.some((item) => item.id === eventId)) return { ...identity, duplicate: true, pointsAwarded: 0 };
    const existingViewer = state.viewers[identity.viewerId] || emptyViewer();
    const alreadyLurking = existingViewer.lurkSince > 0;
    const viewer = { ...mergePending(state, existingViewer, event, now).viewer, ...eventIdentityFields(event), lurkSince: alreadyLurking ? existingViewer.lurkSince : now,
      attendanceAwardedAt: alreadyLurking ? existingViewer.attendanceAwardedAt : now, lastSeenAt: now };
    viewer.level = Math.floor(viewer.points / settings.levelStepPoints) + 1;
    state.viewers[identity.viewerId] = viewer; state.processed.push({ id: eventId, at: now });
    await context.state.write(sanitizeViewerFoundationState(state, settings, now));
    return { ...identity, duplicate: false, lurking: true, alreadyLurking, pointsAwarded: 0, totalPoints: viewer.points, currencyName: settings.currencyName };
  }
  if (command && settings.pointsRewardPlatforms.has(event.platform)) {
    const reward = settings.pointsRewards.find((item) => item.command === command);
    if (reward) return buyPointsReward(event, context, state, settings, identity, reward, now);
  }
  if (event.eventType === 'chat.message' && clean(event.payload?.message || event.payload?.text, 256).toLowerCase().split(/\s/u)[0] === `!${settings.lurkCommand}`) return undefined;
  // A reward bought with these points must not earn points back.
  if (event.eventType === 'reward.redemption' && event.payload?.pointsReward === true) return undefined;
  if (!EVENT_POINTS[event.eventType]) return undefined;
  const eventId = await eventIdentity(event);
  if (!eventId || state.processed.some((item) => item.id === eventId)) return { ...identity, duplicate: true, pointsAwarded: 0 };
  const merge = mergePending(state, state.viewers[identity.viewerId] || emptyViewer(), event, now);
  const existing = merge.viewer;
  const configured = pointValue(settings, event.eventType);
  const cooldownMs = event.eventType === 'chat.message' ? settings.chatCooldownSeconds * 1000 : 0;
  const lastAwardAt = existing.lastAwardAt[event.eventType];
  const awardEligible = lastAwardAt === undefined || now - lastAwardAt >= cooldownMs;
  let pointsAwarded = awardEligible ? configured : 0;
  let nextViewer = { ...existing, lastAwardAt: { ...existing.lastAwardAt } };
  if (event.eventType === 'chat.message') {
    const activity = applyObservedActivity(existing, settings, now); nextViewer = activity.viewer; pointsAwarded += activity.awarded;
    if (awardEligible) {
      const progress = nextViewer.chatProgress + 1;
      if (progress >= settings.chatConsistencyMessages) {
        pointsAwarded += settings.chatConsistencyPoints; nextViewer.chatProgress = 0;
        if (settings.chatConsistencyPoints > 0) nextViewer.lastAwardAt['chat.consistency'] = now;
      } else nextViewer.chatProgress = progress;
    }
    nextViewer.lastChatAt = now;
  }
  const totalPoints = Math.min(Number.MAX_SAFE_INTEGER, existing.points + pointsAwarded);
  const level = Math.floor(totalPoints / settings.levelStepPoints) + 1;
  state.viewers[identity.viewerId] = {
    ...nextViewer, ...eventIdentityFields(event), points: totalPoints, level,
    lastAwardAt: configured > 0 && awardEligible
      ? { ...nextViewer.lastAwardAt, [event.eventType]: now } : { ...nextViewer.lastAwardAt },
    lastSeenAt: now,
  };
  state.processed.push({ id: eventId, at: now });
  const bounded = sanitizeViewerFoundationState(state, settings, now);
  await context.state.write(bounded);
  return { ...identity, duplicate: false, pointsAwarded, totalPoints, previousLevel: existing.level, level, leveledUp: level > existing.level, currencyName: settings.currencyName };
}

async function sayTo(context, event, message) {
  if (!message) return;
  const limit = CHAT_LIMITS[event.platform] || 200;
  await context.chat?.send?.({ message: clean(message, limit), routing: 'source', sourcePlatform: event.platform, overflow: 'truncate' }).catch(() => undefined);
}

/** Takes the points and returns what onEvent hands to StreamBridge as a reward redemption once the state is saved. */
async function buyPointsReward(event, context, state, settings, identity, reward, now) {
  const eventId = await eventIdentity(event);
  if (!eventId || state.processed.some((item) => item.id === eventId)) return { ...identity, duplicate: true, pointsReward: reward.title };
  const user = clean(event.user?.displayName || event.user?.name, 80) || 'Viewer';
  const values = { user, reward: reward.title, cost: reward.cost, currency: settings.currencyName };
  const merged = mergePending(state, state.viewers[identity.viewerId] || emptyViewer(), event, now).viewer;
  const cooldownKey = `points-reward:${reward.command}`;
  const lastBought = Number.isSafeInteger(state.rewardCooldowns?.[cooldownKey]) ? state.rewardCooldowns[cooldownKey] : 0;
  const waitMs = reward.cooldownSeconds * 1000 - (now - lastBought);
  if (lastBought > 0 && waitMs > 0) {
    await sayTo(context, event, fillTemplate(settings.pointsRewardCooldownMessage, { ...values, seconds: Math.ceil(waitMs / 1000) }));
    return { ...identity, pointsReward: reward.title, bought: false, reason: 'cooldown' };
  }
  if (merged.points < reward.cost) {
    await sayTo(context, event, fillTemplate(settings.pointsRewardShortMessage, { ...values, points: merged.points }));
    return { ...identity, pointsReward: reward.title, bought: false, reason: 'not-enough-points', totalPoints: merged.points };
  }
  const totalPoints = merged.points - reward.cost;
  state.viewers[identity.viewerId] = { ...merged, ...eventIdentityFields(event), points: totalPoints, level: Math.floor(totalPoints / settings.levelStepPoints) + 1, lastSeenAt: now };
  state.processed.push({ id: eventId, at: now });
  state.rewardCooldowns = { ...(state.rewardCooldowns || {}), [cooldownKey]: now };
  if (reward.cost > 0) state.mutations.push({ id: eventId.slice(0, 32), viewerId: identity.viewerId, operation: 'spend', amount: reward.cost, previousPoints: merged.points, totalPoints, at: now, callerModuleId: 'thsv.viewer-foundation', reason: clean(`Points reward: ${reward.title}`, 120) });
  await context.state.write(sanitizeViewerFoundationState(state, settings, now));
  const args = Array.isArray(event.payload?.arguments) ? event.payload.arguments.join(' ') : clean(event.payload?.arguments, 2000);
  return {
    ...identity, pointsReward: reward.title, bought: true, totalPoints, currencyName: settings.currencyName,
    boughtMessage: fillTemplate(settings.pointsRewardBoughtMessage, values),
    publish: {
      platform: event.platform, sourceEventId: clean(event.eventId, 200) || eventId, receivedAt: new Date(now).toISOString(),
      ...(clean(event.channel?.name, 256) ? { channelName: clean(event.channel.name, 256) } : {}),
      user: { id: clean(event.user?.id, 256), name: clean(event.user?.name, 256) || user,
        ...(clean(event.user?.displayName, 256) ? { displayName: clean(event.user.displayName, 256) } : {}),
        roles: Array.isArray(event.user?.roles) ? event.user.roles.filter((role) => typeof role === 'string').slice(0, 32).map((role) => role.slice(0, 64)) : [] },
      rewardId: reward.twitchRewardId || `points-${reward.command}`, rewardTitle: reward.title, cost: reward.cost, currencyName: settings.currencyName,
      viewerId: identity.viewerId, ...(clean(args, 2000) ? { input: clean(args, 2000) } : {}), simulated: event.metadata?.simulated === true,
    },
  };
}

/** Sends the purchase on as a reward redemption. It runs after the state is saved and outside the event queue,
 *  because StreamBridge delivers the new event back to Viewer Foundation too. */
export async function publishBoughtReward(result, event, context) {
  if (!result?.bought || !result.publish) return;
  try {
    if (typeof context.viewerFoundation?.publishPointsReward !== 'function') throw new Error('This StreamBridge version cannot run points rewards.');
    await context.viewerFoundation.publishPointsReward(result.publish);
    await sayTo(context, event, result.boughtMessage);
  } catch (error) {
    // Give the points back when the reward could not be started.
    await serialize(async () => {
      const settings = settingsFor(context); const now = Date.now();
      const state = sanitizeViewerFoundationState(await context.state.read(), settings, now);
      const viewer = state.viewers[result.viewerId]; if (!viewer) return;
      const points = Math.min(Number.MAX_SAFE_INTEGER, viewer.points + result.publish.cost);
      state.viewers[result.viewerId] = { ...viewer, points, level: Math.floor(points / settings.levelStepPoints) + 1 };
      await context.state.write(sanitizeViewerFoundationState(state, settings, now));
    }).catch(() => undefined);
    context.logger?.warn?.('A points reward could not be started; the points were given back.', { reward: result.pointsReward, error: error instanceof Error ? error.message : String(error) });
  }
}

export function viewerProjection(stateValue, viewerId, settingsValue = {}) {
  if (!VIEWER_ID.test(viewerId)) return undefined;
  const settings = settingsFor({ settings: settingsValue });
  const state = sanitizeViewerFoundationState(stateValue, settings);
  const viewer = state.viewers[viewerId];
  if (!viewer) return undefined;
  return Object.freeze({ contractVersion: '1.0.0', viewerId, linked: settings.links.viewerIds.has(viewerId), currencyName: settings.currencyName, points: viewer.points, level: viewer.level, nextLevelAt: viewer.level * settings.levelStepPoints, ...achievementProjection(viewer.points, settings) });
}

export function deleteViewerRecord(stateValue, viewerId, settingsValue = {}) {
  if (!VIEWER_ID.test(viewerId)) throw new Error('viewerId must be a lowercase identifier.');
  const settings = settingsFor({ settings: settingsValue });
  const state = sanitizeViewerFoundationState(stateValue, settings);
  const removed = state.viewers[viewerId] !== undefined;
  delete state.viewers[viewerId];
  state.mutations = state.mutations.filter((item) => item.viewerId !== viewerId);
  state.adminAudit = state.adminAudit.map((item) => item.subject === viewerId ? { ...item, subject: 'deleted-viewer' } : item);
  return { state, removed };
}

function serialize(task) { operation = operation.then(task, task); return operation; }

async function projectionForQuery(query, context) {
  const settings = settingsFor(context);
  const state = sanitizeViewerFoundationState(await context.state.read(), settings);
  let viewerId = clean(query.viewerId, 64);
  let linked = settings.links.viewerIds.has(viewerId);
  if (!viewerId && query.platform && query.userId) {
    const identity = await resolveViewer({ platform: query.platform, user: { id: query.userId } }, state, settings);
    if (!identity) return undefined;
    viewerId = identity.viewerId; linked = identity.linked;
  }
  if (!VIEWER_ID.test(viewerId)) return undefined;
  const viewer = state.viewers[viewerId];
  const points = viewer?.points || 0;
  const level = viewer?.level || 1;
  return Object.freeze({ contractVersion: '1.0.0', viewerId, linked, currencyName: settings.currencyName, points, level, nextLevelAt: level * settings.levelStepPoints, ...achievementProjection(points, settings) });
}

async function mutateViewer(request, context, now = Date.now()) {
  const settings = settingsFor(context);
  if (!settings.enabled) throw new Error('Viewer Foundation is disabled.');
  const state = sanitizeViewerFoundationState(await context.state.read(), settings, now);
  const id = (await digest(`${request.callerModuleId}\u0000${request.idempotencyKey}`)).slice(0, 32);
  const previous = state.mutations.find((item) => item.id === id);
  if (previous) {
    const level = Math.floor(previous.totalPoints / settings.levelStepPoints) + 1;
    return { contractVersion: '1.0.0', viewerId: previous.viewerId, linked: settings.links.viewerIds.has(previous.viewerId),
      currencyName: settings.currencyName, points: previous.totalPoints, level, nextLevelAt: level * settings.levelStepPoints,
      ...achievementProjection(previous.totalPoints, settings),
      operation: previous.operation, amount: previous.amount, previousPoints: previous.previousPoints, duplicate: true };
  }
  const current = state.viewers[request.viewerId] || emptyViewer();
  if (request.operation === 'spend' && current.points < request.amount) throw new Error(`Viewer has ${String(current.points)} points but the requested spend is ${String(request.amount)}.`);
  const totalPoints = request.operation === 'spend'
    ? current.points - request.amount
    : Math.min(Number.MAX_SAFE_INTEGER, current.points + request.amount);
  const level = Math.floor(totalPoints / settings.levelStepPoints) + 1;
  state.viewers[request.viewerId] = { ...current, points: totalPoints, level, lastSeenAt: now };
  state.mutations.push({ id, viewerId: request.viewerId, operation: request.operation, amount: request.amount,
    previousPoints: current.points, totalPoints, at: now, callerModuleId: clean(request.callerModuleId, 128), reason: clean(request.reason, 120) });
  await context.state.write(sanitizeViewerFoundationState(state, settings, now));
  return { contractVersion: '1.0.0', viewerId: request.viewerId, linked: settings.links.viewerIds.has(request.viewerId),
    currencyName: settings.currencyName, points: totalPoints, level, nextLevelAt: level * settings.levelStepPoints,
    ...achievementProjection(totalPoints, settings),
    operation: request.operation, amount: request.amount, previousPoints: current.points, duplicate: false };
}

async function administerViewer(request, context, now = Date.now()) {
  const settings = settingsFor(context);
  const state = sanitizeViewerFoundationState(await context.state.read(), settings, now);
  if (request.operation === 'status') {
    return { operation: 'status', enabled: Boolean(settings.enabled), currencyName: settings.currencyName, viewerCount: Object.keys(state.viewers).length,
      linkedViewerCount: settings.links.viewerIds.size, processedEventCount: state.processed.length,
      mutationCount: state.mutations.length, auditCount: state.adminAudit.length, legacyImportCount: state.legacyImports.length };
  }
  if (request.operation === 'list') {
    const query = nameKey(request.query); const sort = ['points', 'recent', 'name'].includes(request.sort) ? request.sort : 'points';
    const rows = sortRows(Object.entries(state.viewers).map(([viewerId, viewer]) => listRow(viewerId, viewer, settings)).filter((row) => matchesQuery(row, query)), sort);
    const pageSize = integer(request.pageSize, 10, 100, LIST_PAGE_SIZE); const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    const page = integer(request.page, 1, pages, 1);
    const waiting = sortRows(pendingRows(state).filter((row) => matchesQuery(row, query)), sort === 'recent' ? 'points' : sort);
    return { operation: 'list', currencyName: settings.currencyName, total: rows.length, totalViewers: Object.keys(state.viewers).length, maximumViewers: settings.maximumViewers, page, pages, pageSize,
      rows: rows.slice((page - 1) * pageSize, page * pageSize), pending: waiting.slice(0, 100), pendingTotal: waiting.length,
      ...(state.lastImport ? { lastImportAt: state.lastImport.at } : {}) };
  }
  if (request.operation === 'fill-names') {
    // Names other extensions saved (Lurk Tracker, Stream Bingo, leaderboards...) fill in records that have none yet.
    let filled = 0;
    for (const item of Array.isArray(request.names) ? request.names.slice(0, 20000) : []) {
      const name = clean(item?.name, 80).replace(/^@/u, ''); if (!name) continue;
      let viewerId = clean(item?.viewerId, 64);
      if (!viewerId && item?.platform && item?.userId) viewerId = (await resolveViewer({ platform: item.platform, user: { id: item.userId } }, state, settings))?.viewerId || '';
      const viewer = state.viewers[viewerId]; if (!viewer || viewer.name) continue;
      state.viewers[viewerId] = { ...viewer, ...identityFields({ name, login: clean(item?.login, 80) || name, platform: platformOf(viewerId, viewer) }) };
      filled += 1;
    }
    const missing = Object.values(state.viewers).filter((viewer) => !viewer.name).length;
    if (filled > 0) await context.state.write(sanitizeViewerFoundationState(state, settings, now));
    return { operation: 'fill-names', filled, missing };
  }
  if (request.operation === 'delete-all') {
    if (request.approvedByCreator !== true) throw new Error('Deleting everyone needs your confirmation.');
    const ids = new Set(Object.keys(state.viewers)); const viewers = ids.size; const waiting = Object.keys(state.pending).length;
    state.viewers = {}; state.pending = {}; state.mutations = []; delete state.lastImport;
    state.adminAudit = state.adminAudit.map((item) => ids.has(item.subject) ? { ...item, subject: 'deleted-viewer' } : item);
    state.adminAudit.push({ operation: 'delete-all', subject: 'all-viewers', at: now, reason: 'Creator deleted everyone from the points list', totalPoints: viewers });
    await context.state.write(sanitizeViewerFoundationState(state, settings, now));
    return { operation: 'delete-all', removed: viewers, removedWaiting: waiting };
  }
  if (request.operation === 'export-all') {
    const rows = sortRows(Object.entries(state.viewers).map(([viewerId, viewer]) => listRow(viewerId, viewer, settings)), 'points');
    const all = [...rows, ...pendingRows(state).map((row) => ({ viewerId: '', name: row.name, login: nameKey(row.name), platform: row.platform, points: row.points, level: Math.floor(row.points / settings.levelStepPoints) + 1, lastSeenAt: 0, linked: false, waiting: true }))];
    const pages = Math.max(1, Math.ceil(all.length / EXPORT_PAGE_SIZE)); const page = integer(request.page, 1, pages, 1);
    return { operation: 'export-all', currencyName: settings.currencyName, total: all.length, page, pages, rows: all.slice((page - 1) * EXPORT_PAGE_SIZE, page * EXPORT_PAGE_SIZE).map((row) => ({ ...row, lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : '' })) };
  }
  if (request.operation === 'bulk-add') {
    if (request.approvedByCreator !== true) throw new Error('Giving everyone points needs your approval.');
    const amount = integer(request.amount, 1, 1_000_000, 0); if (amount < 1) throw new Error('Pick how many points to give.');
    const since = request.scope === 'recent' ? now - integer(request.sinceMinutes, 1, 1_440, 180) * 60_000 : 0;
    let changed = 0;
    for (const viewer of Object.values(state.viewers)) {
      if (viewer.lastSeenAt < since) continue;
      viewer.points = Math.min(Number.MAX_SAFE_INTEGER, viewer.points + amount); viewer.level = Math.floor(viewer.points / settings.levelStepPoints) + 1; changed += 1;
    }
    state.adminAudit.push({ operation: 'bulk-add', subject: request.scope === 'recent' ? 'recent-viewers' : 'all-viewers', at: now, reason: clean(request.reason, 200) || 'Points for everyone', totalPoints: amount });
    await context.state.write(sanitizeViewerFoundationState(state, settings, now));
    return { operation: 'bulk-add', amount, viewers: changed, currencyName: settings.currencyName };
  }
  if (request.operation === 'import') {
    const mode = ['add', 'higher', 'replace'].includes(request.mode) ? request.mode : 'higher';
    const rows = Array.isArray(request.rows) ? request.rows.slice(0, MAXIMUM_IMPORT_ROWS) : [];
    const totals = { updated: 0, waiting: 0, unchanged: 0, skipped: 0 }; const examples = []; const skippedExamples = [];
    const undo = { id: (await digest(`import\u0000${String(now)}\u0000${String(rows.length)}`)).slice(0, 32), at: now, viewers: {}, pending: {} };
    for (const row of rows) {
      const points = row && Number.isSafeInteger(row.points) && row.points >= 0 ? row.points : -1;
      if (points < 0) { totals.skipped += 1; if (skippedExamples.length < 10) skippedExamples.push({ name: clean(row?.name || row?.login, 80), reason: 'no points number' }); continue; }
      const target = importTarget(state, row);
      if (target.kind === 'skip') { totals.skipped += 1; if (skippedExamples.length < 10) skippedExamples.push({ name: clean(row.name || row.login, 80), reason: target.reason }); continue; }
      if (target.kind === 'viewer') {
        const viewer = state.viewers[target.viewerId]; const next = importedPoints(mode, viewer.points, points);
        if (next === viewer.points) { totals.unchanged += 1; continue; }
        if (!(target.viewerId in undo.viewers)) undo.viewers[target.viewerId] = viewer.points;
        if (examples.length < 20) examples.push({ name: viewer.name || viewer.login || target.viewerId, before: viewer.points, after: next });
        state.viewers[target.viewerId] = { ...viewer, points: next, level: Math.floor(next / settings.levelStepPoints) + 1 };
        totals.updated += 1; continue;
      }
      const current = state.pending[target.key]; const before = current?.points ?? 0; const next = importedPoints(mode, before, points);
      if (current && next === before) { totals.unchanged += 1; continue; }
      if (!(target.key in undo.pending)) undo.pending[target.key] = current ? current.points : -1;
      if (examples.length < 20) examples.push({ name: target.name, before: current ? before : null, after: next, waiting: true });
      state.pending[target.key] = { name: target.name, points: next, at: now }; totals.waiting += 1;
    }
    if (Object.keys(state.pending).length > MAXIMUM_PENDING) throw new Error(`That file has too many new names. Up to ${String(MAXIMUM_PENDING)} can wait for their first chat.`);
    const result = { operation: 'import', mode, rows: rows.length, ...totals, examples, skippedExamples, currencyName: settings.currencyName };
    if (request.dryRun !== false || request.approvedByCreator !== true) return { ...result, preview: true };
    state.lastImport = undo;
    state.adminAudit.push({ operation: 'import', subject: 'points-file', at: now, reason: clean(request.reason, 200) || `Imported ${String(rows.length)} rows (${mode})`, totalPoints: totals.updated + totals.waiting });
    await context.state.write(sanitizeViewerFoundationState(state, settings, now));
    return { ...result, preview: false, undoAvailable: true };
  }
  if (request.operation === 'undo-import') {
    if (request.approvedByCreator !== true) throw new Error('Undoing an import needs your approval.');
    const last = state.lastImport; if (!last) throw new Error('There is no import to undo.');
    let restored = 0;
    for (const [viewerId, points] of Object.entries(last.viewers)) {
      const viewer = state.viewers[viewerId]; if (!viewer) continue;
      state.viewers[viewerId] = { ...viewer, points, level: Math.floor(points / settings.levelStepPoints) + 1 }; restored += 1;
    }
    for (const [key, points] of Object.entries(last.pending)) {
      if (points < 0) delete state.pending[key]; else if (state.pending[key]) state.pending[key] = { ...state.pending[key], points };
      restored += 1;
    }
    delete state.lastImport;
    state.adminAudit.push({ operation: 'undo-import', subject: 'points-file', at: now, reason: 'Creator undid the last import', totalPoints: restored });
    await context.state.write(sanitizeViewerFoundationState(state, settings, now));
    return { operation: 'undo-import', restored };
  }
  if (request.operation === 'pending-set' || request.operation === 'pending-delete') {
    const key = clean(request.key, 100); const waiting = state.pending[key];
    if (!waiting) throw new Error('That name is no longer waiting. They may have chatted already.');
    if (request.operation === 'pending-delete') delete state.pending[key];
    else state.pending[key] = { ...waiting, points: integer(request.amount, 0, Number.MAX_SAFE_INTEGER, waiting.points) };
    await context.state.write(sanitizeViewerFoundationState(state, settings, now));
    return { operation: request.operation, key, removed: request.operation === 'pending-delete' };
  }
  if (request.operation === 'search') {
    let viewerId = clean(request.viewerId, 64); let linked = settings.links.viewerIds.has(viewerId);
    if (!viewerId && request.platform && request.userId) {
      const identity = await resolveViewer({ platform: request.platform, user: { id: request.userId } }, state, settings);
      if (!identity) throw new Error('A supported platform and stable user ID are required.');
      viewerId = identity.viewerId; linked = identity.linked;
    }
    if (!VIEWER_ID.test(viewerId)) throw new Error('Search by a lowercase Viewer Foundation ID or a stable platform account ID.');
    const viewer = state.viewers[viewerId];
    const linkedAccounts = [...settings.links.accounts.entries()]
      .filter((entry) => entry[1] === viewerId)
      .map(([key]) => { const [platform, userId] = key.split('\u0000'); return { platform, userId }; });
    return { operation: 'search', found: viewer !== undefined || linkedAccounts.length > 0, viewerId, linked,
      displayNamesStored: true, ...(viewer?.name ? { name: viewer.name } : {}), ...(viewer?.platform ? { platform: viewer.platform } : {}), linkedAccounts,
      projection: viewer ? { currencyName: settings.currencyName, points: viewer.points, level: viewer.level, lastSeenAt: viewer.lastSeenAt, lastAwardAt: viewer.lastAwardAt, ...achievementProjection(viewer.points, settings) } : null };
  }
  if (request.operation === 'audit') {
    const limit = integer(request.limit, 1, 100, 25);
    return { operation: 'audit', entries: state.adminAudit.slice(-limit).reverse(), retained: state.adminAudit.length };
  }
  if (request.operation === 'import-legacy') {
    if (request.approvedByCreator !== true || !/^[a-f0-9]{64}$/u.test(clean(request.migrationDigest, 64))) throw new Error('Legacy import requires explicit creator approval and the exact preview digest.');
    const migrationDigest = clean(request.migrationDigest, 64);
    if (state.legacyImports.some((item) => item.digest === migrationDigest)) return { operation: 'import-legacy', duplicate: true, imported: 0, merged: 0, skipped: 0 };
    const records = Array.isArray(request.legacyViewers) ? request.legacyViewers.slice(0, settings.maximumViewers) : [];
    let imported = 0; let merged = 0; let skipped = 0;
    for (const record of records) {
      const importedViewerId = clean(record?.viewerId, 64); const points = record?.points;
      if (!VIEWER_ID.test(importedViewerId) || !Number.isSafeInteger(points) || points < 0) { skipped += 1; continue; }
      const current = state.viewers[importedViewerId];
      if (current && current.points >= points) { skipped += 1; continue; }
      const sanitized = sanitizeViewer({ points, lastAwardAt: record?.lastAwardAt, lastSeenAt: now }, settings.levelStepPoints);
      if (!sanitized) { skipped += 1; continue; }
      state.viewers[importedViewerId] = sanitized; if (current) merged += 1; else imported += 1;
    }
    state.legacyImports.push({ digest: migrationDigest, at: now, records: records.length });
    state.adminAudit.push({ operation: 'import-legacy', subject: 'legacy-state', at: now, reason: `Creator-approved legacy migration ${migrationDigest.slice(0, 12)}`, totalPoints: imported + merged });
    await context.state.write(sanitizeViewerFoundationState(state, settings, now));
    return { operation: 'import-legacy', duplicate: false, imported, merged, skipped, sourceRecords: records.length };
  }
  const viewerId = clean(request.viewerId, 64);
  if (request.operation !== 'undo-correction' && !VIEWER_ID.test(viewerId)) throw new Error('viewerId must be a lowercase identifier.');
  if (request.operation === 'export') {
    const viewer = state.viewers[viewerId];
    const linkedAccounts = [...settings.links.accounts.entries()]
      .filter((entry) => entry[1] === viewerId)
      .map(([key]) => { const [platform, userId] = key.split('\u0000'); return { platform, userId }; });
    return { operation: 'export', found: viewer !== undefined || linkedAccounts.length > 0, viewerId,
      projection: viewer ? { currencyName: settings.currencyName, points: viewer.points, level: viewer.level, lastSeenAt: viewer.lastSeenAt, lastAwardAt: viewer.lastAwardAt, ...achievementProjection(viewer.points, settings) } : null,
      linkedAccounts, mutations: state.mutations.filter((item) => item.viewerId === viewerId) };
  }
  if (request.operation === 'delete') {
    const result = deleteViewerRecord(state, viewerId, settings);
    result.state.adminAudit.push({ operation: 'delete', subject: 'deleted-viewer', at: now, reason: 'Creator-approved privacy deletion' });
    await context.state.write(sanitizeViewerFoundationState(result.state, settings, now));
    await context.viewerFoundation.notifyDeleted?.(viewerId);
    return { operation: 'delete', viewerId, removed: result.removed,
      accountLinksRequireRemoval: settings.links.viewerIds.has(viewerId) };
  }
  if (request.operation === 'link-audit') {
    if (request.approvedByCreator !== true) throw new Error('Account-link changes require explicit creator approval.');
    const viewerId = clean(request.viewerId, 64); const platform = clean(request.platform, 16); const userId = clean(request.userId, 256);
    if (!VIEWER_ID.test(viewerId) || GENERATED_VIEWER_ID.test(viewerId) || !PLATFORM.test(platform) || !userId) throw new Error('The account-link audit request is invalid.');
    const accountFingerprint = (await digest(`${platform}\u0000${userId}`)).slice(0, 24);
    const auditOperation = request.linkAction === 'remove' ? 'link-remove' : 'link-add';
    const id = (await digest(`${auditOperation}\u0000${viewerId}\u0000${accountFingerprint}\u0000${String(now)}`)).slice(0, 32);
    state.adminAudit.push({ id, operation: auditOperation, subject: viewerId, platform, accountFingerprint, at: now, reason: clean(request.reason, 200) });
    await context.state.write(sanitizeViewerFoundationState(state, settings, now));
    return { operation: 'link-audit', auditId: id, linkAction: request.linkAction, viewerId, platform, accountFingerprint, restartRequired: true };
  }
  if (request.operation === 'undo-correction') {
    if (request.approvedByCreator !== true) throw new Error('Undoing a correction requires explicit creator approval.');
    const auditId = clean(request.auditId, 32);
    const correction = state.adminAudit.find((item) => item.id === auditId && item.operation === 'correct');
    if (!correction || !VIEWER_ID.test(correction.subject) || !Number.isSafeInteger(correction.previousPoints) || !Number.isSafeInteger(correction.totalPoints)) throw new Error('The requested correction audit entry is unavailable or cannot be undone.');
    if (state.adminAudit.some((item) => item.operation === 'undo-correction' && item.revertsAuditId === auditId)) throw new Error('That correction was already undone.');
    const current = state.viewers[correction.subject];
    if (!current || current.points !== correction.totalPoints) throw new Error('Viewer points changed after that correction. Refusing to overwrite newer activity.');
    const level = Math.floor(correction.previousPoints / settings.levelStepPoints) + 1;
    state.viewers[correction.subject] = { ...current, points: correction.previousPoints, level, lastSeenAt: now };
    const undoId = (await digest(`undo-correction\u0000${auditId}\u0000${String(now)}`)).slice(0, 32);
    state.adminAudit.push({ id: undoId, operation: 'undo-correction', subject: correction.subject, revertsAuditId: auditId, at: now,
      reason: clean(request.reason, 200), previousPoints: current.points, totalPoints: correction.previousPoints });
    await context.state.write(sanitizeViewerFoundationState(state, settings, now));
    return { operation: 'undo-correction', auditId: undoId, revertsAuditId: auditId, viewerId: correction.subject,
      previousPoints: current.points, points: correction.previousPoints, level, currencyName: settings.currencyName };
  }
  if (request.operation !== 'correct') throw new Error('Unsupported Viewer Foundation administration operation.');
  const existing = state.viewers[viewerId] || emptyViewer();
  const amount = integer(request.amount, 1, 1_000_000, 1);
  const totalPoints = request.adjustment === 'reset' ? 0
    : request.adjustment === 'set' ? integer(request.amount, 0, Number.MAX_SAFE_INTEGER, existing.points)
    : request.adjustment === 'remove' ? Math.max(0, existing.points - amount)
      : Math.min(Number.MAX_SAFE_INTEGER, existing.points + amount);
  const level = Math.floor(totalPoints / settings.levelStepPoints) + 1;
  state.viewers[viewerId] = { ...existing, points: totalPoints, level, lastSeenAt: now };
  const auditId = (await digest(`correct\u0000${viewerId}\u0000${String(existing.points)}\u0000${String(totalPoints)}\u0000${String(now)}`)).slice(0, 32);
  state.adminAudit.push({ id: auditId, operation: 'correct', subject: viewerId, at: now, reason: clean(request.reason, 200),
    previousPoints: existing.points, totalPoints });
  await context.state.write(sanitizeViewerFoundationState(state, settings, now));
  return { operation: 'correct', auditId, viewerId, adjustment: request.adjustment, previousPoints: existing.points,
    currencyName: settings.currencyName, points: totalPoints, level, nextLevelAt: level * settings.levelStepPoints, ...achievementProjection(totalPoints, settings) };
}

export function resetViewerFoundationRuntime() { operation = Promise.resolve(); unregisterProvider = undefined; livePlatforms.clear(); }

export default {
  manifest, required: true,
  async start(context) {
    operation = Promise.resolve();
    livePlatforms.clear();
    const settings = settingsFor(context);
    const state = sanitizeViewerFoundationState(await context.state.read(), settings);
    await context.state.write(state);
    unregisterProvider = context.viewerFoundation.provide(Object.freeze({
      getProjection: (query) => serialize(() => projectionForQuery(query, context)),
      mutate: (request) => serialize(() => mutateViewer(request, context)),
      administer: (request) => serialize(() => administerViewer(request, context)),
    }));
  },
  async stop() { await operation.catch(() => undefined); unregisterProvider?.(); unregisterProvider = undefined; livePlatforms.clear(); operation = Promise.resolve(); },
  async onEvent(event, context) {
    const result = await serialize(() => processViewerEvent(event, context));
    if (result?.bought) setTimeout(() => { void publishBoughtReward(result, event, context); }, 0);
  },
};
