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
const MAX_RESPONSE_LENGTH = 500;
const MAX_BATCH_SIZE = 20;
const ROLES = ['viewer', 'subscriber', 'moderator', 'broadcaster'] as const;
const DELIVERY_PLATFORMS = ['twitch', 'youtube', 'kick', 'tiktok'] as const;

export type CommandGenerationRole = typeof ROLES[number];

export interface CommandDesignInput {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly minimumRole?: string;
  readonly note?: string;
  readonly actionName?: string;
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
  readonly responseMessage: string;
  readonly deliveryPlatforms: readonly (typeof DELIVERY_PLATFORMS)[number][];
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
  const actionName = (input.actionName ?? `THSV Generated - ${name}`).trim();
  if (actionName.length === 0 || actionName.length > MAX_ACTION_NAME_LENGTH || /[\r\n]/u.test(actionName)) throw new InvalidCommandDesignError(`actionName must be a single line of 1-${String(MAX_ACTION_NAME_LENGTH)} characters.`);
  const responseMessage = (input.responseMessage ?? '').trim();
  if (responseMessage.length > MAX_RESPONSE_LENGTH || /[\p{Cc}]/u.test(responseMessage)) throw new InvalidCommandDesignError(`responseMessage must be plain text of at most ${String(MAX_RESPONSE_LENGTH)} characters.`);
  const rawPlatforms = input.deliveryPlatforms ?? [];
  if (!rawPlatforms.every((platform): platform is (typeof DELIVERY_PLATFORMS)[number] => (DELIVERY_PLATFORMS as readonly string[]).includes(platform))) throw new InvalidCommandDesignError(`deliveryPlatforms must contain only ${DELIVERY_PLATFORMS.join(', ')}.`);
  const deliveryPlatforms = [...new Set(rawPlatforms)] as (typeof DELIVERY_PLATFORMS)[number][];
  if (responseMessage.length === 0 && deliveryPlatforms.length > 0) throw new InvalidCommandDesignError('responseMessage is required when delivery platforms are selected.');
  return { name, aliases, minimumRole: minimumRoleInput, note, actionName, responseMessage, deliveryPlatforms };
}

function isRole(value: string): value is CommandGenerationRole {
  return (ROLES as readonly string[]).includes(value);
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
  return {
    name: record['name'],
    approvedByCreator: record['approvedByCreator'],
    ...(aliases === undefined ? {} : { aliases }),
    ...(typeof record['minimumRole'] === 'string' ? { minimumRole: record['minimumRole'] } : {}),
    ...(typeof record['note'] === 'string' ? { note: record['note'] } : {}),
    ...(typeof record['actionName'] === 'string' ? { actionName: record['actionName'] } : {}),
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
// export (a manually created command bound to a manually created action). That export also
// revealed the command's trigger phrase is a single string (`command`, prefix included) rather
// than a list, so aliases designed here are used only for the collision check, not embedded in
// the generated command — each stub action's source tells the creator to add them through
// Streamer.bot's own Command(s) box after import, the same well-understood native step every
// Streamer.bot user already knows. Every command still imports disabled: a handful of fields on
// it (bot/message filtering toggles, exact `sources` bitmask beyond the one confirmed value)
// remain unverified, and importing disabled keeps a wrong guess on those inert until the creator
// reviews and enables it. Multiple actions in one package is the same pattern
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
    const sourceCode = generateCommandActionSource(design, commandPhrase);
    actionInputs.push({
      name: actionName,
      group: 'THSV StreamBridge / Generated',
      id: actionId,
      sourceSubActionId: stableStreamerBotUuid(`${identitySeed}:source`),
      sourceCode,
      stableIdentitySeed: identitySeed,
      triggers: [{ commandId, id: triggerId, stableIdentitySeed: identitySeed }],
    });
    commandInputs.push({
      id: commandId,
      name: design.name,
      command: commandPhrase,
      enabled: false,
      caseSensitive: false,
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
  const aliasList = design.aliases.length === 0 ? '(none — add these in Streamer.bot\'s Command(s) box after import)' : design.aliases.join(', ');
  const note = design.note.length === 0 ? '(none)' : design.note;
  const sends = design.responseMessage.length === 0 ? '        // Add creator-owned sub-actions here.' : design.deliveryPlatforms.map((platform) => ({
    twitch: '        CPH.SendMessage(responseMessage, true, true);',
    youtube: '        CPH.SendYouTubeMessageToLatestMonitored(responseMessage, true, true);',
    kick: '        CPH.SendKickMessage(responseMessage, true, true);',
    tiktok: '        CPH.WebsocketBroadcastJson("{\\"action\\":\\"sendChatbotMessage\\",\\"args\\":{\\"message\\":" + Newtonsoft.Json.JsonConvert.ToString(responseMessage) + "}}");',
  })[platform]).join('\n');
  return `using System;

public class CPHInline
{
    // Generated by the THSV StreamBridge setup wizard for the "${commandPhrase}" command.
    // Aliases (not embedded in the import — add them yourself): ${aliasList}
    // Minimum role: ${design.minimumRole}
    // Creator note: ${note}
    //
    // The response below is creator-authored and is sent only to the platforms selected in
    // the wizard. It is also exposed as generatedCommandResponseMessage for later sub-actions. The imported
    // "${commandPhrase}" command starts disabled on purpose — open it in Streamer.bot, review
    // its settings (permissions, sources, aliases), and enable it once you are satisfied.
    public bool Execute()
    {
        string responseMessage = "${escapeCSharpString(design.responseMessage)}";
        CPH.SetArgument("generatedCommandName", "${design.name}");
        CPH.SetArgument("generatedCommandPhrase", "${commandPhrase}");
        CPH.SetArgument("generatedCommandMinimumRole", "${design.minimumRole}");
        CPH.SetArgument("generatedCommandResponseMessage", responseMessage);
${sends}
        return true;
    }
}
`;
}

function escapeCSharpString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\r', '\\r').replaceAll('\n', '\\n');
}
