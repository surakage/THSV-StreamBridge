// Prize Wheel runs one creator-controlled, casual-choice wheel and announces the
// server-selected result after the browser animation finishes.
const MODULE_ID = 'thsv.prize-wheel';
const PLATFORMS = ['twitch', 'youtube', 'kick', 'tiktok'];
const LIMITS = Object.freeze({ twitch: 500, youtube: 200, kick: 500, tiktok: 150 });
let announcementTaskId;
let stopped = true;
let operation = Promise.resolve();
// Slices changed from the Control Deck. They are kept with the extension's saved state and win only
// while the Wizard's own list is unchanged since; saving a different list in the Wizard replaces them.
let sliceOverride;
const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Prize Wheel', version: '4.1.8',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.1.8', maximumTestedBridgeVersion: '4.1.8', dependencies: [], requiredCapabilities: [],
  configurationSchema: 'schemas/config.json', eventSubscriptions: ['command.received'],
  commandsProvided: [{ id: 'prize-wheel.spin', name: 'spinwheel' }], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.prize-wheel/', 'data/addons/.state/thsv.prize-wheel/'],
  installationSteps: [
    'Add the hosted Prize Wheel browser source to OBS, Meld, or Streamlabs.',
    'Choose the spin command in the wizard. It registers automatically for moderators and the broadcaster after restart.',
    'Enter two through ten unique wheel choices, choose chat destinations, save, enable, and send a preview.',
  ],
  uninstallationSteps: ['Uninstalling keeps only the time of the last spin and the winning choice.'],
  migrations: [],
  healthChecks: [{ id: 'thsv.prize-wheel.runtime', description: 'Checks that choices stay within limits, spins run one at a time, winners are announced after the spin, and the wheel overlay works.' }],
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
function optionsFingerprint(value) { return JSON.stringify(Array.isArray(value) ? value : null); }
function overrideFor(value) {
  if (!value || typeof value !== 'object' || typeof value.base !== 'string' || value.base.length > 20_000) return undefined;
  const options = optionsFor(value.options);
  return options.length >= 2 ? { base: value.base, options } : undefined;
}
function settingsFor(context) {
  const raw = context.settings || {};
  const override = sliceOverride && sliceOverride.base === optionsFingerprint(raw.options) ? sliceOverride : undefined;
  const choices = override ? override.options : optionsFor(raw.options);
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
  const deckOptions = overrideFor(raw.deckOptions);
  return {
    lastSpinAt: Number.isFinite(raw.lastSpinAt) ? Math.max(0, raw.lastSpinAt) : 0,
    lastWinner: clean(raw.lastWinner, 80),
    spinSequence: Number.isInteger(raw.spinSequence) ? Math.max(0, raw.spinSequence) : 0,
    ...(deckOptions ? { deckOptions } : {}),
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
  return spinWheel(context, settings, { now, random, simulated: event.metadata?.simulated === true });
}
// The one spin path, shared by the chat command and the Control Deck.
async function spinWheel(context, settings, { now = Date.now(), random = Math.random, simulated = false, ignoreCooldown = false } = {}) {
  if (announcementTaskId !== undefined) return { accepted: false, reason: 'spin-in-progress' };
  const state = stateFor(await context.state.read());
  if (!ignoreCooldown && now - state.lastSpinAt < settings.cooldownSeconds * 1000) return { accepted: false, reason: 'cooldown', waitSeconds: Math.ceil((state.lastSpinAt + settings.cooldownSeconds * 1000 - now) / 1000) };
  const randomValue = random();
  const safeRandom = Number.isFinite(randomValue) ? Math.max(0, Math.min(0.999999999999, randomValue)) : 0;
  const winnerIndex = Math.min(settings.options.length - 1, Math.floor(safeRandom * settings.options.length));
  const winner = settings.options[winnerIndex];
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

// ---------- Control Deck ----------
function sliceName(value) { const name = clean(value, 80); if (!name) throw new Error('Type a name for the slice.'); return name; }
async function saveSlices(context, options) {
  const raw = context.settings || {};
  const state = stateFor(await context.state.read());
  sliceOverride = { base: optionsFingerprint(raw.options), options };
  state.deckOptions = sliceOverride;
  await context.state.write(state);
}
function deckView(context, state, message) {
  const settings = settingsFor(context);
  const spinning = announcementTaskId !== undefined;
  const lastSpin = state.lastSpinAt > 0 ? new Date(state.lastSpinAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'Not yet';
  const removable = settings.options.length > 2;
  return {
    title: 'Prize Wheel',
    status: spinning ? 'The wheel is spinning…' : `${String(settings.options.length)} slices · last result: ${state.lastWinner || 'none'}`,
    ...(message ? { message } : {}),
    sections: [
      {
        title: 'Wheel',
        fields: [{ label: 'Last result', value: state.lastWinner || 'None yet' }, { label: 'Last spin', value: lastSpin }, { label: 'Chat cooldown', value: `${String(settings.cooldownSeconds)} seconds` }],
        actions: [
          { operation: 'spin', label: 'Spin', tone: 'primary', disabled: spinning || !settings.enabled },
          { operation: 'respin', label: 'Re-spin', disabled: spinning || !settings.enabled || !state.lastWinner },
          { operation: 'clear-result', label: 'Clear result', disabled: spinning || !state.lastWinner },
        ],
      },
      {
        title: 'Slices',
        items: settings.options.map((option, index) => ({ id: String(index), label: option, actions: [{ operation: 'remove-slice', label: 'Remove', args: { id: String(index) }, tone: 'danger', disabled: !removable, confirm: `Remove “${option}” from the wheel?` }] })),
        ...(settings.options.length < 10 ? { form: { operation: 'add-slice', submitLabel: 'Add slice', inputs: [{ name: 'name', label: 'New slice', type: 'text', maxLength: 80, placeholder: 'For example: Free song request' }] } } : {}),
      },
      {
        title: 'Rename a slice',
        form: { operation: 'edit-slice', submitLabel: 'Rename', inputs: [
          { name: 'id', label: 'Slice', type: 'select', options: settings.options.map((option, index) => ({ value: String(index), label: option })) },
          { name: 'name', label: 'New name', type: 'text', maxLength: 80 },
        ] },
      },
    ],
  };
}
function sliceIndex(settings, args) {
  const index = Number.parseInt(String(args?.id ?? ''), 10);
  if (!Number.isInteger(index) || index < 0 || index >= settings.options.length) throw new Error('That slice is no longer on the wheel. Refresh and try again.');
  return index;
}
function spinMessage(result) {
  if (result.accepted) return `The wheel is spinning. It landed on ${result.winner}; chat hears it when the spin ends.`;
  if (result.reason === 'spin-in-progress') throw new Error('The wheel is already spinning. Wait for it to stop.');
  if (result.reason === 'cooldown') throw new Error(`The wheel can spin again in ${String(result.waitSeconds)} seconds. Use Re-spin to spin right away.`);
  throw new Error('The wheel cannot spin right now.');
}
async function controlDeck(request, context) {
  const settings = settingsFor(context);
  const args = request.args || {};
  let message = '';
  switch (request.operation) {
    case 'view': break;
    case 'spin':
    case 'respin': {
      if (!settings.enabled) throw new Error('Turn on Prize Wheel in Extensions first.');
      message = spinMessage(await spinWheel(context, settings, { ignoreCooldown: request.operation === 'respin' }));
      break;
    }
    case 'clear-result': {
      if (announcementTaskId !== undefined) throw new Error('Wait for the wheel to stop first.');
      const state = stateFor(await context.state.read()); state.lastWinner = ''; await context.state.write(state);
      message = 'Result cleared.';
      break;
    }
    case 'add-slice': {
      const name = sliceName(args.name);
      if (settings.options.length >= 10) throw new Error('The wheel already has 10 slices, the most it can show.');
      if (settings.options.some((option) => option.toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US'))) throw new Error(`“${name}” is already on the wheel.`);
      await saveSlices(context, [...settings.options, name]);
      message = `Added “${name}”.`;
      break;
    }
    case 'remove-slice': {
      const index = sliceIndex(settings, args);
      if (settings.options.length <= 2) throw new Error('The wheel needs at least 2 slices.');
      const removed = settings.options[index];
      await saveSlices(context, settings.options.filter((_option, position) => position !== index));
      message = `Removed “${removed}”.`;
      break;
    }
    case 'edit-slice': {
      const index = sliceIndex(settings, args); const name = sliceName(args.name);
      if (settings.options.some((option, position) => position !== index && option.toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US'))) throw new Error(`“${name}” is already on the wheel.`);
      const previous = settings.options[index];
      await saveSlices(context, settings.options.map((option, position) => (position === index ? name : option)));
      message = `Renamed “${previous}” to “${name}”.`;
      break;
    }
    default: throw new Error('Prize Wheel does not have that control.');
  }
  return deckView(context, stateFor(await context.state.read()), message);
}

export default {
  manifest, required: false,
  async start(context) { stopped = false; announcementTaskId = undefined; operation = Promise.resolve(); const state = stateFor(await context.state.read()); sliceOverride = state.deckOptions; await context.state.write(state); },
  async stop(context) { stopped = true; if (announcementTaskId !== undefined) context.schedule.cancel(announcementTaskId); announcementTaskId = undefined; await operation.catch(() => undefined); operation = Promise.resolve(); },
  async onEvent(event, context) { operation = operation.then(() => spinPrizeWheel(event, context), () => spinPrizeWheel(event, context)); await operation; },
  async controlDeck(request, context) { const task = () => controlDeck(request, context); operation = operation.then(task, task); return operation; },
};
export { announceWinner, formatWinner, optionsFor, settingsFor, spinPrizeWheel, spinWheel, stateFor };
