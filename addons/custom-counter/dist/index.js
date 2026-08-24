// Custom Counter owns bounded, persistent creator counters and publishes only the selected
// counter projection to the core-hosted overlay. Mutations are serialized and permission-gated.
const MODULE_ID = 'thsv.custom-counter';
const CONTROL_EVENT = 'addon.thsv.custom-counter.control';
const LIMITS = Object.freeze({ twitch: 500, youtube: 200, kick: 500, tiktok: 150 });
const OPERATIONS = new Set(['increment', 'decrement', 'add', 'subtract', 'set', 'reset', 'show', 'hide', 'rename', 'save', 'load']);
const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Custom Counter', version: '4.0.5',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.5', maximumTestedBridgeVersion: '4.0.5',
  dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json', eventSubscriptions: [CONTROL_EVENT, 'command.received', 'channel.follow', 'channel.subscription', 'channel.membership', 'engagement.raid'],
  commandsProvided: [{ id: 'custom-counter.command', name: 'streamcounter' }], actionsProvided: [], browserSourcesProvided: [],
  coordination: [{ resource: 'overlay.counter', mode: 'background', priority: 10, timeoutMs: 600000, cooldownMs: 0, skippable: false }],
  dataStorageOwned: ['data/addons/thsv.custom-counter/', 'data/addons/.state/thsv.custom-counter/'],
  installationSteps: ['Install Custom Counter; its separate Streamer.bot controls are optional.', 'Create distinct counter commands in the wizard. They register automatically through the existing chat intakes after restart and need no Streamer.bot actions.', 'Import the optional controls only for manual hotkeys, Stream Deck buttons, or trusted non-chat triggers.', 'Add /overlay/addons/thsv.custom-counter as a browser source.'],
  uninstallationSteps: ['Uninstalling preserves bounded counter values and presets for a later reinstall.'], migrations: [],
  healthChecks: [{ id: 'thsv.custom-counter.runtime', description: 'Confirms serialized persistent counters, creator controls, role gates, and overlay projection are available.' }],
};
let operation = Promise.resolve();

function clean(value, maximum = 100) { return Array.from(typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]+/gu, ' ').replace(/\s+/gu, ' ').trim() : '').slice(0, maximum).join(''); }
function counterId(value) { const id = clean(value, 40).toLowerCase().replace(/[^a-z0-9-]/gu, '-').replace(/^-+|-+$/gu, ''); return /^[a-z][a-z0-9-]{0,39}$/u.test(id) ? id : ''; }
function boundedInteger(value, fallback = 0) { const number = typeof value === 'number' ? value : Number(value); return Number.isSafeInteger(number) ? Math.max(-1_000_000_000, Math.min(1_000_000_000, number)) : fallback; }
function commandShortcut(value) { if (typeof value !== 'string') return undefined; const match = value.trim().match(/^!?([a-z][a-z0-9-]{0,39})\s*=\s*([a-z][a-z0-9-]{0,39})(?:\s*\|\s*([^|\r\n]{1,80}))?$/iu); if (!match) return undefined; return { command: match[1].toLowerCase(), counterId: match[2].toLowerCase(), name: clean(match[3], 80) || match[2] }; }
function settingsFor(context) { const raw = context.settings || {}; return {
  enabled: raw.enabled !== false, commandEnabled: raw.commandEnabled === true, commandName: counterId(raw.commandName) || 'streamcounter',
  commandShortcuts: (() => { const values = Array.isArray(raw.commandShortcuts) ? raw.commandShortcuts.slice(0, 20) : []; const shortcuts = []; const seen = new Set([counterId(raw.commandName) || 'streamcounter']); for (const value of values) { const shortcut = commandShortcut(value); if (!shortcut || seen.has(shortcut.command)) continue; seen.add(shortcut.command); shortcuts.push(shortcut); } return shortcuts; })(),
  allowModerators: raw.allowModerators !== false, allowBroadcaster: raw.allowBroadcaster !== false,
  defaultCounterId: counterId(raw.defaultCounterId) || 'main', defaultCounterName: clean(raw.defaultCounterName, 80) || 'Stream Counter', initialValue: boundedInteger(raw.initialValue),
  maximumCounters: Math.max(1, Math.min(20, boundedInteger(raw.maximumCounters, 10))),
  iconUrl: clean(raw.iconUrl, 2048), backgroundColor: /^#[0-9a-f]{6}$/iu.test(raw.backgroundColor) ? raw.backgroundColor : '#111827', accentColor: /^#[0-9a-f]{6}$/iu.test(raw.accentColor) ? raw.accentColor : '#7ee0ff', textColor: /^#[0-9a-f]{6}$/iu.test(raw.textColor) ? raw.textColor : '#ffffff',
  fontFamily: ['display', 'broadcast', 'mono'].includes(raw.fontFamily) ? raw.fontFamily : 'broadcast', fontSize: Math.max(24, Math.min(120, boundedInteger(raw.fontSize, 72))),
  borderColor: /^#[0-9a-f]{6}$/iu.test(raw.borderColor) ? raw.borderColor : '#7ee0ff', borderWidth: Math.max(0, Math.min(12, boundedInteger(raw.borderWidth, 3))), borderRadius: Math.max(0, Math.min(64, boundedInteger(raw.borderRadius, 24))),
  shadow: raw.shadow !== false, spacing: Math.max(0, Math.min(64, boundedInteger(raw.spacing, 24))), alignment: ['left', 'center', 'right'].includes(raw.alignment) ? raw.alignment : 'left', layout: ['horizontal', 'vertical'].includes(raw.layout) ? raw.layout : 'horizontal', showLabel: raw.showLabel !== false, showIcon: raw.showIcon !== false,
  animation: ['pop', 'pulse', 'bounce', 'flash', 'slide', 'none'].includes(raw.animation) ? raw.animation : 'pop',
  followDelta: Math.max(0, Math.min(1000, boundedInteger(raw.followDelta))), subscriptionDelta: Math.max(0, Math.min(1000, boundedInteger(raw.subscriptionDelta))), membershipDelta: Math.max(0, Math.min(1000, boundedInteger(raw.membershipDelta))), raidDelta: Math.max(0, Math.min(1000, boundedInteger(raw.raidDelta))),
}; }
function sanitizeCounter(raw, fallbackId, fallbackName, fallbackValue) { const value = raw && typeof raw === 'object' ? raw : {}; const id = counterId(value.id) || fallbackId; return { id, name: clean(value.name, 80) || fallbackName || id, value: boundedInteger(value.value, fallbackValue), visible: value.visible !== false }; }
function stateFor(raw, settings) { const value = raw && typeof raw === 'object' ? raw : {}; const counters = []; const seen = new Set();
  for (const item of Array.isArray(value.counters) ? value.counters : []) { const counter = sanitizeCounter(item, '', '', 0); if (!counter.id || seen.has(counter.id)) continue; seen.add(counter.id); counters.push(counter); if (counters.length >= settings.maximumCounters) break; }
  if (counters.length === 0) counters.push({ id: settings.defaultCounterId, name: settings.defaultCounterName, value: settings.initialValue, visible: true });
  const presets = {}; if (value.presets && typeof value.presets === 'object') for (const [key, preset] of Object.entries(value.presets).slice(0, 20)) { const id = counterId(key); if (id) presets[id] = sanitizeCounter(preset, id, id, 0); }
  const activeCounterId = counters.some((item) => item.id === value.activeCounterId) ? value.activeCounterId : counters[0].id;
  return { counters, presets, activeCounterId, sequence: Math.max(0, boundedInteger(value.sequence)) };
}
function creator(event, settings) { const roles = new Set((event.user?.roles || []).map((role) => clean(role, 30).toLowerCase())); return (settings.allowBroadcaster && roles.has('broadcaster')) || (settings.allowModerators && (roles.has('moderator') || roles.has('mod'))); }
function controlFor(event, settings) {
  if (event.eventType === CONTROL_EVENT) { const operationName = clean(event.payload?.operation, 20).toLowerCase(); if (!OPERATIONS.has(operationName)) return undefined; return { operation: operationName, id: counterId(event.payload?.counterId) || settings.defaultCounterId, amount: boundedInteger(event.payload?.amount), name: clean(event.payload?.name, 80), preset: counterId(event.payload?.preset) || 'default', reply: false }; }
  if (event.eventType !== 'command.received' || !settings.commandEnabled || !creator(event, settings)) return undefined;
  const args = Array.isArray(event.payload?.arguments) ? event.payload.arguments.map((item) => clean(item, 100)).filter(Boolean) : [];
  const command = counterId(event.payload?.command); const shortcut = settings.commandShortcuts.find((item) => item.command === command);
  if (shortcut) {
    const requested = clean(args[0] || 'increment', 20).toLowerCase(); const aliases = { '+': 'increment', '+1': 'increment', '-': 'decrement', '-1': 'decrement', display: 'show' };
    const operationName = aliases[requested] || requested; if (!OPERATIONS.has(operationName)) return { invalid: true, reply: true, shortcut: shortcut.command };
    return { operation: operationName, id: shortcut.counterId, amount: boundedInteger(args[1], 0), name: operationName === 'rename' ? clean(args.slice(1).join(' '), 80) : shortcut.name, preset: counterId(args[1]) || 'default', reply: true, shortcut: shortcut.command };
  }
  if (command !== settings.commandName) return undefined;
  const id = counterId(args[0]) || settings.defaultCounterId; const requested = clean(args[1] || 'show', 20).toLowerCase();
  const aliases = { '+': 'increment', '+1': 'increment', '-': 'decrement', '-1': 'decrement', display: 'show' };
  const operationName = aliases[requested] || requested; if (!OPERATIONS.has(operationName)) return { invalid: true, reply: true };
  const amount = boundedInteger(args[2], 0); const name = args.slice(2).join(' '); return { operation: operationName, id, amount, name, preset: counterId(args[2]) || 'default', reply: true };
}
function eventDelta(event, settings) { if (event.metadata?.simulated === true) return 0; if (event.eventType === 'channel.follow') return settings.followDelta; if (event.eventType === 'channel.subscription') return settings.subscriptionDelta; if (event.eventType === 'channel.membership') return settings.membershipDelta; if (event.eventType === 'engagement.raid') return settings.raidDelta; return 0; }
async function publish(context, settings, state) { const counter = state.counters.find((item) => item.id === state.activeCounterId) || state.counters[0]; await context.overlay.publish(`${MODULE_ID}.counter.update`, { id: counter.id, name: counter.name, value: counter.value, visible: counter.visible, sequence: state.sequence, iconUrl: settings.iconUrl, style: { backgroundColor: settings.backgroundColor, accentColor: settings.accentColor, textColor: settings.textColor, fontFamily: settings.fontFamily, fontSize: settings.fontSize, borderColor: settings.borderColor, borderWidth: settings.borderWidth, borderRadius: settings.borderRadius, shadow: settings.shadow, spacing: settings.spacing, alignment: settings.alignment, layout: settings.layout, showLabel: settings.showLabel, showIcon: settings.showIcon, animation: settings.animation } }, { lane: 'persistent' }); }
async function reply(context, event, message) { if (!event || !LIMITS[event.platform]) return; const maximum = LIMITS[event.platform]; const bounded = Array.from(clean(message, maximum * 2)).slice(0, maximum).join(''); await context.chat.send({ message: bounded, routing: 'source', sourcePlatform: event.platform, overflow: 'reject' }).catch(() => undefined); }
async function applyControl(control, event, context) { const settings = settingsFor(context); let state = stateFor(await context.state.read(), settings); if (control.invalid) return reply(context, event, control.shortcut ? `Usage: !${control.shortcut} [show|hide|+1|-1|add|subtract|set|reset|rename] [value]` : `Usage: !${settings.commandName} [counter] [show|hide|+1|-1|add|subtract|set|reset|rename] [value]`);
  let counter = state.counters.find((item) => item.id === control.id);
  if (!counter) { if (state.counters.length >= settings.maximumCounters) return reply(context, event, 'The counter limit has been reached.'); counter = { id: control.id, name: control.name || control.id, value: settings.initialValue, visible: true }; state.counters.push(counter); }
  const amount = control.operation === 'increment' || control.operation === 'decrement' ? 1 : control.amount;
  if (control.operation === 'increment' || control.operation === 'add') counter.value = boundedInteger(counter.value + amount);
  else if (control.operation === 'decrement' || control.operation === 'subtract') counter.value = boundedInteger(counter.value - amount);
  else if (control.operation === 'set') counter.value = boundedInteger(amount);
  else if (control.operation === 'reset') counter.value = settings.initialValue;
  else if (control.operation === 'show') counter.visible = true;
  else if (control.operation === 'hide') counter.visible = false;
  else if (control.operation === 'rename' && control.name) counter.name = control.name;
  else if (control.operation === 'save') state.presets[control.preset] = { ...counter };
  else if (control.operation === 'load' && state.presets[control.preset]) Object.assign(counter, state.presets[control.preset], { id: counter.id });
  state.activeCounterId = counter.id; state.sequence += 1; await context.state.write(state); await publish(context, settings, state); if (control.reply) await reply(context, event, `${counter.name}: ${String(counter.value)}`);
}
async function process(event, context) { const settings = settingsFor(context); if (!settings.enabled) return; const control = controlFor(event, settings); if (control) return applyControl(control, event, context); const delta = eventDelta(event, settings); if (delta <= 0) return; return applyControl({ operation: 'add', id: settings.defaultCounterId, amount: delta, name: '', preset: 'default', reply: false }, undefined, context); }
export default { manifest, required: false, async start(context) { operation = Promise.resolve(); const settings = settingsFor(context); const state = stateFor(await context.state.read(), settings); await context.state.write(state); if (settings.enabled) await publish(context, settings, state); }, async stop() { await operation.catch(() => undefined); operation = Promise.resolve(); }, async onEvent(event, context) { operation = operation.then(() => process(event, context), () => process(event, context)); await operation; } };
export { applyControl, settingsFor, stateFor };
