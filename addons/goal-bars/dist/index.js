// Goal Bars: up to three on-stream goals (followers, subs, Bits, tips...) that add up events from every
// platform you pick. Each bar is split by platform colour and shows who contributed last. Counts are kept
// across restarts; a goal can raise its own target when it is reached. No Streamer.bot import is needed.
const MODULE_ID = 'thsv.goal-bars';
const GOAL_COUNT = 3;
export const GOAL_SOURCES = Object.freeze({
  'twitch-follows': { platform: 'twitch', eventType: 'channel.follow', label: 'Twitch follows' },
  'twitch-subs': { platform: 'twitch', eventType: 'channel.subscription', label: 'Twitch subs' },
  'twitch-gifted-subs': { platform: 'twitch', eventType: 'channel.gift-subscription', label: 'Twitch gifted subs', quantity: true },
  'twitch-bits': { platform: 'twitch', eventType: 'engagement.cheer', label: 'Twitch Bits', quantity: true },
  'youtube-subscribers': { platform: 'youtube', eventType: 'channel.follow', label: 'YouTube subscribers' },
  'youtube-members': { platform: 'youtube', eventType: 'channel.membership', label: 'YouTube members' },
  'youtube-gifted-members': { platform: 'youtube', eventType: 'channel.gift-subscription', label: 'YouTube gifted members', quantity: true },
  'youtube-super-chats': { platform: 'youtube', eventType: 'engagement.super-chat', label: 'YouTube Super Chats', money: true },
  'kick-follows': { platform: 'kick', eventType: 'channel.follow', label: 'Kick follows' },
  'kick-subs': { platform: 'kick', eventType: 'channel.subscription', label: 'Kick subs' },
  'kick-gifted-subs': { platform: 'kick', eventType: 'channel.gift-subscription', label: 'Kick gifted subs', quantity: true },
  'tiktok-follows': { platform: 'tiktok', eventType: 'channel.follow', label: 'TikTok follows' },
  'tiktok-gifts': { platform: 'tiktok', eventType: 'engagement.gift', label: 'TikTok gifts', quantity: true },
  'facebook-follows': { platform: 'facebook', eventType: 'channel.follow', label: 'Facebook follows' },
  tips: { platform: 'tips', eventType: 'engagement.donation', label: 'Tips (Streamlabs, Ko-fi)', money: true },
});
const EVENT_TYPES = Object.freeze([...new Set(Object.values(GOAL_SOURCES).map((source) => source.eventType))]);
const DEFAULT_GOALS = Object.freeze([
  { label: 'Followers', sources: ['twitch-follows', 'youtube-subscribers', 'kick-follows'], target: 100 },
  { label: 'Subs', sources: ['twitch-subs', 'twitch-gifted-subs', 'youtube-members', 'kick-subs', 'kick-gifted-subs'], target: 25 },
  { label: 'Tips', sources: ['tips', 'youtube-super-chats'], target: 100 },
]);

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Goal Bars', version: '4.1.8',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.1.8', maximumTestedBridgeVersion: '4.1.8',
  dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: [...EVENT_TYPES, 'stream.online', 'command.received'],
  commandsProvided: [], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: [`data/addons/${MODULE_ID}/`, `data/addons/.state/${MODULE_ID}/`],
  installationSteps: [
    'Name up to three goals, tick what each one adds up, and set a target.',
    'Add the overlay as a browser source (1920x1080) in the scenes where the goals should show.',
    'Enable the extension and restart StreamBridge.',
  ],
  uninstallationSteps: ['Disable the extension and remove its browser source.'], migrations: [],
  healthChecks: [{ id: `${MODULE_ID}.runtime`, description: 'Confirms event counting, target raising, persistence and the goals overlay.' }],
};

let stopped = true;
let operation = Promise.resolve();

function clean(value, maximum = 160) { return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '')].slice(0, maximum).join(''); }
function integer(value, minimum, maximum, fallback) { const number = Number(value); return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback; }
function command(value) { return clean(value, 40).replace(/^!+/u, '').toLowerCase(); }
function wholeAmount(value) { const number = Number(value); return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0; }
function positiveQuantity(value) { const number = Number(value); return Number.isInteger(number) && number > 0 ? Math.min(number, 1_000_000) : 1; }

export function settingsFor(context) {
  const raw = context?.settings ?? {};
  const goals = [];
  for (let index = 1; index <= GOAL_COUNT; index += 1) {
    const fallback = DEFAULT_GOALS[index - 1];
    const sources = (Array.isArray(raw[`goal${index}Sources`]) ? raw[`goal${index}Sources`] : fallback.sources).filter((id, position, all) => Object.hasOwn(GOAL_SOURCES, id) && all.indexOf(id) === position);
    goals.push({
      index, enabled: raw[`goal${index}Enabled`] !== undefined ? raw[`goal${index}Enabled`] === true : index <= 2,
      label: clean(raw[`goal${index}Label`], 40) || fallback.label, title: clean(raw[`goal${index}Title`], 80),
      sources, target: integer(raw[`goal${index}Target`], 1, 1_000_000_000, fallback.target),
      raiseBy: integer(raw[`goal${index}RaiseBy`], 0, 1_000_000_000, 0), start: integer(raw[`goal${index}Start`], 0, 1_000_000_000, 0),
    });
  }
  return {
    enabled: raw.enabled === true, goals, currency: clean(raw.tipsCurrency, 3).toUpperCase(),
    resetCommand: command(raw.resetCommand ?? 'goalreset'), resetOnStreamStart: raw.resetOnStreamStart === true,
    overlayTitle: clean(raw.overlayTitle, 60), showLastContributor: raw.showLastContributor !== false,
  };
}

/** How much an event adds to a source, or 0 when it does not belong to it. */
export function contribution(event, sourceId, settings) {
  const source = GOAL_SOURCES[sourceId];
  if (!source || event?.eventType !== source.eventType) return 0;
  if (source.platform === 'tips' ? event.platform === 'youtube' || ['twitch', 'kick', 'tiktok', 'facebook'].includes(event.platform) : event.platform !== source.platform) return 0;
  if (source.money) {
    const currency = clean(event.payload?.currency, 3).toUpperCase();
    if (settings.currency && currency !== settings.currency) return 0;
    return wholeAmount(event.payload?.amount);
  }
  return source.quantity ? positiveQuantity(event.payload?.quantity) : 1;
}

function emptyState() { return { goals: {}, seen: [] }; }
function sanitize(raw) {
  const state = emptyState();
  if (raw && typeof raw === 'object' && raw.goals && typeof raw.goals === 'object') {
    for (const [key, goal] of Object.entries(raw.goals)) {
      if (!/^[1-3]$/u.test(key) || !goal || typeof goal !== 'object') continue;
      const counts = {};
      for (const [source, count] of Object.entries(goal.counts ?? {})) if (Object.hasOwn(GOAL_SOURCES, source)) counts[source] = integer(count, 0, 1_000_000_000_000, 0);
      state.goals[key] = { counts, target: integer(goal.target, 1, 1_000_000_000, undefined), lastContributor: clean(goal.lastContributor, 80), lastPlatform: clean(goal.lastPlatform, 20) };
      // Control Deck changes: a hand-set target and a hand-added (or removed) amount.
      const manualTarget = integer(goal.manualTarget, 1, 1_000_000_000, undefined); if (manualTarget !== undefined) state.goals[key].manualTarget = manualTarget;
      const manual = integer(goal.manual, -1_000_000_000, 1_000_000_000, 0); if (manual !== 0) state.goals[key].manual = manual;
    }
  }
  if (Array.isArray(raw?.seen)) state.seen = raw.seen.filter((id) => typeof id === 'string').slice(-200);
  return state;
}

/** The overlay payload: each goal with its total, current target and the per-source split. */
export function goalsView(settings, state) {
  const goals = settings.goals.filter((goal) => goal.enabled && goal.sources.length > 0).map((goal) => {
    const saved = state.goals[String(goal.index)] ?? { counts: {} };
    const segments = goal.sources.map((id) => ({ source: id, platform: GOAL_SOURCES[id].platform, value: saved.counts?.[id] ?? 0 })).filter((segment) => segment.value > 0);
    // A hand-added amount shows as part of the starting amount, so the bar keeps its platform split.
    const start = Math.max(0, goal.start + (saved.manual ?? 0));
    const current = start + segments.reduce((total, segment) => total + segment.value, 0);
    const base = saved.manualTarget ?? goal.target;
    let target = Math.max(base, saved.target ?? base);
    if (goal.raiseBy > 0) while (current >= target) target += goal.raiseBy;
    return { index: goal.index, label: goal.label, title: goal.title, current, target, start, segments, lastContributor: settings.showLastContributor ? saved.lastContributor ?? '' : '', lastPlatform: saved.lastPlatform ?? '' };
  });
  return { title: settings.overlayTitle, goals };
}

async function publish(context, settings, state) {
  const view = goalsView(settings, state);
  if (view.goals.length === 0) { await context.overlay.publish(`${MODULE_ID}.goals.hide`, {}, { lane: 'persistent' }).catch(() => undefined); return; }
  await context.overlay.publish(`${MODULE_ID}.goals.update`, view, { lane: 'persistent' }).catch(() => undefined);
}

async function reset(context, settings, which) {
  const state = sanitize(await context.state.read());
  for (const goal of settings.goals) if (which === 0 || which === goal.index) delete state.goals[String(goal.index)];
  await context.state.write(state);
  await publish(context, settings, state);
}

async function process(event, context) {
  const settings = settingsFor(context);
  if (!settings.enabled) return;
  if (event.eventType === 'stream.online' && settings.resetOnStreamStart && event.metadata?.simulated !== true) return reset(context, settings, 0);
  if (event.eventType === 'command.received') {
    if (!settings.resetCommand || command(event.payload?.command) !== settings.resetCommand) return;
    const roles = Array.isArray(event.user?.roles) ? event.user.roles.map((role) => String(role).toLowerCase()) : [];
    if (!roles.includes('moderator') && !roles.includes('broadcaster')) return;
    const args = Array.isArray(event.payload?.arguments) ? event.payload.arguments : [event.payload?.arguments];
    const which = integer(Number.parseInt(String(args[0] ?? '0'), 10), 0, GOAL_COUNT, 0);
    await reset(context, settings, which);
    await context.chat.send({ message: which === 0 ? 'Goals reset.' : `Goal ${String(which)} reset.`, routing: 'source', sourcePlatform: event.platform, overflow: 'truncate' }).catch(() => undefined);
    return;
  }
  if (event.metadata?.simulated === true || !EVENT_TYPES.includes(event.eventType)) return;
  const state = sanitize(await context.state.read());
  const id = clean(event.eventId, 200);
  if (id && state.seen.includes(id)) return;
  let changed = false;
  const contributor = clean(event.user?.displayName || event.user?.name, 80);
  for (const goal of settings.goals) {
    if (!goal.enabled) continue;
    for (const source of goal.sources) {
      const amount = contribution(event, source, settings);
      if (amount <= 0) continue;
      const saved = state.goals[String(goal.index)] ?? { counts: {}, lastContributor: '', lastPlatform: '' };
      saved.counts[source] = (saved.counts[source] ?? 0) + amount;
      if (contributor) { saved.lastContributor = contributor; saved.lastPlatform = event.platform; }
      state.goals[String(goal.index)] = saved;
      changed = true;
    }
  }
  if (!changed) return;
  rememberTargets(settings, state);
  if (id) state.seen = [...state.seen, id].slice(-200);
  await context.state.write(state);
  await publish(context, settings, state);
}

// Remember raised targets so a lowered count (a reset of one source) never shrinks the goal on screen.
function rememberTargets(settings, state) {
  for (const goal of goalsView(settings, state).goals) { const saved = state.goals[String(goal.index)]; if (saved) saved.target = goal.target; }
}

const DECK_MAXIMUM = 1_000_000_000;
function deckNumber(value, minimum, label) {
  const number = typeof value === 'string' ? Number(value) : value;
  if (!Number.isSafeInteger(number) || number < minimum || number > DECK_MAXIMUM) throw new Error(`Enter a whole number of ${String(minimum)} or more for ${label}.`);
  return number;
}
function deckView(settings, state, message) {
  const goals = goalsView(settings, state).goals;
  const goalOptions = goals.map((goal) => ({ value: String(goal.index), label: goal.label }));
  const sections = [{ title: 'Goals', items: goals.map((goal) => ({
    id: String(goal.index), label: `${goal.label}: ${goal.current.toLocaleString('en-US')} / ${goal.target.toLocaleString('en-US')}`,
    ...(goal.title || goal.lastContributor ? { detail: [goal.title, goal.lastContributor ? `Last: ${goal.lastContributor}` : ''].filter(Boolean).join(' · ') } : {}),
    actions: [
      { operation: 'adjust', label: '+1', args: { goal: goal.index, amount: 1 }, tone: 'primary' },
      { operation: 'adjust', label: '−1', args: { goal: goal.index, amount: -1 }, disabled: goal.current === 0 },
    ],
  })) }];
  if (goals.length) {
    sections.push({ title: 'Add or subtract', form: { operation: 'adjust-form', submitLabel: 'Apply', inputs: [
      { name: 'goal', label: 'Goal', type: 'select', value: goalOptions[0].value, options: goalOptions },
      { name: 'direction', label: 'Add or subtract', type: 'select', value: 'add', options: [{ value: 'add', label: 'Add' }, { value: 'subtract', label: 'Subtract' }] },
      { name: 'amount', label: 'Amount', type: 'number', value: 1, min: 1, max: DECK_MAXIMUM },
    ] } });
    sections.push({ title: 'Change a target', form: { operation: 'set-target', submitLabel: 'Set target', inputs: [
      { name: 'goal', label: 'Goal', type: 'select', value: goalOptions[0].value, options: goalOptions },
      { name: 'target', label: 'New target', type: 'number', value: goals[0].target, min: 1, max: DECK_MAXIMUM },
    ] } });
  }
  const status = !settings.enabled ? 'Goal Bars is turned off in its settings' : goals.length ? goals.map((goal) => `${goal.label} ${goal.current.toLocaleString('en-US')}/${goal.target.toLocaleString('en-US')}`).join(' · ') : 'No goals turned on';
  return { title: 'Goal Bars', status, ...(message ? { message } : {}), sections };
}
// Adds to the hand-set amount, or takes it back out: first from that amount, then from the counted events.
function adjustGoal(settings, state, goal, amount) {
  const saved = state.goals[String(goal.index)] ?? { counts: {}, lastContributor: '', lastPlatform: '' };
  state.goals[String(goal.index)] = saved;
  if (amount > 0) { saved.manual = Math.min(DECK_MAXIMUM, (saved.manual ?? 0) + amount); return; }
  let remaining = -amount;
  const fromManual = Math.min(remaining, Math.max(0, goal.start + (saved.manual ?? 0)));
  saved.manual = (saved.manual ?? 0) - fromManual; remaining -= fromManual;
  for (const source of [...goal.sources].reverse()) {
    if (remaining <= 0) break;
    const taken = Math.min(remaining, saved.counts[source] ?? 0);
    if (taken > 0) { saved.counts[source] -= taken; remaining -= taken; }
  }
  if (saved.manual === 0) delete saved.manual;
}
async function runControlDeck(request, context) {
  const settings = settingsFor(context); const state = sanitize(await context.state.read());
  const operationName = request?.operation; const args = request?.args && typeof request.args === 'object' ? request.args : {};
  if (operationName === 'view') return deckView(settings, state);
  if (!settings.enabled) throw new Error('Goal Bars is turned off. Turn it on in its settings first.');
  if (!['adjust', 'adjust-form', 'set-target'].includes(operationName)) throw new Error('Goal Bars does not know that control.');
  const visible = goalsView(settings, state).goals;
  const shown = visible.find((goal) => String(goal.index) === String(args.goal));
  const goal = shown ? settings.goals.find((item) => item.index === shown.index) : undefined;
  if (!goal) throw new Error('Pick one of the goals that is turned on.');
  let message;
  if (operationName === 'set-target') {
    const target = deckNumber(args.target, 1, 'the target');
    const saved = state.goals[String(goal.index)] ?? { counts: {}, lastContributor: '', lastPlatform: '' };
    saved.manualTarget = target; saved.target = target; state.goals[String(goal.index)] = saved;
    message = `${goal.label} target set to ${target.toLocaleString('en-US')}.`;
  } else {
    let amount;
    if (operationName === 'adjust') {
      amount = typeof args.amount === 'string' ? Number(args.amount) : args.amount;
      if (amount !== 1 && amount !== -1) throw new Error('Use the +1 and −1 buttons, or the form for other amounts.');
    } else {
      if (args.direction !== 'add' && args.direction !== 'subtract') throw new Error('Choose add or subtract.');
      amount = deckNumber(args.amount, 1, 'the amount') * (args.direction === 'subtract' ? -1 : 1);
    }
    if (amount < 0 && shown.current === 0) throw new Error(`${goal.label} is already at 0.`);
    adjustGoal(settings, state, goal, amount);
    message = `${amount > 0 ? 'Added' : 'Subtracted'} ${Math.abs(amount).toLocaleString('en-US')} ${amount > 0 ? 'to' : 'from'} ${goal.label}.`;
  }
  rememberTargets(settings, state);
  await context.state.write(state);
  await publish(context, settings, state);
  return deckView(settings, state, message);
}

function serialize(task) { operation = operation.then(task, task); return operation; }

export default {
  manifest, required: false,
  async start(context) {
    stopped = false; operation = Promise.resolve();
    const settings = settingsFor(context);
    if (settings.enabled) await publish(context, settings, sanitize(await context.state.read()));
  },
  async stop() { stopped = true; await operation; },
  async onEvent(event, context) { if (!stopped) await serialize(() => process(event, context)); },
  async controlDeck(request, context) {
    if (stopped && request?.operation !== 'view') throw new Error('Goal Bars is not running.');
    const run = operation.then(() => runControlDeck(request, context), () => runControlDeck(request, context));
    operation = run.catch(() => undefined);
    return run;
  },
};
