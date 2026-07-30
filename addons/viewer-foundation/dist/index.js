// Viewer Foundation owns pseudonymous cross-platform identity and replay-safe progression.
// It deliberately stores no chat text, display names, avatars, OAuth data, or raw platform IDs.
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
const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first-steps', label: 'First Steps', points: 100 }),
  Object.freeze({ id: 'village-regular', label: 'Village Regular', points: 500 }),
  Object.freeze({ id: 'community-supporter', label: 'Community Supporter', points: 1_000 }),
  Object.freeze({ id: 'village-veteran', label: 'Village Veteran', points: 2_500 }),
  Object.freeze({ id: 'village-legend', label: 'Village Legend', points: 5_000 }),
]);

const manifest = {
  contractVersion: '2.0.0-preview.1',
  moduleId: 'thsv.viewer-foundation',
  name: 'Viewer Foundation',
  version: '2.5.1',
  minimumCoreVersion: '2.0.0-preview.1',
  maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '2.5.1', maximumTestedBridgeVersion: '2.5.1',
  dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: Object.keys(EVENT_POINTS), commandsProvided: [], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.viewer-foundation/', 'data/addons/.state/thsv.viewer-foundation/'],
  installationSteps: [
    'Install Viewer Foundation in the wizard and review its private-state permission.',
    'Optionally add explicit account links using viewer-id|platform|stable-user-id. Never link accounts by display name.',
    'Choose point awards and cooldowns, save, and restart StreamBridge.',
  ],
  uninstallationSteps: ['Uninstall the add-on. Its pseudonymous progression state remains preserved for a later reinstall or privacy export.'],
  migrations: [],
  healthChecks: [{ id: 'thsv.viewer-foundation.runtime', description: 'Confirms salted identity resolution, bounded replay protection, and atomic private progression state.' }],
};

const FALLBACKS = Object.freeze({
  enabled: true, includeSimulated: false, accountLinks: [],
  chatMessagePoints: 1, chatCooldownSeconds: 60,
  followPoints: 25, subscriptionPoints: 100, membershipPoints: 100,
  giftSubscriptionPoints: 75, giftPoints: 50, cheerPoints: 25,
  superChatPoints: 100, raidPoints: 100, rewardRedemptionPoints: 25,
  maximumViewers: 250, processedEventLimit: 200, processedEventTtlHours: 168,
  levelStepPoints: 100, achievementsEnabled: true,
});

const PLATFORM = /^(twitch|youtube|kick|tiktok)$/u;
const VIEWER_ID = /^[a-z][a-z0-9-]{0,63}$/u;
const GENERATED_VIEWER_ID = /^(?:twitch|youtube|kick|tiktok)-[a-f0-9]{24}$/u;
const MAXIMUM_STATE_BYTES = 60_000;
let operation = Promise.resolve();
let unregisterProvider;

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

function settingsFor(context) {
  const raw = { ...FALLBACKS, ...(context.settings || {}) };
  const links = parseAccountLinks(raw.accountLinks);
  if (links.conflicts.length > 0) throw new Error('One stable platform account is assigned to more than one Viewer Foundation ID.');
  return {
    ...raw,
    links,
    chatMessagePoints: integer(raw.chatMessagePoints, 0, 10000, 1),
    chatCooldownSeconds: integer(raw.chatCooldownSeconds, 0, 86400, 60),
    followPoints: integer(raw.followPoints, 0, 10000, 25),
    subscriptionPoints: integer(raw.subscriptionPoints, 0, 10000, 100),
    membershipPoints: integer(raw.membershipPoints, 0, 10000, 100),
    giftSubscriptionPoints: integer(raw.giftSubscriptionPoints, 0, 10000, 75),
    giftPoints: integer(raw.giftPoints, 0, 10000, 50),
    cheerPoints: integer(raw.cheerPoints, 0, 10000, 25),
    superChatPoints: integer(raw.superChatPoints, 0, 10000, 100),
    raidPoints: integer(raw.raidPoints, 0, 10000, 100),
    rewardRedemptionPoints: integer(raw.rewardRedemptionPoints, 0, 10000, 25),
    maximumViewers: integer(raw.maximumViewers, 25, 500, 250),
    processedEventLimit: integer(raw.processedEventLimit, 25, 500, 200),
    processedEventTtlHours: integer(raw.processedEventTtlHours, 1, 720, 168),
    levelStepPoints: integer(raw.levelStepPoints, 10, 1000000, 100),
  };
}

function sanitizeViewer(value, levelStepPoints) {
  if (!value || typeof value !== 'object') return undefined;
  const points = integer(value.points, 0, Number.MAX_SAFE_INTEGER, 0);
  const lastAwardAt = {};
  if (value.lastAwardAt && typeof value.lastAwardAt === 'object') {
    for (const eventType of Object.keys(EVENT_POINTS)) {
      const time = value.lastAwardAt[eventType];
      if (Number.isSafeInteger(time) && time >= 0) lastAwardAt[eventType] = time;
    }
  }
  return { points, level: Math.floor(points / levelStepPoints) + 1, lastAwardAt, lastSeenAt: integer(value.lastSeenAt, 0, Number.MAX_SAFE_INTEGER, 0) };
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
    .filter((item) => item && typeof item === 'object' && ['correct', 'delete', 'import-legacy'].includes(item.operation)
      && typeof item.subject === 'string' && Number.isSafeInteger(item.at) && item.at >= 0
      && typeof item.reason === 'string')
    .map((item) => ({ operation: item.operation, subject: clean(item.subject, 64), at: item.at,
      reason: clean(item.reason, 200), ...(Number.isSafeInteger(item.previousPoints) ? { previousPoints: item.previousPoints } : {}),
      ...(Number.isSafeInteger(item.totalPoints) ? { totalPoints: item.totalPoints } : {}) }))
    .slice(-100) : [];
  const legacyImports = Array.isArray(source.legacyImports) ? source.legacyImports
    .filter((item) => item && typeof item === 'object' && /^[a-f0-9]{64}$/u.test(item.digest) && Number.isSafeInteger(item.at) && item.at >= 0 && Number.isSafeInteger(item.records) && item.records >= 0)
    .map((item) => ({ digest: item.digest, at: item.at, records: item.records })).slice(-10) : [];
  const state = { version: 1, salt, viewers, processed, mutations, adminAudit, legacyImports };
  while (JSON.stringify(state).length > MAXIMUM_STATE_BYTES) {
    if (state.processed.length > 25) { state.processed.shift(); continue; }
    if (state.mutations.length > 25) { state.mutations.shift(); continue; }
    if (state.adminAudit.length > 25) { state.adminAudit.shift(); continue; }
    if (state.legacyImports.length > 2) { state.legacyImports.shift(); continue; }
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

function achievementProjection(points, settings) {
  if (settings.achievementsEnabled !== true) return {};
  const achievements = ACHIEVEMENTS.filter((achievement) => points >= achievement.points).map((achievement) => ({ ...achievement }));
  return achievements.length > 0 ? { achievements, latestAchievement: achievements.at(-1) } : {};
}

export async function processViewerEvent(event, context, now = Date.now()) {
  const settings = settingsFor(context);
  if (!settings.enabled || !EVENT_POINTS[event.eventType] || event.user?.actorType !== 'human' || !event.user?.id) return undefined;
  if (event.metadata?.simulated === true && !settings.includeSimulated) return undefined;
  const state = sanitizeViewerFoundationState(await context.state.read(), settings, now);
  const identity = await resolveViewer(event, state, settings);
  if (!identity) return undefined;
  const eventId = await eventIdentity(event);
  if (!eventId || state.processed.some((item) => item.id === eventId)) return { ...identity, duplicate: true, pointsAwarded: 0 };
  const existing = state.viewers[identity.viewerId] || { points: 0, level: 1, lastAwardAt: {}, lastSeenAt: 0 };
  const configured = pointValue(settings, event.eventType);
  const cooldownMs = event.eventType === 'chat.message' ? settings.chatCooldownSeconds * 1000 : 0;
  const lastAwardAt = existing.lastAwardAt[event.eventType];
  const pointsAwarded = lastAwardAt === undefined || now - lastAwardAt >= cooldownMs ? configured : 0;
  const totalPoints = Math.min(Number.MAX_SAFE_INTEGER, existing.points + pointsAwarded);
  const level = Math.floor(totalPoints / settings.levelStepPoints) + 1;
  state.viewers[identity.viewerId] = {
    points: totalPoints, level,
    lastAwardAt: pointsAwarded > 0 ? { ...existing.lastAwardAt, [event.eventType]: now } : { ...existing.lastAwardAt },
    lastSeenAt: now,
  };
  state.processed.push({ id: eventId, at: now });
  const bounded = sanitizeViewerFoundationState(state, settings, now);
  await context.state.write(bounded);
  return { ...identity, duplicate: false, pointsAwarded, totalPoints, previousLevel: existing.level, level, leveledUp: level > existing.level };
}

export function viewerProjection(stateValue, viewerId, settingsValue = {}) {
  if (!VIEWER_ID.test(viewerId)) return undefined;
  const settings = settingsFor({ settings: settingsValue });
  const state = sanitizeViewerFoundationState(stateValue, settings);
  const viewer = state.viewers[viewerId];
  if (!viewer) return undefined;
  return Object.freeze({ contractVersion: '1.0.0', viewerId, linked: settings.links.viewerIds.has(viewerId), points: viewer.points, level: viewer.level, nextLevelAt: viewer.level * settings.levelStepPoints, ...achievementProjection(viewer.points, settings) });
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
  return Object.freeze({ contractVersion: '1.0.0', viewerId, linked, points, level, nextLevelAt: level * settings.levelStepPoints, ...achievementProjection(points, settings) });
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
      points: previous.totalPoints, level, nextLevelAt: level * settings.levelStepPoints,
      ...achievementProjection(previous.totalPoints, settings),
      operation: previous.operation, amount: previous.amount, previousPoints: previous.previousPoints, duplicate: true };
  }
  const current = state.viewers[request.viewerId] || { points: 0, level: 1, lastAwardAt: {}, lastSeenAt: 0 };
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
    points: totalPoints, level, nextLevelAt: level * settings.levelStepPoints,
    ...achievementProjection(totalPoints, settings),
    operation: request.operation, amount: request.amount, previousPoints: current.points, duplicate: false };
}

async function administerViewer(request, context, now = Date.now()) {
  const settings = settingsFor(context);
  const state = sanitizeViewerFoundationState(await context.state.read(), settings, now);
  if (request.operation === 'status') {
    return { operation: 'status', enabled: Boolean(settings.enabled), viewerCount: Object.keys(state.viewers).length,
      linkedViewerCount: settings.links.viewerIds.size, processedEventCount: state.processed.length,
      mutationCount: state.mutations.length, auditCount: state.adminAudit.length, legacyImportCount: state.legacyImports.length };
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
  if (!VIEWER_ID.test(viewerId)) throw new Error('viewerId must be a lowercase identifier.');
  if (request.operation === 'export') {
    const viewer = state.viewers[viewerId];
    const linkedAccounts = [...settings.links.accounts.entries()]
      .filter((entry) => entry[1] === viewerId)
      .map(([key]) => { const [platform, userId] = key.split('\u0000'); return { platform, userId }; });
    return { operation: 'export', found: viewer !== undefined || linkedAccounts.length > 0, viewerId,
      projection: viewer ? { points: viewer.points, level: viewer.level, lastSeenAt: viewer.lastSeenAt, lastAwardAt: viewer.lastAwardAt, ...achievementProjection(viewer.points, settings) } : null,
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
  if (request.operation !== 'correct') throw new Error('Unsupported Viewer Foundation administration operation.');
  const existing = state.viewers[viewerId] || { points: 0, level: 1, lastAwardAt: {}, lastSeenAt: 0 };
  const amount = integer(request.amount, 1, 1_000_000, 1);
  const totalPoints = request.adjustment === 'reset' ? 0
    : request.adjustment === 'remove' ? Math.max(0, existing.points - amount)
      : Math.min(Number.MAX_SAFE_INTEGER, existing.points + amount);
  const level = Math.floor(totalPoints / settings.levelStepPoints) + 1;
  state.viewers[viewerId] = { ...existing, points: totalPoints, level, lastSeenAt: now };
  state.adminAudit.push({ operation: 'correct', subject: viewerId, at: now, reason: clean(request.reason, 200),
    previousPoints: existing.points, totalPoints });
  await context.state.write(sanitizeViewerFoundationState(state, settings, now));
  return { operation: 'correct', viewerId, adjustment: request.adjustment, previousPoints: existing.points,
    points: totalPoints, level, nextLevelAt: level * settings.levelStepPoints, ...achievementProjection(totalPoints, settings) };
}

export function resetViewerFoundationRuntime() { operation = Promise.resolve(); unregisterProvider = undefined; }

export default {
  manifest, required: false,
  async start(context) {
    operation = Promise.resolve();
    const settings = settingsFor(context);
    if (!settings.enabled) return;
    const state = sanitizeViewerFoundationState(await context.state.read(), settings);
    await context.state.write(state);
    unregisterProvider = context.viewerFoundation.provide(Object.freeze({
      getProjection: (query) => serialize(() => projectionForQuery(query, context)),
      mutate: (request) => serialize(() => mutateViewer(request, context)),
      administer: (request) => serialize(() => administerViewer(request, context)),
    }));
  },
  async stop() { await operation.catch(() => undefined); unregisterProvider?.(); unregisterProvider = undefined; operation = Promise.resolve(); },
  async onEvent(event, context) { await serialize(() => processViewerEvent(event, context)); },
};
