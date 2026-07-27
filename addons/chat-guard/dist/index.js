// Chat Guard observes normalized public chat for creator-configured safety signals.
// This release is deliberately non-enforcing: it cannot warn, delete, timeout, ban, or call Streamer.bot.
const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: 'thsv.chat-guard', name: 'Chat Guard', version: '2.4.3',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '2.4.3', maximumTestedBridgeVersion: '2.4.3',
  dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json', eventSubscriptions: ['chat.message'], commandsProvided: [], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.chat-guard/', 'data/addons/.state/thsv.chat-guard/'],
  installationSteps: ['Install Chat Guard, review every observe-only rule, and leave it disabled until the preview matches your community.', 'Enable it to collect bounded pseudonymous incident metadata. No moderation action is performed.'],
  uninstallationSteps: ['Uninstall the add-on. Its private pseudonymous incident state remains preserved for a later reinstall or creator review.'], migrations: [],
  healthChecks: [{ id: 'thsv.chat-guard.runtime', description: 'Confirms bounded observe-only public-chat classification is available without moderation authority.' }],
};
const FALLBACKS = Object.freeze({ enabled: false, includeSimulated: false, enabledPlatforms: ['twitch', 'youtube', 'kick', 'tiktok'], ignoredAccounts: [], exemptBroadcaster: true, exemptModerators: true, exemptVips: true, exemptSubscribers: false,
  blockedTerms: [], blockedDomains: [], allowedDomains: [], detectLinks: true, maximumLinks: 2, detectCaps: true, minimumCapsLetters: 12, maximumCapsPercent: 80, detectRepeatedCharacters: true, maximumCharacterRun: 8,
  detectLongMessages: true, maximumMessageCharacters: 500, detectRepeatedMessages: true, repeatWindowSeconds: 30, repeatMessageCount: 3, retainedIncidents: 200, retentionHours: 24, maximumTrackedObservations: 500 });
const PLATFORM = /^(twitch|youtube|kick|tiktok)$/u;
const HEX_64 = /^[a-f0-9]{64}$/u;
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
    ignoredAccounts: new Set(Array.isArray(raw.ignoredAccounts) ? raw.ignoredAccounts.map((item) => clean(item, 330).toLowerCase()).filter(Boolean).slice(0, 500) : []),
    blockedTerms: Array.isArray(raw.blockedTerms) ? raw.blockedTerms.map((item) => clean(item, 80).toLocaleLowerCase()).filter(Boolean).slice(0, 100) : [],
    blockedDomains: Array.isArray(raw.blockedDomains) ? [...new Set(raw.blockedDomains.map(normalizeDomain).filter(Boolean))].slice(0, 200) : [],
    allowedDomains: Array.isArray(raw.allowedDomains) ? [...new Set(raw.allowedDomains.map(normalizeDomain).filter(Boolean))].slice(0, 200) : [],
    maximumLinks: integer(raw.maximumLinks, 0, 20, 2), minimumCapsLetters: integer(raw.minimumCapsLetters, 4, 100, 12), maximumCapsPercent: integer(raw.maximumCapsPercent, 50, 100, 80),
    maximumCharacterRun: integer(raw.maximumCharacterRun, 3, 50, 8), maximumMessageCharacters: integer(raw.maximumMessageCharacters, 40, 2000, 500), repeatWindowSeconds: integer(raw.repeatWindowSeconds, 5, 300, 30), repeatMessageCount: integer(raw.repeatMessageCount, 2, 10, 3),
    retainedIncidents: integer(raw.retainedIncidents, 10, 1000, 200), retentionHours: integer(raw.retentionHours, 1, 168, 24), maximumTrackedObservations: integer(raw.maximumTrackedObservations, 50, 2000, 500) };
}
function sanitizeState(value, settings = FALLBACKS, now = Date.now()) {
  const source = value && typeof value === 'object' ? value : {}; const cutoff = now - integer(settings.retentionHours, 1, 168, 24) * 3_600_000;
  const salt = typeof source.salt === 'string' && HEX_64.test(source.salt) ? source.salt : randomSalt();
  const observations = Array.isArray(source.observations) ? source.observations.filter((item) => item && typeof item === 'object' && HEX_64.test(item.accountHash) && HEX_64.test(item.messageHash) && Number.isSafeInteger(item.at) && item.at >= cutoff).map((item) => ({ accountHash: item.accountHash, messageHash: item.messageHash, at: item.at })).slice(-integer(settings.maximumTrackedObservations, 50, 2000, 500)) : [];
  const processed = Array.isArray(source.processed) ? source.processed.filter((item) => item && typeof item === 'object' && HEX_64.test(item.id) && Number.isSafeInteger(item.at) && item.at >= cutoff).map((item) => ({ id: item.id, at: item.at })).slice(-integer(settings.maximumTrackedObservations, 50, 2000, 500)) : [];
  const incidents = Array.isArray(source.incidents) ? source.incidents.filter((item) => item && typeof item === 'object' && HEX_64.test(item.id) && HEX_64.test(item.accountHash) && HEX_64.test(item.messageHash) && Number.isSafeInteger(item.at) && item.at >= cutoff && PLATFORM.test(item.platform) && Array.isArray(item.rules)).map((item) => ({ id: item.id, at: item.at, platform: item.platform, accountHash: item.accountHash, messageHash: item.messageHash, rules: [...new Set(item.rules.filter((rule) => typeof rule === 'string' && /^[a-z][a-z0-9-]{0,63}$/u.test(rule)))].slice(0, 10), simulated: item.simulated === true, review: item.review === 'confirmed' || item.review === 'false-positive' ? item.review : 'unreviewed' })).filter((item) => item.rules.length > 0).slice(-integer(settings.retainedIncidents, 10, 1000, 200)) : [];
  const permits = Array.isArray(source.permits) ? source.permits.filter((item) => item && typeof item === 'object' && HEX_64.test(item.accountHash) && Number.isSafeInteger(item.expiresAt) && item.expiresAt > now && Number.isSafeInteger(item.remainingUses) && item.remainingUses > 0).map((item) => ({ accountHash: item.accountHash, expiresAt: item.expiresAt, remainingUses: integer(item.remainingUses, 1, 20, 1) })).sort((left, right) => left.expiresAt - right.expiresAt).slice(0, 500) : [];
  const state = { version: 1, salt, observations, processed, incidents, permits };
  while (JSON.stringify(state).length > MAXIMUM_STATE_BYTES) {
    if (state.observations.length > 10) { state.observations.shift(); continue; }
    if (state.processed.length > 10) { state.processed.shift(); continue; }
    if (state.incidents.length > 10) { state.incidents.shift(); continue; }
    if (state.permits.length > 10) { state.permits.shift(); continue; }
    throw new Error('Chat Guard state cannot fit within its private-state safety limit.');
  }
  return state;
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
  const stableAccount = `${event.platform}|${clean(user.id, 256)}`.toLowerCase(); if (settings.ignoredAccounts.has(stableAccount)) return undefined;
  const message = clean(event.payload?.message, 4000); if (!message) return undefined;
  const state = sanitizeState(await context.state.read(), settings, now); const eventHash = await digest(`${state.salt}|event|${clean(event.eventId, 256)}`);
  if (state.processed.some((item) => item.id === eventHash)) return { duplicate: true };
  const accountHash = await digest(`${state.salt}|account|${stableAccount}`); const messageHash = await digest(`${state.salt}|message|${message.toLocaleLowerCase()}`);
  const repeatCutoff = now - settings.repeatWindowSeconds * 1000; const previousMatches = state.observations.filter((item) => item.at >= repeatCutoff && item.accountHash === accountHash && item.messageHash === messageHash).length;
  let rules = classify(message, previousMatches, settings); const permit = state.permits.find((item) => item.accountHash === accountHash); const domainRuleMatched = rules.includes('blocked-domain') || rules.includes('unapproved-domain');
  const permitApplied = permit !== undefined && domainRuleMatched;
  if (permitApplied) { rules = rules.filter((rule) => rule !== 'blocked-domain' && rule !== 'unapproved-domain'); permit.remainingUses -= 1; if (permit.remainingUses <= 0) state.permits = state.permits.filter((item) => item !== permit); }
  state.observations.push({ accountHash, messageHash, at: now }); state.processed.push({ id: eventHash, at: now });
  let incident;
  if (rules.length > 0) { incident = { id: await digest(`${state.salt}|incident|${clean(event.eventId, 256)}|${rules.join(',')}`), at: now, platform: event.platform, accountHash, messageHash, rules, simulated: event.metadata?.simulated === true, review: 'unreviewed' }; state.incidents.push(incident); }
  await context.state.write(sanitizeState(state, settings, now)); return { observed: true, flagged: incident !== undefined, rules, enforcement: 'none', permitApplied };
}
export function summarizeChatGuardState(value, settings = FALLBACKS, now = Date.now()) { const state = sanitizeState(value, settings, now); const byRule = {}; const byPlatform = {}; const byReview = { unreviewed: 0, confirmed: 0, 'false-positive': 0 }; for (const incident of state.incidents) { byPlatform[incident.platform] = (byPlatform[incident.platform] || 0) + 1; byReview[incident.review] += 1; for (const rule of incident.rules) byRule[rule] = (byRule[rule] || 0) + 1; } const recentIncidents = state.incidents.slice(-20).reverse().map((incident) => ({ incidentId: incident.id, at: incident.at, platform: incident.platform, rules: incident.rules, simulated: incident.simulated, review: incident.review })); return { mode: 'observe-only', incidentCount: state.incidents.length, trackedObservationCount: state.observations.length, byRule, byPlatform, byReview, recentIncidents }; }
export async function administerChatGuard(request, context, now = Date.now()) {
  const settings = settingsFor(context); const state = sanitizeState(await context.state.read(), settings, now);
  if (request.operation === 'test') {
    const message = clean(request.message, 2000); if (!message) throw new Error('A non-empty sample message is required.');
    const priorMatchingMessages = integer(request.priorMatchingMessages, 0, 9, 0); const rules = classify(message, priorMatchingMessages, settings);
    return { operation: 'test', mode: 'observe-only', messageCharacters: [...message].length, priorMatchingMessages, flagged: rules.length > 0, rules, persisted: false, enforcementPerformed: false };
  }
  if (request.operation === 'clear') {
    if (request.approvedByCreator !== true) throw new Error('Creator approval is required to clear Chat Guard observations.');
    const removedIncidents = state.incidents.length; const removedObservations = state.observations.length;
    await context.state.write(sanitizeState({ salt: state.salt, incidents: [], observations: [], processed: [], permits: state.permits }, settings, now));
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
  const capability = { observe: true, warn: false, delete: false, timeout: false, ban: false, reason: 'Observe-only release; no provider-moderation or Streamer.bot action capability is granted.' };
  return { operation: 'status', ...summary, enabled: settings.enabled === true, enabledPlatforms: [...settings.enabledPlatforms], includeSimulated: settings.includeSimulated === true,
    retentionHours: settings.retentionHours, retainedIncidentLimit: settings.retainedIncidents, activePermitCount: state.permits.length, nextPermitExpiryAt: state.permits.length ? Math.min(...state.permits.map((item) => item.expiresAt)) : null, oldestIncidentAt: timestamps.length ? Math.min(...timestamps) : null, newestIncidentAt: timestamps.length ? Math.max(...timestamps) : null,
    configuredSignals: { literalTerms: settings.blockedTerms.length, blockedDomains: settings.blockedDomains.length, allowedDomains: settings.allowedDomains.length, excessiveLinks: settings.detectLinks === true, excessiveCaps: settings.detectCaps === true, repeatedCharacters: settings.detectRepeatedCharacters === true, longMessages: settings.detectLongMessages === true, repeatedMessages: settings.detectRepeatedMessages === true },
    providerCapabilities: Object.fromEntries(['twitch', 'youtube', 'kick', 'tiktok'].map((platform) => [platform, capability])) };
}
function serialize(task) { operation = operation.then(task, task); return operation; }
export function resetChatGuardRuntime() { operation = Promise.resolve(); }
export { sanitizeState as sanitizeChatGuardState, classify as classifyChatGuardMessage };
export default { manifest, required: false, async start(context) { operation = Promise.resolve(); const settings = settingsFor(context); if (settings.enabled) await context.state.write(sanitizeState(await context.state.read(), settings)); }, async stop() { await operation; operation = Promise.resolve(); }, async onEvent(event, context) { return serialize(() => processChatGuardEvent(event, context)); }, async administerChatGuard(request, context) { return serialize(() => administerChatGuard(request, context)); } };
