// Translate combines explicit viewer commands and privacy-gated automatic translation behind one
// settings card and one broker-approved Streamer.bot action. Message text is never persisted.
const TRANSLATE_ACTION_ID = 'a6c9d452-7627-4bc2-b0b3-46735d8aa120';
const RESULT_EVENT = 'addon.thsv.user-translate.translation-received';
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok']);
const LANGUAGE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/u;

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: 'thsv.user-translate', name: 'Translate', version: '4.0.3',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.3', maximumTestedBridgeVersion: '4.0.3', dependencies: [], requiredCapabilities: [],
  configurationSchema: 'schemas/config.json', eventSubscriptions: ['chat.message', RESULT_EVENT],
  commandsProvided: [
    { id: 'user-translate.generic', name: 'translate (usage: !translate buenos dias)' },
    { id: 'user-translate.language-code', name: 'language-code commands (examples: !en, !es, !fr)' },
  ],
  actionsProvided: [{ id: 'user-translate.translate', name: 'Required bounded translation request' }],
  browserSourcesProvided: [], dataStorageOwned: ['data/addons/thsv.user-translate/', 'data/addons/.state/thsv.user-translate/'],
  installationSteps: [
    'Install the add-on, choose Manual, Automatic, or Both, then review the provider privacy disclosure.',
    'Import the Translate Streamer.bot package and approve its one Translate Text action.',
    'Manual examples: !translate buenos dias, !translate fr hello, !es hello, or a Twitch reply containing !en.',
    'Automatic mode starts allowlist-only and remains bounded by cooldown, percentage, and per-minute limits.',
  ],
  uninstallationSteps: ['Uninstall the add-on. Only bounded cooldown metadata is retained; message text is never stored.'], migrations: [],
  healthChecks: [{ id: 'thsv.user-translate.runtime', description: 'Confirms bounded manual/automatic selection, provider dispatch, and source-platform response routing.' }],
};

const FALLBACKS = Object.freeze({
  enabled: true, mode: 'manual', enabledPlatforms: PLATFORMS, provider: 'google-web', sourceLanguage: 'auto', targetLanguage: 'en',
  commandPrefix: '!', genericCommandName: 'translate', languageCommands: ['en', 'es', 'fr', 'de', 'pt'],
  tutorialMessage: 'Usage: !translate text, !translate {targetLanguage} text, or !{targetLanguage} text. On Twitch, you can also reply with !{targetLanguage}.',
  responseTemplate: '{author}: ({targetLanguage}) {translation}', errorMessage: 'Translation is temporarily unavailable. Please try again later.',
  automaticAudienceMode: 'allowlist-only', automaticAllowedNames: [], automaticIgnoredNames: ['nightbot', 'streamelements', 'fossabot', 'moobot', 'sery_bot', 'soundalerts', 'wizebot', 'kofistreambot', 'botrix', 'streamlabs'],
  automaticResponseTemplate: '{author}: ({sourceLanguage} to {targetLanguage}) {translation}',
  showAutomaticErrors: false, automaticErrorMessage: 'Automatic translation is temporarily unavailable.',
  maximumInputCharacters: 1000, timeoutSeconds: 8, userCooldownSeconds: 15, globalCooldownSeconds: 2, maximumPendingRequests: 10,
  maximumTranslationsPerMinute: 10, percentageWindowMessages: 100, percentageMinimumSample: 10, maximumTranslatedPercentage: 25,
});

function cleanText(value, maximum = 2000) {
  const normalized = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '';
  return [...normalized].slice(0, maximum).join('');
}
function cleanLanguage(value) { const language = cleanText(value, 20).toLocaleLowerCase('en-US'); return LANGUAGE.test(language) ? language : ''; }
function sourceLanguage(value) { const language = cleanText(value, 20).toLocaleLowerCase('en-US'); return language === 'auto' ? 'auto' : cleanLanguage(language); }
function cleanName(value) { return cleanText(value, 256).toLocaleLowerCase('en-US'); }
function settingsFor(context) { return { ...FALLBACKS, ...(context.settings ?? {}) }; }
function platformOf(value) { return PLATFORMS.includes(value) ? value : undefined; }
function userKey(event) { return `${event.platform}:${cleanText(event.user?.id || event.user?.name, 256).toLocaleLowerCase('en-US')}`; }
function viewerNames(event) { return new Set([event.user?.id, event.user?.name, event.user?.displayName].map(cleanName).filter(Boolean)); }
function listMatches(values, names) { return Array.isArray(values) && values.some((value) => names.has(cleanName(value))); }
function render(template, values) { let result = cleanText(template, 1000); for (const [token, value] of Object.entries(values)) result = result.split(`{${token}}`).join(cleanText(value, 4000)); return cleanText(result, 4000); }
function sanitizeTimes(value, maximum = 500) { return Array.isArray(value) ? value.filter((item) => item && typeof item.key === 'string' && Number.isFinite(item.at)).slice(-maximum).map((item) => ({ key: cleanText(item.key, 600), at: Math.max(0, Math.floor(item.at)) })) : []; }
function sanitizePending(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item.requestId === 'string' && platformOf(item.platform) && typeof item.author === 'string' && typeof item.targetLanguage === 'string' && Number.isFinite(item.createdAt)).slice(-20).map((item) => ({
    requestId: cleanText(item.requestId, 100), platform: platformOf(item.platform), author: cleanText(item.author, 256),
    mode: item.mode === 'automatic' ? 'automatic' : 'manual', sourceLanguage: sourceLanguage(item.sourceLanguage),
    targetLanguage: cleanLanguage(item.targetLanguage), createdAt: Math.max(0, Math.floor(item.createdAt)),
  })).filter((item) => item.requestId && item.author && item.sourceLanguage && item.targetLanguage);
}
function sanitizeState(value) { const state = value && typeof value === 'object' ? value : {}; return { pending: sanitizePending(state.pending), userCooldowns: sanitizeTimes(state.userCooldowns), lastRequestAt: Number.isFinite(state.lastRequestAt) ? Math.max(0, Math.floor(state.lastRequestAt)) : 0 }; }

export function parseTranslationCommand(event, settings = FALLBACKS) {
  if (event?.eventType !== 'chat.message') return undefined;
  const message = typeof event.payload?.message === 'string' ? event.payload.message.trim() : '';
  const prefix = typeof settings.commandPrefix === 'string' ? settings.commandPrefix : '!';
  if (prefix.length !== 1 || !message.startsWith(prefix)) return undefined;
  const withoutPrefix = message.slice(prefix.length).trimStart();
  const separator = withoutPrefix.search(/\s/u);
  const command = cleanText(separator < 0 ? withoutPrefix : withoutPrefix.slice(0, separator), 64).toLocaleLowerCase('en-US');
  const rawArguments = separator < 0 ? '' : withoutPrefix.slice(separator).trim();
  const configuredGeneric = cleanText(settings.genericCommandName, 64).toLocaleLowerCase('en-US');
  let targetLanguage = '';
  let inputText = '';
  if (command === configuredGeneric) {
    const targetEnd = rawArguments.search(/\s/u);
    const first = cleanLanguage(targetEnd < 0 ? rawArguments : rawArguments.slice(0, targetEnd));
    const configuredLanguages = settings.languageCommands.map(cleanLanguage);
    if (first && configuredLanguages.includes(first) && targetEnd >= 0) {
      targetLanguage = first;
      inputText = rawArguments.slice(targetEnd).trim();
    } else {
      targetLanguage = cleanLanguage(settings.targetLanguage);
      inputText = rawArguments;
    }
  }
  else if (settings.languageCommands.map(cleanLanguage).includes(command)) { targetLanguage = command; inputText = rawArguments; }
  else return undefined;
  const replyText = event.platform === 'twitch' && event.payload?.isReply === true ? cleanText(event.payload?.replyMessage, settings.maximumInputCharacters) : '';
  const replyAuthor = replyText ? cleanText(event.payload?.replyUserName, 256) : '';
  const normalizedInput = cleanText(inputText || replyText, settings.maximumInputCharacters);
  return { targetLanguage, inputText: normalizedInput, author: replyAuthor || cleanText(event.user?.displayName || event.user?.name, 256), usedReply: Boolean(replyText && !inputText) };
}

let cleanupTimer;
let stopped = false;
let operation = Promise.resolve();
function serialize(task) { operation = operation.then(task, task); return operation; }
function cancelCleanup(context) { if (cleanupTimer !== undefined) context.schedule.cancel(cleanupTimer); cleanupTimer = undefined; }
function scheduleCleanup(context) { cancelCleanup(context); cleanupTimer = context.schedule.after(60_000, () => serialize(async () => { cleanupTimer = undefined; await prune(context); if (!stopped) scheduleCleanup(context); })); }
async function prune(context) { const state = sanitizeState(await context.state.read()); const cutoff = Date.now() - 120_000; state.pending = state.pending.filter((item) => item.createdAt >= cutoff); state.userCooldowns = state.userCooldowns.filter((item) => item.at >= Date.now() - 86_400_000); await context.state.write(state); }

async function sendTutorial(event, parsed, context, settings) {
  if (event.metadata?.simulated === true) return;
  const message = render(settings.tutorialMessage, { targetLanguage: parsed.targetLanguage || settings.sourceLanguage });
  if (message) await context.chat.send({ message, routing: 'source', sourcePlatform: event.platform, overflow: 'split' });
}

async function requestTranslation(event, parsed, context, settings) {
  if (!parsed.targetLanguage || !parsed.inputText) return sendTutorial(event, parsed, context, settings);
  const requestSourceLanguage = sourceLanguage(parsed.sourceLanguage ?? settings.sourceLanguage);
  if (!requestSourceLanguage || (settings.provider === 'mymemory' && requestSourceLanguage === 'auto') || requestSourceLanguage === parsed.targetLanguage) return sendTutorial(event, parsed, context, settings);
  if (event.metadata?.simulated === true || !context.approvedActionIds.includes(TRANSLATE_ACTION_ID)) return;
  const state = sanitizeState(await context.state.read());
  const now = Date.now(); const key = userKey(event); const lastUser = state.userCooldowns.find((item) => item.key === key)?.at ?? 0;
  state.pending = state.pending.filter((item) => item.createdAt >= now - 120_000);
  if (state.pending.length >= settings.maximumPendingRequests || now - state.lastRequestAt < settings.globalCooldownSeconds * 1000 || now - lastUser < settings.userCooldownSeconds * 1000) { await context.state.write(state); return; }
  const requestId = event.eventId;
  state.pending.push({ requestId, platform: event.platform, author: parsed.author || 'Viewer', mode: parsed.mode === 'automatic' ? 'automatic' : 'manual', sourceLanguage: requestSourceLanguage, targetLanguage: parsed.targetLanguage, createdAt: now });
  state.userCooldowns = [...state.userCooldowns.filter((item) => item.key !== key), { key, at: now }].slice(-500); state.lastRequestAt = now;
  await context.state.write(state); // Store correlation only; never persist the message being translated.
  try {
    await context.streamerbot.runApprovedAction(TRANSLATE_ACTION_ID, { requestId, text: parsed.inputText, provider: settings.provider, sourceLanguage: requestSourceLanguage, targetLanguage: parsed.targetLanguage, timeoutSeconds: settings.timeoutSeconds });
  } catch {
    const latest = sanitizeState(await context.state.read()); latest.pending = latest.pending.filter((item) => item.requestId !== requestId); await context.state.write(latest);
  }
}

async function receiveTranslation(event, context) {
  const requestId = cleanText(event.payload?.requestId, 100); if (!requestId) return;
  const state = sanitizeState(await context.state.read()); const pending = state.pending.find((item) => item.requestId === requestId);
  state.pending = state.pending.filter((item) => item.requestId !== requestId); await context.state.write(state);
  if (!pending || event.metadata?.simulated === true) return;
  const settings = settingsFor(context); const succeeded = event.payload?.succeeded === true;
  const translated = cleanText(event.payload?.translatedText, 4000);
  const tokens = { author: pending.author, sourceLanguage: pending.sourceLanguage, targetLanguage: pending.targetLanguage, translation: translated };
  const message = pending.mode === 'automatic'
    ? (succeeded && translated ? render(settings.automaticResponseTemplate, tokens) : (settings.showAutomaticErrors ? cleanText(settings.automaticErrorMessage, 500) : ''))
    : (succeeded && translated ? render(settings.responseTemplate, tokens) : cleanText(settings.errorMessage, 500));
  if (message) await context.chat.send({ message, routing: 'source', sourcePlatform: pending.platform, overflow: 'split' });
}

const recentEvents = new Map(); let recentMessages = []; let recentTranslations = [];
export function resetTranslateRuntime() { recentEvents.clear(); recentMessages = []; recentTranslations = []; }
export function shouldAutomaticallyTranslate(event, settings = FALLBACKS, now = Date.now()) {
  if (!settings.enabled || !['automatic', 'both'].includes(settings.mode) || event?.eventType !== 'chat.message' || event.metadata?.simulated === true) return { accepted: false, reason: 'disabled-or-not-live' };
  const platform = platformOf(event.platform); if (!platform || !settings.enabledPlatforms.includes(platform)) return { accepted: false, reason: 'platform' };
  if (!event.user || event.user.actorType !== 'human') return { accepted: false, reason: 'actor' };
  const message = cleanText(event.payload?.message, settings.maximumInputCharacters); if (!message || message.startsWith(settings.commandPrefix || '!')) return { accepted: false, reason: message ? 'command' : 'empty' };
  const eventId = cleanText(event.eventId, 100); if (!eventId || recentEvents.has(eventId)) return { accepted: false, reason: 'duplicate' };
  recentEvents.set(eventId, now); for (const [key, at] of recentEvents) if (at < now - 120_000 || recentEvents.size > 500) recentEvents.delete(key);
  recentMessages = [...recentMessages, now].slice(-settings.percentageWindowMessages);
  const names = viewerNames(event); if (listMatches(settings.automaticIgnoredNames, names)) return { accepted: false, reason: 'ignored' };
  if (settings.automaticAudienceMode === 'allowlist-only' && !listMatches(settings.automaticAllowedNames, names)) return { accepted: false, reason: 'not-allowed' };
  const from = sourceLanguage(settings.sourceLanguage); const to = cleanLanguage(settings.targetLanguage);
  if (!from || !to || (settings.provider === 'mymemory' && from === 'auto') || from === to) return { accepted: false, reason: 'languages' };
  const cutoff = now - 60_000; recentTranslations = recentTranslations.filter((at) => at >= cutoff);
  if (recentTranslations.length >= settings.maximumTranslationsPerMinute) return { accepted: false, reason: 'minute-limit' };
  if (recentMessages.length >= settings.percentageMinimumSample && ((recentTranslations.length + 1) * 100) / recentMessages.length > settings.maximumTranslatedPercentage) return { accepted: false, reason: 'percentage-limit' };
  return { accepted: true, mode: 'automatic', inputText: message, platform, sourceLanguage: from, targetLanguage: to, author: cleanText(event.user.displayName || event.user.name, 256) || 'Viewer' };
}

async function handleEvent(event, context) {
  const settings = settingsFor(context); if (!settings.enabled) return;
  if (event.eventType === RESULT_EVENT) return receiveTranslation(event, context);
  const platform = platformOf(event.platform); if (!platform || !settings.enabledPlatforms.includes(platform) || !event.user || event.user.actorType !== 'human') return;
  if (['manual', 'both'].includes(settings.mode)) {
    const parsed = parseTranslationCommand(event, settings);
    if (parsed) return requestTranslation(event, { ...parsed, mode: 'manual' }, context, settings);
  }
  const automatic = shouldAutomaticallyTranslate(event, settings);
  if (automatic.accepted) { recentTranslations.push(Date.now()); await requestTranslation(event, automatic, context, settings); }
}

export default {
  manifest, required: false,
  async start(context) { stopped = false; operation = Promise.resolve(); resetTranslateRuntime(); await prune(context); scheduleCleanup(context); },
  async stop(context) { stopped = true; cancelCleanup(context); await operation; resetTranslateRuntime(); },
  async onEvent(event, context) { await serialize(() => handleEvent(event, context)); },
};
