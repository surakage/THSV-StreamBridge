import { resolve } from 'node:path';
import { ConfigurationError, loadConfig } from '../bridge/services/config-loader.js';

const path = process.argv[2] ?? process.env['THSV_STREAMBRIDGE_CONFIG'] ?? 'config/bridge.example.json';
try {
  const config = await loadConfig(path);
  const enabled = Object.entries(config.platforms).filter(([, platform]) => platform.enabled).map(([name]) => name);
  process.stdout.write(`${JSON.stringify({ valid: true, path: resolve(path), enabledPlatforms: enabled, streamerbotEnabled: config.streamerbot.enabled })}\n`);
} catch (error) {
  if (error instanceof ConfigurationError) {
    process.stderr.write(`${error.message}\n${error.details.map((detail) => `- ${detail}`).join('\n')}\n`);
  } else process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
