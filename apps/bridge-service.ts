import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { StreamBridge } from '../bridge/core/bridge.js';
import { createDefaultAdapterRegistry } from '../bridge/adapters/registry.js';
import { DiagnosticsServer } from '../bridge/services/http-server.js';
import { loadConfigWithNotices } from '../bridge/services/config-loader.js';
import { StructuredLogger } from '../bridge/services/logger.js';
import { FileDeduplicationStore, NoopDeduplicationStore } from '../bridge/services/deduplication-store.js';
import { resolveControlToken } from '../bridge/services/control-token.js';
import { BrowserOverlayHub } from '../bridge/services/browser-overlay-hub.js';
import { createInstalledModuleRegistry } from '../bridge/core/installed-modules.js';
import { StreamerBotAdapter } from '../bridge/adapters/streamerbot-adapter.js';
import { WizardService } from '../bridge/services/wizard-service.js';
import { WizardConfigurationGateway } from '../bridge/services/wizard-configuration.js';
import { FileCommandSyncStore } from '../bridge/services/command-sync-store.js';
import type { PlatformCapabilityId } from '../bridge/contracts/v2/capability.js';
import { FileDeliveryOutboxStore } from '../bridge/services/delivery-outbox-store.js';
import { AddOnWizardService } from '../bridge/services/addon-wizard-service.js';
import { AddOnCapabilityBroker } from '../bridge/core/addon-capability-broker.js';
import { ReleaseUpdateService } from '../bridge/services/release-update-service.js';
import { CORE_CONTRACT_VERSION } from '../bridge/contracts/v2/common.js';
import { OutboundMessageRouter } from '../bridge/core/outbound-message-router.js';

const TIMED_MESSAGE_OUTPUT_ACTION_ID = '7d107c29-1127-5bb1-ae8b-6f04d89a71d4';

const configPath = await resolveRuntimeConfigPath();
const dataRoot = resolve(process.env['THSV_STREAMBRIDGE_DATA_ROOT']?.trim() || 'data');
const addOnsRoot = resolve(process.env['THSV_STREAMBRIDGE_ADDONS_ROOT']?.trim() || join(dataRoot, 'addons'));
const addOnStateRoot = resolve(process.env['THSV_STREAMBRIDGE_ADDON_STATE_ROOT']?.trim() || join(addOnsRoot, '.state'));
const loadedConfig = await loadConfigWithNotices(configPath);
const config = loadedConfig.config;
const logger = new StructuredLogger(config.logging.level, config.logging.directory, config.logging.maxFileBytes, config.logging.backups);
for (const notice of loadedConfig.notices) logger.warn(notice.message, { code: notice.code, configPath: resolve(configPath), ignoredPaths: notice.paths });
const registry = createDefaultAdapterRegistry(config, logger);
const inputs = registry.createInputs(config.platforms);
const outputs = registry.createOutputs(config.outputs);
const streamerBotInspector = outputs.find((output): output is StreamerBotAdapter => output instanceof StreamerBotAdapter);
const deduplicationStore = config.deduplication.persistAcrossRestarts
  ? new FileDeduplicationStore(config.deduplication.stateFile, logger)
  : new NoopDeduplicationStore();
const controlToken = await resolveControlToken(config.security.controlTokenEnv, config.security.controlTokenFile);
logger.addSensitiveValue(controlToken);
logger.addSensitiveValue(process.env[config.streamerbot.passwordEnv]);
const enabledPlatformIds = new Set(Object.entries(config.platforms).filter(([, platform]) => platform.enabled && platform.inputEnabled).map(([platformId]) => platformId));
const capabilityReports = registry.capabilityReports(config.platforms);
const availableCapabilities = new Set<PlatformCapabilityId>(capabilityReports.filter((report) => enabledPlatformIds.has(report.platform)).flatMap((report) => Object.entries(report.capabilities).filter(([, support]) => support.supported).map(([capability]) => capability as PlatformCapabilityId)));
const overlayHub = new BrowserOverlayHub(logger, config.browserOverlay);
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
const capabilityBroker = new AddOnCapabilityBroker(logger, addOnStateRoot, {
  ...(streamerBotInspector === undefined ? {} : { runStreamerBotAction: (actionId, argumentsValue, signal) => streamerBotInspector.runApprovedAction(actionId, argumentsValue, signal) }),
  publishOverlay: async (moduleId, topic, payload) => overlayHub.publishAddOn(moduleId, topic, payload),
  subscribeOverlayLifecycle: (moduleId, listener) => overlayHub.subscribeAddOnLifecycle(moduleId, listener),
  routeOutboundMessage: (request, signal) => outboundRouter.route(request, signal),
});
const modules = await createInstalledModuleRegistry(logger, addOnsRoot, availableCapabilities, capabilityBroker);
const deliveryOutboxStore = new FileDeliveryOutboxStore(config.streamerbot.deliveryStateFile);
const bridge = new StreamBridge(config, logger, { inputs, outputs, deduplicationStore, deliveryOutboxStore, modules });
const wizard = new WizardService(
  streamerBotInspector,
  new WizardConfigurationGateway(configPath, (platforms) => registry.capabilityReports(platforms)),
  new FileCommandSyncStore(join(dataRoot, 'state', 'command-sync.json'), logger),
  new AddOnWizardService(addOnsRoot, addOnStateRoot),
  new ReleaseUpdateService(CORE_CONTRACT_VERSION),
);
bridge.subscribe((event) => overlayHub.publish(event));
let stopping = false;

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info('Shutdown requested', { signal });
  try {
    await server.stop();
    await bridge.stop();
    await logger.flush();
    process.exitCode = 0;
  } catch (error) {
    logger.error('Shutdown failed', { error });
    process.exitCode = 1;
  }
}

const server = new DiagnosticsServer({ ...config.service, ...config.security }, bridge, logger, controlToken, () => void shutdown('HTTP'), overlayHub, wizard, dataRoot);

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('uncaughtException', (error) => { logger.error('Uncaught exception', { error }); void shutdown('uncaughtException'); });
process.once('unhandledRejection', (error) => { logger.error('Unhandled rejection', { error }); void shutdown('unhandledRejection'); });

try {
  await bridge.start();
  await server.start();
  logger.info('THSV StreamBridge is ready', { configPath: resolve(configPath) });
} catch (error) {
  logger.error('Startup failed', { error });
  await bridge.stop().catch(() => undefined);
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
