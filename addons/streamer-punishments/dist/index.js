// Streamer Punishments lets viewers spend points or channel points on short OBS screen effects
// (a filter switched on for a few seconds) or on exercises the creator does on camera.
// Effects run one at a time. Exercises wait in an owed list: each gets a visible grace countdown,
// then StreamBridge switches to a safe scene until the creator or a moderator marks it done.
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
  maximumPerStream: 5, exerciseCooldownMinutes: 10, effectCooldownSeconds: 30, effectGapSeconds: 1, maximumEffectQueue: 5, onlyWhileLive: true, showOverlay: true,
  chatReplies: true,
  effectMessage: '{viewer} hit the stream with {name} for {seconds}s!',
  exerciseMessage: '{viewer} bought {reps} {name}! Starting in {seconds}s.',
  startMessage: 'Time for {reps} {name} from {viewer}! A mod types !{done} when they are done.',
  doneMessage: '{reps} {name} done! {name} this month: {month}.',
  limitMessage: '{viewer}, {name} is maxed out for this stream ({limit}). Try another punishment.',
  cooldownMessage: '{viewer}, {name} is cooling down. Try again in {minutes} min.',
  pointsMessage: '{viewer}, {name} costs {cost} {currency}. You have {balance}.',
  listMessage: 'Punishments: {list}. Use !{buy} <name>.',
});

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Streamer Punishments', version: '4.0.38',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.38', maximumTestedBridgeVersion: '4.0.38',
  dependencies: ['thsv.viewer-foundation'], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: ['command.received', 'reward.redemption', 'stream.online', 'stream.offline', 'stream.scene-changed', 'system.scene-catalog'],
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

function clean(value, maximum = 160) { return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '')].slice(0, maximum).join(''); }
function integer(value, minimum, maximum, fallback) { const parsed = typeof value === 'number' ? value : Number(value); return Number.isSafeInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback; }
function command(value) { const match = clean(value, 65).toLowerCase().match(/^!?([a-z0-9][a-z0-9-]{0,63})$/u); return match ? match[1] : ''; }
function key(value) { return clean(value, 80).toLowerCase().replace(/[^a-z0-9]+/gu, ''); }
function format(template, values) { let result = clean(template, 300); for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, [...String(value).replace(/[\u0000-\u001f\u007f]/gu, ' ')].slice(0, 200).join('')); return clean(result, 450); }
// Twitch and Kick reward IDs have their own boxes; a comma-separated pair in one box still works.
function rewardIds(...values) { return [...new Set(values.flatMap((value) => clean(value, 300).split(',')).map((id) => clean(id, 256)).filter(Boolean))].slice(0, 4); }
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
function settingsFor(context) {
  const raw = context.settings ?? {};
  const seen = new Set(); const items = [];
  const add = (item) => { if (item && !seen.has(key(item.name))) { seen.add(key(item.name)); items.push(item); } };
  for (const line of (Array.isArray(raw.effects) ? raw.effects : FALLBACKS.effects).slice(0, 15)) add(parseEffect(line));
  for (const line of (Array.isArray(raw.exercises) ? raw.exercises : FALLBACKS.exercises).slice(0, 15)) add(parseExercise(line));
  const text = (name) => clean(raw[name], 300) || FALLBACKS[name];
  return {
    enabled: raw.enabled === true, items,
    buyCommand: command(raw.buyCommand ?? FALLBACKS.buyCommand), doneCommand: command(raw.doneCommand ?? FALLBACKS.doneCommand),
    statusCommand: command(raw.statusCommand ?? FALLBACKS.statusCommand), controlCommand: command(raw.controlCommand ?? FALLBACKS.controlCommand),
    buyPlatforms: new Set(Array.isArray(raw.buyPlatforms) ? raw.buyPlatforms.filter((value) => BUY_PLATFORMS.includes(value)) : FALLBACKS.buyPlatforms),
    graceSeconds: integer(raw.graceSeconds, 0, 300, FALLBACKS.graceSeconds), safeSceneName: clean(raw.safeSceneName ?? FALLBACKS.safeSceneName, 256),
    returnToPreviousScene: raw.returnToPreviousScene !== false, connectionIndex: integer(raw.connectionIndex, 0, 23, 0),
    maximumPerStream: integer(raw.maximumPerStream, 0, 100, FALLBACKS.maximumPerStream), exerciseCooldownMinutes: integer(raw.exerciseCooldownMinutes, 0, 240, FALLBACKS.exerciseCooldownMinutes),
    effectCooldownSeconds: integer(raw.effectCooldownSeconds, 0, 3600, FALLBACKS.effectCooldownSeconds),
    effectGapSeconds: integer(raw.effectGapSeconds, 0, 30, FALLBACKS.effectGapSeconds), maximumEffectQueue: integer(raw.maximumEffectQueue, 0, 20, FALLBACKS.maximumEffectQueue),
    onlyWhileLive: raw.onlyWhileLive !== false, showOverlay: raw.showOverlay !== false, chatReplies: raw.chatReplies !== false,
    effectMessage: text('effectMessage'), exerciseMessage: text('exerciseMessage'), startMessage: text('startMessage'), doneMessage: text('doneMessage'),
    limitMessage: text('limitMessage'), cooldownMessage: text('cooldownMessage'), pointsMessage: text('pointsMessage'), listMessage: text('listMessage'),
  };
}

// Saved between restarts: owed exercises, the one in progress, and this stream's and month's totals.
function stateFor(value) {
  const source = value && typeof value === 'object' ? value : {};
  const counts = (input, maximum = 10_000_000) => Object.fromEntries(Object.entries(input && typeof input === 'object' ? input : {}).filter(([name]) => key(name)).slice(0, 30).map(([name, count]) => [key(name), integer(count, 0, maximum, 0)]));
  const entry = (input) => (input && typeof input === 'object' && key(input.name) ? { id: clean(input.id, 200), name: clean(input.name, 40), reps: integer(input.reps, 1, 500, 1), viewer: clean(input.viewer, 60) || 'Someone', platform: LIVE_PLATFORMS.includes(input.platform) ? input.platform : '' } : undefined);
  const active = entry(source.active);
  return {
    month: /^\d{4}-\d{2}$/u.test(source.month) ? source.month : '', monthReps: counts(source.monthReps), streamReps: counts(source.streamReps), streamBought: counts(source.streamBought),
    lastBoughtAt: counts(source.lastBoughtAt, Number.MAX_SAFE_INTEGER), lastOfflineAt: integer(source.lastOfflineAt, 0, Number.MAX_SAFE_INTEGER, 0),
    history: (Array.isArray(source.history) ? source.history : []).filter((month) => month && /^\d{4}-\d{2}$/u.test(month.month)).slice(-12).map((month) => ({ month: month.month, reps: counts(month.reps) })),
    owed: (Array.isArray(source.owed) ? source.owed : []).map(entry).filter(Boolean).slice(0, 100),
    active: active ? { ...active, phase: source.active.phase === 'doing' ? 'doing' : 'grace', startsAt: integer(source.active.startsAt, 0, Number.MAX_SAFE_INTEGER, 0), returnScene: clean(source.active.returnScene, 256), switched: source.active.switched === true } : undefined,
  };
}

function viewerName(event) { return clean(event.user?.displayName || event.user?.name, 60) || 'Someone'; }
function isModerator(event) { return Array.isArray(event.user?.roles) && event.user.roles.some((role) => ['broadcaster', 'moderator', 'mod'].includes(String(role).toLowerCase())); }
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
async function showGrace(context, settings, active) {
  const remaining = Math.max(0, Math.ceil((active.startsAt - Date.now()) / 1000));
  await overlay(context, settings, 'timer.update', { label: `${String(active.reps)} ${upper(active.name)} IN`, endsAt: active.startsAt, remainingSeconds: remaining, maximumSeconds: Math.max(1, settings.graceSeconds), running: true, live: true, livePlatforms: [...livePlatforms], contextText: `from ${active.viewer}`, warning: true, critical: remaining <= 10, lastReason: 'punishment grace', badgeText: 'PUNISHMENT' });
}
async function showDoing(context, settings, active) {
  await overlay(context, settings, 'timer.update', { label: `DO ${String(active.reps)} ${upper(active.name)}`, remainingSeconds: 0, maximumSeconds: 1, running: false, live: true, livePlatforms: [...livePlatforms], contextText: `from ${active.viewer}`, remainingText: '00:00', critical: true, lastReason: 'punishment', badgeText: 'NOW' });
}
// Starts the next owed exercise when nothing is in progress, the stream is live, and the scene is not a break.
async function advanceExercises(context, settings, state) {
  if (stopped || state.active || state.owed.length === 0) return state;
  if (livePlatforms.size === 0 || onHoldScene(context)) return state;
  const next = state.owed.shift();
  state.active = { ...next, phase: 'grace', startsAt: Date.now() + settings.graceSeconds * 1000, returnScene: '', switched: false };
  await context.state.write(state);
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
    await context.state.write(state);
    await showDoing(context, settings, active);
    await announce(context, settings, settings.startMessage, { viewer: active.viewer, name: active.name, reps: active.reps, done: settings.doneCommand || 'done' });
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
  const name = key(active.name);
  rollMonth(state, Date.now());
  state.monthReps[name] = (state.monthReps[name] ?? 0) + active.reps; state.streamReps[name] = (state.streamReps[name] ?? 0) + active.reps;
  state.active = undefined;
  await context.state.write(state);
  await overlay(context, settings, 'timer.hide', { force: true });
  // Go back only if StreamBridge moved the creator and they are still on the safe scene.
  const safeScene = resolveScene(context, settings.safeSceneName);
  if (settings.returnToPreviousScene && active.switched && active.returnScene && safeScene && currentScene.toLowerCase() === safeScene.toLowerCase()) await switchScene(context, settings, active.returnScene);
  await say(context, settings, platform, settings.doneMessage, { name: active.name, reps: active.reps, month: state.monthReps[name] });
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
  return parts.length > 0 ? parts.join(' | ') : 'No exercises set up.';
}

async function handleBuy(context, settings, event, item, paidByReward) {
  const viewer = viewerName(event); const now = Date.now();
  const eventId = clean(event.eventId || event.source?.eventId, 200) || `${event.platform}:${String(now)}`;
  const state = stateFor(await context.state.read());
  const id = key(item.name);
  // Twitch rewards carry their own limit and cooldown, so Twitch redemptions are always accepted.
  // Kick rewards have neither, so StreamBridge enforces them for Kick redemptions and for !buy.
  const enforceLimits = !paidByReward || event.platform === 'kick';
  if (item.kind === 'exercise') {
    if (enforceLimits) {
      if (settings.maximumPerStream > 0 && (state.streamBought[id] ?? 0) >= settings.maximumPerStream) { await say(context, settings, event.platform, settings.limitMessage, { viewer, name: item.name, limit: settings.maximumPerStream }); return; }
      const wait = (state.lastBoughtAt[id] ?? 0) + settings.exerciseCooldownMinutes * 60_000 - now;
      if (wait > 0) { await say(context, settings, event.platform, settings.cooldownMessage, { viewer, name: item.name, minutes: Math.ceil(wait / 60_000) }); return; }
    }
    if (!paidByReward) {
      const paid = await charge(context, event, item, eventId);
      if (!paid.ok) { await say(context, settings, event.platform, settings.pointsMessage, { viewer, name: item.name, cost: item.cost, currency: paid.currency, balance: paid.balance }); return; }
    }
    state.streamBought[id] = (state.streamBought[id] ?? 0) + 1; state.lastBoughtAt[id] = now;
    state.owed.push({ id: eventId, name: item.name, reps: item.reps, viewer, platform: event.platform });
    await context.state.write(state);
    await say(context, settings, event.platform, settings.exerciseMessage, { viewer, name: item.name, reps: item.reps, seconds: settings.graceSeconds });
    await advanceExercises(context, settings, state);
    return;
  }
  if (!item.filterName || !item.sourceName) { await say(context, settings, event.platform, '{name} is not set up yet.', { name: item.name }); return; }
  if (paidByReward && event.platform === 'kick') {
    const wait = (state.lastBoughtAt[id] ?? 0) + settings.effectCooldownSeconds * 1000 - now;
    if (wait > 0) { await say(context, settings, event.platform, settings.cooldownMessage, { viewer, name: item.name, minutes: Math.ceil(wait / 60_000), seconds: Math.ceil(wait / 1000) }); return; }
  }
  const paid = paidByReward ? { ok: true } : await charge(context, event, item, eventId);
  if (!paid.ok) { await say(context, settings, event.platform, settings.pointsMessage, { viewer, name: item.name, cost: item.cost, currency: paid.currency, balance: paid.balance }); return; }
  const accepted = await buyEffect(context, settings, { item, viewer, platform: event.platform, refund: paid.refund });
  if (!accepted) { await refund(context, paid.refund); return; }
  const latest = stateFor(await context.state.read()); latest.lastBoughtAt[id] = now; await context.state.write(latest);
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
      state.owed.unshift(entry); state.active = undefined; await context.state.write(state);
      await overlay(context, settings, 'timer.hide', { force: true });
    }
    await say(context, settings, event.platform, 'Punishments stopped. Owed exercises are saved for later.', {});
  } else if (action === 'clear') {
    const state = stateFor(await context.state.read()); state.owed = []; await context.state.write(state);
    await say(context, settings, event.platform, 'Owed exercises cleared.', {});
  } else if (action === 'next' || action === 'start') {
    await advanceExercises(context, settings, stateFor(await context.state.read()));
  }
}

async function streamOnline(context, settings, platform) {
  const wasOffline = livePlatforms.size === 0; livePlatforms.add(platform);
  if (!wasOffline) return;
  const state = stateFor(await context.state.read()); const now = Date.now();
  if (!state.lastOfflineAt || now - state.lastOfflineAt > SAME_STREAM_MS) { state.streamReps = {}; state.streamBought = {}; }
  // The month rolls over at the first stream in a new month, not on the 1st.
  rollMonth(state, now);
  await context.state.write(state);
  await advanceExercises(context, settings, state);
}
async function streamOffline(context, settings, platform) {
  livePlatforms.delete(platform); if (livePlatforms.size > 0) return;
  await clearEffects(context, settings); cancelExerciseTimer(context);
  const state = stateFor(await context.state.read());
  if (state.active) {
    const { phase: _phase, startsAt: _startsAt, returnScene: _returnScene, switched: _switched, ...entry } = state.active;
    state.owed.unshift(entry); state.active = undefined;
  }
  state.lastOfflineAt = Date.now(); await context.state.write(state);
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
    stopped = false; operation = Promise.resolve(); epoch += 1; effectQueue.length = 0; effectActive = undefined; effectBusyUntil = 0; livePlatforms.clear(); currentScene = '';
    // An exercise that was counting down or in progress when StreamBridge stopped goes back to the owed list.
    const state = stateFor(await context.state.read().catch(() => undefined));
    if (state.active) {
      const { phase: _phase, startsAt: _startsAt, returnScene: _returnScene, switched: _switched, ...entry } = state.active;
      state.owed.unshift(entry); state.active = undefined; await context.state.write(state).catch(() => undefined);
    }
  },
  async stop(context) {
    stopped = true; const settings = settingsFor(context);
    await clearEffects(context, settings); cancelExerciseTimer(context);
    livePlatforms.clear(); await operation.catch(() => undefined); operation = Promise.resolve();
  },
  async onEvent(event, context) { if (!stopped) await serialize(() => process(event, context)); },
};

export { FALLBACKS, SET_FILTER_ACTION_ID, SWITCH_SCENE_ACTION_ID, manifest, parseEffect, parseExercise, settingsFor, stateFor };
