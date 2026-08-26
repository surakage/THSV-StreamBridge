// Category Pilot checks only creator-allowlisted Windows process names. It suggests a saved
// Creator Controls profile by default and never reads executable paths or window titles.
const PROBE_RESULT = 'addon.thsv.category-pilot.processes-received';
const CONTROL_EVENT = 'addon.thsv.category-pilot.control';
const PROFILE_RESULT = 'addon.thsv.creator-controls.result';
const PROBE_ACTION_ID = '9422099b-df85-4d50-99c0-87fcbc120814';
const PROFILE_ACTIONS = Object.freeze({ 'profile-1': '2eaf6785-f3f4-472c-9593-b3689494930c', 'profile-2': 'eded2e28-2831-4480-9102-14d98742e275', 'profile-3': '38a1093d-e788-4879-9b03-69477cc94f61' });
const PROFILE_IDS = Object.freeze(Object.keys(PROFILE_ACTIONS));
const LIVE_PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok']);

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: 'thsv.category-pilot', name: 'Category Pilot', version: '4.0.8',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.8', maximumTestedBridgeVersion: '4.0.8', dependencies: ['thsv.creator-controls'], requiredCapabilities: [],
  configurationSchema: 'schemas/config.json', eventSubscriptions: ['stream.online', 'stream.offline', PROBE_RESULT, CONTROL_EVENT, PROFILE_RESULT], commandsProvided: [], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.category-pilot/', 'data/addons/.state/thsv.category-pilot/'],
  installationSteps: ['Install and configure Creator Controls first.', 'Import Category Pilot, approve its Process Probe and the Creator Controls profile actions used by mappings.', 'Start in Suggest only mode and attach Apply/Dismiss only to creator-controlled triggers.'],
  uninstallationSteps: ['Uninstall the add-on. Its bounded last decision remains preserved for later review.'], migrations: [],
  healthChecks: [{ id: 'thsv.category-pilot.runtime', description: 'Confirms allowlisted process probes and suggestion controls are available.' }],
};

let taskId; let probeTimeoutId; let applyTimeoutId; let stopped = true; let probePending = false; let activeProbeId = ''; let activeApply; let candidate = ''; let candidateCount = 0; let operation = Promise.resolve();
const livePlatforms = new Set();
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
function stateFor(value) { const source = value && typeof value === 'object' ? value : {}; return { pendingProfileId: PROFILE_IDS.includes(source.pendingProfileId) ? source.pendingProfileId : '', pendingProcessName: processName(source.pendingProcessName), lastAppliedProfileId: PROFILE_IDS.includes(source.lastAppliedProfileId) ? source.lastAppliedProfileId : '', lastAppliedAt: clean(source.lastAppliedAt, 40) }; }
async function publish(context, topic, payload) { try { await context.overlay.publish(topic, payload, { lane: topic.endsWith('.card.show') ? 'foreground' : 'independent' }); } catch { /* Suggestions remain actionable through creator controls without an overlay. */ } }
function cancel(context) { if (taskId) context.schedule.cancel(taskId); taskId = undefined; }
function cancelProbeTimeout(context) { if (probeTimeoutId) context.schedule.cancel(probeTimeoutId); probeTimeoutId = undefined; }
function cancelApplyTimeout(context) { if (applyTimeoutId) context.schedule.cancel(applyTimeoutId); applyTimeoutId = undefined; }
function arm(context, delayMs) { cancel(context); if (stopped) return; taskId = context.schedule.after(delayMs, async () => { taskId = undefined; await probe(context); }); }
async function probe(context) {
  const settings = settingsFor(context); if (!settings.enabled || (settings.requireLive && livePlatforms.size === 0) || probePending || !settings.mappings.length) return;
  probePending = true; activeProbeId = `probe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    await context.streamerbot.runApprovedAction(PROBE_ACTION_ID, { categoryPilotAllowedProcesses: settings.mappings.map((entry) => entry.processName).join(','), categoryPilotRequestedAt: new Date().toISOString(), categoryPilotRequestId: activeProbeId });
    const expectedProbeId = activeProbeId;
    cancelProbeTimeout(context);
    probeTimeoutId = context.schedule.after(30_000, async () => {
      probeTimeoutId = undefined;
      if (activeProbeId !== expectedProbeId) return;
      probePending = false; activeProbeId = '';
      arm(context, settingsFor(context).intervalSeconds * 1000);
    });
  }
  catch { probePending = false; activeProbeId = ''; arm(context, settings.intervalSeconds * 1000); }
}
async function applyProfile(profileId, pendingProcessName, mode, context) {
  if (activeApply) return false;
  const actionId = PROFILE_ACTIONS[profileId]; if (!actionId) return false;
  const requestId = `apply-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  activeApply = { requestId, profileId, pendingProcessName, mode };
  try {
    await context.streamerbot.runApprovedAction(actionId, { categoryPilotApplyRequestId: requestId });
    cancelApplyTimeout(context);
    applyTimeoutId = context.schedule.after(30_000, () => { if (activeApply?.requestId === requestId) activeApply = undefined; applyTimeoutId = undefined; });
    return true;
  }
  catch { activeApply = undefined; return false; }
}
async function persistDecision(current, context) { await context.state.write(current); }
async function decide(profileId, matchedProcess, settings, context) {
  const current = stateFor(await context.state.read());
  if (activeApply || (current.lastAppliedProfileId === profileId && current.pendingProfileId === '')) return;
  if (settings.mode === 'automatic') {
    await applyProfile(profileId, matchedProcess, 'automatic', context);
    return;
  }
  await persistDecision({ ...current, pendingProfileId: profileId, pendingProcessName: matchedProcess }, context);
  await publish(context, `${manifest.moduleId}.card.show`, { title: 'Category Pilot suggestion', text: `${matchedProcess} is running. Apply ${profileId.replace('-', ' ')}?`, durationMs: 15000 });
}

const module = {
  manifest, required: false,
  async start(context) { stopped = false; operation = Promise.resolve(); livePlatforms.clear(); activeApply = undefined; const settings = settingsFor(context); if (settings.enabled && !settings.requireLive) arm(context, 1000); },
  async stop(context) { stopped = true; livePlatforms.clear(); probePending = false; activeProbeId = ''; activeApply = undefined; candidate = ''; candidateCount = 0; cancel(context); cancelProbeTimeout(context); cancelApplyTimeout(context); await operation.catch(() => undefined); operation = Promise.resolve(); },
  async onEvent(event, context) {
    const work = async () => {
    const settings = settingsFor(context); if (!settings.enabled) return;
    if (event.eventType === 'stream.online' && event.metadata?.simulated !== true && LIVE_PLATFORMS.includes(event.platform)) { livePlatforms.add(event.platform); arm(context, 1000); return; }
    if (event.eventType === 'stream.offline' && event.metadata?.simulated !== true && LIVE_PLATFORMS.includes(event.platform)) {
      livePlatforms.delete(event.platform); if (!settings.requireLive || livePlatforms.size > 0) return;
      probePending = false; activeProbeId = ''; activeApply = undefined; candidate = ''; candidateCount = 0; cancel(context); cancelProbeTimeout(context); cancelApplyTimeout(context);
      const current = stateFor(await context.state.read()); if (current.pendingProfileId) await persistDecision({ ...current, pendingProfileId: '', pendingProcessName: '' }, context);
      await publish(context, `${manifest.moduleId}.card.hide`, {}); return;
    }
    if (event.eventType === PROBE_RESULT) {
      const requestId = clean(event.payload?.requestId, 100);
      if (event.metadata?.simulated === true || !probePending || !requestId || requestId !== activeProbeId) return;
      probePending = false; activeProbeId = ''; cancelProbeTimeout(context);
      const running = new Set(Array.isArray(event.payload?.runningProcesses) ? event.payload.runningProcesses.map(processName).filter(Boolean).slice(0, 5) : []);
      const match = settings.mappings.find((entry) => running.has(entry.processName)); const next = match ? `${match.processName}|${match.profileId}` : '';
      if (next && next === candidate) candidateCount += 1; else { candidate = next; candidateCount = next ? 1 : 0; }
      if (match && candidateCount >= settings.confirmationCount) { candidateCount = 0; await decide(match.profileId, match.processName, settings, context); }
      if (!match) {
        const current = stateFor(await context.state.read());
        if (current.pendingProfileId) { await persistDecision({ ...current, pendingProfileId: '', pendingProcessName: '' }, context); await publish(context, `${manifest.moduleId}.card.hide`, {}); }
      }
      arm(context, settings.intervalSeconds * 1000); return;
    }
    if (event.eventType === PROFILE_RESULT) {
      const requestId = clean(event.payload?.categoryPilotRequestId, 100); if (event.metadata?.simulated === true || !activeApply || requestId !== activeApply.requestId) return;
      const completed = activeApply; activeApply = undefined; cancelApplyTimeout(context);
      if (event.payload?.success === true) {
        const current = stateFor(await context.state.read()); await persistDecision({ ...current, lastAppliedProfileId: completed.profileId, lastAppliedAt: event.receivedAt || new Date().toISOString(), pendingProfileId: '', pendingProcessName: '' }, context);
        await publish(context, `${manifest.moduleId}.card.hide`, {});
      }
      return;
    }
    if (event.eventType !== CONTROL_EVENT || event.metadata?.simulated === true) return;
    const action = clean(event.payload?.action, 20); const current = stateFor(await context.state.read());
    if (action === 'dismiss') { await persistDecision({ ...current, pendingProfileId: '', pendingProcessName: '' }, context); await publish(context, `${manifest.moduleId}.card.hide`, {}); return; }
    if (action === 'apply' && current.pendingProfileId) await applyProfile(current.pendingProfileId, current.pendingProcessName, 'suggest', context);
    };
    operation = operation.then(work, work); return operation;
  },
};
export default module;
