// Reward Timers: named countdowns that viewers start with a channel point reward, for example
// "Streamer muted 5:00" or "No swearing 10:00". Each running timer shows on stream with the viewer's
// picture, its label, the time left and a bar that empties. The overlay counts down by itself from the
// end time, so the Bridge only publishes when a timer starts, changes or ends. Running timers are saved,
// so they carry on after a restart. Moderators can start, stop and clear timers with a chat command.
// No Streamer.bot import is needed: rewards and commands already arrive through the platform intakes.
const MODULE_ID = 'thsv.reward-timers';
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok', 'facebook']);
const POSITIONS = Object.freeze(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
const MAX_TIMERS = 10;
const MAX_QUEUE = 20;
const MIN_SECONDS = 5;
const MAX_SECONDS = 180 * 60;
// Adding time to a running timer never takes it past this much time left.
const MAX_REMAINING_MS = 6 * 3_600_000;
const FALLBACKS = Object.freeze({
  enabled: false,
  // One timer per row: On | Label | Duration | minutes or seconds | Reward title.
  timers: ['on | Streamer muted | 5 | minutes |', 'on | No swearing | 10 | minutes |'],
  repeatMode: 'add', runMode: 'queue', command: 'timer',
  queuedMessage: '⏳ {name} queued {label}. It starts when the current timer ends ({ahead} ahead).',
  announceStart: true, startMessage: '⏳ {name} started {label} for {time}!',
  announceEnd: true, endMessage: '⏰ {label} is over!',
  position: 'top-right', maxOnScreen: 4, showAvatar: true, accentColor: '#7ee0ff',
});

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Reward Timers', version: '4.1.63',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.1.63', maximumTestedBridgeVersion: '4.1.63',
  dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: ['reward.redemption', 'command.received'],
  commandsProvided: [], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: [`data/addons/${MODULE_ID}/`, `data/addons/.state/${MODULE_ID}/`],
  installationSteps: [
    'Create a channel point reward on Twitch and/or Kick for each timer, for example "Mute the streamer".',
    'Name each timer, set how long it runs, and type the exact reward title that starts it.',
    'Add the overlay as a browser source (1920x1080) in the scenes where the timers should show.',
    'Enable the extension and restart StreamBridge.',
  ],
  uninstallationSteps: ['Disable the extension and remove its browser source. Running timers are forgotten.'], migrations: [],
  healthChecks: [{ id: `${MODULE_ID}.runtime`, description: 'Confirms reward title matching, added or restarted time, the moderator command, saved end times and the timer overlay.' }],
};

let stopped = true;
let operation = Promise.resolve();
let expiryTimer;
let runtime;

function clean(value, maximum = 160) { return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '')].slice(0, maximum).join(''); }
function integer(value, minimum, maximum, fallback) { const number = Number(value); return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback; }
function choice(value, choices, fallback) { return choices.includes(value) ? value : fallback; }
function color(value, fallback) { return typeof value === 'string' && /^#[0-9a-f]{6}$/iu.test(value) ? value.toLowerCase() : fallback; }
function command(value) { return clean(value, 40).replace(/^!+/u, '').toLowerCase(); }
function key(value) { return clean(value, 60).toLowerCase(); }
function https(value) { return typeof value === 'string' && value.startsWith('https://') && value.length <= 2_000 ? value : ''; }
function format(template, values) { return clean(clean(template, 300).replace(/\{(name|label|time|ahead)\}/gu, (_, name) => String(values[name] ?? '')), 450); }

/** 5:00, 0:45 or 1:02:03. */
export function formatDuration(ms) {
  const total = Math.max(0, Math.ceil(ms / 1_000));
  const hours = Math.floor(total / 3_600); const minutes = Math.floor((total % 3_600) / 60); const seconds = total % 60;
  return hours > 0 ? `${String(hours)}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${String(minutes)}:${String(seconds).padStart(2, '0')}`;
}

/** One timer row: On | Label | Duration | minutes or seconds | Reward title | Twitch reward ID | Kick reward ID. */
export function parseTimer(line) {
  const parts = (typeof line === 'string' ? line : '').split('|').map((part) => clean(part, 120));
  const label = clean(parts[1], 40);
  if (!label) return undefined;
  const unit = /^s/iu.test(parts[3] ?? '') ? 'seconds' : 'minutes';
  const amount = Number(parts[2]);
  const fallback = unit === 'seconds' ? 60 : 300;
  const seconds = Number.isFinite(amount) && amount > 0 ? Math.round(amount * (unit === 'seconds' ? 1 : 60)) : fallback;
  return {
    enabled: parts[0].toLowerCase() !== 'off', label, key: key(label),
    seconds: Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, seconds)), rewardTitle: clean(parts[4], 100),
    twitchRewardId: clean(parts[5], 100), kickRewardId: clean(parts[6], 100),
  };
}

export function settingsFor(context) {
  const raw = { ...FALLBACKS, ...(context?.settings ?? {}) };
  const timers = [];
  for (const line of (Array.isArray(raw.timers) ? raw.timers : FALLBACKS.timers).slice(0, MAX_TIMERS)) {
    const timer = parseTimer(line);
    if (timer && !timers.some((other) => other.key === timer.key)) timers.push(timer);
  }
  return {
    enabled: raw.enabled === true, timers, repeatMode: choice(raw.repeatMode, ['add', 'restart'], 'add'),
    runMode: choice(raw.runMode, ['queue', 'together'], 'queue'), queuedMessage: clean(raw.queuedMessage, 300) || FALLBACKS.queuedMessage,
    command: command(raw.command),
    announceStart: raw.announceStart !== false, startMessage: clean(raw.startMessage, 300) || FALLBACKS.startMessage,
    announceEnd: raw.announceEnd !== false, endMessage: clean(raw.endMessage, 300) || FALLBACKS.endMessage,
    position: choice(raw.position, POSITIONS, 'top-right'), maxOnScreen: integer(raw.maxOnScreen, 1, MAX_TIMERS, 4),
    showAvatar: raw.showAvatar !== false, accentColor: color(raw.accentColor, FALLBACKS.accentColor),
  };
}

// Saved between restarts: only the running timers and when each one ends. Finished ones are dropped.
export function stateFor(raw, now = Date.now()) {
  const timers = [];
  for (const entry of Array.isArray(raw?.timers) ? raw.timers : []) {
    if (!entry || typeof entry !== 'object') continue;
    const label = clean(entry.label, 40); const endsAt = integer(entry.endsAt, 0, Number.MAX_SAFE_INTEGER, 0);
    if (!label || endsAt <= now || timers.some((other) => other.key === key(label))) continue;
    const startedAt = Math.min(endsAt - 1, integer(entry.startedAt, 0, Number.MAX_SAFE_INTEGER, now));
    timers.push({
      key: key(label), label, startedAt, endsAt, viewer: clean(entry.viewer, 60),
      avatarUrl: https(entry.avatarUrl), platform: PLATFORMS.includes(entry.platform) ? entry.platform : '',
    });
  }
  const queue = [];
  for (const entry of Array.isArray(raw?.queue) ? raw.queue : []) {
    if (!entry || typeof entry !== 'object') continue;
    const label = clean(entry.label, 40); const seconds = integer(entry.seconds, MIN_SECONDS, MAX_REMAINING_MS / 1_000, 0);
    if (!label || !seconds) continue;
    queue.push({ key: key(label), label, seconds, viewer: clean(entry.viewer, 60), avatarUrl: https(entry.avatarUrl), platform: PLATFORMS.includes(entry.platform) ? entry.platform : '' });
  }
  return { timers: timers.slice(0, MAX_TIMERS), queue: queue.slice(0, MAX_QUEUE) };
}

/** One at a time: when nothing is running, the next queued timer starts now. Returns the timers it started. */
export function promote(state, now = Date.now()) {
  const started = [];
  while (state.timers.every((timer) => timer.endsAt <= now) && state.queue.length > 0) {
    const next = state.queue.shift();
    const entry = { key: next.key, label: next.label, startedAt: now, endsAt: now + next.seconds * 1_000, viewer: next.viewer, avatarUrl: next.avatarUrl, platform: next.platform };
    state.timers = [entry];
    started.push(entry);
  }
  return started;
}

/** What the overlay draws. It counts down by itself from each end time. */
export function timersView(settings, state) {
  return {
    moduleId: MODULE_ID, cardKind: 'reward-timers', visible: settings.enabled && state.timers.length > 0,
    position: settings.position, maxOnScreen: settings.maxOnScreen, showAvatar: settings.showAvatar, accentColor: settings.accentColor,
    timers: [...state.timers].sort((left, right) => left.endsAt - right.endsAt).map((timer) => ({
      id: timer.key, label: timer.label, startedAt: timer.startedAt, endsAt: timer.endsAt,
      viewer: timer.viewer, avatarUrl: settings.showAvatar ? timer.avatarUrl : '', platform: timer.platform,
    })),
  };
}

async function publish(context, settings, state) {
  const view = timersView(settings, state);
  // The hide topic also clears the retained copy, so a reloaded OBS source starts empty.
  if (!view.visible) { await context.overlay.publish(`${MODULE_ID}.timers.hide`, {}, { lane: 'persistent' }).catch(() => undefined); return; }
  await context.overlay.publish(`${MODULE_ID}.timers.update`, { ...view, emittedAt: new Date().toISOString() }, { lane: 'persistent' }).catch(() => undefined);
}

async function save(context, state) { await context.state.write(JSON.parse(JSON.stringify(state))); }

async function say(context, platform, message) {
  if (!message || !PLATFORMS.includes(platform)) return;
  await context.chat.send({ message, routing: 'source', sourcePlatform: platform, overflow: 'truncate' }).catch(() => undefined);
}

function serialize(task) { operation = operation.then(task, task); return operation; }

// One timer wakes the Bridge when the next timer ends, to drop it and post the optional end message.
function schedule(state) {
  clearTimeout(expiryTimer); expiryTimer = undefined;
  if (stopped || state.timers.length === 0) return;
  const next = Math.min(...state.timers.map((timer) => timer.endsAt));
  expiryTimer = setTimeout(() => { void serialize(() => expire()); }, Math.min(2_147_000_000, Math.max(0, next - Date.now()) + 50));
}

async function expire() {
  const context = runtime;
  if (stopped || !context) return;
  const settings = settingsFor(context);
  const raw = await context.state.read();
  const before = Array.isArray(raw?.timers) ? raw.timers : [];
  const state = stateFor(raw);
  const ended = before.filter((entry) => entry && typeof entry === 'object' && clean(entry.label, 40) && !state.timers.some((timer) => timer.key === key(entry.label)));
  const promoted = promote(state);
  await save(context, state);
  await publish(context, settings, state);
  schedule(state);
  if (settings.enabled && settings.announceEnd) {
    for (const timer of ended) {
      await say(context, timer.platform, format(settings.endMessage, { name: clean(timer.viewer, 60) || 'Someone', label: clean(timer.label, 40), time: '0:00' }));
    }
  }
  await announceStarted(context, settings, promoted);
}

async function announceStarted(context, settings, entries) {
  if (!settings.enabled || !settings.announceStart) return;
  for (const entry of entries) await say(context, entry.platform, format(settings.startMessage, { name: entry.viewer || 'Someone', label: entry.label, time: formatDuration(entry.endsAt - Date.now()) }));
}

/**
 * Starts a timer, or adds to it (or restarts it) when it is already running. With runMode 'queue', a different timer
 * waits its turn instead of running alongside: the result then has queued: true and how many are ahead of it.
 */
export function applyStart(state, timer, who, mode, now = Date.now(), runMode = 'together') {
  if (!Array.isArray(state.queue)) state.queue = [];
  const ms = timer.seconds * 1_000;
  const running = state.timers.find((entry) => entry.key === timer.key && entry.endsAt > now);
  const person = { viewer: clean(who.viewer, 60), avatarUrl: https(who.avatarUrl), platform: PLATFORMS.includes(who.platform) ? who.platform : '' };
  if (running && mode === 'add') {
    running.endsAt = Math.min(running.endsAt + ms, now + MAX_REMAINING_MS);
    Object.assign(running, person, { label: timer.label });
    return running;
  }
  const busy = state.timers.some((entry) => entry.key !== timer.key && entry.endsAt > now);
  if (runMode === 'queue' && busy) {
    const waiting = state.queue.find((entry) => entry.key === timer.key);
    if (waiting && mode === 'add') {
      waiting.seconds = Math.min(waiting.seconds + timer.seconds, MAX_REMAINING_MS / 1_000);
      return { ...waiting, queued: true, ahead: state.queue.indexOf(waiting) + 1 };
    }
    if (state.queue.length >= MAX_QUEUE) return { key: timer.key, label: timer.label, queued: true, full: true, ahead: state.queue.length };
    const entry = { key: timer.key, label: timer.label, seconds: timer.seconds, ...person };
    state.queue = [...state.queue.filter((other) => other.key !== timer.key), entry];
    return { ...entry, queued: true, ahead: state.queue.length };
  }
  const entry = { key: timer.key, label: timer.label, startedAt: now, endsAt: now + ms, ...person };
  state.timers = [...state.timers.filter((other) => other.key !== timer.key), entry].slice(-MAX_TIMERS);
  return entry;
}

function viewerOf(event) {
  return { viewer: clean(event.user?.displayName || event.user?.name, 60) || 'Someone', avatarUrl: https(event.user?.avatarUrl), platform: event.platform };
}

function isModerator(event) {
  return Array.isArray(event.user?.roles) && event.user.roles.some((role) => ['broadcaster', 'moderator', 'mod'].includes(String(role).toLowerCase()));
}

async function start(context, settings, timer, who, announce = true) {
  const state = stateFor(await context.state.read());
  const entry = applyStart(state, timer, who, settings.repeatMode, Date.now(), settings.runMode);
  await save(context, state);
  await publish(context, settings, state);
  schedule(state);
  if (entry.queued) {
    if (announce && !entry.full) await say(context, who.platform, format(settings.queuedMessage, { name: who.viewer, label: entry.label, time: formatDuration(entry.seconds * 1_000), ahead: String(entry.ahead) }));
    return entry;
  }
  if (announce && settings.announceStart) await say(context, who.platform, format(settings.startMessage, { name: who.viewer, label: entry.label, time: formatDuration(entry.endsAt - Date.now()) }));
  return entry;
}

async function stop(context, settings, label) {
  const state = stateFor(await context.state.read());
  const found = state.timers.find((timer) => timer.key === key(label)) ?? state.queue.find((timer) => timer.key === key(label));
  if (!found) return undefined;
  state.timers = state.timers.filter((timer) => timer !== found);
  state.queue = state.queue.filter((timer) => timer !== found);
  const promoted = promote(state);
  await save(context, state); await publish(context, settings, state); schedule(state);
  await announceStarted(context, settings, promoted);
  return found;
}

async function clear(context, settings) {
  const state = { timers: [], queue: [] };
  await save(context, state); await publish(context, settings, state); schedule(state);
}

/** Reads "!timer <label> start", "!timer <label> stop" or "!timer clear". */
export function parseCommand(args) {
  const words = clean(Array.isArray(args) ? args.join(' ') : args, 200).split(' ').filter(Boolean);
  if (words.length === 1 && words[0].toLowerCase() === 'clear') return { action: 'clear', label: '' };
  const action = (words.at(-1) ?? '').toLowerCase();
  if (words.length < 2 || !['start', 'stop'].includes(action)) return undefined;
  return { action, label: words.slice(0, -1).join(' ') };
}

/** A reward ID set for the redemption's platform wins, so renaming the reward never breaks the timer. The title only
 *  matches timers that have no ID for that platform. */
export function findTimer(settings, event) {
  const id = clean(event?.payload?.rewardId, 100);
  const idOf = (timer) => (event?.platform === 'twitch' ? timer.twitchRewardId : event?.platform === 'kick' ? timer.kickRewardId : '');
  const byId = id ? settings.timers.find((timer) => timer.enabled && idOf(timer) === id) : undefined;
  if (byId) return byId;
  const title = key(clean(event?.payload?.rewardTitle, 100));
  return title ? settings.timers.find((timer) => timer.enabled && !idOf(timer) && timer.rewardTitle && key(timer.rewardTitle) === title) : undefined;
}

async function process(event, context) {
  runtime = context;
  const settings = settingsFor(context);
  if (!settings.enabled || event?.metadata?.simulated === true) return;
  if (event.eventType === 'reward.redemption') {
    if (event.payload?.verifiedTransport !== true) return;
    const timer = findTimer(settings, event);
    if (timer) await start(context, settings, timer, viewerOf(event));
    return;
  }
  if (event.eventType !== 'command.received' || !settings.command || command(event.payload?.command) !== settings.command) return;
  if (!isModerator(event)) return;
  const request = parseCommand(event.payload?.arguments);
  const reply = (message) => say(context, event.platform, message);
  const names = settings.timers.filter((timer) => timer.enabled).map((timer) => timer.label).join(', ') || 'none yet';
  if (!request) { await reply(`Use !${settings.command} <timer> start, !${settings.command} <timer> stop or !${settings.command} clear. Timers: ${names}.`); return; }
  if (request.action === 'clear') { await clear(context, settings); await reply('All timers cleared.'); return; }
  if (request.action === 'stop') { const found = await stop(context, settings, request.label); await reply(found ? `${found.label} stopped.` : `${clean(request.label, 40)} is not running.`); return; }
  const timer = settings.timers.find((candidate) => candidate.enabled && candidate.key === key(request.label));
  if (!timer) { await reply(`No timer called ${clean(request.label, 40)}. Timers: ${names}.`); return; }
  await start(context, settings, timer, viewerOf(event));
}

// Control Panel tab: what is running, with start and stop buttons.
async function timersPanel(request, context) {
  runtime = context;
  const settings = settingsFor(context);
  let message = '';
  if (request?.operation === 'settings-changed') { const state = stateFor(await context.state.read()); await publish(context, settings, state); schedule(state); return {}; }
  if (request?.operation === 'action') {
    const action = clean(request.action, 40); const values = request.values && typeof request.values === 'object' ? request.values : {};
    if (action === 'clear') { await clear(context, settings); message = 'All timers cleared.'; }
    else if (action === 'stop') { const found = await stop(context, settings, clean(values.label, 40)); message = found ? `${found.label} stopped.` : 'That timer is not running.'; }
    else if (action === 'start') {
      if (!settings.enabled) throw new Error('Reward Timers is switched off in its settings.');
      const timer = settings.timers.find((candidate) => candidate.key === key(clean(values.label, 40)));
      if (!timer) throw new Error('That timer is not in your list.');
      const entry = await start(context, settings, timer, { viewer: 'Streamer', avatarUrl: '', platform: '' }, false);
      message = entry.queued ? (entry.full ? 'The queue is full.' : `${entry.label} is queued (${String(entry.ahead)} ahead).`) : `${entry.label}: ${formatDuration(entry.endsAt - Date.now())} left.`;
    } else if (action === 'refresh') { const state = stateFor(await context.state.read()); await publish(context, settings, state); schedule(state); message = 'Overlay refreshed.'; }
    else throw new Error('Unknown Reward Timers control.');
  }
  const state = stateFor(await context.state.read());
  const now = Date.now();
  return {
    ...(message ? { message } : {}),
    ...(settings.enabled ? {} : { notice: 'Reward Timers is switched off in its settings.' }),
    summary: [{ label: 'Running', value: String(state.timers.length) }, { label: 'Waiting', value: String(state.queue.length) }, { label: 'Timers run', value: settings.runMode === 'queue' ? 'One at a time' : 'Together' }, { label: 'When redeemed again', value: settings.repeatMode === 'add' ? 'Add time' : 'Restart' }],
    actions: [{ action: 'clear', label: 'Clear all timers', style: 'danger', confirm: 'Stop every running timer?' }, { action: 'refresh', label: 'Refresh overlay' }],
    lists: [
      { title: 'Running now', empty: 'No timers are running.', items: state.timers.map((timer) => ({
        title: `${timer.label}: ${formatDuration(timer.endsAt - now)} left`, detail: timer.viewer ? `Started by ${timer.viewer}` : '',
        actions: [{ action: 'stop', label: 'Stop', values: { label: timer.label } }],
      })) },
      { title: 'Up next', empty: 'Nothing is waiting.', items: state.queue.map((timer, index) => ({
        title: `${String(index + 1)}. ${timer.label} (${formatDuration(timer.seconds * 1_000)})`, detail: timer.viewer ? `Redeemed by ${timer.viewer}` : '',
        actions: [{ action: 'stop', label: 'Remove', values: { label: timer.label } }],
      })) },
      { title: 'Your timers', empty: 'Add timers under Settings.', items: settings.timers.map((timer) => ({
        title: `${timer.label} (${formatDuration(timer.seconds * 1_000)})`, detail: timer.twitchRewardId || timer.kickRewardId ? `Reward: ${timer.rewardTitle || 'linked by ID'}${timer.twitchRewardId ? ' · Twitch ID set' : ''}${timer.kickRewardId ? ' · Kick ID set' : ''}` : timer.rewardTitle ? `Reward: ${timer.rewardTitle}` : 'No reward yet',
        actions: [{ action: 'start', label: 'Start', values: { label: timer.label } }],
      })) },
    ],
  };
}

export { manifest };

export default {
  manifest, required: false,
  async start(context) {
    stopped = false; operation = Promise.resolve(); runtime = context;
    const settings = settingsFor(context);
    const state = stateFor(await context.state.read());
    const promoted = settings.enabled ? promote(state) : [];
    await save(context, state);
    await publish(context, settings, state);
    if (settings.enabled) schedule(state);
    await announceStarted(context, settings, promoted);
  },
  async stop() { stopped = true; clearTimeout(expiryTimer); expiryTimer = undefined; await operation; runtime = undefined; },
  async onEvent(event, context) { if (!stopped) await serialize(() => process(event, context)); },
  async controlPanel(request, context) { const task = () => timersPanel(request, context); const pending = operation.then(task, task); operation = pending.catch(() => undefined); return pending; },
};
