// Quote Vault owns one bounded, local quote library for Twitch, YouTube, Kick, and
// TikTok. Public chat is parsed only for configured quote commands; ordinary chat
// text is never retained. Viewer submissions are pending until a moderator approves.
const CONTROL_EVENT = 'addon.thsv.quote-vault.control';
const SYNC_RESULT_EVENT = 'addon.thsv.quote-vault.sync-result';
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok']);
const MAXIMUM_STATE_BYTES = 60_000;
const MAXIMUM_APPROVED_QUOTES = 150;
const MAXIMUM_PENDING_QUOTES = 30;
const MAXIMUM_DELETED_QUOTES = 20;
const MAXIMUM_AUDIT_ENTRIES = 40;
const MAXIMUM_COOLDOWNS = 250;
const LEGACY_QUOTE_MESSAGE_TEMPLATE = 'Quote #{id}: “{quote}” — {quotedName}';

const manifest = {
  contractVersion: '2.0.0-preview.1',
  moduleId: 'thsv.quote-vault',
  name: 'Quote Vault',
  version: '4.0.3',
  minimumCoreVersion: '2.0.0-preview.1',
  maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.3', maximumTestedBridgeVersion: '4.0.3',
  dependencies: [],
  requiredCapabilities: [],
  configurationSchema: 'schemas/config.json',
  eventSubscriptions: ['chat.message', CONTROL_EVENT, SYNC_RESULT_EVENT],
  commandsProvided: [
    { id: 'quote-vault.quote', name: 'quote - random, ID, or search' },
    { id: 'quote-vault.quotes', name: 'quotes - count or quoted-person lookup' },
    { id: 'quote-vault.submit', name: 'quotesubmit - moderated viewer submission' },
    { id: 'quote-vault.add', name: 'quoteadd - trusted direct addition' },
    { id: 'quote-vault.approve', name: 'quoteapprove - approve a pending quote' },
    { id: 'quote-vault.reject', name: 'quotereject - reject a pending quote' },
    { id: 'quote-vault.pending', name: 'quotepending - review pending IDs' },
    { id: 'quote-vault.edit', name: 'quoteedit - edit an approved quote' },
    { id: 'quote-vault.delete', name: 'quotedelete - soft-delete a quote' },
    { id: 'quote-vault.restore', name: 'quoterestore - restore a deleted quote' },
    { id: 'quote-vault.stats', name: 'quotestats - library counts' },
  ],
  actionsProvided: [
    { id: 'quote-vault.random', name: 'Optional creator-triggered random quote' },
    { id: 'quote-vault.stats', name: 'Optional creator-triggered library statistics' },
  ],
  browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.quote-vault/', 'data/addons/.state/thsv.quote-vault/'],
  installationSteps: [
    'Install and configure Quote Vault. No separate platform chat trigger is required.',
    'Choose enabled platforms, command names, submission permissions, and safety limits.',
    'Import the optional Quote Vault Streamer.bot package only if creator-triggered random or statistics actions are wanted.',
    'Use the wizard Quote library to add, edit, approve, delete, or restore quotes. Moderator submissions are approved automatically.',
  ],
  uninstallationSteps: ['Export or record wanted quotes before uninstalling. Private Quote Vault state remains preserved for a later reinstall.'],
  migrations: [],
  healthChecks: [{ id: 'thsv.quote-vault.runtime', description: 'Confirms bounded cross-platform quote commands, moderation, storage, and source-routed responses.' }],
};

const FALLBACKS = Object.freeze({
  enabled: true,
  enabledPlatforms: PLATFORMS,
  commandPrefix: '!',
  quoteCommand: 'quote',
  quotesCommand: 'quotes',
  submitCommand: 'quotesubmit',
  addCommand: 'quoteadd',
  approveCommand: 'quoteapprove',
  rejectCommand: 'quotereject',
  pendingCommand: 'quotepending',
  editCommand: 'quoteedit',
  deleteCommand: 'quotedelete',
  restoreCommand: 'quoterestore',
  statsCommand: 'quotestats',
  communitySubmissionRole: 'viewer',
  directAddRole: 'moderator',
  ignoreBots: true,
  ignoredUsers: ['twitch:nightbot', 'twitch:streamelements', 'youtube:streamelements', 'kick:streamelements', 'twitch:fossabot', 'twitch:moobot', 'twitch:sery_bot', 'twitch:soundalerts', 'twitch:wizebot', 'twitch:kofistreambot', 'twitch:streamlabs', 'twitch:botrix', 'youtube:botrix', 'kick:botrix', 'tiktok:botrix'],
  allowLinks: false,
  maximumQuoteCharacters: 240,
  maximumApprovedQuotes: 100,
  maximumPendingQuotes: 20,
  userSubmissionCooldownSeconds: 60,
  userRetrievalCooldownSeconds: 10,
  globalCommandCooldownSeconds: 6,
  moderatorBypassCooldowns: true,
  streamerBotSyncEnabled: false,
  streamerBotSyncActionId: 'df4ee3e7-cee1-48e7-b301-5533d57c11d8',
  starterQuotes: [],
  quoteMessageTemplate: '{quote}',
  submittedMessageTemplate: 'Quote #{id} was submitted for moderator approval.',
  addedMessageTemplate: 'Quote #{id} was added.',
  approvedMessageTemplate: 'Quote #{id} was approved.',
  rejectedMessageTemplate: 'Quote #{id} was rejected.',
  editedMessageTemplate: 'Quote #{id} was updated.',
  deletedMessageTemplate: 'Quote #{id} was moved to recoverable trash.',
  restoredMessageTemplate: 'Quote #{id} was restored.',
  duplicateMessage: 'That quote is already approved or waiting for review.',
  permissionMessage: 'You do not have permission to use that Quote Vault command.',
  invalidUsageMessage: 'Use {prefix}{submitCommand} @name | quote text, or reply with {prefix}{submitCommand}.',
  notFoundMessage: 'No matching quote was found.',
  libraryFullMessage: 'Quote Vault is full. A moderator must remove a quote before another can be added.',
});

let operation = Promise.resolve();

function cleanText(value, maximum = 500) {
  const normalized = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '';
  return [...normalized].slice(0, maximum).join('');
}

function cleanName(value, maximum = 100) {
  return cleanText(value, maximum).replace(/^@+/u, '');
}

function integer(value, minimum, maximum, fallback) {
  return Number.isInteger(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function commandName(value, fallback) {
  const normalized = cleanText(value, 64).toLocaleLowerCase('en-US');
  return /^[a-z][a-z0-9-]{0,63}$/u.test(normalized) ? normalized : fallback;
}

function settingsFor(context) {
  const raw = { ...FALLBACKS, ...(context.settings ?? {}) };
  const parsed = {
    ...raw,
    enabledPlatforms: Array.isArray(raw.enabledPlatforms) ? raw.enabledPlatforms.filter((platform) => PLATFORMS.includes(platform)) : PLATFORMS,
    ignoredUsers: Array.isArray(raw.ignoredUsers) ? raw.ignoredUsers.slice(0, 500) : [],
    starterQuotes: Array.isArray(raw.starterQuotes) ? raw.starterQuotes.slice(0, 30) : [],
    // Upgrade the original attribution-heavy default in place. Creator-authored templates remain
    // untouched, but existing installs no longer append a name when viewers use !quote.
    quoteMessageTemplate: cleanText(raw.quoteMessageTemplate, 1000) === LEGACY_QUOTE_MESSAGE_TEMPLATE
      ? FALLBACKS.quoteMessageTemplate
      : cleanText(raw.quoteMessageTemplate, 1000) || FALLBACKS.quoteMessageTemplate,
    commandPrefix: cleanText(raw.commandPrefix, 1) || '!',
    quoteCommand: commandName(raw.quoteCommand, FALLBACKS.quoteCommand),
    quotesCommand: commandName(raw.quotesCommand, FALLBACKS.quotesCommand),
    submitCommand: commandName(raw.submitCommand, FALLBACKS.submitCommand),
    addCommand: commandName(raw.addCommand, FALLBACKS.addCommand),
    approveCommand: commandName(raw.approveCommand, FALLBACKS.approveCommand),
    rejectCommand: commandName(raw.rejectCommand, FALLBACKS.rejectCommand),
    pendingCommand: commandName(raw.pendingCommand, FALLBACKS.pendingCommand),
    editCommand: commandName(raw.editCommand, FALLBACKS.editCommand),
    deleteCommand: commandName(raw.deleteCommand, FALLBACKS.deleteCommand),
    restoreCommand: commandName(raw.restoreCommand, FALLBACKS.restoreCommand),
    statsCommand: commandName(raw.statsCommand, FALLBACKS.statsCommand),
    maximumQuoteCharacters: integer(raw.maximumQuoteCharacters, 40, 400, 240),
    maximumApprovedQuotes: integer(raw.maximumApprovedQuotes, 10, MAXIMUM_APPROVED_QUOTES, 100),
    maximumPendingQuotes: integer(raw.maximumPendingQuotes, 1, MAXIMUM_PENDING_QUOTES, 20),
    userSubmissionCooldownSeconds: integer(raw.userSubmissionCooldownSeconds, 0, 3600, 60),
    userRetrievalCooldownSeconds: integer(raw.userRetrievalCooldownSeconds, 0, 600, 10),
    globalCommandCooldownSeconds: integer(raw.globalCommandCooldownSeconds, 6, 60, 6),
    streamerBotSyncEnabled: raw.streamerBotSyncEnabled === true,
    streamerBotSyncActionId: /^[0-9a-f-]{36}$/iu.test(cleanText(raw.streamerBotSyncActionId, 36)) ? cleanText(raw.streamerBotSyncActionId, 36).toLowerCase() : FALLBACKS.streamerBotSyncActionId,
  };
  const commandKeys = ['quoteCommand', 'quotesCommand', 'submitCommand', 'addCommand', 'approveCommand', 'rejectCommand', 'pendingCommand', 'editCommand', 'deleteCommand', 'restoreCommand', 'statsCommand'];
  const names = commandKeys.map((key) => parsed[key]);
  if (new Set(names).size !== names.length) {
    for (const key of commandKeys) parsed[key] = FALLBACKS[key];
  }
  return parsed;
}

function platformOf(value) {
  return PLATFORMS.includes(value) ? value : undefined;
}

function actorType(event) {
  const explicit = cleanText(event?.user?.actorType, 20).toLocaleLowerCase('en-US');
  if (explicit === 'bot' || explicit === 'system') return explicit;
  const roles = Array.isArray(event?.user?.roles) ? event.user.roles.map((role) => cleanText(role, 64).toLocaleLowerCase('en-US')) : [];
  return roles.includes('bot') ? 'bot' : 'human';
}

function identity(event) {
  const platform = platformOf(event?.platform);
  const id = cleanText(event?.user?.id, 256);
  const name = cleanName(event?.user?.name || event?.user?.displayName, 100).toLocaleLowerCase('en-US');
  return platform && (id || name) ? `${platform}:${id ? `id:${id}` : name}` : '';
}

function matchesIgnoredViewer(rule, event) {
  const expected = cleanText(rule, 300).toLocaleLowerCase('en-US');
  const platform = platformOf(event?.platform);
  const id = cleanText(event?.user?.id, 256).toLocaleLowerCase('en-US');
  const name = cleanName(event?.user?.name, 100).toLocaleLowerCase('en-US');
  const displayName = cleanName(event?.user?.displayName, 100).toLocaleLowerCase('en-US');
  if (!expected || !platform) return false;
  if (expected === name || expected === displayName || expected === `${platform}:${name}` || expected === `${platform}:${displayName}`) return true;
  return Boolean(id) && expected === `${platform}:id:${id}`;
}

function roleOf(event) {
  const roles = new Set(Array.isArray(event?.user?.roles) ? event.user.roles.map((role) => cleanText(role, 64).toLocaleLowerCase('en-US')) : []);
  if (roles.has('broadcaster')) return 'broadcaster';
  if (roles.has('moderator') || roles.has('mod')) return 'moderator';
  if (roles.has('subscriber') || roles.has('member')) return 'subscriber';
  return 'viewer';
}

function roleRank(role) {
  return { viewer: 0, subscriber: 1, moderator: 2, broadcaster: 3 }[role] ?? 0;
}

function atLeast(event, minimumRole) {
  return roleRank(roleOf(event)) >= roleRank(minimumRole);
}

function isModerator(event) {
  return atLeast(event, 'moderator');
}

function safePlatform(value) {
  return platformOf(cleanText(value, 20).toLocaleLowerCase('en-US'));
}

function person(value) {
  if (!value || typeof value !== 'object') return undefined;
  const platform = safePlatform(value.platform);
  const name = cleanName(value.name, 100);
  const id = cleanText(value.id, 256);
  return platform && name ? { platform, ...(id ? { id } : {}), name } : undefined;
}

function quoteRecord(value, status) {
  if (!value || typeof value !== 'object') return undefined;
  const id = integer(value.id, 1, Number.MAX_SAFE_INTEGER, 0);
  const text = cleanText(value.text, 400);
  const quotedName = cleanName(value.quotedName, 100);
  const quotedUserId = cleanText(value.quotedUserId, 256);
  const sourcePlatform = safePlatform(value.sourcePlatform);
  const submittedBy = person(value.submittedBy);
  const submittedAt = cleanText(value.submittedAt, 40);
  if (!id || !text || !quotedName || !sourcePlatform || !submittedBy || !submittedAt) return undefined;
  const approvedBy = person(value.approvedBy);
  const deletedBy = person(value.deletedBy);
  return {
    id,
    text,
    quotedName,
    ...(quotedUserId ? { quotedUserId } : {}),
    sourcePlatform,
    ...(cleanText(value.gameName, 200) ? { gameName: cleanText(value.gameName, 200) } : {}),
    submittedBy,
    submittedAt,
    status,
    ...(approvedBy ? { approvedBy } : {}),
    ...(value.approvedAt ? { approvedAt: cleanText(value.approvedAt, 40) } : {}),
    ...(deletedBy ? { deletedBy } : {}),
    ...(value.deletedAt ? { deletedAt: cleanText(value.deletedAt, 40) } : {}),
    ...(value.rejectionReason ? { rejectionReason: cleanText(value.rejectionReason, 160) } : {}),
    ...(value.editedAt ? { editedAt: cleanText(value.editedAt, 40) } : {}),
    ...(integer(value.streamerBotQuoteId, 1, Number.MAX_SAFE_INTEGER, 0) ? { streamerBotQuoteId: integer(value.streamerBotQuoteId, 1, Number.MAX_SAFE_INTEGER, 0) } : {}),
  };
}

function cooldownRecord(value) {
  if (!value || typeof value !== 'object') return undefined;
  const key = cleanText(value.key, 600);
  const kind = value.kind === 'submit' ? 'submit' : value.kind === 'retrieve' ? 'retrieve' : undefined;
  const at = Number.isFinite(value.at) ? Math.max(0, Math.floor(value.at)) : 0;
  return key && kind && at ? { key, kind, at } : undefined;
}

function auditRecord(value) {
  if (!value || typeof value !== 'object') return undefined;
  const action = cleanText(value.action, 30);
  const quoteId = integer(value.quoteId, 1, Number.MAX_SAFE_INTEGER, 0);
  const actor = person(value.actor);
  const at = cleanText(value.at, 40);
  return action && quoteId && actor && at ? { action, quoteId, actor, at } : undefined;
}

export function sanitizeQuoteVaultState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const approved = Array.isArray(source.approved) ? source.approved.map((item) => quoteRecord(item, 'approved')).filter(Boolean).slice(-MAXIMUM_APPROVED_QUOTES) : [];
  const pending = Array.isArray(source.pending) ? source.pending.map((item) => quoteRecord(item, 'pending')).filter(Boolean).slice(-MAXIMUM_PENDING_QUOTES) : [];
  const deleted = Array.isArray(source.deleted) ? source.deleted.map((item) => quoteRecord(item, item?.status === 'rejected' ? 'rejected' : 'deleted')).filter(Boolean).slice(-MAXIMUM_DELETED_QUOTES) : [];
  const cooldowns = Array.isArray(source.cooldowns) ? source.cooldowns.map(cooldownRecord).filter(Boolean).slice(-MAXIMUM_COOLDOWNS) : [];
  const audit = Array.isArray(source.audit) ? source.audit.map(auditRecord).filter(Boolean).slice(-MAXIMUM_AUDIT_ENTRIES) : [];
  const highest = [...approved, ...pending, ...deleted].reduce((maximum, item) => Math.max(maximum, item.id), 0);
  return {
    version: 1,
    nextId: Math.max(integer(source.nextId, 1, Number.MAX_SAFE_INTEGER, 1), highest + 1),
    approved,
    pending,
    deleted,
    cooldowns,
    audit,
    lastCommandAt: Number.isFinite(source.lastCommandAt) ? Math.max(0, Math.floor(source.lastCommandAt)) : 0,
    lastShownId: integer(source.lastShownId, 0, Number.MAX_SAFE_INTEGER, 0),
  };
}

function stateBytes(state) {
  return Buffer.byteLength(JSON.stringify(state));
}

function stateFits(state) {
  return stateBytes(state) <= MAXIMUM_STATE_BYTES;
}

function actor(event) {
  return {
    platform: platformOf(event.platform),
    ...(cleanText(event.user?.id, 256) ? { id: cleanText(event.user.id, 256) } : {}),
    name: cleanName(event.user?.displayName || event.user?.name, 100) || 'Viewer',
  };
}

function fingerprint(text, quotedName) {
  return `${cleanText(quotedName, 100).toLocaleLowerCase('en-US')}\u0000${cleanText(text, 400).toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}`;
}

function isDuplicate(state, text, quotedName, exceptId = 0) {
  const expected = fingerprint(text, quotedName);
  return [...state.approved, ...state.pending].some((item) => item.id !== exceptId && fingerprint(item.text, item.quotedName) === expected);
}

function hasLink(text) {
  return /(?:https?:\/\/|www\.)\S+/iu.test(text);
}

function parseCommand(event, settings) {
  if (event?.eventType !== 'chat.message') return undefined;
  const message = typeof event.payload?.message === 'string' ? event.payload.message.trim() : '';
  if (!message.startsWith(settings.commandPrefix)) return undefined;
  const withoutPrefix = message.slice(settings.commandPrefix.length).trimStart();
  const separator = withoutPrefix.search(/\s/u);
  const command = cleanText(separator < 0 ? withoutPrefix : withoutPrefix.slice(0, separator), 64).toLocaleLowerCase('en-US');
  const input = separator < 0 ? '' : withoutPrefix.slice(separator).trim();
  const commandKinds = new Map([
    [settings.quoteCommand, 'quote'],
    [settings.quotesCommand, 'quotes'],
    [settings.submitCommand, 'submit'],
    [settings.addCommand, 'add'],
    [settings.approveCommand, 'approve'],
    [settings.rejectCommand, 'reject'],
    [settings.pendingCommand, 'pending'],
    [settings.editCommand, 'edit'],
    [settings.deleteCommand, 'delete'],
    [settings.restoreCommand, 'restore'],
    [settings.statsCommand, 'stats'],
  ]);
  const kind = commandKinds.get(command);
  return kind ? { kind, input } : undefined;
}

function parseId(value) {
  const match = /^\s*#?(\d+)(?:\s+([\s\S]*))?$/u.exec(value);
  return match ? { id: Number.parseInt(match[1], 10), remainder: cleanText(match[2], 400) } : undefined;
}

export function parseQuoteSubmission(event, input, maximumCharacters) {
  const replyText = event?.payload?.isReply === true ? cleanText(event.payload.replyMessage, maximumCharacters) : '';
  const replyName = replyText ? cleanName(event.payload.replyUserName, 100) : '';
  const replyUserId = replyText ? cleanText(event.payload.replyUserId, 256) : '';
  if (!cleanText(input, maximumCharacters + 120) && replyText && replyName) {
    return { text: replyText, quotedName: replyName, ...(replyUserId ? { quotedUserId: replyUserId } : {}) };
  }
  const pipe = input.indexOf('|');
  if (pipe >= 0) {
    const quotedName = cleanName(input.slice(0, pipe), 100);
    const text = cleanText(input.slice(pipe + 1), maximumCharacters);
    return quotedName && text ? { text, quotedName } : undefined;
  }
  const text = cleanText(input, maximumCharacters);
  const quotedName = cleanName(event?.user?.displayName || event?.user?.name, 100);
  return text && quotedName ? { text, quotedName } : undefined;
}

function render(template, values, maximum = 1000) {
  let output = cleanText(template, maximum * 2);
  for (const [key, value] of Object.entries(values)) output = output.split(`{${key}}`).join(cleanText(String(value), maximum));
  return cleanText(output, maximum);
}

function quoteValues(quote) {
  return {
    id: quote.id,
    quote: quote.text,
    quotedName: quote.quotedName,
    platform: quote.sourcePlatform,
    submittedBy: quote.submittedBy.name,
    date: quote.approvedAt || quote.submittedAt,
  };
}

async function send(context, platform, message) {
  const sourcePlatform = platformOf(platform);
  if (!sourcePlatform || !message) return;
  try {
    await context.chat.send({ message: cleanText(message, 4000), routing: 'source', sourcePlatform, overflow: 'split' });
  } catch {
    // Quote state remains authoritative if a cosmetic chat response cannot be sent.
  }
}

async function replyTemplate(context, event, settings, template, values = {}) {
  if (event.metadata?.simulated === true) return;
  await send(context, event.platform, render(template, {
    prefix: settings.commandPrefix,
    submitCommand: settings.submitCommand,
    ...values,
  }));
}

function pruneCooldowns(state, now) {
  const cutoff = now - 86_400_000;
  state.cooldowns = state.cooldowns.filter((entry) => entry.at >= cutoff).slice(-MAXIMUM_COOLDOWNS);
}

function cooldownReason(state, event, settings, kind, now) {
  if (settings.moderatorBypassCooldowns && isModerator(event)) return '';
  const key = identity(event);
  const seconds = kind === 'submit' ? settings.userSubmissionCooldownSeconds : settings.userRetrievalCooldownSeconds;
  const previous = state.cooldowns.find((entry) => entry.key === key && entry.kind === kind)?.at ?? 0;
  return seconds > 0 && now - previous < seconds * 1000 ? 'user' : '';
}

function recordCooldown(state, event, kind, now) {
  const key = identity(event);
  state.lastCommandAt = now;
  state.cooldowns = [...state.cooldowns.filter((entry) => entry.key !== key || entry.kind !== kind), { key, kind, at: now }].slice(-MAXIMUM_COOLDOWNS);
}

function recordAudit(state, action, quoteId, event, now) {
  state.audit = [...state.audit, { action, quoteId, actor: actor(event), at: new Date(now).toISOString() }].slice(-MAXIMUM_AUDIT_ENTRIES);
}

function randomQuote(quotes, lastShownId = 0, random = Math.random) {
  if (!quotes.length) return undefined;
  const candidates = quotes.length > 1 ? quotes.filter((quote) => quote.id !== lastShownId) : quotes;
  return candidates[Math.floor(random() * candidates.length)] ?? candidates[0];
}

export function selectQuote(state, input, random = Math.random) {
  const normalized = cleanText(input, 300);
  if (!normalized) return randomQuote(state.approved, state.lastShownId, random);
  const parsed = parseId(normalized);
  if (parsed && !parsed.remainder) return state.approved.find((quote) => quote.id === parsed.id);
  const search = normalized.toLocaleLowerCase('en-US').replace(/^search\s+/u, '').replace(/^@/u, '');
  const matches = state.approved.filter((quote) => quote.text.toLocaleLowerCase('en-US').includes(search) || quote.quotedName.toLocaleLowerCase('en-US').includes(search));
  return randomQuote(matches, state.lastShownId, random);
}

async function writeIfFits(context, state) {
  while (!stateFits(state) && state.audit.length) state.audit.shift();
  while (!stateFits(state) && state.deleted.length) state.deleted.shift();
  while (!stateFits(state) && state.cooldowns.length) state.cooldowns.shift();
  if (!stateFits(state)) return false;
  await context.state.write(state);
  return true;
}

function buildRecord(state, event, parsed, status, now) {
  return {
    id: state.nextId,
    text: parsed.text,
    quotedName: parsed.quotedName,
    ...(parsed.quotedUserId ? { quotedUserId: parsed.quotedUserId } : {}),
    sourcePlatform: event.platform,
    submittedBy: actor(event),
    submittedAt: new Date(now).toISOString(),
    status,
  };
}

async function retrieveQuote(event, context, settings, state, input, now) {
  if (cooldownReason(state, event, settings, 'retrieve', now)) return;
  const quote = selectQuote(state, input);
  if (!quote) return replyTemplate(context, event, settings, settings.notFoundMessage);
  recordCooldown(state, event, 'retrieve', now);
  state.lastShownId = quote.id;
  await writeIfFits(context, state);
  await replyTemplate(context, event, settings, settings.quoteMessageTemplate, quoteValues(quote));
}

async function quoteCount(event, context, settings, state, input, now) {
  const name = cleanName(input, 100).toLocaleLowerCase('en-US');
  if (name) return retrieveQuote(event, context, settings, state, name, now);
  if (cooldownReason(state, event, settings, 'retrieve', now)) return;
  recordCooldown(state, event, 'retrieve', now);
  await writeIfFits(context, state);
  await send(context, event.platform, `Quote Vault has ${String(state.approved.length)} approved quote${state.approved.length === 1 ? '' : 's'} and ${String(state.pending.length)} pending.`);
}

async function requestStreamerBotSync(context, settings, syncOperation, quote) {
  if (!settings.streamerBotSyncEnabled || quote.sourcePlatform === 'tiktok' || !['twitch', 'youtube', 'kick'].includes(quote.sourcePlatform)) return false;
  try {
    await context.streamerbot.runApprovedAction(settings.streamerBotSyncActionId, {
      quoteVaultSyncOperation: syncOperation,
      quoteVaultQuoteId: quote.id,
      quoteVaultNativeQuoteId: quote.streamerBotQuoteId || 0,
      quoteVaultPlatform: quote.sourcePlatform,
      quoteVaultUserId: quote.quotedUserId || '',
      quoteVaultQuotedName: quote.quotedName,
      quoteVaultQuoteText: quote.text,
    });
    return true;
  } catch { return false; }
}

async function addSubmission(event, context, settings, state, input, direct, now) {
  const requiredRole = direct ? settings.directAddRole : settings.communitySubmissionRole;
  if (!atLeast(event, requiredRole)) return replyTemplate(context, event, settings, settings.permissionMessage);
  if (cooldownReason(state, event, settings, 'submit', now)) return;
  const parsed = parseQuoteSubmission(event, input, settings.maximumQuoteCharacters);
  if (!parsed) return replyTemplate(context, event, settings, settings.invalidUsageMessage);
  if (!settings.allowLinks && hasLink(parsed.text)) return send(context, event.platform, 'Links are disabled in Quote Vault submissions.');
  if (isDuplicate(state, parsed.text, parsed.quotedName)) return replyTemplate(context, event, settings, settings.duplicateMessage);
  const autoApprove = direct || isModerator(event);
  if (autoApprove && state.approved.length >= settings.maximumApprovedQuotes) return replyTemplate(context, event, settings, settings.libraryFullMessage);
  if (!autoApprove && state.pending.length >= settings.maximumPendingQuotes) return send(context, event.platform, 'The Quote Vault review queue is full. Please try again later.');
  const record = buildRecord(state, event, parsed, autoApprove ? 'approved' : 'pending', now);
  if (autoApprove) {
    record.approvedBy = actor(event);
    record.approvedAt = new Date(now).toISOString();
    state.approved.push(record);
    recordAudit(state, direct ? 'add' : 'auto-approve', record.id, event, now);
  } else {
    state.pending.push(record);
    recordAudit(state, 'submit', record.id, event, now);
  }
  state.nextId += 1;
  recordCooldown(state, event, 'submit', now);
  if (!await writeIfFits(context, state)) return replyTemplate(context, event, settings, settings.libraryFullMessage);
  if (autoApprove) await requestStreamerBotSync(context, settings, 'add', record);
  await replyTemplate(context, event, settings, autoApprove ? settings.addedMessageTemplate : settings.submittedMessageTemplate, quoteValues(record));
}

function creatorPerson(platform) {
  return { platform: platformOf(platform) || 'twitch', name: 'Streamer' };
}

function projectAdminQuote(quote) {
  return {
    id: quote.id,
    text: quote.text,
    quotedName: quote.quotedName,
    sourcePlatform: quote.sourcePlatform,
    ...(quote.gameName ? { gameName: quote.gameName } : {}),
    submittedBy: quote.submittedBy.name,
    submittedAt: quote.submittedAt,
    status: quote.status,
    ...(quote.approvedAt ? { approvedAt: quote.approvedAt } : {}),
    ...(quote.editedAt ? { editedAt: quote.editedAt } : {}),
    ...(quote.deletedAt ? { deletedAt: quote.deletedAt } : {}),
    ...(quote.rejectionReason ? { rejectionReason: quote.rejectionReason } : {}),
    ...(quote.streamerBotQuoteId ? { streamerBotQuoteId: quote.streamerBotQuoteId } : {}),
  };
}

function quoteVaultAdminStatus(state, settings, action = 'status', quoteId = 0) {
  return {
    contractVersion: '1.0.0',
    action,
    ...(quoteId ? { quoteId } : {}),
    counts: { approved: state.approved.length, pending: state.pending.length, recoverable: state.deleted.length },
    capacity: { approved: settings.maximumApprovedQuotes, pending: settings.maximumPendingQuotes },
    streamerBotSync: { enabled: settings.streamerBotSyncEnabled, actionId: settings.streamerBotSyncActionId, mirrored: state.approved.filter((quote) => quote.streamerBotQuoteId).length },
    approved: state.approved.map(projectAdminQuote).sort((left, right) => right.id - left.id),
    pending: state.pending.map(projectAdminQuote).sort((left, right) => left.id - right.id),
    deleted: state.deleted.map(projectAdminQuote).sort((left, right) => right.id - left.id),
  };
}

async function administerQuoteVaultInternal(request, context, now) {
  const settings = settingsFor(context);
  let state = sanitizeQuoteVaultState(await context.state.read());
  state = await seedStarterQuotes(context, settings, state);
  if (request.operation === 'status') return quoteVaultAdminStatus(state, settings);
  if (request.operation === 'sync-import') {
    if (!settings.streamerBotSyncEnabled) throw new Error('Enable Streamer.bot quote sync and save the Quote Vault settings first.');
    try { await context.streamerbot.runApprovedAction(settings.streamerBotSyncActionId, { quoteVaultSyncOperation: 'export-all' }); }
    catch { throw new Error('Streamer.bot quote sync is unavailable. Import the current Quote Vault package, approve Native Quote Sync, then restart StreamBridge.'); }
    return { ...quoteVaultAdminStatus(state, settings, 'sync-import'), syncRequested: true };
  }
  const platform = platformOf(request.sourcePlatform) || settings.enabledPlatforms[0] || 'twitch';
  const creator = creatorPerson(platform);
  const timestamp = new Date(now).toISOString();
  let quoteId = Number.isInteger(request.quoteId) ? request.quoteId : 0;
  if (request.operation === 'add') {
    const text = cleanText(request.text, settings.maximumQuoteCharacters);
    const quotedName = cleanName(request.quotedName, 100);
    if (!text || !quotedName) throw new Error('Enter both the quoted person and quote text.');
    if (!settings.allowLinks && hasLink(text)) throw new Error('Links are disabled in Quote Vault.');
    if (isDuplicate(state, text, quotedName)) throw new Error(settings.duplicateMessage);
    if (state.approved.length >= settings.maximumApprovedQuotes) throw new Error(settings.libraryFullMessage);
    quoteId = state.nextId;
    state.nextId += 1;
    state.approved.push({ id: quoteId, text, quotedName, sourcePlatform: platform, submittedBy: creator, submittedAt: timestamp, status: 'approved', approvedBy: creator, approvedAt: timestamp });
    state.audit = [...state.audit, { action: 'creator-add', quoteId, actor: creator, at: timestamp }].slice(-MAXIMUM_AUDIT_ENTRIES);
  } else if (request.operation === 'edit') {
    const approved = state.approved.find((quote) => quote.id === quoteId);
    const pending = state.pending.find((quote) => quote.id === quoteId);
    const quote = approved || pending;
    if (!quote) throw new Error('That quote is no longer available. Refresh the library.');
    const text = cleanText(request.text, settings.maximumQuoteCharacters);
    const quotedName = cleanName(request.quotedName, 100);
    if (!text || !quotedName) throw new Error('Enter both the quoted person and quote text.');
    if (!settings.allowLinks && hasLink(text)) throw new Error('Links are disabled in Quote Vault.');
    if (isDuplicate(state, text, quotedName, quoteId)) throw new Error(settings.duplicateMessage);
    const updated = { ...quote, text, quotedName, editedAt: timestamp };
    if (approved) state.approved = state.approved.map((item) => item.id === quoteId ? updated : item);
    else state.pending = state.pending.map((item) => item.id === quoteId ? updated : item);
    state.audit = [...state.audit, { action: 'creator-edit', quoteId, actor: creator, at: timestamp }].slice(-MAXIMUM_AUDIT_ENTRIES);
  } else if (request.operation === 'approve') {
    const quote = state.pending.find((item) => item.id === quoteId);
    if (!quote) throw new Error('That pending quote is no longer available. Refresh the library.');
    if (state.approved.length >= settings.maximumApprovedQuotes) throw new Error(settings.libraryFullMessage);
    state.pending = state.pending.filter((item) => item.id !== quoteId);
    state.approved.push({ ...quote, status: 'approved', approvedBy: creator, approvedAt: timestamp });
    state.audit = [...state.audit, { action: 'creator-approve', quoteId, actor: creator, at: timestamp }].slice(-MAXIMUM_AUDIT_ENTRIES);
  } else if (request.operation === 'delete') {
    const quote = state.approved.find((item) => item.id === quoteId) || state.pending.find((item) => item.id === quoteId);
    if (!quote) throw new Error('That quote is no longer available. Refresh the library.');
    state.approved = state.approved.filter((item) => item.id !== quoteId);
    state.pending = state.pending.filter((item) => item.id !== quoteId);
    state.deleted = [...state.deleted, { ...quote, status: 'deleted', deletedBy: creator, deletedAt: timestamp }].slice(-MAXIMUM_DELETED_QUOTES);
    state.audit = [...state.audit, { action: 'creator-delete', quoteId, actor: creator, at: timestamp }].slice(-MAXIMUM_AUDIT_ENTRIES);
  } else if (request.operation === 'restore') {
    const quote = state.deleted.find((item) => item.id === quoteId);
    if (!quote) throw new Error('That recoverable quote is no longer available. Refresh the library.');
    if (state.approved.length >= settings.maximumApprovedQuotes) throw new Error(settings.libraryFullMessage);
    const restored = { ...quote, status: 'approved', approvedBy: creator, approvedAt: timestamp };
    delete restored.deletedBy;
    delete restored.deletedAt;
    delete restored.rejectionReason;
    state.deleted = state.deleted.filter((item) => item.id !== quoteId);
    state.approved.push(restored);
    state.audit = [...state.audit, { action: 'creator-restore', quoteId, actor: creator, at: timestamp }].slice(-MAXIMUM_AUDIT_ENTRIES);
  }
  if (!await writeIfFits(context, state)) throw new Error(settings.libraryFullMessage);
  const changed = state.approved.find((quote) => quote.id === quoteId);
  if (changed && ['add', 'approve', 'restore'].includes(request.operation)) await requestStreamerBotSync(context, settings, 'add', changed);
  if (changed && request.operation === 'edit') await requestStreamerBotSync(context, settings, changed.streamerBotQuoteId ? 'replace' : 'add', changed);
  if (request.operation === 'delete') {
    const removed = state.deleted.find((quote) => quote.id === quoteId);
    if (removed?.streamerBotQuoteId) await requestStreamerBotSync(context, settings, 'delete', removed);
  }
  return quoteVaultAdminStatus(state, settings, request.operation, quoteId);
}

export function administerQuoteVaultRequest(request, context, now = Date.now()) {
  return serialize(() => administerQuoteVaultInternal(request, context, now));
}

async function approve(event, context, settings, state, input, now) {
  if (!isModerator(event)) return replyTemplate(context, event, settings, settings.permissionMessage);
  const parsed = parseId(input);
  const pending = parsed ? state.pending.find((quote) => quote.id === parsed.id) : undefined;
  if (!pending) return replyTemplate(context, event, settings, settings.notFoundMessage);
  if (state.approved.length >= settings.maximumApprovedQuotes) return replyTemplate(context, event, settings, settings.libraryFullMessage);
  const approved = { ...pending, status: 'approved', approvedBy: actor(event), approvedAt: new Date(now).toISOString() };
  state.pending = state.pending.filter((quote) => quote.id !== approved.id);
  state.approved.push(approved);
  recordAudit(state, 'approve', approved.id, event, now);
  if (!await writeIfFits(context, state)) return replyTemplate(context, event, settings, settings.libraryFullMessage);
  await requestStreamerBotSync(context, settings, 'add', approved);
  await replyTemplate(context, event, settings, settings.approvedMessageTemplate, quoteValues(approved));
}

async function handleSyncResult(event, context, settings, state) {
  const syncOperation = cleanText(event.payload?.operation, 30).toLocaleLowerCase('en-US');
  if (syncOperation === 'export-all') {
    const incoming = Array.isArray(event.payload?.quotes) ? event.payload.quotes.slice(0, 500) : [];
    for (const item of incoming) {
      if (state.approved.length >= settings.maximumApprovedQuotes) break;
      const nativeId = integer(item?.id, 1, Number.MAX_SAFE_INTEGER, 0);
      const text = cleanText(item?.text, settings.maximumQuoteCharacters);
      const quotedName = cleanName(item?.quotedName, 100) || 'Streamer.bot quote';
      const sourcePlatform = platformOf(cleanText(item?.platform, 20).toLowerCase()) || 'twitch';
      const gameName = cleanText(item?.gameName, 200);
      if (!nativeId || !text || sourcePlatform === 'tiktok') continue;
      const mapped = state.approved.find((quote) => quote.streamerBotQuoteId === nativeId);
      if (mapped) { if (gameName) mapped.gameName = gameName; continue; }
      const duplicate = state.approved.find((quote) => fingerprint(quote.text, quote.quotedName) === fingerprint(text, quotedName));
      if (duplicate) { duplicate.streamerBotQuoteId = nativeId; continue; }
      const timestamp = cleanText(item?.timestamp, 40) || new Date().toISOString();
      state.approved.push({ id: state.nextId++, text, quotedName, sourcePlatform, ...(gameName ? { gameName } : {}), submittedBy: { platform: sourcePlatform, name: 'Streamer.bot import' }, submittedAt: timestamp, status: 'approved', approvedBy: { platform: sourcePlatform, name: 'Streamer.bot import' }, approvedAt: timestamp, streamerBotQuoteId: nativeId });
    }
    await writeIfFits(context, state);
    return;
  }
  const quoteId = integer(event.payload?.quoteVaultQuoteId, 1, Number.MAX_SAFE_INTEGER, 0);
  const nativeId = integer(event.payload?.nativeQuoteId, 1, Number.MAX_SAFE_INTEGER, 0);
  if (!quoteId || !nativeId || event.payload?.success !== true) return;
  state.approved = state.approved.map((quote) => quote.id === quoteId ? { ...quote, streamerBotQuoteId: nativeId } : quote);
  await writeIfFits(context, state);
}

async function reject(event, context, settings, state, input, now) {
  if (!isModerator(event)) return replyTemplate(context, event, settings, settings.permissionMessage);
  const parsed = parseId(input);
  const pending = parsed ? state.pending.find((quote) => quote.id === parsed.id) : undefined;
  if (!pending) return replyTemplate(context, event, settings, settings.notFoundMessage);
  state.pending = state.pending.filter((quote) => quote.id !== pending.id);
  state.deleted = [...state.deleted, {
    ...pending,
    status: 'rejected',
    deletedBy: actor(event),
    deletedAt: new Date(now).toISOString(),
    ...(parsed.remainder ? { rejectionReason: parsed.remainder } : {}),
  }].slice(-MAXIMUM_DELETED_QUOTES);
  recordAudit(state, 'reject', pending.id, event, now);
  if (!await writeIfFits(context, state)) return replyTemplate(context, event, settings, settings.libraryFullMessage);
  await replyTemplate(context, event, settings, settings.rejectedMessageTemplate, quoteValues(pending));
}

async function listPending(event, context, settings, state) {
  if (!isModerator(event)) return replyTemplate(context, event, settings, settings.permissionMessage);
  if (!state.pending.length) return send(context, event.platform, 'Quote Vault has no pending submissions.');
  const preview = state.pending.slice(0, 5).map((quote) => `#${String(quote.id)} ${quote.quotedName}: ${[...quote.text].slice(0, 50).join('')}`).join(' | ');
  await send(context, event.platform, `${preview}${state.pending.length > 5 ? ` | +${String(state.pending.length - 5)} more` : ''}`);
}

async function edit(event, context, settings, state, input, now) {
  if (!isModerator(event)) return replyTemplate(context, event, settings, settings.permissionMessage);
  const parsed = parseId(input);
  const quote = parsed ? state.approved.find((item) => item.id === parsed.id) : undefined;
  if (!quote || !parsed?.remainder) return replyTemplate(context, event, settings, settings.notFoundMessage);
  const updatedText = cleanText(parsed.remainder, settings.maximumQuoteCharacters);
  if (!updatedText || (!settings.allowLinks && hasLink(updatedText))) return replyTemplate(context, event, settings, settings.invalidUsageMessage);
  if (isDuplicate(state, updatedText, quote.quotedName, quote.id)) return replyTemplate(context, event, settings, settings.duplicateMessage);
  const updated = { ...quote, text: updatedText, editedAt: new Date(now).toISOString() };
  state.approved = state.approved.map((item) => item.id === quote.id ? updated : item);
  recordAudit(state, 'edit', quote.id, event, now);
  if (!await writeIfFits(context, state)) return replyTemplate(context, event, settings, settings.libraryFullMessage);
  await replyTemplate(context, event, settings, settings.editedMessageTemplate, quoteValues(updated));
}

async function removeQuote(event, context, settings, state, input, now) {
  if (!isModerator(event)) return replyTemplate(context, event, settings, settings.permissionMessage);
  const parsed = parseId(input);
  const quote = parsed ? state.approved.find((item) => item.id === parsed.id) : undefined;
  if (!quote) return replyTemplate(context, event, settings, settings.notFoundMessage);
  state.approved = state.approved.filter((item) => item.id !== quote.id);
  state.deleted = [...state.deleted, { ...quote, status: 'deleted', deletedBy: actor(event), deletedAt: new Date(now).toISOString() }].slice(-MAXIMUM_DELETED_QUOTES);
  recordAudit(state, 'delete', quote.id, event, now);
  if (!await writeIfFits(context, state)) return replyTemplate(context, event, settings, settings.libraryFullMessage);
  await replyTemplate(context, event, settings, settings.deletedMessageTemplate, quoteValues(quote));
}

async function restoreQuote(event, context, settings, state, input, now) {
  if (!isModerator(event)) return replyTemplate(context, event, settings, settings.permissionMessage);
  const parsed = parseId(input);
  const quote = parsed ? state.deleted.find((item) => item.id === parsed.id) : undefined;
  if (!quote) return replyTemplate(context, event, settings, settings.notFoundMessage);
  if (state.approved.length >= settings.maximumApprovedQuotes) return replyTemplate(context, event, settings, settings.libraryFullMessage);
  const restored = {
    ...quote,
    status: 'approved',
    approvedBy: actor(event),
    approvedAt: new Date(now).toISOString(),
  };
  delete restored.deletedBy;
  delete restored.deletedAt;
  delete restored.rejectionReason;
  state.deleted = state.deleted.filter((item) => item.id !== quote.id);
  state.approved.push(restored);
  recordAudit(state, 'restore', quote.id, event, now);
  if (!await writeIfFits(context, state)) return replyTemplate(context, event, settings, settings.libraryFullMessage);
  await replyTemplate(context, event, settings, settings.restoredMessageTemplate, quoteValues(restored));
}

async function stats(event, context, settings, state) {
  if (!isModerator(event)) return replyTemplate(context, event, settings, settings.permissionMessage);
  await send(context, event.platform, `Quote Vault: ${String(state.approved.length)} approved, ${String(state.pending.length)} pending, ${String(state.deleted.length)} recoverable, ${String(stateBytes(state))}/${String(MAXIMUM_STATE_BYTES)} storage bytes.`);
}

async function seedStarterQuotes(context, settings, state) {
  if (!settings.starterQuotes.length || state.approved.length || state.pending.length || state.nextId !== 1) return state;
  const original = structuredClone(state);
  const now = new Date().toISOString();
  const seedPlatform = settings.enabledPlatforms[0] || 'twitch';
  for (const line of settings.starterQuotes) {
    if (state.approved.length >= settings.maximumApprovedQuotes) break;
    const separator = line.indexOf('|');
    const quotedName = cleanName(separator >= 0 ? line.slice(0, separator) : 'Streamer', 100);
    const text = cleanText(separator >= 0 ? line.slice(separator + 1) : line, settings.maximumQuoteCharacters);
    if (!quotedName || !text || (!settings.allowLinks && hasLink(text)) || isDuplicate(state, text, quotedName)) continue;
    state.approved.push({
      id: state.nextId,
      text,
      quotedName,
      sourcePlatform: seedPlatform,
      submittedBy: { platform: seedPlatform, name: 'Quote Vault setup' },
      submittedAt: now,
      status: 'approved',
      approvedBy: { platform: seedPlatform, name: 'Quote Vault setup' },
      approvedAt: now,
    });
    state.nextId += 1;
  }
  return await writeIfFits(context, state) ? state : original;
}

async function handleControl(event, context, settings, state) {
  const sourcePlatform = platformOf(event.payload?.sourcePlatform);
  if (!sourcePlatform || !settings.enabledPlatforms.includes(sourcePlatform) || event.metadata?.simulated === true) return;
  if (event.payload?.action === 'random') {
    const quote = randomQuote(state.approved, state.lastShownId);
    if (!quote) return send(context, sourcePlatform, settings.notFoundMessage);
    state.lastShownId = quote.id;
    await writeIfFits(context, state);
    await send(context, sourcePlatform, render(settings.quoteMessageTemplate, quoteValues(quote)));
  } else if (event.payload?.action === 'stats') {
    await send(context, sourcePlatform, `Quote Vault has ${String(state.approved.length)} approved quote${state.approved.length === 1 ? '' : 's'} and ${String(state.pending.length)} pending.`);
  }
}

async function handleEvent(event, context) {
  const settings = settingsFor(context);
  if (!settings.enabled) return;
  let state = sanitizeQuoteVaultState(await context.state.read());
  pruneCooldowns(state, Date.now());
  state = await seedStarterQuotes(context, settings, state);
  if (event.eventType === SYNC_RESULT_EVENT) return handleSyncResult(event, context, settings, state);
  if (event.eventType === CONTROL_EVENT) return handleControl(event, context, settings, state);
  const platform = platformOf(event.platform);
  if (!platform || !settings.enabledPlatforms.includes(platform) || !event.user) return;
  if (event.metadata?.simulated === true || actorType(event) === 'system' || (settings.ignoreBots && actorType(event) === 'bot')) return;
  if (settings.ignoredUsers.some((rule) => matchesIgnoredViewer(rule, event))) return;
  const parsed = parseCommand(event, settings);
  if (!parsed) return;
  const now = Date.now();
  if (!(settings.moderatorBypassCooldowns && isModerator(event))) {
    if (now - state.lastCommandAt < settings.globalCommandCooldownSeconds * 1000) return;
    state.lastCommandAt = now;
    if (!await writeIfFits(context, state)) return;
  }
  if (parsed.kind === 'quote') return retrieveQuote(event, context, settings, state, parsed.input, now);
  if (parsed.kind === 'quotes') return quoteCount(event, context, settings, state, parsed.input, now);
  if (parsed.kind === 'submit') return addSubmission(event, context, settings, state, parsed.input, false, now);
  if (parsed.kind === 'add') return addSubmission(event, context, settings, state, parsed.input, true, now);
  if (parsed.kind === 'approve') return approve(event, context, settings, state, parsed.input, now);
  if (parsed.kind === 'reject') return reject(event, context, settings, state, parsed.input, now);
  if (parsed.kind === 'pending') return listPending(event, context, settings, state);
  if (parsed.kind === 'edit') return edit(event, context, settings, state, parsed.input, now);
  if (parsed.kind === 'delete') return removeQuote(event, context, settings, state, parsed.input, now);
  if (parsed.kind === 'restore') return restoreQuote(event, context, settings, state, parsed.input, now);
  if (parsed.kind === 'stats') return stats(event, context, settings, state);
}

function serialize(task) {
  operation = operation.then(task, task);
  return operation;
}

export function resetQuoteVaultRuntime() {
  operation = Promise.resolve();
}

export default {
  manifest,
  required: false,
  async start(context) {
    operation = Promise.resolve();
    const settings = settingsFor(context);
    if (!settings.enabled) return;
    const state = sanitizeQuoteVaultState(await context.state.read());
    await seedStarterQuotes(context, settings, state);
  },
  async stop() {
    await operation;
    operation = Promise.resolve();
  },
  async onEvent(event, context) {
    await serialize(() => handleEvent(event, context));
  },
  async administerQuoteVault(request, context) {
    return administerQuoteVaultRequest(request, context);
  },
};
