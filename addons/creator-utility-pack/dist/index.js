// Creator Utility Pack provides bounded cross-platform counters and local polls.
// Village Draw is the only THSV giveaway system.
const MODULE_ID = 'thsv.creator-utility-pack';
const LIMITS = Object.freeze({ twitch: 500, youtube: 200, kick: 500, tiktok: 150 });
const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Creator Utility Pack', version: '2.6.0',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '2.6.0', maximumTestedBridgeVersion: '2.6.0',
  dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json', eventSubscriptions: ['command.received', 'stream.offline'],
  commandsProvided: [{ id: 'creator-utility.counter', name: 'counter' }, { id: 'creator-utility.vote', name: 'vote' }, { id: 'creator-utility.poll', name: 'poll' }],
  actionsProvided: [], browserSourcesProvided: [], dataStorageOwned: ['data/addons/thsv.creator-utility-pack/', 'data/addons/.state/thsv.creator-utility-pack/'],
  installationSteps: ['Install and choose command names.', 'Create matching no-response commands in Command Sync.', 'Use moderator/broadcaster commands to manage counters and polls.'],
  uninstallationSteps: ['Uninstalling preserves bounded counters and the current poll definition.'], migrations: [],
  healthChecks: [{ id: 'thsv.creator-utility-pack.runtime', description: 'Confirms bounded counter/poll state and platform-limited source replies are available.' }],
};
let operation = Promise.resolve();

function text(value, maximum = 300) {
  return Array.from(typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]+/gu, ' ').replace(/\s+/gu, ' ').trim() : '').slice(0, maximum).join('');
}
function id(value) {
  const result = text(value, 40).toLowerCase().replace(/[^a-z0-9-]/gu, '-').replace(/^-+|-+$/gu, '');
  return /^[a-z][a-z0-9-]{0,39}$/u.test(result) ? result : '';
}
function settingsFor(context) {
  const raw = context.settings || {};
  return {
    enabled: raw.enabled !== false, counterCommand: id(raw.counterCommand) || 'counter', pollCommand: id(raw.pollCommand) || 'poll', voteCommand: id(raw.voteCommand) || 'vote',
    closePollOnStreamEnd: raw.closePollOnStreamEnd !== false,
    maximumCounters: Number.isInteger(raw.maximumCounters) ? Math.min(100, Math.max(1, raw.maximumCounters)) : 25,
    maximumPollOptions: Number.isInteger(raw.maximumPollOptions) ? Math.min(10, Math.max(2, raw.maximumPollOptions)) : 6,
  };
}
function randomSalt() {
  const bytes = new Uint8Array(24); crypto.getRandomValues(bytes);
  return [...bytes].map((item) => item.toString(16).padStart(2, '0')).join('');
}
function stateFor(raw, settings) {
  const value = raw && typeof raw === 'object' ? raw : {}; const counters = {};
  if (value.counters && typeof value.counters === 'object') {
    for (const [key, count] of Object.entries(value.counters).slice(0, settings.maximumCounters)) {
      if (id(key) && Number.isSafeInteger(count)) counters[id(key)] = Math.min(1_000_000_000, Math.max(-1_000_000_000, count));
    }
  }
  const poll = value.poll && typeof value.poll === 'object' && Array.isArray(value.poll.options)
    ? { open: value.poll.open === true, question: text(value.poll.question, 180), options: value.poll.options.map((item) => text(item, 80)).filter(Boolean).slice(0, settings.maximumPollOptions), votes: value.poll.votes && typeof value.poll.votes === 'object' ? Object.fromEntries(Object.entries(value.poll.votes).filter(([key, choice]) => /^[a-f0-9]{64}$/u.test(key) && Number.isSafeInteger(choice)).slice(0, 5000)) : {} }
    : { open: false, question: '', options: [], votes: {} };
  return { accountSalt: /^[a-f0-9]{48}$/u.test(value.accountSalt) ? value.accountSalt : randomSalt(), counters, poll };
}
function moderator(event) {
  const roles = new Set((event.user?.roles || []).map((role) => text(role, 30).toLowerCase()));
  return roles.has('broadcaster') || roles.has('moderator') || roles.has('mod');
}
async function hashAccount(event, salt) {
  const raw = `${salt}|${event.platform}|${text(event.user?.id, 256)}`;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return [...new Uint8Array(bytes)].map((item) => item.toString(16).padStart(2, '0')).join('');
}
async function reply(context, event, message) {
  const maximum = LIMITS[event.platform] || 150; const source = Array.from(text(message, maximum * 2));
  const bounded = source.length <= maximum ? source.join('') : `${source.slice(0, maximum - 1).join('').trimEnd()}…`;
  try { return await context.chat.send({ message: bounded, routing: 'source', sourcePlatform: event.platform, overflow: 'reject' }); }
  catch { return []; }
}
async function process(event, context) {
  const settings = settingsFor(context); if (!settings.enabled) return;
  const state = stateFor(await context.state.read(), settings);
  if (event.eventType === 'stream.offline' && settings.closePollOnStreamEnd) { state.poll.open = false; await context.state.write(state); return; }
  if (event.eventType !== 'command.received' || event.metadata?.simulated === true || event.user?.actorType !== 'human') return;
  const command = id(event.payload?.command); const args = Array.isArray(event.payload?.arguments) ? event.payload.arguments.map((item) => text(item, 180)).filter(Boolean) : [];
  if (command === settings.counterCommand) {
    const name = id(args[0] || 'default'); if (!name) return reply(context, event, 'Usage: !counter name [show|+1|-1|reset]');
    const action = (args[1] || 'show').toLowerCase(); if (action !== 'show' && !moderator(event)) return reply(context, event, 'Only a moderator or broadcaster may change counters.');
    if (!Object.hasOwn(state.counters, name) && Object.keys(state.counters).length >= settings.maximumCounters) return reply(context, event, 'The counter limit has been reached.');
    const current = state.counters[name] || 0; if (action === '+1') state.counters[name] = current + 1; else if (action === '-1') state.counters[name] = current - 1; else if (action === 'reset') state.counters[name] = 0;
    await context.state.write(state); return reply(context, event, `${name}: ${String(state.counters[name] || 0)}`);
  }
  if (command === settings.pollCommand && moderator(event)) {
    const action = (args[0] || '').toLowerCase();
    if (action === 'open') {
      const parts = args.slice(1).join(' ').split('|').map((item) => text(item, 180)).filter(Boolean);
      if (parts.length < 3) return reply(context, event, `Usage: !${settings.pollCommand} open Question | Option 1 | Option 2`);
      state.poll = { open: true, question: parts[0], options: parts.slice(1, settings.maximumPollOptions + 1), votes: {} }; await context.state.write(state);
      return reply(context, event, `${state.poll.question} ${state.poll.options.map((item, index) => `${String(index + 1)}) ${item}`).join(' ')}`);
    }
    if (action === 'close') {
      state.poll.open = false; await context.state.write(state);
      const totals = state.poll.options.map((_item, index) => Object.values(state.poll.votes).filter((choice) => choice === index).length);
      const result = state.poll.options.map((item, index) => `${item}: ${String(totals[index])}`).join(' • ');
      try { await context.overlay.publish(`${MODULE_ID}.result.show`, { title: state.poll.question || 'Poll results', text: text(result, 500), durationMs: 12_000 }); } catch { /* Overlay presentation is optional. */ }
      return reply(context, event, result || 'No poll is configured.');
    }
    if (action === 'reset') { state.poll = { open: false, question: '', options: [], votes: {} }; await context.state.write(state); return reply(context, event, 'Poll reset.'); }
    return reply(context, event, `Use !${settings.pollCommand} open, close, or reset.`);
  }
  if (command === settings.voteCommand) {
    if (!state.poll.open) return reply(context, event, 'There is no open poll.');
    const choice = Number(args[0]) - 1; if (!Number.isInteger(choice) || choice < 0 || choice >= state.poll.options.length) return reply(context, event, `Vote with !${settings.voteCommand} 1-${String(state.poll.options.length)}.`);
    state.poll.votes[await hashAccount(event, state.accountSalt)] = choice; await context.state.write(state); return reply(context, event, `Vote recorded for ${state.poll.options[choice]}.`);
  }
}
export default {
  manifest, required: false,
  async start(context) { operation = Promise.resolve(); const settings = settingsFor(context); await context.state.write(stateFor(await context.state.read(), settings)); },
  async stop() { await operation.catch(() => undefined); operation = Promise.resolve(); },
  async onEvent(event, context) { operation = operation.then(() => process(event, context), () => process(event, context)); await operation; },
};
export { stateFor };
