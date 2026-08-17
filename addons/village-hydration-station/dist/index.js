// Village Hydration Station owns one live-only reminder clock, creator-authorized water
// logging, viewer reminder cooldowns, optional Speaker.bot confirmations, and a persistent
// core-hosted fill overlay. Viewer activity can never change the recorded ounce total.
const MODULE_ID = 'thsv.village-hydration-station';
const CONTROL_EVENT = 'addon.thsv.village-hydration-station.control';
const SPEAK_ACTION_ID = '26c6f03c-b616-4db5-8c56-e0abe2dc3b6c';
const LIVE_PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok']);
const NUMBER_WORDS = Object.freeze({ zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 });
const FALLBACKS = Object.freeze({
  enabled: true, automaticReminders: true, reminderIntervalMinutes: 45, snoozeMinutes: 10,
  resetMode: 'daily', goalOunces: 64, defaultServingOunces: 8, maximumEntryOunces: 64,
  viewerRemindersEnabled: true, twitchRewardId: '', kickRewardId: '', viewerCommand: 'hydrate',
  viewerCommandPlatforms: ['youtube', 'tiktok'], viewerGlobalCooldownMinutes: 10, viewerCooldownMinutes: 60,
  creatorCommandEnabled: true, creatorCommand: 'water', speakerEnabled: false, voiceAlias: '',
  automaticReminderMessage: 'Hydration check. Time for a sip of water.',
  viewerReminderMessage: '{viewer} is reminding you to drink some water.',
  loggedMessage: 'Logged {amount} ounces. You are at {total} of {goal} ounces.',
  goalMessage: 'Hydration goal reached! You logged {total} ounces.',
  showOverlay: true, containerStyle: 'bottle', showNumbers: true, showNextReminder: true,
  backgroundMode: 'glass', backgroundColor: '#0b1720', backgroundOpacity: 0.9,
  waterColor: '#55d6ff', waterHighlightColor: '#b8f3ff', accentColor: '#7ff5cc', textColor: '#ffffff', mutedColor: '#c9e7ef',
});

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Village Hydration Station', version: '4.0.1',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.1', maximumTestedBridgeVersion: '4.0.1',
  dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: [CONTROL_EVENT, 'reward.redemption', 'command.received', 'stream.online', 'stream.offline'],
  commandsProvided: [{ id: 'hydration-station.remind', name: 'hydrate' }, { id: 'hydration-station.creator', name: 'water' }],
  actionsProvided: [{ id: 'hydration-station.speak', name: 'THSV Addon - Village Hydration Station - Speak' }], browserSourcesProvided: [],
  dataStorageOwned: [`data/addons/${MODULE_ID}/`, `data/addons/.state/${MODULE_ID}/`],
  installationSteps: [
    'Install Village Hydration Station and choose a personal stream goal and reminder interval.',
    'Import its Streamer.bot package. Approve only Speak when Speaker.bot announcements are enabled.',
    'Attach Log Water to Stream Deck, a creator hotkey, or another creator-only Streamer.bot trigger. The broadcaster-only !water command provides the same controls from chat.',
    'Create Twitch and Kick Hydrate rewards and paste their stable IDs. YouTube and TikTok use the automatically registered !hydrate command.',
    `Add /overlay/addons/${MODULE_ID} as a compact 520 x 620 or full-canvas 1920 x 1080 browser source, then send the exact template preview from the wizard.`,
  ],
  uninstallationSteps: ['Uninstalling preserves bounded hydration totals and recent entries for recovery.'], migrations: [],
  healthChecks: [{ id: `${MODULE_ID}.runtime`, description: 'Confirms live-only scheduling, command or Stream Deck ounce logging, viewer cooldowns, optional Speaker.bot output, and fill-overlay projection.' }],
};

let stopped = true;
let operation = Promise.resolve();
let reminderTimer;
let noticeTimer;
let dailyResetTimer;
const livePlatforms = new Set();
const explicitlyOfflinePlatforms = new Set();
let lifecycleEpoch = 0;

function clean(value, maximum = 160) { return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '')].slice(0, maximum).join(''); }
function integer(value, minimum, maximum, fallback) { const parsed = typeof value === 'number' ? value : Number(value); return Number.isSafeInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback; }
function number(value, minimum, maximum, fallback) { const parsed = typeof value === 'number' ? value : Number(value); return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback; }
function color(value, fallback) { const candidate = clean(value, 16); return /^#[0-9a-fA-F]{6}$/u.test(candidate) ? candidate : fallback; }
function command(value, fallback) { const candidate = clean(value, 64).toLowerCase(); return /^[a-z0-9][a-z0-9-]{0,63}$/u.test(candidate) ? candidate : fallback; }
function format(template, values) { let result = clean(template, 400); for (const [key, value] of Object.entries(values)) result = result.replaceAll(`{${key}}`, clean(String(value), 100)); return clean(result, 400); }
function dayKey(now = new Date()) {
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function millisecondsUntilNextLocalDay(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 50);
  return Math.max(1_000, next.getTime() - now.getTime());
}
function settingsFor(context) {
  const raw = context.settings ?? {};
  const platforms = Array.isArray(raw.viewerCommandPlatforms) ? raw.viewerCommandPlatforms.filter((value) => ['youtube', 'tiktok'].includes(value)).slice(0, 2) : FALLBACKS.viewerCommandPlatforms;
  return {
    enabled: raw.enabled !== false, automaticReminders: raw.automaticReminders !== false,
    reminderIntervalMinutes: integer(raw.reminderIntervalMinutes, 5, 240, FALLBACKS.reminderIntervalMinutes), snoozeMinutes: integer(raw.snoozeMinutes, 1, 60, FALLBACKS.snoozeMinutes),
    resetMode: ['stream', 'daily', 'manual'].includes(raw.resetMode) ? raw.resetMode : FALLBACKS.resetMode,
    goalOunces: integer(raw.goalOunces, 8, 512, FALLBACKS.goalOunces), defaultServingOunces: integer(raw.defaultServingOunces, 1, 64, FALLBACKS.defaultServingOunces), maximumEntryOunces: integer(raw.maximumEntryOunces, 1, 128, FALLBACKS.maximumEntryOunces),
    viewerRemindersEnabled: raw.viewerRemindersEnabled !== false, twitchRewardId: clean(raw.twitchRewardId, 256), kickRewardId: clean(raw.kickRewardId, 256),
    viewerCommand: command(raw.viewerCommand, FALLBACKS.viewerCommand), viewerCommandPlatforms: platforms.length ? platforms : FALLBACKS.viewerCommandPlatforms,
    viewerGlobalCooldownMinutes: integer(raw.viewerGlobalCooldownMinutes, 1, 120, FALLBACKS.viewerGlobalCooldownMinutes), viewerCooldownMinutes: integer(raw.viewerCooldownMinutes, 1, 1_440, FALLBACKS.viewerCooldownMinutes),
    creatorCommandEnabled: raw.creatorCommandEnabled !== false, creatorCommand: command(raw.creatorCommand, FALLBACKS.creatorCommand),
    speakerEnabled: raw.speakerEnabled === true, voiceAlias: clean(raw.voiceAlias, 80),
    automaticReminderMessage: clean(raw.automaticReminderMessage, 300) || FALLBACKS.automaticReminderMessage,
    viewerReminderMessage: clean(raw.viewerReminderMessage, 300) || FALLBACKS.viewerReminderMessage,
    loggedMessage: clean(raw.loggedMessage, 300) || FALLBACKS.loggedMessage, goalMessage: clean(raw.goalMessage, 300) || FALLBACKS.goalMessage,
    showOverlay: raw.showOverlay !== false, containerStyle: ['bottle', 'glass', 'water-tower'].includes(raw.containerStyle) ? raw.containerStyle : FALLBACKS.containerStyle,
    showNumbers: raw.showNumbers !== false, showNextReminder: raw.showNextReminder !== false,
    backgroundMode: ['glass', 'solid', 'none'].includes(raw.backgroundMode) ? raw.backgroundMode : FALLBACKS.backgroundMode,
    backgroundColor: color(raw.backgroundColor, FALLBACKS.backgroundColor), backgroundOpacity: number(raw.backgroundOpacity, 0, 1, FALLBACKS.backgroundOpacity),
    waterColor: color(raw.waterColor, FALLBACKS.waterColor), waterHighlightColor: color(raw.waterHighlightColor, FALLBACKS.waterHighlightColor), accentColor: color(raw.accentColor, FALLBACKS.accentColor), textColor: color(raw.textColor, FALLBACKS.textColor), mutedColor: color(raw.mutedColor, FALLBACKS.mutedColor),
  };
}

function stateFor(raw, settings = FALLBACKS) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const entries = Array.isArray(value.entries) ? value.entries.map((entry) => ({ amount: integer(entry?.amount, 1, 128, 0), at: integer(entry?.at, 0, Number.MAX_SAFE_INTEGER, 0), source: clean(entry?.source, 30) })).filter((entry) => entry.amount > 0 && entry.at > 0).slice(-50) : [];
  const cooldownEntries = value.viewerCooldowns && typeof value.viewerCooldowns === 'object' ? Object.entries(value.viewerCooldowns).filter(([key, at]) => clean(key, 300) === key && Number.isSafeInteger(at)).slice(-500) : [];
  const noticeValue = value.notice && typeof value.notice === 'object' ? value.notice : {};
  return {
    totalOunces: integer(value.totalOunces, 0, 10_000, 0), entries, lastLoggedAt: integer(value.lastLoggedAt, 0, Number.MAX_SAFE_INTEGER, 0),
    lastReminderAt: integer(value.lastReminderAt, 0, Number.MAX_SAFE_INTEGER, 0), nextReminderAt: integer(value.nextReminderAt, 0, Number.MAX_SAFE_INTEGER, 0),
    remindersThisStream: integer(value.remindersThisStream, 0, 10_000, 0), sequence: integer(value.sequence, 0, Number.MAX_SAFE_INTEGER, 0),
    sessionKey: clean(value.sessionKey, 80), dateKey: clean(value.dateKey, 10) || dayKey(), lastViewerReminderAt: integer(value.lastViewerReminderAt, 0, Number.MAX_SAFE_INTEGER, 0),
    viewerCooldowns: Object.fromEntries(cooldownEntries), notice: { kind: ['automatic', 'viewer', 'logged', 'goal', 'snoozed', 'reset', 'undo', 'preview'].includes(noticeValue.kind) ? noticeValue.kind : '', text: clean(noticeValue.text, 300), actor: clean(noticeValue.actor, 100), platform: clean(noticeValue.platform, 20), expiresAt: integer(noticeValue.expiresAt, 0, Number.MAX_SAFE_INTEGER, 0) },
    goalOunces: integer(settings.goalOunces, 8, 512, FALLBACKS.goalOunces),
  };
}

function parseWordNumber(value) {
  const tokens = value.toLowerCase().replace(/-/gu, ' ').split(/\s+/u).filter(Boolean); let total = 0; let current = 0; let found = false;
  for (const token of tokens) {
    if (Object.hasOwn(NUMBER_WORDS, token)) { current += NUMBER_WORDS[token]; found = true; continue; }
    if (token === 'hundred' && current > 0) { current *= 100; found = true; continue; }
    if (found) break;
  }
  total += current; return found ? total : undefined;
}
function parseOunces(value, fallback = 8) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const text = clean(String(value ?? ''), 100).toLowerCase(); if (!text) return fallback;
  const numeric = text.match(/(?:^|\s)(\d{1,3})(?:\.\d+)?(?:\s|$|\s*(?:fl\s*)?oz|\s*ounces?)/u)?.[1];
  if (numeric) return Number.parseInt(numeric, 10);
  return parseWordNumber(text) ?? fallback;
}
function actorName(event) { return clean(event.user?.displayName || event.user?.name, 100) || 'A villager'; }
function actorKey(event) { const id = clean(event.user?.id, 240); return id ? `${event.platform}:${id}` : ''; }
function isBroadcaster(event) { return Array.isArray(event.user?.roles) && event.user.roles.some((role) => String(role).toLowerCase() === 'broadcaster'); }
function serialize(task) { operation = operation.then(task, task); return operation; }
function cancelTask(context, task) { if (task !== undefined) context.schedule.cancel(task); }

async function speak(context, settings, message) {
  if (!settings.speakerEnabled || !settings.voiceAlias || !message) return;
  try { await context.streamerbot.runApprovedAction(SPEAK_ACTION_ID, { hydrationSpeechMessage: clean(message, 400), hydrationVoiceAlias: settings.voiceAlias }); }
  catch { /* Visual reminders remain authoritative when Speaker.bot is unavailable. */ }
}
function styleFor(settings) { return { containerStyle: settings.containerStyle, backgroundMode: settings.backgroundMode, backgroundColor: settings.backgroundColor, backgroundOpacity: settings.backgroundOpacity, waterColor: settings.waterColor, waterHighlightColor: settings.waterHighlightColor, accentColor: settings.accentColor, textColor: settings.textColor, mutedColor: settings.mutedColor }; }
async function publish(context, settings, state) {
  if (!settings.showOverlay) { await context.overlay.publish(`${MODULE_ID}.hydration.hide`, { moduleId: MODULE_ID }).catch(() => undefined); return; }
  const now = Date.now(); const notice = state.notice.expiresAt > now ? state.notice : { kind: '', text: '', actor: '', platform: '', expiresAt: 0 };
  if (!notice.kind) return;
  await context.overlay.publish(`${MODULE_ID}.hydration.update`, { moduleId: MODULE_ID, cardKind: 'hydration-station', visible: true, durationMs: Math.max(1_000, notice.expiresAt - now), totalOunces: state.totalOunces, goalOunces: settings.goalOunces, percentage: Math.min(100, Math.round((state.totalOunces / settings.goalOunces) * 1000) / 10), defaultServingOunces: settings.defaultServingOunces, nextReminderAt: livePlatforms.size && settings.automaticReminders ? state.nextReminderAt : 0, reminderIntervalMinutes: settings.reminderIntervalMinutes, showNumbers: settings.showNumbers, showNextReminder: settings.showNextReminder, live: livePlatforms.size > 0, livePlatforms: [...livePlatforms], sequence: state.sequence, notice, style: styleFor(settings), emittedAt: new Date().toISOString() }, { lane: 'foreground' });
}
function armNoticeClear(context, expiresAt) {
  cancelTask(context, noticeTimer); noticeTimer = undefined; const delay = Math.max(0, expiresAt - Date.now());
  if (!stopped && delay > 0) noticeTimer = context.schedule.after(delay, () => serialize(async () => { noticeTimer = undefined; const state = stateFor(await context.state.read()); if (state.notice.expiresAt <= Date.now()) { state.notice = { kind: '', text: '', actor: '', platform: '', expiresAt: 0 }; await context.state.write(state); await context.overlay.publish(`${MODULE_ID}.hydration.hide`, { moduleId: MODULE_ID }).catch(() => undefined); } }));
}
function armReminder(context, settings, state) {
  cancelTask(context, reminderTimer); reminderTimer = undefined;
  if (stopped || !settings.enabled || !settings.automaticReminders || livePlatforms.size === 0 || state.nextReminderAt <= 0) return;
  const expectedEpoch = lifecycleEpoch;
  reminderTimer = context.schedule.after(Math.min(2_147_000_000, Math.max(1_000, state.nextReminderAt - Date.now())), () => serialize(() => fireAutomaticReminder(context, expectedEpoch)));
}
function armDailyReset(context) {
  cancelTask(context, dailyResetTimer); dailyResetTimer = undefined;
  if (stopped) return;
  dailyResetTimer = context.schedule.after(millisecondsUntilNextLocalDay(), () => serialize(async () => {
    dailyResetTimer = undefined;
    const settings = settingsFor(context); const state = stateFor(await context.state.read(), settings);
    if (applyDailyReset(state, settings)) { await context.state.write(state); await context.overlay.publish(`${MODULE_ID}.hydration.hide`, { moduleId: MODULE_ID }).catch(() => undefined); }
    armDailyReset(context);
  }));
}
async function fireAutomaticReminder(context, expectedEpoch) {
  reminderTimer = undefined; const settings = settingsFor(context); const state = stateFor(await context.state.read(), settings);
  if (expectedEpoch !== lifecycleEpoch || !settings.enabled || !settings.automaticReminders || livePlatforms.size === 0) return;
  applyDailyReset(state, settings);
  const now = Date.now(); const message = settings.automaticReminderMessage;
  state.lastReminderAt = now; state.remindersThisStream += 1; state.nextReminderAt = now + settings.reminderIntervalMinutes * 60_000; state.sequence += 1;
  state.notice = { kind: '', text: '', actor: '', platform: '', expiresAt: 0 };
  await context.state.write(state); armReminder(context, settings, state); await speak(context, settings, message);
}
function applyDailyReset(state, settings) {
  const today = dayKey(); if (settings.resetMode !== 'daily' || state.dateKey === today) return false;
  state.totalOunces = 0; state.entries = []; state.lastLoggedAt = 0; state.dateKey = today; state.sequence += 1; return true;
}
function setNextReminder(state, settings, delayMinutes = settings.reminderIntervalMinutes) { state.nextReminderAt = livePlatforms.size > 0 && settings.automaticReminders ? Date.now() + delayMinutes * 60_000 : 0; }
async function logWater(context, settings, state, rawAmount, source) {
  const amount = parseOunces(rawAmount, settings.defaultServingOunces);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > settings.maximumEntryOunces) return false;
  const now = Date.now(); const before = state.totalOunces; state.totalOunces = Math.min(10_000, state.totalOunces + amount); state.entries.push({ amount, at: now, source: clean(source, 30) }); state.entries = state.entries.slice(-50); state.lastLoggedAt = now; state.dateKey = dayKey(); state.sequence += 1; setNextReminder(state, settings);
  const goalReached = before < settings.goalOunces && state.totalOunces >= settings.goalOunces;
  const message = format(goalReached ? settings.goalMessage : settings.loggedMessage, { amount, total: state.totalOunces, goal: settings.goalOunces });
  state.notice = { kind: goalReached ? 'goal' : 'logged', text: message, actor: '', platform: '', expiresAt: now + (goalReached ? 14_000 : 8_000) };
  await context.state.write(state); armReminder(context, settings, state); await speak(context, settings, message); return true;
}
async function creatorControl(event, context, settings, state) {
  let action = ''; let amountText = ''; let source = 'creator-control'; let shouldReply = false;
  if (event.eventType === CONTROL_EVENT) { action = clean(event.payload?.action, 30).toLowerCase(); amountText = clean(event.payload?.amountText, 100); source = clean(event.payload?.source, 30) || source; }
  else if (event.eventType === 'command.received' && settings.creatorCommandEnabled && clean(event.payload?.command, 64).toLowerCase() === settings.creatorCommand && isBroadcaster(event)) { const args = Array.isArray(event.payload?.arguments) ? event.payload.arguments.map((item) => clean(String(item), 60)) : []; action = (args[0] || 'status').toLowerCase(); amountText = action === 'log' ? args.slice(1).join(' ') : args.join(' '); source = 'creator-command'; shouldReply = true; if (/^\d/u.test(action) || Object.hasOwn(NUMBER_WORDS, action)) { action = 'log'; amountText = args.join(' '); } }
  else return false;
  let reply = '';
  if (action === 'log') { const success = await logWater(context, settings, state, amountText, source); reply = success ? `${String(state.totalOunces)} of ${String(settings.goalOunces)} ounces logged.` : `Enter 1-${String(settings.maximumEntryOunces)} ounces.`; }
  else if (action === 'undo') { const entry = state.entries.pop(); if (entry) { state.totalOunces = Math.max(0, state.totalOunces - entry.amount); state.sequence += 1; setNextReminder(state, settings); state.notice = { kind: '', text: '', actor: '', platform: '', expiresAt: 0 }; await context.state.write(state); armReminder(context, settings, state); } reply = entry ? `${String(state.totalOunces)} ounces remain logged.` : 'There is no water entry to undo.'; }
  else if (action === 'reset') { state.totalOunces = 0; state.entries = []; state.lastLoggedAt = 0; state.sequence += 1; setNextReminder(state, settings); state.notice = { kind: '', text: '', actor: '', platform: '', expiresAt: 0 }; await context.state.write(state); armReminder(context, settings, state); reply = 'Hydration tracking reset.'; }
  else if (action === 'snooze') { state.sequence += 1; setNextReminder(state, settings, settings.snoozeMinutes); state.notice = { kind: '', text: '', actor: '', platform: '', expiresAt: 0 }; await context.state.write(state); armReminder(context, settings, state); reply = `Hydration reminder snoozed for ${String(settings.snoozeMinutes)} minutes.`; }
  else if (action === 'remind' || action === 'preview') { const message = action === 'preview' ? 'Preview: log water to watch the container fill.' : settings.automaticReminderMessage; state.sequence += 1; state.notice = action === 'preview' ? { kind: 'preview', text: message, actor: '', platform: '', expiresAt: Date.now() + 10_000 } : { kind: '', text: '', actor: '', platform: '', expiresAt: 0 }; await context.state.write(state); if (action === 'preview') { await publish(context, settings, state); armNoticeClear(context, state.notice.expiresAt); } else await speak(context, settings, message); reply = message; }
  else if (action === 'status') reply = `${String(state.totalOunces)} of ${String(settings.goalOunces)} ounces logged.`;
  else return false;
  if (shouldReply && reply) await context.chat.send({ message: reply, routing: 'source', sourcePlatform: event.platform, overflow: 'truncate' }).catch(() => undefined);
  return true;
}
function viewerRequest(event, settings) {
  if (!settings.viewerRemindersEnabled || event.metadata?.simulated === true) return false;
  if (event.eventType === 'reward.redemption' && event.payload?.verifiedTransport === true) { const id = clean(event.payload?.rewardId, 256); return (event.platform === 'twitch' && settings.twitchRewardId && id === settings.twitchRewardId) || (event.platform === 'kick' && settings.kickRewardId && id === settings.kickRewardId); }
  return event.eventType === 'command.received' && settings.viewerCommandPlatforms.includes(event.platform) && clean(event.payload?.command, 64).toLowerCase() === settings.viewerCommand;
}
async function processViewerReminder(event, context, settings, state) {
  if (!viewerRequest(event, settings)) return false;
  if (!livePlatforms.has(event.platform)) {
    // A verified native reward can arrive after StreamBridge is started or recovered while the
    // broadcast is already live. Twitch/Kick issued this exact configured redemption through
    // the authenticated intake, so it is safe to reconcile only that platform without emitting
    // a synthetic stream.online event (which would reset other stream-scoped add-ons).
    if (event.eventType !== 'reward.redemption' || event.payload?.verifiedTransport !== true || !LIVE_PLATFORMS.includes(event.platform)) return false;
    // A late redemption must never override an authoritative offline lifecycle signal.
    // Recovery is only for a bridge process that has not observed this platform's lifecycle yet.
    if (explicitlyOfflinePlatforms.has(event.platform)) return true;
    livePlatforms.add(event.platform);
    if (state.nextReminderAt <= 0) setNextReminder(state, settings);
    if (!state.sessionKey) state.sessionKey = `recovered:${clean(event.receivedAt || event.eventId, 80)}`;
    armReminder(context, settings, state);
  }
  const key = actorKey(event); if (!key) return true; const now = Date.now(); const globalMs = settings.viewerGlobalCooldownMinutes * 60_000; const viewerMs = settings.viewerCooldownMinutes * 60_000;
  if (now - state.lastViewerReminderAt < globalMs || now - (state.viewerCooldowns[key] || 0) < viewerMs) return true;
  state.lastViewerReminderAt = now; state.viewerCooldowns[key] = now; state.viewerCooldowns = Object.fromEntries(Object.entries(state.viewerCooldowns).sort((left, right) => left[1] - right[1]).slice(-500)); state.remindersThisStream += 1; state.sequence += 1;
  const actor = actorName(event); const message = format(settings.viewerReminderMessage, { viewer: actor }); state.notice = { kind: 'viewer', text: message, actor, platform: event.platform, expiresAt: now + 12_000 };
  await context.state.write(state); await publish(context, settings, state); armNoticeClear(context, state.notice.expiresAt); await speak(context, settings, message); return true;
}
async function process(event, context) {
  const settings = settingsFor(context); if (!settings.enabled) return; const state = stateFor(await context.state.read(), settings);
  if (applyDailyReset(state, settings)) await context.state.write(state);
  if ((event.eventType === 'stream.online' || event.eventType === 'stream.offline') && event.metadata?.simulated !== true && LIVE_PLATFORMS.includes(event.platform)) {
    lifecycleEpoch += 1;
    const wasOffline = livePlatforms.size === 0;
    if (event.eventType === 'stream.online') { explicitlyOfflinePlatforms.delete(event.platform); livePlatforms.add(event.platform); }
    else { explicitlyOfflinePlatforms.add(event.platform); livePlatforms.delete(event.platform); }
    if (event.eventType === 'stream.online' && wasOffline) { if (settings.resetMode === 'stream') { state.totalOunces = 0; state.entries = []; state.lastLoggedAt = 0; state.remindersThisStream = 0; state.sessionKey = clean(event.receivedAt, 80); state.sequence += 1; } setNextReminder(state, settings); }
    if (livePlatforms.size === 0) {
      state.nextReminderAt = 0; state.notice = { kind: '', text: '', actor: '', platform: '', expiresAt: 0 };
      cancelTask(context, reminderTimer); cancelTask(context, noticeTimer); reminderTimer = undefined; noticeTimer = undefined;
    }
    await context.state.write(state); if (livePlatforms.size === 0) await context.overlay.publish(`${MODULE_ID}.hydration.hide`, { moduleId: MODULE_ID }).catch(() => undefined); armReminder(context, settings, state); return;
  }
  if (await creatorControl(event, context, settings, state)) return;
  await processViewerReminder(event, context, settings, state);
}

export default {
  manifest, required: false,
  async start(context) { stopped = false; operation = Promise.resolve(); lifecycleEpoch += 1; livePlatforms.clear(); explicitlyOfflinePlatforms.clear(); cancelTask(context, reminderTimer); cancelTask(context, noticeTimer); cancelTask(context, dailyResetTimer); reminderTimer = undefined; noticeTimer = undefined; dailyResetTimer = undefined; const settings = settingsFor(context); const state = stateFor(await context.state.read(), settings); applyDailyReset(state, settings); state.nextReminderAt = 0; state.notice = { kind: '', text: '', actor: '', platform: '', expiresAt: 0 }; await context.state.write(state); await context.overlay.publish(`${MODULE_ID}.hydration.hide`, { moduleId: MODULE_ID }).catch(() => undefined); armDailyReset(context); },
  async stop(context) { stopped = true; lifecycleEpoch += 1; cancelTask(context, reminderTimer); cancelTask(context, noticeTimer); cancelTask(context, dailyResetTimer); reminderTimer = undefined; noticeTimer = undefined; dailyResetTimer = undefined; livePlatforms.clear(); explicitlyOfflinePlatforms.clear(); await operation.catch(() => undefined); operation = Promise.resolve(); },
  async onEvent(event, context) { if (!stopped) await serialize(() => process(event, context)); },
};

export { CONTROL_EVENT, FALLBACKS, dayKey, manifest, millisecondsUntilNextLocalDay, parseOunces, settingsFor, stateFor };
