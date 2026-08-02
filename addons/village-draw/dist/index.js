// Village Draw provides restart-safe, cross-platform community giveaways.
// Viewer Foundation remains the only points authority; this module stores only
// bounded giveaway entries, transaction recovery records, and draw receipts.
const MODULE_ID = 'thsv.village-draw';
const PLATFORMS = ['twitch', 'youtube', 'kick', 'tiktok'];
const LIMITS = Object.freeze({ twitch: 500, youtube: 200, kick: 500, tiktok: 150 });
const ENTRY_MODES = ['free-single', 'points-single', 'points-multiple'];
const ACTIVE_STATES = ['open', 'paused', 'closed', 'drawn', 'confirmed', 'canceling', 'canceled'];
let operation = Promise.resolve();
let deleteUnsubscribe;
let refundTaskId;
let purchaseRecoveryTaskId;
let stopped = true;

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Village Draw', version: '3.0.0',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '3.0.0', maximumTestedBridgeVersion: '3.0.0', dependencies: ['thsv.viewer-foundation'], requiredCapabilities: [],
  configurationSchema: 'schemas/config.json', eventSubscriptions: ['command.received', 'stream.offline'],
  commandsProvided: [
    { id: 'village-draw.manage', name: 'giveaway' }, { id: 'village-draw.enter', name: 'enter' },
    { id: 'village-draw.tickets', name: 'tickets' }, { id: 'village-draw.my-tickets', name: 'mytickets' },
  ],
  actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.village-draw/', 'data/addons/.state/thsv.village-draw/'],
  installationSteps: [
    'Install and enable Viewer Foundation first; Village Draw never creates a second points balance.',
    'Create the four no-response commands in Command Sync, keeping giveaway management restricted to moderators.',
    'Configure the prize and ticket rules, save, restart, then use the authenticated wizard controls to open the draw.',
    'Add the hosted Village Draw overlay to OBS, Meld, or Streamlabs and send a safe preview.',
  ],
  uninstallationSteps: ['Cancel and refund an open points draw before uninstalling. Private bounded history remains available for a later reinstall.'],
  migrations: [],
  healthChecks: [{ id: 'thsv.village-draw.runtime', description: 'Confirms serialized entries, recoverable Viewer Foundation spending/refunds, secure weighted selection, and hosted result cards.' }],
};

function clean(value, maximum = 500) {
  return Array.from(typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]+/gu, ' ').replace(/\s+/gu, ' ').trim() : '').slice(0, maximum).join('');
}
function integer(value, minimum, maximum, fallback) {
  return Number.isSafeInteger(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}
function color(value, fallback) { return typeof value === 'string' && /^#[0-9a-f]{6}$/iu.test(value) ? value : fallback; }
function safeHttpsUrl(value) {
  const candidate = clean(value, 2048); if (!candidate) return '';
  try { const url = new URL(candidate); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}
function uniquePlatforms(value, fallback = PLATFORMS) {
  return Array.isArray(value) ? [...new Set(value.filter((item) => PLATFORMS.includes(item)))].slice(0, 4) : [...fallback];
}
function settingsFor(context) {
  const raw = context.settings || {};
  return {
    enabled: raw.enabled === true,
    giveawayCommand: clean(raw.giveawayCommand, 40).toLowerCase() || 'giveaway',
    enterCommand: clean(raw.enterCommand, 40).toLowerCase() || 'enter',
    ticketsCommand: clean(raw.ticketsCommand, 40).toLowerCase() || 'tickets',
    myTicketsCommand: clean(raw.myTicketsCommand, 40).toLowerCase() || 'mytickets',
    name: clean(raw.giveawayName, 100) || 'Village Giveaway',
    description: clean(raw.description, 500) || 'Enter for a chance to win!',
    prize: clean(raw.prizeItem, 160) || 'Mystery Prize',
    imageUrl: safeHttpsUrl(raw.prizeImageUrl),
    entryMode: ENTRY_MODES.includes(raw.entryMode) ? raw.entryMode : 'free-single',
    ticketCost: integer(raw.ticketCost, 1, 10_000, 50),
    maxTicketsPerViewer: integer(raw.maxTicketsPerViewer, 1, 100, 10),
    maximumEntrants: integer(raw.maximumEntrants, 10, 80, 80),
    maximumTotalTickets: integer(raw.maximumTotalTickets, 10, 50_000, 10_000),
    eligiblePlatforms: uniquePlatforms(raw.eligiblePlatforms),
    announcementPlatforms: uniquePlatforms(raw.announcementPlatforms),
    streamEndBehavior: ['leave-open', 'pause', 'close'].includes(raw.streamEndBehavior) ? raw.streamEndBehavior : 'close',
    openMessage: clean(raw.openMessage, 1_000) || '{name} is open! Prize: {prize}. Use {entryCommand}.',
    winnerMessage: clean(raw.winnerMessage, 1_000) || '{winner} won {prize} in {name}!',
    canceledMessage: clean(raw.canceledMessage, 1_000) || '{name} was canceled. Purchased tickets were refunded.',
    confirmationMessage: clean(raw.confirmationMessage, 500) || '{viewer}, you now have {tickets} ticket(s) in {name}. Remaining: {points} {currency}.',
    backgroundColor: color(raw.backgroundColor, '#10201b'), accentColor: color(raw.accentColor, '#7ff5cc'),
    textColor: color(raw.textColor, '#ffffff'), winnerColor: color(raw.winnerColor, '#ffd166'),
    fontFamily: ['display', 'broadcast', 'serif', 'mono'].includes(raw.fontFamily) ? raw.fontFamily : 'broadcast',
    cardSeconds: integer(raw.cardSeconds, 5, 60, 12), showOpenCard: raw.showOpenCard !== false, showWinnerCard: raw.showWinnerCard !== false,
  };
}
function safeEntry(value) {
  if (!value || typeof value !== 'object') return undefined;
  const viewerId = clean(value.viewerId, 64); const displayName = clean(value.displayName, 80); const platform = clean(value.platform, 20);
  const tickets = integer(value.tickets, 1, 100, 0); const pointsSpent = integer(value.pointsSpent, 0, 1_000_000, 0);
  const refundedPoints = integer(value.refundedPoints, 0, pointsSpent, 0);
  if (!/^[a-z][a-z0-9-]{0,63}$/u.test(viewerId) || !displayName || !PLATFORMS.includes(platform) || tickets < 1) return undefined;
  return { viewerId, displayName, platform, tickets, pointsSpent, refundedPoints, firstAt: clean(value.firstAt, 40), lastAt: clean(value.lastAt, 40) };
}
function safePending(value) {
  if (!value || typeof value !== 'object') return undefined;
  const viewerId = clean(value.viewerId, 64); const idempotencyKey = clean(value.idempotencyKey, 128);
  const displayName = clean(value.displayName, 80); const platform = clean(value.platform, 20);
  const tickets = integer(value.tickets, 1, 100, 0); const amount = integer(value.amount, 1, 1_000_000, 0);
  return /^[a-z][a-z0-9-]{0,63}$/u.test(viewerId) && idempotencyKey && displayName && PLATFORMS.includes(platform) && tickets > 0 && amount > 0
    ? { viewerId, idempotencyKey, displayName, platform, tickets, amount, createdAt: clean(value.createdAt, 40) } : undefined;
}
function safeReceipt(value) {
  if (!value || typeof value !== 'object') return undefined;
  const giveawayId = clean(value.giveawayId, 100); const snapshotDigest = clean(value.snapshotDigest, 64); const drawnAt = clean(value.drawnAt, 40);
  const selectedTicket = integer(value.selectedTicket, 1, 50_000, 0); const ticketCount = integer(value.totalTickets, 1, 50_000, 0); const entrantCount = integer(value.entrantCount, 1, 80, 0);
  return giveawayId && /^[a-f0-9]{64}$/u.test(snapshotDigest) && drawnAt && selectedTicket > 0 && ticketCount > 0 && entrantCount > 0
    ? { giveawayId, selectedTicket, totalTickets: ticketCount, entrantCount, snapshotDigest, drawnAt } : undefined;
}
function safeActive(value) {
  if (!value || typeof value !== 'object') return null;
  const id = clean(value.id, 100); const status = clean(value.status, 20);
  if (!id || !ACTIVE_STATES.includes(status)) return null;
  const entries = Array.isArray(value.entries) ? value.entries.map(safeEntry).filter(Boolean).slice(0, 80) : [];
  const pendingPurchases = Array.isArray(value.pendingPurchases) ? value.pendingPurchases.map(safePending).filter(Boolean).slice(0, 5) : [];
  const pendingRefunds = Array.isArray(value.pendingRefunds) ? value.pendingRefunds.map((item) => clean(item, 64)).filter((item) => /^[a-z][a-z0-9-]{0,63}$/u.test(item)).slice(0, 80) : [];
  const winner = value.winner && typeof value.winner === 'object' ? safeEntry(value.winner) : undefined;
  const receipt = safeReceipt(value.receipt);
  return {
    id, status, name: clean(value.name, 100), description: clean(value.description, 500), prize: clean(value.prize, 160), imageUrl: safeHttpsUrl(value.imageUrl),
    entryMode: ENTRY_MODES.includes(value.entryMode) ? value.entryMode : 'free-single', ticketCost: integer(value.ticketCost, 1, 10_000, 50),
    maxTicketsPerViewer: integer(value.maxTicketsPerViewer, 1, 100, 10), maximumEntrants: integer(value.maximumEntrants, 10, 80, 80),
    maximumTotalTickets: integer(value.maximumTotalTickets, 10, 50_000, 10_000), eligiblePlatforms: uniquePlatforms(value.eligiblePlatforms),
    createdAt: clean(value.createdAt, 40), openedAt: clean(value.openedAt, 40), closedAt: clean(value.closedAt, 40), drawnAt: clean(value.drawnAt, 40),
    entries, pendingPurchases, pendingRefunds, ...(winner ? { winner } : {}), ...(receipt ? { receipt } : {}),
  };
}
function stateFor(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const history = Array.isArray(raw.history) ? raw.history.map((item) => {
    if (!item || typeof item !== 'object') return undefined;
    const id = clean(item.id, 100); const winner = clean(item.winner, 80); const drawnAt = clean(item.drawnAt, 40); const receipt = safeReceipt(item.receipt);
    const entrantCount = integer(item.entrantCount, 1, 80, 0); const ticketCount = integer(item.totalTickets, 1, 50_000, 0);
    return id && winner && drawnAt && entrantCount > 0 && ticketCount > 0 ? { id, winner, entrantCount, totalTickets: ticketCount, drawnAt, ...(receipt ? { receipt } : {}) } : undefined;
  }).filter(Boolean).slice(-5) : [];
  return { version: 1, sequence: integer(raw.sequence, 0, 1_000_000_000, 0), active: safeActive(raw.active), history };
}
function moderator(event) {
  const roles = new Set((event.user?.roles || []).map((role) => clean(role, 30).toLowerCase()));
  return roles.has('broadcaster') || roles.has('moderator') || roles.has('mod');
}
function totalTickets(active) { return active.entries.reduce((sum, entry) => sum + entry.tickets, 0); }
function format(template, values, maximum) {
  let result = clean(template, maximum * 3);
  for (const [key, value] of Object.entries(values)) result = result.replaceAll(`{${key}}`, clean(String(value), maximum));
  const chars = Array.from(result); return chars.length <= maximum ? result : `${chars.slice(0, Math.max(1, maximum - 1)).join('').trimEnd()}…`;
}
function sourceLimit(platform) { return LIMITS[platform] || 150; }
async function reply(context, event, message) {
  try { await context.chat.send({ message: clean(message, sourceLimit(event.platform)), routing: 'source', sourcePlatform: event.platform, overflow: 'reject' }); } catch { /* A reply failure cannot corrupt giveaway state. */ }
}
async function announce(context, settings, template, values) {
  const deliveries = [];
  for (const platform of settings.announcementPlatforms) {
    const message = format(template, values, LIMITS[platform]);
    try { deliveries.push(...await context.chat.send({ message, routing: 'selected', selectedPlatforms: [platform], overflow: 'reject' })); }
    catch (error) { deliveries.push({ platform, accepted: false, parts: 0, error: clean(error instanceof Error ? error.message : String(error), 200) }); }
  }
  return deliveries;
}
function cardStyle(settings, winner = false) {
  return { backgroundMode: 'glass', backgroundColor: settings.backgroundColor, backgroundOpacity: 0.94, accentColor: winner ? settings.winnerColor : settings.accentColor, textColor: settings.textColor, fontFamily: settings.fontFamily, fontSize: 34 };
}
async function publishOpenCard(context, settings, active) {
  if (!settings.showOpenCard) return;
  const entryHint = active.entryMode === 'free-single' ? `Use !${settings.enterCommand} for one free entry.`
    : active.entryMode === 'points-single' ? `Use !${settings.enterCommand} for one ${active.ticketCost}-point ticket.`
      : `Use !${settings.ticketsCommand} <1-${active.maxTicketsPerViewer}>. Each ticket costs ${active.ticketCost} points.`;
  await context.overlay.publish(`${MODULE_ID}.card.show`, { title: active.name, text: `${active.prize} • ${active.description} • ${entryHint}`, imageUrl: active.imageUrl, durationMs: settings.cardSeconds * 1000, style: cardStyle(settings) });
}
async function publishWinnerCard(context, settings, active) {
  if (!settings.showWinnerCard || !active.winner) return;
  await context.overlay.publish(`${MODULE_ID}.card.show`, { title: `WINNER • ${active.winner.displayName}`, text: `${active.prize} • ${active.name}`, imageUrl: active.imageUrl, durationMs: settings.cardSeconds * 1000, style: cardStyle(settings, true) });
}
function secureRandomIndex(maximum) {
  if (!Number.isSafeInteger(maximum) || maximum < 1) throw new Error('A draw requires at least one ticket.');
  const webCrypto = globalThis.crypto; if (!webCrypto?.getRandomValues) throw new Error('Secure random selection is unavailable.');
  const range = 0x1_0000_0000; const limit = range - (range % maximum); const buffer = new Uint32Array(1); let value;
  do { webCrypto.getRandomValues(buffer); value = buffer[0]; } while (value >= limit);
  return value % maximum;
}
function chooseWinner(entries, randomIndex = secureRandomIndex) {
  const count = entries.reduce((sum, entry) => sum + entry.tickets, 0); if (count < 1) return undefined;
  const selectedTicket = randomIndex(count); let cursor = 0;
  for (const entry of entries) { cursor += entry.tickets; if (selectedTicket < cursor) return { entry, selectedTicket, totalTickets: count }; }
  return undefined;
}
async function snapshotDigest(active) {
  const material = JSON.stringify(active.entries.map(({ viewerId, tickets }) => [viewerId, tickets]).sort((a, b) => a[0].localeCompare(b[0])));
  const bytes = new TextEncoder().encode(material); const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}
function summary(state) {
  const active = state.active; if (!active) return { available: true, status: 'draft', entrantCount: 0, totalTickets: 0, totalPointsSpent: 0, historyCount: state.history.length };
  return { available: true, giveawayId: active.id, status: active.status, name: active.name, prize: active.prize, entryMode: active.entryMode, entrantCount: active.receipt?.entrantCount ?? active.entries.length, totalTickets: active.receipt?.totalTickets ?? totalTickets(active), totalPointsSpent: active.entries.reduce((sum, entry) => sum + entry.pointsSpent - entry.refundedPoints, 0), ...(active.winner ? { winner: active.winner.displayName } : {}), ...(active.receipt ? { receipt: active.receipt } : {}), historyCount: state.history.length };
}
function activeFromSettings(settings, sequence, now) {
  const stamp = new Date(now).toISOString();
  return { id: `draw-${String(sequence)}-${String(now)}`.slice(0, 100), status: 'open', name: settings.name, description: settings.description, prize: settings.prize, imageUrl: settings.imageUrl, entryMode: settings.entryMode, ticketCost: settings.ticketCost, maxTicketsPerViewer: settings.entryMode === 'points-multiple' ? settings.maxTicketsPerViewer : 1, maximumEntrants: settings.maximumEntrants, maximumTotalTickets: settings.maximumTotalTickets, eligiblePlatforms: settings.eligiblePlatforms, createdAt: stamp, openedAt: stamp, closedAt: '', drawnAt: '', entries: [], pendingPurchases: [], pendingRefunds: [] };
}
function armPurchaseRecovery(context, delayMs = 30_000) {
  if (stopped || purchaseRecoveryTaskId !== undefined) return;
  purchaseRecoveryTaskId = context.schedule.after(delayMs, () => {
    purchaseRecoveryTaskId = undefined;
    operation = operation.then(async () => {
      const state = await recoverPendingPurchases(context, stateFor(await context.state.read()), false);
      if (state.active?.pendingPurchases.length) armPurchaseRecovery(context);
    }, async () => {
      const state = await recoverPendingPurchases(context, stateFor(await context.state.read()), false);
      if (state.active?.pendingPurchases.length) armPurchaseRecovery(context);
    });
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
    if (!entry) { entry = { viewerId: pending.viewerId, displayName: pending.displayName, platform: pending.platform, tickets: 0, pointsSpent: 0, refundedPoints: 0, firstAt: pending.createdAt, lastAt: pending.createdAt }; active.entries.push(entry); }
    entry.displayName = pending.displayName; entry.platform = pending.platform; entry.tickets += pending.tickets; entry.pointsSpent += pending.amount; entry.lastAt = pending.createdAt;
    active.pendingPurchases = active.pendingPurchases.filter((candidate) => candidate.idempotencyKey !== pending.idempotencyKey);
    if (result.duplicate && entry.tickets > active.maxTicketsPerViewer) entry.tickets = active.maxTicketsPerViewer;
    await context.state.write(state);
  }
  return state;
}
async function beginRefund(context, state) {
  const active = state.active; if (!active) return state;
  if (active.status !== 'canceling') {
    active.status = 'canceling';
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
  const settings = settingsFor(context); const state = stateFor(await context.state.read()); const active = state.active;
  if (!active || active.status !== 'canceling') return summary(state);
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
  active.status = 'canceled'; active.entries = []; await context.state.write(state);
  await announce(context, settings, settings.canceledMessage, { name: active.name, prize: active.prize });
  return summary(state);
}
async function buyTickets(event, context, state, requested) {
  const active = state.active; const settings = settingsFor(context);
  if (!active || active.status !== 'open') { await reply(context, event, 'The giveaway is not open.'); return { accepted: false, reason: 'not-open' }; }
  if (!active.eligiblePlatforms.includes(event.platform)) { await reply(context, event, 'This platform is not eligible for the current giveaway.'); return { accepted: false, reason: 'platform-not-eligible' }; }
  const platformUserId = clean(event.user?.id, 256); if (!platformUserId) return { accepted: false, reason: 'missing-stable-id' };
  const projection = await context.viewerFoundation.getProjection({ platform: event.platform, userId: platformUserId });
  if (!projection) { await reply(context, event, 'Viewer Foundation could not resolve your account.'); return { accepted: false, reason: 'viewer-unavailable' }; }
  const existing = active.entries.find((entry) => entry.viewerId === projection.viewerId); const currentTickets = existing?.tickets || 0;
  if (active.pendingPurchases.some((pending) => pending.viewerId === projection.viewerId)) { await reply(context, event, 'Your previous ticket purchase is still being recovered. Please wait before trying again.'); return { accepted: false, reason: 'purchase-pending' }; }
  const ticketCount = active.entryMode === 'points-multiple' ? integer(requested, 1, active.maxTicketsPerViewer, 1) : 1;
  if (currentTickets >= active.maxTicketsPerViewer || currentTickets + ticketCount > active.maxTicketsPerViewer) { await reply(context, event, `You may hold at most ${active.maxTicketsPerViewer} ticket(s).`); return { accepted: false, reason: 'viewer-limit' }; }
  if (!existing && active.entries.length >= active.maximumEntrants) { await reply(context, event, 'The giveaway entrant limit has been reached.'); return { accepted: false, reason: 'entrant-limit' }; }
  if (totalTickets(active) + ticketCount > active.maximumTotalTickets) { await reply(context, event, 'The giveaway ticket limit has been reached.'); return { accepted: false, reason: 'ticket-limit' }; }
  const displayName = clean(event.user?.displayName || event.user?.name, 80) || 'Viewer'; const timestamp = new Date().toISOString();
  if (active.entryMode === 'free-single') {
    active.entries.push({ viewerId: projection.viewerId, displayName, platform: event.platform, tickets: 1, pointsSpent: 0, refundedPoints: 0, firstAt: timestamp, lastAt: timestamp });
    await context.state.write(state); await reply(context, event, format(settings.confirmationMessage, { viewer: displayName, tickets: 1, name: active.name, points: projection.points, currency: projection.currencyName || 'points' }, sourceLimit(event.platform)));
    return { accepted: true, tickets: 1, points: projection.points };
  }
  const amount = ticketCount * active.ticketCost; const idempotencyKey = `purchase-${active.id}-${clean(event.eventId, 80)}-${projection.viewerId}`.slice(0, 128);
  const pending = { viewerId: projection.viewerId, idempotencyKey, displayName, platform: event.platform, tickets: ticketCount, amount, createdAt: timestamp };
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
async function control(request, context, now = Date.now(), randomIndex = secureRandomIndex) {
  const settings = settingsFor(context); let state = stateFor(await context.state.read()); state = await recoverPendingPurchases(context, state, false); if (state.active?.pendingPurchases.length) armPurchaseRecovery(context);
  switch (request.operation) {
    case 'status': return summary(state);
    case 'open': {
      if (!settings.enabled) throw new Error('Enable Village Draw settings before opening a giveaway.');
      if (state.active && !['confirmed', 'canceled'].includes(state.active.status)) throw new Error('Finish or cancel the current giveaway before opening another.');
      state.sequence += 1; state.active = activeFromSettings(settings, state.sequence, now); await context.state.write(state);
      await announce(context, settings, settings.openMessage, { name: state.active.name, prize: state.active.prize, entryCommand: state.active.entryMode === 'points-multiple' ? `!${settings.ticketsCommand} <count>` : `!${settings.enterCommand}` });
      await publishOpenCard(context, settings, state.active); return summary(state);
    }
    case 'pause': if (state.active?.status !== 'open') throw new Error('Only an open giveaway can be paused.'); state.active.status = 'paused'; await context.state.write(state); return summary(state);
    case 'resume': if (state.active?.status !== 'paused') throw new Error('Only a paused giveaway can be resumed.'); state.active.status = 'open'; await context.state.write(state); return summary(state);
    case 'close': if (!state.active || !['open', 'paused'].includes(state.active.status)) throw new Error('Only an open or paused giveaway can be closed.'); state.active.status = 'closed'; state.active.closedAt = new Date(now).toISOString(); await context.state.write(state); return summary(state);
    case 'draw': {
      if (state.active?.status !== 'closed') throw new Error('Close entries before drawing a winner.');
      const selected = chooseWinner(state.active.entries, randomIndex); if (!selected) throw new Error('No eligible giveaway entries were received.');
      const digest = await snapshotDigest(state.active); state.active.winner = { ...selected.entry }; state.active.status = 'drawn'; state.active.drawnAt = new Date(now).toISOString();
      state.active.receipt = { giveawayId: state.active.id, selectedTicket: selected.selectedTicket + 1, totalTickets: selected.totalTickets, entrantCount: state.active.entries.length, snapshotDigest: digest, drawnAt: state.active.drawnAt };
      await context.state.write(state); await publishWinnerCard(context, settings, state.active); await announce(context, settings, settings.winnerMessage, { winner: selected.entry.displayName, prize: state.active.prize, name: state.active.name }); return summary(state);
    }
    case 'confirm': {
      if (state.active?.status !== 'drawn' || !state.active.winner) throw new Error('Draw a winner before confirming the result.');
      state.active.status = 'confirmed'; state.history.push({ id: state.active.id, winner: state.active.winner.displayName, entrantCount: state.active.entries.length, totalTickets: totalTickets(state.active), drawnAt: state.active.drawnAt, receipt: state.active.receipt }); state.history = state.history.slice(-5); state.active.entries = []; state.active.pendingPurchases = []; state.active.pendingRefunds = []; await context.state.write(state); return summary(state);
    }
    case 'redraw': {
      if (state.active?.status !== 'drawn') throw new Error('A redraw requires an unconfirmed winner.');
      state.active.status = 'closed'; delete state.active.winner; delete state.active.receipt; await context.state.write(state); return control({ operation: 'draw', approvedByCreator: true }, context, now, randomIndex);
    }
    case 'cancel': {
      if (!state.active || ['confirmed', 'canceled'].includes(state.active.status)) throw new Error('There is no cancelable giveaway.');
      state = await beginRefund(context, state); armRefund(context); return summary(state);
    }
    case 'reset': {
      if (state.active && !['confirmed', 'canceled'].includes(state.active.status)) throw new Error('Confirm or cancel the active giveaway before resetting.');
      state.active = null; await context.state.write(state); return summary(state);
    }
    default: throw new Error('Unsupported Village Draw operation.');
  }
}
async function processEvent(event, context) {
  const settings = settingsFor(context); if (!settings.enabled) return;
  let state = stateFor(await context.state.read()); state = await recoverPendingPurchases(context, state, false); if (state.active?.pendingPurchases.length) armPurchaseRecovery(context); if (state.active?.status === 'canceling') return;
  if (event.eventType === 'stream.offline' && state.active?.status === 'open') {
    if (settings.streamEndBehavior === 'pause') state.active.status = 'paused';
    if (settings.streamEndBehavior === 'close') { state.active.status = 'closed'; state.active.closedAt = new Date().toISOString(); }
    if (settings.streamEndBehavior !== 'leave-open') await context.state.write(state); return;
  }
  if (event.eventType !== 'command.received' || event.user?.actorType !== 'human') return;
  const command = clean(event.payload?.command, 40).toLowerCase(); const args = Array.isArray(event.payload?.arguments) ? event.payload.arguments.map((item) => clean(item, 100)).filter(Boolean) : [];
  if (event.metadata?.simulated === true) {
    if ([settings.giveawayCommand, settings.enterCommand, settings.ticketsCommand, settings.myTicketsCommand].includes(command)) await context.overlay.publish(`${MODULE_ID}.card.show`, { title: 'VILLAGE DRAW • PREVIEW', text: `${settings.prize} • ${settings.description}`, imageUrl: settings.imageUrl, durationMs: settings.cardSeconds * 1000, style: cardStyle(settings) });
    return;
  }
  if (command === settings.giveawayCommand) {
    const action = (args[0] || 'info').toLowerCase();
    if (moderator(event) && ['open', 'pause', 'resume', 'close', 'draw', 'confirm', 'redraw', 'cancel', 'reset'].includes(action)) {
      try { const result = await control({ operation: action, approvedByCreator: true }, context); await reply(context, event, `Village Draw: ${result.status}. ${result.entrantCount} entrant(s), ${result.totalTickets} ticket(s).`); }
      catch (error) { await reply(context, event, clean(error instanceof Error ? error.message : String(error), sourceLimit(event.platform))); }
      return;
    }
    const active = state.active; if (!active) return reply(context, event, 'No giveaway is currently configured.');
    return reply(context, event, `${active.name}: ${active.prize}. Status: ${active.status}. ${active.entries.length} entrant(s), ${totalTickets(active)} ticket(s).`);
  }
  if (command === settings.myTicketsCommand) {
    const userId = clean(event.user?.id, 256); const projection = userId ? await context.viewerFoundation.getProjection({ platform: event.platform, userId }) : undefined;
    const entry = projection && state.active?.entries.find((candidate) => candidate.viewerId === projection.viewerId); return reply(context, event, entry ? `${event.user?.displayName || event.user?.name}, you have ${entry.tickets} ticket(s) in ${state.active.name}.` : 'You have no tickets in the current giveaway.');
  }
  if (command === settings.enterCommand) return buyTickets(event, context, state, 1);
  if (command === settings.ticketsCommand) return buyTickets(event, context, state, Number(args[0]) || 1);
}

export default {
  manifest, required: false,
  async start(context) {
    stopped = false; operation = Promise.resolve(); let state = stateFor(await context.state.read()); state = await recoverPendingPurchases(context, state, false); await context.state.write(state); if (state.active?.pendingPurchases.length) armPurchaseRecovery(context); if (state.active?.status === 'canceling') armRefund(context);
    deleteUnsubscribe = context.viewerFoundation.onDeleted(async (viewerId) => { operation = operation.then(async () => { const current = stateFor(await context.state.read()); if (!current.active) return; current.active.entries = current.active.entries.filter((entry) => entry.viewerId !== viewerId); current.active.pendingPurchases = current.active.pendingPurchases.filter((entry) => entry.viewerId !== viewerId); current.active.pendingRefunds = current.active.pendingRefunds.filter((entry) => entry !== viewerId); await context.state.write(current); }); await operation; });
  },
  async stop(context) { stopped = true; deleteUnsubscribe?.(); deleteUnsubscribe = undefined; if (refundTaskId !== undefined) context.schedule.cancel(refundTaskId); if (purchaseRecoveryTaskId !== undefined) context.schedule.cancel(purchaseRecoveryTaskId); refundTaskId = undefined; purchaseRecoveryTaskId = undefined; await operation.catch(() => undefined); operation = Promise.resolve(); },
  async onEvent(event, context) { operation = operation.then(() => processEvent(event, context), () => processEvent(event, context)); await operation; },
  async administerVillageDraw(request, context) { operation = operation.then(() => control(request, context), () => control(request, context)); return operation; },
};
export { buyTickets, chooseWinner, control as administerVillageDraw, format, secureRandomIndex, settingsFor, stateFor, summary };
