// Random Sound: point it at a folder of sounds on this PC, and each trigger plays one of them at random. A
// folder can have its own chat command (for example !fart) and Twitch or Kick channel point reward, and a
// Control Panel button. By default every sound in a folder plays once before any repeats. Sounds play on one
// invisible browser page (/overlay/addons/thsv.random-sound), so they work in OBS, SprigCast, Streamlabs and Meld.
// New files dropped into a folder are picked up by themselves. Ships empty. No Streamer.bot import is needed.
const MODULE_ID = 'thsv.random-sound';
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok', 'facebook']);
const ACCESS = Object.freeze(['everyone', 'subscribers', 'vips', 'moderators']);
const LISTING_TTL_MS = 15_000;
const FALLBACKS = Object.freeze({
  enabled: false, folders: [], volume: 80, noRepeats: true, letSoundsOverlap: false, maximumAtOnce: 3, longestSoundSeconds: 30,
  commandPlatforms: ['twitch', 'youtube', 'kick', 'tiktok', 'facebook'], commandAccess: 'everyone',
  globalCooldownSeconds: 5, viewerCooldownSeconds: 30, playedMessage: '', cooldownMessage: '', stopCommand: '',
});

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Random Sound', version: '4.1.163',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.1.163', maximumTestedBridgeVersion: '4.1.163',
  dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: ['reward.redemption', 'chat.message'],
  commandsProvided: [], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: [`data/addons/${MODULE_ID}/`, `data/addons/.state/${MODULE_ID}/`],
  installationSteps: [
    'Put your sounds (MP3, WAV, OGG, OPUS, FLAC, M4A or WEBM) in a folder on this PC.',
    'Add a row: a name, the full path of the folder, and optionally a chat command or a Twitch or Kick channel point reward ID.',
    'Add http://127.0.0.1:8787/overlay/addons/thsv.random-sound as a browser source in each scene where sounds should be heard. Add it on one canvas only, so each sound is heard once.',
    'Enable the extension and restart StreamBridge. The Control Panel shows how many sounds each folder has.',
  ],
  uninstallationSteps: ['Disable the extension and remove its browser source. Your sound folders are never changed.'], migrations: [],
  healthChecks: [{ id: `${MODULE_ID}.runtime`, description: 'Checks folder matching for commands and rewards, fair random picks without repeats, and cooldowns.' }],
};

let stopped = true;
let lastPlayedAt = 0;
let playCount = 0;
const viewerCooldowns = new Map();
const listings = new Map();
const bags = new Map();
const lastPlayed = new Map();

function clean(value, maximum = 160) { return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '')].slice(0, maximum).join(''); }
function integer(value, minimum, maximum, fallback) { const number = Number(value); return Number.isFinite(number) && value !== '' && value !== null ? Math.min(maximum, Math.max(minimum, Math.round(number))) : fallback; }
function command(value) { return clean(value, 40).replace(/^!+/u, '').toLowerCase().replace(/\s+/gu, ''); }
function format(template, values) { return clean(template, 500).replace(/\{(viewer|sound|folder|seconds)\}/gu, (_, name) => String(values[name] ?? '')); }
function soundName(file) { return clean(String(file ?? '').replace(/\.[^.]+$/u, '').replace(/[_]+/gu, ' '), 80); }

/** One row of the folders list: "Name | Folder | Volume | Command | Twitch reward ID | Kick reward ID". */
export function parseFolder(line, index) {
  const cells = String(line ?? '').split('|').map((cell) => cell.trim());
  const name = clean(cells[0], 60);
  const folder = clean(cells[1], 400).replace(/^"(.*)"$/u, '$1');
  if (!name || !folder) return undefined;
  return { id: `folder-${String(index + 1)}`, name, folder, volume: integer(cells[2], 0, 100, 100), command: command(cells[3]), twitchRewardId: clean(cells[4], 256), kickRewardId: clean(cells[5], 256) };
}

export function settingsFor(context) {
  const raw = { ...FALLBACKS, ...(context?.settings ?? {}) };
  return {
    enabled: raw.enabled === true,
    folders: (Array.isArray(raw.folders) ? raw.folders : []).slice(0, 20).map(parseFolder).filter(Boolean),
    volume: integer(raw.volume, 0, 100, 80), noRepeats: raw.noRepeats !== false, letSoundsOverlap: raw.letSoundsOverlap === true,
    maximumAtOnce: integer(raw.maximumAtOnce, 1, 10, 3), longestSoundSeconds: integer(raw.longestSoundSeconds, 1, 600, 30),
    commandPlatforms: new Set((Array.isArray(raw.commandPlatforms) ? raw.commandPlatforms : []).filter((platform) => PLATFORMS.includes(platform))),
    commandAccess: ACCESS.includes(raw.commandAccess) ? raw.commandAccess : 'everyone',
    globalCooldownSeconds: integer(raw.globalCooldownSeconds, 0, 3600, 5), viewerCooldownSeconds: integer(raw.viewerCooldownSeconds, 0, 3600, 30),
    playedMessage: clean(raw.playedMessage, 300), cooldownMessage: clean(raw.cooldownMessage, 300), stopCommand: command(raw.stopCommand),
  };
}

function roles(event) { return new Set((Array.isArray(event?.user?.roles) ? event.user.roles : []).map((role) => String(role).toLowerCase())); }
function isModerator(event) { const set = roles(event); return set.has('broadcaster') || set.has('moderator') || set.has('mod'); }
/** Whether this viewer may play sounds by chat command. The streamer and moderators always can. */
export function mayUse(event, access) {
  const set = roles(event);
  if (isModerator(event) || access === 'everyone') return true;
  if (access === 'vips') return set.has('vip');
  if (access === 'subscribers') return set.has('subscriber') || set.has('vip') || set.has('member');
  return false;
}

/** The chat command in a message ("!fart please" gives "fart"), or '' when the message is not a command. */
export function chatCommand(event) {
  const message = typeof event?.payload?.message === 'string' ? event.payload.message.trim() : '';
  const match = /^!([^\s!]{1,40})/u.exec(message);
  return match ? command(match[1]) : '';
}

/** What an event asks for: { folder, paid }, { stop: true }, or undefined. */
export function resolveRequest(event, settings) {
  if (event?.eventType === 'reward.redemption') {
    if (event.payload?.verifiedTransport !== true) return undefined;
    const id = clean(event.payload?.rewardId, 256);
    if (!id) return undefined;
    const platform = event.payload?.pointsReward === true ? 'twitch' : event.platform;
    const folder = settings.folders.find((entry) => (platform === 'twitch' ? entry.twitchRewardId : platform === 'kick' ? entry.kickRewardId : '') === id);
    return folder ? { folder, paid: true } : undefined;
  }
  if (event?.eventType !== 'chat.message' || !settings.commandPlatforms.has(event.platform)) return undefined;
  if (event.user?.actorType && event.user.actorType !== 'human') return undefined;
  const name = chatCommand(event);
  if (!name) return undefined;
  if (settings.stopCommand && name === settings.stopCommand) return isModerator(event) ? { stop: true } : undefined;
  const folder = settings.folders.find((entry) => entry.command === name);
  return folder ? { folder, paid: false } : undefined;
}

/** The sounds in a folder, read again at most every 15 seconds so new files show up by themselves. */
async function listing(context, folder, fresh = false) {
  const cached = listings.get(folder.folder);
  if (!fresh && cached && Date.now() - cached.at < LISTING_TTL_MS) return cached;
  let entry;
  try { const result = await context.audioFolder.list(folder.folder); entry = { at: Date.now(), files: result.files, skipped: result.skipped, error: '' }; }
  catch (error) { entry = { at: Date.now(), files: [], skipped: 0, error: error instanceof Error ? error.message : 'StreamBridge could not open that folder.' }; }
  listings.set(folder.folder, entry);
  if (listings.size > 40) listings.delete(listings.keys().next().value);
  return entry;
}

/**
 * Picks one sound. With noRepeats, a folder works like a shuffled deck: every sound plays once before any
 * plays again, and a new round never starts with the sound that ended the last one.
 */
export function pickSound(files, settings, key, random = Math.random) {
  if (files.length === 0) return undefined;
  const names = files.map((file) => file.name);
  if (!settings.noRepeats || files.length === 1) {
    const choices = files.length > 1 ? files.filter((file) => file.name !== lastPlayed.get(key)) : files;
    const picked = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
    lastPlayed.set(key, picked.name); return picked;
  }
  let bag = (bags.get(key) ?? []).filter((name) => names.includes(name));
  if (bag.length === 0) bag = names;
  const choices = bag.length > 1 ? bag.filter((name) => name !== lastPlayed.get(key)) : bag;
  const name = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
  bags.set(key, bag.filter((entry) => entry !== name)); lastPlayed.set(key, name);
  if (bags.size > 40) bags.delete(bags.keys().next().value);
  return files.find((file) => file.name === name);
}

async function playFrom(context, settings, folder) {
  const found = await listing(context, folder);
  if (found.error) throw new Error(`${folder.name}: ${found.error}`);
  const file = pickSound(found.files, settings, folder.folder);
  if (!file) throw new Error(`${folder.name}: no sound files in that folder yet.`);
  playCount += 1;
  await context.overlay.publish(`${MODULE_ID}.sound.play`, {
    url: file.url, volume: Math.round(folder.volume * settings.volume) / 10_000, overlap: settings.letSoundsOverlap, maxAtOnce: settings.maximumAtOnce,
    maxMs: settings.longestSoundSeconds * 1000, soundId: folder.id, name: soundName(file.name),
  }, { lane: 'independent' });
  return file;
}

async function stopSounds(context) { await context.overlay.publish(`${MODULE_ID}.sound.stop`, {}, { lane: 'independent' }); }

async function say(context, event, message) {
  if (message) await context.chat.send({ message, routing: 'source', sourcePlatform: event.platform, overflow: 'truncate' }).catch(() => undefined);
}

async function process(event, context) {
  const settings = settingsFor(context);
  if (!settings.enabled || event.metadata?.simulated === true) return;
  const request = resolveRequest(event, settings); if (!request) return;
  if (request.stop) { await stopSounds(context); return; }
  const viewer = clean(event.user?.displayName || event.user?.name, 80) || 'Viewer';
  const now = Date.now();
  if (!request.paid) {
    if (!mayUse(event, settings.commandAccess)) return;
    const id = clean(event.user?.id || event.user?.name, 120).toLowerCase();
    const wait = isModerator(event) ? 0 : Math.max(lastPlayedAt + settings.globalCooldownSeconds * 1000 - now, id ? (viewerCooldowns.get(id) ?? 0) + settings.viewerCooldownSeconds * 1000 - now : 0);
    if (wait > 0) { await say(context, event, format(settings.cooldownMessage, { viewer, folder: request.folder.name, seconds: Math.ceil(wait / 1000) })); return; }
    if (id) { viewerCooldowns.set(id, now); if (viewerCooldowns.size > 500) viewerCooldowns.delete(viewerCooldowns.keys().next().value); }
  }
  lastPlayedAt = now;
  let file;
  try { file = await playFrom(context, settings, request.folder); } catch { return; }
  await say(context, event, format(settings.playedMessage, { viewer, sound: soundName(file.name), folder: request.folder.name }));
}

async function randomSoundPanel(request, context) {
  const settings = settingsFor(context);
  let message = '';
  if (request?.operation === 'action') {
    const action = clean(request.action, 40);
    if (action === 'stop') { await stopSounds(context); message = 'Stopped all sounds.'; }
    else if (action === 'rescan') { listings.clear(); message = 'Folders read again.'; }
    else {
      const folder = settings.folders.find((entry) => entry.id === action.replace(/^play-/u, 'folder-'));
      if (!folder) throw new Error('That folder is no longer in the list.');
      const file = await playFrom(context, settings, folder); lastPlayedAt = Date.now();
      message = `Playing ${soundName(file.name)} from ${folder.name}.`;
    }
  }
  const found = await Promise.all(settings.folders.map(async (folder) => ({ folder, listing: await listing(context, folder) })));
  return {
    ...(message ? { message } : {}),
    ...(settings.enabled ? {} : { notice: 'Random Sound is switched off in its settings.' }),
    ...(settings.folders.length ? {} : { notice: 'No folders yet. Add them in the Setup Wizard under Extensions > Random Sound.' }),
    summary: [{ label: 'Folders', value: String(settings.folders.length) }, { label: 'Sounds', value: String(found.reduce((total, entry) => total + entry.listing.files.length, 0)) }, { label: 'Played', value: String(playCount) }],
    actions: [...settings.folders.map((folder) => ({ action: folder.id.replace(/^folder-/u, 'play-'), label: `🎲 ${folder.name}${folder.command ? ` (!${folder.command})` : ''}` })), { action: 'rescan', label: 'Read folders again' }, { action: 'stop', label: 'Stop all sounds', style: 'danger' }],
    lists: [{
      title: 'Folders', empty: 'No folders yet.',
      items: found.map(({ folder, listing: entry }) => ({ title: folder.name, detail: entry.error ? entry.error : `${String(entry.files.length)} sound${entry.files.length === 1 ? '' : 's'}${entry.skipped ? `, ${String(entry.skipped)} skipped (over 50 MB or past 500)` : ''} · ${folder.folder}`, ...(entry.error ? { badge: 'Check folder' } : {}) })),
    }],
  };
}

let operation = Promise.resolve();
function serialize(task) { const pending = operation.then(task, task); operation = pending.catch(() => undefined); return pending; }

export default {
  manifest, required: false,
  async start() { stopped = false; lastPlayedAt = 0; playCount = 0; viewerCooldowns.clear(); listings.clear(); bags.clear(); lastPlayed.clear(); operation = Promise.resolve(); },
  async stop() { stopped = true; viewerCooldowns.clear(); listings.clear(); },
  async onEvent(event, context) { if (!stopped) await serialize(() => process(event, context)); },
  async controlPanel(request, context) { return serialize(() => randomSoundPanel(request, context)); },
};

export { FALLBACKS, MODULE_ID, manifest };
