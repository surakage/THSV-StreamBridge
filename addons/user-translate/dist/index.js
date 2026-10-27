// Translate combines explicit viewer commands and privacy-gated automatic translation behind one
// settings card and one broker-approved Streamer.bot action. Message text is never persisted.
const TRANSLATE_ACTION_ID = 'a6c9d452-7627-4bc2-b0b3-46735d8aa120';
const RESULT_EVENT = 'addon.thsv.user-translate.translation-received';
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok']);
const LANGUAGE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/u;

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: 'thsv.user-translate', name: 'Translate', version: '4.0.56',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.56', maximumTestedBridgeVersion: '4.0.56', dependencies: [], requiredCapabilities: [],
  configurationSchema: 'schemas/config.json', eventSubscriptions: ['chat.message', RESULT_EVENT, 'system.live-caption.spoken', 'stream.offline', 'addon.thsv.user-translate.push-to-talk'],
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
  detectLanguageLocally: true,
  voiceSubscriptionsEnabled: false, voiceOnDemandEnabled: false, voiceCaptionsEnabled: false,
  voiceSubscribeCommand: 'translateme', voiceOnDemandCommand: 'whatdidyousay', voiceCaptionsCommand: 'captions',
  voiceLanguages: ['es', 'fr', 'de', 'pt', 'ja', 'ko', 'zh-cn'], voiceSourceLanguage: 'en', voiceMaximumLanguages: 3,
  voiceBatchSeconds: 30, voiceSubscriptionMinutes: 15, voiceOnDemandSeconds: 30, voiceOnDemandCooldownSeconds: 30, voiceCaptionMinutes: 10, voiceCaptionBatchSeconds: 6,
  voiceSubscribedMessage: '{viewer}, I will translate the streamer into {language} here for {minutes} minutes. Type !{command} off to stop.',
  voiceStoppedMessage: '{viewer}, voice translation stopped.',
  voiceLanguagesMessage: '{viewer}, pick a language: {languages}.',
  voiceFullMessage: '{viewer}, {maximum} languages are already being translated ({active}). Try one of those.',
  voiceNothingMessage: '{viewer}, the streamer has not said anything in the last {seconds} seconds.',
  voiceCaptionsOnMessage: 'On-screen {language} captions are on for {minutes} minutes.',
  voiceChatTemplate: '{viewers} ({language}): {translation}',
  voiceDemandTemplate: '{viewer} ({language}): {translation}',
  voicePushToTalkEnabled: false, voicePushToTalkLanguages: ['es'], voicePushToTalkPlatforms: ['twitch', 'youtube', 'kick', 'tiktok', 'facebook'], voicePushToTalkMaxSeconds: 120,
  voicePushToTalkTemplate: '🌐 ({language}) {translation}',
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
function render(template, values) { let result = cleanText(template, 1000); for (const [token, value] of Object.entries(values)) result = result.split(`{${token}}`).join(cleanText(typeof value === 'number' ? String(value) : value, 4000)); return cleanText(result, 4000); }
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
// Pending translations expire after two minutes, so cleanup runs every minute
// only while requests are pending; otherwise an hourly pass trims day-old
// cooldowns. State is written only when cleanup actually removed something.
const PENDING_CLEANUP_MS = 60_000;
const IDLE_CLEANUP_MS = 3_600_000;
let cleanupDelay = 0;
function scheduleCleanup(context, pending = true) { cancelCleanup(context); cleanupDelay = pending ? PENDING_CLEANUP_MS : IDLE_CLEANUP_MS; cleanupTimer = context.schedule.after(cleanupDelay, () => serialize(async () => { cleanupTimer = undefined; const remaining = await prune(context); if (!stopped) scheduleCleanup(context, remaining > 0); })); }
async function prune(context) { const raw = await context.state.read(); const state = sanitizeState(raw); const cutoff = Date.now() - 120_000; state.pending = state.pending.filter((item) => item.createdAt >= cutoff); state.userCooldowns = state.userCooldowns.filter((item) => item.at >= Date.now() - 86_400_000); if (JSON.stringify(state) !== JSON.stringify(raw)) await context.state.write(state); return state.pending.length; }

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
  pendingInputs.set(requestId, comparable(parsed.inputText)); if (pendingInputs.size > 50) pendingInputs.delete(pendingInputs.keys().next().value);
  if (!stopped && cleanupDelay !== PENDING_CLEANUP_MS) scheduleCleanup(context, true);
  try {
    await context.streamerbot.runApprovedAction(TRANSLATE_ACTION_ID, { requestId, text: parsed.inputText, provider: settings.provider, sourceLanguage: requestSourceLanguage, targetLanguage: parsed.targetLanguage, timeoutSeconds: settings.timeoutSeconds });
  } catch {
    const latest = sanitizeState(await context.state.read()); latest.pending = latest.pending.filter((item) => item.requestId !== requestId); await context.state.write(latest);
  }
}

async function receiveTranslation(event, context) {
  const requestId = cleanText(event.payload?.requestId, 100); if (!requestId) return;
  const voiceRequest = voice.requests.get(requestId);
  if (voiceRequest) { voice.requests.delete(requestId); return receiveVoiceTranslation(event, voiceRequest, context); }
  const state = sanitizeState(await context.state.read()); const pending = state.pending.find((item) => item.requestId === requestId);
  state.pending = state.pending.filter((item) => item.requestId !== requestId); await context.state.write(state);
  const input = pendingInputs.get(requestId); pendingInputs.delete(requestId);
  if (!pending || event.metadata?.simulated === true) return;
  const settings = settingsFor(context); const succeeded = event.payload?.succeeded === true;
  const translated = cleanText(event.payload?.translatedText, 4000);
  // The provider returns the text unchanged when it was already in the target language: say nothing.
  if (pending.mode === 'automatic' && succeeded && input !== undefined && comparable(translated) === input) return;
  const tokens = { author: pending.author, sourceLanguage: pending.sourceLanguage, targetLanguage: pending.targetLanguage, translation: translated };
  const message = pending.mode === 'automatic'
    ? (succeeded && translated ? render(settings.automaticResponseTemplate, tokens) : (settings.showAutomaticErrors ? cleanText(settings.automaticErrorMessage, 500) : ''))
    : (succeeded && translated ? render(settings.responseTemplate, tokens) : cleanText(settings.errorMessage, 500));
  if (message) await context.chat.send({ message, routing: 'source', sourcePlatform: pending.platform, overflow: 'split' });
}

const recentEvents = new Map(); let recentMessages = []; let recentTranslations = [];
// Message text stays in memory only, so a translation that comes back unchanged is not repeated in chat.
const pendingInputs = new Map();
export function resetTranslateRuntime() { recentEvents.clear(); recentMessages = []; recentTranslations = []; pendingInputs.clear(); }
function comparable(text) { return cleanText(text, 4000).toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ''); }

// Local, offline language check so ordinary English chat never reaches the translation provider.
// It only decides "clearly English" versus "worth translating"; the provider still detects the language.
const ENGLISH_WORDS = new Set("the and you your i im i'm is it it's its to of in on at that this what why how who are was were for with my me we be have has had not do does did dont don't so just can will would know think see like love good nice game play played playing get got go going now he she they them there here all out up about yes yeah yep nope hi hello hey thanks thank lol lmao gg wp omg wow bro dude man guys chat stream streamer one more again time today tonight bye cool awesome really very much if or but".split(' '));
const FOREIGN_WORDS = new Set(('que qué de del la el los las y por para con una uno esta está estas estás como cómo pero muy mas más bien hola gracias buenas buenos dias días noches amigo amiga yo eres soy estoy donde dónde cuando cuándo porque jaja jajaja jajajaja saludos vamos todo nada mucho bueno claro ' +
  'voce você nao não obrigado obrigada tudo bem muito oi isso eu ele ela tambem também kkkk kkk vc ' +
  "le les des est je il elle nous vous pas oui bonjour merci salut avec pour mais tres très c'est ça " +
  'der das und ist ich nicht ja danke hallo wie mit auf sehr gut ' +
  'che sono ciao grazie perche perché bene ' +
  'ang ng mga sa ako ikaw salamat po naman kumusta').split(' '));
export function looksLikeEnglish(text) {
  const stripped = cleanText(text, 1000).replace(/https?:\/\/\S+|www\.\S+|[@#]\S+/giu, ' ');
  const letters = stripped.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return true; // emotes, numbers and links only
  const latin = letters.filter((letter) => /\p{Script=Latin}/u.test(letter)).length;
  if (latin / letters.length < 0.7) return false; // mostly another script, such as Cyrillic, Arabic or CJK
  const words = (stripped.toLocaleLowerCase('en-US').match(/[\p{Script=Latin}']+/gu) ?? []).map((word) => word.replace(/^'+|'+$/gu, '')).filter(Boolean);
  const english = words.filter((word) => ENGLISH_WORDS.has(word)).length;
  const foreign = words.filter((word) => FOREIGN_WORDS.has(word)).length + (/[À-ÖØ-öø-ÿ¡¿]/u.test(stripped) ? 1 : 0);
  return foreign === 0 || english >= foreign;
}
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
  if (settings.detectLanguageLocally !== false && to === 'en' && from === 'auto' && looksLikeEnglish(message)) return { accepted: false, reason: 'looks-english' };
  const cutoff = now - 60_000; recentTranslations = recentTranslations.filter((at) => at >= cutoff);
  if (recentTranslations.length >= settings.maximumTranslationsPerMinute) return { accepted: false, reason: 'minute-limit' };
  if (recentMessages.length >= settings.percentageMinimumSample && ((recentTranslations.length + 1) * 100) / recentMessages.length > settings.maximumTranslatedPercentage) return { accepted: false, reason: 'percentage-limit' };
  return { accepted: true, mode: 'automatic', inputText: message, platform, sourceLanguage: from, targetLanguage: to, author: cleanText(event.user.displayName || event.user.name, 256) || 'Viewer' };
}

// ---------- Voice translation ----------
// The streamer's own speech (Streamer.bot dictation, forwarded by Live Captions) translated for viewers
// who ask. Spoken text stays in memory for at most two minutes and is never written to disk.
const SPEECH_EVENT = 'system.live-caption.spoken';
const SPEECH_MEMORY_MS = 120_000;
const PUSH_TO_TALK_EVENT = 'addon.thsv.user-translate.push-to-talk';
// Dictation lands a moment after you stop talking, so the button waits briefly before translating.
const PUSH_TO_TALK_GRACE_MS = 2_500;
const OUTBOUND_PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok', 'facebook']);
const voice = { recent: [], groups: new Map(), captions: new Map(), requests: new Map(), demandCooldowns: new Map(), chatTimer: undefined, captionTimer: undefined, pushToTalk: undefined, sequence: 0 };
function resetVoice(context) {
  for (const timer of [voice.chatTimer, voice.captionTimer, voice.pushToTalk?.timer]) if (timer !== undefined && context) context.schedule.cancel(timer);
  voice.recent = []; voice.groups.clear(); voice.captions.clear(); voice.requests.clear(); voice.demandCooldowns.clear(); voice.chatTimer = undefined; voice.captionTimer = undefined; voice.pushToTalk = undefined;
}
function boundedInteger(value, minimum, maximum, fallback) { const number = Number(value); return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback; }
function voiceCommand(value, fallback) { return cleanText(value, 40).replace(/^!+/u, '').toLocaleLowerCase('en-US') || fallback; }
function voiceSettings(settings) {
  const languages = [...new Set((Array.isArray(settings.voiceLanguages) ? settings.voiceLanguages : FALLBACKS.voiceLanguages).map(cleanLanguage).filter(Boolean))].slice(0, 30);
  return {
    subscriptions: settings.voiceSubscriptionsEnabled === true, onDemand: settings.voiceOnDemandEnabled === true, captions: settings.voiceCaptionsEnabled === true,
    subscribeCommand: voiceCommand(settings.voiceSubscribeCommand, FALLBACKS.voiceSubscribeCommand),
    onDemandCommand: voiceCommand(settings.voiceOnDemandCommand, FALLBACKS.voiceOnDemandCommand),
    captionsCommand: voiceCommand(settings.voiceCaptionsCommand, FALLBACKS.voiceCaptionsCommand),
    languages, sourceLanguage: sourceLanguage(settings.voiceSourceLanguage) || 'en',
    maximumLanguages: boundedInteger(settings.voiceMaximumLanguages, 1, 10, 3), batchSeconds: boundedInteger(settings.voiceBatchSeconds, 10, 120, 30),
    subscriptionMinutes: boundedInteger(settings.voiceSubscriptionMinutes, 1, 120, 15), onDemandSeconds: boundedInteger(settings.voiceOnDemandSeconds, 10, 120, 30),
    onDemandCooldownSeconds: boundedInteger(settings.voiceOnDemandCooldownSeconds, 5, 600, 30),
    captionMinutes: boundedInteger(settings.voiceCaptionMinutes, 1, 120, 10), captionBatchSeconds: boundedInteger(settings.voiceCaptionBatchSeconds, 3, 30, 6),
    pushToTalk: settings.voicePushToTalkEnabled === true,
    pushToTalkLanguages: [...new Set((Array.isArray(settings.voicePushToTalkLanguages) ? settings.voicePushToTalkLanguages : FALLBACKS.voicePushToTalkLanguages).map(cleanLanguage).filter(Boolean))].slice(0, 5),
    pushToTalkPlatforms: (Array.isArray(settings.voicePushToTalkPlatforms) ? settings.voicePushToTalkPlatforms : FALLBACKS.voicePushToTalkPlatforms).filter((platform, index, all) => OUTBOUND_PLATFORMS.includes(platform) && all.indexOf(platform) === index),
    pushToTalkMaxSeconds: boundedInteger(settings.voicePushToTalkMaxSeconds, 10, 300, 120),
  };
}
const englishNames = new Intl.DisplayNames(['en'], { type: 'language' });
export function languageName(code) { try { return cleanText(englishNames.of(code), 60).replace(/\s*\(.*\)$/u, '') || code; } catch { return code; } }
// Accepts a code (es), an English name (Spanish) or the language's own name (español), limited to the allowed list.
export function resolveVoiceLanguage(value, languages) {
  const wanted = cleanText(value, 40).toLocaleLowerCase('en-US'); if (!wanted) return '';
  for (const code of languages) {
    const names = [code, languageName(code)];
    try { names.push(new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? ''); } catch { /* unknown code */ }
    if (names.some((name) => cleanText(name, 60).replace(/\s*[(（].*$/u, '').toLocaleLowerCase('en-US') === wanted)) return code;
  }
  return '';
}
function activeLanguages(now) {
  const active = new Set();
  for (const group of voice.groups.values()) if ([...group.viewers.values()].some((viewer) => viewer.until > now)) active.add(group.language);
  for (const [language, caption] of voice.captions) if (caption.until > now) active.add(language);
  return active;
}
function pruneVoice(now) {
  voice.recent = voice.recent.filter((item) => item.at >= now - SPEECH_MEMORY_MS);
  for (const [key, group] of voice.groups) { for (const [id, viewer] of group.viewers) if (viewer.until <= now) group.viewers.delete(id); if (group.viewers.size === 0) voice.groups.delete(key); }
  for (const [language, caption] of voice.captions) if (caption.until <= now) voice.captions.delete(language);
  for (const [requestId, request] of voice.requests) if (request.createdAt < now - SPEECH_MEMORY_MS) voice.requests.delete(requestId);
}
async function say(context, platform, message) { if (message) await context.chat.send({ message, routing: 'source', sourcePlatform: platform, overflow: 'split' }).catch(() => undefined); }

export function parseVoiceCommand(event, settings) {
  const prefix = typeof settings.commandPrefix === 'string' && settings.commandPrefix.length === 1 ? settings.commandPrefix : '!';
  const message = typeof event?.payload?.message === 'string' ? event.payload.message.trim() : '';
  if (event?.eventType !== 'chat.message' || !message.startsWith(prefix)) return undefined;
  const [name = '', ...rest] = message.slice(1).trim().split(/\s+/u); const command = name.toLocaleLowerCase('en-US'); const argument = rest.join(' ');
  const options = voiceSettings(settings);
  if (options.subscriptions && command === options.subscribeCommand) return { kind: 'subscribe', argument };
  if (options.onDemand && command === options.onDemandCommand) return { kind: 'demand', argument };
  if (options.captions && command === options.captionsCommand) return { kind: 'captions', argument };
  return undefined;
}

async function dispatchVoice(context, settings, request, text) {
  const options = voiceSettings(settings);
  if (!context.approvedActionIds.includes(TRANSLATE_ACTION_ID) || voice.requests.size >= settings.maximumPendingRequests) return false;
  voice.sequence += 1; const requestId = `voice-${Date.now().toString(36)}-${voice.sequence}`;
  voice.requests.set(requestId, { ...request, createdAt: Date.now() });
  try {
    await context.streamerbot.runApprovedAction(TRANSLATE_ACTION_ID, { requestId, text: cleanText(text, settings.maximumInputCharacters), provider: settings.provider, sourceLanguage: options.sourceLanguage === 'auto' && settings.provider === 'mymemory' ? 'en' : options.sourceLanguage, targetLanguage: request.language, timeoutSeconds: settings.timeoutSeconds });
    return true;
  } catch { voice.requests.delete(requestId); return false; }
}

async function handleVoiceCommand(event, parsed, context, settings) {
  const options = voiceSettings(settings); const now = Date.now(); pruneVoice(now);
  const viewer = cleanText(event.user?.displayName || event.user?.name, 80) || 'Viewer'; const platform = event.platform;
  const values = (extra = {}) => ({ viewer, languages: options.languages.map((code) => `${languageName(code)} (${code})`).join(', '), ...extra });
  const off = /^(off|stop|end)$/iu.test(parsed.argument);
  if (parsed.kind === 'subscribe' && off) {
    for (const group of voice.groups.values()) if (group.platform === platform) group.viewers.delete(userKey(event));
    pruneVoice(now); return say(context, platform, render(settings.voiceStoppedMessage, values()));
  }
  if (parsed.kind === 'captions' && off) { voice.captions.clear(); return undefined; }
  const language = resolveVoiceLanguage(parsed.argument, options.languages);
  if (!language) return say(context, platform, render(settings.voiceLanguagesMessage, values()));
  const named = values({ language: languageName(language) });
  if (parsed.kind === 'demand') {
    const key = userKey(event); const last = voice.demandCooldowns.get(key) ?? 0;
    if (now - last < options.onDemandCooldownSeconds * 1000) return undefined;
    voice.demandCooldowns.set(key, now); if (voice.demandCooldowns.size > 500) voice.demandCooldowns.delete(voice.demandCooldowns.keys().next().value);
    const spoken = voice.recent.filter((item) => item.at >= now - options.onDemandSeconds * 1000).map((item) => item.text).join(' ');
    if (!spoken) return say(context, platform, render(settings.voiceNothingMessage, { ...named, seconds: options.onDemandSeconds }));
    await dispatchVoice(context, settings, { mode: 'demand', platform, audience: viewer, language }, spoken); return undefined;
  }
  const active = activeLanguages(now);
  if (!active.has(language) && active.size >= options.maximumLanguages) return say(context, platform, render(settings.voiceFullMessage, { ...named, maximum: options.maximumLanguages, active: [...active].map(languageName).join(', ') }));
  if (parsed.kind === 'captions') {
    const caption = voice.captions.get(language) ?? { buffer: [] }; caption.until = now + options.captionMinutes * 60_000; voice.captions.set(language, caption);
    armVoiceTimers(context, settings); return say(context, platform, render(settings.voiceCaptionsOnMessage, { ...named, minutes: options.captionMinutes }));
  }
  const key = `${platform}|${language}`; const group = voice.groups.get(key) ?? { platform, language, viewers: new Map(), buffer: [] };
  group.viewers.set(userKey(event), { name: viewer, until: now + options.subscriptionMinutes * 60_000 }); voice.groups.set(key, group);
  armVoiceTimers(context, settings);
  return say(context, platform, render(settings.voiceSubscribedMessage, { ...named, minutes: options.subscriptionMinutes, command: options.subscribeCommand }));
}

function receiveSpeech(event) {
  const text = cleanText(event.payload?.text, 500); if (!text) return;
  const now = Date.now(); voice.recent.push({ text, at: now }); pruneVoice(now);
  for (const group of voice.groups.values()) group.buffer.push(text);
  for (const caption of voice.captions.values()) caption.buffer.push(text);
  if (voice.pushToTalk) voice.pushToTalk.buffer.push(text);
}

// Stream Deck push to talk: start, talk, stop. One translation per language, posted to the chosen chats.
async function handlePushToTalk(event, context, settings) {
  const options = voiceSettings(settings); if (!options.pushToTalk || event.metadata?.simulated === true) return;
  const action = event.payload?.action; const listening = voice.pushToTalk?.listening === true;
  if (action === 'start' || (action === 'toggle' && !listening)) {
    if (listening) return;
    if (voice.pushToTalk?.timer !== undefined) context.schedule.cancel(voice.pushToTalk.timer);
    voice.pushToTalk = { listening: true, buffer: [], timer: context.schedule.after(options.pushToTalkMaxSeconds * 1000, () => serialize(() => stopPushToTalk(context))) };
    return;
  }
  if (action === 'stop' || action === 'toggle') return stopPushToTalk(context);
}

function stopPushToTalk(context) {
  const session = voice.pushToTalk; if (!session?.listening) return;
  if (session.timer !== undefined) context.schedule.cancel(session.timer);
  session.listening = false;
  session.timer = context.schedule.after(PUSH_TO_TALK_GRACE_MS, () => serialize(() => flushPushToTalk(context, session)));
}

async function flushPushToTalk(context, session) {
  if (voice.pushToTalk === session) voice.pushToTalk = undefined;
  const text = session.buffer.join(' '); if (stopped || !text) return;
  const settings = settingsFor(context); const options = voiceSettings(settings);
  for (const language of options.pushToTalkLanguages) await dispatchVoice(context, settings, { mode: 'broadcast', platform: '', audience: '', language }, text);
}

function armVoiceTimers(context, settings) {
  const options = voiceSettings(settings);
  if (voice.chatTimer === undefined && voice.groups.size > 0) voice.chatTimer = context.schedule.after(options.batchSeconds * 1000, () => serialize(() => flushVoice(context, 'chat')));
  if (voice.captionTimer === undefined && voice.captions.size > 0) voice.captionTimer = context.schedule.after(options.captionBatchSeconds * 1000, () => serialize(() => flushVoice(context, 'captions')));
}

// Speech is batched: one translation per language per window, never one per sentence.
async function flushVoice(context, which) {
  if (which === 'chat') voice.chatTimer = undefined; else voice.captionTimer = undefined;
  if (stopped) return;
  const settings = settingsFor(context); pruneVoice(Date.now());
  if (which === 'chat') {
    for (const group of voice.groups.values()) {
      const text = group.buffer.join(' '); group.buffer = []; if (!text) continue;
      await dispatchVoice(context, settings, { mode: 'chat', platform: group.platform, audience: [...group.viewers.values()].map((viewer) => `@${viewer.name}`).join(' '), language: group.language }, text);
    }
  } else {
    for (const [language, caption] of voice.captions) {
      const text = caption.buffer.join(' '); caption.buffer = []; if (!text) continue;
      await dispatchVoice(context, settings, { mode: 'caption', platform: '', audience: '', language }, text);
    }
  }
  armVoiceTimers(context, settings);
}

async function receiveVoiceTranslation(event, request, context) {
  const settings = settingsFor(context);
  const translated = cleanText(event.payload?.translatedText, 1000);
  if (event.payload?.succeeded !== true || !translated || event.metadata?.simulated === true) return;
  const values = { viewer: request.audience, viewers: request.audience, language: languageName(request.language), translation: translated };
  if (request.mode === 'caption') {
    await context.overlay.publish('thsv.user-translate.card.show', { title: languageName(request.language), text: translated, durationMs: (voiceSettings(settings).captionBatchSeconds + 4) * 1000, presentationMode: 'single', style: { backgroundMode: 'solid', backgroundColor: '#000000', backgroundOpacity: 0.82, accentColor: '#ffd166', textColor: '#ffffff', fontFamily: 'broadcast' } }, { lane: 'independent' }).catch(() => undefined);
    return;
  }
  if (request.mode === 'broadcast') {
    const message = render(settings.voicePushToTalkTemplate, values); const selectedPlatforms = voiceSettings(settings).pushToTalkPlatforms;
    if (message && selectedPlatforms.length > 0) await context.chat.send({ message, routing: 'selected', selectedPlatforms, overflow: 'split' }).catch(() => undefined);
    return;
  }
  await say(context, request.platform, render(request.mode === 'demand' ? settings.voiceDemandTemplate : settings.voiceChatTemplate, values));
}

async function handleEvent(event, context) {
  const settings = settingsFor(context); if (!settings.enabled) return;
  if (event.eventType === RESULT_EVENT) return receiveTranslation(event, context);
  if (event.eventType === 'stream.offline') { if (event.metadata?.simulated !== true) resetVoice(context); return; }
  if (event.eventType === PUSH_TO_TALK_EVENT) return handlePushToTalk(event, context, settings);
  if (event.eventType === SPEECH_EVENT) { const options = voiceSettings(settings); if (options.subscriptions || options.onDemand || options.captions || options.pushToTalk) receiveSpeech(event); return; }
  const platform = platformOf(event.platform); if (!platform || !settings.enabledPlatforms.includes(platform) || !event.user || event.user.actorType !== 'human') return;
  const voiceCommand = event.metadata?.simulated === true ? undefined : parseVoiceCommand(event, settings);
  if (voiceCommand) return handleVoiceCommand(event, voiceCommand, context, settings);
  if (['manual', 'both'].includes(settings.mode)) {
    const parsed = parseTranslationCommand(event, settings);
    if (parsed) return requestTranslation(event, { ...parsed, mode: 'manual' }, context, settings);
  }
  const automatic = shouldAutomaticallyTranslate(event, settings);
  if (automatic.accepted) { recentTranslations.push(Date.now()); await requestTranslation(event, automatic, context, settings); }
}

export default {
  manifest, required: false,
  async start(context) { stopped = false; operation = Promise.resolve(); resetTranslateRuntime(); resetVoice(); const pending = await prune(context); scheduleCleanup(context, pending > 0); },
  async stop(context) { stopped = true; cancelCleanup(context); resetVoice(context); cleanupDelay = 0; await operation; resetTranslateRuntime(); },
  async onEvent(event, context) { await serialize(() => handleEvent(event, context)); },
};
