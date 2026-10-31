// Polls & Predictions: shows native Twitch polls, Twitch predictions and YouTube polls on stream as live
// cards with vote bars, a countdown and the winner highlighted. Results come straight from Streamer.bot's
// own poll and prediction events, so no Streamer.bot import or trigger is needed. Nothing is saved.
const MODULE_ID = 'thsv.polls-predictions';
export const SOURCES = Object.freeze({
  'twitch-polls': { eventType: 'engagement.poll', platform: 'twitch' },
  'twitch-predictions': { eventType: 'engagement.prediction', platform: 'twitch' },
  'youtube-polls': { eventType: 'engagement.poll', platform: 'youtube' },
});
const FINAL_PHASES = Object.freeze(['ended', 'resolved', 'canceled']);
const POSITIONS = Object.freeze(['top-left', 'top-right', 'bottom-left', 'bottom-right']);

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Polls & Predictions', version: '4.1.0',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.1.0', maximumTestedBridgeVersion: '4.1.0',
  dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: ['engagement.poll', 'engagement.prediction'],
  commandsProvided: [], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: [`data/addons/${MODULE_ID}/`, `data/addons/.state/${MODULE_ID}/`],
  installationSteps: [
    'Pick which polls and predictions to show and how the cards look.',
    'Add the overlay as a browser source (1920x1080) in the scenes where the cards should show.',
    'Enable the extension and restart StreamBridge.',
  ],
  uninstallationSteps: ['Disable the extension and remove its browser source.'], migrations: [],
  healthChecks: [{ id: `${MODULE_ID}.runtime`, description: 'Confirms poll and prediction cards, results and hiding after the result.' }],
};

let stopped = true;
const cards = new Map();
const hideTimers = new Map();

function clean(value, maximum = 160) { return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '')].slice(0, maximum).join(''); }
function integer(value, minimum, maximum, fallback) { const number = Number(value); return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback; }
function whole(value) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? Math.min(Math.floor(number), 1_000_000_000) : 0; }

export function settingsFor(context) {
  const raw = context?.settings ?? {};
  const sources = (Array.isArray(raw.sources) ? raw.sources : Object.keys(SOURCES)).filter((id, index, all) => Object.hasOwn(SOURCES, id) && all.indexOf(id) === index);
  return {
    enabled: raw.enabled !== false, sources,
    maximumCards: integer(raw.maximumCards, 1, 3, 2),
    hideAfterResult: raw.hideAfterResult !== false, resultSeconds: integer(raw.resultSeconds, 3, 300, 15),
    showPercentages: raw.showPercentages !== false, showCounts: raw.showCounts !== false, showTimer: raw.showTimer !== false,
    votesLabel: clean(raw.votesLabel, 20) || 'votes', pointsLabel: clean(raw.pointsLabel, 20) || 'points',
    playSounds: raw.playSounds === true, soundVolume: integer(raw.soundVolume, 0, 100, 40),
    position: POSITIONS.includes(raw.position) ? raw.position : 'top-right',
  };
}

/** Which of the creator's sources an event belongs to, or undefined when it is not shown. */
export function sourceFor(event, settings) {
  return settings.sources.find((id) => SOURCES[id].eventType === event?.eventType && SOURCES[id].platform === event?.platform);
}

/** A bounded card from the bridge's normalized poll or prediction payload. */
export function cardFrom(event) {
  const payload = event?.payload ?? {};
  const prediction = event?.eventType === 'engagement.prediction';
  const choices = (Array.isArray(prediction ? payload.outcomes : payload.options) ? (prediction ? payload.outcomes : payload.options) : []).slice(0, 10)
    .filter((choice) => choice && typeof choice === 'object')
    .map((choice, index) => prediction
      ? { title: clean(choice.title, 120) || `Outcome ${String(index + 1)}`, count: whole(choice.points), people: whole(choice.users), color: choice.color === 'pink' ? 'pink' : 'blue' }
      : { title: clean(choice.title, 120) || `Option ${String(index + 1)}`, count: whole(choice.votes) });
  const total = choices.reduce((sum, choice) => sum + choice.count, 0);
  const phase = ['open', 'locked', 'ended', 'resolved', 'canceled', 'removed'].includes(payload.phase) ? payload.phase : 'open';
  const winners = prediction
    ? (Number.isInteger(payload.winnerIndex) && payload.winnerIndex >= 0 && payload.winnerIndex < choices.length ? [payload.winnerIndex] : [])
    : (Array.isArray(payload.winnerIndexes) ? payload.winnerIndexes.filter((index) => Number.isInteger(index) && index >= 0 && index < choices.length) : []);
  const closesAt = clean(prediction ? payload.locksAt : payload.endsAt, 40);
  return {
    key: `${prediction ? 'prediction' : 'poll'}:${event.platform}:${clean(payload.id, 100)}`,
    kind: prediction ? 'prediction' : 'poll', platform: event.platform === 'youtube' ? 'youtube' : 'twitch', phase,
    title: clean(payload.title, 200) || (prediction ? 'Prediction' : 'Poll'),
    choices: choices.map((choice) => ({ ...choice, percentage: total > 0 ? Math.round(choice.count / total * 1000) / 10 : 0 })),
    total, winners, ...(closesAt && !Number.isNaN(Date.parse(closesAt)) ? { closesAt } : {}),
  };
}

/** The overlay payload: newest cards first, open ones kept ahead of finished ones when space runs out. */
export function boardView(settings, list = [...cards.values()]) {
  const ordered = [...list].sort((left, right) => right.updatedOrder - left.updatedOrder);
  const open = ordered.filter((card) => !FINAL_PHASES.includes(card.phase));
  const finished = ordered.filter((card) => FINAL_PHASES.includes(card.phase));
  const shown = [...open, ...finished].slice(0, settings.maximumCards).sort((left, right) => left.startedOrder - right.startedOrder);
  return {
    cards: shown.map(({ updatedOrder, startedOrder, ...card }) => card),
    style: {
      showPercentages: settings.showPercentages, showCounts: settings.showCounts, showTimer: settings.showTimer,
      votesLabel: settings.votesLabel, pointsLabel: settings.pointsLabel,
      playSounds: settings.playSounds, soundVolume: settings.soundVolume, position: settings.position,
    },
  };
}

let order = 0;
async function publish(context, settings) {
  if (cards.size === 0) { await context.overlay.publish(`${MODULE_ID}.polls.hide`, {}, { lane: 'persistent' }).catch(() => undefined); return; }
  await context.overlay.publish(`${MODULE_ID}.polls.update`, boardView(settings), { lane: 'persistent' }).catch(() => undefined);
}

function forget(key) { clearTimeout(hideTimers.get(key)); hideTimers.delete(key); cards.delete(key); }

async function process(event, context) {
  const settings = settingsFor(context);
  if (!settings.enabled || sourceFor(event, settings) === undefined) return;
  const card = cardFrom(event);
  if (card.phase === 'removed') { if (!cards.has(card.key)) return; forget(card.key); await publish(context, settings); return; }
  const previous = cards.get(card.key);
  order += 1;
  cards.set(card.key, { ...card, startedOrder: previous?.startedOrder ?? order, updatedOrder: order });
  clearTimeout(hideTimers.get(card.key)); hideTimers.delete(card.key);
  if (FINAL_PHASES.includes(card.phase) && settings.hideAfterResult) {
    hideTimers.set(card.key, setTimeout(() => { if (stopped) return; forget(card.key); void publish(context, settingsFor(context)); }, settings.resultSeconds * 1_000));
  }
  // Cards that can no longer be shown are dropped so the list never grows during a long stream.
  const visible = new Set(boardView(settings).cards.map((shown) => shown.key));
  for (const key of [...cards.keys()]) if (!visible.has(key) && FINAL_PHASES.includes(cards.get(key).phase)) forget(key);
  await publish(context, settings);
}

export function resetForTests() { for (const key of [...cards.keys()]) forget(key); order = 0; }

export default {
  manifest, required: false,
  async start() { stopped = false; },
  async stop() { stopped = true; for (const key of [...cards.keys()]) forget(key); },
  async onEvent(event, context) { if (!stopped) await process(event, context); },
};
