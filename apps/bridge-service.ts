import { resolve } from 'node:path';
import { StreamBridge } from '../bridge/core/bridge.js';
import { createDefaultAdapterRegistry } from '../bridge/adapters/registry.js';
import { DiagnosticsServer } from '../bridge/services/http-server.js';
import { loadConfig } from '../bridge/services/config-loader.js';
import { StructuredLogger } from '../bridge/services/logger.js';
import { FileDeduplicationStore, NoopDeduplicationStore } from '../bridge/services/deduplication-store.js';
import { resolveControlToken } from '../bridge/services/control-token.js';
import { BrowserOverlayHub } from '../bridge/services/browser-overlay-hub.js';
import { createBuiltinModuleRegistry } from '../bridge/core/builtin-modules.js';

const configPath = process.env['THSV_STREAMBRIDGE_CONFIG'] ?? 'config/bridge.example.json';
const config = await loadConfig(configPath);
const logger = new StructuredLogger(config.logging.level, config.logging.directory, config.logging.maxFileBytes, config.logging.backups);
const registry = createDefaultAdapterRegistry(config, logger);
const inputs = registry.createInputs(config.platforms);
const outputs = registry.createOutputs(config.outputs);
const deduplicationStore = config.deduplication.persistAcrossRestarts
  ? new FileDeduplicationStore(config.deduplication.stateFile, logger)
  : new NoopDeduplicationStore();
const controlToken = await resolveControlToken(config.security.controlTokenEnv, config.security.controlTokenFile);
logger.addSensitiveValue(controlToken);
logger.addSensitiveValue(process.env[config.streamerbot.passwordEnv]);
const modules = createBuiltinModuleRegistry(logger);
const bridge = new StreamBridge(config, logger, { inputs, outputs, deduplicationStore, modules });
const overlayHub = new BrowserOverlayHub(logger, config.browserOverlay);
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

const server = new DiagnosticsServer({ ...config.service, ...config.security }, bridge, logger, controlToken, () => void shutdown('HTTP'), overlayHub);

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
