import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { previewV2ConfigMigration } from '../../bridge/services/config-migration-v2.js';
import { coreConfigV2Schema } from '../../schemas/config-v2.js';

describe('v2 configuration migration preview', () => {
  it('creates a valid core-only preview without mutating its source', async () => {
    const source = JSON.parse(await readFile('config/bridge.example.json', 'utf8')) as Record<string, unknown>;
    const original = structuredClone(source);
    const result = previewV2ConfigMigration(source);

    expect(source).toEqual(original);
    expect(result.mutatesSource).toBe(false);
    expect(coreConfigV2Schema.safeParse(result.candidate).success).toBe(true);
    expect(result.candidate).not.toHaveProperty('viewerIdentity');
    expect(result.candidate).not.toHaveProperty('companion');
    expect(JSON.stringify(result.candidate)).not.toContain('maxCompanionQueue');
    expect(result.archivedConfigKeys).toEqual(['viewerIdentity', 'companion']);
    expect(result.preservedStateFiles).toEqual(['data/state/viewer-progression.json', 'data/state/companion.json']);
  });

  it('retains legacy Bloom commands for explicit review instead of deleting them silently', async () => {
    const source = JSON.parse(await readFile('config/bridge.example.json', 'utf8')) as Record<string, unknown>;
    const commands = source['commands'] as { definitions: Array<Record<string, unknown>> };
    commands.definitions.push(
      ...['bloom-wave', 'bloom-feed', 'bloom-rest', 'bloom-wake', 'bloom-celebrate'].map((name) => ({ name, aliases: [], minimumRole: 'viewer', allowBots: false })),
    );
    const result = previewV2ConfigMigration(source);
    expect(result.legacyCommandCandidates).toEqual(['bloom-wave', 'bloom-feed', 'bloom-rest', 'bloom-wake', 'bloom-celebrate']);
    expect(JSON.stringify(result.candidate.modules['core.commands'])).toContain('bloom-feed');
    expect(result.warnings).toContain('Bloom-named commands were retained for review and were not silently deleted.');
  });

  it('does not trust legacy capability claims as adapter verification', async () => {
    const source = JSON.parse(await readFile('config/bridge.example.json', 'utf8')) as Record<string, unknown>;
    const result = previewV2ConfigMigration(source);
    expect(result.candidate.platforms['twitch']?.requiredCapabilities).toContain('chat.input');
    expect(result.candidate.platforms['twitch']).not.toHaveProperty('capabilities');
    expect(result.warnings.some((warning) => warning.includes('adapters remain authoritative'))).toBe(true);
  });

  it('allows a core configuration with no optional add-ons installed', async () => {
    const source = JSON.parse(await readFile('config/bridge.example.json', 'utf8')) as Record<string, unknown>;
    const candidate = previewV2ConfigMigration(source).candidate;
    expect(coreConfigV2Schema.safeParse({ ...candidate, modules: {} }).success).toBe(true);
  });
});
