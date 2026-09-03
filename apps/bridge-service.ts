import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { StreamBridge } from '../bridge/core/bridge.js';
import { adapterContractFingerprints, createDefaultAdapterRegistry } from '../bridge/adapters/registry.js';
import { DiagnosticsServer } from '../bridge/services/http-server.js';
import { loadConfigWithNotices } from '../bridge/services/config-loader.js';
import { StructuredLogger } from '../bridge/services/logger.js';
import { FileDeduplicationStore, NoopDeduplicationStore } from '../bridge/services/deduplication-store.js';
import { resolveControlToken } from '../bridge/services/control-token.js';
import { BrowserOverlayHub } from '../bridge/services/browser-overlay-hub.js';
import { createInstalledModuleRegistry } from '../bridge/core/installed-modules.js';
import { StreamerBotAdapter } from '../bridge/adapters/streamerbot-adapter.js';
import { WizardService } from '../bridge/services/wizard-service.js';
import { ScheduledReliabilityPreflightService } from '../bridge/services/scheduled-reliability-preflight-service.js';
import { WizardConfigurationGateway } from '../bridge/services/wizard-configuration.js';
import { FileCommandSyncStore } from '../bridge/services/command-sync-store.js';
import type { PlatformCapabilityId } from '../bridge/contracts/v2/capability.js';
import { FileDeliveryOutboxStore } from '../bridge/services/delivery-outbox-store.js';
import { AddOnWizardService } from '../bridge/services/addon-wizard-service.js';
import { AddOnCapabilityBroker } from '../bridge/core/addon-capability-broker.js';
import { ReleaseUpdateService } from '../bridge/services/release-update-service.js';
import { AddOnUpdateService } from '../bridge/services/addon-update-service.js';
import { CORE_CONTRACT_VERSION } from '../bridge/contracts/v2/common.js';
import { STREAMBRIDGE_VERSION } from '../bridge/version.js';
import { OUTBOUND_PLATFORM_VALUES, OutboundMessageRouter } from '../bridge/core/outbound-message-router.js';
import { ClipMediaCache } from '../bridge/services/clip-media-cache.js';
import { CommandDirectoryService } from '../bridge/services/command-directory.js';
import { CommandDirectoryResponder } from '../bridge/services/command-directory-responder.js';
import { ChatEmoteService } from '../bridge/services/chat-emote-service.js';
import { StreamerBotLauncherService } from '../bridge/services/streamerbot-launcher-service.js';
import { AutomaticUpdateMonitor } from '../bridge/services/automatic-update-monitor.js';
import { coreAcceptanceFingerprints } from '../bridge/services/acceptance-fingerprints.js';
import { StreamerBotUniversalImportService } from '../bridge/services/streamerbot-universal-import-service.js';
import { WebsiteCompanionService } from '../bridge/services/website-companion-service.js';
import { LiveAcceptanceService } from '../bridge/services/live-acceptance-service.js';
import { readBuildProvenance } from '../bridge/services/build-provenance-service.js';
import { ObsSourceInventoryService } from '../bridge/services/obs-source-inventory-service.js';
import { ReleaseReadinessService } from '../bridge/services/release-readiness-service.js';
import { SceneCatalogService, SCENE_CATALOG_ACTION_ID } from '../bridge/services/scene-catalog-service.js';
import { StreamerBotTriggerAssuranceService } from '../bridge/services/streamerbot-trigger-assurance-service.js';
import { ObsDirectSceneClient } from '../bridge/services/obs-direct-scene-client.js';
import { ObsBroadcastStateMonitor } from '../bridge/services/obs-broadcast-state-monitor.js';
import { OperationalReliabilityService } from '../bridge/services/operational-reliability-service.js';
import { BroadcastConnectionVaultService, type ResolvedBroadcastConnection } from '../bridge/services/broadcast-connection-vault-service.js';
import { DirectSceneConnectionManager } from '../bridge/services/direct-scene-connection-manager.js';
import { StreamerBotCompatibilityFeedService } from '../bridge/services/streamerbot-compatibility-feed-service.js';
import { LogLifecycleStatusService } from '../bridge/services/log-lifecycle-status-service.js';
import { LiveCaptionService } from '../bridge/services/live-caption-service.js';
import { StreamerBotEventRelay } from '../bridge/adapters/streamerbot-event-relay.js';

const TIMED_MESSAGE_OUTPUT_ACTION_ID = '7d107c29-1127-5bb1-ae8b-6f04d89a71d4';

const configPath = await resolveRuntimeConfigPath();
const dataRoot = resolve(process.env['THSV_STREAMBRIDGE_DATA_ROOT']?.trim() || 'data');
const addOnsRoot = resolve(process.env['THSV_STREAMBRIDGE_ADDONS_ROOT']?.trim() || join(dataRoot, 'addons'));
const addOnStateRoot = resolve(process.env['THSV_STREAMBRIDGE_ADDON_STATE_ROOT']?.trim() || join(addOnsRoot, '.state'));
const loadedConfig = await loadConfigWithNotices(configPath);
const config = loadedConfig.config;
const logger = new StructuredLogger(config.logging.level, config.logging.directory, config.logging.maxFileBytes, config.logging.backups);
for (const notice of loadedConfig.notices) logger.warn(notice.message, { code: notice.code, configPath: resolve(configPath), ignoredPaths: notice.paths });
const streamerBotEventRelay = new StreamerBotEventRelay();
const registry = createDefaultAdapterRegistry(config, logger, streamerBotEventRelay);
const inputs = registry.createInputs(config.platforms);
const outputs = registry.createOutputs(config.outputs);
const streamerBotInspector = outputs.find((output): output is StreamerBotAdapter => output instanceof StreamerBotAdapter);
const deduplicationStore = config.deduplication.persistAcrossRestarts
  ? new FileDeduplicationStore(config.deduplication.stateFile, logger)
  : new NoopDeduplicationStore();
const controlToken = await resolveControlToken(config.security.controlTokenEnv, config.security.controlTokenFile);
logger.addSensitiveValue(controlToken);
logger.addSensitiveValue(process.env[config.streamerbot.passwordEnv]);
logger.addSensitiveValue(process.env['THSV_STREAMLABS_REMOTE_TOKEN']);
const enabledPlatformIds = new Set(Object.entries(config.platforms).filter(([, platform]) => platform.enabled && platform.inputEnabled).map(([platformId]) => platformId));
const liveRecoveryPlatformIds = [...enabledPlatformIds].filter((platform) => ['twitch', 'youtube', 'kick', 'tiktok'].includes(platform));
const capabilityReports = registry.capabilityReports(config.platforms);
const availableCapabilities = new Set<PlatformCapabilityId>(capabilityReports.filter((report) => enabledPlatformIds.has(report.platform)).flatMap((report) => Object.entries(report.capabilities).filter(([, support]) => support.supported).map(([capability]) => capability as PlatformCapabilityId)));
const overlayHub = new BrowserOverlayHub(logger, config.browserOverlay);
const liveCaptions = new LiveCaptionService(config.liveCaptions, overlayHub, streamerBotEventRelay, logger);
const chatEmotes = new ChatEmoteService(logger);
const clipMediaCache = new ClipMediaCache(join(dataRoot, 'runtime', 'clip-media-cache'));
const outboundRouter = new OutboundMessageRouter({ send: async (platform, message, _part, _totalParts, signal) => {
  if (streamerBotInspector === undefined) throw new Error('Streamer.bot output is not configured.');
  await streamerBotInspector.runApprovedAction(TIMED_MESSAGE_OUTPUT_ACTION_ID, {
    multiTimedValid: true,
    multiTimedSelectedMessage: message,
    multiTimedSelectedMessages: '{}',
    multiTimedDeliveryPlatforms: JSON.stringify([platform]),
    multiTimedSimulated: config.streamerbot.testMode,
  }, signal);
} });
const dockChatPlatforms = OUTBOUND_PLATFORM_VALUES.filter((platform) => enabledPlatformIds.has(platform));
const dockOutboundRouter = new OutboundMessageRouter({ send: async (platform, message, _part, _totalParts, signal) => {
  if (streamerBotInspector === undefined) throw new Error('Streamer.bot output is not configured.');
  await streamerBotInspector.runApprovedAction(TIMED_MESSAGE_OUTPUT_ACTION_ID, {
    multiTimedValid: true,
    multiTimedSelectedMessage: message,
    multiTimedSelectedMessages: '{}',
    multiTimedDeliveryPlatforms: JSON.stringify([platform]),
    multiTimedSimulated: config.streamerbot.testMode,
    multiTimedUseBotAccount: false,
    // Prefer the connected creator identity in the interactive dock, but do not
    // silently lose the message when that account cannot send on the platform.
    multiTimedAllowAccountFallback: true,
  }, signal);
} });
const capabilityBroker = new AddOnCapabilityBroker(logger, addOnStateRoot, {
  ...(streamerBotInspector === undefined ? {} : { runStreamerBotAction: (actionId, argumentsValue, signal) => streamerBotInspector.runApprovedAction(actionId, argumentsValue, signal) }),
  publishOverlay: async (moduleId, topic, payload, options) => overlayHub.publishAddOn(moduleId, topic, payload, options),
  subscribeOverlayLifecycle: (moduleId, listener) => overlayHub.subscribeAddOnLifecycle(moduleId, listener),
  routeOutboundMessage: (request, signal) => outboundRouter.route(request, signal),
  publishProviderEvent: async (event) => {
    await activeBridge.ingest(event);
  },
  cacheClipMedia: (moduleId, request, signal) => clipMediaCache.fetch(moduleId, request, signal),
});
const addOnWizard = new AddOnWizardService(addOnsRoot, addOnStateRoot);
const bundledExtensionUpdate = await addOnWizard.updateInstalledBundledExtensions();
if ((bundledExtensionUpdate['updated'] as readonly unknown[]).length > 0) logger.info('Updated installed bundled extensions from the verified Bridge release', bundledExtensionUpdate);
const modules = await createInstalledModuleRegistry(logger, addOnsRoot, availableCapabilities, capabilityBroker, addOnStateRoot);
const commandDirectory = new CommandDirectoryService(config, modules, { historyPath: join(dataRoot, 'state', 'command-directory-publication-history.json') }, streamerBotInspector);
await commandDirectory.start();
const commandDirectoryResponder = new CommandDirectoryResponder(commandDirectory, outboundRouter, logger);
const deliveryOutboxStore = new FileDeliveryOutboxStore(config.streamerbot.deliveryStateFile);
const activeBridge = new StreamBridge(config, logger, { inputs, outputs, deduplicationStore, deliveryOutboxStore, modules });
const installedAddOns = await addOnWizard.list();
const buildProvenance = await readBuildProvenance(dataRoot);
const releaseUpdates = new ReleaseUpdateService(STREAMBRIDGE_VERSION, undefined, undefined, join(dataRoot, 'updates'));
const addOnUpdates = new AddOnUpdateService(CORE_CONTRACT_VERSION, undefined, undefined, undefined, join(dataRoot, 'updates'));
const automaticUpdates = new AutomaticUpdateMonitor({
  streamerBotConnected: () => streamerBotInspector?.status()['state'] === 'connected',
  checkCore: () => releaseUpdates.check(true),
  checkAddOns: async () => addOnUpdates.check(await addOnWizard.list(), true),
  logger,
  statePath: join(dataRoot, 'updates', 'automatic-update-status.json'),
});
const streamerBotLauncher = new StreamerBotLauncherService(dataRoot, config.streamerbot.url);
const streamerBotCompatibilityFeed = new StreamerBotCompatibilityFeedService(logger, fetch, join(dataRoot, 'updates', 'streamerbot-compatibility-feed-cache.json'));
await streamerBotCompatibilityFeed.start();
const logLifecycleStatus = new LogLifecycleStatusService(config.logging.directory, config.logging.maxFileBytes, config.logging.backups, undefined, join(dataRoot, 'configuration', 'log-storage-policy.json'));
await logLifecycleStatus.start();
const logRetentionTimer = setInterval(() => { void logLifecycleStatus.enforce().catch((error: unknown) => logger.warn('Aggregate log-retention enforcement failed', { error })); }, 60 * 60 * 1_000);
logRetentionTimer.unref();
const universalImports = new StreamerBotUniversalImportService(resolve('packages', 'streamerbot'), () => streamerBotLauncher.version());
const universalImportCatalogue = await universalImports.catalogue(installedAddOns);
const triggerContractFingerprint = fingerprint(universalImportCatalogue);
const configurationFingerprint = createHash('sha256').update(JSON.stringify(config)).digest('hex');
const configurationSections = Object.fromEntries(Object.entries(config).map(([name, value]) => [name, fingerprint(value)]));
const triggerPackages = Object.fromEntries(universalImportCatalogue.packages.map((item) => [item.folder, fingerprint(item)]));
const adapterFingerprints = await adapterContractFingerprints();
const componentFingerprints = await coreAcceptanceFingerprints();
const liveAcceptance = new LiveAcceptanceService(join(dataRoot, 'state'), {
  coreVersion: STREAMBRIDGE_VERSION,
  coreContractVersion: CORE_CONTRACT_VERSION,
  buildFingerprint: buildProvenance.buildFingerprint,
  configurationFingerprint,
  triggerContractFingerprint,
  adapters: Object.fromEntries([...new Set([...inputs.map((adapter) => adapter.config.adapter), ...outputs.map((adapter) => config.outputs[adapter.name]?.adapter).filter((value): value is string => value !== undefined)])].sort().map((id) => [id, adapterFingerprints[id] ?? 'unversioned'])),
  adapterLegacyAliases: {
    mock: ['1'], 'timed-actions': ['2'], 'tikfinity-streamerbot': ['2'], 'streamerbot-native': ['3'],
    'streamerbot-addon-relay': ['2'], 'streamerbot-scene-relay': ['2'], 'streamerbot-streamlabs': ['2'], streamerbot: ['3'],
  },
  components: componentFingerprints,
  configurationSections,
  triggerPackages,
  addOns: Object.fromEntries(installedAddOns.map((addOn) => [addOn.moduleId, `${addOn.version}:${createHash('sha256').update(JSON.stringify(addOn.settings)).digest('hex')}`] as const).sort((left, right) => left[0].localeCompare(right[0]))),
});
await liveAcceptance.start();
const obsSourceInventory = new ObsSourceInventoryService(join(dataRoot, 'state'));
await obsSourceInventory.start();
const obsDirectSceneClient = new ObsDirectSceneClient(process.env['THSV_OBS_WEBSOCKET_URL'] ?? 'ws://127.0.0.1:4455', process.env['THSV_OBS_WEBSOCKET_PASSWORD'] ?? '');
const broadcastConnectionVault = new BroadcastConnectionVaultService(dataRoot);
await broadcastConnectionVault.start();
const environmentConnections: ResolvedBroadcastConnection[] = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'OBS default', provider: 'obs', url: process.env['THSV_OBS_WEBSOCKET_URL'] ?? 'ws://127.0.0.1:4455', enabled: true, hasCredential: (process.env['THSV_OBS_WEBSOCKET_PASSWORD'] ?? '') !== '', credential: process.env['THSV_OBS_WEBSOCKET_PASSWORD'] ?? '' },
  ...((process.env['THSV_MELD_WEBSOCKET_URL'] ?? '') === '' ? [] : [{ id: '00000000-0000-4000-8000-000000000002', name: 'Meld Studio environment', provider: 'meld' as const, url: process.env['THSV_MELD_WEBSOCKET_URL'] ?? '', enabled: true, hasCredential: false, credential: '' }]),
  ...((process.env['THSV_STREAMLABS_REMOTE_TOKEN'] ?? '') === '' ? [] : [{ id: '00000000-0000-4000-8000-000000000003', name: 'Streamlabs Desktop default', provider: 'streamlabs' as const, url: process.env['THSV_STREAMLABS_WEBSOCKET_URL'] ?? 'ws://127.0.0.1:59650/api/websocket', enabled: true, hasCredential: true, credential: process.env['THSV_STREAMLABS_REMOTE_TOKEN'] ?? '' }]),
];
const directSceneConnections = new DirectSceneConnectionManager(broadcastConnectionVault, environmentConnections, undefined, join(dataRoot, 'state', 'broadcast-connection-events.json'), async (profile) => await streamerBotLauncher.endpointApplicationStatus(profile.provider, profile.url));
const sceneCatalog = new SceneCatalogService(
  join(dataRoot, 'state'),
  streamerBotInspector === undefined ? undefined : async (provider, connectionIndex) => { await streamerBotInspector.runApprovedAction(SCENE_CATALOG_ACTION_ID, { sceneCatalogProvider: provider, sceneCatalogConnectionIndex: connectionIndex }); },
  (provider, connectionIndex) => directSceneConnections.refresh(provider, connectionIndex),
);
await sceneCatalog.start();
await directSceneConnections.start((provider, snapshot) => sceneCatalog.acceptDirectSnapshot(provider, snapshot));
sceneCatalog.reconcileActiveDirectConnections(await directSceneConnections.activeProfiles());
const triggerAssurance = new StreamerBotTriggerAssuranceService({
  packageRoot: resolve('packages', 'streamerbot'),
  stateRoot: join(dataRoot, 'state'),
  actionsPath: () => streamerBotLauncher.actionsPath(),
  streamerBotVersion: () => streamerBotLauncher.version(),
  streamerBotRunning: () => streamerBotLauncher.isRunning(),
  moduleStatus: () => modules.statuses(),
});
const operationalReliability = new OperationalReliabilityService({
  dataRoot,
  expectedVersion: STREAMBRIDGE_VERSION,
  packageRoot: resolve('.'),
  streamerBotPackageRoot: resolve('packages', 'streamerbot'),
  logger,
  diagnostics: () => activeBridge.diagnostics(),
  readiness: () => activeBridge.readiness(),
  triggerStatus: () => triggerAssurance.status(),
  reconcileTriggers: (input) => triggerAssurance.reconcile(input),
  sceneStatus: () => sceneCatalog.status(),
  refreshObsScenes: () => sceneCatalog.refresh({ provider: 'obs', connectionIndex: 0 }),
  overlayStatus: () => overlayHub.status(),
  broadcastStatus: () => obsBroadcastMonitor.status(),
  capabilityStatus: () => capabilityBroker.diagnostics(),
  listAddOns: async () => (await addOnWizard.list()).map((addOn) => ({ moduleId: addOn.moduleId, version: addOn.version })),
});
const obsBroadcastMonitor = new ObsBroadcastStateMonitor({
  query: () => obsDirectSceneClient.isStreaming(),
  onStarted: async () => {
    await activeBridge.recoverLiveSession(liveRecoveryPlatformIds);
    overlayHub.recoverLiveSession(liveRecoveryPlatformIds);
    operationalReliability.recoverLiveSession(liveRecoveryPlatformIds);
  },
  onStopped: async () => {
    await activeBridge.endRecoveredLiveSession();
    overlayHub.endRecoveredLiveSession();
    await operationalReliability.endRecoveredLiveSession();
  },
  logger,
});
const scheduledReliabilityPreflight: ScheduledReliabilityPreflightService = new ScheduledReliabilityPreflightService(join(dataRoot, 'state'), async (): Promise<Readonly<Record<string, unknown>>> => await wizard.streamingToolsPreflight());
const wizard: WizardService = new WizardService(
  streamerBotInspector,
  new WizardConfigurationGateway(configPath, (platforms) => registry.capabilityReports(platforms)),
  new FileCommandSyncStore(join(dataRoot, 'state', 'command-sync.json'), logger),
  addOnWizard,
  releaseUpdates,
  addOnUpdates,
  streamerBotLauncher,
  automaticUpdates,
  universalImports,
  new WebsiteCompanionService(join(dataRoot, 'private', 'website-companion.json'), process.env['THSV_WEBSITE_COMPANION_URL'] ?? 'https://www.slothbloom.com'),
  liveAcceptance,
  obsSourceInventory,
  buildProvenance,
  new ReleaseReadinessService(STREAMBRIDGE_VERSION, resolve('artifacts', 'release-lifecycle', 'latest.json'), resolve('artifacts', 'published-release', 'latest.json'), join(dataRoot, 'state', 'release-readiness-github.json')),
  sceneCatalog,
  triggerAssurance,
  operationalReliability,
  broadcastConnectionVault,
  directSceneConnections,
  scheduledReliabilityPreflight,
  () => overlayHub.status(),
  () => streamerBotCompatibilityFeed.status(),
  () => logLifecycleStatus.status(),
  (input) => logLifecycleStatus.preview(input),
  (input) => logLifecycleStatus.applyAndPrune(input),
);
activeBridge.subscribe((event) => liveAcceptance.observe(event));
activeBridge.subscribe((event) => sceneCatalog.observe(event));
activeBridge.subscribe((event) => { triggerAssurance.observe(event); triggerAssurance.acknowledge(event.platform, event.receivedAt); });
activeBridge.subscribe((event) => operationalReliability.observe(event));
activeBridge.subscribe((event) => liveCaptions.observeBridgeEvent(event));
activeBridge.subscribe(async (event) => {
  if (event.metadata.simulated || event.eventType !== 'addon.thsv.live-beacon.broadcast-control' || event.payload['action'] !== 'online') return;
  await activeBridge.recoverLiveSession(liveRecoveryPlatformIds, typeof event.payload['startedAt'] === 'string' ? event.payload['startedAt'] : event.receivedAt);
  overlayHub.recoverLiveSession(liveRecoveryPlatformIds);
  operationalReliability.recoverLiveSession(liveRecoveryPlatformIds, typeof event.payload['startedAt'] === 'string' ? event.payload['startedAt'] : event.receivedAt);
});
activeBridge.subscribe((event) => {
  if (event.eventType !== 'chat.message') {
    overlayHub.publish(event);
    void chatEmotes.warm(event);
    return;
  }
  void chatEmotes.enrichAfterWarm(event)
    .then((enriched) => overlayHub.publish(enriched))
    .catch((error: unknown) => {
      logger.warn('Chat emote enrichment failed; publishing the original event', { eventId: event.eventId, error });
      overlayHub.publish(event);
    });
});
activeBridge.subscribe((event) => commandDirectoryResponder.handle(event));
let stopping = false;
let commandDirectoryRefreshActive = false;
let commandDirectoryRefreshTimer: NodeJS.Timeout | undefined;

async function refreshCommandDirectory(): Promise<void> {
  if (commandDirectoryRefreshActive || stopping) return;
  if (streamerBotInspector !== undefined && streamerBotInspector.status()['state'] !== 'connected') return;
  commandDirectoryRefreshActive = true;
  try {
    const refresh = await commandDirectory.refreshStreamerBotCommands();
    if (!refresh.available) logger.warn('Streamer.bot commands were not refreshed for the command directory', { error: refresh.error });
    if (commandDirectory.publicationStatus().enabled) {
      const publication = await commandDirectory.publish();
      if (publication.state !== 'published' && publication.state !== 'unchanged') logger.warn('Public command directory was not synchronized', { state: publication.state, error: publication.error });
    }
  } finally { commandDirectoryRefreshActive = false; }
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  if (commandDirectoryRefreshTimer !== undefined) clearInterval(commandDirectoryRefreshTimer);
  automaticUpdates.stop();
  scheduledReliabilityPreflight.stop();
  obsBroadcastMonitor.stop();
  logger.info('Shutdown requested', { signal });
  try {
    liveCaptions.stop();
    await server.stop();
    await operationalReliability.stop();
    await activeBridge.stop();
    await liveAcceptance.flush();
    await obsSourceInventory.flush();
    await directSceneConnections.stop();
    await sceneCatalog.flush();
    await logger.flush();
    process.exitCode = 0;
  } catch (error) {
    logger.error('Shutdown failed', { error });
    process.exitCode = 1;
  }
}

const server = new DiagnosticsServer(
  { ...config.service, ...config.security }, activeBridge, logger, controlToken, () => void shutdown('HTTP'), overlayHub, wizard, dataRoot, commandDirectory,
  {
    enabledPlatforms: dockChatPlatforms,
    send: (request) => dockOutboundRouter.route(request),
  },
  liveCaptions,
);

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('uncaughtException', (error) => { logger.error('Uncaught exception', { error }); void shutdown('uncaughtException'); });
process.once('unhandledRejection', (error) => { logger.error('Unhandled rejection', { error }); void shutdown('unhandledRejection'); });

try {
  liveCaptions.start();
  await activeBridge.start();
  await obsBroadcastMonitor.start();
  await operationalReliability.start();
  await scheduledReliabilityPreflight.start();
  await server.start();
  for (const provider of ['obs', 'meld', 'streamlabs'] as const) await sceneCatalog.refresh({ provider, connectionIndex: 0 })
    .then((result) => logger.info('Initial scene snapshot requested', { provider, connectionIndex: 0, source: result['source'] }))
    .catch((error: unknown) => logger.warn('Initial scene snapshot was unavailable; observed scene changes remain active', { provider, error }));
  automaticUpdates.start();
  logger.info('THSV StreamBridge is ready', { configPath: resolve(configPath) });
  if (streamerBotInspector !== undefined) void streamerBotInspector.waitUntilConnected(60_000).then(async (connected) => {
    if (!connected || stopping) { logger.info('Streamer.bot-dependent startup work remains paused until the next connected refresh window'); return; }
    await refreshCommandDirectory();
    logger.info('Streamer.bot-dependent startup work resumed after the shared connection gate opened');
  }).catch((error: unknown) => logger.warn('Streamer.bot-dependent startup work could not resume', { error }));
  commandDirectoryRefreshTimer = setInterval(() => void refreshCommandDirectory(), 5 * 60_000);
  commandDirectoryRefreshTimer.unref();
} catch (error) {
  logger.error('Startup failed', { error });
  await activeBridge.stop().catch(() => undefined);
  await logger.flush();
  process.exitCode = 1;
}

async function resolveRuntimeConfigPath(): Promise<string> {
  const explicit = process.env['THSV_STREAMBRIDGE_CONFIG']?.trim();
  if (explicit !== undefined && explicit.length > 0) return explicit;
  try {
    const active = (await readFile('data/runtime/active-config.txt', 'utf8')).trim();
    if (active.length > 0) return active;
  } catch { /* A first run has no active-config marker yet. */ }
  try {
    await readFile('data/runtime/bridge.local.json', 'utf8');
    return 'data/runtime/bridge.local.json';
  } catch { return 'config/bridge.example.json'; }
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
