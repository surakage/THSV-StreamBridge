import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

// Shared by tools/build-streamerbot-export.ts (the project's own shipped packages, reading
// source from disk) and the Stage 5 Tier 2 wizard generation path (source built in memory,
// never written to the repository). Both must produce byte-identical output for the same
// input, which tests/unit/*-package-files.test.ts already verify for every shipped package —
// this module is the thing making that guarantee possible without duplicating the logic.

// Confirmed against a real Streamer.bot v1.0.5-alpha.31 export (a manually created command bound
// to a manually created action, decoded and inspected): the binding lives on the action's own
// `triggers` array, not on the command. `type: 401` is Streamer.bot's internal value for
// "Command Triggered" observed in that same export.
export interface StreamerBotPackageTriggerInput {
  readonly commandId: string;
  readonly id?: string;
  readonly stableIdentitySeed: string;
}

export interface StreamerBotPackageActionInput {
  readonly name: string;
  readonly group: string;
  readonly id?: string;
  readonly sourceSubActionId?: string;
  readonly sourceCode: string;
  readonly references?: readonly string[];
  readonly arguments?: readonly StreamerBotPackageArgumentInput[];
  // Used only when id/sourceSubActionId are not pinned. Callers with a single action should
  // pass the same seed a legacy single-action manifest used (`manifest.name`) so an existing
  // package's already-pinned IDs remain reproducible if it ever drops its explicit pins.
  readonly stableIdentitySeed: string;
  readonly triggers?: readonly StreamerBotPackageTriggerInput[];
}

export interface StreamerBotPackageArgumentInput {
  readonly name: string;
  readonly value: string;
  readonly autoType?: boolean;
  readonly id?: string;
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

// Field names and shape confirmed against the same real export referenced above: `command` is a
// single string, not an array, and its lines are CRLF- ("\r\n"-) joined, matching what
// Streamer.bot's own multi-line Command(s) editor produces (for example "!test\r\n!testing").
// Streamer.bot's own public CommandData changelog documentation describes a different (older or
// aspirational) shape than what v1.0.5-alpha.31 actually emits.
//
// That export also included five properties with obfuscated names (unclear provenance, and
// liable to be renamed by whatever produced them in a different build). A second real export —
// this one of a manually-typed multi-alias command that a wizard-imported equivalent failed to
// match in chat despite identical Name/Enabled/Sources/Mode/Location — pinned down what three of
// them are for:
//   - `_yuEckkdeqeGVrWcRFoIw8BeAQXz` sits immediately after `ignoreBotAccount` in the real field
//     order, matching "Ignore Internal Messages" (the Options toggle right below "Ignore Bot
//     Account" in Streamer.bot's own UI). There is no property literally named `ignoreInternal`
//     in a real export; a field by that name here would be silently dropped by Streamer.bot's
//     deserializer, meaning that toggle previously had no effect at all on generated commands.
//   - `_8Sqi6SKWnlYNCdAS1XISSKAglmB` holds the same phrase list as `command`, but comma-joined on
//     one line (for example "!tip, !tips, !support") instead of CRLF-joined. Given every other
//     inspected field matched between a working hand-typed command and a non-firing imported one,
//     this derived field — present on the working command, absent from anything this builder used
//     to emit — is the leading suspect for why imports silently never matched in chat.
//   - `_2Gw8HsHY4qR8nXsJqEE6F6gMDNj` was `false` on the one real command inspected; semantics
//     unconfirmed, included as an explicit default rather than left absent since its sibling
//     fields turned out to matter.
// `_P3JEHKDbjl8yxL8sXp3xW9byFMe` and `_ifoddENsXXJUpjpi0CGSd6mx9ff` were both empty arrays on the
// one command inspected (which had no Allow/Deny list configured) and are plausibly the
// Permissions tab's allowed/denied user or group lists; emitted here as empty arrays to match.
//
// These are still obfuscated, build-specific property names pinned to what v1.0.5-alpha.31
// produces — if a future Streamer.bot build renames them, commands generated against this builder
// would regress to the same silent-non-match failure mode this fixes, without any error surfacing
// anywhere. The Twitch, YouTube, and Kick source bits are verified against the installed
// Streamer.bot CommandSource enum; the generated command still imports disabled for deliberate
// creator review.
export interface StreamerBotPackageCommandInput {
  readonly id?: string;
  readonly name: string;
  readonly command: string;
  readonly enabled: boolean;
  readonly caseSensitive: boolean;
  readonly sources?: number;
  readonly ignoreBotAccount?: boolean;
  readonly ignoreInternal?: boolean;
  readonly globalCooldown?: number;
  readonly userCooldown?: number;
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
        triggers: (action.triggers ?? []).map((trigger) => ({
          commandId: trigger.commandId,
          id: trigger.id ?? stableStreamerBotUuid(`${trigger.stableIdentitySeed}:trigger`),
          type: 401,
          enabled: true,
          exclusions: [],
        })),
        subActions: [
          ...(action.arguments ?? []).map((argument, index) => ({
            variableName: argument.name,
            value: argument.value,
            autoType: argument.autoType ?? false,
            id: argument.id ?? stableStreamerBotUuid(`${argument.stableIdentitySeed}:argument`),
            weight: 0,
            type: 123,
            parentId: null,
            enabled: true,
            index,
          })),
          {
          name: null,
          description: null,
          references: action.references ?? defaultCompilerReferences(action.sourceCode),
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
          index: action.arguments?.length ?? 0,
        }],
        collapsedGroups: [],
      })),
      queues: [],
      commands: commands.map((command) => ({
        id: command.id ?? stableStreamerBotUuid(`${command.stableIdentitySeed}:command`),
        name: command.name,
        enabled: command.enabled,
        include: false,
        mode: 0,
        command: command.command,
        _2Gw8HsHY4qR8nXsJqEE6F6gMDNj: false,
        location: 0,
        ignoreBotAccount: command.ignoreBotAccount ?? true,
        _yuEckkdeqeGVrWcRFoIw8BeAQXz: command.ignoreInternal ?? true,
        sources: command.sources ?? 1,
        persistCounter: false,
        persistUserCounter: false,
        caseSensitive: command.caseSensitive,
        globalCooldown: command.globalCooldown ?? 0,
        userCooldown: command.userCooldown ?? 0,
        group: null,
        grantType: 0,
        _P3JEHKDbjl8yxL8sXp3xW9byFMe: [],
        _ifoddENsXXJUpjpi0CGSd6mx9ff: [],
        _8Sqi6SKWnlYNCdAS1XISSKAglmB: command.command.split('\r\n').join(', '),
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

function defaultCompilerReferences(sourceCode: string): string[] {
  const references = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\mscorlib.dll',
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.dll',
  ];
  if (sourceCode.includes('Newtonsoft.Json')) references.push('.\\Newtonsoft.Json.dll');
  return references;
}

export function stableStreamerBotUuid(input: string): string {
  const bytes = createHash('sha256').update(input).digest().subarray(0, 16);
  bytes[6] = (bytes[6] ?? 0) & 0x0f | 0x50;
  bytes[8] = (bytes[8] ?? 0) & 0x3f | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
