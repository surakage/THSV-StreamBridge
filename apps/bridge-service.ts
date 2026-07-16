import { resolve } from 'node:path';
import { StreamBridge } from '../bridge/core/bridge.js';
import { DiagnosticsServer } from '../bridge/services/http-server.js';
import { loadConfig } from '../bridge/services/config-loader.js';
import { StructuredLogger } from '../bridge/services/logger.js';

const configPath = process.env['THSV_STREAMBRIDGE_CONFIG'] ?? 'config/bridge.example.json';
const config = await loadConfig(configPath);
const logger = new StructuredLogger(config.logging.level, config.logging.directory, config.logging.maxFileBytes, config.logging.backups);
const bridge = new StreamBridge(config, logger);
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

const server = new DiagnosticsServer({ ...config.service, ...config.security }, bridge, logger, () => void shutdown('HTTP'));

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
