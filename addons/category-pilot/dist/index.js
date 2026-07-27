// Category Pilot checks only creator-allowlisted Windows process names. It suggests a saved
// Creator Controls profile by default and never reads executable paths or window titles.
const PROBE_RESULT = 'addon.thsv.category-pilot.processes-received';
const CONTROL_EVENT = 'addon.thsv.category-pilot.control';
const PROBE_ACTION_ID = '9422099b-df85-4d50-99c0-87fcbc120814';
const PROFILE_ACTIONS = Object.freeze({ 'profile-1': '2eaf6785-f3f4-472c-9593-b3689494930c', 'profile-2': 'eded2e28-2831-4480-9102-14d98742e275', 'profile-3': '38a1093d-e788-4879-9b03-69477cc94f61' });
const PROFILE_IDS = Object.freeze(Object.keys(PROFILE_ACTIONS));

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: 'thsv.category-pilot', name: 'Category Pilot', version: '2.4.3',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '2.4.3', maximumTestedBridgeVersion: '2.4.3', dependencies: ['thsv.creator-controls'], requiredCapabilities: [],
  configurationSchema: 'schemas/config.json', eventSubscriptions: ['stream.online', 'stream.offline', PROBE_RESULT, CONTROL_EVENT], commandsProvided: [], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.category-pilot/', 'data/addons/.state/thsv.category-pilot/'],
  installationSteps: ['Install and configure Creator Controls first.', 'Import Category Pilot, approve its Process Probe and the Creator Controls profile actions used by mappings.', 'Start in Suggest only mode and attach Apply/Dismiss only to creator-controlled triggers.'],
  uninstallationSteps: ['Uninstall the add-on. Its bounded last decision remains preserved for later review.'], migrations: [],
  healthChecks: [{ id: 'thsv.category-pilot.runtime', description: 'Confirms allowlisted process probes and suggestion controls are available.' }],
};

let taskId; let stopped = true; let live = false; let probePending = false; let candidate = ''; let candidateCount = 0;
function clean(value, maximum = 128) { return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '')].slice(0, maximum).join(''); }
function processName(value) { return clean(value, 100).replace(/\.exe$/iu, '').toLowerCase(); }
function integer(value, minimum, maximum, fallback) { return Number.isInteger(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback; }
function settingsFor(context) {
  const raw = context.settings || {}; const mappings = [];
  for (let number = 1; number <= 5; number += 1) {
    const name = processName(raw[`mapping${number}ProcessName`]); const profileId = clean(raw[`mapping${number}Profile`], 20);
    if (raw[`mapping${number}Enabled`] === true && name && PROFILE_IDS.includes(profileId) && !mappings.some((entry) => entry.processName === name)) mappings.push({ processName: name, profileId });
  }
  return { enabled: raw.enabled === true, mode: raw.mode === 'automatic' ? 'automatic' : 'suggest', requireLive: raw.requireLive !== false, intervalSeconds: integer(raw.intervalSeconds, 10, 300, 20), confirmationCount: integer(raw.confirmationCount, 1, 6, 2), mappings };
}
function stateFor(value) { const source = value && typeof value === 'object' ? value : {}; return { pendingProfileId: PROFILE_IDS.includes(source.pendingProfileId) ? source.pendingProfileId : '', pendingProcessName: processName(source.pendingProcessName), lastAppliedProfileId: PROFILE_IDS.includes(source.lastAppliedProfileId) ? source.lastAppliedProfileId : '', lastAppliedAt: typeof source.lastAppliedAt === 'string' ? source.lastAppliedAt : '' }; }
function cancel(context) { if (taskId) context.schedule.cancel(taskId); taskId = undefined; }
function arm(context, delayMs) { cancel(context); if (stopped) return; taskId = context.schedule.after(delayMs, async () => { taskId = undefined; await probe(context); }); }
async function probe(context) {
  const settings = settingsFor(context); if (!settings.enabled || (settings.requireLive && !live) || probePending || !settings.mappings.length) return;
  probePending = true;
  try { await context.streamerbot.runApprovedAction(PROBE_ACTION_ID, { categoryPilotAllowedProcesses: settings.mappings.map((entry) => entry.processName).join(','), categoryPilotRequestedAt: new Date().toISOString() }); }
  catch { probePending = false; arm(context, settings.intervalSeconds * 1000); }
}
async function applyProfile(profileId, context) {
  const actionId = PROFILE_ACTIONS[profileId]; if (!actionId) return false;
  try { await context.streamerbot.runApprovedAction(actionId, {}); return true; } catch { return false; }
}
async function persistDecision(current, context) { await context.state.write(current); }
async function decide(profileId, matchedProcess, settings, context) {
  const current = stateFor(await context.state.read());
  if (current.lastAppliedProfileId === profileId && current.pendingProfileId === '') return;
  if (settings.mode === 'automatic') {
    if (await applyProfile(profileId, context)) await persistDecision({ ...current, pendingProfileId: '', pendingProcessName: '', lastAppliedProfileId: profileId, lastAppliedAt: new Date().toISOString() }, context);
    return;
  }
  await persistDecision({ ...current, pendingProfileId: profileId, pendingProcessName: matchedProcess }, context);
  await context.overlay.publish('card.show', { title: 'Category Pilot suggestion', text: `${matchedProcess} is running. Apply ${profileId.replace('-', ' ')}?`, durationMs: 15000 });
}

const module = {
  manifest, required: false,
  async start(context) { stopped = false; const settings = settingsFor(context); if (settings.enabled && !settings.requireLive) arm(context, 1000); },
  async stop(context) { stopped = true; live = false; probePending = false; candidate = ''; candidateCount = 0; cancel(context); },
  async onEvent(event, context) {
    const settings = settingsFor(context); if (!settings.enabled) return;
    if (event.eventType === 'stream.online' && event.metadata?.simulated !== true) { live = true; arm(context, 1000); return; }
    if (event.eventType === 'stream.offline' && event.metadata?.simulated !== true) { live = false; probePending = false; candidate = ''; candidateCount = 0; if (settings.requireLive) cancel(context); return; }
    if (event.eventType === PROBE_RESULT) {
      probePending = false;
      const running = new Set(Array.isArray(event.payload?.runningProcesses) ? event.payload.runningProcesses.map(processName).filter(Boolean).slice(0, 5) : []);
      const match = settings.mappings.find((entry) => running.has(entry.processName)); const next = match ? `${match.processName}|${match.profileId}` : '';
      if (next && next === candidate) candidateCount += 1; else { candidate = next; candidateCount = next ? 1 : 0; }
      if (match && candidateCount >= settings.confirmationCount) { candidateCount = 0; await decide(match.profileId, match.processName, settings, context); }
      arm(context, settings.intervalSeconds * 1000); return;
    }
    if (event.eventType !== CONTROL_EVENT || event.metadata?.simulated === true) return;
    const action = clean(event.payload?.action, 20); const current = stateFor(await context.state.read());
    if (action === 'dismiss') { await persistDecision({ ...current, pendingProfileId: '', pendingProcessName: '' }, context); await context.overlay.publish('card.hide', {}); return; }
    if (action === 'apply' && current.pendingProfileId && await applyProfile(current.pendingProfileId, context)) {
      await persistDecision({ ...current, lastAppliedProfileId: current.pendingProfileId, lastAppliedAt: new Date().toISOString(), pendingProfileId: '', pendingProcessName: '' }, context);
      await context.overlay.publish('card.hide', {});
    }
  },
};
export default module;
