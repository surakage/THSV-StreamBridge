import { createHash, randomInt } from 'node:crypto';

const MODULE_ID = 'thsv.chat-play-pack';
const OPEN_TDB_ACTION_ID = 'd72d0873-8cbd-4dd5-a171-6b7122cd125e';
const OPEN_TDB_RESULT_EVENT = 'addon.thsv.chat-play-pack.trivia-received';
const DICTIONARY_ACTION_ID = '08cf5035-09ce-45b7-bef5-c5f7081d17f6';
const DICTIONARY_RESULT_EVENT = 'addon.thsv.chat-play-pack.unscramble-received';
const PLATFORMS = ['twitch', 'youtube', 'kick', 'tiktok'];
const VIEWER_ID = /^[a-z0-9][a-z0-9-]{7,63}$/u;
const PLATFORM_LIMITS = { twitch: 500, youtube: 200, kick: 500, tiktok: 150 };
const BUILT_IN_TRIVIA = [
  'What is the capital of France? | Paris', 'Which planet is the largest in our solar system? | Jupiter', 'At what temperature does water freeze in Celsius? | 0 | zero',
  'Which planet is known as the Red Planet? | Mars', 'How many continents are there? | 7 | seven', 'Who wrote Romeo and Juliet? | William Shakespeare | Shakespeare',
  'What is the chemical symbol for gold? | Au', 'Which is the largest ocean on Earth? | Pacific Ocean | Pacific', 'What is the fastest land animal? | Cheetah',
  'Which gas do plants absorb from the atmosphere? | Carbon dioxide | CO2', 'What is the square root of 64? | 8 | eight', 'Which instrument has keys, pedals, and strings? | Piano',
  'In which country are the Pyramids of Giza? | Egypt', 'What is the main language spoken in Brazil? | Portuguese', 'Which planet is famous for its rings? | Saturn',
  'What is the largest organ of the human body? | Skin', 'What color do red and blue make when mixed? | Purple | Violet', 'How many days are in a leap year? | 366 | three hundred sixty six',
  'What is the first month of the year? | January', 'What is a baby frog called? | Tadpole',
];
const BUILT_IN_UNSCRAMBLE = [
  'sloth | A slow-moving tree-dwelling mammal', 'village | A small community or settlement', 'forest | A large area covered with trees', 'stream | Live video sent over the internet',
  'camera | A device used to capture pictures or video', 'microphone | A device that captures sound', 'keyboard | A set of keys used for typing', 'lantern | A portable light with a protective case',
  'blossom | A flower or a period of flowering', 'adventure | An exciting or unusual experience', 'rainbow | An arc of colors seen after rain', 'treasure | Something valuable that is hidden or prized',
  'mountain | A very high natural elevation of land', 'ocean | A vast body of salt water', 'starlight | Light that comes from stars', 'community | A group connected by a shared place or interest',
  'creator | A person who makes something', 'gaming | The activity of playing video games', 'emerald | A bright green gemstone', 'friendship | A close relationship between friends',
];
const recentViewers = new Map();
const commandCooldowns = new Map();
const livePlatforms = new Set();
let operation = Promise.resolve();

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Chat Play Pack', version: '4.0.9',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.9', maximumTestedBridgeVersion: '4.0.9',
  dependencies: ['thsv.viewer-foundation'], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: ['chat.message', 'command.received', 'stream.online', 'stream.offline', OPEN_TDB_RESULT_EVENT, DICTIONARY_RESULT_EVENT],
  commandsProvided: [
    { id: 'chat-play.play', name: 'play' }, { id: 'chat-play.guess', name: 'guess' }, { id: 'chat-play.answer', name: 'answer' },
    { id: 'chat-play.predict', name: 'predict' }, { id: 'chat-play.coinflip', name: 'coinflip' }, { id: 'chat-play.slots', name: 'slots' },
    { id: 'chat-play.roulette', name: 'roulette' }, { id: 'chat-play.rps', name: 'rps' }, { id: 'chat-play.duel', name: 'duel' },
    { id: 'chat-play.accept', name: 'accept' }, { id: 'chat-play.decline', name: 'decline' },
  ],
  actionsProvided: [{ id: 'chat-play.fetch-trivia', name: 'Optional bounded OpenTDB question fetch' }, { id: 'chat-play.fetch-unscramble', name: 'Optional bounded dictionary word fetch' }], browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.chat-play-pack/', 'data/addons/.state/thsv.chat-play-pack/'],
  installationSteps: ['Install Viewer Foundation first.', 'Import Chat Play Pack only when using one of its two optional provider actions; viewer commands already use the main chat intakes.', 'Keep the imported actions triggerless because the existing platform intakes deliver public chat directly; approve only the fetch actions you enable.', 'Configure creator fallback questions and words before enabling provider-backed games.'],
  uninstallationSteps: ['Uninstalling preserves only bounded round statistics and pseudonymous Viewer Foundation IDs.'], migrations: [],
  healthChecks: [{ id: 'thsv.chat-play-pack.runtime', description: 'Confirms serialized rounds, bounded cooldowns, stable duel identities, trivia fallback, and idempotent Viewer Foundation awards.' }],
};

const clean = (value, maximum = 500) => String(value ?? '').replace(/[\u0000-\u001f\u007f]+/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, maximum);
const integer = (value, minimum, maximum, fallback) => Number.isSafeInteger(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
const bool = (value, fallback = false) => value === true || (value !== false && fallback);
const commandName = (value, fallback) => { const name = clean(value, 40).toLowerCase(); return /^[a-z][a-z0-9-]{0,39}$/u.test(name) ? name : fallback; };
const normalizedAnswer = (value) => clean(value, 180).normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const randomChoice = (items) => items[randomInt(items.length)];
const shuffled = (items) => { const result = [...items]; for (let index = result.length - 1; index > 0; index -= 1) { const other = randomInt(index + 1); [result[index], result[other]] = [result[other], result[index]]; } return result; };
const moderator = (event) => event.user?.roles?.some((role) => ['moderator', 'broadcaster'].includes(String(role).toLowerCase())) === true;
const digest = (value) => createHash('sha256').update(value).digest('hex').slice(0, 32);
const safeAvatarUrl = (value) => { const candidate = clean(value, 2_048); if (!candidate) return ''; try { const url = new URL(candidate); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } };
const eventAvatarUrl = (event) => safeAvatarUrl(event.user?.avatarUrl || event.user?.profileImageUrl);

function parseTrivia(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.map((line) => clean(line, 600).split('|').map((part) => clean(part, 240))).filter((parts) => parts.length >= 2 && parts[0] && parts[1]).slice(0, 200).map((parts) => ({
    question: parts[0], answers: [parts[1], ...(parts[2] ?? '').split(';')].map(normalizedAnswer).filter(Boolean).filter((answer, index, all) => all.indexOf(answer) === index), choices: [], category: 'Creator library', difficulty: 'custom',
  })).filter((entry) => entry.answers.length > 0);
}

function parseWords(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.map((line) => clean(line, 300).split('|').map((part) => clean(part, 180))).filter((parts) => parts[0] && normalizedAnswer(parts[0]).length >= 3).slice(0, 200).map((parts) => ({ word: parts[0], hint: parts[1] ?? '' }));
}

function settingsFor(context) {
  const raw = context.settings || {};
  const commands = {
    play: commandName(raw.playCommand, 'play'), guess: commandName(raw.guessCommand, 'guess'), answer: commandName(raw.answerCommand, 'answer'), predict: commandName(raw.predictCommand, 'predict'),
    coinflip: commandName(raw.coinFlipCommand, 'coinflip'), slots: commandName(raw.slotsCommand, 'slots'), roulette: commandName(raw.rouletteCommand, 'roulette'), rps: commandName(raw.rpsCommand, 'rps'),
    duel: commandName(raw.duelCommand, 'duel'), accept: commandName(raw.acceptCommand, 'accept'), decline: commandName(raw.declineCommand, 'decline'),
  };
  const commandValues = Object.values(commands);
  return {
    enabled: raw.enabled === true, commands, commandCollision: new Set(commandValues).size !== commandValues.length, commandPrefix: clean(raw.commandPrefix, 1) || '!',
    games: {
      number: raw.numberGuessEnabled !== false, trivia: raw.triviaEnabled !== false, prediction: raw.predictionEnabled !== false,
      coinflip: raw.coinFlipEnabled === true, slots: raw.slotsEnabled === true, roulette: raw.rouletteEnabled === true,
      rps: raw.rpsEnabled === true, unscramble: raw.unscrambleEnabled === true, duel: raw.duelEnabled === true,
    },
    rewards: {
      round: integer(raw.awardPoints, 0, 10_000, 25), coinflip: integer(raw.coinFlipPoints, 0, 10_000, 5), slotsMatch: integer(raw.slotsMatchPoints, 0, 10_000, 15),
      slotsJackpot: integer(raw.slotsJackpotPoints, 0, 10_000, 50), roulette: integer(raw.roulettePoints, 0, 10_000, 8), rouletteGreen: integer(raw.rouletteGreenPoints, 0, 10_000, 40),
      rps: integer(raw.rpsPoints, 0, 10_000, 10), unscramble: integer(raw.unscramblePoints, 0, 10_000, 25), duel: integer(raw.duelPoints, 0, 10_000, 20), trivia: integer(raw.triviaPoints, 0, 10_000, 25),
    },
    roundTimeoutSeconds: integer(raw.roundTimeoutSeconds, 15, 900, 120), instantCooldownSeconds: integer(raw.instantCooldownSeconds, 5, 3600, 30), duelCooldownSeconds: integer(raw.duelCooldownSeconds, 30, 86_400, 300),
    maximumPointsPerViewerPerHour: integer(raw.maximumPointsPerViewerPerHour, 10, 100_000, 250),
    triviaSource: ['creator', 'opentdb', 'mixed'].includes(raw.triviaSource) ? raw.triviaSource : 'creator', triviaQuestions: parseTrivia(Array.isArray(raw.triviaQuestions) && raw.triviaQuestions.length ? raw.triviaQuestions : BUILT_IN_TRIVIA),
    openTdbCategory: clean(raw.openTdbCategory, 3) || 'any', openTdbDifficulty: ['any', 'easy', 'medium', 'hard'].includes(raw.openTdbDifficulty) ? raw.openTdbDifficulty : 'any',
    openTdbType: ['any', 'multiple', 'boolean'].includes(raw.openTdbType) ? raw.openTdbType : 'any', openTdbBatchSize: integer(raw.openTdbBatchSize, 5, 20, 10),
    unscrambleSource: ['creator', 'dictionary', 'mixed'].includes(raw.unscrambleSource) ? raw.unscrambleSource : 'mixed',
    dictionaryBatchSize: integer(raw.dictionaryBatchSize, 3, 10, 5), dictionaryMinimumLength: integer(raw.dictionaryMinimumLength, 4, 12, 5), dictionaryMaximumLength: integer(raw.dictionaryMaximumLength, 4, 14, 9),
    unscrambleWords: parseWords(Array.isArray(raw.unscrambleWords) && raw.unscrambleWords.length ? raw.unscrambleWords : BUILT_IN_UNSCRAMBLE), duelRecentViewerMinutes: integer(raw.duelRecentViewerMinutes, 5, 120, 30),
    announceSharedRoundsEverywhere: bool(raw.announceSharedRoundsEverywhere, true), showOverlayResults: bool(raw.showOverlayResults, true),
  };
}

function cleanTrivia(entry) {
  if (!entry || typeof entry !== 'object') return undefined;
  const question = clean(entry.question, 240); const answers = Array.isArray(entry.answers) ? entry.answers.map(normalizedAnswer).filter(Boolean).slice(0, 8) : [];
  if (!question || answers.length === 0) return undefined;
  const choices = Array.isArray(entry.choices) ? entry.choices.map((item) => clean(item, 180)).filter(Boolean).slice(0, 6) : [];
  return { question, answers: [...new Set(answers)], choices: [...new Set(choices)], category: clean(entry.category, 80), difficulty: clean(entry.difficulty, 20), fingerprint: digest(`${question}\0${answers[0]}`) };
}

function cleanUnscramble(entry) {
  if (!entry || typeof entry !== 'object') return undefined;
  const word = clean(entry.word, 32).toLocaleLowerCase('en-US'); const hint = clean(entry.hint, 180);
  if (!/^[a-z]{4,14}$/u.test(word)) return undefined;
  return { word, hint };
}

function cleanRound(raw) {
  if (!raw || typeof raw !== 'object' || !Number.isSafeInteger(raw.startedAt) || raw.startedAt < 0) return null;
  if (raw.kind === 'number') { const maximum = integer(raw.maximum, 10, 1000, 0); return maximum && Number.isInteger(raw.target) && raw.target >= 1 && raw.target <= maximum ? { kind: 'number', target: raw.target, maximum, startedAt: raw.startedAt } : null; }
  if (raw.kind === 'trivia') { const question = clean(raw.question, 240); const answers = Array.isArray(raw.answers) ? raw.answers.map(normalizedAnswer).filter(Boolean).slice(0, 8) : [normalizedAnswer(raw.answer)]; const choices = Array.isArray(raw.choices) ? raw.choices.map((item) => clean(item, 180)).filter(Boolean).slice(0, 6) : []; return question && answers[0] ? { kind: 'trivia', question, answers: [...new Set(answers)], choices: [...new Set(choices)], startedAt: raw.startedAt } : null; }
  if (raw.kind === 'unscramble') { const scrambled = clean(raw.scrambled, 180); const answer = normalizedAnswer(raw.answer); return scrambled && answer ? { kind: 'unscramble', scrambled, answer, hint: clean(raw.hint, 180), startedAt: raw.startedAt } : null; }
  if (raw.kind === 'prediction') { const choices = Array.isArray(raw.choices) ? raw.choices.map((item) => clean(item, 120)).filter(Boolean).slice(0, 6) : []; if (choices.length < 2 || new Set(choices.map(normalizedAnswer)).size !== choices.length) return null; const votes = {}; if (raw.votes && typeof raw.votes === 'object') for (const [viewerId, choice] of Object.entries(raw.votes).slice(0, 100)) if (VIEWER_ID.test(viewerId) && Number.isInteger(choice) && choice >= 0 && choice < choices.length) votes[viewerId] = choice; return { kind: 'prediction', question: clean(raw.question, 180), choices, votes, startedAt: raw.startedAt }; }
  return null;
}

function stateFor(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const duels = Array.isArray(source.duels) ? source.duels.filter((item) => item && typeof item === 'object' && VIEWER_ID.test(item.challengerId) && VIEWER_ID.test(item.targetId) && item.challengerId !== item.targetId && PLATFORMS.includes(item.platform) && Number.isSafeInteger(item.createdAt)).slice(-50).map((item) => ({ id: clean(item.id, 80), challengerId: item.challengerId, challengerName: clean(item.challengerName, 80), challengerAvatarUrl: safeAvatarUrl(item.challengerAvatarUrl), targetId: item.targetId, targetName: clean(item.targetName, 80), targetAvatarUrl: safeAvatarUrl(item.targetAvatarUrl), platform: item.platform, createdAt: item.createdAt })) : [];
  const awardLog = Array.isArray(source.awardLog) ? source.awardLog.filter((item) => item && VIEWER_ID.test(item.viewerId) && Number.isSafeInteger(item.at) && Number.isSafeInteger(item.amount) && item.amount >= 0).slice(-1000).map((item) => ({ viewerId: item.viewerId, at: item.at, amount: item.amount })) : [];
  const apiTrivia = Array.isArray(source.apiTrivia) ? source.apiTrivia.map(cleanTrivia).filter(Boolean).slice(0, 50) : [];
  const apiUnscramble = Array.isArray(source.apiUnscramble) ? source.apiUnscramble.map(cleanUnscramble).filter(Boolean).slice(0, 30) : [];
  const pendingUnscramble = source.pendingUnscramble && typeof source.pendingUnscramble === 'object' && clean(source.pendingUnscramble.requestId, 100) ? { requestId: clean(source.pendingUnscramble.requestId, 100), platform: PLATFORMS.includes(source.pendingUnscramble.platform) ? source.pendingUnscramble.platform : 'twitch', requestedAt: integer(source.pendingUnscramble.requestedAt, 0, Number.MAX_SAFE_INTEGER, 0) } : null;
  return { round: cleanRound(source.round), roundSequence: integer(source.roundSequence, 0, 1_000_000_000, 0), completedRounds: integer(source.completedRounds, 0, 1_000_000_000, 0), duels, awardLog, apiTrivia, apiUnscramble, recentTrivia: Array.isArray(source.recentTrivia) ? source.recentTrivia.map((item) => clean(item, 32)).filter((item) => /^[a-f0-9]{32}$/u.test(item)).slice(-100) : [], pendingTrivia: source.pendingTrivia && typeof source.pendingTrivia === 'object' && clean(source.pendingTrivia.requestId, 100) ? { requestId: clean(source.pendingTrivia.requestId, 100), platform: PLATFORMS.includes(source.pendingTrivia.platform) ? source.pendingTrivia.platform : 'twitch', requestedAt: integer(source.pendingTrivia.requestedAt, 0, Number.MAX_SAFE_INTEGER, 0) } : null, pendingUnscramble, usedUnscramble: Array.isArray(source.usedUnscramble) ? source.usedUnscramble.map(normalizedAnswer).filter(Boolean).slice(-200) : [] };
}

async function say(context, eventOrPlatform, message, everywhere = false) {
  const platform = typeof eventOrPlatform === 'string' ? eventOrPlatform : eventOrPlatform.platform;
  const targets = everywhere ? [...livePlatforms].filter((item) => PLATFORMS.includes(item)) : [platform];
  const uniqueTargets = targets.length ? [...new Set(targets)] : [platform];
  for (const target of uniqueTargets) await context.chat.send({ platform: target, message: clean(message, PLATFORM_LIMITS[target] ?? 200), simulated: false }).catch(() => undefined);
}

async function gameOverlay(context, settings, gameKind, payload) {
  if (!settings.showOverlayResults) return;
  const durationMs = gameKind === 'duel' ? 300_000 : settings.roundTimeoutSeconds * 1_000;
  try { await context.overlay.publish(`${MODULE_ID}.result.show`, { cardKind: 'chat-play-game', gameKind, ...payload, durationMs, presentationMode: 'single' }, { lane: 'foreground' }); } catch { /* Chat remains authoritative when no browser source is open. */ }
}

async function winnerOverlay(context, settings, event, gameName, winnerName, points, avatarUrl = '') {
  if (!settings.showOverlayResults) return;
  const platform = PLATFORMS.includes(event.platform) ? event.platform : 'twitch';
  try {
    await context.overlay.publish(`${MODULE_ID}.result.show`, {
      cardKind: 'chat-play-winner', gameName: clean(gameName, 80), points: integer(points, 0, 100_000, 0),
      winner: { displayName: clean(winnerName, 100) || 'Viewer', platform, avatarUrl: safeAvatarUrl(avatarUrl) || eventAvatarUrl(event) },
      durationMs: 10_000, presentationMode: 'single',
    }, { lane: 'foreground' });
  } catch { /* Chat remains authoritative when no browser source is open. */ }
}

async function viewer(context, event) {
  const userId = clean(event.user?.id, 256); if (!userId) return undefined;
  return context.viewerFoundation.getProjection({ platform: event.platform, userId });
}

function pruneState(state, now) {
  state.awardLog = state.awardLog.filter((item) => now - item.at <= 3_600_000).slice(-1000);
  state.duels = state.duels.filter((item) => now - item.createdAt <= 300_000).slice(-50);
}

async function award(context, state, projection, amount, reason, idempotencyKey, settings, now) {
  if (!projection || !VIEWER_ID.test(projection.viewerId) || amount < 1) return { awarded: 0, capped: false };
  pruneState(state, now);
  const used = state.awardLog.filter((item) => item.viewerId === projection.viewerId).reduce((sum, item) => sum + item.amount, 0);
  const allowed = Math.max(0, settings.maximumPointsPerViewerPerHour - used); const awarded = Math.min(amount, allowed);
  if (awarded < 1) return { awarded: 0, capped: true };
  await context.viewerFoundation.mutate({ viewerId: projection.viewerId, operation: 'add', amount: awarded, reason: clean(reason, 120), idempotencyKey: clean(idempotencyKey, 128) });
  state.awardLog.push({ viewerId: projection.viewerId, at: now, amount: awarded }); state.awardLog = state.awardLog.slice(-1000);
  return { awarded, capped: awarded < amount };
}

function observeViewer(event, now, settings) {
  if (!PLATFORMS.includes(event.platform) || event.user?.actorType !== 'human' || !event.user?.id) return;
  const name = clean(event.user.displayName || event.user.name, 80); const normalized = normalizedAnswer(name).replace(/\s+/gu, ''); if (!name || !normalized) return;
  recentViewers.set(`${event.platform}:${normalized}`, { userId: clean(event.user.id, 256), displayName: name, avatarUrl: eventAvatarUrl(event), at: now });
  const cutoff = now - settings.duelRecentViewerMinutes * 60_000;
  for (const [key, value] of recentViewers) if (value.at < cutoff) recentViewers.delete(key);
  while (recentViewers.size > 500) recentViewers.delete(recentViewers.keys().next().value);
}

function coolingDown(event, command, seconds, now) {
  if (moderator(event)) return false;
  const userId = clean(event.user?.id, 256); if (!userId) return true;
  const key = `${event.platform}:${userId}:${command}`; const previous = commandCooldowns.get(key);
  if (Number.isFinite(previous) && now - previous < seconds * 1000) return true;
  commandCooldowns.set(key, now); while (commandCooldowns.size > 2000) commandCooldowns.delete(commandCooldowns.keys().next().value); return false;
}

function scramble(word) {
  const characters = [...word]; if (characters.length < 2) return word;
  for (let attempt = 0; attempt < 8; attempt += 1) { const result = [...characters]; for (let index = result.length - 1; index > 0; index -= 1) { const other = randomInt(index + 1); [result[index], result[other]] = [result[other], result[index]]; } const value = result.join(''); if (normalizedAnswer(value) !== normalizedAnswer(word)) return value; }
  return `${characters.slice(1).join('')}${characters[0]}`;
}

function selectUnscramble(settings, state) {
  const apiAllowed = settings.unscrambleSource !== 'creator'; const localAllowed = settings.unscrambleSource !== 'dictionary';
  const preferred = apiAllowed && state.apiUnscramble.length ? state.apiUnscramble : localAllowed ? settings.unscrambleWords : [];
  const unused = preferred.filter((entry) => !state.usedUnscramble.includes(normalizedAnswer(entry.word))); const pool = unused.length ? unused : preferred;
  if (!pool.length) return undefined; if (!unused.length) state.usedUnscramble = [];
  const selected = randomChoice(pool); state.usedUnscramble.push(normalizedAnswer(selected.word)); state.usedUnscramble = state.usedUnscramble.slice(-200);
  if (state.apiUnscramble.some((entry) => normalizedAnswer(entry.word) === normalizedAnswer(selected.word))) state.apiUnscramble = state.apiUnscramble.filter((entry) => normalizedAnswer(entry.word) !== normalizedAnswer(selected.word));
  return selected;
}

function selectTrivia(settings, state) {
  const local = settings.triviaQuestions.map((entry) => ({ ...entry, fingerprint: digest(`${entry.question}\0${entry.answers[0]}`) }));
  const apiAllowed = settings.triviaSource !== 'creator'; const localAllowed = settings.triviaSource !== 'opentdb';
  const preferred = apiAllowed && state.apiTrivia.length ? state.apiTrivia : localAllowed ? local : [];
  const candidatePool = preferred.filter((entry) => !state.recentTrivia.includes(entry.fingerprint));
  const fallbackPool = preferred; const pool = candidatePool.length ? candidatePool : fallbackPool;
  if (!pool.length) return undefined; if (!candidatePool.length) state.recentTrivia = [];
  const selected = randomChoice(pool); state.recentTrivia.push(selected.fingerprint); state.recentTrivia = state.recentTrivia.slice(-100);
  if (state.apiTrivia.some((entry) => entry.fingerprint === selected.fingerprint)) state.apiTrivia = state.apiTrivia.filter((entry) => entry.fingerprint !== selected.fingerprint);
  return selected;
}

async function startTriviaRound(context, state, settings, platform) {
  const question = selectTrivia(settings, state); if (!question) return false;
  state.roundSequence += 1; state.round = { kind: 'trivia', question: question.question, answers: question.answers, choices: shuffled(question.choices ?? []), startedAt: Date.now() }; await context.state.write(state);
  const choices = state.round.choices.length ? ` Choices: ${state.round.choices.map((choice, index) => `${index + 1}) ${choice}`).join(' ')}` : '';
  await say(context, platform, `TRIVIA: ${question.question}${choices} Answer with !${settings.commands.answer}.`, settings.announceSharedRoundsEverywhere);
  await gameOverlay(context, settings, 'trivia', { gameName: 'Trivia', prompt: question.question, choices: state.round.choices, instruction: `Answer with !${settings.commands.answer}` }); return true;
}

async function requestTrivia(context, state, settings, platform, eventId) {
  const requestId = clean(`trivia-${eventId}-${Date.now()}`, 100); state.pendingTrivia = { requestId, platform, requestedAt: Date.now() }; await context.state.write(state);
  try { await context.streamerbot.runApprovedAction(OPEN_TDB_ACTION_ID, { requestId, amount: settings.openTdbBatchSize, category: settings.openTdbCategory, difficulty: settings.openTdbDifficulty, questionType: settings.openTdbType }); await say(context, platform, 'Fetching a fresh trivia set. The round will start when it is ready.'); return true; }
  catch { state.pendingTrivia = null; await context.state.write(state); return false; }
}

async function startUnscrambleRound(context, state, settings, platform) {
  const selected = selectUnscramble(settings, state); if (!selected) return false;
  state.roundSequence += 1; state.round = { kind: 'unscramble', scrambled: scramble(selected.word), answer: normalizedAnswer(selected.word), hint: selected.hint, startedAt: Date.now() }; await context.state.write(state);
  const hint = selected.hint ? ` Hint: ${selected.hint}.` : ''; await say(context, platform, `UNSCRAMBLE: ${state.round.scrambled}.${hint} Answer with !${settings.commands.answer}.`, settings.announceSharedRoundsEverywhere);
  await gameOverlay(context, settings, 'unscramble', { gameName: 'Unscramble', prompt: state.round.scrambled, hint: selected.hint, instruction: `Answer with !${settings.commands.answer}` }); return true;
}

async function requestUnscramble(context, state, settings, platform, eventId) {
  const requestId = clean(`unscramble-${eventId}-${Date.now()}`, 100); state.pendingUnscramble = { requestId, platform, requestedAt: Date.now() }; await context.state.write(state);
  const minimumLength = Math.min(settings.dictionaryMinimumLength, settings.dictionaryMaximumLength); const maximumLength = Math.max(settings.dictionaryMinimumLength, settings.dictionaryMaximumLength);
  try { await context.streamerbot.runApprovedAction(DICTIONARY_ACTION_ID, { requestId, amount: settings.dictionaryBatchSize, minimumLength, maximumLength }); await say(context, platform, 'Fetching a fresh dictionary word set. The round will start when it is ready.'); return true; }
  catch { state.pendingUnscramble = null; await context.state.write(state); return false; }
}

async function finishRound(context, event, state, settings, projection, name, reward, label) {
  const result = await award(context, state, projection, reward, `Chat Play ${label} winner`, `${event.eventId}-${state.roundSequence}-${label}`, settings, Date.now());
  state.round = null; state.completedRounds += 1; await context.state.write(state);
  const suffix = result.awarded > 0 ? ` +${result.awarded} points.` : result.capped ? ' Hourly reward cap reached.' : '';
  await say(context, event, `${name} wins ${label}!${suffix}`); await winnerOverlay(context, settings, event, label, name, result.awarded);
}

async function processTriviaResult(event, context, settings) {
  const state = stateFor(await context.state.read()); const requestId = clean(event.payload?.requestId, 100);
  if (!state.pendingTrivia || state.pendingTrivia.requestId !== requestId) return;
  const platform = state.pendingTrivia.platform; state.pendingTrivia = null;
  const supplied = Array.isArray(event.payload?.questions) ? event.payload.questions.map(cleanTrivia).filter(Boolean).slice(0, 50) : [];
  if (event.payload?.succeeded === true && supplied.length) { const known = new Set(state.apiTrivia.map((entry) => entry.fingerprint)); for (const entry of supplied) if (!known.has(entry.fingerprint)) { state.apiTrivia.push(entry); known.add(entry.fingerprint); } state.apiTrivia = state.apiTrivia.slice(-50); await context.state.write(state); if (!state.round) await startTriviaRound(context, state, settings, platform); return; }
  await context.state.write(state); if (settings.triviaSource === 'mixed' && !state.round && await startTriviaRound(context, state, settings, platform)) return;
  await say(context, platform, 'Trivia could not load and no creator fallback question is available.');
}

async function processUnscrambleResult(event, context, settings) {
  const state = stateFor(await context.state.read()); const requestId = clean(event.payload?.requestId, 100);
  if (!state.pendingUnscramble || state.pendingUnscramble.requestId !== requestId) return;
  const platform = state.pendingUnscramble.platform; state.pendingUnscramble = null;
  const supplied = Array.isArray(event.payload?.words) ? event.payload.words.map(cleanUnscramble).filter(Boolean).slice(0, 30) : [];
  if (event.payload?.succeeded === true && supplied.length) { const known = new Set(state.apiUnscramble.map((entry) => normalizedAnswer(entry.word))); for (const entry of supplied) if (!known.has(normalizedAnswer(entry.word))) { state.apiUnscramble.push(entry); known.add(normalizedAnswer(entry.word)); } state.apiUnscramble = state.apiUnscramble.slice(-30); await context.state.write(state); if (!state.round) await startUnscrambleRound(context, state, settings, platform); return; }
  await context.state.write(state); if (settings.unscrambleSource === 'mixed' && !state.round && await startUnscrambleRound(context, state, settings, platform)) return;
  await say(context, platform, 'Unscramble words could not load and no creator fallback word is available.');
}

async function instantGame(event, context, state, settings, game, args, now) {
  if (!settings.games[game] || coolingDown(event, game, settings.instantCooldownSeconds, now)) return;
  const projection = await viewer(context, event); if (!projection) return;
  const name = clean(event.user?.displayName || event.user?.name, 80) || 'Viewer'; let message = ''; let points = 0; let won = false;
  if (game === 'coinflip') { const choice = normalizedAnswer(args[0]); if (!['heads', 'tails'].includes(choice)) return say(context, event, `Use !${settings.commands.coinflip} heads or tails.`); const result = randomInt(2) === 0 ? 'heads' : 'tails'; won = choice === result; if (won) points = settings.rewards.coinflip; message = `${name} called ${choice}. The coin landed ${result}.`; }
  if (game === 'slots') { const symbols = ['🍒', '🍋', '🌿', '🔔', '⭐']; const reels = [randomChoice(symbols), randomChoice(symbols), randomChoice(symbols)]; const counts = new Map(); for (const symbol of reels) counts.set(symbol, (counts.get(symbol) ?? 0) + 1); const maximum = Math.max(...counts.values()); if (maximum === 3) points = settings.rewards.slotsJackpot; else if (maximum === 2) points = settings.rewards.slotsMatch; message = `${name} spun ${reels.join(' | ')}.`; }
  if (game === 'roulette') { const choice = normalizedAnswer(args[0]); if (!['red', 'black', 'green'].includes(choice)) return say(context, event, `Use !${settings.commands.roulette} red, black, or green.`); const number = randomInt(37); const result = number === 0 ? 'green' : number % 2 === 0 ? 'black' : 'red'; won = choice === result; if (won) points = result === 'green' ? settings.rewards.rouletteGreen : settings.rewards.roulette; message = `${name} chose ${choice}. The wheel landed ${number} ${result}.`; }
  if (game === 'rps') { const choice = normalizedAnswer(args[0]); const choices = ['rock', 'paper', 'scissors']; if (!choices.includes(choice)) return say(context, event, `Use !${settings.commands.rps} rock, paper, or scissors.`); const computer = randomChoice(choices); won = (choice === 'rock' && computer === 'scissors') || (choice === 'paper' && computer === 'rock') || (choice === 'scissors' && computer === 'paper'); if (won) points = settings.rewards.rps; message = `${name}: ${choice}. Computer: ${computer}. ${choice === computer ? 'Draw!' : won ? `${name} wins!` : 'Computer wins.'}`; }
  if (game === 'slots' && points > 0) won = true;
  const result = await award(context, state, projection, points, `Chat Play ${game} win`, `${event.eventId}-${game}`, settings, now); await context.state.write(state);
  const suffix = result.awarded ? ` +${result.awarded} points.` : result.capped && points ? ' Hourly reward cap reached.' : ''; await say(context, event, `${message}${suffix}`);
  if (won) await winnerOverlay(context, settings, event, game === 'rps' ? 'Rock Paper Scissors' : game[0].toUpperCase() + game.slice(1), name, result.awarded);
}

async function processDuel(event, context, state, settings, command, args, now) {
  const projection = await viewer(context, event); if (!projection || !VIEWER_ID.test(projection.viewerId)) return;
  const name = clean(event.user?.displayName || event.user?.name, 80) || 'Viewer'; pruneState(state, now);
  if (command === settings.commands.duel) {
    const targetName = normalizedAnswer(args.join(' ').replace(/^@/u, '')).replace(/\s+/gu, ''); const recent = recentViewers.get(`${event.platform}:${targetName}`);
    if (!recent) return say(context, event, 'That viewer must have chatted recently on this platform before they can be challenged.');
    const targetProjection = await context.viewerFoundation.getProjection({ platform: event.platform, userId: recent.userId }); if (!targetProjection || targetProjection.viewerId === projection.viewerId) return say(context, event, 'Choose another recently active viewer.');
    if (state.duels.some((duel) => [duel.challengerId, duel.targetId].includes(projection.viewerId) || [duel.challengerId, duel.targetId].includes(targetProjection.viewerId))) return say(context, event, 'One of those viewers already has a pending duel.');
    if (coolingDown(event, 'duel', settings.duelCooldownSeconds, now)) return;
    const duel = { id: digest(`${event.eventId}\0${targetProjection.viewerId}`), challengerId: projection.viewerId, challengerName: name, challengerAvatarUrl: eventAvatarUrl(event), targetId: targetProjection.viewerId, targetName: recent.displayName, targetAvatarUrl: recent.avatarUrl, platform: event.platform, createdAt: now }; state.duels.push(duel); await context.state.write(state); await say(context, event, `${recent.displayName}, ${name} challenged you! Use !${settings.commands.accept} or !${settings.commands.decline} within 5 minutes.`); await gameOverlay(context, settings, 'duel', { gameName: 'Viewer Duel', challenger: name, opponent: recent.displayName, instruction: `Use !${settings.commands.accept} or !${settings.commands.decline}` }); return;
  }
  const duel = state.duels.find((item) => item.targetId === projection.viewerId); if (!duel) return say(context, event, 'You do not have a pending duel.');
  state.duels = state.duels.filter((item) => item.id !== duel.id);
  if (command === settings.commands.decline) { await context.state.write(state); return say(context, event, `${name} declined the duel.`); }
  const challengerWins = randomInt(2) === 0; const winnerId = challengerWins ? duel.challengerId : duel.targetId; const winnerName = challengerWins ? duel.challengerName : duel.targetName;
  const result = await award(context, state, { viewerId: winnerId }, settings.rewards.duel, 'Chat Play duel winner', `duel-${duel.id}-${winnerId}`, settings, now); await context.state.write(state);
  const suffix = result.awarded ? ` +${result.awarded} points.` : result.capped ? ' Hourly reward cap reached.' : ''; await say(context, event, `DUEL: ${duel.challengerName} vs ${duel.targetName}. ${winnerName} wins!${suffix}`); await winnerOverlay(context, settings, event, 'Viewer Duel', winnerName, result.awarded, challengerWins ? duel.challengerAvatarUrl : duel.targetAvatarUrl);
}

function incomingCommand(event, settings) {
  if (event.eventType === 'chat.message') {
    const message = typeof event.payload?.message === 'string' ? event.payload.message.trim() : '';
    if (!message.startsWith(settings.commandPrefix)) return undefined;
    const input = message.slice(settings.commandPrefix.length).trimStart(); if (!input) return undefined;
    const separator = input.search(/\s/u); const command = commandName(separator < 0 ? input : input.slice(0, separator), '');
    const remainder = separator < 0 ? '' : input.slice(separator).trim();
    return command ? { command, arguments: remainder ? remainder.split(/\s+/u).map((item) => clean(item, 180)).filter(Boolean) : [] } : undefined;
  }
  // Direct command adapters remain compatible. The bridge-derived copy is ignored
  // because its original normalized chat message was already handled above.
  if (event.eventType === 'command.received' && event.source?.eventName !== 'NormalizedCommand') {
    const command = commandName(event.payload?.command, ''); const args = Array.isArray(event.payload?.arguments) ? event.payload.arguments.map((item) => clean(item, 180)).filter(Boolean) : [];
    return command ? { command, arguments: args } : undefined;
  }
  return undefined;
}

async function process(event, context) {
  const settings = settingsFor(context); if (!settings.enabled || settings.commandCollision) return;
  const now = Date.now(); observeViewer(event, now, settings);
  if (event.eventType === OPEN_TDB_RESULT_EVENT) return processTriviaResult(event, context, settings);
  if (event.eventType === DICTIONARY_RESULT_EVENT) return processUnscrambleResult(event, context, settings);
  if (event.eventType === 'stream.online' && event.metadata?.simulated !== true && PLATFORMS.includes(event.platform)) { livePlatforms.add(event.platform); return; }
  if (event.eventType === 'stream.offline' && event.metadata?.simulated !== true && PLATFORMS.includes(event.platform)) { livePlatforms.delete(event.platform); if (livePlatforms.size) return; const state = stateFor(await context.state.read()); state.round = null; state.duels = []; state.pendingTrivia = null; state.pendingUnscramble = null; await context.state.write(state); return; }
  if (event.metadata?.simulated === true || event.user?.actorType !== 'human' || !PLATFORMS.includes(event.platform)) return;
  const incoming = incomingCommand(event, settings); if (!incoming) return;
  const command = incoming.command; const allCommands = Object.values(settings.commands); if (!allCommands.includes(command)) return;
  const state = stateFor(await context.state.read()); const args = incoming.arguments; pruneState(state, now);
  if (state.round && now - state.round.startedAt > settings.roundTimeoutSeconds * 1000) { const expired = state.round; state.round = null; await context.state.write(state); await say(context, event, `${expired.kind} round expired.`); }
  if (command === settings.commands.coinflip) return instantGame(event, context, state, settings, 'coinflip', args, now);
  if (command === settings.commands.slots) return instantGame(event, context, state, settings, 'slots', args, now);
  if (command === settings.commands.roulette) return instantGame(event, context, state, settings, 'roulette', args, now);
  if (command === settings.commands.rps) return instantGame(event, context, state, settings, 'rps', args, now);
  if (settings.games.duel && [settings.commands.duel, settings.commands.accept, settings.commands.decline].includes(command)) return processDuel(event, context, state, settings, command, args, now);
  if (command === settings.commands.play && moderator(event)) {
    const kind = normalizedAnswer(args[0]); if (kind === 'stop') { state.round = null; await context.state.write(state); return say(context, event, 'Chat Play round stopped.'); }
    if (state.round) return say(context, event, 'A shared game is already running. Use play stop first.');
    if (kind === 'number' && settings.games.number) { const maximum = integer(Number(args[1]), 10, 1000, 100); state.roundSequence += 1; state.round = { kind: 'number', target: randomInt(1, maximum + 1), maximum, startedAt: now }; await context.state.write(state); return say(context, event, `Guess a number from 1-${maximum} with !${settings.commands.guess}.`, settings.announceSharedRoundsEverywhere); }
    if (kind === 'unscramble' && settings.games.unscramble) { if (settings.unscrambleSource !== 'creator' && state.apiUnscramble.length === 0) { if (await requestUnscramble(context, state, settings, event.platform, event.eventId)) return; if (settings.unscrambleSource === 'mixed' && await startUnscrambleRound(context, state, settings, event.platform)) return; return say(context, event, 'Connect the optional dictionary action or add a creator fallback word first.'); } if (await startUnscrambleRound(context, state, settings, event.platform)) return; return say(context, event, 'Add creator fallback words or connect the optional dictionary action first.'); }
    if (kind === 'trivia' && settings.games.trivia) { if (settings.triviaSource !== 'creator' && state.apiTrivia.length === 0) { if (await requestTrivia(context, state, settings, event.platform, event.eventId)) return; if (settings.triviaSource === 'mixed' && await startTriviaRound(context, state, settings, event.platform)) return; return say(context, event, 'Connect the optional OpenTDB action or add a creator fallback question first.'); } if (await startTriviaRound(context, state, settings, event.platform)) return; return say(context, event, 'Add creator fallback questions or connect the optional OpenTDB action first.'); }
    return say(context, event, 'Use play number, play trivia, play unscramble, or play stop.');
  }
  if (command === settings.commands.guess && state.round?.kind === 'number') { const guess = Number(args[0]); if (!Number.isInteger(guess) || guess < 1 || guess > state.round.maximum) return say(context, event, `Guess 1-${state.round.maximum}.`); if (guess !== state.round.target) return say(context, event, guess < state.round.target ? 'Higher.' : 'Lower.'); return finishRound(context, event, state, settings, await viewer(context, event), clean(event.user?.displayName || event.user?.name, 80) || 'Viewer', settings.rewards.round, 'Number Guess'); }
  if (command === settings.commands.answer && (state.round?.kind === 'trivia' || state.round?.kind === 'unscramble')) { const answer = normalizedAnswer(args.join(' ')); const numberedChoice = state.round.kind === 'trivia' && /^\d+$/u.test(answer) ? state.round.choices[Number(answer) - 1] : undefined; const valid = state.round.kind === 'trivia' ? state.round.answers.includes(numberedChoice === undefined ? answer : normalizedAnswer(numberedChoice)) : state.round.answer === answer; if (!valid) return; const reward = state.round.kind === 'trivia' ? settings.rewards.trivia : settings.rewards.unscramble; const label = state.round.kind === 'trivia' ? 'Trivia' : 'Unscramble'; return finishRound(context, event, state, settings, await viewer(context, event), clean(event.user?.displayName || event.user?.name, 80) || 'Viewer', reward, label); }
  if (command === settings.commands.predict && settings.games.prediction) {
    const action = normalizedAnswer(args[0]); if (moderator(event) && action === 'open') { if (state.round) return say(context, event, 'A shared game is already running.'); const parts = args.slice(1).join(' ').split('|').map((item) => clean(item, 120)).filter(Boolean); if (parts.length < 3) return say(context, event, 'Usage: !predict open Question | Choice 1 | Choice 2'); const choices = parts.slice(1, 7); if (new Set(choices.map(normalizedAnswer)).size !== choices.length) return say(context, event, 'Prediction choices must be different.'); state.roundSequence += 1; state.round = { kind: 'prediction', question: parts[0], choices, votes: {}, startedAt: now }; await context.state.write(state); return say(context, event, `${parts[0]} ${choices.map((item, index) => `${index + 1}) ${item}`).join(' ')}`, settings.announceSharedRoundsEverywhere); }
    if (moderator(event) && action === 'resolve' && state.round?.kind === 'prediction') { const choice = Number(args[1]) - 1; if (!Number.isInteger(choice) || choice < 0 || choice >= state.round.choices.length) return say(context, event, 'Choose a valid winning option number.'); const winners = Object.entries(state.round.votes).filter((entry) => entry[1] === choice).map((entry) => entry[0]); for (const winnerId of winners) await award(context, state, { viewerId: winnerId }, settings.rewards.round, 'Chat Play prediction winner', `prediction-${state.roundSequence}-${winnerId}`, settings, now); const label = state.round.choices[choice]; state.round = null; state.completedRounds += 1; await context.state.write(state); return say(context, event, `${label} wins. ${winners.length} correct prediction(s).`, settings.announceSharedRoundsEverywhere); }
    if (state.round?.kind === 'prediction') { const choice = Number(args[0]) - 1; if (!Number.isInteger(choice) || choice < 0 || choice >= state.round.choices.length) return say(context, event, `Vote 1-${state.round.choices.length}.`); const projection = await viewer(context, event); if (!projection || !VIEWER_ID.test(projection.viewerId)) return; if (!Object.hasOwn(state.round.votes, projection.viewerId) && Object.keys(state.round.votes).length >= 100) return say(context, event, 'This prediction has reached its safe voter limit.'); state.round.votes[projection.viewerId] = choice; await context.state.write(state); return say(context, event, 'Prediction recorded.'); }
  }
}

export default {
  manifest, required: false,
  async start(context) { operation = Promise.resolve(); livePlatforms.clear(); recentViewers.clear(); commandCooldowns.clear(); await context.state.write(stateFor(await context.state.read())); },
  async stop() { await operation.catch(() => undefined); operation = Promise.resolve(); livePlatforms.clear(); recentViewers.clear(); commandCooldowns.clear(); },
  async onEvent(event, context) { operation = operation.then(() => process(event, context), () => process(event, context)); await operation; },
};
