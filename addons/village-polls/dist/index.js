// Village Polls provides one bounded poll shared across supported platform chats.
const MODULE_ID = 'thsv.village-polls';
const LIMITS = Object.freeze({ twitch: 500, youtube: 200, kick: 500, tiktok: 150 });
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok']);
const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Village Polls', version: '4.0.4',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.4', maximumTestedBridgeVersion: '4.0.4',
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
let closeTask;
let updateTask;

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
    pollDurationSeconds: Number.isInteger(raw.pollDurationSeconds) ? Math.min(3600, Math.max(0, raw.pollDurationSeconds)) : 120,
    resultSeconds: Number.isInteger(raw.resultSeconds) ? Math.min(60, Math.max(5, raw.resultSeconds)) : 12,
    showPercentages: raw.showPercentages !== false, showVoteCounts: raw.showVoteCounts !== false,
    showTimer: raw.showTimer !== false, showPlatformBreakdown: raw.showPlatformBreakdown === true,
    layout: raw.layout === 'compact' ? 'compact' : 'full', transition: ['fade', 'slide', 'pop'].includes(raw.transition) ? raw.transition : 'slide',
    backgroundColor: /^#[0-9a-f]{6}$/iu.test(raw.backgroundColor || '') ? raw.backgroundColor : '#111923',
    backgroundOpacity: Number.isFinite(raw.backgroundOpacity) ? Math.min(0.95, Math.max(0.2, raw.backgroundOpacity)) : 0.72,
    accentColor: /^#[0-9a-f]{6}$/iu.test(raw.accentColor || '') ? raw.accentColor : '#7ff5cc',
    textColor: /^#[0-9a-f]{6}$/iu.test(raw.textColor || '') ? raw.textColor : '#ffffff',
  };
}
function randomSalt() {
  const bytes = new Uint8Array(24); crypto.getRandomValues(bytes);
  return [...bytes].map((item) => item.toString(16).padStart(2, '0')).join('');
}
function stateFor(raw, settings) {
  const value = raw && typeof raw === 'object' ? raw : {};
  let poll = { open: false, question: '', options: [], votes: {}, openedAt: '', closesAt: '' };
  if (value.poll && typeof value.poll === 'object' && Array.isArray(value.poll.options)) {
    const options = value.poll.options.map((item) => text(item, 80)).filter(Boolean).slice(0, settings.maximumPollOptions);
    if (options.length >= 2 && new Set(options.map((item) => item.toLowerCase())).size === options.length) {
      const votes = value.poll.votes && typeof value.poll.votes === 'object' ? Object.fromEntries(Object.entries(value.poll.votes).map(([key, vote]) => {
        const legacy = Number.isSafeInteger(vote) ? { choice: vote, platform: 'unknown' } : vote;
        const choice = legacy && typeof legacy === 'object' ? legacy.choice : -1; const platform = legacy && typeof legacy === 'object' && PLATFORMS.includes(legacy.platform) ? legacy.platform : 'unknown';
        return [key, { choice, platform }];
      }).filter(([key, vote]) => /^[a-f0-9]{64}$/u.test(key) && Number.isSafeInteger(vote.choice) && vote.choice >= 0 && vote.choice < options.length).slice(0, 5000)) : {};
      poll = { open: value.poll.open === true, question: text(value.poll.question, 180), options, votes, openedAt: text(value.poll.openedAt, 40), closesAt: text(value.poll.closesAt, 40) };
    }
  }
  return { accountSalt: /^[a-f0-9]{48}$/u.test(value.accountSalt) ? value.accountSalt : randomSalt(), poll };
}
function clearTasks(context) { if (closeTask) context.schedule?.cancel(closeTask); if (updateTask) context.schedule?.cancel(updateTask); closeTask = undefined; updateTask = undefined; }
function pollPayload(state, settings, status) {
  const values = Object.values(state.poll.votes); const totalVotes = values.length;
  const totals = state.poll.options.map((_item, index) => values.filter((vote) => vote.choice === index).length);
  const highest = totals.length ? Math.max(...totals) : 0; const winnerIndexes = status === 'closed' && highest > 0 ? totals.map((count, index) => count === highest ? index : -1).filter((index) => index >= 0) : [];
  return {
    cardKind: 'village-polls', state: status, question: state.poll.question, totalVotes, openedAt: state.poll.openedAt, closesAt: state.poll.closesAt,
    options: state.poll.options.map((label, index) => ({ index: index + 1, label, votes: totals[index], percentage: totalVotes ? Math.round((totals[index] / totalVotes) * 100) : 0,
      platforms: Object.fromEntries(PLATFORMS.map((platform) => [platform, values.filter((vote) => vote.choice === index && vote.platform === platform).length])) })),
    winnerIndexes, durationMs: status === 'closed' ? settings.resultSeconds * 1000 : 0,
    style: { layout: settings.layout, showPercentages: settings.showPercentages, showVoteCounts: settings.showVoteCounts, showTimer: settings.showTimer, showPlatformBreakdown: settings.showPlatformBreakdown, transition: settings.transition, backgroundColor: settings.backgroundColor, backgroundOpacity: settings.backgroundOpacity, accentColor: settings.accentColor, textColor: settings.textColor },
  };
}
async function publishPoll(context, state, settings, status) { await context.overlay.publish(`${MODULE_ID}.poll.update`, pollPayload(state, settings, status), { lane: 'persistent' }); }
function scheduleUpdate(context) {
  if (updateTask || !context.schedule?.after) return;
  updateTask = context.schedule.after(1_000, () => { updateTask = undefined; operation = operation.then(async () => { const settings = settingsFor(context); const state = stateFor(await context.state.read(), settings); if (state.poll.open) await publishPoll(context, state, settings, 'open'); }); });
}
function armClose(context, state, settings) {
  if (closeTask) context.schedule?.cancel(closeTask); closeTask = undefined;
  if (!context.schedule?.after) return;
  if (!state.poll.open || !state.poll.closesAt) return;
  const delay = Date.parse(state.poll.closesAt) - Date.now();
  if (delay <= 0) { closeTask = context.schedule.after(1_000, () => { operation = operation.then(async () => { const fresh = stateFor(await context.state.read(), settingsFor(context)); if (fresh.poll.open) await closePoll(context, fresh, true); }); }); return; }
  closeTask = context.schedule.after(Math.max(1_000, delay), () => { closeTask = undefined; operation = operation.then(async () => { const fresh = stateFor(await context.state.read(), settingsFor(context)); if (fresh.poll.open) await closePoll(context, fresh, true); }); });
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
  if (closeTask) context.schedule?.cancel(closeTask); if (updateTask) context.schedule?.cancel(updateTask); closeTask = undefined; updateTask = undefined;
  state.poll.open = false; await context.state.write(state); const settings = settingsFor(context);
  const totals = state.poll.options.map((_item, index) => Object.values(state.poll.votes).filter((vote) => vote.choice === index).length);
  const result = state.poll.options.map((item, index) => `${item}: ${String(totals[index])}`).join(' • ');
  let overlayError;
  try { await publishPoll(context, state, settings, 'closed'); } catch (error) { overlayError = error; }
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
      const openedAt = new Date().toISOString(); const closesAt = settings.pollDurationSeconds > 0 ? new Date(Date.now() + settings.pollDurationSeconds * 1000).toISOString() : '';
      state.poll = { open: true, question: parts[0], options, votes: {}, openedAt, closesAt }; await context.state.write(state); await publishPoll(context, state, settings, 'open'); armClose(context, state, settings);
      return announce(context, `${state.poll.question} ${state.poll.options.map((item, index) => `${String(index + 1)}) ${item}`).join(' ')} Vote with !${settings.voteCommand} 1-${String(state.poll.options.length)}.`);
    }
    if (action === 'close') {
      if (state.poll.question === '' || state.poll.options.length < 2) return reply(context, event, 'No poll is configured.');
      return closePoll(context, state, true);
    }
    if (action === 'reset') { clearTasks(context); state.poll = { open: false, question: '', options: [], votes: {}, openedAt: '', closesAt: '' }; await context.state.write(state); await context.overlay.publish(`${MODULE_ID}.poll.hide`, {}); return reply(context, event, 'Poll reset.'); }
    return reply(context, event, `Use !${settings.pollCommand} open, close, or reset.`);
  }
  if (command === settings.voteCommand) {
    if (!state.poll.open) return reply(context, event, 'There is no open poll.');
    const choice = Number(args[0]) - 1; if (!Number.isInteger(choice) || choice < 0 || choice >= state.poll.options.length) return reply(context, event, `Vote with !${settings.voteCommand} 1-${String(state.poll.options.length)}.`);
    const voter = await hashAccount(event, state.accountSalt);
    if (!Object.hasOwn(state.poll.votes, voter) && Object.keys(state.poll.votes).length >= 5_000) return reply(context, event, 'This poll has reached its voter limit.');
    state.poll.votes[voter] = { choice, platform: event.platform }; await context.state.write(state); scheduleUpdate(context); return reply(context, event, `Vote recorded for ${state.poll.options[choice]}.`);
  }
}
export default {
  manifest, required: false,
  async start(context) { operation = Promise.resolve(); livePlatforms.clear(); commandCooldowns.clear(); recentlyHandledCommands.clear(); clearTasks(context); const settings = settingsFor(context); const state = stateFor(await context.state.read(), settings); await context.state.write(state); if (state.poll.open) { await publishPoll(context, state, settings, 'open'); armClose(context, state, settings); } },
  async stop(context) { clearTasks(context); await operation.catch(() => undefined); operation = Promise.resolve(); livePlatforms.clear(); commandCooldowns.clear(); recentlyHandledCommands.clear(); },
  async onEvent(event, context) { operation = operation.then(() => process(event, context), () => process(event, context)); await operation; },
};
export { stateFor };
