import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildStreamerBotPackage } from '../../bridge/services/streamerbot-package-builder.js';

interface ExportArgument {
  readonly name: string;
  readonly value: string;
  readonly autoType?: boolean;
  readonly id?: string;
}

interface ExportAction {
  readonly name: string;
  readonly group: string;
  readonly id?: string;
  readonly sourceSubActionId?: string;
  readonly source: string;
  readonly importFile: string;
  readonly references?: readonly string[];
  readonly arguments?: readonly ExportArgument[];
  readonly excludeFromHistory?: boolean;
  readonly excludeFromPending?: boolean;
  readonly triggers?: readonly { readonly commandId: string; readonly id?: string; readonly stableIdentitySeed?: string }[];
}

interface ExportCommand {
  readonly id?: string; readonly name: string; readonly command: string; readonly enabled: boolean; readonly caseSensitive: boolean;
  readonly sources?: number; readonly ignoreBotAccount?: boolean; readonly ignoreInternal?: boolean; readonly globalCooldown?: number;
  readonly userCooldown?: number; readonly stableIdentitySeed?: string;
}

interface ExportManifest {
  readonly name: string;
  readonly version: string;
  readonly author?: string;
  readonly description?: string;
  readonly minimumStreamerBotVersion: string;
  readonly action?: ExportAction;
  readonly actions?: readonly ExportAction[];
  readonly commands?: readonly ExportCommand[];
  readonly runtime: { readonly concurrent: boolean };
}

describe('generated Streamer.bot import cohesion', () => {
  it('keeps every checked-in import byte-for-byte aligned with its manifest and C# source', async () => {
    const root = 'packages/streamerbot';
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
      const packageRoot = join(root, entry.name);
      let manifestText: string;
      try {
        manifestText = await readFile(join(packageRoot, 'manifest.json'), 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
      const manifest = JSON.parse(manifestText) as ExportManifest;
      const actions = manifest.actions ?? (manifest.action === undefined ? [] : [manifest.action]);
      expect(actions.length, `${entry.name} must define at least one action`).toBeGreaterThan(0);
      const importFiles = [...new Set(actions.map((action) => action.importFile))];
      expect(importFiles, `${entry.name} must generate one shared import`).toHaveLength(1);

      const expected = buildStreamerBotPackage({
        name: manifest.name,
        ...(manifest.author === undefined ? {} : { author: manifest.author }),
        version: manifest.version,
        ...(manifest.description === undefined ? {} : { description: manifest.description }),
        minimumStreamerBotVersion: manifest.minimumStreamerBotVersion,
        concurrent: manifest.runtime.concurrent,
      }, await Promise.all(actions.map(async (action) => ({
        name: action.name,
        group: action.group,
        ...(action.id === undefined ? {} : { id: action.id }),
        ...(action.sourceSubActionId === undefined ? {} : { sourceSubActionId: action.sourceSubActionId }),
        ...(action.references === undefined ? {} : { references: action.references }),
        ...(action.excludeFromHistory === undefined ? {} : { excludeFromHistory: action.excludeFromHistory }),
        ...(action.excludeFromPending === undefined ? {} : { excludeFromPending: action.excludeFromPending }),
        ...(action.triggers === undefined ? {} : { triggers: action.triggers.map((trigger) => ({
          commandId: trigger.commandId,
          ...(trigger.id === undefined ? {} : { id: trigger.id }),
          stableIdentitySeed: trigger.stableIdentitySeed ?? `${manifest.name}:${action.name}:${trigger.commandId}`,
        })) }),
        ...(action.arguments === undefined ? {} : {
          arguments: action.arguments.map((argument) => ({
            name: argument.name,
            value: argument.value,
            ...(argument.autoType === undefined ? {} : { autoType: argument.autoType }),
            ...(argument.id === undefined ? {} : { id: argument.id }),
            stableIdentitySeed: `${manifest.name}:${action.name}:${argument.name}`,
          })),
        }),
        sourceCode: await readFile(join(packageRoot, action.source), 'utf8'),
        stableIdentitySeed: manifest.actions === undefined ? manifest.name : `${manifest.name}:${action.name}`,
      }))), (manifest.commands ?? []).map((command) => ({
        ...command,
        stableIdentitySeed: command.stableIdentitySeed ?? `${manifest.name}:command:${command.name}`,
      })));
      const actual = await readFile(join(packageRoot, importFiles[0] ?? ''), 'utf8');
      expect(actual, `${entry.name} has a stale generated Streamer.bot import`).toBe(expected);
    }
  }, 20_000);
});
