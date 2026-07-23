// Scene Actions reacts to normalized scene changes from OBS Studio, Streamlabs Desktop, and Meld.
// It dispatches only creator-approved Streamer.bot action IDs and keeps bounded anti-loop state.
const PROVIDERS = Object.freeze(['obs', 'streamlabs', 'meld']);
const ACTION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAXIMUM_MAPPINGS = 50;
const pendingByConnection = new Map();

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: 'thsv.scene-actions', name: 'Scene Actions', version: '1.0.0',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', dependencies: [], requiredCapabilities: [],
  configurationSchema: 'schemas/config.json', eventSubscriptions: ['stream.scene-changed'], commandsProvided: [], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.scene-actions/', 'data/addons/.state/thsv.scene-actions/'],
  installationSteps: ['Import the bundled Streamer.bot Scene Actions package.', 'Attach the documented OBS Studio, Streamlabs Desktop, and/or Meld Studio Scene Changed triggers to the imported Intake action.', 'Refresh Streamer.bot actions in the wizard, approve the scene actions this add-on may run, and edit the starter scene mappings.'],
  uninstallationSteps: ['Uninstall the add-on. Its private anti-loop state remains preserved for a later reinstall.'], migrations: [],
  healthChecks: [{ id: 'thsv.scene-actions.runtime', description: 'Confirms normalized scene events can dispatch creator-approved actions without repeat loops.' }],
};

const FALLBACKS = Object.freeze({ enabled: true, enabledProviders: PROVIDERS, caseSensitive: false, duplicateWindowMs: 1500, loopWindowSeconds: 10, maximumRunsPerLoopWindow: 5, runOnSimulatedEvents: false, mappings: [] });

function clean(value, maximum = 256) {
  const normalized = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '';
  return [...normalized].slice(0, maximum).join('');
}

export function parseSceneMappings(values) {
  if (!Array.isArray(values)) return [];
  const mappings = []; const ids = new Set();
  for (const raw of values.slice(0, MAXIMUM_MAPPINGS)) {
    if (typeof raw !== 'string') continue;
    try {
      const candidate = JSON.parse(raw); const id = clean(candidate?.id, 64).toLowerCase(); const provider = clean(candidate?.provider, 20).toLowerCase();
      const sceneName = clean(candidate?.sceneName); const actionId = clean(candidate?.actionId, 64).toLowerCase(); const connectionName = clean(candidate?.connectionName);
      const delaySeconds = Number.isInteger(candidate?.delaySeconds) ? Math.min(60, Math.max(0, candidate.delaySeconds)) : 0;
      if (!/^[a-z][a-z0-9-]{0,63}$/u.test(id) || ids.has(id) || !PROVIDERS.includes(provider) || sceneName === '' || !ACTION_ID.test(actionId)) continue;
      ids.add(id); mappings.push({ id, enabled: candidate.enabled !== false, provider, connectionName, sceneName, actionId, delaySeconds });
    } catch { /* A malformed creator setting is skipped instead of failing the entire add-on. */ }
  }
  return mappings;
}

export function sceneMappingMatches(mapping, event, settings) {
  if (!mapping.enabled || mapping.provider !== event.provider || !settings.enabledProviders.includes(mapping.provider)) return false;
  const actualConnection = clean(event.connectionName);
  if (mapping.connectionName && !compare(mapping.connectionName, actualConnection, settings.caseSensitive)) return false;
  return compare(mapping.sceneName, event.sceneName, settings.caseSensitive);
}

function compare(left, right, caseSensitive) { return caseSensitive ? left === right : left.toLocaleLowerCase() === right.toLocaleLowerCase(); }
function settingsFor(context) { const value = { ...FALLBACKS, ...(context.settings || {}) }; return { ...value, enabledProviders: Array.isArray(value.enabledProviders) ? value.enabledProviders.filter((entry) => PROVIDERS.includes(entry)) : PROVIDERS, mappings: parseSceneMappings(value.mappings) }; }
function sanitizeState(value) { const source = value && typeof value === 'object' ? value : {}; const recentEvents = Array.isArray(source.recentEvents) ? source.recentEvents.filter((entry) => entry && typeof entry.key === 'string' && Number.isFinite(entry.at)).slice(-50).map((entry) => ({ key: clean(entry.key, 700), at: Math.floor(entry.at) })) : []; const recentRuns = Array.isArray(source.recentRuns) ? source.recentRuns.filter(Number.isFinite).slice(-50).map(Math.floor) : []; return { recentEvents, recentRuns }; }

async function dispatch(mapping, scene, context) {
  try { await context.streamerbot.runApprovedAction(mapping.actionId, { sceneActionMappingId: mapping.id, sceneProvider: scene.provider, sceneName: scene.sceneName, sceneOldName: scene.oldSceneName, sceneConnectionId: scene.connectionId, sceneConnectionName: scene.connectionName, sceneSimulated: scene.simulated }); }
  catch { /* Denied, missing, or failed target actions do not disable event handling. */ }
}

const module = {
  manifest, required: false, async start() {},
  async stop(context) { for (const taskIds of pendingByConnection.values()) for (const taskId of taskIds) context.schedule.cancel(taskId); pendingByConnection.clear(); },
  async onEvent(event, context) {
    const settings = settingsFor(context); if (!settings.enabled || event?.eventType !== 'stream.scene-changed') return;
    const provider = clean(event.payload?.provider, 20).toLowerCase(); const sceneName = clean(event.payload?.sceneName);
    if (!PROVIDERS.includes(provider) || sceneName === '') return;
    const simulated = event.metadata?.simulated === true; if (simulated && !settings.runOnSimulatedEvents) return;
    const scene = { provider, sceneName, oldSceneName: clean(event.payload?.oldSceneName), connectionId: clean(event.payload?.connectionId), connectionName: clean(event.payload?.connectionName), simulated };
    const connectionKey = `${provider}|${scene.connectionId || scene.connectionName}`;
    const pending = pendingByConnection.get(connectionKey);
    if (pending) { for (const taskId of pending) context.schedule.cancel(taskId); pendingByConnection.delete(connectionKey); }
    const matches = settings.mappings.filter((mapping) => sceneMappingMatches(mapping, scene, settings)).slice(0, 10); if (!matches.length) return;
    const now = Date.now(); const state = sanitizeState(await context.state.read()); const duplicateCutoff = now - settings.duplicateWindowMs;
    const comparableSceneName = settings.caseSensitive ? sceneName : sceneName.toLocaleLowerCase();
    const eventKey = `${connectionKey}|${comparableSceneName}`;
    if (state.recentEvents.some((entry) => entry.key === eventKey && entry.at >= duplicateCutoff)) return;
    const loopCutoff = now - settings.loopWindowSeconds * 1000; const recentRuns = state.recentRuns.filter((at) => at >= loopCutoff);
    const selected = matches.slice(0, Math.max(0, settings.maximumRunsPerLoopWindow - recentRuns.length)); if (!selected.length) return;
    await context.state.write({ recentEvents: [...state.recentEvents.filter((entry) => entry.at >= now - 60_000), { key: eventKey, at: now }].slice(-50), recentRuns: [...recentRuns, ...selected.map(() => now)].slice(-50) });
    for (const mapping of selected) {
      if (mapping.delaySeconds === 0) await dispatch(mapping, scene, context);
      else {
        const taskIds = pendingByConnection.get(connectionKey) || new Set();
        let taskId = '';
        taskId = context.schedule.after(mapping.delaySeconds * 1000, async () => { taskIds.delete(taskId); if (!taskIds.size) pendingByConnection.delete(connectionKey); await dispatch(mapping, scene, context); });
        taskIds.add(taskId); pendingByConnection.set(connectionKey, taskIds);
      }
    }
  },
};
export default module;
