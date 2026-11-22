// Snap: an instant photo on stream. A viewer redeems a reward (channel points on Twitch or Kick, or a points reward in
// chat on any platform), an alert such as a raid arrives, or the streamer presses Snap in the Control Panel or a Stream
// Deck button. The camera drops in, the flash fires, OBS takes the picture of the source the streamer picked, and the
// photo prints out of the camera with the viewer's message written on the bottom. The finished photo is saved in the
// streamer's folder with the date and time as its name. One snap plays at a time; the rest wait in a short queue.

const MODULE_ID = 'thsv.snap';
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok', 'facebook']);
const PLATFORM_LABELS = Object.freeze({ twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick', tiktok: 'TikTok', facebook: 'Facebook' });
const LIMITS = Object.freeze({ twitch: 500, youtube: 200, kick: 500, tiktok: 150, facebook: 500 });
/** How long the camera takes to drop in before the flash; the picture is taken at the flash. */
const CAMERA_DROP_MS = 900;
/** How long the print, develop and caption take before the hold starts. */
const PRINT_MS = 6_500;
const RECENT_LIMIT = 30;

/** Alerts that can take a snap by themselves, the events behind them and the caption written on the photo. */
export const ALERTS = Object.freeze({
  raid: { eventTypes: ['channel.raid'], caption: 'raidCaption', fallback: 'Raided by {name} with {amount} viewers!' },
  follow: { eventTypes: ['channel.follow'], caption: 'followCaption', fallback: 'Welcome, {name}!' },
  subscription: { eventTypes: ['channel.subscription', 'channel.membership'], caption: 'subCaption', fallback: 'Thank you for the sub, {name}!' },
  'gift-subscription': { eventTypes: ['channel.gift-subscription'], caption: 'giftSubCaption', fallback: '{name} gifted {amount} subs!' },
  cheer: { eventTypes: ['engagement.cheer'], caption: 'cheerCaption', fallback: '{name} cheered {amount} Bits!' },
  donation: { eventTypes: ['engagement.donation', 'engagement.super-chat', 'engagement.super-sticker'], caption: 'tipCaption', fallback: 'Thank you for the tip, {name}!' },
  gift: { eventTypes: ['engagement.gift'], caption: 'giftCaption', fallback: '{name} sent a gift!' },
});
const ALERT_IDS = Object.freeze(Object.keys(ALERTS));
const ALERT_EVENT_TYPES = Object.freeze([...new Set(Object.values(ALERTS).flatMap((alert) => alert.eventTypes))]);

export function clean(value, maximum = 160) {
  return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '')].slice(0, maximum).join('');
}
function integer(value, minimum, maximum, fallback) { const number = Number(value); return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback; }
function choice(value, choices, fallback) { return choices.includes(value) ? value : fallback; }
function list(value, maximum, length) { return (Array.isArray(value) ? value : []).map((item) => clean(item, length)).filter(Boolean).filter((item, index, all) => all.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === index).slice(0, maximum); }
export function fill(template, values) { return String(template).replace(/\{([a-z]+)\}/gu, (match, key) => (Object.hasOwn(values, key) ? String(values[key]) : match)); }
function shorten(text, maximum) { const characters = [...text]; return characters.length <= maximum ? text : `${characters.slice(0, maximum - 1).join('')}…`; }

export function moderator(event) {
  const roles = Array.isArray(event?.user?.roles) ? event.user.roles.map((role) => String(role).toLowerCase()) : [];
  return roles.includes('broadcaster') || roles.includes('moderator') || roles.includes('mod') || event?.payload?.fromConnectedAccount === true;
}

export function settingsFor(context) {
  const raw = context?.settings ?? {};
  const platforms = (Array.isArray(raw.platforms) ? raw.platforms : PLATFORMS).filter((platform, index, all) => PLATFORMS.includes(platform) && all.indexOf(platform) === index);
  const alerts = (Array.isArray(raw.alerts) ? raw.alerts : ['raid']).filter((alert, index, all) => ALERT_IDS.includes(alert) && all.indexOf(alert) === index);
  return {
    enabled: raw.enabled === true, platforms,
    rewardTitles: list(raw.rewardTitles ?? ['Snap'], 10, 100),
    command: clean(raw.snapCommand, 40).replace(/^!+/u, '').toLowerCase() || 'snap',
    alerts, minimumRaid: integer(raw.minimumRaid, 1, 100_000, 1), minimumBits: integer(raw.minimumBits, 1, 1_000_000, 100),
    captions: Object.fromEntries(ALERT_IDS.map((id) => [id, clean(raw[ALERTS[id].caption], 120) || ALERTS[id].fallback])),
    rewardCaption: clean(raw.rewardCaption, 120) || 'Snapped by {name}',
    target: choice(raw.captureTarget, ['source', 'scene', 'named-scene'], 'source'),
    source: clean(raw.captureSource, 256),
    folder: clean(raw.saveFolder, 260),
    nameInFile: raw.fileNameStyle !== 'date',
    frame: choice(raw.frame, ['village', 'paper'], 'village'),
    font: choice(raw.captionFont, ['hand', 'bold'], 'hand'),
    captionLength: integer(raw.captionLength, 10, 80, 60),
    showCaption: raw.showCaption !== false, showName: raw.showName !== false,
    blockedWords: list(raw.blockedWords, 200, 60).map((word) => word.toLowerCase()),
    cooldownSeconds: integer(raw.cooldownSeconds, 0, 3_600, 30),
    viewerCooldownSeconds: integer(raw.viewerCooldownSeconds, 0, 86_400, 300),
    queueLimit: integer(raw.queueLimit, 1, 20, 5),
    skipScenes: list(raw.skipScenes, 20, 120),
    refundSkipped: raw.refundSkipped !== false,
    position: choice(raw.position, ['center', 'left', 'right'], 'center'),
    size: choice(raw.photoSize, ['small', 'medium', 'large'], 'medium'),
    holdSeconds: integer(raw.holdSeconds, 3, 30, 6),
    sound: raw.sound !== false, volume: integer(raw.volume, 0, 100, 70),
    chatReplies: raw.chatReplies !== false,
    cooldownMessage: clean(raw.cooldownMessage, 300) || '{name}, the camera needs {seconds} more seconds to cool down.',
    busyMessage: clean(raw.busyMessage, 300) || '{name}, the camera is busy right now. Try again in a moment.',
    pausedMessage: clean(raw.pausedMessage, 300) || '{name}, the camera is put away right now.',
    discordWebhookId: /^[a-z0-9-]{1,64}$/u.test(raw.discordWebhookId) ? raw.discordWebhookId : '',
    discordMessage: clean(raw.discordMessage, 500) || '📸 {name}: {caption}',
  };
}

/** Removes links, keeps the caption short and hides it when it has a blocked word. */
export function cleanCaption(text, settings) {
  const noLinks = clean(String(text ?? '').replace(/\b(?:https?:\/\/|www\.)\S+/giu, ' ').replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|tv|gg|io|ly|me|co|xyz|app|link)\b\S*/giu, ' '), 500);
  if (!noLinks) return '';
  const lower = noLinks.toLowerCase();
  if (settings.blockedWords.some((word) => lower.includes(word))) return '';
  return [...noLinks].slice(0, settings.captionLength).join('').trim();
}

function emptyState() { return { total: 0, recent: [], paused: false }; }
export function stateFor(raw) {
  const state = emptyState();
  if (!raw || typeof raw !== 'object') return state;
  state.total = integer(raw.total, 0, Number.MAX_SAFE_INTEGER, 0);
  state.paused = raw.paused === true;
  state.recent = (Array.isArray(raw.recent) ? raw.recent : []).slice(-RECENT_LIMIT).map((item) => ({
    at: integer(item?.at, 0, Number.MAX_SAFE_INTEGER, 0), name: clean(item?.name, 60), platform: PLATFORMS.includes(item?.platform) ? item.platform : '',
    caption: clean(item?.caption, 120), trigger: clean(item?.trigger, 40), ok: item?.ok !== false, error: clean(item?.error, 200),
  }));
  return state;
}

// ---------- Runtime ----------
let stopped = false;
let operation = Promise.resolve();
let running = false;
let currentScene = '';
let lastSnapAt = 0;
let sequence = 0;
const queue = [];
const viewerLastAt = new Map();

async function load(context) { return stateFor(await context.state.read()); }
async function save(context, state) { await context.state.write(JSON.parse(JSON.stringify(state))); }

async function sayOn(context, settings, platform, message) {
  if (!settings.chatReplies || !message || !PLATFORMS.includes(platform)) return;
  await context.chat.send({ message: shorten(message, LIMITS[platform]), routing: 'selected', selectedPlatforms: [platform], overflow: 'reject' }).catch(() => undefined);
}

async function refundRedemption(context, event) {
  const rewardId = clean(event?.payload?.rewardId, 256); const redemptionId = clean(event?.payload?.redemptionId, 256);
  if (event?.payload?.pointsReward === true) {
    const viewerId = clean(event.payload?.pointsViewerId, 64); const amount = Number(event.payload?.pointsCost);
    if (!viewerId || !Number.isSafeInteger(amount) || amount < 1 || !redemptionId || typeof context?.viewerFoundation?.mutate !== 'function') return;
    await context.viewerFoundation.mutate({ viewerId, operation: 'refund', amount, reason: 'Snap: the picture was not taken', idempotencyKey: `refund:${redemptionId}` }).catch(() => undefined);
    return;
  }
  if (event?.platform !== 'twitch' || !rewardId || !redemptionId || typeof context?.streamerbot?.administerReward !== 'function') return;
  await context.streamerbot.administerReward({ platform: 'twitch', operation: 'cancel', rewardId, redemptionId }).catch(() => undefined);
}

function skipSceneNames(context, settings) {
  return settings.skipScenes.map((value) => { const text = clean(value, 256); try { return /^role:/iu.test(text) ? clean(context?.scenes?.resolve?.(text) ?? '', 256) : text; } catch { return ''; } }).filter(Boolean);
}
function onSkippedScene(context, settings) {
  if (!currentScene || settings.skipScenes.length === 0) return false;
  return skipSceneNames(context, settings).some((name) => name.toLowerCase() === currentScene.toLowerCase());
}

function dateLabel(now) {
  try { return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(now); }
  catch { return now.toISOString().slice(0, 10); }
}
function fileNameFor(settings, now, name) {
  const pad = (value) => String(value).padStart(2, '0');
  const stamp = `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const safe = clean(name, 40).replace(/[<>:"/\\|?*]+/gu, '').replace(/^[.\s]+|[.\s]+$/gu, '').trim();
  return settings.nameInFile && safe ? `${stamp} - ${safe}` : stamp;
}

/** Why a snap cannot be taken right now, or '' when it can. Moderators and the streamer skip the cooldowns. */
export function blockedReason(settings, state, request, now = Date.now()) {
  if (state.paused) return 'paused';
  if (request.manual) return queue.length >= settings.queueLimit ? 'busy' : '';
  if (queue.length >= settings.queueLimit) return 'busy';
  const sinceLast = now - lastSnapAt;
  if (settings.cooldownSeconds > 0 && lastSnapAt > 0 && sinceLast < settings.cooldownSeconds * 1_000 && !running && queue.length === 0) return 'cooldown';
  if (request.viewerKey && settings.viewerCooldownSeconds > 0) {
    const last = viewerLastAt.get(request.viewerKey) ?? 0;
    if (last > 0 && now - last < settings.viewerCooldownSeconds * 1_000) return 'viewer-cooldown';
  }
  return '';
}
function secondsLeft(settings, request, now = Date.now()) {
  const viewer = request.viewerKey ? (viewerLastAt.get(request.viewerKey) ?? 0) + settings.viewerCooldownSeconds * 1_000 - now : 0;
  const channel = lastSnapAt + settings.cooldownSeconds * 1_000 - now;
  return Math.max(1, Math.ceil(Math.max(viewer, channel) / 1_000));
}

const wait = (ms) => new Promise((resolve) => { const timer = setTimeout(resolve, ms); timer.unref?.(); });

/** Plays one snap: camera, picture, print. Returns what happened for the Control Panel. */
async function play(context, settings, request) {
  const id = `snap-${Date.now().toString(36)}-${String(sequence += 1)}`;
  const now = new Date();
  const look = { id, frame: settings.frame, font: settings.font, position: settings.position, size: settings.size, sound: settings.sound, volume: settings.volume };
  await context.overlay.publish(`${MODULE_ID}.snap.start`, look, { lane: 'foreground' }).catch(() => undefined);
  await wait(CAMERA_DROP_MS);
  let photo;
  try {
    photo = await context.snapshot.capture({
      target: settings.target, sourceName: settings.source, folder: settings.folder, fileName: fileNameFor(settings, now, request.name),
      ...(settings.discordWebhookId ? { discord: { webhookId: settings.discordWebhookId, content: clean(fill(settings.discordMessage, { name: request.name, caption: request.caption || '', platform: PLATFORM_LABELS[request.platform] ?? '' }), 1_900), username: 'Snap' } } : {}),
    });
  } catch (error) {
    await context.overlay.publish(`${MODULE_ID}.snap.cancel`, { id }, { lane: 'foreground' }).catch(() => undefined);
    return { ok: false, error: clean(error instanceof Error ? error.message : String(error), 200) };
  }
  await context.overlay.publish(`${MODULE_ID}.snap.photo`, {
    ...look, photoUrl: photo.photoUrl, photoId: photo.photoId, token: photo.token,
    caption: settings.showCaption ? request.caption : '', name: settings.showName ? request.name : '', date: settings.showName ? dateLabel(now) : '',
    holdSeconds: settings.holdSeconds,
  }, { lane: 'foreground' }).catch(() => undefined);
  await wait(PRINT_MS + settings.holdSeconds * 1_000 + 800);
  return { ok: true };
}

async function drain(context) {
  if (running) return;
  running = true;
  try {
    while (!stopped && queue.length > 0) {
      const request = queue.shift();
      const settings = settingsFor(context);
      if (!settings.enabled) break;
      let result;
      try { result = await play(context, settings, request); }
      catch (error) { result = { ok: false, error: clean(error instanceof Error ? error.message : String(error), 200) }; }
      lastSnapAt = Date.now();
      if (!result.ok && request.event) await refundRedemption(context, request.event);
      const state = await load(context);
      if (result.ok) state.total += 1;
      state.recent.push({ at: Date.now(), name: request.name, platform: request.platform, caption: request.caption, trigger: request.trigger, ok: result.ok, error: result.error ?? '' });
      state.recent = state.recent.slice(-RECENT_LIMIT);
      await save(context, state).catch(() => undefined);
    }
  } finally { running = false; }
}

/** Adds a snap to the queue, or tells the viewer why it cannot be taken (and gives a reward back). */
async function request(context, settings, snap) {
  const state = await load(context);
  if (!snap.manual && onSkippedScene(context, settings)) {
    if (snap.event && settings.refundSkipped) await refundRedemption(context, snap.event);
    if (snap.reply) await sayOn(context, settings, snap.platform, fill(settings.pausedMessage, { name: snap.name }));
    return 'The camera is put away on this scene.';
  }
  const reason = blockedReason(settings, state, snap);
  if (reason) {
    if (snap.event && settings.refundSkipped) await refundRedemption(context, snap.event);
    if (snap.reply) {
      const template = reason === 'paused' ? settings.pausedMessage : reason === 'busy' ? settings.busyMessage : settings.cooldownMessage;
      await sayOn(context, settings, snap.platform, fill(template, { name: snap.name, seconds: String(secondsLeft(settings, snap)) }));
    }
    return reason === 'paused' ? 'Snaps are paused.' : reason === 'busy' ? 'The queue is full.' : 'The camera is cooling down.';
  }
  if (snap.viewerKey) viewerLastAt.set(snap.viewerKey, Date.now());
  queue.push(snap);
  const waiting = running ? queue.length : queue.length - 1;
  void drain(context);
  return waiting > 0 ? `Snap queued (${String(waiting)} ahead).` : 'Snap!';
}

function personOf(event) {
  const id = clean(event?.user?.id, 240);
  return { name: clean(event?.user?.displayName || event?.user?.name, 60) || 'Someone', platform: PLATFORMS.includes(event?.platform) ? event.platform : '', viewerKey: id ? `${event.platform}:${id}` : '' };
}

async function process(event, context) {
  const settings = settingsFor(context);
  if (!settings.enabled) return;
  if (event.eventType === 'stream.scene-changed' || event.eventType === 'system.scene-catalog') {
    const scene = clean(event.eventType === 'stream.scene-changed' ? event.payload?.sceneName : event.payload?.currentScene, 256);
    if (scene) currentScene = scene;
    return;
  }
  if (event.user?.actorType && event.user.actorType !== 'human') return;
  if (!settings.platforms.includes(event.platform) && event.platform !== 'system' && !['engagement.donation'].includes(event.eventType)) return;
  const person = personOf(event);
  if (event.eventType === 'command.received') {
    if (clean(event.payload?.command, 40).toLowerCase() !== settings.command || !moderator(event)) return;
    const args = Array.isArray(event.payload?.arguments) ? event.payload.arguments.map((arg) => clean(String(arg), 100)) : [];
    const sub = (args[0] ?? '').toLowerCase();
    if (sub === 'pause' || sub === 'resume') {
      const state = await load(context); state.paused = sub === 'pause'; await save(context, state);
      await sayOn(context, settings, event.platform, sub === 'pause' ? 'Snaps are paused.' : 'Snaps are back on.');
      return;
    }
    await request(context, settings, { ...person, viewerKey: '', manual: true, trigger: 'Command', caption: cleanCaption(args.join(' '), settings), reply: false });
    return;
  }
  if (event.metadata?.simulated === true) return;
  if (event.eventType === 'reward.redemption') {
    const title = clean(event.payload?.rewardTitle, 100).toLowerCase();
    if (!title || !settings.rewardTitles.some((item) => item.toLowerCase() === title)) return;
    const typed = cleanCaption(event.payload?.input ?? event.payload?.message, settings);
    const caption = typed || cleanCaption(fill(settings.rewardCaption, { name: person.name }), settings);
    await request(context, settings, { ...person, manual: false, trigger: 'Reward', caption, reply: true, event });
    return;
  }
  for (const alert of settings.alerts) {
    if (!ALERTS[alert].eventTypes.includes(event.eventType)) continue;
    const amount = Number(event.payload?.quantity ?? event.payload?.viewers ?? event.payload?.bits ?? event.payload?.amount ?? 1);
    if (alert === 'raid' && Number.isFinite(amount) && amount < settings.minimumRaid) return;
    if (alert === 'cheer' && Number.isFinite(amount) && amount < settings.minimumBits) return;
    const caption = cleanCaption(fill(settings.captions[alert], { name: person.name, amount: Number.isFinite(amount) ? String(amount) : '' }), settings);
    await request(context, settings, { ...person, viewerKey: '', manual: false, trigger: alert, caption, reply: false });
    return;
  }
}

function serialize(task) { const next = operation.then(task, task); operation = next.catch(() => undefined); return next; }

// ---------- Control Panel ----------
function ago(at) {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1_000));
  if (seconds < 60) return `${String(seconds)} s ago`;
  if (seconds < 3_600) return `${String(Math.round(seconds / 60))} min ago`;
  return `${String(Math.round(seconds / 3_600))} h ago`;
}

async function snapPanel(controlRequest, context) {
  const settings = settingsFor(context);
  let message = '';
  if (controlRequest?.operation === 'action') {
    if (!settings.enabled) throw new Error('Snap is switched off in its settings.');
    const action = clean(controlRequest.action, 40);
    if (action === 'snap') message = await request(context, settings, { name: clean(String(controlRequest.values?.name ?? ''), 60) || 'The streamer', platform: '', viewerKey: '', manual: true, trigger: 'Control Panel', caption: cleanCaption(String(controlRequest.values?.caption ?? ''), settings), reply: false });
    else if (action === 'pause' || action === 'resume') {
      const state = await load(context); state.paused = action === 'pause'; await save(context, state);
      message = action === 'pause' ? 'Snaps are paused. Rewards are given back until you resume.' : 'Snaps are back on.';
    } else throw new Error('Unknown Snap control.');
  }
  const state = await load(context);
  const last = state.recent.at(-1);
  return {
    ...(message ? { message } : {}),
    ...(settings.enabled ? {} : { notice: 'Snap is switched off in its settings.' }),
    ...(settings.enabled && settings.target !== 'scene' && !settings.source ? { notice: 'Choose which OBS source Snap takes the picture of in its settings.' } : {}),
    summary: [
      { label: 'Camera', value: state.paused ? 'Paused' : running ? 'Snapping' : 'Ready' },
      { label: 'Waiting', value: String(queue.length) },
      { label: 'Snaps taken', value: String(state.total) },
      { label: 'Last snap', value: last ? `${last.name} · ${ago(last.at)}` : '—' },
    ],
    actions: [
      { action: 'snap', label: 'Take a snap', style: 'primary', inputs: [{ name: 'caption', label: 'Caption', type: 'text', maxLength: settings.captionLength }, { name: 'name', label: 'Name', type: 'text', maxLength: 60 }] },
      state.paused ? { action: 'resume', label: 'Resume snaps', style: 'primary' } : { action: 'pause', label: 'Pause snaps', style: 'danger' },
    ],
    lists: [
      {
        title: 'Recent snaps', empty: 'No snaps yet.',
        items: [...state.recent].reverse().slice(0, 15).map((item) => ({
          title: `${item.name}${item.caption ? `: ${item.caption}` : ''}`, badge: item.ok ? '📸' : '!',
          detail: `${item.trigger}${item.platform ? ` · ${PLATFORM_LABELS[item.platform]}` : ''} · ${ago(item.at)}${item.ok ? '' : ` · ${item.error || 'not taken'}`}`,
        })),
      },
    ],
  };
}

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Snap', version: '4.1.161',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.1.161', maximumTestedBridgeVersion: '4.1.161',
  dependencies: ['thsv.viewer-foundation'], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: ['reward.redemption', 'command.received', 'stream.scene-changed', 'system.scene-catalog', ...ALERT_EVENT_TYPES],
  commandsProvided: [{ id: 'snap.take', name: 'snap' }], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: [`data/addons/${MODULE_ID}/`, `data/addons/.state/${MODULE_ID}/`],
  installationSteps: [
    'OBS only: Connect OBS Studio under Scene connections, then pick the OBS source Snap takes the picture of (usually your camera).',
    'SprigCast only: Add SprigCast under Scene connections, then pick the SprigCast source Snap takes the picture of (usually your camera).',
    'Name the rewards that take a snap, and pick a folder for the pictures.',
    'Add the overlay as a browser source in the scenes where snaps should show, then press Take a snap in the Control Panel.',
  ],
  uninstallationSteps: ['Disable the extension and remove its browser source. Your saved pictures stay in your folder.'], migrations: [],
  healthChecks: [{ id: `${MODULE_ID}.runtime`, description: 'Confirms rewards, alerts and the Control Panel take one snap at a time, cooldowns and paused scenes are respected, and skipped rewards are given back.' }],
};

export { manifest };

/** For tests: forgets the queue, cooldowns and the current scene. */
export function resetForTests() { stopped = false; running = false; queue.length = 0; viewerLastAt.clear(); lastSnapAt = 0; currentScene = ''; operation = Promise.resolve(); }

export default {
  manifest, required: false,
  async start() { stopped = false; running = false; queue.length = 0; viewerLastAt.clear(); lastSnapAt = 0; currentScene = ''; operation = Promise.resolve(); },
  async stop() { stopped = true; queue.length = 0; await operation.catch(() => undefined); },
  async onEvent(event, context) { if (!stopped) await serialize(() => process(event, context)); },
  async controlPanel(controlRequest, context) { return serialize(() => snapPanel(controlRequest, context)); },
};
