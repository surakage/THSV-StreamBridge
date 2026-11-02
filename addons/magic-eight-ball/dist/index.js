// Magic 8-Ball answers a viewer's yes-or-no question from a channel point reward or an optional chat
// command. The answer goes only to the chat the question came from, with an optional overlay card.
// No Streamer.bot import is needed: rewards and commands already arrive through the platform intakes.
const MODULE_ID = 'thsv.magic-eight-ball';
const COMMAND_PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok']);
const DEFAULT_ANSWERS = Object.freeze([
  'Absolutely, yes.', 'Signs point to yes.', 'Without a doubt.', 'Yes, and soon.', 'The village says yes.',
  'Most likely.', 'Looking good.', 'You can count on it.',
  'Ask again after a snack.', 'Too foggy to tell, try again.', 'The sloths are still thinking.', 'Better not say right now.',
  'Not today.', 'Doubtful.', 'My sources say no.', 'Very unlikely.', 'No, and the sloths agree.', 'Absolutely not.',
]);
const FALLBACKS = Object.freeze({
  enabled: false, twitchRewardId: '', kickRewardId: '', command: '', commandPlatforms: ['twitch', 'youtube', 'kick', 'tiktok'],
  answers: [], avoidRepeats: true, globalCooldownSeconds: 5, viewerCooldownSeconds: 30,
  answerMessage: '🎱 {viewer} asked "{question}" - {answer}', noQuestionMessage: '🎱 {viewer}, the 8-Ball says: {answer}',
  cooldownMessage: '{viewer}, the 8-Ball is resting. Ask again in {seconds}s.',
  showOverlay: true, overlaySeconds: 8, overlayTitle: 'Magic 8-Ball',
});

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Magic 8-Ball', version: '4.1.8',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.1.8', maximumTestedBridgeVersion: '4.1.8',
  dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: ['reward.redemption', 'command.received'],
  commandsProvided: [], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: [`data/addons/${MODULE_ID}/`, `data/addons/.state/${MODULE_ID}/`],
  installationSteps: [
    'Create a channel point reward on Twitch and/or Kick (for example "Magic 8-Ball"), turn on "Require viewer to enter text" so viewers can type a question, and paste each reward ID into its Twitch or Kick box.',
    'Optional: set a chat command such as ask. If you use !8ball, turn off the 8-Ball command in Village Fun Commands first so chat does not get two answers.',
    'Optional: add the overlay as a browser source (1920x1080) to show each question and answer on stream.',
    'Enable the extension and restart StreamBridge.',
  ],
  uninstallationSteps: ['Disable the extension and remove its browser source if you added one.'], migrations: [],
  healthChecks: [{ id: `${MODULE_ID}.runtime`, description: 'Confirms reward and command matching, cooldowns, and source-platform-only replies.' }],
};

let stopped = true;
let lastAnswerAt = 0;
let lastAnswer = '';
const viewerCooldowns = new Map();

function clean(value, maximum = 160) { return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '')].slice(0, maximum).join(''); }
function list(value, maximum, length) { return [...new Set((Array.isArray(value) ? value : []).map((item) => clean(item, length)).filter(Boolean))].slice(0, maximum); }
function integer(value, minimum, maximum, fallback) { const number = Number(value); return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback; }
function command(value) { return clean(value, 40).replace(/^!+/u, '').toLowerCase(); }
function format(template, values) { return clean(template, 500).replace(/\{(viewer|question|answer|seconds)\}/gu, (_, name) => String(values[name] ?? '')); }

export function settingsFor(context) {
  const raw = { ...FALLBACKS, ...(context?.settings ?? {}) };
  const answers = list(raw.answers, 100, 200);
  return {
    enabled: raw.enabled === true,
    // One reward per platform. Lists saved by 4.0.55 (twitchRewardIds, kickRewardIds) still count.
    twitchRewardIds: list([raw.twitchRewardId, ...(Array.isArray(raw.twitchRewardIds) ? raw.twitchRewardIds : [])], 10, 256),
    kickRewardIds: list([raw.kickRewardId, ...(Array.isArray(raw.kickRewardIds) ? raw.kickRewardIds : [])], 10, 256),
    command: command(raw.command), commandPlatforms: new Set(list(raw.commandPlatforms, 4, 20).filter((platform) => COMMAND_PLATFORMS.includes(platform))),
    answers: answers.length > 0 ? answers : [...DEFAULT_ANSWERS], avoidRepeats: raw.avoidRepeats !== false,
    globalCooldownSeconds: integer(raw.globalCooldownSeconds, 0, 3600, 5), viewerCooldownSeconds: integer(raw.viewerCooldownSeconds, 0, 3600, 30),
    answerMessage: clean(raw.answerMessage, 300) || FALLBACKS.answerMessage, noQuestionMessage: clean(raw.noQuestionMessage, 300) || FALLBACKS.noQuestionMessage,
    cooldownMessage: clean(raw.cooldownMessage, 300) || FALLBACKS.cooldownMessage,
    showOverlay: raw.showOverlay !== false, overlaySeconds: integer(raw.overlaySeconds, 3, 30, 8), overlayTitle: clean(raw.overlayTitle, 80) || FALLBACKS.overlayTitle,
  };
}

// Returns { question, paid } when the event asks the 8-Ball something, otherwise undefined.
export function resolveQuestion(event, settings) {
  if (event?.eventType === 'reward.redemption') {
    if (event.payload?.verifiedTransport !== true) return undefined;
    const id = clean(event.payload?.rewardId, 256);
    const ids = event.platform === 'twitch' ? settings.twitchRewardIds : event.platform === 'kick' ? settings.kickRewardIds : [];
    return id && ids.includes(id) ? { question: clean(event.payload?.input, 200), paid: true } : undefined;
  }
  if (event?.eventType !== 'command.received' || !settings.command || !settings.commandPlatforms.has(event.platform)) return undefined;
  if (command(event.payload?.command) !== settings.command) return undefined;
  const args = Array.isArray(event.payload?.arguments) ? event.payload.arguments.join(' ') : event.payload?.arguments;
  return { question: clean(args, 200), paid: false };
}

export function pickAnswer(settings, random = Math.random) {
  const choices = settings.avoidRepeats && settings.answers.length > 1 ? settings.answers.filter((answer) => answer !== lastAnswer) : settings.answers;
  lastAnswer = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
  return lastAnswer;
}

async function say(context, event, message) {
  if (message) await context.chat.send({ message, routing: 'source', sourcePlatform: event.platform, overflow: 'truncate' }).catch(() => undefined);
}

async function process(event, context) {
  const settings = settingsFor(context);
  if (!settings.enabled || event.metadata?.simulated === true) return;
  const request = resolveQuestion(event, settings); if (!request) return;
  const viewer = clean(event.user?.displayName || event.user?.name, 80) || 'Viewer';
  const id = clean(event.user?.id || event.user?.name, 120).toLowerCase();
  const now = Date.now();
  // Channel points were already spent, so a reward always gets an answer. Commands share the cooldowns.
  if (!request.paid) {
    if (!request.question) return;
    const wait = Math.max(lastAnswerAt + settings.globalCooldownSeconds * 1000 - now, id ? (viewerCooldowns.get(id) ?? 0) + settings.viewerCooldownSeconds * 1000 - now : 0);
    if (wait > 0) { await say(context, event, format(settings.cooldownMessage, { viewer, seconds: Math.ceil(wait / 1000) })); return; }
    if (id) { viewerCooldowns.set(id, now); if (viewerCooldowns.size > 500) viewerCooldowns.delete(viewerCooldowns.keys().next().value); }
  }
  lastAnswerAt = now;
  const answer = pickAnswer(settings);
  const values = { viewer, question: request.question, answer };
  await say(context, event, format(request.question ? settings.answerMessage : settings.noQuestionMessage, values));
  if (settings.showOverlay) {
    await context.overlay.publish(`${MODULE_ID}.card.show`, {
      title: `🎱 ${settings.overlayTitle}`, text: request.question ? `${viewer}: ${request.question}\n${answer}` : `${viewer}: ${answer}`,
      platform: event.platform, durationMs: settings.overlaySeconds * 1000,
    }, { lane: 'foreground' }).catch(() => undefined);
  }
}

export default {
  manifest, required: false,
  async start() { stopped = false; lastAnswerAt = 0; lastAnswer = ''; viewerCooldowns.clear(); },
  async stop() { stopped = true; viewerCooldowns.clear(); },
  async onEvent(event, context) { if (!stopped) await process(event, context); },
};

export { DEFAULT_ANSWERS, FALLBACKS, MODULE_ID, manifest };
