import {
  buildStreamerBotPackage,
  stableStreamerBotUuid,
  type StreamerBotPackageActionInput,
  type StreamerBotPackageCommandInput,
} from '../services/streamerbot-package-builder.js';

export const COMMAND_GENERATION_PACKAGE_VERSION = '1.0.0';

const NAME_PATTERN = /^[a-z][a-z0-9-]*$/u;
const MAX_NAME_LENGTH = 64;
const MAX_ALIASES = 20;
const MAX_NOTE_LENGTH = 500;
const MAX_ACTION_NAME_LENGTH = 200;
const MAX_CUSTOM_SCRIPT_LENGTH = 20_000;
// A custom script is meant to be only the body of a helper method the generated action already
// declares; a full "using ... class CPHInline { ... Execute() { ... } }" wrapper pasted in verbatim
// would nest inside that method and fail to compile. Reject the common mistake up front, with an
// actionable message, instead of producing broken C# that fails silently in Streamer.bot.
const CUSTOM_SCRIPT_WRAPPER_PATTERN = /\bclass\s+CPHInline\b|\bpublic\s+bool\s+Execute\s*\(/u;
const MAX_BATCH_SIZE = 20;
const ROLES = ['viewer', 'subscriber', 'moderator', 'broadcaster'] as const;
const COMMAND_PLATFORMS = ['twitch', 'youtube', 'kick', 'tiktok'] as const;
const NATIVE_COMMAND_PLATFORMS = ['twitch', 'youtube', 'kick'] as const;
export const COMMAND_PLATFORM_LIMITS = { twitch: 500, youtube: 200, kick: 500, tiktok: 150 } as const;
const COMMAND_SOURCE_BITS = { twitch: 1, youtube: 1_024, kick: 2_097_152 } as const;

export type CommandGenerationRole = typeof ROLES[number];
export type CommandPlatform = typeof COMMAND_PLATFORMS[number];
export type CommandResponseMode = 'none' | 'platform-message' | 'custom-script';
export type CommandPlatformMessages = Readonly<Partial<Record<CommandPlatform, string>>>;

export interface CommandDesignInput {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly minimumRole?: string;
  readonly note?: string;
  readonly actionName?: string;
  readonly responseMode?: string;
  readonly commandSources?: readonly string[];
  readonly platformMessages?: Readonly<Record<string, unknown>>;
  readonly customScript?: string;
  readonly globalCooldown?: number;
  readonly userCooldown?: number;
  readonly ignoreBotAccount?: boolean;
  readonly ignoreInternal?: boolean;
  // v1 wizard compatibility. New clients send platformMessages and commandSources.
  readonly responseMessage?: string;
  readonly deliveryPlatforms?: readonly string[];
  readonly approvedByCreator: boolean;
}

export interface CommandDesign {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly minimumRole: CommandGenerationRole;
  readonly note: string;
  readonly actionName: string;
  readonly responseMode: CommandResponseMode;
  readonly commandSources: readonly CommandPlatform[];
  readonly platformMessages: CommandPlatformMessages;
  readonly customScript: string;
  readonly globalCooldown: number;
  readonly userCooldown: number;
  readonly ignoreBotAccount: boolean;
  readonly ignoreInternal: boolean;
}

export class InvalidCommandDesignError extends Error {}

// Mirrors the same creator-approval gate every other mutating package in this project
// requires: the wizard must have already confirmed the operator wants this specific command
// before a design is even validated, let alone checked for collisions or generated.
export function createCommandDesign(input: CommandDesignInput): CommandDesign {
  if (!input.approvedByCreator) throw new InvalidCommandDesignError('Command generation requires explicit creator approval.');
  const name = normalizeCommandToken(input.name, 'name');
  const aliases = (input.aliases ?? []).map((alias) => normalizeCommandToken(alias, 'alias'));
  if (aliases.length > MAX_ALIASES) throw new InvalidCommandDesignError(`At most ${String(MAX_ALIASES)} aliases are allowed.`);
  if (new Set([name, ...aliases]).size !== aliases.length + 1) throw new InvalidCommandDesignError('name and aliases must all be distinct.');
  const minimumRoleInput = input.minimumRole ?? 'viewer';
  if (!isRole(minimumRoleInput)) throw new InvalidCommandDesignError(`minimumRole must be one of ${ROLES.join(', ')}.`);
  const note = (input.note ?? '').trim().slice(0, MAX_NOTE_LENGTH);
  if (/[\r\n]/u.test(note)) throw new InvalidCommandDesignError('note must be a single line.');
  const actionName = (input.actionName ?? `THSV Command - ${titleCaseCommand(name)}`).trim();
  if (actionName.length === 0 || actionName.length > MAX_ACTION_NAME_LENGTH || /[\r\n]/u.test(actionName)) throw new InvalidCommandDesignError(`actionName must be a single line of 1-${String(MAX_ACTION_NAME_LENGTH)} characters.`);
  const legacyPlatforms = input.deliveryPlatforms ?? [];
  const rawSources = input.commandSources ?? legacyPlatforms;
  if (!rawSources.every((platform): platform is CommandPlatform => (COMMAND_PLATFORMS as readonly string[]).includes(platform))) throw new InvalidCommandDesignError(`commandSources must contain only ${COMMAND_PLATFORMS.join(', ')}.`);
  const commandSources = [...new Set(rawSources)] as CommandPlatform[];
  const legacyMessage = (input.responseMessage ?? '').trim();
  const rawMessages = input.platformMessages ?? Object.fromEntries(commandSources.map((platform) => [platform, legacyMessage]));
  const platformMessages: Partial<Record<CommandPlatform, string>> = {};
  for (const platform of COMMAND_PLATFORMS) {
    const value = rawMessages[platform];
    if (value === undefined || value === '') continue;
    if (typeof value !== 'string') throw new InvalidCommandDesignError(`${platform} response must be a string.`);
    const message = value.trim();
    if (message.length === 0 || message.length > COMMAND_PLATFORM_LIMITS[platform] || /[\p{Cc}]/u.test(message)) throw new InvalidCommandDesignError(`${platform} response must be single-line plain text of 1-${String(COMMAND_PLATFORM_LIMITS[platform])} characters.`);
    platformMessages[platform] = message;
  }
  const inferredMode = input.responseMode ?? (legacyMessage.length > 0 ? 'platform-message' : 'none');
  if (!isResponseMode(inferredMode)) throw new InvalidCommandDesignError('responseMode must be none, platform-message, or custom-script.');
  const customScript = (input.customScript ?? '').trim();
  if (customScript.length > MAX_CUSTOM_SCRIPT_LENGTH || customScript.includes('\0')) throw new InvalidCommandDesignError(`customScript must contain at most ${String(MAX_CUSTOM_SCRIPT_LENGTH)} characters and no null bytes.`);
  if (inferredMode === 'platform-message') {
    if (commandSources.length === 0) throw new InvalidCommandDesignError('Select at least one command source for a platform response.');
    for (const platform of commandSources) if (platformMessages[platform] === undefined) throw new InvalidCommandDesignError(`Enter a ${platform} response or remove that command source.`);
  }
  if (inferredMode === 'custom-script' && customScript.length === 0) throw new InvalidCommandDesignError('customScript is required for custom-script mode.');
  if (inferredMode === 'custom-script' && CUSTOM_SCRIPT_WRAPPER_PATTERN.test(customScript)) {
    throw new InvalidCommandDesignError(
      'customScript must be only the body of the response method -- do not include "using" directives, "public class CPHInline", or "public bool Execute()". '
      + 'The generated action already provides that wrapper; write the code that computes a reply and end it with a "return" of the message to send (or return "" for no automatic reply).',
    );
  }
  const globalCooldown = boundedCooldown(input.globalCooldown, 'globalCooldown');
  const userCooldown = boundedCooldown(input.userCooldown, 'userCooldown');
  return {
    name, aliases, minimumRole: minimumRoleInput, note, actionName, responseMode: inferredMode,
    commandSources, platformMessages, customScript, globalCooldown, userCooldown,
    ignoreBotAccount: input.ignoreBotAccount ?? true, ignoreInternal: input.ignoreInternal ?? true,
  };
}

function isRole(value: string): value is CommandGenerationRole {
  return (ROLES as readonly string[]).includes(value);
}

function isResponseMode(value: string): value is CommandResponseMode { return value === 'none' || value === 'platform-message' || value === 'custom-script'; }
function titleCaseCommand(value: string): string { return value.split('-').map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(' '); }
function boundedCooldown(value: number | undefined, field: string): number {
  const result = value ?? 0;
  if (!Number.isInteger(result) || result < 0 || result > 86_400) throw new InvalidCommandDesignError(`${field} must be a whole number from 0 to 86400 seconds.`);
  return result;
}

// Validates a whole batch at once: each design individually (createCommandDesign), plus that no
// two designs in the same submission share a name or alias — a duplicate within the batch is
// just as much a problem as a duplicate against live Streamer.bot state, and catching it here
// means the creator sees it before any collision check runs, not buried inside the results.
export function createCommandDesigns(inputs: readonly CommandDesignInput[]): CommandDesign[] {
  if (inputs.length === 0) throw new InvalidCommandDesignError('At least one command design is required.');
  if (inputs.length > MAX_BATCH_SIZE) throw new InvalidCommandDesignError(`At most ${String(MAX_BATCH_SIZE)} commands can be generated in one batch.`);
  const designs = inputs.map((input) => createCommandDesign(input));
  const seen = new Map<string, number>();
  for (const [index, design] of designs.entries()) {
    for (const token of [design.name, ...design.aliases]) {
      const previous = seen.get(token);
      if (previous !== undefined) {
        throw new InvalidCommandDesignError(`"${token}" is used by both design ${String(previous)} and design ${String(index)} in this batch.`);
      }
      seen.set(token, index);
    }
  }
  return designs;
}

// The wizard HTTP boundary hands this raw, untrusted JSON — the same "unknown in, validated
// domain type out" shape wizard-configuration.ts's stage()/stageImport() already use for their
// own request bodies.
export function parseCommandDesignInput(value: unknown): CommandDesignInput {
  if (typeof value !== 'object' || value === null) throw new InvalidCommandDesignError('Request body must be a JSON object.');
  const record = value as Record<string, unknown>;
  if (typeof record['name'] !== 'string') throw new InvalidCommandDesignError('name is required and must be a string.');
  if (typeof record['approvedByCreator'] !== 'boolean') throw new InvalidCommandDesignError('approvedByCreator must be a boolean.');
  const aliases = record['aliases'];
  if (aliases !== undefined && (!Array.isArray(aliases) || !aliases.every((item) => typeof item === 'string'))) {
    throw new InvalidCommandDesignError('aliases must be an array of strings.');
  }
  const platformMessages = record['platformMessages'];
  if (platformMessages !== undefined && (typeof platformMessages !== 'object' || platformMessages === null || Array.isArray(platformMessages))) throw new InvalidCommandDesignError('platformMessages must be a JSON object.');
  if (record['commandSources'] !== undefined && (!Array.isArray(record['commandSources']) || !record['commandSources'].every((item) => typeof item === 'string'))) throw new InvalidCommandDesignError('commandSources must be an array of strings.');
  for (const field of ['globalCooldown', 'userCooldown']) if (record[field] !== undefined && typeof record[field] !== 'number') throw new InvalidCommandDesignError(`${field} must be a number.`);
  return {
    name: record['name'],
    approvedByCreator: record['approvedByCreator'],
    ...(aliases === undefined ? {} : { aliases }),
    ...(typeof record['minimumRole'] === 'string' ? { minimumRole: record['minimumRole'] } : {}),
    ...(typeof record['note'] === 'string' ? { note: record['note'] } : {}),
    ...(typeof record['actionName'] === 'string' ? { actionName: record['actionName'] } : {}),
    ...(typeof record['responseMode'] === 'string' ? { responseMode: record['responseMode'] } : {}),
    ...(Array.isArray(record['commandSources']) && record['commandSources'].every((item) => typeof item === 'string') ? { commandSources: record['commandSources'] } : {}),
    ...(platformMessages === undefined ? {} : { platformMessages: platformMessages as Record<string, unknown> }),
    ...(typeof record['customScript'] === 'string' ? { customScript: record['customScript'] } : {}),
    ...(typeof record['globalCooldown'] === 'number' ? { globalCooldown: record['globalCooldown'] } : {}),
    ...(typeof record['userCooldown'] === 'number' ? { userCooldown: record['userCooldown'] } : {}),
    ...(typeof record['ignoreBotAccount'] === 'boolean' ? { ignoreBotAccount: record['ignoreBotAccount'] } : {}),
    ...(typeof record['ignoreInternal'] === 'boolean' ? { ignoreInternal: record['ignoreInternal'] } : {}),
    ...(typeof record['responseMessage'] === 'string' ? { responseMessage: record['responseMessage'] } : {}),
    ...(Array.isArray(record['deliveryPlatforms']) && record['deliveryPlatforms'].every((item) => typeof item === 'string') ? { deliveryPlatforms: record['deliveryPlatforms'] } : {}),
  };
}

// Parses the wizard's batch request body: { designs: [...] }.
export function parseCommandDesignsInput(value: unknown): CommandDesignInput[] {
  if (typeof value !== 'object' || value === null) throw new InvalidCommandDesignError('Request body must be a JSON object.');
  const designs = (value as Record<string, unknown>)['designs'];
  if (!Array.isArray(designs)) throw new InvalidCommandDesignError('designs is required and must be an array.');
  return designs.map((entry) => parseCommandDesignInput(entry));
}

function normalizeCommandToken(value: string, field: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new InvalidCommandDesignError(`${field} must be at most ${String(MAX_NAME_LENGTH)} characters.`);
  }
  if (trimmed.length === 0 || !NAME_PATTERN.test(trimmed)) {
    throw new InvalidCommandDesignError(`${field} must be lowercase, start with a letter, and contain only letters, numbers, and hyphens.`);
  }
  return trimmed;
}

export interface LiveActionSummary {
  readonly id: string;
  readonly name: string;
}

export interface LiveCommandSummary {
  readonly id: string;
  readonly name: string;
  readonly aliases?: readonly string[];
}

export interface LiveInventory {
  readonly actions: readonly LiveActionSummary[];
  readonly commands: readonly LiveCommandSummary[];
}

export interface CommandCollision {
  readonly kind: 'action' | 'command';
  readonly id: string;
  readonly name: string;
  readonly matchedOn: string;
}

export interface BatchCommandCollision extends CommandCollision {
  readonly designIndex: number;
}

// Runs before generation, not after: every proposed name and alias is checked case-insensitively
// against both live actions and live commands, regardless of whether the bridge owns the
// colliding object. A creator's own unrelated object with the same name is just as much a
// collision as one THSV StreamBridge already tracks.
export function findCommandCollision(design: CommandDesign, live: LiveInventory): CommandCollision | undefined {
  const proposed = [design.name, ...design.aliases];
  for (const action of live.actions) {
    const match = matchToken(proposed, action.name);
    if (match !== undefined) return { kind: 'action', id: action.id, name: action.name, matchedOn: match };
  }
  for (const command of live.commands) {
    for (const liveToken of [command.name, ...(command.aliases ?? [])]) {
      const match = matchToken(proposed, liveToken);
      if (match !== undefined) return { kind: 'command', id: command.id, name: command.name, matchedOn: match };
    }
  }
  return undefined;
}

// Batch form of findCommandCollision: checks every design in the submitted batch against live
// inventory and returns all collisions found (not just the first), each tagged with which design
// in the batch it belongs to. createCommandDesigns() already rejects a name/alias reused across
// designs in the same batch, so this only needs to check against live Streamer.bot state.
export function findAllCommandCollisions(designs: readonly CommandDesign[], live: LiveInventory): BatchCommandCollision[] {
  const collisions: BatchCommandCollision[] = [];
  for (const [designIndex, design] of designs.entries()) {
    const collision = findCommandCollision(design, live);
    if (collision !== undefined) collisions.push({ ...collision, designIndex });
  }
  return collisions;
}

function matchToken(proposed: readonly string[], liveToken: string): string | undefined {
  const lowerLive = liveToken.toLowerCase();
  return proposed.find((token) => token.toLowerCase() === lowerLive);
}

export interface GeneratedCommandEntry {
  readonly name: string;
  readonly actionId: string;
  readonly commandId: string;
  readonly sourceCode: string;
}

export interface GeneratedCommandsPackage {
  readonly filename: string;
  readonly contentBase64: string;
  readonly commands: readonly GeneratedCommandEntry[];
}

const DEFAULT_PREFIX = '!';

// Generates one package containing, for every design in the batch, a minimal fully-reviewable
// stub action, a native Command object, and the trigger on the action that binds them — all
// three confirmed necessary and sufficient by decoding a real Streamer.bot v1.0.5-alpha.31
// export (a manually created command bound to a manually created action). Streamer.bot stores its
// multi-line Command(s) editor in one `command` string, so the primary phrase and every alias are
// embedded one per line. Every command still imports disabled so the creator can review
// its permissions, selected platform sources, cooldowns, and generated action before enabling it.
// Multiple actions in one package is the same pattern
// native-platform-intake already uses (one package, several independently-triggered actions).
export function generateCommandsPackage(designs: readonly CommandDesign[], prefix: string): GeneratedCommandsPackage {
  if (designs.length === 0) throw new InvalidCommandDesignError('At least one command design is required.');
  const normalizedPrefix = prefix.length === 1 && !/\s/u.test(prefix) ? prefix : DEFAULT_PREFIX;
  const actionInputs: StreamerBotPackageActionInput[] = [];
  const commandInputs: StreamerBotPackageCommandInput[] = [];
  const commands: GeneratedCommandEntry[] = [];
  for (const design of designs) {
    const actionName = design.actionName;
    const identitySeed = `wizard-generated:${design.name}`;
    const actionId = stableStreamerBotUuid(`${identitySeed}:action`);
    const commandId = stableStreamerBotUuid(`${identitySeed}:command`);
    const triggerId = stableStreamerBotUuid(`${identitySeed}:trigger`);
    const commandPhrase = `${normalizedPrefix}${design.name}`;
    // CRLF, not LF: confirmed against a real Streamer.bot export of a manually-typed multi-alias
    // command — its `command` field was "\r\n"-joined. An LF-only join left wizard-imported
    // commands showing correctly in the edit dialog but never matching in chat.
    const commandPhrases = [commandPhrase, ...design.aliases.map((alias) => `${normalizedPrefix}${alias}`)].join('\r\n');
    const sourceCode = generateCommandActionSource(design, commandPhrase);
    actionInputs.push({
      name: actionName,
      group: 'THSV Bridge - Commands',
      id: actionId,
      sourceSubActionId: stableStreamerBotUuid(`${identitySeed}:source`),
      sourceCode,
      ...(design.responseMode === 'custom-script' ? { references: [
        'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\mscorlib.dll',
        'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.dll',
        'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.Web.Extensions.dll',
      ] } : {}),
      stableIdentitySeed: identitySeed,
      triggers: [{ commandId, id: triggerId, stableIdentitySeed: identitySeed }],
    });
    commandInputs.push({
      id: commandId,
      name: design.name,
      command: commandPhrases,
      enabled: false,
      caseSensitive: false,
      sources: commandSourceMask(design.commandSources),
      ignoreBotAccount: design.ignoreBotAccount,
      ignoreInternal: design.ignoreInternal,
      globalCooldown: design.globalCooldown,
      userCooldown: design.userCooldown,
      stableIdentitySeed: identitySeed,
    });
    commands.push({ name: design.name, actionId, commandId, sourceCode });
  }
  const firstName = designs[0]?.name ?? '';
  const packageName = designs.length === 1 ? `THSV Generated - ${firstName}` : `THSV Generated - ${String(designs.length)} commands`;
  const description = designs.length === 1
    ? `Wizard-generated stub for the "${firstName}" command. Review the source before enabling.`
    : `Wizard-generated stubs for ${String(designs.length)} commands (${designs.map((design) => design.name).join(', ')}). Review the source before enabling.`;
  const filename = designs.length === 1 ? `thsv-generated-${firstName}.sb` : `thsv-generated-batch-${String(designs.length)}-commands.sb`;
  const contentBase64 = buildStreamerBotPackage(
    {
      name: packageName,
      author: 'THSV StreamBridge wizard',
      version: COMMAND_GENERATION_PACKAGE_VERSION,
      description,
      minimumStreamerBotVersion: '1.0.0',
      concurrent: true,
    },
    actionInputs,
    commandInputs,
  );
  return { filename, contentBase64, commands };
}

function generateCommandActionSource(design: CommandDesign, commandPhrase: string): string {
  const aliasList = design.aliases.length === 0 ? '(none)' : design.aliases.join(', ');
  const note = design.note.length === 0 ? '(none)' : design.note;
  const allowedSources = design.commandSources.map((platform) => `"${platform}"`).join(', ');
  const messageDeclarations = COMMAND_PLATFORMS.map((platform) => `        string ${platform}Message = ExpandTemplate("${escapeCSharpString(design.platformMessages[platform] ?? '')}", userName, target, rawInput, channelName);`).join('\n');
  const execution = design.responseMode === 'platform-message' ? `        string responseMessage;
        if (commandSource == "twitch") responseMessage = twitchMessage;
        else if (commandSource == "youtube") responseMessage = youtubeMessage;
        else if (commandSource == "kick") responseMessage = kickMessage;
        else if (commandSource == "tiktok") responseMessage = tiktokMessage;
        else return true;
        SendToSource(commandSource, responseMessage);`
    : design.responseMode === 'custom-script' ? `        string responseMessage = BuildCustomResponse(commandSource, userName, target, rawInput, channelName);
        SendToSource(commandSource, responseMessage);`
    : '        // No automatic response was selected. Add creator-owned sub-actions here.';
  // Custom scripts are only ever the BODY of BuildCustomResponse, never a full action -- creators
  // write logic that computes and returns a reply, or send it themselves via CPH.* calls and fall
  // through to the trailing "return \"\";" so SendToSource's no-op-on-empty guard skips it. This is
  // what actually lets custom scripts compile and run instead of nesting inside Execute() and
  // producing invalid C#, and lets custom scripts reuse the same verified per-platform send methods
  // as platform-message mode instead of every creator needing to get those signatures right.
  const customResponseMethod = design.responseMode === 'custom-script' ? `
    private string BuildCustomResponse(string commandSource, string userName, string target, string rawInput, string channelName)
    {
${indentCustomScript(design.customScript)}
        return "";
    }
` : '';
  return `using System;
using System.Collections.Generic;
using Newtonsoft.Json;

public class CPHInline
{
    // Generated by the THSV StreamBridge setup wizard for the "${commandPhrase}" command.
    // Aliases: ${aliasList}
    // Minimum role reference: ${design.minimumRole}
    // Creator note: ${note}
    // Allowed command sources: ${allowedSources || '(none)'}
    public bool Execute()
    {
        string commandSource = Read("commandSource").Trim().ToLowerInvariant();
        if (commandSource.Length == 0 && (Has("commandParams") || Has("nickname") || Has("username"))) commandSource = "tiktok";
        var allowedSources = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { ${allowedSources} };
        if (!allowedSources.Contains(commandSource)) return true;
        string rawInput = First(Read("rawInput"), Read("commandParams")).Trim();
        string target = First(Read("input0"), FirstWord(rawInput)).Trim();
        string userName = First(Read("nickname"), Read("username"), Read("user"), Read("userName"), Read("displayName"));
        // Streamer.bot's broadcaster-username argument is capitalized differently per platform and
        // args lookups are case-sensitive: Twitch documents "broadcastUserName", YouTube and Kick
        // document "broadcastUsername" (lowercase n). All three also expose "broadcastUser" (the
        // broadcaster's display name) as a fallback. "broadcasterUserName"/"channelName" are not
        // real Streamer.bot arguments on any platform and never matched anything.
        string channelName = First(Read("broadcastUserName"), Read("broadcastUsername"), Read("broadcastUser"));
${messageDeclarations}
        CPH.SetArgument("generatedCommandName", "${design.name}");
        CPH.SetArgument("generatedCommandPhrase", "${commandPhrase}");
        CPH.SetArgument("generatedCommandMinimumRole", "${design.minimumRole}");
        CPH.SetArgument("generatedCommandSource", commandSource);
        CPH.SetArgument("generatedCommandRawInput", rawInput);
        CPH.SetArgument("generatedCommandTarget", target);
        CPH.SetArgument("generatedCommandTwitchMessage", twitchMessage);
        CPH.SetArgument("generatedCommandYouTubeMessage", youtubeMessage);
        CPH.SetArgument("generatedCommandKickMessage", kickMessage);
        CPH.SetArgument("generatedCommandTikTokMessage", tiktokMessage);
${execution}
        return true;
    }

    private bool Has(string name) { return args.ContainsKey(name); }
    private string Read(string name) { object value; return args.TryGetValue(name, out value) && value != null ? Convert.ToString(value) ?? "" : ""; }
    private string First(params string[] values) { foreach (string value in values) if (!String.IsNullOrWhiteSpace(value)) return value; return ""; }
    private string FirstWord(string value) { if (String.IsNullOrWhiteSpace(value)) return ""; string[] parts = value.Trim().Split(new[] { ' ' }, 2); return parts[0]; }
    private string ExpandTemplate(string template, string user, string target, string input, string channel)
    {
        return (template ?? "").Replace("{user}", user ?? "").Replace("{target}", target ?? "").Replace("{input}", input ?? "").Replace("{channel}", channel ?? "");
    }
    private void SendToSource(string source, string message)
    {
        if (String.IsNullOrWhiteSpace(message)) return;
        CPH.SetArgument("generatedCommandResponseMessage", message);
        if (source == "twitch") CPH.SendMessage(message, true, true);
        else if (source == "youtube") CPH.SendYouTubeMessageToLatestMonitored(message, true, true);
        else if (source == "kick") CPH.SendKickMessage(message, true, true);
        else if (source == "tiktok") SendToTikFinity(message);
    }
    private void SendToTikFinity(string message)
    {
        CPH.SetArgument("message", message);
        args["message"] = message;
        CPH.WebsocketBroadcastJson(JsonConvert.SerializeObject(new { action = "sendChatbotMessage", args = args }));
    }
${customResponseMethod}}
`;
}

function commandSourceMask(platforms: readonly CommandPlatform[]): number {
  return platforms.reduce((result, platform) => (NATIVE_COMMAND_PLATFORMS as readonly string[]).includes(platform) ? result | COMMAND_SOURCE_BITS[platform as keyof typeof COMMAND_SOURCE_BITS] : result, 0);
}
function indentCustomScript(value: string): string { return value.split(/\r?\n/u).map((line) => `        ${line}`).join('\n'); }

function escapeCSharpString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\r', '\\r').replaceAll('\n', '\\n');
}
