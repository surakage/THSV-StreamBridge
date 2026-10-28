// Scene Gates keeps chosen Streamer.bot commands and Twitch rewards usable only on the scenes you
// pick. On every scene change it works out which gates are open, then sends only the changes to one
// triggerless Streamer.bot action that turns commands and rewards on or off (rewards are hidden,
// not paused) and stores each gate's state in a Streamer.bot global variable. Kick rewards cannot
// be turned off by Streamer.bot, so the "THSV Scene Gate - Check" action reads that variable and
// stops a Kick (or any other) action on the wrong scene. When the stream ends every gate opens again.
const APPLY_ACTION_ID = 'e20376a0-075c-4608-a95a-401be65074ed';
const CHECK_ACTION_ID = 'b3ddf6ba-9f63-46d1-bb10-7b6c2c3440fe';
const KINDS = Object.freeze(['command', 'twitch-reward', 'check-only']);
const LIVE_PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok', 'facebook']);
const COMMAND_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const ROLE_TOKEN = /^role:\s*(starting|live|chatting|break|ending)$/iu;
// Leading emoji, symbols, variation selectors and joiners that creators put before scene names ("🔴 BRB").
const LEADING_DECORATION = /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji_Modifier}|\u{FE0F}|\u{200D}|\u{20E3}|\s)+/u;
const MAXIMUM_GATES = 40;
const MAXIMUM_SCENES_PER_GATE = 20;
const RETRY_DELAY_MS = 15_000;
const START_DELAY_MS = 5_000;
const DEFAULT_MESSAGE = 'That only works during {scenes}.';

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: 'thsv.scene-gates', name: 'Scene Gates', version: '4.0.58',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.58', maximumTestedBridgeVersion: '4.0.58', dependencies: [], requiredCapabilities: [],
  configurationSchema: 'schemas/config.json', eventSubscriptions: ['stream.scene-changed', 'stream.online', 'stream.offline'], commandsProvided: [],
  actionsProvided: [{ id: 'scene-gates.apply', name: 'THSV Scene Gate - Apply' }, { id: 'scene-gates.check', name: 'THSV Scene Gate - Check' }], browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.scene-gates/', 'data/addons/.state/thsv.scene-gates/'],
  installationSteps: [
    'Import the Scene Gates Streamer.bot package. Keep THSV Scene Gate - Apply and THSV Scene Gate - Check triggerless, and approve Apply for Scene Gates in the wizard.',
    'Add one gate per Streamer.bot command or Twitch reward: pick the command (or paste the Twitch reward ID) and list the scenes where it may be used, such as role:live or an exact scene name.',
    'For Kick rewards and commands, add a Check only gate and put Set Argument gateId plus Run Action THSV Scene Gate - Check at the top of the Kick action.',
    'Enable Scene Gates and restart StreamBridge.',
  ],
  uninstallationSteps: ['Turn Scene Gates off and restart StreamBridge before removing it, so every gated command and reward is turned back on.'],
  migrations: [],
  healthChecks: [{ id: 'thsv.scene-gates.runtime', description: 'Confirms gates follow scene changes, send only changes to Streamer.bot, and open again when the stream ends.' }],
};

const FALLBACKS = Object.freeze({ enabled: false, onlyWhileLive: true, defaultMessage: DEFAULT_MESSAGE, gates: [] });

function clean(value, maximum = 256) {
  const normalized = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '';
  return [...normalized].slice(0, maximum).join('');
}

/** The gate ID used by THSV Scene Gate - Check and the Streamer.bot global "thsvGate.<id>". */
export function gateIdFor(label) {
  return clean(label, 80).toLocaleLowerCase('en-US').normalize('NFKD').replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 40).replace(/-+$/u, '');
}

function kindOf(value) {
  const text = clean(value, 40).toLowerCase().replace(/[\s_]+/gu, '-');
  if (KINDS.includes(text)) return text;
  if (['reward', 'twitch', 'twitch-channel-reward', 'channel-reward'].includes(text)) return 'twitch-reward';
  if (['check', 'kick', 'check-only-kick', 'other', 'variable'].includes(text)) return 'check-only';
  if (text === '' || text === 'cmd' || text === 'streamer-bot-command') return 'command';
  return '';
}

/** One gate per row: On | Name | Type | Command or Twitch reward ID | Allowed scenes | Wrong-scene message. */
export function parseGate(line) {
  if (typeof line !== 'string') return undefined;
  const parts = line.split('|').map((part) => clean(part, 300));
  const label = clean(parts[1], 60); const id = gateIdFor(label); const kind = kindOf(parts[2]);
  if (!id || !kind) return undefined;
  const target = kind === 'check-only' ? '' : clean(parts[3], 256);
  if (kind === 'command' && !COMMAND_ID.test(target)) return undefined;
  if (kind === 'twitch-reward' && target === '') return undefined;
  const scenes = [...new Set(clean(parts[4], 2000).split(',').map((scene) => clean(scene, 200)).filter(Boolean))].slice(0, MAXIMUM_SCENES_PER_GATE);
  if (scenes.length === 0) return undefined;
  return { id, label, enabled: !/^(off|no|false|0|disabled?)$/iu.test(clean(parts[0], 20)), kind, target: kind === 'command' ? target.toLowerCase() : target, scenes, message: clean(parts[5], 300) };
}

export function settingsFor(context) {
  const raw = { ...FALLBACKS, ...(context?.settings ?? {}) };
  const gates = []; const ids = new Set(); const targets = new Set();
  for (const line of (Array.isArray(raw.gates) ? raw.gates : []).slice(0, MAXIMUM_GATES)) {
    const gate = parseGate(line);
    if (!gate || ids.has(gate.id)) continue;
    const targetKey = gate.kind === 'check-only' ? '' : `${gate.kind}|${gate.target.toLowerCase()}`;
    if (targetKey && targets.has(targetKey)) continue;
    ids.add(gate.id); if (targetKey) targets.add(targetKey);
    gates.push(gate);
  }
  return { enabled: raw.enabled === true, onlyWhileLive: raw.onlyWhileLive !== false, defaultMessage: typeof raw.defaultMessage === 'string' ? clean(raw.defaultMessage, 300) : DEFAULT_MESSAGE, gates };
}

/**
 * Whether an observed scene is the saved one, the same way scene roles compare: case-insensitive,
 * ignoring surrounding spaces. A saved name without a leading emoji matches any decorated variant
 * ("Gameplay" matches "🔴 Gameplay"); a saved name with one only matches that exact emoji.
 */
export function sceneNamesMatch(saved, observed) {
  const savedName = clean(saved, 200); const observedName = clean(observed, 200);
  if (savedName === '' || observedName === '') return false;
  if (LEADING_DECORATION.test(savedName)) return savedName.toLocaleLowerCase('en-US') === observedName.toLocaleLowerCase('en-US');
  const key = (name) => (name.replace(LEADING_DECORATION, '') || name).toLocaleLowerCase('en-US');
  return key(savedName) === key(observedName);
}

function resolveScene(entry, scenes) {
  if (!ROLE_TOKEN.test(entry)) return entry;
  try { return typeof scenes?.resolve === 'function' ? clean(scenes.resolve(entry), 200) : ''; } catch { return ''; }
}

/** Whether the gate is open on this scene. "role:live" style entries follow the scenes picked under Scene roles. */
export function gateAllowed(gate, sceneName, scenes) {
  return gate.scenes.some((entry) => {
    const role = ROLE_TOKEN.exec(entry)?.[1]?.toLowerCase();
    if (role !== undefined) {
      try { if (typeof scenes?.roleOf === 'function' && scenes.roleOf(sceneName) === role) return true; } catch { /* fall back to the resolved name */ }
    }
    return sceneNamesMatch(resolveScene(entry, scenes), sceneName);
  });
}

function displayScene(name) { const text = clean(name, 200); return text.replace(LEADING_DECORATION, '') || text; }
function joinNames(names) { return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`; }

/** The allowed scenes as viewers should read them ("Just Chatting or Gameplay"). Unmapped roles are left out. */
export function allowedScenesText(gate, scenes) {
  const names = [];
  for (const entry of gate.scenes) {
    const name = displayScene(resolveScene(entry, scenes));
    if (name && !names.some((existing) => existing.toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US'))) names.push(name);
  }
  return joinNames(names) || 'another scene';
}

export function messageFor(gate, settings, scenes) {
  const template = gate.message || settings.defaultMessage;
  return clean(template.replaceAll('{scenes}', allowedScenesText(gate, scenes)).replaceAll('{name}', gate.label), 300);
}

/** What every enabled gate should be on this scene, or with every gate open when sceneName is undefined. */
export function desiredGates(settings, sceneName, scenes) {
  const desired = {};
  for (const gate of settings.gates) {
    if (!gate.enabled) continue;
    desired[gate.id] = { kind: gate.kind, target: gate.target, allowed: sceneName === undefined ? true : gateAllowed(gate, sceneName, scenes), message: messageFor(gate, settings, scenes) };
  }
  return desired;
}

function sameEntry(left, right) { return left.kind === right.kind && left.target === right.target && left.allowed === right.allowed && left.message === right.message; }

/**
 * Compares what Streamer.bot was last told with what it should be now. Returns only the changes,
 * plus the record to keep once they are applied. A gate that was removed, turned off or pointed at a
 * different command while it was closed is opened again first, so nothing stays switched off.
 */
export function diffGates(applied, desired) {
  const changes = []; const next = {};
  for (const [id, previous] of Object.entries(applied ?? {})) {
    const wanted = desired[id];
    const retargeted = wanted !== undefined && (wanted.kind !== previous.kind || wanted.target !== previous.target);
    if ((wanted === undefined || retargeted) && previous.allowed === false) changes.push({ gate: id, kind: previous.kind, target: previous.target, allowed: true, message: previous.message });
  }
  for (const [id, wanted] of Object.entries(desired)) {
    const previous = applied?.[id];
    if (previous === undefined || !sameEntry(previous, wanted)) changes.push({ gate: id, ...wanted });
    next[id] = { ...wanted };
  }
  return { changes, next };
}

function sanitizeApplied(value) {
  const applied = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return applied;
  for (const [id, entry] of Object.entries(value).slice(0, MAXIMUM_GATES * 2)) {
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/u.test(id) || !entry || typeof entry !== 'object' || !KINDS.includes(entry.kind) || typeof entry.allowed !== 'boolean') continue;
    applied[id] = { kind: entry.kind, target: clean(entry.target, 256), allowed: entry.allowed, message: clean(entry.message, 300) };
  }
  return applied;
}

export function sanitizeState(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    applied: sanitizeApplied(source.applied),
    livePlatforms: Array.isArray(source.livePlatforms) ? [...new Set(source.livePlatforms.filter((platform) => LIVE_PLATFORMS.includes(platform)))] : [],
    sceneName: clean(source.sceneName, 200),
  };
}

// One runtime per add-on context: saved state, the work queue and the retry timer.
const runtimes = new WeakMap();
function runtimeFor(context) {
  const key = context?.state ?? context;
  let runtime = runtimes.get(key);
  if (!runtime) { runtime = { loaded: undefined, state: sanitizeState({}), queue: Promise.resolve(), retryTaskId: '' }; runtimes.set(key, runtime); }
  return runtime;
}
async function load(context, runtime) {
  if (!runtime.loaded) runtime.loaded = (async () => { try { runtime.state = sanitizeState(await context.state.read()); } catch { runtime.state = sanitizeState({}); } })();
  await runtime.loaded;
}
async function save(context, runtime) {
  const { applied, livePlatforms, sceneName } = runtime.state;
  try { await context.state.write({ applied, livePlatforms, sceneName }); } catch { /* State is a convenience; Streamer.bot already has the change. */ }
}
function enqueue(runtime, task) {
  const run = runtime.queue.then(task, task);
  runtime.queue = run.catch(() => undefined);
  return run;
}

function gatingActive(settings, state) { return settings.enabled && state.sceneName !== '' && (!settings.onlyWhileLive || state.livePlatforms.length > 0); }

async function reconcile(context, runtime, reason) {
  const settings = settingsFor(context); const state = runtime.state;
  const desired = settings.enabled ? desiredGates(settings, gatingActive(settings, state) ? state.sceneName : undefined, context.scenes) : {};
  const { changes, next } = diffGates(state.applied, desired);
  if (changes.length === 0) { if (!settings.enabled && Object.keys(state.applied).length) { state.applied = {}; await save(context, runtime); } return; }
  try {
    await context.streamerbot.runApprovedAction(APPLY_ACTION_ID, { sceneGateChanges: JSON.stringify(changes), sceneGateScene: state.sceneName, sceneGateReason: reason });
  } catch {
    // Streamer.bot is closed, the action is not approved yet, or the broker is busy. Try again shortly.
    scheduleRetry(context, runtime);
    return;
  }
  state.applied = next;
  await save(context, runtime);
}

function scheduleRetry(context, runtime) {
  if (runtime.retryTaskId || typeof context.schedule?.after !== 'function') return;
  try {
    runtime.retryTaskId = context.schedule.after(RETRY_DELAY_MS, async () => { runtime.retryTaskId = ''; await enqueue(runtime, () => reconcile(context, runtime, 'retry')); });
  } catch { runtime.retryTaskId = ''; }
}

const module = {
  manifest, required: false,
  async start(context) {
    const runtime = runtimeFor(context);
    // Settings only change with a restart. Shortly after start, catch up: re-open gates that were
    // removed or turned off, open everything while offline, or apply the saved scene mid-stream.
    try { context.schedule.after(START_DELAY_MS, () => enqueue(runtime, async () => { await load(context, runtime); await reconcile(context, runtime, 'start'); })); } catch { /* Catch up on the next event instead. */ }
  },
  async stop(context) {
    const runtime = runtimeFor(context);
    if (runtime.retryTaskId) { try { context.schedule.cancel(runtime.retryTaskId); } catch { /* already gone */ } runtime.retryTaskId = ''; }
  },
  async onEvent(event, context) {
    const type = event?.eventType;
    if (!['stream.scene-changed', 'stream.online', 'stream.offline'].includes(type) || event.metadata?.simulated === true) return;
    const runtime = runtimeFor(context);
    await enqueue(runtime, async () => {
      await load(context, runtime);
      const state = runtime.state;
      if (type === 'stream.scene-changed') {
        // Nesting scenes ("🟠 Gameplay") never reach add-ons: StreamBridge filters them out first.
        const sceneName = clean(event.payload?.sceneName, 200);
        if (sceneName === '') return;
        state.sceneName = sceneName;
      } else {
        const platform = LIVE_PLATFORMS.includes(event.platform) ? event.platform : '';
        if (!platform) return;
        const live = new Set(state.livePlatforms);
        if (type === 'stream.online') live.add(platform); else live.delete(platform);
        state.livePlatforms = [...live];
      }
      const before = JSON.stringify(state.applied);
      await reconcile(context, runtime, type === 'stream.offline' ? 'offline' : type === 'stream.online' ? 'online' : 'scene');
      if (JSON.stringify(state.applied) === before) await save(context, runtime);
    });
  },
};

export { APPLY_ACTION_ID, CHECK_ACTION_ID, DEFAULT_MESSAGE, FALLBACKS, manifest };
export default module;
