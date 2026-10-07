// Explicit !lurk participation only. Talking ends a lurk; no silent viewer surveillance.
const ID = 'thsv.lurk-tracker';
const PLATFORMS = ['twitch', 'youtube', 'kick', 'tiktok', 'facebook'];
export const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: ID, name: 'Village Lurk Tracker', version: '4.0.13',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.13', maximumTestedBridgeVersion: '4.0.13',
  dependencies: ['thsv.viewer-foundation'], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: ['chat.message', 'command.received', 'stream.online', 'stream.offline'],
  commandsProvided: [], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: [`data/addons/${ID}/`, `data/addons/.state/${ID}/`],
  installationSteps: ['Enable Viewer Foundation and this tracker.', 'Use the same lurk command as Viewer Foundation. Normal chat automatically ends the lurk.', 'Monthly recaps appear in Bridge before the new month starts.'],
  uninstallationSteps: ['Disable or uninstall the tracker; private reports stay available.'], migrations: [],
  healthChecks: [{ id: `${ID}.runtime`, description: 'Tracks explicit lurks with monthly rollover and bounded private state.' }],
};
let chain = Promise.resolve(), taskId, stopped = true, unregisterDeletion;
const live = new Set();
const clean = (v, n = 80) => typeof v === 'string' ? [...v.replace(/[\u0000-\u001f\u007f]/gu, '').trim()].slice(0, n).join('') : '';
const number = v => Number.isSafeInteger(v) && v >= 0 ? v : 0;
export function monthKey(now, zone = 'America/Chicago') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit' }).formatToParts(now).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}`;
}
function settings(context) { return { enabled: false, lurkCommand: 'lurk', timeZone: 'America/Chicago', announceLurk: true, announceReturn: false, ignoredNames: ['suraruisuh', 'suraruisuh_bot', 'the hidden sloth village'], ...context.settings }; }
export function sanitizeState(raw, now = Date.now(), zone) {
  const entries = (Array.isArray(raw?.entries) ? raw.entries : []).filter(e => /^[a-z][a-z0-9-]{0,63}$/u.test(e?.viewerId) && clean(e.displayName)).slice(0, 150).map(e => ({ viewerId: e.viewerId, displayName: clean(e.displayName), visits: Math.min(100000, number(e.visits)), seconds: number(e.seconds), since: number(e.since), platform: PLATFORMS.includes(e.platform) ? e.platform : 'twitch' }));
  return { version: 1, month: /^\d{4}-\d{2}$/u.test(raw?.month) ? raw.month : monthKey(now, zone), entries, lastTickAt: number(raw?.lastTickAt), processed: (Array.isArray(raw?.processed) ? raw.processed : []).filter(v => typeof v === 'string').map(v => clean(v, 256)).slice(-40) };
}
function settle(entry, now) { if (entry.since > 0) entry.seconds += Math.max(0, Math.floor((now - entry.since) / 1000)); entry.since = 0; }
function monthBoundary(now, zone) { const current = monthKey(now, zone); let left = Math.floor((now - 32 * 86400000) / 60000), right = Math.floor(now / 60000); while (left < right) { const middle = Math.floor((left + right) / 2); if (monthKey(middle * 60000, zone) === current) right = middle; else left = middle + 1; } return left * 60000; }
async function roll(context, state, now, zone) {
  const current = monthKey(now, zone);
  if (state.month >= current) return state;
  const boundary = monthBoundary(now, zone);
  const continuing = state.entries.filter(entry => entry.since > 0).map(entry => ({ ...entry, visits: 0, seconds: 0, since: boundary }));
  for (const entry of state.entries) settle(entry, boundary);
  // Persist settled duration before the broker archives this month.
  await context.state.write(state);
  return { version: 1, month: current, entries: continuing, lastTickAt: now, processed: state.processed };
}
async function say(context, event, message) { try { await context.chat.send({ message, routing: 'source', sourcePlatform: event.platform, overflow: 'split' }); } catch { /* No retries for possibly sent comments. */ } }
export async function processLurkEvent(event, context, now = Date.now()) {
  const config = settings(context);
  if (!config.enabled || event.metadata?.simulated || !PLATFORMS.includes(event.platform)) return;
  let state = await roll(context, sanitizeState(await context.state.read(), now, config.timeZone), now, config.timeZone);
  if (event.eventType === 'stream.online') { live.add(event.platform); state.lastTickAt = now; await context.state.write(state); return; }
  if (event.eventType === 'stream.offline') { live.delete(event.platform); for (const entry of state.entries) if (!live.size || entry.platform === event.platform) settle(entry, now); state.lastTickAt = now; await context.state.write(state); return; }
  if (event.user?.actorType !== 'human' || !event.user?.id || config.ignoredNames.some(name => [event.user.name, event.user.displayName].some(v => clean(v).toLowerCase() === name.toLowerCase()))) return;
  const command = clean(event.payload?.command, 40).toLowerCase();
  const isLurk = event.eventType === 'command.received' && command === config.lurkCommand;
  // Raw command chat can arrive before its normalized command. It must not unlurk first.
  const message = clean(event.payload?.message || event.payload?.text, 256);
  if (event.eventType === 'chat.message' && message.toLowerCase().split(/\s/u)[0] === `!${config.lurkCommand}`) return;
  if (!isLurk && !['chat.message', 'command.received'].includes(event.eventType)) return;
  const eventId = clean(event.source?.eventId || event.eventId, 200);
  const id = `${event.platform}:${event.eventType}:${eventId}`;
  if (!eventId || state.processed.includes(id)) return;
  const projection = await context.viewerFoundation.getProjection({ platform: event.platform, userId: event.user.id });
  if (!projection) return;
  let entry = state.entries.find(e => e.viewerId === projection.viewerId);
  if (isLurk && !entry && state.entries.length < 150) { entry = { viewerId: projection.viewerId, displayName: clean(event.user.displayName || event.user.name) || 'Villager', visits: 0, seconds: 0, since: 0, platform: event.platform }; state.entries.push(entry); }
  if (!entry) return;
  if (isLurk) {
    if (entry.since > 0) return;
    entry.since = now; entry.platform = event.platform; entry.visits += 1;
  } else { if (!entry.since) return; settle(entry, now); }
  state.processed.push(id); state.processed = state.processed.slice(-40); state.lastTickAt = now;
  state.entries.sort((a,b) => b.seconds - a.seconds || b.visits - a.visits);
  await context.state.write(state);
  if (isLurk && config.announceLurk) await say(context, event, `${entry.displayName} is lurking. Thanks for keeping the village company! Chat again to return.`);
  if (!isLurk && config.announceReturn) await say(context, event, `Welcome back, ${entry.displayName}! Your lurk has ended.`);
  return { lurking: isLurk, visits: entry.visits, seconds: entry.seconds };
}
const serialize = task => { chain = chain.then(task, task); return chain; };
// While anyone is lurking, a 60 s heartbeat records lastTickAt so a restart can
// exclude Bridge downtime. Otherwise the only timer is the month rollover, aimed
// just past the next month boundary (re-armed at most hourly), and nothing is
// written unless the month actually rolled.
const LURK_HEARTBEAT_MS = 60_000;
let heartbeat = false;
function lurkDelay(context, active) { if (active) return LURK_HEARTBEAT_MS; const zone = settings(context).timeZone; const now = Date.now(); const current = monthKey(now, zone); let low = Math.floor(now / 60_000) + 1, high = low + 32 * 1_440; while (low < high) { const middle = Math.floor((low + high) / 2); if (monthKey(middle * 60_000, zone) === current) low = middle + 1; else high = middle; } return Math.ceil(Math.min(3_600_000, Math.max(1_000, low * 60_000 - now + 1_000))); }
function arm(context, active = false) { if (stopped) return; if (taskId) context.schedule.cancel(taskId); heartbeat = active; taskId = context.schedule.after(lurkDelay(context, active), () => serialize(async () => { taskId = undefined; let lurking = false; const config = settings(context); if (config.enabled) { const now = Date.now(); const before = sanitizeState(await context.state.read(), now, config.timeZone); const state = await roll(context, before, now, config.timeZone); lurking = state.entries.some(e => e.since > 0); if (lurking || state.month !== before.month) { state.lastTickAt = now; await context.state.write(state); } } arm(context, lurking); })); }
export default { manifest, required: false,
  async start(context) { chain = Promise.resolve(); stopped = false; live.clear(); const config = settings(context); let state = sanitizeState(await context.state.read(), Date.now(), config.timeZone); for (const e of state.entries) settle(e, state.lastTickAt || e.since); state = await roll(context, state, Date.now(), config.timeZone); await context.state.write(state); unregisterDeletion = context.viewerFoundation.onDeleted?.(viewerId => serialize(async () => { const state = sanitizeState(await context.state.read(), Date.now(), config.timeZone); state.entries = state.entries.filter(e => e.viewerId !== viewerId); await context.state.write(state); return true; })); arm(context, state.entries.some(e => e.since > 0)); },
  async stop(context) { stopped = true; if (taskId) context.schedule.cancel(taskId); taskId = undefined; heartbeat = false; unregisterDeletion?.(); await chain.catch(() => undefined); const config = settings(context); const state = sanitizeState(await context.state.read(), Date.now(), config.timeZone); for (const e of state.entries) settle(e, Date.now()); await context.state.write(state); live.clear(); },
  onEvent(event, context) { return serialize(async () => { const result = await processLurkEvent(event, context); if (result?.lurking && !heartbeat) arm(context, true); return result; }); },
};
