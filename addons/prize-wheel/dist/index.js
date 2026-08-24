// Prize Wheel runs one creator-controlled, casual-choice wheel and announces the
// server-selected result after the browser animation finishes.
const MODULE_ID = 'thsv.prize-wheel';
const PLATFORMS = ['twitch', 'youtube', 'kick', 'tiktok'];
const LIMITS = Object.freeze({ twitch: 500, youtube: 200, kick: 500, tiktok: 150 });
let announcementTaskId;
let stopped = true;
let operation = Promise.resolve();
const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Prize Wheel', version: '4.0.5',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.5', maximumTestedBridgeVersion: '4.0.5', dependencies: [], requiredCapabilities: [],
  configurationSchema: 'schemas/config.json', eventSubscriptions: ['command.received'],
  commandsProvided: [{ id: 'prize-wheel.spin', name: 'spinwheel' }], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.prize-wheel/', 'data/addons/.state/thsv.prize-wheel/'],
  installationSteps: [
    'Add the hosted Prize Wheel browser source to OBS, Meld, or Streamlabs.',
    'Choose the spin command in the wizard. It registers automatically for moderators and the broadcaster after restart.',
    'Enter two through ten unique wheel choices, choose chat destinations, save, enable, and send a preview.',
  ],
  uninstallationSteps: ['Uninstalling preserves only the last bounded spin timestamp and winning choice.'],
  migrations: [],
  healthChecks: [{ id: 'thsv.prize-wheel.runtime', description: 'Confirms bounded choices, serialized spins, delayed announcements, and the hosted wheel renderer.' }],
};

function clean(value, maximum = 500) {
  return Array.from(typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]+/gu, ' ').replace(/\s+/gu, ' ').trim() : '').slice(0, maximum).join('');
}
function integer(value, minimum, maximum, fallback) {
  return Number.isInteger(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}
function color(value, fallback) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/iu.test(value) ? value : fallback;
}
function optionsFor(value) {
  const source = Array.isArray(value) ? value : [];
  const result = [];
  const seen = new Set();
  for (const item of source) {
    const option = clean(item, 80);
    const key = option.toLocaleLowerCase('en-US');
    if (!option || seen.has(key)) continue;
    seen.add(key); result.push(option);
    if (result.length === 10) break;
  }
  return result;
}
function settingsFor(context) {
  const raw = context.settings || {};
  const choices = optionsFor(raw.options);
  const platforms = Array.isArray(raw.deliveryPlatforms)
    ? [...new Set(raw.deliveryPlatforms.filter((value) => PLATFORMS.includes(value)))].slice(0, 4)
    : [...PLATFORMS];
  return {
    enabled: raw.enabled === true,
    command: clean(raw.spinCommand, 40).toLowerCase() || 'spinwheel',
    options: choices.length >= 2 ? choices : ['Option One', 'Option Two', 'Option Three', 'Option Four'],
    platforms,
    twitchMessage: clean(raw.twitchMessage, LIMITS.twitch) || 'The wheel chose {winner}!',
    youtubeMessage: clean(raw.youtubeMessage, LIMITS.youtube) || 'The wheel chose {winner}!',
    kickMessage: clean(raw.kickMessage, LIMITS.kick) || 'The wheel chose {winner}!',
    tiktokMessage: clean(raw.tiktokMessage, LIMITS.tiktok) || 'The wheel chose {winner}!',
    spinSeconds: integer(raw.spinSeconds, 6, 20, 9),
    winnerCardSeconds: integer(raw.winnerCardSeconds, 4, 30, 8),
    cooldownSeconds: integer(raw.cooldownSeconds, 5, 300, 15),
    title: clean(raw.wheelTitle, 80) || 'SPIN THE WHEEL',
    backgroundColor: color(raw.backgroundColor, '#101521'),
    wheelColors: optionsFor(raw.wheelColors).filter((value) => /^#[0-9a-f]{6}$/iu.test(value)).slice(0, 10),
    textColor: color(raw.textColor, '#ffffff'),
    accentColor: color(raw.accentColor, '#ffd166'),
    winnerColor: color(raw.winnerColor, '#7ff5cc'),
  };
}
function stateFor(value) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    lastSpinAt: Number.isFinite(raw.lastSpinAt) ? Math.max(0, raw.lastSpinAt) : 0,
    lastWinner: clean(raw.lastWinner, 80),
    spinSequence: Number.isInteger(raw.spinSequence) ? Math.max(0, raw.spinSequence) : 0,
  };
}
function moderator(event) {
  const roles = new Set((event.user?.roles || []).map((role) => clean(role, 30).toLowerCase()));
  return roles.has('broadcaster') || roles.has('moderator') || roles.has('mod');
}
function formatWinner(template, winner, maximum) {
  const rendered = clean(template, maximum * 2).replace(/\{winner\}/giu, winner);
  const characters = Array.from(rendered);
  if (characters.length <= maximum) return rendered;
  return `${characters.slice(0, Math.max(1, maximum - 1)).join('').trimEnd()}…`;
}
async function announceWinner(context, settings, winner) {
  const deliveries = [];
  for (const platform of settings.platforms) {
    const template = settings[`${platform}Message`];
    const message = formatWinner(template, winner, LIMITS[platform]);
    try {
      const result = await context.chat.send({ message, routing: 'selected', selectedPlatforms: [platform], overflow: 'reject' });
      deliveries.push(...result);
    } catch (error) {
      deliveries.push({ platform, accepted: false, parts: 0, error: clean(error instanceof Error ? error.message : String(error), 300) });
    }
  }
  return deliveries;
}
async function spinPrizeWheel(event, context, now = Date.now(), random = Math.random) {
  const settings = settingsFor(context);
  if (!settings.enabled || event.eventType !== 'command.received' || event.user?.actorType !== 'human') return { accepted: false, reason: 'ignored' };
  if (clean(event.payload?.command, 40).toLowerCase() !== settings.command) return { accepted: false, reason: 'ignored' };
  if (!moderator(event)) return { accepted: false, reason: 'not-authorized' };
  if (announcementTaskId !== undefined) return { accepted: false, reason: 'spin-in-progress' };
  const state = stateFor(await context.state.read());
  if (now - state.lastSpinAt < settings.cooldownSeconds * 1000) return { accepted: false, reason: 'cooldown' };
  const randomValue = random();
  const safeRandom = Number.isFinite(randomValue) ? Math.max(0, Math.min(0.999999999999, randomValue)) : 0;
  const winnerIndex = Math.min(settings.options.length - 1, Math.floor(safeRandom * settings.options.length));
  const winner = settings.options[winnerIndex];
  const simulated = event.metadata?.simulated === true;
  const sequence = simulated ? state.spinSequence + 1 : state.spinSequence + 1;
  const payload = {
    title: settings.title, options: settings.options, winnerIndex, winner,
    spinDurationMs: settings.spinSeconds * 1000, winnerDurationMs: settings.winnerCardSeconds * 1000,
    sequence, preview: simulated,
    style: {
      backgroundColor: settings.backgroundColor, wheelColors: settings.wheelColors,
      textColor: settings.textColor, accentColor: settings.accentColor, winnerColor: settings.winnerColor,
    },
  };
  await context.overlay.publish(`${MODULE_ID}.wheel.spin`, payload, { lane: 'foreground' });
  if (simulated) return { accepted: true, simulated: true, winner, winnerIndex, deliveries: [] };
  if (stopped) return { accepted: false, reason: 'stopped' };
  state.lastSpinAt = now; state.lastWinner = winner; state.spinSequence = sequence;
  await context.state.write(state);
  announcementTaskId = context.schedule.after(settings.spinSeconds * 1000, async () => {
    announcementTaskId = undefined; if (stopped) return;
    try { await announceWinner(context, settings, winner); } catch { /* A delayed chat failure cannot block later spins. */ }
  });
  return { accepted: true, simulated: false, winner, winnerIndex };
}

export default {
  manifest, required: false,
  async start(context) { stopped = false; announcementTaskId = undefined; operation = Promise.resolve(); await context.state.write(stateFor(await context.state.read())); },
  async stop(context) { stopped = true; if (announcementTaskId !== undefined) context.schedule.cancel(announcementTaskId); announcementTaskId = undefined; await operation.catch(() => undefined); operation = Promise.resolve(); },
  async onEvent(event, context) { operation = operation.then(() => spinPrizeWheel(event, context), () => spinPrizeWheel(event, context)); await operation; },
};
export { announceWinner, formatWinner, optionsFor, settingsFor, spinPrizeWheel, stateFor };
