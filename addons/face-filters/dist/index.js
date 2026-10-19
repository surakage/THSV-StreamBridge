// Face Filters turns viewer commands and channel point redemptions into Streamfog face lenses.
// Streamfog has no C# API and no "lens ended" trigger, so StreamBridge owns the queue and timing:
// one lens at a time, each for a bounded duration that Streamfog itself also enforces.
const MODULE_ID = 'thsv.face-filters';
const ACTIVATE_ACTION_ID = '5b0f3c2e-7a1d-4e8b-9c64-2f1a8d7e3b51';
const LIVE_PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok', 'facebook']);
const COMMAND_PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok']);
const FALLBACKS = Object.freeze({
  enabled: false,
  lenses: ['Banana | Banana | !banana | | 30', 'Sloth | Sloth | !sloth | | 30', 'Female | Female | !female | | 30', 'Mystery | Mystery | !mystery | | 30'],
  filterCommand: 'filter', allowRandom: true, commandPlatforms: ['twitch', 'youtube', 'kick', 'tiktok'], commandRole: 'viewer',
  defaultDurationSeconds: 30, gapSeconds: 2, globalCooldownSeconds: 20, viewerCooldownSeconds: 120, maximumQueue: 5, onlyWhileLive: true,
  chatReplies: true, startedMessage: '{viewer} put the {lens} filter on for {seconds}s!', queuedMessage: '{viewer}, {lens} is queued (#{position}).',
  cooldownMessage: '{viewer}, face filters are cooling down. Try again in {seconds}s.', unknownMessage: 'Face filters: {list}. Use !{command} <name>{random}.',
});

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Face Filters', version: '4.0.27',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.27', maximumTestedBridgeVersion: '4.0.27',
  dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: ['command.received', 'reward.redemption', 'stream.online', 'stream.offline'],
  commandsProvided: [{ id: 'face-filters.filter', name: 'filter' }],
  actionsProvided: [{ id: 'face-filters.activate', name: 'THSV Extension - Face Filters - Activate Lens' }], browserSourcesProvided: [],
  dataStorageOwned: [`data/addons/${MODULE_ID}/`, `data/addons/.state/${MODULE_ID}/`],
  installationSteps: [
    'Install Streamfog, sign in, and connect it in Streamer.bot under Integrations > StreamFog (Remote Key, Auto Connect, Auto Reconnect).',
    'In OBS, set your face-camera source to the Streamfog virtual camera instead of the physical camera.',
    'Import the Face Filters Streamer.bot package, approve only Activate Lens in the wizard, and leave it triggerless.',
    'List each lens as: Label | exact Streamfog lens name | !command | channel point reward title | seconds. Leave a column empty to skip it.',
    'Enable the extension, restart StreamBridge, and use the wizard test to confirm one lens appears on camera.',
  ],
  uninstallationSteps: ['Disable the extension. Streamfog ends any active lens when its duration runs out.'], migrations: [],
  healthChecks: [{ id: `${MODULE_ID}.runtime`, description: 'Confirms bounded lens parsing, cooldowns, a single serialized lens queue, and approved Streamfog dispatch.' }],
};

let stopped = true;
let operation = Promise.resolve();
let advanceTimer;
let activeUntil = 0;
let lastStartedAt = 0;
let epoch = 0;
const queue = [];
const viewerCooldowns = new Map();
const livePlatforms = new Set();

function clean(value, maximum = 160) { return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '')].slice(0, maximum).join(''); }
function integer(value, minimum, maximum, fallback) { const parsed = typeof value === 'number' ? value : Number(value); return Number.isSafeInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback; }
function command(value) { const match = clean(value, 65).toLowerCase().match(/^!?([a-z0-9][a-z0-9-]{0,63})$/u); return match ? match[1] : ''; }
function key(value) { return clean(value, 80).toLowerCase(); }
function format(template, values) { let result = clean(template, 300); for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, [...String(value).replace(/[\u0000-\u001f\u007f]/gu, ' ')].slice(0, 200).join('')); return clean(result, 400); }

// One lens per line: Label | Streamfog lens name | !command | channel point reward title | seconds.
function parseLens(line, defaultSeconds) {
  const parts = clean(line, 400).split('|').map((part) => clean(part, 120));
  const label = clean(parts[0], 40); const lensName = clean(parts[1], 100) || label;
  if (!label || !lensName) return undefined;
  const seconds = parts[4] ? integer(Number.parseInt(parts[4], 10), 5, 600, defaultSeconds) : defaultSeconds;
  return { label, lensName, command: command(parts[2]), reward: clean(parts[3], 100), seconds };
}
function settingsFor(context) {
  const raw = context.settings ?? {};
  const defaultDurationSeconds = integer(raw.defaultDurationSeconds, 5, 600, FALLBACKS.defaultDurationSeconds);
  const seen = new Set(); const lenses = [];
  for (const line of (Array.isArray(raw.lenses) ? raw.lenses : FALLBACKS.lenses).slice(0, 25)) {
    const lens = parseLens(line, defaultDurationSeconds); if (!lens || seen.has(key(lens.label))) continue;
    seen.add(key(lens.label)); lenses.push(lens);
  }
  const platforms = Array.isArray(raw.commandPlatforms) ? raw.commandPlatforms.filter((value) => COMMAND_PLATFORMS.includes(value)) : FALLBACKS.commandPlatforms;
  return {
    enabled: raw.enabled === true, lenses, filterCommand: command(raw.filterCommand ?? FALLBACKS.filterCommand), allowRandom: raw.allowRandom !== false,
    commandPlatforms: new Set(platforms), commandRole: ['viewer', 'subscriber', 'moderator', 'broadcaster'].includes(raw.commandRole) ? raw.commandRole : FALLBACKS.commandRole,
    defaultDurationSeconds, gapSeconds: integer(raw.gapSeconds, 0, 30, FALLBACKS.gapSeconds),
    globalCooldownSeconds: integer(raw.globalCooldownSeconds, 0, 3600, FALLBACKS.globalCooldownSeconds), viewerCooldownSeconds: integer(raw.viewerCooldownSeconds, 0, 3600, FALLBACKS.viewerCooldownSeconds),
    maximumQueue: integer(raw.maximumQueue, 0, 20, FALLBACKS.maximumQueue), onlyWhileLive: raw.onlyWhileLive !== false, chatReplies: raw.chatReplies !== false,
    startedMessage: clean(raw.startedMessage, 300) || FALLBACKS.startedMessage, queuedMessage: clean(raw.queuedMessage, 300) || FALLBACKS.queuedMessage,
    cooldownMessage: clean(raw.cooldownMessage, 300) || FALLBACKS.cooldownMessage, unknownMessage: clean(raw.unknownMessage, 300) || FALLBACKS.unknownMessage,
  };
}

function viewerName(event) { return clean(event.user?.displayName || event.user?.name, 60) || 'Someone'; }
function viewerKey(event) { const id = clean(event.user?.id, 240); return id ? `${event.platform}:${id}` : ''; }
function isModerator(event) { return Array.isArray(event.user?.roles) && event.user.roles.some((role) => ['broadcaster', 'moderator', 'mod'].includes(String(role).toLowerCase())); }
function serialize(task) { operation = operation.then(task, task); return operation; }
function cancelAdvance(context) { if (advanceTimer !== undefined) context.schedule.cancel(advanceTimer); advanceTimer = undefined; }
async function reply(context, settings, event, template, values) {
  if (!settings.chatReplies || !event.platform || !LIVE_PLATFORMS.includes(event.platform)) return;
  await context.chat.send({ message: format(template, values), routing: 'source', sourcePlatform: event.platform, overflow: 'truncate' }).catch(() => undefined);
}

// Resolves a request to { lens, viewer, paid } or a reason it was not accepted.
function resolveRequest(event, settings) {
  if (event.eventType === 'reward.redemption') {
    if (event.payload?.verifiedTransport !== true) return undefined;
    const title = key(event.payload?.rewardTitle); const id = clean(event.payload?.rewardId, 256);
    const lens = settings.lenses.find((candidate) => candidate.reward && (key(candidate.reward) === title || candidate.reward === id));
    return lens ? { lens, paid: true } : undefined;
  }
  if (event.eventType !== 'command.received' || !settings.commandPlatforms.has(event.platform)) return undefined;
  const name = command(event.payload?.command); if (!name) return undefined;
  const direct = settings.lenses.find((candidate) => candidate.command === name);
  if (direct) return { lens: direct, paid: false };
  if (name !== settings.filterCommand) return undefined;
  const argument = key(Array.isArray(event.payload?.arguments) ? event.payload.arguments.join(' ') : event.payload?.arguments);
  if (argument === 'random' && settings.allowRandom && settings.lenses.length > 0) return { lens: settings.lenses[Math.floor(Math.random() * settings.lenses.length)], paid: false };
  const named = argument ? settings.lenses.find((candidate) => key(candidate.label) === argument || key(candidate.lensName) === argument || candidate.command === command(argument)) : undefined;
  return named ? { lens: named, paid: false } : { list: true };
}

async function activate(context, settings, request) {
  const now = Date.now(); lastStartedAt = now; activeUntil = now + request.lens.seconds * 1000;
  try { await context.streamerbot.runApprovedAction(ACTIVATE_ACTION_ID, { faceFilterLensName: request.lens.lensName, faceFilterDuration: String(request.lens.seconds) }); }
  catch { activeUntil = now; }
  await reply(context, settings, request.event, settings.startedMessage, { viewer: request.viewer, lens: request.lens.label, seconds: request.lens.seconds });
}
function armAdvance(context) {
  cancelAdvance(context); if (stopped || queue.length === 0) return;
  const settings = settingsFor(context); const expectedEpoch = epoch;
  const delay = Math.max(250, activeUntil + settings.gapSeconds * 1000 - Date.now());
  advanceTimer = context.schedule.after(delay, () => serialize(async () => {
    advanceTimer = undefined; if (stopped || expectedEpoch !== epoch) return;
    const next = queue.shift(); if (next === undefined) return;
    await activate(context, settingsFor(context), next); armAdvance(context);
  }));
}

async function process(event, context) {
  const settings = settingsFor(context); if (!settings.enabled) return;
  if ((event.eventType === 'stream.online' || event.eventType === 'stream.offline') && event.metadata?.simulated !== true && LIVE_PLATFORMS.includes(event.platform)) {
    if (event.eventType === 'stream.online') livePlatforms.add(event.platform); else livePlatforms.delete(event.platform);
    if (livePlatforms.size === 0) { epoch += 1; queue.length = 0; cancelAdvance(context); viewerCooldowns.clear(); }
    return;
  }
  if (event.metadata?.simulated === true) return;
  const request = resolveRequest(event, settings); if (request === undefined) return;
  const viewer = viewerName(event); const values = { viewer, command: settings.filterCommand || 'filter', random: settings.allowRandom ? ' or random' : '' };
  if (request.list) { await reply(context, settings, event, settings.unknownMessage, { ...values, list: settings.lenses.map((lens) => lens.command ? `!${lens.command}` : lens.label).join(', ') || 'none yet' }); return; }
  // A verified redemption proves the platform is live even when StreamBridge started mid-stream.
  if (request.paid) livePlatforms.add(event.platform);
  // Moderators and the broadcaster can test lenses while offline.
  if (settings.onlyWhileLive && !livePlatforms.has(event.platform) && !isModerator(event)) return;
  const now = Date.now(); const id = viewerKey(event);
  // Paid channel point redemptions and moderators skip cooldowns; everyone still shares one queue.
  if (!request.paid && !isModerator(event)) {
    const globalWait = lastStartedAt + settings.globalCooldownSeconds * 1000 - now;
    const viewerWait = id ? (viewerCooldowns.get(id) ?? 0) + settings.viewerCooldownSeconds * 1000 - now : 0;
    const wait = Math.max(globalWait, viewerWait);
    if (wait > 0) { await reply(context, settings, event, settings.cooldownMessage, { ...values, seconds: Math.ceil(wait / 1000) }); return; }
  }
  if (id) { viewerCooldowns.set(id, now); if (viewerCooldowns.size > 500) viewerCooldowns.delete(viewerCooldowns.keys().next().value); }
  const entry = { lens: request.lens, viewer, event: { platform: event.platform } };
  if (now < activeUntil + settings.gapSeconds * 1000 || queue.length > 0) {
    if (queue.length >= settings.maximumQueue) { await reply(context, settings, event, settings.cooldownMessage, { ...values, seconds: Math.ceil((activeUntil - now) / 1000) + settings.gapSeconds }); return; }
    queue.push(entry); await reply(context, settings, event, settings.queuedMessage, { ...values, lens: request.lens.label, position: queue.length }); armAdvance(context); return;
  }
  await activate(context, settings, entry);
}

export default {
  manifest, required: false,
  async start() { stopped = false; operation = Promise.resolve(); epoch += 1; queue.length = 0; activeUntil = 0; lastStartedAt = 0; viewerCooldowns.clear(); livePlatforms.clear(); },
  async stop(context) { stopped = true; epoch += 1; cancelAdvance(context); queue.length = 0; livePlatforms.clear(); viewerCooldowns.clear(); await operation.catch(() => undefined); operation = Promise.resolve(); },
  async onEvent(event, context) { if (!stopped) await serialize(() => process(event, context)); },
};

export { ACTIVATE_ACTION_ID, FALLBACKS, manifest, parseLens, settingsFor };
