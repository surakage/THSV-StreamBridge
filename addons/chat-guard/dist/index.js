// Chat Guard classifies normalized public chat and can optionally dispatch one creator-approved,
// fail-closed moderation controller. Enforcement is disabled until both approval switches are saved.
const MODERATE_ACTION_ID = '9b8d5b4a-6a6f-4f63-a09a-85bddc872ea9';
const RESULT_EVENT = 'addon.thsv.chat-guard.moderation-result';
const TRUST_EVENT = 'addon.thsv.chat-guard.trusted-account-request';
const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: 'thsv.chat-guard', name: 'Chat Guard', version: '3.5.0',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '3.5.0', maximumTestedBridgeVersion: '3.5.0',
  dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json', eventSubscriptions: ['chat.message', RESULT_EVENT, TRUST_EVENT], commandsProvided: [{ id: 'chat-guard.trust-viewer', name: '!guardtrust' }], actionsProvided: [{ id: 'chat-guard.moderate', name: 'THSV Addon - Chat Guard - Moderate' }, { id: 'chat-guard.trust-viewer', name: 'THSV Addon - Chat Guard - Trust Viewer' }], browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.chat-guard/', 'data/addons/.state/thsv.chat-guard/'],
  installationSteps: ['Enable safe observation, select the public-chat platforms to watch, optionally enter obvious blocked words or websites, then save and restart. Observation cannot moderate anyone.', 'Import the matching Chat Guard Streamer.bot package. Leave Moderate enabled and triggerless. Review the disabled !guardtrust command before enabling it.', 'Use the rule tester and privacy-safe moderation dashboard. Filter incidents and label false positives before changing enforcement rules.', 'To trust one viewer, reply to their message with !guardtrust as the broadcaster or a moderator, then refresh Trusted viewers in the wizard.', 'Optional: approve Moderate, turn on both automatic-action safety switches, and begin with Warn. Use delete, timeout, or ban only after genuine live acceptance.'],
  uninstallationSteps: ['Uninstall the add-on. Its private pseudonymous incident state remains preserved for a later reinstall or creator review.'], migrations: [],
  healthChecks: [{ id: 'thsv.chat-guard.runtime', description: 'Confirms bounded public-chat classification and fail-closed optional moderation dispatch are available.' }],
};
const FALLBACKS = Object.freeze({ enabled: false, includeSimulated: false, enabledPlatforms: ['twitch', 'youtube', 'kick', 'tiktok'], ignoredAccounts: ['twitch|name:nightbot', 'twitch|name:streamelements', 'youtube|name:streamelements', 'kick|name:streamelements', 'twitch|name:fossabot', 'twitch|name:moobot', 'twitch|name:sery_bot', 'twitch|name:soundalerts', 'twitch|name:wizebot', 'twitch|name:kofistreambot', 'twitch|name:streamlabs', 'twitch|name:botrix', 'youtube|name:botrix', 'kick|name:botrix', 'tiktok|name:botrix'], exemptBroadcaster: true, exemptModerators: true, exemptVips: true, exemptSubscribers: false,
  enforcementEnabled: false, creatorApprovedEnforcement: false, enforcementMode: 'observe', enforcementPlatforms: ['twitch', 'youtube', 'kick'], enforcedRules: ['blocked-term', 'blocked-domain'], minimumRuleMatches: 1, timeoutSeconds: 60, warningMessage: 'Please keep chat safe and follow the channel rules.', maximumEnforcementsPerMinute: 5, perUserEnforcementCooldownSeconds: 60,
  blockedTerms: [], blockedDomains: [], allowedDomains: [], detectLinks: true, maximumLinks: 2, detectCaps: true, minimumCapsLetters: 12, maximumCapsPercent: 80, detectRepeatedCharacters: true, maximumCharacterRun: 8,
  detectLongMessages: true, maximumMessageCharacters: 500, detectRepeatedMessages: true, repeatWindowSeconds: 30, repeatMessageCount: 3, retainedIncidents: 200, retentionHours: 24, maximumTrackedObservations: 500 });
const PLATFORM = /^(twitch|youtube|kick|tiktok)$/u;
const HEX_64 = /^[a-f0-9]{64}$/u;
const RULE = /^(blocked-term|blocked-domain|unapproved-domain|excessive-links|excessive-caps|repeated-characters|long-message|repeated-message)$/u;
const MAXIMUM_STATE_BYTES = 60_000;
let operation = Promise.resolve();

function clean(value, maximum = 512) { return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, '').trim() : '')].slice(0, maximum).join(''); }
function integer(value, minimum, maximum, fallback) { return Number.isSafeInteger(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback; }
async function digest(value) { const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(hash)].map((item) => item.toString(16).padStart(2, '0')).join(''); }
function randomSalt() { const bytes = new Uint8Array(32); globalThis.crypto.getRandomValues(bytes); return [...bytes].map((item) => item.toString(16).padStart(2, '0')).join(''); }
function settingsFor(context) {
  const raw = { ...FALLBACKS, ...(context.settings || {}) };
  return { ...raw,
    enabledPlatforms: new Set(Array.isArray(raw.enabledPlatforms) ? raw.enabledPlatforms.filter((item) => PLATFORM.test(item)) : FALLBACKS.enabledPlatforms),
    enforcementPlatforms: new Set(Array.isArray(raw.enforcementPlatforms) ? raw.enforcementPlatforms.filter((item) => PLATFORM.test(item)) : FALLBACKS.enforcementPlatforms),
    enforcedRules: new Set(Array.isArray(raw.enforcedRules) ? raw.enforcedRules.filter((item) => RULE.test(item)) : FALLBACKS.enforcedRules),
    ignoredAccounts: new Set(Array.isArray(raw.ignoredAccounts) ? raw.ignoredAccounts.map((item) => clean(item, 330).toLowerCase()).filter(Boolean).slice(0, 500) : []),
    blockedTerms: Array.isArray(raw.blockedTerms) ? raw.blockedTerms.map((item) => clean(item, 80).toLocaleLowerCase()).filter(Boolean).slice(0, 100) : [],
    blockedDomains: Array.isArray(raw.blockedDomains) ? [...new Set(raw.blockedDomains.map(normalizeDomain).filter(Boolean))].slice(0, 200) : [],
    allowedDomains: Array.isArray(raw.allowedDomains) ? [...new Set(raw.allowedDomains.map(normalizeDomain).filter(Boolean))].slice(0, 200) : [],
    maximumLinks: integer(raw.maximumLinks, 0, 20, 2), minimumCapsLetters: integer(raw.minimumCapsLetters, 4, 100, 12), maximumCapsPercent: integer(raw.maximumCapsPercent, 50, 100, 80),
    maximumCharacterRun: integer(raw.maximumCharacterRun, 3, 50, 8), maximumMessageCharacters: integer(raw.maximumMessageCharacters, 40, 2000, 500), repeatWindowSeconds: integer(raw.repeatWindowSeconds, 5, 300, 30), repeatMessageCount: integer(raw.repeatMessageCount, 2, 10, 3),
    enforcementMode: ['observe', 'warn', 'delete', 'timeout', 'ban'].includes(raw.enforcementMode) ? raw.enforcementMode : 'observe', minimumRuleMatches: integer(raw.minimumRuleMatches, 1, 8, 1), timeoutSeconds: integer(raw.timeoutSeconds, 10, 86_400, 60), warningMessage: clean(raw.warningMessage, 300) || FALLBACKS.warningMessage, maximumEnforcementsPerMinute: integer(raw.maximumEnforcementsPerMinute, 1, 20, 5), perUserEnforcementCooldownSeconds: integer(raw.perUserEnforcementCooldownSeconds, 10, 3600, 60),
    retainedIncidents: integer(raw.retainedIncidents, 10, 1000, 200), retentionHours: integer(raw.retentionHours, 1, 168, 24), maximumTrackedObservations: integer(raw.maximumTrackedObservations, 50, 2000, 500) };
}
function sanitizeState(value, settings = FALLBACKS, now = Date.now()) {
  const source = value && typeof value === 'object' ? value : {}; const cutoff = now - integer(settings.retentionHours, 1, 168, 24) * 3_600_000;
  const salt = typeof source.salt === 'string' && HEX_64.test(source.salt) ? source.salt : randomSalt();
  const observations = Array.isArray(source.observations) ? source.observations.filter((item) => item && typeof item === 'object' && HEX_64.test(item.accountHash) && HEX_64.test(item.messageHash) && Number.isSafeInteger(item.at) && item.at >= cutoff).map((item) => ({ accountHash: item.accountHash, messageHash: item.messageHash, at: item.at })).slice(-integer(settings.maximumTrackedObservations, 50, 2000, 500)) : [];
  const processed = Array.isArray(source.processed) ? source.processed.filter((item) => item && typeof item === 'object' && HEX_64.test(item.id) && Number.isSafeInteger(item.at) && item.at >= cutoff).map((item) => ({ id: item.id, at: item.at })).slice(-integer(settings.maximumTrackedObservations, 50, 2000, 500)) : [];
  const incidents = Array.isArray(source.incidents) ? source.incidents.filter((item) => item && typeof item === 'object' && HEX_64.test(item.id) && HEX_64.test(item.accountHash) && HEX_64.test(item.messageHash) && Number.isSafeInteger(item.at) && item.at >= cutoff && PLATFORM.test(item.platform) && Array.isArray(item.rules)).map((item) => ({ id: item.id, at: item.at, platform: item.platform, accountHash: item.accountHash, messageHash: item.messageHash, rules: [...new Set(item.rules.filter((rule) => typeof rule === 'string' && /^[a-z][a-z0-9-]{0,63}$/u.test(rule)))].slice(0, 10), simulated: item.simulated === true, review: item.review === 'confirmed' || item.review === 'false-positive' ? item.review : 'unreviewed' })).filter((item) => item.rules.length > 0).slice(-integer(settings.retainedIncidents, 10, 1000, 200)) : [];
  const permits = Array.isArray(source.permits) ? source.permits.filter((item) => item && typeof item === 'object' && HEX_64.test(item.accountHash) && Number.isSafeInteger(item.expiresAt) && item.expiresAt > now && Number.isSafeInteger(item.remainingUses) && item.remainingUses > 0).map((item) => ({ accountHash: item.accountHash, expiresAt: item.expiresAt, remainingUses: integer(item.remainingUses, 1, 20, 1) })).sort((left, right) => left.expiresAt - right.expiresAt).slice(0, 500) : [];
  const trustedAccounts = Array.isArray(source.trustedAccounts) ? source.trustedAccounts.filter((item) => item && typeof item === 'object' && PLATFORM.test(item.platform) && clean(item.userId, 256) && clean(item.label, 80) && Number.isSafeInteger(item.addedAt)).map((item) => ({ platform: item.platform, userId: clean(item.userId, 256), label: clean(item.label, 80), addedAt: item.addedAt })).slice(-100) : [];
  const enforcementResults = Array.isArray(source.enforcementResults) ? source.enforcementResults.filter((item) => item && typeof item === 'object' && HEX_64.test(item.incidentId) && Number.isSafeInteger(item.at) && item.at >= cutoff && ['dispatched', 'succeeded', 'failed', 'unsupported'].includes(item.status)).map((item) => ({ incidentId: item.incidentId, accountHash: HEX_64.test(item.accountHash) ? item.accountHash : '', at: item.at, platform: PLATFORM.test(item.platform) ? item.platform : 'system', mode: ['warn', 'delete', 'timeout', 'ban'].includes(item.mode) ? item.mode : 'warn', status: item.status, error: clean(item.error, 160) })).slice(-100) : [];
  const state = { version: 2, salt, observations, processed, incidents, permits, trustedAccounts, enforcementResults };
  while (JSON.stringify(state).length > MAXIMUM_STATE_BYTES) {
    if (state.observations.length > 10) { state.observations.shift(); continue; }
    if (state.processed.length > 10) { state.processed.shift(); continue; }
    if (state.incidents.length > 10) { state.incidents.shift(); continue; }
    if (state.permits.length > 10) { state.permits.shift(); continue; }
    if (state.enforcementResults.length > 10) { state.enforcementResults.shift(); continue; }
    throw new Error('Chat Guard state cannot fit within its private-state safety limit.');
  }
  return state;
}
function canEnforce(platform, mode, event) {
  if (mode === 'warn') return true;
  if (mode === 'delete') return (platform === 'twitch' || platform === 'kick') && clean(event.source?.eventId, 256).length > 0;
  return platform === 'twitch' || platform === 'youtube' || platform === 'kick';
}
async function enforceIncident(event, incident, context, settings, state, now) {
  const mode = settings.enforcementMode;
  if (!settings.enforcementEnabled || !settings.creatorApprovedEnforcement || mode === 'observe' || incident.simulated) return 'none';
  if (!settings.enforcementPlatforms.has(event.platform)) return 'not-selected';
  const actionableRules = incident.rules.filter((rule) => settings.enforcedRules.has(rule));
  if (actionableRules.length < settings.minimumRuleMatches) return 'below-threshold';
  const recent = state.enforcementResults.filter((item) => item.at >= now - 60_000 && item.status !== 'unsupported').length;
  const sameViewerRecentlyEnforced = state.enforcementResults.some((item) => item.accountHash === incident.accountHash && item.at >= now - settings.perUserEnforcementCooldownSeconds * 1000 && item.status !== 'unsupported');
  if (recent >= settings.maximumEnforcementsPerMinute || sameViewerRecentlyEnforced || !canEnforce(event.platform, mode, event)) { state.enforcementResults.push({ incidentId: incident.id, accountHash: incident.accountHash, at: now, platform: event.platform, mode, status: 'unsupported', error: recent >= settings.maximumEnforcementsPerMinute ? 'Per-minute enforcement cap reached.' : sameViewerRecentlyEnforced ? 'Per-viewer enforcement cooldown is active.' : 'Mode is unsupported for this platform or missing a stable message ID.' }); return 'unsupported'; }
  if (mode === 'warn') {
    const delivered = await context.chat.send({ message: settings.warningMessage, routing: 'source', sourcePlatform: event.platform, overflow: 'reject' });
    const succeeded = delivered.some((item) => item.accepted === true); state.enforcementResults.push({ incidentId: incident.id, accountHash: incident.accountHash, at: now, platform: event.platform, mode, status: succeeded ? 'succeeded' : 'failed', error: succeeded ? '' : 'Warning delivery was rejected.' }); return succeeded ? 'succeeded' : 'failed';
  }
  const requestId = incident.id.slice(0, 32);
  await context.streamerbot.runApprovedAction(MODERATE_ACTION_ID, { chatGuardRequestId: requestId, chatGuardIncidentId: incident.id, chatGuardPlatform: event.platform, chatGuardMode: mode, chatGuardUserId: clean(event.user?.id, 256), chatGuardUserName: clean(event.user?.name, 256), chatGuardMessageId: clean(event.source?.eventId, 256), chatGuardBroadcastId: clean(event.channel?.id, 256), chatGuardTimeoutSeconds: settings.timeoutSeconds, chatGuardReason: `THSV Chat Guard: ${incident.rules.join(', ')}`.slice(0, 200) });
  state.enforcementResults.push({ incidentId: incident.id, accountHash: incident.accountHash, at: now, platform: event.platform, mode, status: 'dispatched', error: '' }); return 'dispatched';
}
async function handleTrustedAccountRequest(event, context, now = Date.now()) {
  const platform = clean(event.payload?.platform, 20); const userId = clean(event.payload?.userId, 256); const label = clean(event.payload?.label, 80);
  if (!PLATFORM.test(platform) || !userId || !label || event.payload?.authorized !== true || event.metadata?.simulated === true) return;
  const settings = settingsFor(context); const state = sanitizeState(await context.state.read(), settings, now);
  state.trustedAccounts = state.trustedAccounts.filter((item) => !(item.platform === platform && item.userId.toLowerCase() === userId.toLowerCase()));
  state.trustedAccounts.push({ platform, userId, label, addedAt: now });
  await context.state.write(sanitizeState(state, settings, now));
}
async function handleModerationResult(event, context, now = Date.now()) {
  const incidentId = clean(event.payload?.incidentId, 64); if (!HEX_64.test(incidentId)) return;
  const settings = settingsFor(context); const state = sanitizeState(await context.state.read(), settings, now); const pending = [...state.enforcementResults].reverse().find((item) => item.incidentId === incidentId && item.status === 'dispatched'); if (!pending) return;
  pending.status = event.payload?.success === true ? 'succeeded' : 'failed'; pending.error = pending.status === 'failed' ? clean(event.payload?.error, 160) || 'Streamer.bot moderation was not confirmed.' : '';
  await context.state.write(sanitizeState(state, settings, now));
}
function roleSet(user) { return new Set(Array.isArray(user?.roles) ? user.roles.map((role) => clean(role, 64).toLowerCase()) : []); }
function isExempt(user, settings) { const roles = roleSet(user); return (settings.exemptBroadcaster && roles.has('broadcaster')) || (settings.exemptModerators && (roles.has('moderator') || roles.has('mod'))) || (settings.exemptVips && roles.has('vip')) || (settings.exemptSubscribers && (roles.has('subscriber') || roles.has('member'))); }
function normalizeDomain(value) { const candidate = clean(value, 253).toLowerCase().replace(/^\.+|\.+$/gu, ''); if (!candidate || /[\s/@:]/u.test(candidate)) return ''; try { const hostname = new URL(`https://${candidate}`).hostname.toLowerCase().replace(/\.$/u, ''); return hostname && hostname.length <= 253 ? hostname : ''; } catch { return ''; } }
function extractLinkHosts(message) { const matches = message.match(/(?:https?:\/\/|www\.)[^\s<>{}\[\]"']+/giu) || []; return matches.map((value) => { try { return new URL(/^www\./iu.test(value) ? `https://${value}` : value).hostname.toLowerCase().replace(/\.$/u, ''); } catch { return ''; } }).filter(Boolean); }
function domainMatches(hostname, rule) { return hostname === rule || hostname.endsWith(`.${rule}`); }
function capsRatio(message) { const letters = [...message].filter((character) => /\p{L}/u.test(character)); const upper = letters.filter((character) => character === character.toLocaleUpperCase() && character !== character.toLocaleLowerCase()).length; return { letters: letters.length, percent: letters.length === 0 ? 0 : Math.round((upper / letters.length) * 100) }; }
function longestRun(message) { let longest = 0; let previous = ''; let current = 0; for (const character of [...message.toLocaleLowerCase()]) { if (character === previous) current += 1; else { previous = character; current = 1; } longest = Math.max(longest, current); } return longest; }
function classify(message, previousMatches, settings) {
  const rules = [];
  const normalized = message.toLocaleLowerCase();
  if (settings.blockedTerms.some((term) => normalized.includes(term))) rules.push('blocked-term');
  const linkHosts = extractLinkHosts(message);
  if (settings.blockedDomains.some((domain) => linkHosts.some((host) => domainMatches(host, domain)))) rules.push('blocked-domain');
  if (settings.allowedDomains.length > 0 && linkHosts.some((host) => !settings.allowedDomains.some((domain) => domainMatches(host, domain)))) rules.push('unapproved-domain');
  if (settings.detectLinks && linkHosts.length > settings.maximumLinks) rules.push('excessive-links');
  const caps = capsRatio(message); if (settings.detectCaps && caps.letters >= settings.minimumCapsLetters && caps.percent >= settings.maximumCapsPercent) rules.push('excessive-caps');
  if (settings.detectRepeatedCharacters && longestRun(message) > settings.maximumCharacterRun) rules.push('repeated-characters');
  if (settings.detectLongMessages && [...message].length > settings.maximumMessageCharacters) rules.push('long-message');
  if (settings.detectRepeatedMessages && previousMatches + 1 >= settings.repeatMessageCount) rules.push('repeated-message');
  return rules;
}
export async function processChatGuardEvent(event, context, now = Date.now()) {
  const settings = settingsFor(context); if (!settings.enabled || event?.eventType !== 'chat.message' || !settings.enabledPlatforms.has(event.platform)) return undefined;
  if (event.metadata?.simulated === true && settings.includeSimulated !== true) return undefined;
  const user = event.user; if (!user?.id || user.actorType !== 'human' || isExempt(user, settings)) return undefined;
  const stableAccount = `${event.platform}|${clean(user.id, 256)}`.toLowerCase();
  const message = clean(event.payload?.message, 4000); if (!message) return undefined;
  const nameRules = [`${event.platform}|name:${clean(user.name, 256)}`, `${event.platform}|name:${clean(user.displayName, 256)}`].map((item) => item.toLowerCase());
  const state = sanitizeState(await context.state.read(), settings, now); if (settings.ignoredAccounts.has(stableAccount) || nameRules.some((rule) => settings.ignoredAccounts.has(rule)) || state.trustedAccounts.some((item) => item.platform === event.platform && item.userId.toLowerCase() === clean(user.id, 256).toLowerCase())) return undefined; const eventHash = await digest(`${state.salt}|event|${clean(event.eventId, 256)}`);
  if (state.processed.some((item) => item.id === eventHash)) return { duplicate: true };
  const accountHash = await digest(`${state.salt}|account|${stableAccount}`); const messageHash = await digest(`${state.salt}|message|${message.toLocaleLowerCase()}`);
  const repeatCutoff = now - settings.repeatWindowSeconds * 1000; const previousMatches = state.observations.filter((item) => item.at >= repeatCutoff && item.accountHash === accountHash && item.messageHash === messageHash).length;
  let rules = classify(message, previousMatches, settings); const permit = state.permits.find((item) => item.accountHash === accountHash); const domainRuleMatched = rules.includes('blocked-domain') || rules.includes('unapproved-domain');
  const permitApplied = permit !== undefined && domainRuleMatched;
  if (permitApplied) { rules = rules.filter((rule) => rule !== 'blocked-domain' && rule !== 'unapproved-domain'); permit.remainingUses -= 1; if (permit.remainingUses <= 0) state.permits = state.permits.filter((item) => item !== permit); }
  state.observations.push({ accountHash, messageHash, at: now }); state.processed.push({ id: eventHash, at: now });
  let incident;
  if (rules.length > 0) { incident = { id: await digest(`${state.salt}|incident|${clean(event.eventId, 256)}|${rules.join(',')}`), at: now, platform: event.platform, accountHash, messageHash, rules, simulated: event.metadata?.simulated === true, review: 'unreviewed' }; state.incidents.push(incident); }
  let enforcement = 'none'; if (incident !== undefined) { try { enforcement = await enforceIncident(event, incident, context, settings, state, now); } catch { state.enforcementResults.push({ incidentId: incident.id, accountHash: incident.accountHash, at: now, platform: event.platform, mode: settings.enforcementMode, status: 'failed', error: 'Moderation dispatch failed before provider confirmation.' }); enforcement = 'failed'; } }
  await context.state.write(sanitizeState(state, settings, now)); return { observed: true, flagged: incident !== undefined, rules, enforcement, permitApplied };
}
function incidentProjection(state, incident) {
  const enforcement = [...state.enforcementResults].reverse().find((item) => item.incidentId === incident.id);
  return { incidentId: incident.id, at: incident.at, platform: incident.platform, rules: incident.rules, simulated: incident.simulated,
    review: incident.review, viewerFingerprint: incident.accountHash.slice(0, 12),
    enforcement: enforcement ? { mode: enforcement.mode, status: enforcement.status, error: enforcement.error || '' } : { mode: 'observe', status: 'none', error: '' } };
}
function queryIncidents(state, request = {}) {
  const matching = state.incidents.filter((incident) => {
    if (request.platform && incident.platform !== request.platform) return false;
    if (request.rule && !incident.rules.includes(request.rule)) return false;
    if (request.review && incident.review !== request.review) return false;
    const status = incidentProjection(state, incident).enforcement.status;
    return !request.enforcementStatus || status === request.enforcementStatus;
  }).reverse();
  const offset = integer(request.offset, 0, 1_000, 0); const limit = integer(request.limit, 1, 100, 25);
  return { totalMatching: matching.length, offset, limit, hasMore: offset + limit < matching.length,
    nextOffset: offset + limit < matching.length ? offset + limit : null,
    incidents: matching.slice(offset, offset + limit).map((incident) => incidentProjection(state, incident)) };
}
export function summarizeChatGuardState(value, settings = FALLBACKS, now = Date.now()) { const state = sanitizeState(value, settings, now); const byRule = {}; const byPlatform = {}; const byReview = { unreviewed: 0, confirmed: 0, 'false-positive': 0 }; for (const incident of state.incidents) { byPlatform[incident.platform] = (byPlatform[incident.platform] || 0) + 1; byReview[incident.review] += 1; for (const rule of incident.rules) byRule[rule] = (byRule[rule] || 0) + 1; } const recentIncidents = state.incidents.slice(-20).reverse().map((incident) => incidentProjection(state, incident)); const enforcement = { dispatched: 0, succeeded: 0, failed: 0, unsupported: 0 }; for (const result of state.enforcementResults) enforcement[result.status] += 1; return { mode: settings.enforcementEnabled && settings.creatorApprovedEnforcement ? settings.enforcementMode : 'observe', incidentCount: state.incidents.length, trackedObservationCount: state.observations.length, byRule, byPlatform, byReview, enforcement, recentIncidents }; }
export async function administerChatGuard(request, context, now = Date.now()) {
  const settings = settingsFor(context); const state = sanitizeState(await context.state.read(), settings, now);
  if (request.operation === 'incidents') return { operation: 'incidents', privacy: 'No chat text, display names, or raw account IDs are retained.', ...queryIncidents(state, request) };
  if (request.operation === 'test') {
    const message = clean(request.message, 2000); if (!message) throw new Error('A non-empty sample message is required.');
    const priorMatchingMessages = integer(request.priorMatchingMessages, 0, 9, 0); const rules = classify(message, priorMatchingMessages, settings);
    return { operation: 'test', mode: 'observe-only', messageCharacters: [...message].length, priorMatchingMessages, flagged: rules.length > 0, rules, persisted: false, enforcementPerformed: false };
  }
  if (request.operation === 'trust-add') {
    if (request.approvedByCreator !== true) throw new Error('Creator approval is required to trust a viewer.');
    const platform = clean(request.platform, 20); const userId = clean(request.userId, 256); const label = clean(request.label, 80); if (!PLATFORM.test(platform) || !userId || !label) throw new Error('Platform, stable user ID, and friendly label are required.');
    state.trustedAccounts = state.trustedAccounts.filter((item) => !(item.platform === platform && item.userId.toLowerCase() === userId.toLowerCase())); state.trustedAccounts.push({ platform, userId, label, addedAt: now });
    await context.state.write(sanitizeState(state, settings, now)); return { operation: 'trust-add', trustedAccountCount: state.trustedAccounts.length, label, platform };
  }
  if (request.operation === 'trust-remove') {
    if (request.approvedByCreator !== true) throw new Error('Creator approval is required to remove a trusted viewer.');
    let removed = 0; const kept = []; for (const item of state.trustedAccounts) { const key = await digest(`${state.salt}|managed-trust|${item.platform}|${item.userId.toLowerCase()}`); if (key === request.accountKey) removed += 1; else kept.push(item); } state.trustedAccounts = kept;
    await context.state.write(sanitizeState(state, settings, now)); return { operation: 'trust-remove', removed, trustedAccountCount: state.trustedAccounts.length };
  }
  if (request.operation === 'clear') {
    if (request.approvedByCreator !== true) throw new Error('Creator approval is required to clear Chat Guard observations.');
    const removedIncidents = state.incidents.length; const removedObservations = state.observations.length;
    await context.state.write(sanitizeState({ salt: state.salt, incidents: [], observations: [], processed: [], permits: state.permits, trustedAccounts: state.trustedAccounts }, settings, now));
    return { operation: 'clear', mode: 'observe-only', removedIncidents, removedObservations, enforcementPerformed: false };
  }
  if (request.operation === 'permit') {
    if (request.approvedByCreator !== true) throw new Error('Creator approval is required to create a temporary link permit.');
    const platform = clean(request.platform, 20); const userId = clean(request.userId, 256); if (!PLATFORM.test(platform) || !userId) throw new Error('A supported platform and stable user ID are required.');
    const durationMinutes = integer(request.durationMinutes, 1, 1440, 15); const maximumUses = integer(request.maximumUses, 1, 20, 1); const accountHash = await digest(`${state.salt}|account|${platform}|${userId.toLowerCase()}`);
    state.permits = state.permits.filter((item) => item.accountHash !== accountHash); state.permits.push({ accountHash, expiresAt: now + durationMinutes * 60_000, remainingUses: maximumUses }); await context.state.write(sanitizeState(state, settings, now));
    return { operation: 'permit', mode: 'observe-only', expiresAt: now + durationMinutes * 60_000, maximumUses, activePermitCount: state.permits.length, enforcementPerformed: false };
  }
  if (request.operation === 'clear-permits') {
    if (request.approvedByCreator !== true) throw new Error('Creator approval is required to clear temporary link permits.');
    const removedPermits = state.permits.length; state.permits = []; await context.state.write(sanitizeState(state, settings, now)); return { operation: 'clear-permits', mode: 'observe-only', removedPermits, enforcementPerformed: false };
  }
  if (request.operation === 'review') {
    if (request.approvedByCreator !== true) throw new Error('Creator approval is required to review a Chat Guard incident.');
    const incident = state.incidents.find((item) => item.id === request.incidentId); if (!incident) throw new Error('The Chat Guard incident was not found or has expired.');
    incident.review = request.decision; await context.state.write(sanitizeState(state, settings, now)); return { operation: 'review', mode: 'observe-only', incidentId: incident.id, decision: incident.review, enforcementPerformed: false };
  }
  if (request.operation !== 'status') throw new Error('Unsupported Chat Guard administration operation.');
  const summary = summarizeChatGuardState(state, settings, now); const timestamps = state.incidents.map((item) => item.at);
  const capabilities = { twitch: { observe: true, warn: true, delete: true, timeout: true, ban: true }, youtube: { observe: true, warn: true, delete: false, timeout: true, ban: true }, kick: { observe: true, warn: true, delete: true, timeout: true, ban: true }, tiktok: { observe: true, warn: true, delete: false, timeout: false, ban: false } };
  const trustedAccounts = await Promise.all(state.trustedAccounts.map(async (item) => ({ accountKey: await digest(`${state.salt}|managed-trust|${item.platform}|${item.userId.toLowerCase()}`), platform: item.platform, label: item.label, idSuffix: item.userId.length <= 6 ? item.userId : item.userId.slice(-6), addedAt: item.addedAt })));
  return { operation: 'status', ...summary, enabled: settings.enabled === true, enabledPlatforms: [...settings.enabledPlatforms], includeSimulated: settings.includeSimulated === true,
    enforcementPolicy: { platforms: [...settings.enforcementPlatforms], rules: [...settings.enforcedRules], minimumRuleMatches: settings.minimumRuleMatches, maximumPerMinute: settings.maximumEnforcementsPerMinute, perUserCooldownSeconds: settings.perUserEnforcementCooldownSeconds }, trustedAccounts,
    retentionHours: settings.retentionHours, retainedIncidentLimit: settings.retainedIncidents, activePermitCount: state.permits.length, nextPermitExpiryAt: state.permits.length ? Math.min(...state.permits.map((item) => item.expiresAt)) : null, oldestIncidentAt: timestamps.length ? Math.min(...timestamps) : null, newestIncidentAt: timestamps.length ? Math.max(...timestamps) : null,
    configuredSignals: { literalTerms: settings.blockedTerms.length, blockedDomains: settings.blockedDomains.length, allowedDomains: settings.allowedDomains.length, excessiveLinks: settings.detectLinks === true, excessiveCaps: settings.detectCaps === true, repeatedCharacters: settings.detectRepeatedCharacters === true, longMessages: settings.detectLongMessages === true, repeatedMessages: settings.detectRepeatedMessages === true },
    providerCapabilities: capabilities };
}
function serialize(task) { operation = operation.then(task, task); return operation; }
export function resetChatGuardRuntime() { operation = Promise.resolve(); }
export { sanitizeState as sanitizeChatGuardState, classify as classifyChatGuardMessage };
export default { manifest, required: false, async start(context) { operation = Promise.resolve(); const settings = settingsFor(context); if (settings.enabled) await context.state.write(sanitizeState(await context.state.read(), settings)); }, async stop() { await operation.catch(() => undefined); operation = Promise.resolve(); }, async onEvent(event, context) { return serialize(() => event.eventType === RESULT_EVENT ? handleModerationResult(event, context) : event.eventType === TRUST_EVENT ? handleTrustedAccountRequest(event, context) : processChatGuardEvent(event, context)); }, async administerChatGuard(request, context) { return serialize(() => administerChatGuard(request, context)); } };
