// Soundboard: your own buttons of sounds. Each sound plays on stream from the Control Panel, a chat command
// (for example !airhorn) or a Twitch or Kick channel point reward. Sounds play on one invisible browser page
// (/overlay/addons/thsv.soundboard), so they work the same in OBS, SprigCast, Streamlabs and Meld.
// Ships empty: the creator adds their own sounds. No Streamer.bot import is needed.
const MODULE_ID = 'thsv.soundboard';
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok', 'facebook']);
const ACCESS = Object.freeze(['everyone', 'subscribers', 'vips', 'moderators']);
const LOCAL_SOUND = /^\/overlay\/assets\/[a-f0-9]{64}\.(?:mp3|wav|ogg)$/u;
const EXAMPLE_SOUNDS = Object.freeze(['Airhorn | | 80 | airhorn | |', 'Applause | | 70 | applause | |', 'Drum roll | | 70 | drumroll | |']);
const FALLBACKS = Object.freeze({
  enabled: false, sounds: [], volume: 80, letSoundsOverlap: true, maximumAtOnce: 3, longestSoundSeconds: 30,
  commandPlatforms: ['twitch', 'youtube', 'kick', 'tiktok', 'facebook'], commandAccess: 'everyone',
  globalCooldownSeconds: 3, viewerCooldownSeconds: 20, soundCooldownSeconds: 0,
  listCommand: '', listMessage: '🔊 Sounds: {sounds}', cooldownMessage: '', stopCommand: '',
});

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Soundboard', version: '4.1.154',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.1.154', maximumTestedBridgeVersion: '4.1.154',
  dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: ['reward.redemption', 'chat.message'],
  commandsProvided: [], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: [`data/addons/${MODULE_ID}/`, `data/addons/.state/${MODULE_ID}/`],
  installationSteps: [
    'Add your sounds: give each a name, press Choose file to pick an MP3, WAV or OGG file, and set its volume.',
    'Optional: give a sound a chat command (such as airhorn for !airhorn) or paste a Twitch or Kick channel point reward ID.',
    'Add http://127.0.0.1:8787/overlay/addons/thsv.soundboard as a browser source in each scene where sounds should be heard. Add it on one canvas only, so each sound is heard once.',
    'Enable the extension and restart StreamBridge. Play sounds from the Control Panel, chat or rewards.',
  ],
  uninstallationSteps: ['Disable the extension and remove its browser source.'], migrations: [],
  healthChecks: [{ id: `${MODULE_ID}.runtime`, description: 'Checks sound matching for commands and rewards, cooldowns and who may play sounds.' }],
};

let stopped = true;
let lastPlayedAt = 0;
const viewerCooldowns = new Map();
const soundCooldowns = new Map();
let playCount = 0;

function clean(value, maximum = 160) { return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '')].slice(0, maximum).join(''); }
function integer(value, minimum, maximum, fallback) { const number = Number(value); return Number.isFinite(number) && value !== '' && value !== null ? Math.min(maximum, Math.max(minimum, Math.round(number))) : fallback; }
function command(value) { return clean(value, 40).replace(/^!+/u, '').toLowerCase().replace(/\s+/gu, ''); }
function format(template, values) { return clean(template, 500).replace(/\{(viewer|sound|sounds|seconds)\}/gu, (_, name) => String(values[name] ?? '')); }

/** A saved sound address the page may play: a file added in the Wizard, or an https link. */
export function soundUrl(value) {
  const text = clean(value, 2_000);
  if (LOCAL_SOUND.test(text)) return text;
  try { const url = new URL(text); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}

/** One row of the sounds list: "Name | Sound | Volume | Command | Twitch reward ID | Kick reward ID". */
export function parseSound(line, index) {
  const cells = String(line ?? '').split('|').map((cell) => cell.trim());
  const name = clean(cells[0], 60);
  const url = soundUrl(cells[1]);
  if (!name || !url) return undefined;
  return { id: `sound-${String(index + 1)}`, name, url, volume: integer(cells[2], 0, 100, 100), command: command(cells[3]), twitchRewardId: clean(cells[4], 256), kickRewardId: clean(cells[5], 256) };
}

export function settingsFor(context) {
  const raw = { ...FALLBACKS, ...(context?.settings ?? {}) };
  const sounds = (Array.isArray(raw.sounds) ? raw.sounds : []).slice(0, 60).map(parseSound).filter(Boolean);
  return {
    enabled: raw.enabled === true, sounds,
    volume: integer(raw.volume, 0, 100, 80), letSoundsOverlap: raw.letSoundsOverlap !== false,
    maximumAtOnce: integer(raw.maximumAtOnce, 1, 10, 3), longestSoundSeconds: integer(raw.longestSoundSeconds, 1, 600, 30),
    commandPlatforms: new Set((Array.isArray(raw.commandPlatforms) ? raw.commandPlatforms : []).filter((platform) => PLATFORMS.includes(platform))),
    commandAccess: ACCESS.includes(raw.commandAccess) ? raw.commandAccess : 'everyone',
    globalCooldownSeconds: integer(raw.globalCooldownSeconds, 0, 3600, 3), viewerCooldownSeconds: integer(raw.viewerCooldownSeconds, 0, 3600, 20),
    soundCooldownSeconds: integer(raw.soundCooldownSeconds, 0, 3600, 0),
    listCommand: command(raw.listCommand), listMessage: clean(raw.listMessage, 300) || FALLBACKS.listMessage,
    cooldownMessage: clean(raw.cooldownMessage, 300), stopCommand: command(raw.stopCommand),
  };
}

function roles(event) { return new Set((Array.isArray(event?.user?.roles) ? event.user.roles : []).map((role) => String(role).toLowerCase())); }
/** Whether this viewer may play sounds by chat command. The streamer and moderators always can. */
export function mayUse(event, access) {
  const set = roles(event);
  if (set.has('broadcaster') || set.has('moderator') || set.has('mod')) return true;
  if (access === 'everyone') return true;
  if (access === 'vips') return set.has('vip');
  if (access === 'subscribers') return set.has('subscriber') || set.has('vip') || set.has('member');
  return false;
}
function isModerator(event) { const set = roles(event); return set.has('broadcaster') || set.has('moderator') || set.has('mod'); }

/** The chat command in a message ("!airhorn now" gives "airhorn"), or '' when the message is not a command. */
export function chatCommand(event) {
  const message = typeof event?.payload?.message === 'string' ? event.payload.message.trim() : '';
  const match = /^!([^\s!]{1,40})/u.exec(message);
  return match ? command(match[1]) : '';
}

/** What an event asks for: { sound, paid } for a sound, { list: true }, { stop: true }, or undefined. */
export function resolveRequest(event, settings) {
  if (event?.eventType === 'reward.redemption') {
    if (event.payload?.verifiedTransport !== true) return undefined;
    const id = clean(event.payload?.rewardId, 256);
    if (!id) return undefined;
    // A reward bought with Viewer Foundation points carries the linked Twitch reward ID on any platform.
    const platform = event.payload?.pointsReward === true ? 'twitch' : event.platform;
    const sound = settings.sounds.find((entry) => (platform === 'twitch' ? entry.twitchRewardId : platform === 'kick' ? entry.kickRewardId : '') === id);
    return sound ? { sound, paid: true } : undefined;
  }
  if (event?.eventType !== 'chat.message' || !settings.commandPlatforms.has(event.platform)) return undefined;
  if (event.user?.actorType && event.user.actorType !== 'human') return undefined;
  const name = chatCommand(event);
  if (!name) return undefined;
  if (settings.stopCommand && name === settings.stopCommand) return isModerator(event) ? { stop: true } : undefined;
  if (settings.listCommand && name === settings.listCommand) return { list: true };
  const sound = settings.sounds.find((entry) => entry.command === name);
  return sound ? { sound, paid: false } : undefined;
}

export async function playSound(context, settings, sound) {
  playCount += 1;
  const volume = Math.round(sound.volume * settings.volume) / 10_000;
  await context.overlay.publish(`${MODULE_ID}.sound.play`, {
    url: sound.url, volume, overlap: settings.letSoundsOverlap, maxAtOnce: settings.maximumAtOnce,
    maxMs: settings.longestSoundSeconds * 1000, soundId: sound.id, name: sound.name,
  }, { lane: 'independent' });
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
  if (request.list) {
    const names = settings.sounds.filter((sound) => sound.command).map((sound) => `!${sound.command}`);
    if (names.length) await say(context, event, format(settings.listMessage, { viewer, sounds: names.join(' ') }));
    return;
  }
  const now = Date.now();
  // Channel points were already spent, so a reward always plays. Chat commands share the cooldowns.
  if (!request.paid) {
    if (!mayUse(event, settings.commandAccess)) return;
    const id = clean(event.user?.id || event.user?.name, 120).toLowerCase();
    const moderator = isModerator(event);
    const wait = moderator ? 0 : Math.max(
      lastPlayedAt + settings.globalCooldownSeconds * 1000 - now,
      id ? (viewerCooldowns.get(id) ?? 0) + settings.viewerCooldownSeconds * 1000 - now : 0,
      (soundCooldowns.get(request.sound.id) ?? 0) + settings.soundCooldownSeconds * 1000 - now,
    );
    if (wait > 0) { await say(context, event, format(settings.cooldownMessage, { viewer, sound: request.sound.name, seconds: Math.ceil(wait / 1000) })); return; }
    if (id) { viewerCooldowns.set(id, now); if (viewerCooldowns.size > 500) viewerCooldowns.delete(viewerCooldowns.keys().next().value); }
  }
  lastPlayedAt = now; soundCooldowns.set(request.sound.id, now);
  await playSound(context, settings, request.sound);
}

async function soundboardPanel(request, context) {
  const settings = settingsFor(context);
  let message = '';
  if (request?.operation === 'action') {
    const action = clean(request.action, 40);
    if (action === 'stop') { await stopSounds(context); message = 'Stopped all sounds.'; }
    else {
      const sound = settings.sounds.find((entry) => entry.id === action.replace(/^play-/u, 'sound-'));
      if (!sound) throw new Error('That sound is no longer on the soundboard.');
      await playSound(context, settings, sound); lastPlayedAt = Date.now(); soundCooldowns.set(sound.id, lastPlayedAt);
      message = `Playing ${sound.name}.`;
    }
  }
  return {
    ...(message ? { message } : {}),
    ...(settings.enabled ? {} : { notice: 'Soundboard is switched off in its settings.' }),
    ...(settings.sounds.length ? {} : { notice: 'No sounds yet. Add them in the Setup Wizard under Extensions > Soundboard.' }),
    summary: [{ label: 'Sounds', value: String(settings.sounds.length) }, { label: 'Volume', value: `${String(settings.volume)}%` }, { label: 'Played', value: String(playCount) }],
    actions: [...settings.sounds.map((sound) => ({ action: sound.id.replace(/^sound-/u, 'play-'), label: sound.command ? `${sound.name} (!${sound.command})` : sound.name })), { action: 'stop', label: 'Stop all sounds', style: 'danger' }],
  };
}

let operation = Promise.resolve();
function serialize(task) { const pending = operation.then(task, task); operation = pending.catch(() => undefined); return pending; }

export default {
  manifest, required: false,
  async start() { stopped = false; lastPlayedAt = 0; playCount = 0; viewerCooldowns.clear(); soundCooldowns.clear(); operation = Promise.resolve(); },
  async stop() { stopped = true; viewerCooldowns.clear(); soundCooldowns.clear(); },
  async onEvent(event, context) { if (!stopped) await serialize(() => process(event, context)); },
  async controlPanel(request, context) { return serialize(() => soundboardPanel(request, context)); },
};

export { EXAMPLE_SOUNDS, FALLBACKS, MODULE_ID, manifest };
