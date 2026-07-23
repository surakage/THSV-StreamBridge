// Auto Translate is deliberately disabled by default. It translates only bounded, public,
// human-authored chat selected by creator policy and never persists the message text itself.
const TRANSLATE_ACTION_ID = 'b31de9cf-0d5d-4ba1-a63e-f9ffde20b27d';
const RESULT_EVENT = 'addon.thsv.auto-translate.translation-received';
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok']);
const LANGUAGE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/u;

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: 'thsv.auto-translate', name: 'Auto Translate', version: '2.4.0',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', dependencies: [], requiredCapabilities: [],
  configurationSchema: 'schemas/config.json', eventSubscriptions: ['chat.message', RESULT_EVENT], commandsProvided: [],
  actionsProvided: [{ id: 'auto-translate.translate', name: 'Required no-key MyMemory translation request' }],
  browserSourcesProvided: [], dataStorageOwned: ['data/addons/thsv.auto-translate/', 'data/addons/.state/thsv.auto-translate/'],
  installationSteps: [
    'Install the add-on but leave it disabled until its privacy notice, languages, audience, and rate limits are reviewed.',
    'Import the Auto Translate Streamer.bot package and approve only its Translate Text action.',
    'Set a known source language and a different target language. Automatic language detection is not claimed.',
    'Add viewer names to the allowlist before enabling the default allowlist-only mode.',
  ],
  uninstallationSteps: ['Uninstall the add-on. Bounded cooldown metadata is preserved; chat and translated text are never stored.'], migrations: [],
  healthChecks: [{ id: 'thsv.auto-translate.runtime', description: 'Confirms privacy-gated message selection, bounded provider dispatch, and source-platform response routing.' }],
};

const FALLBACKS = Object.freeze({
  enabled: false, enabledPlatforms: PLATFORMS, audienceMode: 'allowlist-only', allowedNames: [], ignoredNames: [],
  sourceLanguage: 'es', targetLanguage: 'en', commandPrefix: '!', responseTemplate: '{author}: ({sourceLanguage} to {targetLanguage}) {translation}',
  showProviderErrors: false, errorMessage: 'Automatic translation is temporarily unavailable.', maximumInputCharacters: 500,
  timeoutSeconds: 8, userCooldownSeconds: 60, globalCooldownSeconds: 5, maximumPendingRequests: 5,
  maximumTranslationsPerMinute: 10, percentageWindowMessages: 100, percentageMinimumSample: 10, maximumTranslatedPercentage: 25,
});

function cleanText(value, maximum = 2000) {
  const normalized = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '';
  return [...normalized].slice(0, maximum).join('');
}
function cleanLanguage(value) { const language = cleanText(value, 20).toLocaleLowerCase('en-US'); return LANGUAGE.test(language) ? language : ''; }
function cleanName(value) { return cleanText(value, 256).toLocaleLowerCase('en-US'); }
function settingsFor(context) { return { ...FALLBACKS, ...(context.settings ?? {}) }; }
function platformOf(value) { return PLATFORMS.includes(value) ? value : undefined; }
function viewerNames(event) { return new Set([event.user?.id, event.user?.name, event.user?.displayName].map(cleanName).filter(Boolean)); }
function listMatches(values, names) { return Array.isArray(values) && values.some((value) => names.has(cleanName(value))); }
function userKey(event) { return `${event.platform}:${cleanName(event.user?.id || event.user?.name)}`; }
function render(template, values) { let result = cleanText(template, 1000); for (const [token, value] of Object.entries(values)) result = result.split(`{${token}}`).join(cleanText(value, 4000)); return cleanText(result, 4000); }
function sanitizeTimes(value, maximum = 500) { return Array.isArray(value) ? value.filter((item) => item && typeof item.key === 'string' && Number.isFinite(item.at)).slice(-maximum).map((item) => ({ key: cleanText(item.key, 600), at: Math.max(0, Math.floor(item.at)) })) : []; }
function sanitizePending(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item.requestId === 'string' && platformOf(item.platform) && Number.isFinite(item.createdAt)).slice(-20).map((item) => ({
    requestId: cleanText(item.requestId, 100), platform: platformOf(item.platform), author: cleanText(item.author, 256),
    sourceLanguage: cleanLanguage(item.sourceLanguage), targetLanguage: cleanLanguage(item.targetLanguage), createdAt: Math.max(0, Math.floor(item.createdAt)),
  })).filter((item) => item.requestId && item.author && item.sourceLanguage && item.targetLanguage);
}
function sanitizeState(value) { const state = value && typeof value === 'object' ? value : {}; return { pending: sanitizePending(state.pending), userCooldowns: sanitizeTimes(state.userCooldowns), lastRequestAt: Number.isFinite(state.lastRequestAt) ? Math.max(0, Math.floor(state.lastRequestAt)) : 0 }; }

const recentEvents = new Map(); let recentMessages = []; let recentTranslations = [];
export function resetAutoTranslateRuntime() { recentEvents.clear(); recentMessages = []; recentTranslations = []; }

export function shouldTranslateMessage(event, settings = FALLBACKS, now = Date.now()) {
  if (!settings.enabled || event?.eventType !== 'chat.message' || event.metadata?.simulated === true) return { accepted: false, reason: 'disabled-or-not-live' };
  const platform = platformOf(event.platform); if (!platform || !settings.enabledPlatforms.includes(platform)) return { accepted: false, reason: 'platform' };
  if (!event.user || event.user.actorType !== 'human') return { accepted: false, reason: 'actor' };
  const message = cleanText(event.payload?.message, settings.maximumInputCharacters); if (!message) return { accepted: false, reason: 'empty' };
  if (message.startsWith(settings.commandPrefix || '!')) return { accepted: false, reason: 'command' };
  const eventId = cleanText(event.eventId, 100); if (!eventId || recentEvents.has(eventId)) return { accepted: false, reason: 'duplicate' };
  recentEvents.set(eventId, now); for (const [key, at] of recentEvents) if (at < now - 120_000 || recentEvents.size > 500) recentEvents.delete(key);
  recentMessages = [...recentMessages, now].slice(-settings.percentageWindowMessages);
  const names = viewerNames(event); if (listMatches(settings.ignoredNames, names)) return { accepted: false, reason: 'ignored' };
  if (settings.audienceMode === 'allowlist-only' && !listMatches(settings.allowedNames, names)) return { accepted: false, reason: 'not-allowed' };
  const sourceLanguage = cleanLanguage(settings.sourceLanguage); const targetLanguage = cleanLanguage(settings.targetLanguage);
  if (!sourceLanguage || !targetLanguage || sourceLanguage === targetLanguage) return { accepted: false, reason: 'languages' };
  const minuteCutoff = now - 60_000; recentTranslations = recentTranslations.filter((at) => at >= minuteCutoff);
  if (recentTranslations.length >= settings.maximumTranslationsPerMinute) return { accepted: false, reason: 'minute-limit' };
  if (recentMessages.length >= settings.percentageMinimumSample && ((recentTranslations.length + 1) * 100) / recentMessages.length > settings.maximumTranslatedPercentage) return { accepted: false, reason: 'percentage-limit' };
  return { accepted: true, message, platform, sourceLanguage, targetLanguage, author: cleanText(event.user.displayName || event.user.name, 256) || 'Viewer' };
}

let cleanupTimer; let stopped = false; let operation = Promise.resolve();
function serialize(task) { operation = operation.then(task, task); return operation; }
function cancelCleanup(context) { if (cleanupTimer !== undefined) context.schedule.cancel(cleanupTimer); cleanupTimer = undefined; }
function scheduleCleanup(context) { cancelCleanup(context); cleanupTimer = context.schedule.after(60_000, () => serialize(async () => { cleanupTimer = undefined; await prune(context); if (!stopped) scheduleCleanup(context); })); }
async function prune(context) { const state = sanitizeState(await context.state.read()); const now = Date.now(); state.pending = state.pending.filter((item) => item.createdAt >= now - 120_000); state.userCooldowns = state.userCooldowns.filter((item) => item.at >= now - 86_400_000); await context.state.write(state); }

async function requestTranslation(event, selection, context, settings) {
  if (!context.approvedActionIds.includes(TRANSLATE_ACTION_ID)) return;
  const state = sanitizeState(await context.state.read()); const now = Date.now(); const key = userKey(event); const lastUser = state.userCooldowns.find((item) => item.key === key)?.at ?? 0;
  state.pending = state.pending.filter((item) => item.createdAt >= now - 120_000);
  if (state.pending.length >= settings.maximumPendingRequests || now - state.lastRequestAt < settings.globalCooldownSeconds * 1000 || now - lastUser < settings.userCooldownSeconds * 1000) { await context.state.write(state); return; }
  state.pending.push({ requestId: event.eventId, platform: selection.platform, author: selection.author, sourceLanguage: selection.sourceLanguage, targetLanguage: selection.targetLanguage, createdAt: now });
  state.userCooldowns = [...state.userCooldowns.filter((item) => item.key !== key), { key, at: now }].slice(-500); state.lastRequestAt = now;
  await context.state.write(state); recentTranslations.push(now);
  try { await context.streamerbot.runApprovedAction(TRANSLATE_ACTION_ID, { requestId: event.eventId, text: selection.message, sourceLanguage: selection.sourceLanguage, targetLanguage: selection.targetLanguage, timeoutSeconds: settings.timeoutSeconds }); }
  catch { const latest = sanitizeState(await context.state.read()); latest.pending = latest.pending.filter((item) => item.requestId !== event.eventId); await context.state.write(latest); }
}

async function receiveTranslation(event, context) {
  const requestId = cleanText(event.payload?.requestId, 100); if (!requestId) return;
  const state = sanitizeState(await context.state.read()); const pending = state.pending.find((item) => item.requestId === requestId);
  state.pending = state.pending.filter((item) => item.requestId !== requestId); await context.state.write(state);
  if (!pending || event.metadata?.simulated === true) return;
  const settings = settingsFor(context); const translated = cleanText(event.payload?.translatedText, 4000); const succeeded = event.payload?.succeeded === true && translated;
  if (!settings.enabled || !settings.enabledPlatforms.includes(pending.platform)) return;
  const message = succeeded ? render(settings.responseTemplate, { author: pending.author, sourceLanguage: pending.sourceLanguage, targetLanguage: pending.targetLanguage, translation: translated }) : (settings.showProviderErrors ? cleanText(settings.errorMessage, 500) : '');
  if (message) await context.chat.send({ message, routing: 'source', sourcePlatform: pending.platform, overflow: 'split' });
}

async function handleEvent(event, context) { const settings = settingsFor(context); if (event.eventType === RESULT_EVENT) return receiveTranslation(event, context); const selection = shouldTranslateMessage(event, settings); if (selection.accepted) await requestTranslation(event, selection, context, settings); }

export default {
  manifest, required: false,
  async start(context) { stopped = false; operation = Promise.resolve(); resetAutoTranslateRuntime(); await prune(context); scheduleCleanup(context); },
  async stop(context) { stopped = true; cancelCleanup(context); await operation; resetAutoTranslateRuntime(); },
  async onEvent(event, context) { await serialize(() => handleEvent(event, context)); },
};
