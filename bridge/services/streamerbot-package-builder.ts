import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

// Shared by tools/build-streamerbot-export.ts (the project's own shipped packages, reading
// source from disk) and the Stage 5 Tier 2 wizard generation path (source built in memory,
// never written to the repository). Both must produce byte-identical output for the same
// input, which tests/unit/*-package-files.test.ts already verify for every shipped package —
// this module is the thing making that guarantee possible without duplicating the logic.

export interface StreamerBotPackageActionInput {
  readonly name: string;
  readonly group: string;
  readonly id?: string;
  readonly sourceSubActionId?: string;
  readonly sourceCode: string;
  // Used only when id/sourceSubActionId are not pinned. Callers with a single action should
  // pass the same seed a legacy single-action manifest used (`manifest.name`) so an existing
  // package's already-pinned IDs remain reproducible if it ever drops its explicit pins.
  readonly stableIdentitySeed: string;
}

export interface StreamerBotPackageMeta {
  readonly name: string;
  readonly author?: string;
  readonly version: string;
  readonly description?: string;
  readonly minimumStreamerBotVersion: string;
  readonly concurrent: boolean;
}

// Field names (camelCase) follow the same convention every other field in this export format
// uses; the set of fields themselves is inferred from Streamer.bot's own public CommandData
// class (Id/Name/Enabled/Group/Mode/Commands/RegexCommand/CaseSensitive/Sources), not
// independently confirmed against a live import. `mode` and `sources` are left at conservative
// defaults for exactly that reason — see bridge/core/command-generation.ts for how callers are
// expected to compensate (importing disabled, verifying after import).
export interface StreamerBotPackageCommandInput {
  readonly id?: string;
  readonly name: string;
  readonly group: string;
  readonly enabled: boolean;
  readonly commands: readonly string[];
  readonly caseSensitive: boolean;
  readonly stableIdentitySeed: string;
}

export function buildStreamerBotPackage(
  meta: StreamerBotPackageMeta,
  actions: readonly StreamerBotPackageActionInput[],
  commands: readonly StreamerBotPackageCommandInput[] = [],
): string {
  if (actions.length === 0) throw new Error('A Streamer.bot package must define at least one action.');
  const exported = {
    meta: {
      name: meta.name,
      author: meta.author ?? '',
      version: meta.version,
      description: meta.description ?? '',
      autoRunAction: null,
      minimumVersion: null,
    },
    data: {
      actions: actions.map((action) => ({
        id: action.id ?? stableStreamerBotUuid(`${action.stableIdentitySeed}:action`),
        queue: '00000000-0000-0000-0000-000000000000',
        enabled: true,
        excludeFromHistory: false,
        excludeFromPending: false,
        name: action.name,
        group: action.group,
        alwaysRun: false,
        randomAction: false,
        concurrent: meta.concurrent,
        triggers: [],
        subActions: [{
          name: null,
          description: null,
          references: ['C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\mscorlib.dll'],
          byteCode: Buffer.from(action.sourceCode, 'utf8').toString('base64'),
          precompile: false,
          delayStart: false,
          saveResultToVariable: false,
          saveToVariable: null,
          id: action.sourceSubActionId ?? stableStreamerBotUuid(`${action.stableIdentitySeed}:source`),
          weight: 0,
          type: 99_999,
          parentId: null,
          enabled: true,
          index: 0,
        }],
        collapsedGroups: [],
      })),
      queues: [],
      commands: commands.map((command) => ({
        id: command.id ?? stableStreamerBotUuid(`${command.stableIdentitySeed}:command`),
        name: command.name,
        enabled: command.enabled,
        group: command.group,
        mode: 0,
        commands: [...command.commands],
        regexCommand: null,
        caseSensitive: command.caseSensitive,
        sources: [],
      })),
      websocketServers: [],
      websocketClients: [],
      timers: [],
    },
    version: 24,
    exportedFrom: meta.minimumStreamerBotVersion,
    minimumVersion: '1.0.0-alpha.1',
  };
  const header = Buffer.from('SBAE', 'ascii');
  const compressed = gzipSync(Buffer.from(JSON.stringify(exported)), { level: 9 });
  return Buffer.concat([header, compressed]).toString('base64');
}

export function stableStreamerBotUuid(input: string): string {
  const bytes = createHash('sha256').update(input).digest().subarray(0, 16);
  bytes[6] = (bytes[6] ?? 0) & 0x0f | 0x50;
  bytes[8] = (bytes[8] ?? 0) & 0x3f | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
