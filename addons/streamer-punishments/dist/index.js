// Streamer Punishments lets viewers spend points or channel points on short OBS screen effects
// (a filter switched on for a few seconds) or on exercises the creator does on camera.
// Effects run one at a time. Exercises wait in an owed list: each gets a visible grace countdown,
// then StreamBridge switches to a safe scene until the creator or a moderator marks it done.
// Bean Boozled: bits and tips spin a wheel of bean colors, then reveal a nice or nasty flavor
// (like the real game), and the bean goes on the same owed list.
const MODULE_ID = 'thsv.streamer-punishments';
const SET_FILTER_ACTION_ID = 'f79b23e2-5999-4a47-9bc8-4189782e3b51';
const SWITCH_SCENE_ACTION_ID = 'b0a42731-835f-419c-ac83-43ea639a0359';
const LIVE_PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok', 'facebook']);
const BUY_PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok', 'facebook']);
// Scenes where an exercise never starts: the creator is not playing, so it waits for the next real scene.
const HOLD_ROLES = Object.freeze(['starting', 'break', 'ending']);
// A stream that comes back within this window (an internet drop, an OBS restart) is the same stream.
const SAME_STREAM_MS = 30 * 60_000;
const FALLBACKS = Object.freeze({
  enabled: false,
  effects: ['Blackout | | THSV Blackout | 15 | 100 |', 'Pixelate | | THSV Pixelate | 15 | 100 |', 'Barrel roll | | THSV Barrel Roll | 15 | 150 |'],
  exercises: ['Pushups | 10 | 250 |', 'Situps | 15 | 200 |', 'Squats | 15 | 200 |'],
  buyCommand: 'buy', buyPlatforms: ['youtube', 'tiktok', 'facebook'], doneCommand: 'done', statusCommand: 'punishments', controlCommand: 'punish',
  graceSeconds: 30, safeSceneName: 'role:chatting', returnToPreviousScene: true, connectionIndex: 0,
  maximumPerStream: 5, exerciseLimitPerStream: 5, exerciseCooldownMinutes: 10, effectCooldownSeconds: 30, effectGapSeconds: 1, maximumEffectQueue: 5, onlyWhileLive: true, showOverlay: true,
  chatReplies: true,
  effectMessage: '{viewer} hit the stream with {name} for {seconds}s!',
  exerciseMessage: '{viewer} bought {reps} {name}! Starting in {seconds}s.',
  startMessage: 'Time for {reps} {name} from {viewer}! A mod types !{done} when they are done.',
  doneMessage: '{reps} {name} done! {name} this month: {month}.',
  limitMessage: '{viewer}, {name} is maxed out for this stream ({limit}). Try another punishment.',
  exercisesLeftMessage: '{remaining} of {limit} exercises left this stream.',
  exercisesUsedUpMessage: 'No exercises left this stream ({used} of {limit} used).',
  cooldownMessage: '{viewer}, {name} is cooling down. Try again in {minutes} min.',
  pointsMessage: '{viewer}, {name} costs {cost} {currency}. You have {balance}.',
  listMessage: 'Punishments: {list}. Use !{buy} <name>.',
  beanEnabled: false,
  // BeanBoozled 7th edition: Color | wheel color | nice flavor | nasty flavor.
  beanPairs: [
    'Black | #1c1c1c | Licorice | Burnt Rubber', 'Yellow spotted | #e8c33a | Top Banana | Wet Dog',
    'Purple speckled | #9b4dca | Tutti-Frutti | Stinky Socks', 'Light blue | #7cc6f2 | Berry Blue | Toothpaste',
    'Orange speckled | #f28c28 | Peach | Barf', 'Tan | #d9b98c | Toasted Marshmallow | Stink Bug',
    'Green | #9cc84b | Juicy Pear | Booger', 'Red | #c0263a | Pomegranate | Old Bandage',
    'Brown | #8b5a3c | Cappuccino | Liver and Onions', 'Pink | #f4a6c0 | Strawberry Banana Smoothie | Dead Fish',
  ],
  countdownSize: 'small', countdownPosition: 'top-right',
  trackerEnabled: true, trackerOnlyWhileOwed: true, trackerPosition: 'bottom-left',
  beanBitsPerSpin: 500, beanCoinsPerSpin: 500, beanTipPerSpin: 5, beanTipCurrency: 'USD', beanMaximumSpins: 3, beanSpinSeconds: 8,
  beanSpinMessage: '{viewer} spun the Bean Boozled wheel and landed on {color}... it is {result}: {flavor}!',
  beanDoneMessage: '{flavor} bean eaten! Beans this month: {month}.',
  allowedScenes: [], wrongSceneMessage: '{viewer}, punishments only work during {scenes}.',
});
const BEAN_KEY = 'beans';
const TRACKER_POSITIONS = Object.freeze(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
const COUNTDOWN_SIZES = Object.freeze(['small', 'medium', 'large']);
const COUNTDOWN_POSITIONS = Object.freeze(['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right']);
const BEAN_REVEAL_MS = 6000;
const BEAN_COLOR_MS = 2500;

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Streamer Punishments', version: '4.0.64',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.64', maximumTestedBridgeVersion: '4.0.64',
  dependencies: ['thsv.viewer-foundation'], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: ['command.received', 'reward.redemption', 'stream.online', 'stream.offline', 'stream.scene-changed', 'system.scene-catalog', 'engagement.cheer', 'engagement.donation', 'engagement.gift'],
  commandsProvided: [
    { id: 'punishments.buy', name: 'buy' }, { id: 'punishments.done', name: 'done' },
    { id: 'punishments.status', name: 'punishments' }, { id: 'punishments.control', name: 'punish' },
  ],
  actionsProvided: [{ id: 'punishments.set-filter', name: 'THSV Extension - Streamer Punishments - Set Filter' }, { id: 'punishments.switch-scene', name: 'THSV Extension - Streamer Punishments - Switch Scene' }],
  browserSourcesProvided: [],
  dataStorageOwned: [`data/addons/${MODULE_ID}/`, `data/addons/.state/${MODULE_ID}/`],
  installationSteps: [
    'In OBS, add one filter per screen effect to the source it should change and turn it off: for example a Color Correction filter named "THSV Blackout" with brightness turned down. Pixelate and barrel roll need the free Composite Blur and Move plugins.',
    'Import the Streamer Punishments Streamer.bot package, approve Set Filter and Switch Scene in the wizard, and leave both triggerless.',
    'Fill in each effect\'s OBS source and filter name, check the exercises, reps and prices, and pick the safe scene for exercises.',
    'For Twitch and Kick, create channel point rewards with the same prices and paste each reward ID into its row.',
    'Enable the extension and restart StreamBridge.',
  ],
  uninstallationSteps: ['Disable the extension. Any effect that is on turns off, and owed exercises stay saved until it is enabled again.'], migrations: [],
  healthChecks: [{ id: `${MODULE_ID}.runtime`, description: 'Confirms bounded punishment parsing, refunded point spending, one effect at a time, and one exercise at a time with a grace countdown.' }],
};

let stopped = true;
let operation = Promise.resolve();
let effectTimer;
let exerciseTimer;
let epoch = 0;
let effectActive;
let effectBusyUntil = 0;
const effectQueue = [];
const livePlatforms = new Set();
let currentScene = '';
let beanTimer;
const beanQueue = [];
// TikTok coins a viewer has sent toward their next spin this stream, so small gifts add up.
const giftCoins = new Map();

function clean(value, maximum = 160) { return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '')].slice(0, maximum).join(''); }
function integer(value, minimum, maximum, fallback) { const parsed = typeof value === 'number' ? value : Number(value); return Number.isSafeInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback; }
function command(value) { const match = clean(value, 65).toLowerCase().match(/^!?([a-z0-9][a-z0-9-]{0,63})$/u); return match ? match[1] : ''; }
function key(value) { return clean(value, 80).toLowerCase().replace(/[^a-z0-9]+/gu, ''); }
function format(template, values) { let result = clean(template, 300); for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, [...String(value).replace(/[\u0000-\u001f\u007f]/gu, ' ')].slice(0, 200).join('')); return clean(result, 450); }
// Twitch and Kick reward IDs have their own boxes; a comma-separated pair in one box still works.
function rewardIds(...values) { return [...new Set(values.flatMap((value) => clean(value, 300).split(',')).map((id) => clean(id, 256)).filter(Boolean))].slice(0, 4); }
function color(value, fallback) { const text = clean(value, 7); return /^#[0-9a-f]{6}$/iu.test(text) ? text.toLowerCase() : fallback; }
// Money amounts arrive as decimal strings (for example "5.00").
function amountOf(value) { const text = typeof value === 'number' ? String(value) : clean(value, 20); return /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/u.test(text) ? Number(text) : 0; }
function monthOf(time) { const date = new Date(time); return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}`; }

// One effect per line: Name | OBS source | OBS filter | seconds | points | reward IDs (Twitch, Kick).
function parseEffect(line) {
  const parts = clean(line, 500).split('|').map((part) => clean(part, 256));
  const name = clean(parts[0], 40); const filterName = clean(parts[2], 256);
  if (!name || !key(name)) return undefined;
  return { kind: 'effect', name, sourceName: clean(parts[1], 256), filterName, seconds: integer(Number.parseInt(parts[3], 10), 3, 120, 15), cost: integer(Number.parseInt(parts[4], 10), 0, 1_000_000, 0), rewardIds: rewardIds(parts[5], parts[6]) };
}
// One exercise per line: Name | reps per purchase | points | reward IDs (Twitch, Kick).
function parseExercise(line) {
  const parts = clean(line, 500).split('|').map((part) => clean(part, 256));
  const name = clean(parts[0], 40);
  if (!name || !key(name)) return undefined;
  return { kind: 'exercise', name, reps: integer(Number.parseInt(parts[1], 10), 1, 500, 10), cost: integer(Number.parseInt(parts[2], 10), 0, 1_000_000, 0), rewardIds: rewardIds(parts[3], parts[4]) };
}
// One bean per line: Color | wheel color (#hex) | nice flavor | nasty flavor.
function parseBean(line) {
  const parts = clean(line, 300).split('|').map((part) => clean(part, 60));
  const colorName = clean(parts[0], 24); const nice = clean(parts[2], 40); const nasty = clean(parts[3], 40);
  if (!colorName || !nice || !nasty) return undefined;
  return { colorName, wheelColor: color(parts[1], '#7c3aed'), nice, nasty };
}
function settingsFor(context) {
  const raw = context.settings ?? {};
  const seen = new Set(); const items = [];
  const add = (item) => { if (item && !seen.has(key(item.name))) { seen.add(key(item.name)); items.push(item); } };
  for (const line of (Array.isArray(raw.effects) ? raw.effects : FALLBACKS.effects).slice(0, 15)) add(parseEffect(line));
  for (const line of (Array.isArray(raw.exercises) ? raw.exercises : FALLBACKS.exercises).slice(0, 15)) add(parseExercise(line));
  const text = (name) => clean(raw[name], 300) || FALLBACKS[name];
  const allowedScenes = (Array.isArray(raw.allowedScenes) ? raw.allowedScenes : FALLBACKS.allowedScenes).map((value) => clean(value, 256)).filter(Boolean).slice(0, 20);
  return {
    allowedScenes, wrongSceneMessage: text('wrongSceneMessage'),
    enabled: raw.enabled === true, items,
    buyCommand: command(raw.buyCommand ?? FALLBACKS.buyCommand), doneCommand: command(raw.doneCommand ?? FALLBACKS.doneCommand),
    statusCommand: command(raw.statusCommand ?? FALLBACKS.statusCommand), controlCommand: command(raw.controlCommand ?? FALLBACKS.controlCommand),
    buyPlatforms: new Set(Array.isArray(raw.buyPlatforms) ? raw.buyPlatforms.filter((value) => BUY_PLATFORMS.includes(value)) : FALLBACKS.buyPlatforms),
    graceSeconds: integer(raw.graceSeconds, 0, 300, FALLBACKS.graceSeconds), safeSceneName: clean(raw.safeSceneName ?? FALLBACKS.safeSceneName, 256),
    returnToPreviousScene: raw.returnToPreviousScene !== false, connectionIndex: integer(raw.connectionIndex, 0, 23, 0),
    maximumPerStream: integer(raw.maximumPerStream, 0, 100, FALLBACKS.maximumPerStream), exerciseLimitPerStream: integer(raw.exerciseLimitPerStream, 0, 100, FALLBACKS.exerciseLimitPerStream),
    exerciseCooldownMinutes: integer(raw.exerciseCooldownMinutes, 0, 240, FALLBACKS.exerciseCooldownMinutes),
    effectCooldownSeconds: integer(raw.effectCooldownSeconds, 0, 3600, FALLBACKS.effectCooldownSeconds),
    effectGapSeconds: integer(raw.effectGapSeconds, 0, 30, FALLBACKS.effectGapSeconds), maximumEffectQueue: integer(raw.maximumEffectQueue, 0, 20, FALLBACKS.maximumEffectQueue),
    onlyWhileLive: raw.onlyWhileLive !== false, showOverlay: raw.showOverlay !== false,
    countdownSize: COUNTDOWN_SIZES.includes(raw.countdownSize) ? raw.countdownSize : FALLBACKS.countdownSize,
    countdownPosition: COUNTDOWN_POSITIONS.includes(raw.countdownPosition) ? raw.countdownPosition : FALLBACKS.countdownPosition,
    trackerEnabled: raw.trackerEnabled !== false, trackerOnlyWhileOwed: raw.trackerOnlyWhileOwed !== false, trackerPosition: TRACKER_POSITIONS.includes(raw.trackerPosition) ? raw.trackerPosition : FALLBACKS.trackerPosition, chatReplies: raw.chatReplies !== false,
    effectMessage: text('effectMessage'), exerciseMessage: text('exerciseMessage'), startMessage: text('startMessage'), doneMessage: text('doneMessage'),
    limitMessage: text('limitMessage'), exercisesLeftMessage: text('exercisesLeftMessage'), exercisesUsedUpMessage: text('exercisesUsedUpMessage'), cooldownMessage: text('cooldownMessage'), pointsMessage: text('pointsMessage'), listMessage: text('listMessage'),
    // The overlay wheel shows at most 10 slices.
    beanEnabled: raw.beanEnabled === true, beans: (Array.isArray(raw.beanPairs) ? raw.beanPairs : FALLBACKS.beanPairs).slice(0, 10).map(parseBean).filter(Boolean),
    beanBitsPerSpin: integer(raw.beanBitsPerSpin, 0, 1_000_000, FALLBACKS.beanBitsPerSpin), beanCoinsPerSpin: integer(raw.beanCoinsPerSpin, 0, 1_000_000, FALLBACKS.beanCoinsPerSpin), beanTipPerSpin: integer(raw.beanTipPerSpin, 0, 100_000, FALLBACKS.beanTipPerSpin),
    beanTipCurrency: /^[A-Z]{3}$/u.test(clean(raw.beanTipCurrency, 3).toUpperCase()) ? clean(raw.beanTipCurrency, 3).toUpperCase() : FALLBACKS.beanTipCurrency,
    beanMaximumSpins: integer(raw.beanMaximumSpins, 1, 10, FALLBACKS.beanMaximumSpins), beanSpinSeconds: integer(raw.beanSpinSeconds, 3, 20, FALLBACKS.beanSpinSeconds),
    beanSpinMessage: text('beanSpinMessage'), beanDoneMessage: text('beanDoneMessage'),
  };
}

// Saved between restarts: owed exercises, the one in progress, and this stream's and month's totals.
function stateFor(value) {
  const source = value && typeof value === 'object' ? value : {};
  const counts = (input, maximum = 10_000_000) => Object.fromEntries(Object.entries(input && typeof input === 'object' ? input : {}).filter(([name]) => key(name)).slice(0, 30).map(([name, count]) => [key(name), integer(count, 0, maximum, 0)]));
  const entry = (input) => (input && typeof input === 'object' && key(input.name) ? { id: clean(input.id, 200), name: clean(input.name, 40), reps: integer(input.reps, 1, 500, 1), viewer: clean(input.viewer, 60) || 'Someone', platform: LIVE_PLATFORMS.includes(input.platform) ? input.platform : '', ...(input.kind === 'bean' ? { kind: 'bean', flavor: clean(input.flavor, 40), nasty: input.nasty === true } : {}) } : undefined);
  const active = entry(source.active);
  return {
    month: /^\d{4}-\d{2}$/u.test(source.month) ? source.month : '', monthReps: counts(source.monthReps), streamReps: counts(source.streamReps), streamBought: counts(source.streamBought),
    // Exercises accepted this stream from every platform, for the shared limit.
    streamExercises: integer(source.streamExercises, 0, 10_000, 0),
    lastBoughtAt: counts(source.lastBoughtAt, Number.MAX_SAFE_INTEGER), lastOfflineAt: integer(source.lastOfflineAt, 0, Number.MAX_SAFE_INTEGER, 0),
    history: (Array.isArray(source.history) ? source.history : []).filter((month) => month && /^\d{4}-\d{2}$/u.test(month.month)).slice(-12).map((month) => ({ month: month.month, reps: counts(month.reps) })),
    owed: (Array.isArray(source.owed) ? source.owed : []).map(entry).filter(Boolean).slice(0, 100),
    active: active ? { ...active, phase: source.active.phase === 'doing' ? 'doing' : 'grace', startsAt: integer(source.active.startsAt, 0, Number.MAX_SAFE_INTEGER, 0), returnScene: clean(source.active.returnScene, 256), switched: source.active.switched === true } : undefined,
  };
}

function viewerName(event) { return clean(event.user?.displayName || event.user?.name, 60) || 'Someone'; }
function isModerator(event) { return Array.isArray(event.user?.roles) && event.user.roles.some((role) => ['broadcaster', 'moderator', 'mod'].includes(String(role).toLowerCase())); }
// StreamBridge only stores plain JSON: a field set to undefined (no exercise in progress) is rejected,
// so it is dropped before saving.
// Every save also refreshes the tracker panel, so it never shows stale totals.
async function saveState(context, state) { await context.state.write(JSON.parse(JSON.stringify(state))); await publishTracker(context, settingsFor(context), state); }
// The tracker panel: what is owed right now and this month's totals per exercise (and beans).
function trackerPayload(settings, state) {
  const pending = [...(state.active ? [state.active] : []), ...state.owed];
  const owed = new Map();
  for (const entry of pending) { const id = entry.kind === 'bean' ? BEAN_KEY : key(entry.name); owed.set(id, (owed.get(id) ?? 0) + (entry.kind === 'bean' ? 1 : entry.reps)); }
  const rows = settings.items.filter((item) => item.kind === 'exercise').map((item) => ({ name: item.name, owed: owed.get(key(item.name)) ?? 0, month: state.monthReps[key(item.name)] ?? 0 }));
  if (settings.beanEnabled) rows.push({ name: 'Beans', owed: owed.get(BEAN_KEY) ?? 0, month: state.monthReps[BEAN_KEY] ?? 0 });
  const active = state.active ? (state.active.kind === 'bean' ? `${state.active.flavor} bean` : `${String(state.active.reps)} ${state.active.name}`) : '';
  const monthName = /^\d{4}-\d{2}$/u.test(state.month) ? new Date(`${state.month}-15T12:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }) : '';
  // By default the panel shows only while an exercise or bean is owed or in progress.
  const visible = settings.trackerEnabled && rows.length > 0 && (!settings.trackerOnlyWhileOwed || pending.length > 0);
  return { visible, title: 'PUNISHMENTS', monthLabel: monthName ? monthName.toUpperCase() : 'THIS MONTH', rows: rows.slice(0, 12), now: active ? `NOW: ${upper(active)}` : '', position: settings.trackerPosition };
}
async function publishTracker(context, settings, state) {
  // Always published, so turning the panel or the overlay off hides it right away.
  const payload = trackerPayload(settings, state);
  await context.overlay.publish(`${MODULE_ID}.tracker.update`, { moduleId: MODULE_ID, ...payload, visible: settings.showOverlay && payload.visible, emittedAt: new Date().toISOString() }, { lane: 'persistent' }).catch(() => undefined);
}
function serialize(task) { operation = operation.then(task, task); return operation; }
function argumentsOf(event) { return key(Array.isArray(event.payload?.arguments) ? event.payload.arguments.join(' ') : event.payload?.arguments); }
async function say(context, settings, platform, template, values) {
  if (!settings.chatReplies || !LIVE_PLATFORMS.includes(platform)) return;
  await context.chat.send({ message: format(template, values), routing: 'source', sourcePlatform: platform, overflow: 'split' }).catch(() => undefined);
}
async function announce(context, settings, template, values) {
  if (!settings.chatReplies || livePlatforms.size === 0) return;
  await context.chat.send({ message: format(template, values), routing: 'selected', selectedPlatforms: [...livePlatforms], overflow: 'split' }).catch(() => undefined);
}
// "Only on these scenes": empty means every scene. role:live style names follow Scene roles. Until the first
// scene change is seen (for example right after a restart) nothing is blocked, so a feature never goes silent.
function allowedSceneNames(context, settings) {
  return settings.allowedScenes.map((value) => { const text = clean(value, 256); try { return /^role:/iu.test(text) ? clean(context?.scenes?.resolve?.(text) ?? '', 256) : text; } catch { return ''; } }).filter(Boolean);
}
function onAllowedScene(context, settings, sceneName) {
  if (settings.allowedScenes.length === 0 || !sceneName) return true;
  const allowed = allowedSceneNames(context, settings);
  return allowed.length === 0 || allowed.some((name) => name.toLowerCase() === sceneName.toLowerCase());
}
function allowedScenesText(context, settings) { return allowedSceneNames(context, settings).join(' or ') || 'other scenes'; }
function resolveScene(context, value) {
  const text = clean(value, 256);
  try { return typeof context?.scenes?.resolve === 'function' ? context.scenes.resolve(text) : text; } catch { return ''; }
}
function onHoldScene(context) {
  if (!currentScene) return false;
  try { return HOLD_ROLES.includes(context.scenes?.roleOf?.(currentScene)); } catch { return false; }
}
async function switchScene(context, settings, sceneName) {
  if (!sceneName) return false;
  try { await context.streamerbot.runApprovedAction(SWITCH_SCENE_ACTION_ID, { punishmentSceneName: sceneName, punishmentConnectionIndex: String(settings.connectionIndex) }); return true; } catch { return false; }
}
async function setFilter(context, settings, effect, enabled) {
  await context.streamerbot.runApprovedAction(SET_FILTER_ACTION_ID, { punishmentSourceName: effect.sourceName, punishmentFilterName: effect.filterName, punishmentFilterEnabled: enabled ? 'true' : 'false', punishmentConnectionIndex: String(settings.connectionIndex) });
}
async function overlay(context, settings, topic, payload) {
  if (!settings.showOverlay && topic.endsWith('.update')) return;
  await context.overlay.publish(`${MODULE_ID}.${topic}`, { moduleId: MODULE_ID, ...payload, emittedAt: new Date().toISOString() }, { lane: 'timer' }).catch(() => undefined);
}

// ---------- Paying ----------
async function charge(context, event, item, eventId) {
  if (item.cost === 0) return { ok: true };
  const projection = await context.viewerFoundation.getProjection({ platform: event.platform, userId: clean(event.user?.id, 240) }).catch(() => undefined);
  if (!projection) return { ok: false, balance: 0, currency: 'points' };
  const currency = clean(projection.currencyName, 40) || 'points';
  if (projection.points < item.cost) return { ok: false, balance: projection.points, currency };
  try { await context.viewerFoundation.mutate({ viewerId: projection.viewerId, operation: 'spend', amount: item.cost, reason: `Streamer Punishments: ${item.name}`, idempotencyKey: `punish:${eventId}` }); }
  catch { return { ok: false, balance: projection.points, currency }; }
  return { ok: true, refund: { viewerId: projection.viewerId, amount: item.cost, key: `punish:${eventId}:refund`, name: item.name } };
}
async function refund(context, refundInfo) {
  if (!refundInfo) return;
  await context.viewerFoundation.mutate({ viewerId: refundInfo.viewerId, operation: 'refund', amount: refundInfo.amount, reason: `Streamer Punishments refund: ${refundInfo.name}`, idempotencyKey: refundInfo.key }).catch(() => undefined);
}

// ---------- Screen effects: one at a time ----------
function cancelEffectTimer(context) { if (effectTimer !== undefined) context.schedule.cancel(effectTimer); effectTimer = undefined; }
async function effectOff(context, settings) {
  const effect = effectActive; effectActive = undefined;
  if (effect) await setFilter(context, settings, effect, false).catch(() => undefined);
}
function armEffects(context, delayMs) {
  cancelEffectTimer(context); const expected = epoch;
  effectTimer = context.schedule.after(Math.max(250, delayMs), () => serialize(async () => {
    effectTimer = undefined; if (stopped || expected !== epoch) return;
    const settings = settingsFor(context);
    if (effectActive) { await effectOff(context, settings); effectBusyUntil = Date.now() + settings.effectGapSeconds * 1000; }
    if (effectQueue.length > 0) { if (Date.now() >= effectBusyUntil) await runEffect(context, settings, effectQueue.shift()); else armEffects(context, effectBusyUntil - Date.now()); }
  }));
}
async function runEffect(context, settings, request) {
  try { await setFilter(context, settings, request.item, true); }
  catch {
    // Streamer.bot refused (not approved, OBS closed): give the points back and try the next one.
    await refund(context, request.refund);
    if (effectQueue.length > 0) armEffects(context, 250);
    return;
  }
  effectActive = request.item; effectBusyUntil = Date.now() + request.item.seconds * 1000;
  armEffects(context, request.item.seconds * 1000);
  await say(context, settings, request.platform, settings.effectMessage, { viewer: request.viewer, name: request.item.name, seconds: request.item.seconds });
}
async function buyEffect(context, settings, request) {
  if (!effectActive && effectQueue.length === 0 && Date.now() >= effectBusyUntil) { await runEffect(context, settings, request); return true; }
  if (effectQueue.length >= settings.maximumEffectQueue) return false;
  effectQueue.push(request); if (effectTimer === undefined) armEffects(context, effectBusyUntil - Date.now());
  return true;
}
async function clearEffects(context, settings) {
  epoch += 1; cancelEffectTimer(context);
  for (const request of effectQueue.splice(0)) await refund(context, request.refund);
  await effectOff(context, settings); effectBusyUntil = 0;
}

// ---------- Exercises: owed list, grace countdown, safe scene, done ----------
function cancelExerciseTimer(context) { if (exerciseTimer !== undefined) context.schedule.cancel(exerciseTimer); exerciseTimer = undefined; }
function upper(text) { return clean(text, 40).toUpperCase(); }
// Small and medium countdowns sit in a corner so they stay off the gameplay; large keeps the full-overlay card.
function countdownLayout(settings) {
  return settings.countdownSize === 'large' ? {} : { variant: 'compact', size: settings.countdownSize, position: settings.countdownPosition };
}
async function showGrace(context, settings, active) {
  const remaining = Math.max(0, Math.ceil((active.startsAt - Date.now()) / 1000));
  const bean = active.kind === 'bean';
  await overlay(context, settings, 'timer.update', { label: bean ? 'BEAN BOOZLED IN' : `${String(active.reps)} ${upper(active.name)} IN`, endsAt: active.startsAt, remainingSeconds: remaining, maximumSeconds: Math.max(1, settings.graceSeconds), running: true, live: true, livePlatforms: [...livePlatforms], contextText: bean ? `${active.flavor} from ${active.viewer}` : `from ${active.viewer}`, warning: true, critical: remaining <= 10, lastReason: 'punishment grace', badgeText: 'PUNISHMENT', ...countdownLayout(settings) });
}
async function showDoing(context, settings, active) {
  const bean = active.kind === 'bean';
  await overlay(context, settings, 'timer.update', { label: bean ? `EAT: ${upper(active.flavor)}` : `DO ${String(active.reps)} ${upper(active.name)}`, remainingSeconds: 0, maximumSeconds: 1, running: false, live: true, livePlatforms: [...livePlatforms], contextText: `from ${active.viewer}`, remainingText: '00:00', critical: true, lastReason: 'punishment', badgeText: 'NOW', ...countdownLayout(settings) });
}
// The wheel and reveal card hide the countdown, so it is drawn again afterwards.
async function redrawActive(context, settings) {
  const active = stateFor(await context.state.read()).active; if (!active) return;
  if (active.phase === 'grace') await showGrace(context, settings, active); else await showDoing(context, settings, active);
}
// Starts the next owed exercise when nothing is in progress, the stream is live, and the scene is not a break.
async function advanceExercises(context, settings, state) {
  if (stopped || state.active || state.owed.length === 0) return state;
  if (livePlatforms.size === 0 || onHoldScene(context)) return state;
  const next = state.owed.shift();
  state.active = { ...next, phase: 'grace', startsAt: Date.now() + settings.graceSeconds * 1000, returnScene: '', switched: false };
  await saveState(context, state);
  await showGrace(context, settings, state.active);
  armExercise(context, settings.graceSeconds * 1000);
  return state;
}
function armExercise(context, delayMs) {
  cancelExerciseTimer(context); const expected = epoch;
  exerciseTimer = context.schedule.after(Math.max(250, delayMs), () => serialize(async () => {
    exerciseTimer = undefined; if (stopped || expected !== epoch) return;
    const settings = settingsFor(context); const state = stateFor(await context.state.read());
    const active = state.active; if (!active || active.phase !== 'grace') return;
    if (Date.now() < active.startsAt) { armExercise(context, active.startsAt - Date.now()); return; }
    const safeScene = resolveScene(context, settings.safeSceneName);
    active.phase = 'doing'; active.returnScene = currentScene;
    // Already on the safe scene (for example Just Chatting): nothing to switch, and nothing to switch back.
    if (safeScene && safeScene.toLowerCase() !== currentScene.toLowerCase()) active.switched = await switchScene(context, settings, safeScene);
    await saveState(context, state);
    await showDoing(context, settings, active);
    await announce(context, settings, settings.startMessage, { viewer: active.viewer, name: active.kind === 'bean' ? `${active.flavor} bean` : active.name, reps: active.reps, done: settings.doneCommand || 'done' });
  }));
}
function rollMonth(state, now) {
  const month = monthOf(now);
  if (state.month === month) return;
  if (state.month && Object.keys(state.monthReps).length > 0) state.history = [...state.history, { month: state.month, reps: state.monthReps }].slice(-12);
  state.month = month; state.monthReps = {};
}
async function completeExercise(context, settings, state, platform) {
  const active = state.active; if (!active) return state;
  cancelExerciseTimer(context);
  // Every bean counts toward one monthly bean total.
  const name = active.kind === 'bean' ? BEAN_KEY : key(active.name);
  rollMonth(state, Date.now());
  state.monthReps[name] = (state.monthReps[name] ?? 0) + active.reps; state.streamReps[name] = (state.streamReps[name] ?? 0) + active.reps;
  state.active = undefined;
  await saveState(context, state);
  await overlay(context, settings, 'timer.hide', { force: true });
  // Go back only if StreamBridge moved the creator and they are still on the safe scene.
  const safeScene = resolveScene(context, settings.safeSceneName);
  if (settings.returnToPreviousScene && active.switched && active.returnScene && safeScene && currentScene.toLowerCase() === safeScene.toLowerCase()) await switchScene(context, settings, active.returnScene);
  if (active.kind === 'bean') await say(context, settings, platform, settings.beanDoneMessage, { flavor: active.flavor, month: state.monthReps[name] });
  else await say(context, settings, platform, settings.doneMessage, { name: active.name, reps: active.reps, month: state.monthReps[name] });
  return advanceExercises(context, settings, state);
}

// ---------- Requests ----------
function findItem(settings, text) { const wanted = key(text); return wanted ? settings.items.find((item) => key(item.name) === wanted || key(item.name).replace(/s$/u, '') === wanted.replace(/s$/u, '')) : undefined; }
function listText(settings) { return settings.items.map((item) => `${item.name} ${String(item.cost)}`).join(', ') || 'none yet'; }
function statusText(settings, state) {
  rollMonth(state, Date.now());
  const owed = new Map();
  for (const entry of [...(state.active ? [state.active] : []), ...state.owed]) owed.set(key(entry.name), (owed.get(key(entry.name)) ?? 0) + entry.reps);
  const parts = settings.items.filter((item) => item.kind === 'exercise').map((item) => {
    const id = key(item.name); const owedReps = owed.get(id) ?? 0;
    return `${item.name}: ${String(state.monthReps[id] ?? 0)} this month${owedReps ? `, ${String(owedReps)} owed` : ''}`;
  });
  if (settings.beanEnabled) {
    const owedBeans = [...(state.active ? [state.active] : []), ...state.owed].filter((entry) => entry.kind === 'bean').length;
    parts.push(`Beans: ${String(state.monthReps[BEAN_KEY] ?? 0)} this month${owedBeans ? `, ${String(owedBeans)} owed` : ''}`);
  }
  return parts.length > 0 ? parts.join(' | ') : 'No exercises set up.';
}

// ---------- Bean Boozled: color wheel, then a nice or nasty reveal ----------
function cancelBeanTimer(context) { if (beanTimer !== undefined) context.schedule.cancel(beanTimer); beanTimer = undefined; }
function spinsFor(settings, event) {
  if (event.eventType === 'engagement.cheer') {
    const bits = integer(event.payload?.quantity, 0, 10_000_000, 0);
    return settings.beanBitsPerSpin > 0 ? Math.floor(bits / settings.beanBitsPerSpin) : 0;
  }
  if (event.eventType === 'engagement.gift') {
    if (event.platform !== 'tiktok' || settings.beanCoinsPerSpin <= 0) return 0;
    const coins = integer(event.payload?.coins, 0, 10_000_000, 0); if (coins <= 0) return 0;
    const viewer = clean(event.user?.id, 240) || clean(event.user?.name, 240) || viewerName(event);
    const total = (giftCoins.get(viewer) ?? 0) + coins; const spins = Math.floor(total / settings.beanCoinsPerSpin);
    giftCoins.delete(viewer); if (total % settings.beanCoinsPerSpin > 0) giftCoins.set(viewer, total % settings.beanCoinsPerSpin);
    if (giftCoins.size > 1000) giftCoins.delete(giftCoins.keys().next().value);
    return spins;
  }
  // Tips must come from a verified source in the configured currency.
  const unverified = Array.isArray(event.metadata?.unverifiedFields) ? event.metadata.unverifiedFields : [];
  if (unverified.includes('source.eventId') || clean(event.payload?.currency, 3).toUpperCase() !== settings.beanTipCurrency) return 0;
  return settings.beanTipPerSpin > 0 ? Math.floor(amountOf(event.payload?.amount) / settings.beanTipPerSpin) : 0;
}
function queueSpins(context, settings, event, spins) {
  const viewer = viewerName(event); const eventId = clean(event.eventId || event.source?.eventId, 200) || `${event.platform}:${String(Date.now())}`;
  for (let index = 0; index < Math.min(spins, settings.beanMaximumSpins); index += 1) beanQueue.push({ id: `${eventId}:bean:${String(index)}`, viewer, platform: event.platform });
  if (beanTimer === undefined) armBeans(context, 0);
}
function armBeans(context, delayMs) {
  const expected = epoch;
  beanTimer = context.schedule.after(Math.max(250, delayMs), () => serialize(async () => {
    beanTimer = undefined; if (stopped || expected !== epoch) return;
    const settings = settingsFor(context); const spin = beanQueue.shift();
    if (!spin || !settings.beanEnabled || settings.beans.length < 2) { beanQueue.length = 0; return; }
    await spinBean(context, settings, spin);
  }));
}
async function spinBean(context, settings, spin, random = Math.random) {
  const index = Math.min(settings.beans.length - 1, Math.floor(random() * settings.beans.length));
  const bean = settings.beans[index]; const nasty = random() < 0.5; const flavor = nasty ? bean.nasty : bean.nice;
  const spinMs = settings.beanSpinSeconds * 1000;
  // The wheel lands on a color first; the reveal card then shows whether it was nice or nasty.
  await context.overlay.publish(`${MODULE_ID}.wheel.spin`, {
    title: 'BEAN BOOZLED', options: settings.beans.map((entry) => entry.colorName), winnerIndex: index, winner: bean.colorName,
    spinDurationMs: spinMs, winnerDurationMs: BEAN_COLOR_MS, sequence: Date.now(),
    style: { wheelColors: settings.beans.map((entry) => entry.wheelColor), backgroundColor: '#101521', textColor: '#ffffff', accentColor: '#ffd166', winnerColor: nasty ? '#ff6b7d' : '#7ff5cc' },
  }, { lane: 'foreground' }).catch(() => undefined);
  await context.overlay.publish(`${MODULE_ID}.card.show`, { title: nasty ? 'NASTY!' : 'NICE!', text: `${bean.colorName}: ${flavor}`, durationMs: BEAN_REVEAL_MS }, { lane: 'foreground' }).catch(() => undefined);
  beanTimer = context.schedule.after(spinMs + BEAN_COLOR_MS + BEAN_REVEAL_MS, () => serialize(async () => {
    beanTimer = undefined; if (stopped) return;
    const current = settingsFor(context);
    await announce(context, current, current.beanSpinMessage, { viewer: spin.viewer, color: bean.colorName, result: nasty ? 'NASTY' : 'nice', flavor });
    const state = stateFor(await context.state.read());
    state.owed.push({ id: spin.id, name: 'Bean Boozled', reps: 1, viewer: spin.viewer, platform: spin.platform, kind: 'bean', flavor, nasty });
    await saveState(context, state);
    await redrawActive(context, current);
    await advanceExercises(context, current, state);
    if (beanQueue.length > 0) armBeans(context, 500);
  }));
}

async function handleBuy(context, settings, event, item, paidByReward) {
  const viewer = viewerName(event); const now = Date.now();
  const eventId = clean(event.eventId || event.source?.eventId, 200) || `${event.platform}:${String(now)}`;
  const state = stateFor(await context.state.read());
  const id = key(item.name);
  // Twitch rewards carry their own per-exercise limit and cooldown, so only the shared limit applies to them.
  // Kick rewards have neither, so StreamBridge enforces them for Kick redemptions and for !buy.
  const enforceLimits = !paidByReward || event.platform === 'kick';
  // Kick redemptions cannot be refunded from here, so a refused one points viewers to a mod.
  const refusedNote = paidByReward && event.platform === 'kick' ? ' A mod can refund your Kick points.' : '';
  // Checked before any points are spent. Bits, tips and gifts that spin the bean wheel are never blocked.
  if (!onAllowedScene(context, settings, currentScene)) {
    const note = paidByReward ? (event.platform === 'twitch' ? ' A mod can refund your channel points.' : refusedNote) : '';
    await say(context, settings, event.platform, settings.wrongSceneMessage + note, { viewer, name: item.name, scenes: allowedScenesText(context, settings) });
    return;
  }
  if (item.kind === 'exercise') {
    // The shared limit counts every exercise from every platform, Twitch rewards included,
    // and is checked before any points are spent. A refused Twitch redemption is rejected from the reward queue.
    const sharedLimit = settings.exerciseLimitPerStream;
    if (sharedLimit > 0 && state.streamExercises >= sharedLimit) {
      const note = paidByReward ? (event.platform === 'twitch' ? ' A mod can refund your channel points.' : refusedNote) : '';
      await say(context, settings, event.platform, settings.exercisesUsedUpMessage + note, { viewer, name: item.name, used: state.streamExercises, limit: sharedLimit, remaining: 0 });
      return;
    }
    if (enforceLimits) {
      if (settings.maximumPerStream > 0 && (state.streamBought[id] ?? 0) >= settings.maximumPerStream) { await say(context, settings, event.platform, settings.limitMessage + refusedNote, { viewer, name: item.name, limit: settings.maximumPerStream }); return; }
      const wait = (state.lastBoughtAt[id] ?? 0) + settings.exerciseCooldownMinutes * 60_000 - now;
      if (wait > 0) { await say(context, settings, event.platform, settings.cooldownMessage + refusedNote, { viewer, name: item.name, minutes: Math.ceil(wait / 60_000) }); return; }
    }
    if (!paidByReward) {
      const paid = await charge(context, event, item, eventId);
      if (!paid.ok) { await say(context, settings, event.platform, settings.pointsMessage, { viewer, name: item.name, cost: item.cost, currency: paid.currency, balance: paid.balance }); return; }
    }
    state.streamBought[id] = (state.streamBought[id] ?? 0) + 1; state.lastBoughtAt[id] = now; state.streamExercises += 1;
    state.owed.push({ id: eventId, name: item.name, reps: item.reps, viewer, platform: event.platform });
    await saveState(context, state);
    await say(context, settings, event.platform, settings.exerciseMessage, { viewer, name: item.name, reps: item.reps, seconds: settings.graceSeconds });
    if (sharedLimit > 0) await say(context, settings, event.platform, settings.exercisesLeftMessage, { viewer, name: item.name, used: state.streamExercises, limit: sharedLimit, remaining: Math.max(0, sharedLimit - state.streamExercises) });
    await advanceExercises(context, settings, state);
    return;
  }
  if (!item.filterName || !item.sourceName) { await say(context, settings, event.platform, '{name} is not set up yet.', { name: item.name }); return; }
  if (paidByReward && event.platform === 'kick') {
    const wait = (state.lastBoughtAt[id] ?? 0) + settings.effectCooldownSeconds * 1000 - now;
    if (wait > 0) { await say(context, settings, event.platform, settings.cooldownMessage + refusedNote, { viewer, name: item.name, minutes: Math.ceil(wait / 60_000), seconds: Math.ceil(wait / 1000) }); return; }
  }
  const paid = paidByReward ? { ok: true } : await charge(context, event, item, eventId);
  if (!paid.ok) { await say(context, settings, event.platform, settings.pointsMessage, { viewer, name: item.name, cost: item.cost, currency: paid.currency, balance: paid.balance }); return; }
  const accepted = await buyEffect(context, settings, { item, viewer, platform: event.platform, refund: paid.refund });
  if (!accepted) { await refund(context, paid.refund); return; }
  const latest = stateFor(await context.state.read()); latest.lastBoughtAt[id] = now; await saveState(context, latest);
}

async function handleControl(context, settings, event) {
  if (!isModerator(event)) return;
  const action = argumentsOf(event);
  if (action === 'off' || action === 'stop') {
    await clearEffects(context, settings);
    const state = stateFor(await context.state.read());
    if (state.active) {
      cancelExerciseTimer(context);
      // Cancelling the one in progress puts it back at the front of the owed list.
      const { phase: _phase, startsAt: _startsAt, returnScene: _returnScene, switched: _switched, ...entry } = state.active;
      state.owed.unshift(entry); state.active = undefined; await saveState(context, state);
      await overlay(context, settings, 'timer.hide', { force: true });
    }
    await say(context, settings, event.platform, 'Punishments stopped. Owed exercises are saved for later.', {});
  } else if (action === 'clear') {
    const state = stateFor(await context.state.read()); state.owed = []; await saveState(context, state);
    await say(context, settings, event.platform, 'Owed exercises cleared.', {});
  } else if (action === 'next' || action === 'start') {
    await advanceExercises(context, settings, stateFor(await context.state.read()));
  } else if (action === 'bean' && settings.beanEnabled) {
    // A moderator test spin, also usable while offline.
    queueSpins(context, settings, event, 1);
  }
}

async function streamOnline(context, settings, platform) {
  const wasOffline = livePlatforms.size === 0; livePlatforms.add(platform);
  if (!wasOffline) return;
  const state = stateFor(await context.state.read()); const now = Date.now();
  if (!state.lastOfflineAt || now - state.lastOfflineAt > SAME_STREAM_MS) { state.streamReps = {}; state.streamBought = {}; state.streamExercises = 0; }
  // The month rolls over at the first stream in a new month, not on the 1st.
  rollMonth(state, now);
  await saveState(context, state);
  await advanceExercises(context, settings, state);
}
async function streamOffline(context, settings, platform) {
  livePlatforms.delete(platform); if (livePlatforms.size > 0) return;
  await clearEffects(context, settings); cancelExerciseTimer(context);
  // Bean spins that have not started yet are dropped; finished ones are already on the owed list.
  beanQueue.length = 0; giftCoins.clear();
  const state = stateFor(await context.state.read());
  if (state.active) {
    const { phase: _phase, startsAt: _startsAt, returnScene: _returnScene, switched: _switched, ...entry } = state.active;
    state.owed.unshift(entry); state.active = undefined;
  }
  state.lastOfflineAt = Date.now(); await saveState(context, state);
  await overlay(context, settings, 'timer.hide', { force: true });
}

async function process(event, context) {
  const settings = settingsFor(context); if (!settings.enabled) return;
  if (event.metadata?.simulated === true) return;
  if (event.eventType === 'stream.online' && LIVE_PLATFORMS.includes(event.platform)) { await streamOnline(context, settings, event.platform); return; }
  if (event.eventType === 'stream.offline' && LIVE_PLATFORMS.includes(event.platform)) { await streamOffline(context, settings, event.platform); return; }
  if (event.eventType === 'stream.scene-changed' || event.eventType === 'system.scene-catalog') {
    const scene = clean(event.eventType === 'stream.scene-changed' ? event.payload?.sceneName : event.payload?.currentScene, 256);
    if (!scene) return;
    currentScene = scene;
    if (event.eventType === 'stream.scene-changed') await advanceExercises(context, settings, stateFor(await context.state.read()));
    return;
  }
  if (event.eventType === 'engagement.cheer' || event.eventType === 'engagement.donation' || event.eventType === 'engagement.gift') {
    if (!settings.beanEnabled || settings.beans.length < 2) return;
    const spins = spinsFor(settings, event); if (spins > 0) queueSpins(context, settings, event, spins);
    return;
  }
  if (event.eventType === 'reward.redemption') {
    if (event.payload?.verifiedTransport !== true) return;
    const id = clean(event.payload?.rewardId, 256); if (!id) return;
    const item = settings.items.find((candidate) => candidate.rewardIds.includes(id)); if (!item) return;
    // A verified redemption proves the platform is live even when StreamBridge started mid-stream.
    if (LIVE_PLATFORMS.includes(event.platform) && !livePlatforms.has(event.platform)) await streamOnline(context, settings, event.platform);
    await handleBuy(context, settings, event, item, true);
    return;
  }
  if (event.eventType !== 'command.received') return;
  const name = command(event.payload?.command); if (!name) return;
  if (name === settings.statusCommand) { await say(context, settings, event.platform, statusText(settings, stateFor(await context.state.read())), {}); return; }
  if (name === settings.doneCommand) {
    if (!isModerator(event)) return;
    const state = stateFor(await context.state.read());
    const wanted = argumentsOf(event);
    if (!state.active || (wanted && findItem(settings, wanted) && key(findItem(settings, wanted).name) !== key(state.active.name))) return;
    await completeExercise(context, settings, state, event.platform);
    return;
  }
  if (name === settings.controlCommand) { await handleControl(context, settings, event); return; }
  if (name !== settings.buyCommand || !settings.buyPlatforms.has(event.platform)) return;
  const item = findItem(settings, argumentsOf(event));
  if (!item) { await say(context, settings, event.platform, settings.listMessage, { list: listText(settings), buy: settings.buyCommand }); return; }
  // Moderators and the broadcaster can test while offline.
  if (settings.onlyWhileLive && !livePlatforms.has(event.platform) && !isModerator(event)) return;
  await handleBuy(context, settings, event, item, false);
}

export default {
  manifest, required: false,
  async start(context) {
    stopped = false; operation = Promise.resolve(); epoch += 1; effectQueue.length = 0; beanQueue.length = 0; giftCoins.clear(); beanTimer = undefined; effectActive = undefined; effectBusyUntil = 0; livePlatforms.clear(); currentScene = '';
    // An exercise that was counting down or in progress when StreamBridge stopped goes back to the owed list.
    const state = stateFor(await context.state.read().catch(() => undefined));
    if (state.active) {
      const { phase: _phase, startsAt: _startsAt, returnScene: _returnScene, switched: _switched, ...entry } = state.active;
      state.owed.unshift(entry); state.active = undefined; await saveState(context, state).catch(() => undefined);
    } else await publishTracker(context, settingsFor(context), state);
  },
  async stop(context) {
    stopped = true; const settings = settingsFor(context);
    await clearEffects(context, settings); cancelExerciseTimer(context); cancelBeanTimer(context); beanQueue.length = 0; giftCoins.clear();
    livePlatforms.clear(); await operation.catch(() => undefined); operation = Promise.resolve();
  },
  async onEvent(event, context) { if (!stopped) await serialize(() => process(event, context)); },
};

export { FALLBACKS, SET_FILTER_ACTION_ID, SWITCH_SCENE_ACTION_ID, manifest, parseBean, parseEffect, parseExercise, settingsFor, spinBean, stateFor };
