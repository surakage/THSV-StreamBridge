import { readFile } from 'node:fs/promises';
import type { BridgeConfig, PlatformConfig } from '../schemas/config.js';
import { bridgeConfigSchema } from '../schemas/config.js';
import type { Logger } from '../bridge/services/logger.js';
import type { NormalizedEvent } from '../schemas/event.js';

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export async function testConfig(): Promise<BridgeConfig> {
  const input = JSON.parse(await readFile('config/bridge.example.json', 'utf8')) as unknown;
  return bridgeConfigSchema.parse(input);
}

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
