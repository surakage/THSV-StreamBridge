// Village Draw provides restart-safe, cross-platform community giveaways.
// Viewer Foundation remains the only points authority; this module stores only
// bounded giveaway entries, transaction recovery records, winners, and draw receipts.
const MODULE_ID = 'thsv.village-draw';
const PLATFORMS = ['twitch', 'youtube', 'kick', 'tiktok', 'facebook'];
const LIMITS = Object.freeze({ twitch: 500, youtube: 200, kick: 500, tiktok: 150, facebook: 500 });
const ENTRY_MODES = ['free-single', 'points-single', 'points-multiple'];
const ENTRY_ROLES = ['everyone', 'subscribers', 'vips', 'moderators'];
const ACTIVE_STATES = ['open', 'paused', 'closed', 'drawn', 'confirmed', 'ended', 'canceling', 'canceled'];
const FINISHED_STATES = ['confirmed', 'ended', 'canceled'];
const WINNER_STATES = ['pending', 'claimed', 'confirmed', 'missed', 'skipped'];
const MAXIMUM_ENTRANTS = 1_000;
const MAXIMUM_TICKETS = 50_000;
const MAXIMUM_LUCK = 5;
const MAXIMUM_WINNERS = 10;
const HISTORY_LIMIT = 20;
const LAST_CALL_MS = 60_000;
const MAXIMUM_TIMER_MS = 86_400_000;
let operation = Promise.resolve();
let deleteUnsubscribe;
let refundTaskId;
let purchaseRecoveryTaskId;
let deadlineTaskId;
let stopped = true;
const livePlatforms = new Set();
const recentlyHandledCommands = new Map();
const commandCooldowns = new Map();

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Village Draw', version: '4.1.84',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.1.84', maximumTestedBridgeVersion: '4.1.84', dependencies: ['thsv.viewer-foundation'], requiredCapabilities: [],
  configurationSchema: 'schemas/config.json', eventSubscriptions: ['chat.message', 'command.received', 'stream.online', 'stream.offline'],
  commandsProvided: [
    { id: 'village-draw.manage', name: 'giveaway' }, { id: 'village-draw.enter', name: 'enter' },
    { id: 'village-draw.tickets', name: 'tickets' }, { id: 'village-draw.my-tickets', name: 'mytickets' },
    { id: 'village-draw.claim', name: 'claim' }, { id: 'village-draw.winners', name: 'winners' },
  ],
  actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.village-draw/', 'data/addons/.state/thsv.village-draw/'],
  installationSteps: [
    'Install and enable Viewer Foundation first; Village Draw never creates a second points balance.',
    'Keep chat-message triggers on your existing main THSV platform actions. No separate giveaway commands or triggers are needed in Streamer.bot.',
    'Set the prize and entry rules, save, restart, then start the giveaway from the Control Panel.',
    'Add the hosted Village Draw overlay to OBS, Meld, or Streamlabs and send a safe preview.',
  ],
  uninstallationSteps: ['Cancel and refund an open points draw before uninstalling. Its private history is kept for a later reinstall.'],
  migrations: [],
  healthChecks: [{ id: 'thsv.village-draw.runtime', description: 'Checks that entries are handled one at a time, Viewer Foundation points spent or refunded can be recovered, winners are picked fairly, and result cards show.' }],
};

function clean(value, maximum = 500) {
  return Array.from(typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]+/gu, ' ').replace(/\s+/gu, ' ').trim() : '').slice(0, maximum).join('');
}
function integer(value, minimum, maximum, fallback) {
  return Number.isSafeInteger(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}
function timestamp(value) { return Number.isSafeInteger(value) && value > 0 ? value : 0; }
function color(value, fallback) { return typeof value === 'string' && /^#[0-9a-f]{6}$/iu.test(value) ? value : fallback; }
function safeHttpsUrl(value) {
  const candidate = clean(value, 2048); if (!candidate) return '';
  try { const url = new URL(candidate); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}
function safeAvatarUrl(value) { const url = safeHttpsUrl(value); return url.length <= 256 ? url : ''; }
function uniquePlatforms(value, fallback = PLATFORMS) {
  return Array.isArray(value) ? [...new Set(value.filter((item) => PLATFORMS.includes(item)))].slice(0, PLATFORMS.length) : [...fallback];
}
function entryRoles(value) {
  const roles = Array.isArray(value) ? [...new Set(value.filter((item) => ENTRY_ROLES.includes(item)))] : [];
  return roles.length === 0 || roles.includes('everyone') ? ['everyone'] : roles;
}
function validViewerId(value) { return /^[a-z][a-z0-9-]{0,63}$/u.test(value); }
// The host resolves the community name (Settings > Community name, else the channel name);
// hosts without it fall back to the last live event's channel name, then a generic phrase.
let lastChannelName = '';
function noteChannel(event) {
  const channel = clean(event?.channel?.name, 60);
  if (event?.metadata?.simulated !== true && PLATFORMS.includes(event?.platform) && channel && channel.toLowerCase() !== event.platform) lastChannelName = channel;
}
function communityName(context) { return clean(context?.community?.name, 60) || lastChannelName || 'the community'; }
function expandCommunity(template, community) {
  return template.replace(/\{community\}/gu, (_token, offset) => offset === 0 ? `${community.charAt(0).toLocaleUpperCase('en-US')}${community.slice(1)}` : community);
}
function commandName(value, fallback) { const name = clean(value, 40).toLowerCase(); return /^[a-z][a-z0-9-]{0,39}$/u.test(name) ? name : fallback; }
function settingsFor(context) {
  const raw = context.settings || {};
  const community = communityName(context);
  const text = (value, maximum, fallback) => clean(expandCommunity(clean(value, maximum) || fallback, community), maximum);
  return {
    enabled: raw.enabled === true,
    commandPrefix: typeof raw.commandPrefix === 'string' && /^\S$/u.test(raw.commandPrefix) ? raw.commandPrefix : '!',
    giveawayCommand: commandName(raw.giveawayCommand, 'giveaway'),
    enterCommand: commandName(raw.enterCommand, 'enter'),
    ticketsCommand: commandName(raw.ticketsCommand, 'tickets'),
    myTicketsCommand: commandName(raw.myTicketsCommand, 'mytickets'),
    claimCommand: commandName(raw.claimCommand, 'claim'),
    winnersCommand: commandName(raw.winnersCommand, 'winners'),
    name: text(raw.giveawayName, 100, '{community} Giveaway'),
    description: text(raw.description, 500, 'Enter for a chance to win!'),
    prize: clean(raw.prizeItem, 160) || 'Mystery Prize',
    imageUrl: safeHttpsUrl(raw.prizeImageUrl),
    winnerCount: integer(raw.winnerCount, 1, MAXIMUM_WINNERS, 1),
    entryMode: ENTRY_MODES.includes(raw.entryMode) ? raw.entryMode : 'free-single',
    ticketCost: integer(raw.ticketCost, 1, 10_000, 50),
    maxTicketsPerViewer: integer(raw.maxTicketsPerViewer, 1, 100, 10),
    maximumEntrants: integer(raw.maximumEntrants, 10, MAXIMUM_ENTRANTS, 500),
    maximumTotalTickets: integer(raw.maximumTotalTickets, 10, MAXIMUM_TICKETS, 10_000),
    eligiblePlatforms: uniquePlatforms(raw.eligiblePlatforms),
    entryRoles: entryRoles(raw.entryRoles),
    subscriberLuck: integer(raw.subscriberLuck, 1, MAXIMUM_LUCK, 1),
    vipLuck: integer(raw.vipLuck, 1, MAXIMUM_LUCK, 1),
    skipRecentWinners: integer(raw.skipRecentWinners, 0, 10, 0),
    autoCloseMinutes: integer(raw.autoCloseMinutes, 0, 180, 0),
    reminderMinutes: integer(raw.reminderMinutes, 0, 60, 5),
    claimSeconds: integer(raw.claimSeconds, 0, 600, 60),
    claimMode: raw.claimMode === 'claim-command' ? 'claim-command' : 'any-message',
    noClaimAction: raw.noClaimAction === 'redraw' ? 'redraw' : 'wait',
    announcementPlatforms: uniquePlatforms(raw.announcementPlatforms),
    streamEndBehavior: ['leave-open', 'pause', 'close'].includes(raw.streamEndBehavior) ? raw.streamEndBehavior : 'close',
    openMessage: text(raw.openMessage, 1_000, '{name} is open! Prize: {prize}. Use {entryCommand}.'),
    reminderMessage: text(raw.reminderMessage, 1_000, '{name} is still open! Prize: {prize}. Type {entryCommand} to join. {entrants} entered so far.'),
    lastCallMessage: text(raw.lastCallMessage, 1_000, 'Last call! {name} closes in 1 minute. Type {entryCommand} to join.'),
    closedMessage: text(raw.closedMessage, 1_000, 'Entries for {name} are closed. {entrants} entered. Good luck!'),
    winnerMessage: text(raw.winnerMessage, 1_000, '{winner} won {prize} in {name}!'),
    claimMessage: text(raw.claimMessage, 1_000, '{winner}, type {claimCommand} in chat within {seconds} seconds to claim your prize!'),
    claimedMessage: text(raw.claimedMessage, 1_000, '{winner} claimed {prize}. Congratulations!'),
    noClaimMessage: text(raw.noClaimMessage, 1_000, '{winner} did not claim in time.'),
    endedMessage: text(raw.endedMessage, 1_000, '{name} has ended. Winners: {winners}. Thanks to everyone who joined!'),
    canceledMessage: text(raw.canceledMessage, 1_000, '{name} was canceled. Purchased tickets were refunded.'),
    confirmationMessage: text(raw.confirmationMessage, 500, '{viewer}, you now have {tickets} ticket(s) in {name}. Remaining: {points} {currency}.'),
    backgroundColor: color(raw.backgroundColor, '#10201b'), accentColor: color(raw.accentColor, '#7ff5cc'),
    textColor: color(raw.textColor, '#ffffff'), winnerColor: color(raw.winnerColor, '#ffd166'),
    backgroundOpacity: typeof raw.backgroundOpacity === 'number' && Number.isFinite(raw.backgroundOpacity) ? Math.min(0.95, Math.max(0.2, raw.backgroundOpacity)) : 0.72,
    fontFamily: ['display', 'broadcast', 'serif', 'mono'].includes(raw.fontFamily) ? raw.fontFamily : 'broadcast',
    cardSeconds: integer(raw.cardSeconds, 5, 60, 12), showOpenCard: raw.showOpenCard !== false, showWinnerCard: raw.showWinnerCard !== false,
    ticketLayout: raw.ticketLayout === 'wide' ? 'wide' : 'compact', drawAnimationSeconds: integer(raw.drawAnimationSeconds, 2, 10, 4),
    showConfetti: raw.showConfetti !== false, showPrizeImage: raw.showPrizeImage !== false, showWinnerAvatar: raw.showWinnerAvatar !== false,
    showPlatformBadge: raw.showPlatformBadge !== false, showEntryCount: raw.showEntryCount !== false, playWinnerTone: raw.playWinnerTone === true,
    winnerOverlayMessage: text(raw.winnerOverlayMessage, 160, 'The community has chosen!'),
  };
}
function safeEntry(value) {
  if (!value || typeof value !== 'object') return undefined;
  const viewerId = clean(value.viewerId, 64); const displayName = clean(value.displayName, 80); const platform = clean(value.platform, 20);
  const tickets = integer(value.tickets, 1, 100, 0); const pointsSpent = integer(value.pointsSpent, 0, 1_000_000, 0);
  const refundedPoints = integer(value.refundedPoints, 0, pointsSpent, 0);
  if (!validViewerId(viewerId) || !displayName || !PLATFORMS.includes(platform) || tickets < 1) return undefined;
  return { viewerId, displayName, platform, userId: clean(value.userId, 256), avatarUrl: safeAvatarUrl(value.avatarUrl), tickets, luck: integer(value.luck, 1, MAXIMUM_LUCK, 1), pointsSpent, refundedPoints, firstAt: clean(value.firstAt, 40), lastAt: clean(value.lastAt, 40) };
}
function safePending(value) {
  if (!value || typeof value !== 'object') return undefined;
  const viewerId = clean(value.viewerId, 64); const idempotencyKey = clean(value.idempotencyKey, 128);
  const displayName = clean(value.displayName, 80); const platform = clean(value.platform, 20);
  const tickets = integer(value.tickets, 1, 100, 0); const amount = integer(value.amount, 1, 1_000_000, 0);
  return validViewerId(viewerId) && idempotencyKey && displayName && PLATFORMS.includes(platform) && tickets > 0 && amount > 0
    ? { viewerId, idempotencyKey, displayName, platform, userId: clean(value.userId, 256), avatarUrl: safeAvatarUrl(value.avatarUrl), tickets, luck: integer(value.luck, 1, MAXIMUM_LUCK, 1), amount, createdAt: clean(value.createdAt, 40) } : undefined;
}
function safeReceipt(value) {
  if (!value || typeof value !== 'object') return undefined;
  const giveawayId = clean(value.giveawayId, 100); const snapshotDigest = clean(value.snapshotDigest, 64); const drawnAt = clean(value.drawnAt, 40);
  const selectedTicket = integer(value.selectedTicket, 1, MAXIMUM_TICKETS * MAXIMUM_LUCK, 0); const ticketCount = integer(value.totalTickets, 1, MAXIMUM_TICKETS * MAXIMUM_LUCK, 0); const entrantCount = integer(value.entrantCount, 1, MAXIMUM_ENTRANTS, 0);
  return giveawayId && /^[a-f0-9]{64}$/u.test(snapshotDigest) && drawnAt && selectedTicket > 0 && ticketCount > 0 && entrantCount > 0
    ? { giveawayId, selectedTicket, totalTickets: ticketCount, entrantCount, snapshotDigest, drawnAt } : undefined;
}
function safeWinner(value, fallbackState = 'pending') {
  const entry = safeEntry(value); if (!entry) return undefined;
  const receipt = safeReceipt(value.receipt);
  return { ...entry, state: WINNER_STATES.includes(value.state) ? value.state : fallbackState, drawnAt: clean(value.drawnAt, 40), claimDeadline: timestamp(value.claimDeadline), ...(receipt ? { receipt } : {}) };
}
function safeActive(value) {
  if (!value || typeof value !== 'object') return null;
  const id = clean(value.id, 100); const status = clean(value.status, 20);
  if (!id || !ACTIVE_STATES.includes(status)) return null;
  const entries = Array.isArray(value.entries) ? value.entries.map(safeEntry).filter(Boolean).slice(0, MAXIMUM_ENTRANTS) : [];
  const pendingPurchases = Array.isArray(value.pendingPurchases) ? value.pendingPurchases.map(safePending).filter(Boolean).slice(0, 5) : [];
  const pendingRefunds = Array.isArray(value.pendingRefunds) ? value.pendingRefunds.map((item) => clean(item, 64)).filter(validViewerId).slice(0, MAXIMUM_ENTRANTS) : [];
  // Older versions kept one `winner` and one `receipt`; they become the first entry of `winners`.
  let winners = Array.isArray(value.winners) ? value.winners.map((item) => safeWinner(item)).filter(Boolean).slice(0, 50) : [];
  if (winners.length === 0 && value.winner && typeof value.winner === 'object') {
    const legacy = safeWinner({ ...value.winner, receipt: value.receipt, drawnAt: value.drawnAt }, status === 'confirmed' ? 'confirmed' : 'pending');
    if (legacy) winners = [legacy];
  }
  return {
    id, status, name: clean(value.name, 100), description: clean(value.description, 500), prize: clean(value.prize, 160), imageUrl: safeHttpsUrl(value.imageUrl),
    entryMode: ENTRY_MODES.includes(value.entryMode) ? value.entryMode : 'free-single', ticketCost: integer(value.ticketCost, 1, 10_000, 50),
    maxTicketsPerViewer: integer(value.maxTicketsPerViewer, 1, 100, 10), maximumEntrants: integer(value.maximumEntrants, 10, MAXIMUM_ENTRANTS, 80),
    maximumTotalTickets: integer(value.maximumTotalTickets, 10, MAXIMUM_TICKETS, 10_000), eligiblePlatforms: uniquePlatforms(value.eligiblePlatforms),
    entryRoles: entryRoles(value.entryRoles), subscriberLuck: integer(value.subscriberLuck, 1, MAXIMUM_LUCK, 1), vipLuck: integer(value.vipLuck, 1, MAXIMUM_LUCK, 1),
    winnerCount: integer(value.winnerCount, 1, MAXIMUM_WINNERS, 1), excludedViewerIds: Array.isArray(value.excludedViewerIds) ? value.excludedViewerIds.map((item) => clean(item, 64)).filter(validViewerId).slice(0, 200) : [],
    createdAt: clean(value.createdAt, 40), openedAt: clean(value.openedAt, 40), closedAt: clean(value.closedAt, 40), drawnAt: clean(value.drawnAt, 40), endedAt: clean(value.endedAt, 40),
    closesAt: timestamp(value.closesAt), pausedRemainingMs: integer(value.pausedRemainingMs, 0, 180 * 60_000, 0), nextReminderAt: timestamp(value.nextReminderAt), lastCallSent: value.lastCallSent === true,
    entries, pendingPurchases, pendingRefunds, closeRequested: value.closeRequested === true, winners,
  };
}
function safeHistory(item) {
  if (!item || typeof item !== 'object') return undefined;
  const id = clean(item.id, 100); const endedAt = clean(item.endedAt || item.drawnAt, 40);
  const winners = (Array.isArray(item.winners) ? item.winners : [item.winner]).map((name) => clean(name, 80)).filter(Boolean).slice(0, MAXIMUM_WINNERS);
  const winnerIds = Array.isArray(item.winnerIds) ? item.winnerIds.map((viewerId) => clean(viewerId, 64)).filter(validViewerId).slice(0, MAXIMUM_WINNERS) : [];
  const entrantCount = integer(item.entrantCount, 0, MAXIMUM_ENTRANTS, 0); const ticketCount = integer(item.totalTickets, 0, MAXIMUM_TICKETS, 0); const receipt = safeReceipt(item.receipt);
  return id && endedAt ? { id, name: clean(item.name, 100), prize: clean(item.prize, 160), winners, winnerIds, entrantCount, totalTickets: ticketCount, endedAt, ...(receipt ? { receipt } : {}) } : undefined;
}
function stateFor(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const rawDeliveryError = raw.lastDeliveryError && typeof raw.lastDeliveryError === 'object' ? raw.lastDeliveryError : undefined;
  const lastDeliveryError = rawDeliveryError ? { at: clean(rawDeliveryError.at, 40), scope: clean(rawDeliveryError.scope, 40), message: clean(rawDeliveryError.message, 500) } : undefined;
  const history = Array.isArray(raw.history) ? raw.history.map(safeHistory).filter(Boolean).slice(-HISTORY_LIMIT) : [];
  return { version: 2, sequence: integer(raw.sequence, 0, 1_000_000_000, 0), active: safeActive(raw.active), history, ...(lastDeliveryError?.at && lastDeliveryError.message ? { lastDeliveryError } : {}) };
}
function roleSet(event) { return new Set((event.user?.roles || []).map((role) => clean(role, 30).toLowerCase())); }
function moderator(event) {
  const roles = roleSet(event);
  return roles.has('broadcaster') || roles.has('moderator') || roles.has('mod');
}
function subscriber(roles) { return roles.has('subscriber') || roles.has('sub') || roles.has('member') || roles.has('founder'); }
function vip(roles) { return roles.has('vip'); }
function mayEnter(event, active) {
  if (active.entryRoles.includes('everyone')) return true;
  const roles = roleSet(event);
  return (active.entryRoles.includes('subscribers') && subscriber(roles)) || (active.entryRoles.includes('vips') && vip(roles))
    || (active.entryRoles.includes('moderators') && (roles.has('moderator') || roles.has('mod') || roles.has('broadcaster')));
}
function luckFor(event, active) {
  const roles = roleSet(event);
  return Math.max(1, subscriber(roles) ? active.subscriberLuck : 1, vip(roles) ? active.vipLuck : 1);
}
function totalTickets(active) { return active.entries.reduce((sum, entry) => sum + entry.tickets, 0); }
function chances(entry) { return entry.tickets * (entry.luck || 1); }
function format(template, values, maximum) {
  let result = clean(template, maximum * 3);
  for (const [key, value] of Object.entries(values)) result = result.replaceAll(`{${key}}`, clean(String(value), maximum));
  const chars = Array.from(result); return chars.length <= maximum ? result : `${chars.slice(0, Math.max(1, maximum - 1)).join('').trimEnd()}…`;
}
function clock(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000)); const minutes = Math.floor(seconds / 60);
  return `${String(minutes)}:${String(seconds % 60).padStart(2, '0')}`;
}
function sourceLimit(platform) { return LIMITS[platform] || 150; }
function keptWinners(active) { return active.winners.filter((winner) => ['pending', 'claimed', 'confirmed'].includes(winner.state)); }
function entryCommandText(settings, active) {
  return active.entryMode === 'points-multiple' ? `${settings.commandPrefix}${settings.ticketsCommand} <count>` : `${settings.commandPrefix}${settings.enterCommand}`;
}
function messageValues(settings, active, now = Date.now(), extra = {}) {
  return {
    name: active.name, prize: active.prize, entryCommand: entryCommandText(settings, active), entrants: active.entries.length, tickets: totalTickets(active),
    timeLeft: active.closesAt ? clock(active.closesAt - now) : '', claimCommand: `${settings.commandPrefix}${settings.claimCommand}`, seconds: settings.claimSeconds,
    winners: keptWinners(active).map((winner) => winner.displayName).join(', ') || '-', ...extra,
  };
}
async function recordDeliveryWarning(context, scope, message) {
  const state = stateFor(await context.state.read());
  state.lastDeliveryError = { at: new Date().toISOString(), scope: clean(scope, 40), message: clean(message, 500) || 'Unknown delivery failure.' };
  await context.state.write(state);
}
async function reply(context, event, message) {
  try {
    const deliveries = await context.chat.send({ message: clean(message, sourceLimit(event.platform)), routing: 'source', sourcePlatform: event.platform, overflow: 'reject' });
    if (deliveries.length > 0 && !deliveries.some((delivery) => delivery.accepted)) await recordDeliveryWarning(context, `reply:${event.platform}`, deliveries.map((delivery) => delivery.error || 'delivery rejected').join('; '));
    return deliveries;
  } catch (error) {
    await recordDeliveryWarning(context, `reply:${event.platform}`, error instanceof Error ? error.message : String(error));
    return [];
  }
}
async function announce(context, settings, template, values) {
  const deliveries = [];
  for (const platform of settings.announcementPlatforms) {
    const message = format(template, values, LIMITS[platform]);
    try { deliveries.push(...await context.chat.send({ message, routing: 'selected', selectedPlatforms: [platform], overflow: 'reject' })); }
    catch (error) { deliveries.push({ platform, accepted: false, parts: 0, error: clean(error instanceof Error ? error.message : String(error), 200) }); }
  }
  const failures = deliveries.filter((delivery) => !delivery.accepted);
  if (failures.length > 0) await recordDeliveryWarning(context, 'announcement', failures.map((delivery) => `${delivery.platform}: ${delivery.error || 'delivery rejected'}`).join('; '));
  return deliveries;
}
function cardStyle(settings, winner = false) {
  return { backgroundMode: 'glass', backgroundColor: settings.backgroundColor, backgroundOpacity: settings.backgroundOpacity, accentColor: winner ? settings.winnerColor : settings.accentColor, textColor: settings.textColor, fontFamily: settings.fontFamily, layout: settings.ticketLayout, showConfetti: settings.showConfetti, showPrizeImage: settings.showPrizeImage, showWinnerAvatar: settings.showWinnerAvatar, showPlatformBadge: settings.showPlatformBadge, showEntryCount: settings.showEntryCount, playWinnerTone: settings.playWinnerTone };
}
async function publishCard(context, topic, payload) {
  try { await context.overlay.publish(topic, payload, { lane: topic.endsWith('.card.show') ? 'foreground' : 'independent' }); return true; }
  catch (error) { await recordDeliveryWarning(context, 'overlay', error instanceof Error ? error.message : String(error)); return false; }
}
async function publishOpenCard(context, settings, active) {
  if (!settings.showOpenCard) return;
  const entryHint = active.entryMode === 'free-single' ? `Use ${settings.commandPrefix}${settings.enterCommand} for one free entry.`
    : active.entryMode === 'points-single' ? `Use ${settings.commandPrefix}${settings.enterCommand} for one ${active.ticketCost}-point ticket.`
      : `Use ${settings.commandPrefix}${settings.ticketsCommand} <1-${active.maxTicketsPerViewer}>. Each ticket costs ${active.ticketCost} points.`;
  await publishCard(context, `${MODULE_ID}.card.show`, { cardKind: 'village-draw', phase: 'open', giveawayName: active.name, prizeName: active.prize, description: active.description, entryHint, imageUrl: active.imageUrl, durationMs: settings.cardSeconds * 1000, entrantCount: active.entries.length, ticketCount: totalTickets(active), style: cardStyle(settings) });
}
async function publishWinnerCard(context, settings, active, winner) {
  if (!settings.showWinnerCard || !winner) return;
  const claimMs = settings.claimSeconds > 0 ? settings.claimSeconds * 1000 : 0;
  await publishCard(context, `${MODULE_ID}.card.show`, { cardKind: 'village-draw', phase: 'winner', giveawayName: active.name, prizeName: active.prize, imageUrl: active.imageUrl, durationMs: Math.max(settings.cardSeconds * 1000, claimMs + settings.drawAnimationSeconds * 1000 + 2_000), drawAnimationMs: settings.drawAnimationSeconds * 1000, winnerMessage: settings.winnerOverlayMessage,
    ...(claimMs > 0 ? { claimMs } : {}), winner: { displayName: winner.displayName, platform: winner.platform, avatarUrl: winner.avatarUrl || '' }, entrants: active.entries.map((entry) => entry.displayName).slice(0, 20), entrantCount: active.entries.length, ticketCount: totalTickets(active), style: cardStyle(settings, true) });
}
async function publishClaimedCard(context, settings, active, winner) {
  if (!settings.showWinnerCard || !winner) return;
  await publishCard(context, `${MODULE_ID}.card.show`, { cardKind: 'village-draw', phase: 'claimed', giveawayName: active.name, prizeName: active.prize, imageUrl: active.imageUrl, durationMs: settings.cardSeconds * 1000, winnerMessage: settings.winnerOverlayMessage,
    winner: { displayName: winner.displayName, platform: winner.platform, avatarUrl: winner.avatarUrl || '' }, entrantCount: active.entries.length, ticketCount: totalTickets(active), style: cardStyle(settings, true) });
}
function commandFrom(event, settings) {
  if (event.eventType === 'command.received') {
    const command = clean(event.payload?.command, 40).toLowerCase();
    const args = Array.isArray(event.payload?.arguments) ? event.payload.arguments.map((item) => clean(item, 100)).filter(Boolean) : [];
    return command ? { command, args, rawInput: clean(event.payload?.rawInput, 1_000) || `${settings.commandPrefix}${command}${args.length ? ` ${args.join(' ')}` : ''}` } : undefined;
  }
  if (event.eventType !== 'chat.message') return undefined;
  const message = clean(event.payload?.message, 1_000); if (!message.startsWith(settings.commandPrefix)) return undefined;
  const input = message.slice(settings.commandPrefix.length).trim(); if (!input) return undefined;
  const separator = input.search(/\s/u); const invoked = separator < 0 ? input : input.slice(0, separator);
  const command = clean(invoked, 40).toLowerCase(); if (!/^[a-z][a-z0-9-]{0,39}$/u.test(command)) return undefined;
  const remainder = separator < 0 ? '' : input.slice(separator).trim();
  return { command, args: remainder ? remainder.split(/\s+/u).map((item) => clean(item, 100)).filter(Boolean) : [], rawInput: message };
}
function duplicateCommand(event, parsed, now = Date.now()) {
  const key = `${event.platform}|${clean(event.user?.id, 256)}|${event.receivedAt || ''}|${parsed.command}|${parsed.rawInput}`;
  const previous = recentlyHandledCommands.get(key); recentlyHandledCommands.set(key, now);
  const cutoff = now - 10_000;
  while ((recentlyHandledCommands.values().next().value ?? Number.POSITIVE_INFINITY) < cutoff) recentlyHandledCommands.delete(recentlyHandledCommands.keys().next().value);
  if (recentlyHandledCommands.size > 2_000) recentlyHandledCommands.delete(recentlyHandledCommands.keys().next().value);
  return Number.isFinite(previous) && now - previous < 10_000;
}
function coolingDown(event, command, now = Date.now()) {
  if (moderator(event)) return false;
  const key = `${event.platform}:${clean(event.user?.id, 256)}:${command}`; const previous = commandCooldowns.get(key);
  commandCooldowns.set(key, now); if (commandCooldowns.size > 2_000) commandCooldowns.delete(commandCooldowns.keys().next().value);
  return Number.isFinite(previous) && now - previous < 2_000;
}
function secureRandomIndex(maximum) {
  if (!Number.isSafeInteger(maximum) || maximum < 1) throw new Error('A draw requires at least one ticket.');
  const webCrypto = globalThis.crypto; if (!webCrypto?.getRandomValues) throw new Error('Secure random selection is unavailable.');
  const range = 0x1_0000_0000; const limit = range - (range % maximum); const buffer = new Uint32Array(1); let value;
  do { webCrypto.getRandomValues(buffer); value = buffer[0]; } while (value >= limit);
  return value % maximum;
}
// Each ticket counts once per luck step: a sub with 2x luck and 3 tickets holds 6 chances.
function chooseWinner(entries, randomIndex = secureRandomIndex) {
  const count = entries.reduce((sum, entry) => sum + chances(entry), 0); if (count < 1) return undefined;
  const selectedTicket = randomIndex(count); let cursor = 0;
  for (const entry of entries) { cursor += chances(entry); if (selectedTicket < cursor) return { entry, selectedTicket, totalTickets: count }; }
  return undefined;
}
async function snapshotDigest(entries) {
  const material = JSON.stringify(entries.map(({ viewerId, tickets, luck }) => [viewerId, tickets, luck || 1]).sort((a, b) => a[0].localeCompare(b[0])));
  const bytes = new TextEncoder().encode(material); const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}
function publicWinner(winner) { return { name: winner.displayName, platform: winner.platform, state: winner.state, ...(winner.claimDeadline ? { claimDeadline: new Date(winner.claimDeadline).toISOString() } : {}) }; }
function summary(state) {
  const warning = state.lastDeliveryError ? { deliveryWarning: `${state.lastDeliveryError.scope}: ${state.lastDeliveryError.message}`, deliveryWarningAt: state.lastDeliveryError.at } : {};
  const active = state.active; if (!active) return { available: true, status: 'draft', entrantCount: 0, totalTickets: 0, pendingPurchases: 0, totalPointsSpent: 0, winners: [], historyCount: state.history.length, ...warning };
  const latest = active.winners.at(-1); const latestReceipt = latest?.receipt;
  return { available: true, giveawayId: active.id, status: active.status, name: active.name, prize: active.prize, entryMode: active.entryMode, entrantCount: active.entries.length || latestReceipt?.entrantCount || 0, totalTickets: totalTickets(active) || latestReceipt?.totalTickets || 0, pendingPurchases: active.pendingPurchases.length, totalPointsSpent: active.entries.reduce((sum, entry) => sum + entry.pointsSpent - entry.refundedPoints, 0),
    winnerCount: active.winnerCount, winners: active.winners.map(publicWinner), ...(latest && latest.state !== 'skipped' ? { winner: latest.displayName } : {}), ...(latestReceipt ? { receipt: latestReceipt } : {}), ...(active.closesAt ? { closesAt: new Date(active.closesAt).toISOString() } : {}), historyCount: state.history.length, ...warning };
}
function recentWinnerIds(state, count) { return count < 1 ? [] : [...new Set(state.history.slice(-count).flatMap((item) => item.winnerIds))]; }
function activeFromSettings(settings, state, now, minutesOverride) {
  const stamp = new Date(now).toISOString(); const minutes = integer(minutesOverride, 0, 180, settings.autoCloseMinutes);
  return { id: `draw-${String(state.sequence)}-${String(now)}`.slice(0, 100), status: 'open', name: settings.name, description: settings.description, prize: settings.prize, imageUrl: settings.imageUrl, entryMode: settings.entryMode, ticketCost: settings.ticketCost, maxTicketsPerViewer: settings.entryMode === 'points-multiple' ? settings.maxTicketsPerViewer : 1, maximumEntrants: settings.maximumEntrants, maximumTotalTickets: settings.maximumTotalTickets, eligiblePlatforms: settings.eligiblePlatforms,
    entryRoles: settings.entryRoles, subscriberLuck: settings.subscriberLuck, vipLuck: settings.vipLuck, winnerCount: settings.winnerCount, excludedViewerIds: recentWinnerIds(state, settings.skipRecentWinners),
    createdAt: stamp, openedAt: stamp, closedAt: '', drawnAt: '', endedAt: '', closesAt: minutes > 0 ? now + minutes * 60_000 : 0, pausedRemainingMs: 0, nextReminderAt: settings.reminderMinutes > 0 ? now + settings.reminderMinutes * 60_000 : 0, lastCallSent: false,
    entries: [], pendingPurchases: [], pendingRefunds: [], closeRequested: false, winners: [] };
}

// ---------- Timers: auto-close, last call, reminders and the winner's claim time ----------
// One timer points at the next moment something is due. Deadlines live in the saved state, so a
// restart simply re-arms it and anything that came due while StreamBridge was off runs at once.
function nextDeadline(active, settings) {
  if (!active) return 0;
  const due = [];
  if (active.status === 'open') {
    if (active.closesAt) { due.push(active.closesAt); if (!active.lastCallSent && active.closesAt - LAST_CALL_MS > timestamp(Date.parse(active.openedAt)) + LAST_CALL_MS) due.push(active.closesAt - LAST_CALL_MS); }
    if (active.nextReminderAt && settings.reminderMinutes > 0) due.push(active.nextReminderAt);
  }
  if (['drawn', 'closed'].includes(active.status)) for (const winner of active.winners) if (winner.state === 'pending' && winner.claimDeadline) due.push(winner.claimDeadline);
  return due.length ? Math.min(...due) : 0;
}
function armDeadline(context, state, now = Date.now()) {
  if (stopped) return;
  if (deadlineTaskId !== undefined) { context.schedule.cancel(deadlineTaskId); deadlineTaskId = undefined; }
  const next = nextDeadline(state.active, settingsFor(context)); if (!next) return;
  const delay = Math.max(1_000, Math.min(MAXIMUM_TIMER_MS, next - now));
  deadlineTaskId = context.schedule.after(delay, () => {
    deadlineTaskId = undefined;
    operation = operation.then(() => runDeadlines(context), () => runDeadlines(context));
    return operation;
  });
}
async function runDeadlines(context, now = Date.now(), randomIndex = secureRandomIndex) {
  const settings = settingsFor(context); let state = stateFor(await context.state.read()); const active = state.active;
  if (!active) return summary(state);
  if (active.status === 'open') {
    if (active.closesAt && now >= active.closesAt) {
      if (active.pendingPurchases.length === 0) { await closeEntries(context, settings, state, now); }
      else { active.status = 'paused'; active.closeRequested = true; await context.state.write(state); armPurchaseRecovery(context); }
    } else {
      if (active.closesAt && !active.lastCallSent && now >= active.closesAt - LAST_CALL_MS) {
        active.lastCallSent = true; await context.state.write(state);
        await announce(context, settings, settings.lastCallMessage, messageValues(settings, active, now));
      }
      if (active.nextReminderAt && settings.reminderMinutes > 0 && now >= active.nextReminderAt) {
        active.nextReminderAt = now + settings.reminderMinutes * 60_000;
        // A reminder that would land on top of the last call is skipped.
        const crowded = active.closesAt && active.closesAt - now <= LAST_CALL_MS + 30_000;
        await context.state.write(state);
        if (!crowded) await announce(context, settings, settings.reminderMessage, messageValues(settings, active, now));
      }
    }
  }
  if (['drawn', 'closed'].includes(state.active?.status)) {
    const expired = state.active.winners.filter((winner) => winner.state === 'pending' && winner.claimDeadline && now >= winner.claimDeadline);
    for (const winner of expired) {
      winner.state = 'missed'; winner.claimDeadline = 0; await context.state.write(state);
      await announce(context, settings, settings.noClaimMessage, messageValues(settings, state.active, now, { winner: winner.displayName }));
      if (settings.noClaimAction === 'redraw') {
        winner.state = 'skipped'; await context.state.write(state);
        try { state = await drawNext(context, settings, state, now, randomIndex); } catch { /* nobody left to draw; the Control Panel shows the missed winner */ }
      }
    }
  }
  state = stateFor(await context.state.read()); armDeadline(context, state, now);
  return summary(state);
}

function armPurchaseRecovery(context, delayMs = 30_000) {
  if (stopped || purchaseRecoveryTaskId !== undefined) return;
  purchaseRecoveryTaskId = context.schedule.after(delayMs, () => {
    purchaseRecoveryTaskId = undefined;
    const recover = async () => {
      const state = await recoverPendingPurchases(context, stateFor(await context.state.read()), false);
      if (state.active?.pendingPurchases.length) armPurchaseRecovery(context);
    };
    operation = operation.then(recover, recover);
    return operation;
  });
}
async function recoverPendingPurchases(context, state, strict = true) {
  const active = state.active; if (!active || !active.pendingPurchases.length) return state;
  for (const pending of [...active.pendingPurchases]) {
    let result;
    try { result = await context.viewerFoundation.mutate({ viewerId: pending.viewerId, operation: 'spend', amount: pending.amount, reason: `Village Draw tickets for ${active.name}`.slice(0, 200), idempotencyKey: pending.idempotencyKey }); }
    catch (error) {
      if (/insufficient|enough|balance/iu.test(error instanceof Error ? error.message : String(error))) {
        active.pendingPurchases = active.pendingPurchases.filter((candidate) => candidate.idempotencyKey !== pending.idempotencyKey); await context.state.write(state);
      }
      if (strict) throw error;
      continue;
    }
    let entry = active.entries.find((candidate) => candidate.viewerId === pending.viewerId);
    if (!entry) { entry = { viewerId: pending.viewerId, displayName: pending.displayName, platform: pending.platform, userId: pending.userId || '', avatarUrl: pending.avatarUrl || '', tickets: 0, luck: pending.luck || 1, pointsSpent: 0, refundedPoints: 0, firstAt: pending.createdAt, lastAt: pending.createdAt }; active.entries.push(entry); }
    entry.displayName = pending.displayName; entry.platform = pending.platform; if (pending.userId) entry.userId = pending.userId; if (pending.avatarUrl) entry.avatarUrl = pending.avatarUrl;
    entry.luck = Math.max(entry.luck || 1, pending.luck || 1); entry.tickets += pending.tickets; entry.pointsSpent += pending.amount; entry.lastAt = pending.createdAt;
    active.pendingPurchases = active.pendingPurchases.filter((candidate) => candidate.idempotencyKey !== pending.idempotencyKey);
    if (result.duplicate && entry.tickets > active.maxTicketsPerViewer) entry.tickets = active.maxTicketsPerViewer;
    await context.state.write(state);
  }
  if (active.closeRequested && active.pendingPurchases.length === 0 && active.status === 'paused') {
    active.closeRequested = false; active.status = 'closed'; active.closedAt = new Date().toISOString(); await context.state.write(state);
  }
  return state;
}
async function beginRefund(context, state) {
  const active = state.active; if (!active) return state;
  if (active.status !== 'canceling') {
    active.status = 'canceling'; active.closeRequested = false;
    active.pendingRefunds = active.entries.filter((entry) => entry.pointsSpent > entry.refundedPoints).map((entry) => entry.viewerId);
    await context.state.write(state);
  }
  return state;
}
function armRefund(context, delayMs = 1_000) {
  if (stopped || refundTaskId !== undefined) return;
  refundTaskId = context.schedule.after(delayMs, () => {
    refundTaskId = undefined;
    operation = operation.then(() => refundBatch(context), () => refundBatch(context));
    return operation;
  });
}
async function refundBatch(context) {
  const settings = settingsFor(context); const state = await recoverPendingPurchases(context, stateFor(await context.state.read()), false); const active = state.active;
  if (!active || active.status !== 'canceling') return summary(state);
  if (active.pendingPurchases.length > 0) { armPurchaseRecovery(context); armRefund(context, 30_000); return summary(state); }
  active.pendingRefunds = [...new Set([...active.pendingRefunds, ...active.entries.filter((entry) => entry.pointsSpent > entry.refundedPoints).map((entry) => entry.viewerId)])];
  let retryNeeded = false;
  for (const viewerId of active.pendingRefunds.slice(0, 10)) {
    const entry = active.entries.find((candidate) => candidate.viewerId === viewerId); const amount = entry ? entry.pointsSpent - entry.refundedPoints : 0;
    if (entry && amount > 0) {
      try { await context.viewerFoundation.mutate({ viewerId, operation: 'refund', amount, reason: `Canceled Village Draw: ${active.name}`.slice(0, 200), idempotencyKey: `refund-${active.id}-${viewerId}`.slice(0, 128) }); }
      catch { retryNeeded = true; continue; }
      entry.refundedPoints += amount;
    }
    active.pendingRefunds = active.pendingRefunds.filter((candidate) => candidate !== viewerId);
    await context.state.write(state);
  }
  if (active.pendingRefunds.length > 0) { armRefund(context, retryNeeded ? 30_000 : 1_000); return summary(state); }
  active.status = 'canceled'; active.entries = []; active.pendingPurchases = []; active.closesAt = 0; active.nextReminderAt = 0; await context.state.write(state);
  await announce(context, settings, settings.canceledMessage, { name: active.name, prize: active.prize });
  return summary(state);
}
async function buyTickets(event, context, state, requested) {
  const active = state.active; const settings = settingsFor(context);
  if (!active || active.status !== 'open') { await reply(context, event, 'The giveaway is not open.'); return { accepted: false, reason: 'not-open' }; }
  if (!active.eligiblePlatforms.includes(event.platform)) { await reply(context, event, 'This platform is not eligible for the current giveaway.'); return { accepted: false, reason: 'platform-not-eligible' }; }
  if (!mayEnter(event, active)) { await reply(context, event, 'This giveaway is only open to some viewers. Check the giveaway message for who can join.'); return { accepted: false, reason: 'role-not-eligible' }; }
  const platformUserId = clean(event.user?.id, 256); if (!platformUserId) return { accepted: false, reason: 'missing-stable-id' };
  const projection = await context.viewerFoundation.getProjection({ platform: event.platform, userId: platformUserId });
  if (!projection) { await reply(context, event, 'Viewer Foundation could not resolve your account.'); return { accepted: false, reason: 'viewer-unavailable' }; }
  if (active.excludedViewerIds.includes(projection.viewerId)) { await reply(context, event, 'You won a recent giveaway, so you sit this one out. Thanks for giving others a chance!'); return { accepted: false, reason: 'recent-winner' }; }
  const existing = active.entries.find((entry) => entry.viewerId === projection.viewerId); const currentTickets = existing?.tickets || 0;
  if (active.pendingPurchases.some((pending) => pending.viewerId === projection.viewerId)) { await reply(context, event, 'Your previous ticket purchase is still being recovered. Please wait before trying again.'); return { accepted: false, reason: 'purchase-pending' }; }
  const left = Math.max(0, active.maxTicketsPerViewer - currentTickets);
  const affordable = active.entryMode === 'free-single' ? left : Math.floor((projection.points || 0) / active.ticketCost);
  const ticketCount = active.entryMode === 'points-multiple' ? (requested === 'max' ? Math.max(1, Math.min(left, affordable)) : integer(requested, 1, active.maxTicketsPerViewer, 1)) : 1;
  if (currentTickets >= active.maxTicketsPerViewer || currentTickets + ticketCount > active.maxTicketsPerViewer) { await reply(context, event, `You may hold at most ${active.maxTicketsPerViewer} ticket(s).`); return { accepted: false, reason: 'viewer-limit' }; }
  if (!existing && active.entries.length >= active.maximumEntrants) { await reply(context, event, 'The giveaway entrant limit has been reached.'); return { accepted: false, reason: 'entrant-limit' }; }
  if (totalTickets(active) + ticketCount > active.maximumTotalTickets) { await reply(context, event, 'The giveaway ticket limit has been reached.'); return { accepted: false, reason: 'ticket-limit' }; }
  const displayName = clean(event.user?.displayName || event.user?.name, 80) || 'Viewer'; const now = new Date().toISOString(); const luck = luckFor(event, active);
  if (active.entryMode === 'free-single') {
    active.entries.push({ viewerId: projection.viewerId, displayName, platform: event.platform, userId: platformUserId, avatarUrl: safeAvatarUrl(event.user?.avatarUrl), tickets: 1, luck, pointsSpent: 0, refundedPoints: 0, firstAt: now, lastAt: now });
    await context.state.write(state); await reply(context, event, format(settings.confirmationMessage, { viewer: displayName, tickets: 1, name: active.name, points: projection.points, currency: projection.currencyName || 'points' }, sourceLimit(event.platform)));
    return { accepted: true, tickets: 1, points: projection.points };
  }
  const amount = ticketCount * active.ticketCost; const idempotencyKey = `purchase-${active.id}-${clean(event.eventId, 80)}-${projection.viewerId}`.slice(0, 128);
  const pending = { viewerId: projection.viewerId, idempotencyKey, displayName, platform: event.platform, userId: platformUserId, avatarUrl: safeAvatarUrl(event.user?.avatarUrl), tickets: ticketCount, luck, amount, createdAt: now };
  active.pendingPurchases.push(pending); await context.state.write(state);
  try { state = await recoverPendingPurchases(context, state); }
  catch (error) {
    active.pendingPurchases = active.pendingPurchases.filter((candidate) => candidate.idempotencyKey !== idempotencyKey); await context.state.write(state);
    const message = /insufficient|enough|balance/iu.test(error instanceof Error ? error.message : String(error)) ? 'You do not have enough points for those tickets.' : 'The ticket purchase could not be completed. No duplicate charge will be created.';
    await reply(context, event, message); return { accepted: false, reason: 'spend-failed' };
  }
  const updated = state.active?.entries.find((entry) => entry.viewerId === projection.viewerId); const after = await context.viewerFoundation.getProjection({ viewerId: projection.viewerId });
  await reply(context, event, format(settings.confirmationMessage, { viewer: displayName, tickets: updated?.tickets || currentTickets + ticketCount, name: active.name, points: after?.points ?? projection.points - amount, currency: after?.currencyName || projection.currencyName || 'points' }, sourceLimit(event.platform)));
  return { accepted: true, tickets: updated?.tickets, points: after?.points };
}

// ---------- Lifecycle steps ----------
async function closeEntries(context, settings, state, now) {
  const active = state.active;
  active.status = 'closed'; active.closedAt = new Date(now).toISOString(); active.closesAt = 0; active.nextReminderAt = 0; active.pausedRemainingMs = 0; active.closeRequested = false;
  await context.state.write(state);
  await announce(context, settings, settings.closedMessage, messageValues(settings, active, now));
  return state;
}
async function drawNext(context, settings, state, now, randomIndex) {
  const active = state.active;
  const taken = new Set(active.winners.map((winner) => winner.viewerId));
  const pool = active.entries.filter((entry) => !taken.has(entry.viewerId));
  const selected = chooseWinner(pool, randomIndex);
  if (!selected) throw new Error(active.entries.length === 0 ? 'Nobody entered this giveaway.' : 'Everyone who entered has already been picked.');
  const drawnAt = new Date(now).toISOString();
  const receipt = { giveawayId: active.id, selectedTicket: selected.selectedTicket + 1, totalTickets: selected.totalTickets, entrantCount: pool.length, snapshotDigest: await snapshotDigest(pool), drawnAt };
  const winner = { ...selected.entry, state: 'pending', drawnAt, claimDeadline: settings.claimSeconds > 0 ? now + settings.claimSeconds * 1000 + settings.drawAnimationSeconds * 1000 : 0, receipt };
  active.winners.push(winner); active.status = 'drawn'; active.drawnAt = drawnAt;
  await context.state.write(state);
  await publishWinnerCard(context, settings, active, winner);
  await announce(context, settings, settings.winnerMessage, messageValues(settings, active, now, { winner: winner.displayName }));
  if (settings.claimSeconds > 0) await announce(context, settings, settings.claimMessage, messageValues(settings, active, now, { winner: winner.displayName }));
  return state;
}
async function endGiveaway(context, settings, state, now) {
  const active = state.active;
  const winners = keptWinners(active);
  if (winners.length === 0 && active.entries.some((entry) => entry.pointsSpent > entry.refundedPoints)) throw new Error('Viewers paid points for this giveaway. Draw a winner first, or use Cancel and refund to give the points back.');
  winners.forEach((winner) => { if (winner.state === 'pending') { winner.state = 'confirmed'; winner.claimDeadline = 0; } });
  const latest = winners.at(-1);
  state.history.push({ id: active.id, name: active.name, prize: active.prize, winners: winners.map((winner) => winner.displayName), winnerIds: winners.map((winner) => winner.viewerId), entrantCount: active.entries.length, totalTickets: totalTickets(active), endedAt: new Date(now).toISOString(), ...(latest?.receipt ? { receipt: latest.receipt } : {}) });
  state.history = state.history.slice(-HISTORY_LIMIT);
  const values = messageValues(settings, active, now);
  active.status = 'ended'; active.endedAt = new Date(now).toISOString(); active.closesAt = 0; active.nextReminderAt = 0;
  active.entries = []; active.pendingPurchases = []; active.pendingRefunds = [];
  await context.state.write(state);
  await announce(context, settings, settings.endedMessage, values);
  return state;
}
function findWinner(active, viewerId, states) {
  const wanted = clean(viewerId, 64);
  const candidates = active.winners.filter((winner) => states.includes(winner.state));
  return wanted ? candidates.find((winner) => winner.viewerId === wanted) : candidates.at(-1);
}
async function removeEntrant(context, state, viewerId) {
  const active = state.active; const entry = active.entries.find((candidate) => candidate.viewerId === clean(viewerId, 64));
  if (!entry) throw new Error('That viewer is not in this giveaway.');
  const amount = entry.pointsSpent - entry.refundedPoints;
  if (amount > 0) await context.viewerFoundation.mutate({ viewerId: entry.viewerId, operation: 'refund', amount, reason: `Removed from Village Draw: ${active.name}`.slice(0, 200), idempotencyKey: `remove-${active.id}-${entry.viewerId}`.slice(0, 128) });
  active.entries = active.entries.filter((candidate) => candidate.viewerId !== entry.viewerId);
  await context.state.write(state);
  return entry;
}

async function control(request, context, now = Date.now(), randomIndex = secureRandomIndex) {
  const settings = settingsFor(context); let state = stateFor(await context.state.read()); state = await recoverPendingPurchases(context, state, false); if (state.active?.pendingPurchases.length) armPurchaseRecovery(context);
  const operationName = request.operation === 'start' ? 'open' : request.operation;
  const frozenOperations = new Set(['open', 'close', 'draw', 'confirm', 'redraw', 'reset', 'end']);
  if (state.active?.pendingPurchases.length && frozenOperations.has(operationName)) throw new Error(`Wait for ${String(state.active.pendingPurchases.length)} pending ticket purchase(s) to settle, or cancel and refund the giveaway.`);
  const finish = (result) => { armDeadline(context, state, now); return summary(result); };
  const active = state.active;
  switch (operationName) {
    case 'status': return summary(state);
    case 'open': {
      if (!settings.enabled) throw new Error('Enable Village Draw settings before opening a giveaway.');
      if (active && !FINISHED_STATES.includes(active.status)) throw new Error('Finish or cancel the current giveaway before opening another.');
      state.sequence += 1; state.active = activeFromSettings(settings, state, now, request.minutes); await context.state.write(state);
      await announce(context, settings, settings.openMessage, messageValues(settings, state.active, now));
      await publishOpenCard(context, settings, state.active); return finish(state);
    }
    case 'pause': {
      if (active?.status !== 'open') throw new Error('Only an open giveaway can be paused.');
      active.status = 'paused'; active.pausedRemainingMs = active.closesAt ? Math.max(0, active.closesAt - now) : 0; active.closesAt = 0; await context.state.write(state); return finish(state);
    }
    case 'resume': {
      if (active?.status !== 'paused') throw new Error('Only a paused giveaway can be resumed.');
      active.status = 'open'; active.closeRequested = false;
      if (active.pausedRemainingMs) { active.closesAt = now + Math.max(LAST_CALL_MS + 1_000, active.pausedRemainingMs); active.pausedRemainingMs = 0; }
      if (settings.reminderMinutes > 0) active.nextReminderAt = now + settings.reminderMinutes * 60_000;
      await context.state.write(state); return finish(state);
    }
    case 'close': {
      if (!active || !['open', 'paused'].includes(active.status)) throw new Error('Only an open or paused giveaway can be closed.');
      await closeEntries(context, settings, state, now); return finish(state);
    }
    case 'draw': {
      if (!active || !['open', 'paused', 'closed', 'drawn'].includes(active.status)) throw new Error('Start a giveaway before drawing a winner.');
      if (['open', 'paused'].includes(active.status)) await closeEntries(context, settings, state, now);
      state = await drawNext(context, settings, state, now, randomIndex); return finish(state);
    }
    case 'redraw': {
      if (active?.status !== 'drawn') throw new Error('Draw a winner before drawing again.');
      const winner = findWinner(active, request.viewerId, ['pending', 'missed', 'claimed']);
      if (!winner) throw new Error('There is no winner to replace.');
      winner.state = 'skipped'; winner.claimDeadline = 0; await context.state.write(state);
      state = await drawNext(context, settings, state, now, randomIndex); return finish(state);
    }
    case 'confirm': {
      if (active?.status !== 'drawn') throw new Error('Draw a winner before confirming the result.');
      const winner = findWinner(active, request.viewerId, ['pending', 'missed', 'claimed']) ;
      if (!winner) throw new Error('There is no winner waiting for confirmation.');
      const announced = winner.state === 'claimed'; winner.state = 'confirmed'; winner.claimDeadline = 0; await context.state.write(state);
      if (!announced) await announce(context, settings, settings.claimedMessage, messageValues(settings, active, now, { winner: winner.displayName }));
      const kept = active.winners.filter((candidate) => ['claimed', 'confirmed'].includes(candidate.state)).length;
      const waiting = active.winners.some((candidate) => ['pending', 'missed'].includes(candidate.state));
      if (kept >= active.winnerCount && !waiting) await endGiveaway(context, settings, state, now);
      return finish(state);
    }
    case 'end': {
      if (!active || FINISHED_STATES.includes(active.status) || active.status === 'canceling') throw new Error('There is no giveaway to end.');
      await endGiveaway(context, settings, state, now); return finish(state);
    }
    case 'remove': {
      if (!active || !['open', 'paused', 'closed', 'drawn'].includes(active.status)) throw new Error('There is no running giveaway.');
      await removeEntrant(context, state, request.viewerId); return finish(state);
    }
    case 'cancel': {
      if (!active || FINISHED_STATES.includes(active.status)) throw new Error('There is no cancelable giveaway.');
      state = await beginRefund(context, state); armRefund(context); return finish(state);
    }
    case 'reset': {
      if (active && !FINISHED_STATES.includes(active.status)) throw new Error('End or cancel the current giveaway before clearing it.');
      state.active = null; await context.state.write(state); return finish(state);
    }
    default: throw new Error('Unsupported Village Draw operation.');
  }
}

// ---------- Control Panel tab: the stage with the next sensible buttons, the winners and everyone who joined ----------
const DRAW_STAGE_LABELS = Object.freeze({ none: 'No giveaway', draft: 'No giveaway', canceling: 'Canceling and refunding', open: 'Open for entries', paused: 'Entries paused', closed: 'Entries closed', drawn: 'Picking winners', confirmed: 'Ended', ended: 'Ended', canceled: 'Canceled' });
const WINNER_LABELS = Object.freeze({ pending: 'Waiting for them to answer', claimed: 'Answered in chat', confirmed: 'Confirmed', missed: 'Did not answer in time', skipped: 'Redrawn' });
function stageActions(active) {
  const stage = active?.status ?? 'none';
  if (!active || FINISHED_STATES.includes(stage)) return [{ action: 'open', label: 'Start giveaway', style: 'primary' }];
  const end = { action: 'end', label: 'End giveaway', confirm: 'End this giveaway and save it to the history?' };
  if (stage === 'open') return [{ action: 'close', label: 'Close entries', style: 'primary' }, { action: 'draw', label: 'Close and draw a winner' }, { action: 'pause', label: 'Pause entries' }];
  if (stage === 'paused') return [{ action: 'resume', label: 'Resume entries', style: 'primary' }, { action: 'close', label: 'Close entries' }];
  if (stage === 'closed') return [{ action: 'draw', label: 'Draw a winner', style: 'primary' }, end];
  if (stage === 'drawn') {
    const waiting = active.winners.some((winner) => ['pending', 'missed', 'claimed'].includes(winner.state));
    const kept = active.winners.filter((winner) => ['pending', 'claimed', 'confirmed'].includes(winner.state)).length;
    return [
      ...(waiting ? [{ action: 'confirm', label: 'Winner confirmed', style: 'primary' }, { action: 'redraw', label: 'Not here, draw again', confirm: 'Skip this winner and draw someone else?' }] : []),
      ...(kept < active.winnerCount ? [{ action: 'draw', label: 'Draw next winner', ...(waiting ? {} : { style: 'primary' }) }] : []),
      end,
    ];
  }
  return [];
}
function ago(iso, now) {
  const at = Date.parse(iso); if (!Number.isFinite(at)) return '';
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  return minutes < 1 ? 'just now' : minutes < 60 ? `${String(minutes)} min ago` : `${String(Math.round(minutes / 60))} h ago`;
}
const PLATFORM_LABELS = { twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick', tiktok: 'TikTok', facebook: 'Facebook' };
function platformLabel(platform) { return PLATFORM_LABELS[platform] ?? platform; }

async function drawPanel(request, context, now = Date.now()) {
  let message = '';
  if (request?.operation === 'action') {
    const action = clean(request.action, 40); const viewerId = clean(request.values?.viewerId, 64); const minutes = Number(request.values?.minutes);
    if (!['open', 'pause', 'resume', 'close', 'draw', 'confirm', 'redraw', 'cancel', 'end', 'remove'].includes(action)) throw new Error('Unknown Village Draw control.');
    const result = await control({ operation: action, approvedByCreator: true, ...(viewerId ? { viewerId } : {}), ...(Number.isSafeInteger(minutes) ? { minutes } : {}) }, context, now);
    message = ['draw', 'redraw'].includes(action) ? `The winner is ${String(result.winner ?? '')}.`
      : action === 'cancel' ? 'Giveaway canceled; points are being refunded.'
        : action === 'end' || result.status === 'ended' ? 'Giveaway ended and saved to the history.'
          : action === 'remove' ? 'Removed. Any points they spent were refunded.' : action === 'open' ? 'Giveaway started.' : 'Done.';
  }
  const state = stateFor(await context.state.read()); const active = state.active; const stage = active?.status ?? 'none';
  const entries = active ? [...active.entries].sort((a, b) => chances(b) - chances(a) || a.displayName.localeCompare(b.displayName)) : [];
  const running = active && ['open', 'paused', 'closed', 'drawn'].includes(stage);
  const totalChances = entries.reduce((sum, entry) => sum + chances(entry), 0);
  const winners = active ? active.winners.filter((winner) => winner.state !== 'skipped' || active.status === 'drawn') : [];
  return {
    ...(message ? { message } : {}),
    ...(active?.pendingPurchases.length ? { notice: `${String(active.pendingPurchases.length)} ticket purchase(s) are still being settled.` } : {}),
    summary: [
      { label: 'Stage', value: DRAW_STAGE_LABELS[stage] ?? stage },
      { label: 'Giveaway', value: active && running ? `${active.name}${active.prize ? ` · ${active.prize}` : ''}` : 'Set the name and prize below, then start' },
      { label: 'Entrants', value: String(entries.length) }, { label: 'Tickets', value: String(totalTickets(active || { entries: [] })) },
      ...(active?.status === 'open' && active.closesAt ? [{ label: 'Closes in', value: clock(active.closesAt - now) }] : []),
      ...(running ? [{ label: 'Winners', value: `${String(keptWinners(active).length)} of ${String(active.winnerCount)}` }] : []),
    ],
    actions: [...stageActions(active), ...(running ? [{ action: 'cancel', label: 'Cancel and refund', style: 'danger', confirm: 'Cancel this giveaway and refund everyone?' }] : [])],
    lists: [
      ...(running && winners.length ? [{ title: 'Winners', empty: 'No winners yet.', items: winners.map((winner) => {
        const waiting = winner.state === 'pending' && winner.claimDeadline ? ` · ${clock(winner.claimDeadline - now)} left` : '';
        const open = active.status === 'drawn' && ['pending', 'missed', 'claimed'].includes(winner.state);
        return { title: winner.displayName, detail: `${platformLabel(winner.platform)} · ${WINNER_LABELS[winner.state] ?? winner.state}${waiting}`, badge: winner.state === 'skipped' ? '' : 'Winner',
          ...(open ? { actions: [{ action: 'confirm', label: 'Confirm', values: { viewerId: winner.viewerId } }, { action: 'redraw', label: 'Draw again', confirm: `Skip ${winner.displayName} and draw someone else?`, values: { viewerId: winner.viewerId } }] } : {}) };
      }) }] : []),
      { title: 'Entries', empty: running ? 'No entries yet.' : 'Start a giveaway to take entries.', items: (running ? entries : []).slice(0, 300).map((entry) => {
        const chance = totalChances > 0 ? Math.max(0.1, Math.round((chances(entry) / totalChances) * 1000) / 10) : 0;
        return { title: entry.displayName, detail: `${platformLabel(entry.platform)} · ${String(entry.tickets)} ticket${entry.tickets === 1 ? '' : 's'}${entry.luck > 1 ? ` · ${String(entry.luck)}x luck` : ''} · ${String(chance)}% · joined ${ago(entry.firstAt, now)}`,
          badge: active.winners.some((winner) => winner.viewerId === entry.viewerId && winner.state !== 'skipped') ? 'Winner' : '',
          actions: [{ action: 'remove', label: 'Remove', style: 'danger', confirm: `Remove ${entry.displayName} from the giveaway?${entry.pointsSpent > entry.refundedPoints ? ' Their points are refunded.' : ''}`, values: { viewerId: entry.viewerId } }] };
      }) },
      { title: 'Past giveaways', empty: 'Ended giveaways show up here.', items: [...state.history].reverse().slice(0, HISTORY_LIMIT).map((item) => ({ title: `${item.name || 'Giveaway'}${item.prize ? ` · ${item.prize}` : ''}`, detail: `${item.winners.join(', ') || 'No winner'} · ${String(item.entrantCount)} entrant${item.entrantCount === 1 ? '' : 's'} · ${item.endedAt.slice(0, 10)}` })) },
    ],
  };
}

async function handleClaim(event, context, state, parsed) {
  const active = state.active; if (!active || !['drawn', 'closed'].includes(active.status)) return false;
  const userId = clean(event.user?.id, 256); if (!userId) return false;
  const winner = active.winners.find((candidate) => candidate.state === 'pending' && candidate.platform === event.platform && candidate.userId === userId);
  if (!winner) return false;
  const settings = settingsFor(context);
  const usedClaimCommand = parsed?.command === settings.claimCommand;
  if (!usedClaimCommand && settings.claimMode === 'claim-command') return false;
  winner.state = 'claimed'; winner.claimDeadline = 0; await context.state.write(state);
  await publishClaimedCard(context, settings, active, winner);
  await announce(context, settings, settings.claimedMessage, messageValues(settings, active, Date.now(), { winner: winner.displayName }));
  armDeadline(context, state);
  return true;
}
function infoReply(settings, state, now = Date.now()) {
  const active = state.active;
  if (!active || FINISHED_STATES.includes(active.status)) return 'There is no giveaway running right now.';
  const base = `${active.name}: ${active.prize}.`;
  if (active.status === 'open') return `${base} Type ${entryCommandText(settings, active)} to join. ${String(active.entries.length)} entered so far.${active.closesAt ? ` Closes in ${clock(active.closesAt - now)}.` : ''}`;
  if (active.status === 'paused') return `${base} Entries are paused for a moment. ${String(active.entries.length)} entered so far.`;
  const winners = keptWinners(active).map((winner) => winner.displayName);
  return `${base} Entries are closed. ${String(active.entries.length)} entered.${winners.length ? ` Winners: ${winners.join(', ')}.` : ' Drawing soon!'}`;
}
function winnersReply(state) {
  const active = state.active;
  if (active && ['drawn', 'closed'].includes(active.status) && keptWinners(active).length) return `Winners of ${active.name}: ${keptWinners(active).map((winner) => winner.displayName).join(', ')}.`;
  const last = state.history.at(-1);
  return last ? `Winners of ${last.name || 'the last giveaway'}${last.prize ? ` (${last.prize})` : ''}: ${last.winners.join(', ') || 'nobody'}.` : 'No giveaway has ended yet.';
}

async function processEvent(event, context) {
  noteChannel(event);
  const settings = settingsFor(context); if (!settings.enabled) return;
  if (event.eventType === 'stream.online' && event.metadata?.simulated !== true && PLATFORMS.includes(event.platform)) { livePlatforms.add(event.platform); return; }
  if (event.eventType === 'stream.offline' && event.metadata?.simulated !== true && PLATFORMS.includes(event.platform)) {
    if (!livePlatforms.has(event.platform)) return;
    livePlatforms.delete(event.platform); if (livePlatforms.size > 0 || settings.streamEndBehavior === 'leave-open') return;
    let state = stateFor(await context.state.read()); state = await recoverPendingPurchases(context, state, false); const active = state.active;
    if (!active || !['open', 'paused'].includes(active.status)) return;
    if (settings.streamEndBehavior === 'pause') { active.pausedRemainingMs = active.closesAt ? Math.max(0, active.closesAt - Date.now()) : active.pausedRemainingMs; active.closesAt = 0; active.status = 'paused'; }
    if (settings.streamEndBehavior === 'close') {
      if (active.pendingPurchases.length > 0) { active.status = 'paused'; active.closeRequested = true; armPurchaseRecovery(context); }
      else { active.status = 'closed'; active.closedAt = new Date().toISOString(); active.closeRequested = false; active.closesAt = 0; active.nextReminderAt = 0; }
    }
    await context.state.write(state); armDeadline(context, state); return;
  }
  let state = stateFor(await context.state.read()); state = await recoverPendingPurchases(context, state, false); if (state.active?.pendingPurchases.length) armPurchaseRecovery(context); if (state.active?.status === 'canceling') return;
  if (event.user?.actorType !== 'human' || !PLATFORMS.includes(event.platform)) return;
  const parsed = commandFrom(event, settings);
  // A drawn winner claims by chatting (or with the claim command, when that is required).
  if (event.metadata?.simulated !== true && (event.eventType === 'chat.message' || parsed?.command === settings.claimCommand) && await handleClaim(event, context, state, parsed)) { if (parsed) duplicateCommand(event, parsed); return; }
  if (!parsed || duplicateCommand(event, parsed)) return;
  const { command, args } = parsed;
  if (![settings.giveawayCommand, settings.enterCommand, settings.ticketsCommand, settings.myTicketsCommand, settings.claimCommand, settings.winnersCommand].includes(command) || coolingDown(event, command)) return;
  if (event.metadata?.simulated === true) {
    if ([settings.claimCommand, settings.winnersCommand].includes(command)) return;
    await publishCard(context, `${MODULE_ID}.card.show`, { cardKind: 'village-draw', phase: 'winner', giveawayName: settings.name, prizeName: settings.prize, imageUrl: settings.imageUrl, durationMs: settings.cardSeconds * 1000, drawAnimationMs: settings.drawAnimationSeconds * 1000, winnerMessage: settings.winnerOverlayMessage,
      winner: { displayName: 'Example Villager', platform: event.platform, avatarUrl: safeAvatarUrl(event.user?.avatarUrl) }, entrants: ['CozySloth', 'Early Bird', 'Night Owl', 'Example Villager'], entrantCount: 42, ticketCount: 84, style: cardStyle(settings, true), preview: true });
    return;
  }
  if (command === settings.giveawayCommand) {
    const action = (args[0] || 'info').toLowerCase();
    if (moderator(event) && ['open', 'start', 'pause', 'resume', 'close', 'draw', 'confirm', 'redraw', 'end', 'cancel', 'reset'].includes(action)) {
      const minutes = Number(args[1]);
      try {
        const result = await control({ operation: action, approvedByCreator: true, ...(['open', 'start'].includes(action) && Number.isSafeInteger(minutes) ? { minutes } : {}) }, context);
        await reply(context, event, `Giveaway: ${DRAW_STAGE_LABELS[result.status] ?? result.status}. ${String(result.entrantCount)} entrant(s), ${String(result.totalTickets)} ticket(s).${result.winner && ['draw', 'redraw'].includes(action) ? ` Winner: ${String(result.winner)}.` : ''}`);
      } catch (error) { await reply(context, event, clean(error instanceof Error ? error.message : String(error), sourceLimit(event.platform))); }
      return;
    }
    return reply(context, event, infoReply(settings, state));
  }
  if (command === settings.winnersCommand) return reply(context, event, winnersReply(state));
  if (command === settings.claimCommand) return;
  if (command === settings.myTicketsCommand) {
    const userId = clean(event.user?.id, 256); const projection = userId ? await context.viewerFoundation.getProjection({ platform: event.platform, userId }) : undefined;
    const active = state.active; const entry = projection && active?.entries.find((candidate) => candidate.viewerId === projection.viewerId);
    if (!entry) return reply(context, event, 'You have no tickets in the current giveaway.');
    const total = active.entries.reduce((sum, candidate) => sum + chances(candidate), 0);
    const chance = total > 0 ? Math.max(0.1, Math.round((chances(entry) / total) * 1000) / 10) : 0;
    return reply(context, event, `${clean(event.user?.displayName || event.user?.name, 80)}, you have ${String(entry.tickets)} ticket(s) in ${active.name} (about ${String(chance)}% chance right now).`);
  }
  if (command === settings.enterCommand) return buyTickets(event, context, state, 1);
  if (command === settings.ticketsCommand) return buyTickets(event, context, state, (args[0] || '').toLowerCase() === 'max' ? 'max' : Number(args[0]) || 1);
}

export default {
  manifest, required: false,
  async start(context) {
    stopped = false; operation = Promise.resolve(); livePlatforms.clear(); recentlyHandledCommands.clear(); commandCooldowns.clear(); deadlineTaskId = undefined;
    let state = stateFor(await context.state.read()); state = await recoverPendingPurchases(context, state, false); await context.state.write(state);
    if (state.active?.pendingPurchases.length) armPurchaseRecovery(context); if (state.active?.status === 'canceling') armRefund(context);
    armDeadline(context, state);
    deleteUnsubscribe = context.viewerFoundation.onDeleted(async (viewerId) => { operation = operation.then(async () => { const current = stateFor(await context.state.read()); if (!current.active) return; current.active.entries = current.active.entries.filter((entry) => entry.viewerId !== viewerId); current.active.pendingPurchases = current.active.pendingPurchases.filter((entry) => entry.viewerId !== viewerId); current.active.pendingRefunds = current.active.pendingRefunds.filter((entry) => entry !== viewerId); await context.state.write(current); }); await operation; });
  },
  async stop(context) {
    stopped = true; deleteUnsubscribe?.(); deleteUnsubscribe = undefined;
    for (const taskId of [refundTaskId, purchaseRecoveryTaskId, deadlineTaskId]) if (taskId !== undefined) context.schedule.cancel(taskId);
    refundTaskId = undefined; purchaseRecoveryTaskId = undefined; deadlineTaskId = undefined;
    await operation.catch(() => undefined); operation = Promise.resolve(); livePlatforms.clear(); recentlyHandledCommands.clear(); commandCooldowns.clear();
  },
  async onEvent(event, context) { operation = operation.then(() => processEvent(event, context), () => processEvent(event, context)); await operation; },
  async administerVillageDraw(request, context) { operation = operation.then(() => control(request, context), () => control(request, context)); return operation; },
  async controlPanel(request, context) { const pending = operation.then(() => drawPanel(request, context), () => drawPanel(request, context)); operation = pending.catch(() => undefined); return pending; },
};
export { buyTickets, chooseWinner, control as administerVillageDraw, drawPanel, format, runDeadlines, secureRandomIndex, settingsFor, stateFor, summary };
