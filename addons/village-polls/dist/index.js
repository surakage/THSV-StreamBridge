// Village Polls provides one bounded poll shared across supported platform chats.
const MODULE_ID = 'thsv.village-polls';
const LIMITS = Object.freeze({ twitch: 500, youtube: 200, kick: 500, tiktok: 150 });
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok']);
const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Village Polls', version: '3.0.0',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '3.0.0', maximumTestedBridgeVersion: '3.0.0',
  dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json', eventSubscriptions: ['chat.message', 'command.received', 'stream.online', 'stream.offline'],
  commandsProvided: [{ id: 'village-polls.vote', name: 'vote' }, { id: 'village-polls.poll', name: 'poll' }],
  actionsProvided: [], browserSourcesProvided: [], dataStorageOwned: ['data/addons/thsv.village-polls/', 'data/addons/.state/thsv.village-polls/'],
  installationSteps: ['Turn on Village Polls and keep the default command prefix and names for the easiest setup.', 'Keep platform chat triggers on the main THSV intake actions; no separate poll commands or triggers are required in Streamer.bot.', 'Restart StreamBridge after saving the add-on settings.', 'Open and close one test poll, confirm announcements reach the supported chats, and add the Village Polls browser source when result cards should appear on stream.'],
  uninstallationSteps: ['Uninstalling preserves the current poll definition and private vote state.'], migrations: [],
  healthChecks: [{ id: 'thsv.village-polls.runtime', description: 'Confirms bounded universal poll state, private hashed cross-platform voting, chat announcements, source confirmations, and result-overlay output are available.' }],
};
let operation = Promise.resolve();
const livePlatforms = new Set();
const commandCooldowns = new Map();
const recentlyHandledCommands = new Map();

function text(value, maximum = 300) {
  return Array.from(typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]+/gu, ' ').replace(/\s+/gu, ' ').trim() : '').slice(0, maximum).join('');
}
function id(value) {
  const result = text(value, 40).toLowerCase().replace(/[^a-z0-9-]/gu, '-').replace(/^-+|-+$/gu, '');
  return /^[a-z][a-z0-9-]{0,39}$/u.test(result) ? result : '';
}
function settingsFor(context) {
  const raw = context.settings || {};
  const pollCommand = id(raw.pollCommand) || 'poll'; const voteCommand = id(raw.voteCommand) || 'vote';
  return {
    enabled: raw.enabled === true, pollCommand, voteCommand, commandCollision: pollCommand === voteCommand,
    commandPrefix: typeof raw.commandPrefix === 'string' && raw.commandPrefix.length === 1 && !/\s/u.test(raw.commandPrefix) ? raw.commandPrefix : '!',
    closePollOnStreamEnd: raw.closePollOnStreamEnd !== false,
    maximumPollOptions: Number.isInteger(raw.maximumPollOptions) ? Math.min(10, Math.max(2, raw.maximumPollOptions)) : 6,
  };
}
function randomSalt() {
  const bytes = new Uint8Array(24); crypto.getRandomValues(bytes);
  return [...bytes].map((item) => item.toString(16).padStart(2, '0')).join('');
}
function stateFor(raw, settings) {
  const value = raw && typeof raw === 'object' ? raw : {};
  let poll = { open: false, question: '', options: [], votes: {} };
  if (value.poll && typeof value.poll === 'object' && Array.isArray(value.poll.options)) {
    const options = value.poll.options.map((item) => text(item, 80)).filter(Boolean).slice(0, settings.maximumPollOptions);
    if (options.length >= 2 && new Set(options.map((item) => item.toLowerCase())).size === options.length) {
      const votes = value.poll.votes && typeof value.poll.votes === 'object' ? Object.fromEntries(Object.entries(value.poll.votes).filter(([key, choice]) => /^[a-f0-9]{64}$/u.test(key) && Number.isSafeInteger(choice) && choice >= 0 && choice < options.length).slice(0, 5000)) : {};
      poll = { open: value.poll.open === true, question: text(value.poll.question, 180), options, votes };
    }
  }
  return { accountSalt: /^[a-f0-9]{48}$/u.test(value.accountSalt) ? value.accountSalt : randomSalt(), poll };
}
function moderator(event) {
  const roles = new Set((event.user?.roles || []).map((role) => text(role, 30).toLowerCase()));
  return roles.has('broadcaster') || roles.has('moderator') || roles.has('mod');
}
function coolingDown(event, commandName, now = Date.now()) {
  const userId = text(event.user?.id, 256); if (!userId) return true;
  const key = `${event.platform}:${userId}:${commandName}`; const previous = commandCooldowns.get(key);
  if (Number.isFinite(previous) && now - previous < 3_000) return true;
  commandCooldowns.set(key, now); if (commandCooldowns.size > 2_000) commandCooldowns.delete(commandCooldowns.keys().next().value); return false;
}
async function hashAccount(event, salt) {
  const raw = `${salt}|${event.platform}|${text(event.user?.id, 256)}`;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return [...new Uint8Array(bytes)].map((item) => item.toString(16).padStart(2, '0')).join('');
}
async function reply(context, event, message) {
  const maximum = LIMITS[event.platform] || 150; const source = Array.from(text(message, maximum * 2));
  const bounded = source.length <= maximum ? source.join('') : `${source.slice(0, maximum - 1).join('').trimEnd()}…`;
  const deliveries = await context.chat.send({ message: bounded, routing: 'source', sourcePlatform: event.platform, overflow: 'reject' });
  if (deliveries.length > 0 && !deliveries.some((delivery) => delivery.accepted)) throw new Error(`Village Polls could not reply on ${event.platform}: ${deliveries.map((delivery) => delivery.error || 'delivery rejected').join('; ')}`);
  return deliveries;
}
async function announce(context, message) {
  const deliveries = await context.chat.send({ message: text(message, 1_000), routing: 'selected', selectedPlatforms: PLATFORMS, overflow: 'split' });
  if (deliveries.length > 0 && !deliveries.some((delivery) => delivery.accepted)) throw new Error(`Village Polls announcement failed on every platform: ${deliveries.map((delivery) => `${delivery.platform}: ${delivery.error || 'delivery rejected'}`).join('; ')}`);
  return deliveries;
}
function commandFrom(event, settings) {
  if (event.eventType === 'command.received') {
    const command = id(event.payload?.command);
    const args = Array.isArray(event.payload?.arguments) ? event.payload.arguments.map((item) => text(item, 180)).filter(Boolean) : [];
    return command ? { command, args, rawInput: text(event.payload?.rawInput, 1_000) || `${settings.commandPrefix}${command}${args.length ? ` ${args.join(' ')}` : ''}` } : undefined;
  }
  if (event.eventType !== 'chat.message') return undefined;
  const message = text(event.payload?.message, 1_000);
  if (!message.startsWith(settings.commandPrefix)) return undefined;
  const input = message.slice(settings.commandPrefix.length).trim(); if (!input) return undefined;
  const separator = input.search(/\s/u); const invoked = separator < 0 ? input : input.slice(0, separator);
  const command = id(invoked); if (!command) return undefined;
  const remainder = separator < 0 ? '' : input.slice(separator).trim();
  return { command, args: remainder ? remainder.split(/\s+/u).map((item) => text(item, 180)).filter(Boolean) : [], rawInput: message };
}
function duplicateCommand(event, parsed, now = Date.now()) {
  const key = `${event.platform}|${text(event.user?.id, 256)}|${event.receivedAt || ''}|${parsed.command}|${parsed.rawInput}`;
  const previous = recentlyHandledCommands.get(key); recentlyHandledCommands.set(key, now);
  const cutoff = now - 10_000; while ((recentlyHandledCommands.values().next().value ?? Number.POSITIVE_INFINITY) < cutoff) recentlyHandledCommands.delete(recentlyHandledCommands.keys().next().value);
  if (recentlyHandledCommands.size > 2_000) recentlyHandledCommands.delete(recentlyHandledCommands.keys().next().value);
  return Number.isFinite(previous) && now - previous < 10_000;
}
async function closePoll(context, state, announceResults) {
  if (state.poll.question === '' || state.poll.options.length < 2) return false;
  state.poll.open = false; await context.state.write(state);
  const totals = state.poll.options.map((_item, index) => Object.values(state.poll.votes).filter((choice) => choice === index).length);
  const result = state.poll.options.map((item, index) => `${item}: ${String(totals[index])}`).join(' • ');
  let overlayError;
  try { await context.overlay.publish(`${MODULE_ID}.result.show`, { title: state.poll.question || 'Poll results', text: text(result, 500), durationMs: 12_000 }); } catch (error) { overlayError = error; }
  if (announceResults) await announce(context, `Poll results — ${state.poll.question}: ${result}`);
  if (overlayError) throw overlayError;
  return true;
}
async function process(event, context) {
  const settings = settingsFor(context); if (!settings.enabled || settings.commandCollision) return;
  if (event.eventType === 'stream.online' && event.metadata?.simulated !== true && LIMITS[event.platform]) { livePlatforms.add(event.platform); return; }
  if (event.eventType === 'stream.offline' && event.metadata?.simulated !== true && LIMITS[event.platform]) { livePlatforms.delete(event.platform); if (settings.closePollOnStreamEnd && livePlatforms.size === 0) { const state = stateFor(await context.state.read(), settings); if (state.poll.open) await closePoll(context, state, false); } return; }
  if (event.metadata?.simulated === true || event.user?.actorType !== 'human' || !LIMITS[event.platform]) return;
  const parsed = commandFrom(event, settings); if (!parsed || duplicateCommand(event, parsed)) return;
  const { command, args } = parsed;
  if (![settings.pollCommand, settings.voteCommand].includes(command) || (!moderator(event) && coolingDown(event, command))) return;
  const state = stateFor(await context.state.read(), settings);
  if (command === settings.pollCommand && !moderator(event)) return reply(context, event, 'Only a moderator or broadcaster may manage polls.');
  if (command === settings.pollCommand) {
    const action = (args[0] || '').toLowerCase();
    if (action === 'open') {
      const parts = args.slice(1).join(' ').split('|').map((item) => text(item, 180)).filter(Boolean);
      if (parts.length < 3) return reply(context, event, `Usage: !${settings.pollCommand} open Question | Option 1 | Option 2`);
      const options = parts.slice(1, settings.maximumPollOptions + 1); if (new Set(options.map((item) => item.toLowerCase())).size !== options.length) return reply(context, event, 'Poll choices must be different.');
      state.poll = { open: true, question: parts[0], options, votes: {} }; await context.state.write(state);
      return announce(context, `${state.poll.question} ${state.poll.options.map((item, index) => `${String(index + 1)}) ${item}`).join(' ')} Vote with !${settings.voteCommand} 1-${String(state.poll.options.length)}.`);
    }
    if (action === 'close') {
      if (state.poll.question === '' || state.poll.options.length < 2) return reply(context, event, 'No poll is configured.');
      return closePoll(context, state, true);
    }
    if (action === 'reset') { state.poll = { open: false, question: '', options: [], votes: {} }; await context.state.write(state); return reply(context, event, 'Poll reset.'); }
    return reply(context, event, `Use !${settings.pollCommand} open, close, or reset.`);
  }
  if (command === settings.voteCommand) {
    if (!state.poll.open) return reply(context, event, 'There is no open poll.');
    const choice = Number(args[0]) - 1; if (!Number.isInteger(choice) || choice < 0 || choice >= state.poll.options.length) return reply(context, event, `Vote with !${settings.voteCommand} 1-${String(state.poll.options.length)}.`);
    const voter = await hashAccount(event, state.accountSalt);
    if (!Object.hasOwn(state.poll.votes, voter) && Object.keys(state.poll.votes).length >= 5_000) return reply(context, event, 'This poll has reached its voter limit.');
    state.poll.votes[voter] = choice; await context.state.write(state); return reply(context, event, `Vote recorded for ${state.poll.options[choice]}.`);
  }
}
export default {
  manifest, required: false,
  async start(context) { operation = Promise.resolve(); livePlatforms.clear(); commandCooldowns.clear(); recentlyHandledCommands.clear(); const settings = settingsFor(context); await context.state.write(stateFor(await context.state.read(), settings)); },
  async stop() { await operation.catch(() => undefined); operation = Promise.resolve(); livePlatforms.clear(); commandCooldowns.clear(); recentlyHandledCommands.clear(); },
  async onEvent(event, context) { operation = operation.then(() => process(event, context), () => process(event, context)); await operation; },
};
export { stateFor };
