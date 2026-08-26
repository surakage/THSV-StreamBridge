// Creator Controls applies one creator-authored multi-platform channel profile through a single
// approved Streamer.bot controller. StreamBridge validates profile data and keeps a bounded audit.
const CONTROL_EVENT = 'addon.thsv.creator-controls.control';
const RESULT_EVENT = 'addon.thsv.creator-controls.result';
const CONTROLLER_ACTION_ID = '183afef4-fc53-4337-859f-c9fe6d1961e1';
const PROFILE_IDS = Object.freeze(['profile-1', 'profile-2', 'profile-3']);
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick']);
const pendingRequests = new Map();

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: 'thsv.creator-controls', name: 'Creator Controls', version: '4.0.8',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.0.8', maximumTestedBridgeVersion: '4.0.8', dependencies: [], requiredCapabilities: [],
  configurationSchema: 'schemas/config.json', eventSubscriptions: [CONTROL_EVENT, RESULT_EVENT], commandsProvided: [], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.creator-controls/', 'data/addons/.state/thsv.creator-controls/'],
  installationSteps: ['Import the bundled Creator Controls Streamer.bot package.', 'Turn on the add-on and edit only the stream profiles you plan to use.', 'Approve only its triggerless Provider Controller action in the wizard.', 'Connect Apply Profile 1, 2, or 3 to your matching creator-controlled scene trigger, hotkey, or deck button.'],
  uninstallationSteps: ['Uninstall the add-on. Its bounded last-result audit remains preserved for a later reinstall.'], migrations: [],
  healthChecks: [{ id: 'thsv.creator-controls.runtime', description: 'Confirms guarded creator profiles can use the shared provider controller.' }],
};

function clean(value, maximum) { const normalized = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : ''; return [...normalized].slice(0, maximum).join(''); }
function bool(value) { return value === true; }
function settingsFor(context) { return context.settings && typeof context.settings === 'object' ? context.settings : {}; }
function profileFor(settings, id) {
  const number = PROFILE_IDS.indexOf(id) + 1; if (number < 1) return undefined;
  const prefix = `profile${number}`;
  const platforms = Array.isArray(settings[`${prefix}Platforms`]) ? settings[`${prefix}Platforms`].filter((value) => PLATFORMS.includes(value)) : [];
  return {
    id, name: clean(settings[`${prefix}Name`], 80), enabled: bool(settings[`${prefix}Enabled`]), platforms,
    title: clean(settings[`${prefix}Title`], 100), twitchCategoryId: clean(settings[`${prefix}TwitchCategoryId`], 32),
    youtubeCategoryName: clean(settings[`${prefix}YoutubeCategoryName`], 100), youtubeBroadcastId: clean(settings[`${prefix}YoutubeBroadcastId`], 128),
    kickCategoryName: clean(settings[`${prefix}KickCategoryName`], 100),
  };
}
function boundedState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const history = Array.isArray(source.history) ? source.history.filter((entry) => entry && typeof entry === 'object' && PROFILE_IDS.includes(entry.profileId) && typeof entry.at === 'string').slice(-19).map((entry) => {
    const results = Array.isArray(entry.results) ? entry.results.filter((item) => item && PLATFORMS.includes(item.platform)).slice(0, 3).map((item) => ({ platform: item.platform, success: item.success === true })) : [];
    return { profileId: entry.profileId, at: clean(entry.at, 40), success: entry.success === true, resultCount: Number.isInteger(entry.resultCount) ? Math.min(3, Math.max(0, entry.resultCount)) : results.length, results };
  }) : [];
  return { history };
}

const module = {
  manifest, required: false, async start() { pendingRequests.clear(); }, async stop() { pendingRequests.clear(); },
  async onEvent(event, context) {
    const settings = settingsFor(context); if (settings.enabled !== true) return;
    if (event?.eventType === CONTROL_EVENT) {
      if (event.metadata?.simulated === true && settings.allowSimulatedControls !== true) return;
      const profileId = clean(event.payload?.profileId, 20); const profile = profileFor(settings, profileId);
      if (!profile?.enabled || profile.platforms.length === 0 || (profile.title === '' && profile.twitchCategoryId === '' && profile.youtubeCategoryName === '' && profile.kickCategoryName === '')) return;
      const requestId = clean(event.eventId, 100); if (!requestId) return;
      pendingRequests.set(requestId, { profileId, expiresAt: Date.now() + 60_000 });
      if (pendingRequests.size > 100) pendingRequests.delete(pendingRequests.keys().next().value);
      try { await context.streamerbot.runApprovedAction(CONTROLLER_ACTION_ID, {
        providerControlModuleId: manifest.moduleId, providerControlResultEvent: RESULT_EVENT, providerControlRequestId: event.eventId,
        providerControlOriginRequestId: clean(event.payload?.categoryPilotRequestId, 100),
        providerControlSimulated: event.metadata?.simulated === true,
        providerControlProfileId: profile.id, providerControlProfileName: profile.name, providerControlPlatforms: profile.platforms.join(','),
        providerControlTitle: profile.title, providerControlTwitchCategoryId: profile.twitchCategoryId,
        providerControlYoutubeCategoryName: profile.youtubeCategoryName, providerControlYoutubeBroadcastId: profile.youtubeBroadcastId,
        providerControlKickCategoryName: profile.kickCategoryName,
      }); } catch (error) { pendingRequests.delete(requestId); throw error; }
      return;
    }
    if (event?.eventType !== RESULT_EVENT) return;
    const requestId = clean(event.payload?.requestId, 100); const pending = pendingRequests.get(requestId); pendingRequests.delete(requestId);
    if (!pending || pending.expiresAt < Date.now()) return;
    const profileId = clean(event.payload?.profileId, 20); if (!PROFILE_IDS.includes(profileId) || profileId !== pending.profileId) return;
    const state = boundedState(await context.state.read());
    const results = Array.isArray(event.payload?.results) ? event.payload.results.filter((item) => item && PLATFORMS.includes(item.platform)).slice(0, 3).map((item) => ({ platform: item.platform, success: item.success === true })) : [];
    const entry = { profileId, at: event.receivedAt, success: event.payload?.success === true, resultCount: Number.isInteger(event.payload?.resultCount) ? Math.min(3, Math.max(0, event.payload.resultCount)) : 0, results };
    await context.state.write({ history: [...state.history, entry].slice(-20) });
  },
};
export default module;
