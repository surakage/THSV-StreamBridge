// Local Clock shows the creator's local time and date on stream as a text line, a digital clock, or a round
// analog clock. The overlay ticks by itself in the browser source, so the Bridge only sends the look and the
// time zone when it starts or the settings change. An optional chat command tells chat the local time.
// No Streamer.bot import is needed.
const MODULE_ID = 'thsv.local-clock';
const COMMAND_PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok', 'facebook']);
const FALLBACKS = Object.freeze({
  enabled: false, clockStyle: 'text', timeZone: '', hourFormat: '12', showSeconds: true, showDate: true, label: '',
  uppercase: true, clockSize: 'medium', textColor: '#ffffff', accentColor: '#f5c56b', backgroundMode: 'none', backgroundColor: '#140d1f',
  command: '', commandPlatforms: ['twitch', 'youtube', 'kick', 'tiktok', 'facebook'], commandCooldownSeconds: 10,
  commandMessage: '🕰️ It is {time} on {date} in the village.',
});

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Local Clock', version: '4.1.82',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.1.82', maximumTestedBridgeVersion: '4.1.82',
  dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: ['command.received'],
  commandsProvided: [], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: [`data/addons/${MODULE_ID}/`, `data/addons/.state/${MODULE_ID}/`],
  installationSteps: [
    'Pick a clock style: the text line, a digital clock, or a round analog clock.',
    'Leave the time zone empty to use this PC\'s time, or type one such as America/Chicago.',
    'Add the overlay as a browser source (1920x1080) in the scenes where the clock should show.',
    'Enable the extension and restart StreamBridge.',
  ],
  uninstallationSteps: ['Disable the extension and remove its browser source.'], migrations: [],
  healthChecks: [{ id: `${MODULE_ID}.runtime`, description: 'Confirms the clock settings, time zone check, overlay update and the optional time command.' }],
};

let stopped = true;
let lastReplyAt = 0;

function clean(value, maximum = 160) { return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '')].slice(0, maximum).join(''); }
function list(value, maximum, length) { return [...new Set((Array.isArray(value) ? value : []).map((item) => clean(item, length)).filter(Boolean))].slice(0, maximum); }
function integer(value, minimum, maximum, fallback) { const number = Number(value); return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback; }
function choice(value, choices, fallback) { return choices.includes(value) ? value : fallback; }
function color(value, fallback) { return typeof value === 'string' && /^#[0-9a-f]{6}$/iu.test(value) ? value.toLowerCase() : fallback; }
function command(value) { return clean(value, 40).replace(/^!+/u, '').toLowerCase(); }

// An empty or unknown zone falls back to this PC's own time zone.
export function validTimeZone(value) {
  const zone = clean(value, 64);
  if (!zone) return '';
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return zone; } catch { return ''; }
}

export function settingsFor(context) {
  const raw = { ...FALLBACKS, ...(context?.settings ?? {}) };
  return {
    enabled: raw.enabled === true,
    clockStyle: choice(raw.clockStyle, ['text', 'digital', 'analog'], 'text'), timeZone: validTimeZone(raw.timeZone),
    hourFormat: choice(raw.hourFormat, ['12', '24'], '12'), showSeconds: raw.showSeconds !== false, showDate: raw.showDate !== false,
    label: clean(raw.label, 60), uppercase: raw.uppercase !== false, clockSize: choice(raw.clockSize, ['small', 'medium', 'large'], 'medium'),
    textColor: color(raw.textColor, FALLBACKS.textColor), accentColor: color(raw.accentColor, FALLBACKS.accentColor),
    backgroundMode: choice(raw.backgroundMode, ['none', 'glass', 'solid'], 'none'), backgroundColor: color(raw.backgroundColor, FALLBACKS.backgroundColor),
    command: command(raw.command), commandPlatforms: new Set(list(raw.commandPlatforms, 4, 20).filter((platform) => COMMAND_PLATFORMS.includes(platform))),
    commandCooldownSeconds: integer(raw.commandCooldownSeconds, 0, 3600, 10), commandMessage: clean(raw.commandMessage, 300) || FALLBACKS.commandMessage,
  };
}

export function clockView(settings) {
  return {
    moduleId: MODULE_ID, cardKind: 'local-clock', visible: true, clockStyle: settings.clockStyle, timeZone: settings.timeZone,
    hourFormat: settings.hourFormat, showSeconds: settings.showSeconds, showDate: settings.showDate, label: settings.label,
    uppercase: settings.uppercase, clockSize: settings.clockSize,
    style: { textColor: settings.textColor, accentColor: settings.accentColor, backgroundMode: settings.backgroundMode, backgroundColor: settings.backgroundColor },
  };
}

// The chat reply uses the same zone as the overlay, so chat and the clock always agree.
export function describeTime(settings, now = new Date()) {
  const zone = settings.timeZone ? { timeZone: settings.timeZone } : {};
  const time = new Intl.DateTimeFormat('en-US', { ...zone, hour: 'numeric', minute: '2-digit', hour12: settings.hourFormat === '12' }).format(now);
  const date = new Intl.DateTimeFormat('en-US', { ...zone, weekday: 'long', month: 'long', day: 'numeric' }).format(now);
  const zoneName = new Intl.DateTimeFormat('en-US', { ...zone, timeZoneName: 'short' }).formatToParts(now).find((part) => part.type === 'timeZoneName')?.value ?? '';
  return { time, date, zone: zoneName };
}

async function publish(context, settings) {
  if (!settings.enabled) { await context.overlay.publish(`${MODULE_ID}.clock.hide`, {}, { lane: 'persistent' }).catch(() => undefined); return; }
  await context.overlay.publish(`${MODULE_ID}.clock.update`, clockView(settings), { lane: 'persistent' }).catch(() => undefined);
}

async function process(event, context) {
  const settings = settingsFor(context);
  if (!settings.enabled || !settings.command || event?.eventType !== 'command.received' || event.metadata?.simulated === true) return;
  if (!settings.commandPlatforms.has(event.platform) || command(event.payload?.command) !== settings.command) return;
  const now = Date.now();
  if (now < lastReplyAt + settings.commandCooldownSeconds * 1000) return;
  lastReplyAt = now;
  const values = describeTime(settings);
  const message = settings.commandMessage.replace(/\{(time|date|zone)\}/gu, (_, name) => values[name]);
  await context.chat.send({ message, routing: 'source', sourcePlatform: event.platform, overflow: 'truncate' }).catch(() => undefined);
}

async function clockPanel(request, context) {
  const settings = settingsFor(context);
  if (request?.operation === 'settings-changed') { await publish(context, settings); return {}; }
  if (request?.operation === 'action' && clean(request.action, 40) === 'refresh') { await publish(context, settings); }
  else if (request?.operation === 'action') throw new Error('Unknown Local Clock control.');
  const { time, date, zone } = describeTime(settings);
  return {
    ...(request?.operation === 'action' ? { message: 'Clock overlay refreshed.' } : {}),
    ...(settings.enabled ? {} : { notice: 'Local Clock is switched off in its settings.' }),
    summary: [{ label: 'Local time', value: `${time} ${zone}`.trim() }, { label: 'Date', value: date }, { label: 'Style', value: settings.clockStyle }],
    actions: [{ action: 'refresh', label: 'Refresh overlay' }],
  };
}

export { manifest };

export default {
  manifest, required: false,
  async start(context) { stopped = false; lastReplyAt = 0; const settings = settingsFor(context); if (settings.enabled) await publish(context, settings); },
  async stop() { stopped = true; },
  async onEvent(event, context) { if (!stopped) await process(event, context); },
  async controlPanel(request, context) { return clockPanel(request, context); },
};
