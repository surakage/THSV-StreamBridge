import { resolve } from 'node:path';
import { ConfigurationError, loadConfig } from '../bridge/services/config-loader.js';

const path = process.argv[2] ?? process.env['THSV_STREAMBRIDGE_CONFIG'] ?? 'config/bridge.example.json';
try {
  const config = await loadConfig(path);
  const enabled = Object.entries(config.platforms).filter(([, platform]) => platform.enabled).map(([name]) => name);
  const outputs = Object.entries(config.outputs).filter(([, output]) => output.enabled).map(([name]) => name);
  process.stdout.write(`${JSON.stringify({
    valid: true,
    path: resolve(path),
    enabledPlatforms: enabled,
    enabledOutputs: outputs,
    commandsEnabled: config.commands.enabled,
    commandPrefix: config.commands.prefix,
    commandDefinitions: config.commands.definitions.length,
    timedActionDefinitions: config.timedActions.definitions.length,
    enabledTimedActions: config.timedActions.definitions.filter((definition) => definition.enabled).length,
    streamerbotEnabled: config.streamerbot.enabled,
    streamerbotLiveDelivery: config.streamerbot.enabled && !config.streamerbot.testMode,
  })}\n`);
} catch (error) {
  if (error instanceof ConfigurationError) {
    process.stderr.write(`${error.message}\n${error.details.map((detail) => `- ${detail}`).join('\n')}\n`);
  } else process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
