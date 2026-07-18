import type { NormalizedEvent } from '../../schemas/event.js';
import { CORE_CONTRACT_VERSION } from '../contracts/v2/common.js';
import type { ModuleManifestV2 } from '../contracts/v2/module-manifest.js';
import type { Logger } from '../services/logger.js';
import { projectMultiAlert } from './multi-alerts.js';
import { projectMultiChatMessage } from './multi-chat.js';
import { projectMultiCommand } from './multi-commands.js';
import { projectMultiTimedAction } from './multi-timed-actions.js';
import { projectRewardRedemption } from './rewards.js';
import { ModuleRegistry, type FrameworkModule } from './module-registry.js';

const VERSION = '2.0.0-preview.1';

export function createBuiltinModuleRegistry(logger: Logger): ModuleRegistry {
  return new ModuleRegistry([
    projectionModule('core.chat', ['chat.message'], (event) => { projectMultiChatMessage(event); }),
    projectionModule('core.commands', ['command.received'], (event) => { projectMultiCommand(event); }),
    projectionModule('core.alerts', ['channel.follow', 'channel.subscription', 'channel.membership', 'channel.gift-subscription', 'engagement.gift', 'engagement.donation', 'engagement.cheer', 'engagement.super-chat', 'channel.raid', 'engagement.milestone'], (event) => { projectMultiAlert(event); }),
    projectionModule('core.timed-actions', ['system.timed'], (event) => { projectMultiTimedAction(event); }),
    projectionModule('core.rewards', ['reward.redemption'], (event) => { projectRewardRedemption(event); }),
  ], logger);
}

function projectionModule(moduleId: string, subscriptions: readonly string[], project: (event: NormalizedEvent) => void): FrameworkModule {
  const manifest: ModuleManifestV2 = {
    contractVersion: CORE_CONTRACT_VERSION,
    moduleId,
    name: moduleId.split('.')[1]?.replace('-', ' ') ?? moduleId,
    version: VERSION,
    minimumCoreVersion: VERSION,
    maximumTestedCoreVersion: VERSION,
    dependencies: [],
    requiredCapabilities: [],
    configurationSchema: `schemas/modules/${moduleId}.json`,
    eventSubscriptions: [...subscriptions],
    commandsProvided: [], actionsProvided: [], browserSourcesProvided: [], dataStorageOwned: [],
    installationSteps: ['Installed with THSV StreamBridge core.'],
    uninstallationSteps: ['Core modules are removed only by uninstalling the core.'],
    migrations: [],
    healthChecks: [{ id: `${moduleId}.runtime`, description: `Confirms ${moduleId} is accepting normalized events.` }],
  };
  return { manifest, required: true, onEvent: async (event) => { project(event); } };
}
