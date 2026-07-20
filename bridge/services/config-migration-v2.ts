import type { JsonValueV2 } from '../contracts/v2/common.js';
import type { PlatformCapabilityId } from '../contracts/v2/capability.js';
import { bridgeConfigSchema } from '../../schemas/config.js';
import { coreConfigV2Schema, type CoreConfigV2 } from '../../schemas/config-v2.js';

const LEGACY_CAPABILITY_MAP: Readonly<Record<string, PlatformCapabilityId>> = {
  chatInput: 'chat.input', chatOutput: 'chat.output', follows: 'follows', subscriptions: 'subscriptions', gifts: 'gifts',
  donations: 'donations', raids: 'raids', moderation: 'moderation', channelUpdates: 'stream-status',
};

const LEGACY_BLOOM_COMMANDS = new Set(['bloom-wave', 'bloom-feed', 'bloom-rest', 'bloom-wake', 'bloom-celebrate']);

export interface ConfigMigrationPreviewV2 {
  readonly candidate: CoreConfigV2;
  readonly sourceVersion: '1.0.0';
  readonly targetVersion: '2.0.0-preview.1';
  readonly mutatesSource: false;
  readonly archivedConfigKeys: readonly string[];
  readonly preservedStateFiles: readonly string[];
  readonly legacyCommandCandidates: readonly string[];
  readonly warnings: readonly string[];
}

export function previewV2ConfigMigration(input: unknown): ConfigMigrationPreviewV2 {
  const legacyStateFiles = readLegacyStateFiles(input);
  const legacy = bridgeConfigSchema.parse(input);
  const platforms = Object.fromEntries(Object.entries(legacy.platforms).map(([id, platform]) => [id, {
    enabled: platform.enabled,
    inputEnabled: platform.inputEnabled,
    outputEnabled: platform.outputEnabled,
    adapter: platform.adapter,
    requiredCapabilities: [...new Set(platform.capabilities.map((capability) => LEGACY_CAPABILITY_MAP[capability]).filter((capability): capability is PlatformCapabilityId => capability !== undefined))],
    settings: {},
    reconnect: platform.reconnect,
  }]));
  const outputs = Object.fromEntries(Object.entries(legacy.outputs).map(([id, output]) => [id, {
    enabled: output.enabled, adapter: output.adapter, settings: output.settings,
  }]));
  const publicOverlayConfig = legacy.browserOverlay;

  const modules: Record<string, { enabled: boolean; schemaVersion: string; config: Record<string, JsonValueV2> }> = {
    'core.chat': { enabled: true, schemaVersion: '1.0.0', config: publicOverlayConfig as unknown as Record<string, JsonValueV2> },
    'core.commands': { enabled: legacy.commands.enabled, schemaVersion: '1.0.0', config: legacy.commands },
    'core.alerts': { enabled: true, schemaVersion: '1.0.0', config: {} },
    'core.timed-actions': { enabled: true, schemaVersion: '1.0.0', config: legacy.timedActions as unknown as Record<string, JsonValueV2> },
    'core.filters': { enabled: true, schemaVersion: '1.0.0', config: { rules: [] } },
    'core.rewards': { enabled: false, schemaVersion: '1.0.0', config: { twitch: { enabled: false }, kick: { enabled: false } } },
    'core.diagnostics': { enabled: true, schemaVersion: '1.0.0', config: {} },
    'core.wizard': { enabled: true, schemaVersion: '1.0.0', config: {} },
  };

  const candidate = coreConfigV2Schema.parse({
    configVersion: '2.0.0-preview.1', service: legacy.service, security: legacy.security, logging: legacy.logging,
    deduplication: legacy.deduplication, streamerbot: legacy.streamerbot, platforms, outputs, modules,
  });
  const legacyCommandCandidates = legacy.commands.definitions.map((definition) => definition.name).filter((name) => LEGACY_BLOOM_COMMANDS.has(name));
  return {
    candidate,
    sourceVersion: '1.0.0',
    targetVersion: '2.0.0-preview.1',
    mutatesSource: false,
    archivedConfigKeys: ['viewerIdentity', 'companion'],
    preservedStateFiles: legacyStateFiles,
    legacyCommandCandidates,
    warnings: [
      'This is a preview only; it does not write configuration or state.',
      'viewerIdentity and companion configuration are archived from core; the listed state files remain preserved creator data.',
      'Legacy creator-declared capabilities are migration requirements only; adapters remain authoritative for actual support.',
      'Streamer.bot command authority transition is deferred; no command is created, edited, or deleted by this preview.',
      ...(legacyCommandCandidates.length === 0 ? [] : ['Bloom-named commands were retained for review and were not silently deleted.']),
    ],
  };
}

function readLegacyStateFiles(input: unknown): readonly string[] {
  const root = input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  return [
    nestedStateFile(root['viewerIdentity'], 'data/state/viewer-progression.json'),
    nestedStateFile(root['companion'], 'data/state/companion.json'),
  ];
}

function nestedStateFile(value: unknown, fallback: string): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const stateFile = (value as Record<string, unknown>)['stateFile'];
  return typeof stateFile === 'string' && stateFile.length > 0 ? stateFile : fallback;
}
