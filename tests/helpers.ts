import { readFile } from 'node:fs/promises';
import type { BridgeConfig, PlatformConfig } from '../schemas/config.js';
import { bridgeConfigSchema } from '../schemas/config.js';
import type { Logger } from '../bridge/services/logger.js';
import type { NormalizedEvent } from '../schemas/event.js';
import { StreamBridge, type StateWriter } from '../bridge/core/bridge.js';
import { createDefaultAdapterRegistry } from '../bridge/adapters/registry.js';
import { NoopDeduplicationStore } from '../bridge/services/deduplication-store.js';

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export async function testConfig(): Promise<BridgeConfig> {
  const input = JSON.parse(await readFile('config/bridge.example.json', 'utf8')) as unknown;
  const config = bridgeConfigSchema.parse(input);
  config.deduplication.persistAcrossRestarts = false;
  config.streamerbot.testMode = true;
  return config;
}

export function createTestBridge(config: BridgeConfig, stateWriter?: StateWriter, logger: Logger = silentLogger): StreamBridge {
  const registry = createDefaultAdapterRegistry(config, logger);
  return new StreamBridge(config, logger, {
    inputs: registry.createInputs(config.platforms),
    outputs: registry.createOutputs(config.outputs),
    deduplicationStore: new NoopDeduplicationStore(),
    ...(stateWriter === undefined ? {} : { stateWriter }),
  });
}

export const TEST_CONTROL_TOKEN = 'test-control-token-with-at-least-32-characters';

export async function fixture(name = 'twitch-chat.json'): Promise<NormalizedEvent> {
  return JSON.parse(await readFile(`tests/fixtures/${name}`, 'utf8')) as NormalizedEvent;
}

export function platformConfig(enabled = true): PlatformConfig {
  return {
    enabled,
    inputEnabled: true,
    outputEnabled: false,
    adapter: 'test',
    capabilities: ['chatInput'],
    reconnect: { enabled: false, initialDelayMs: 10, maxDelayMs: 10, maxAttempts: 0 },
  };
}
