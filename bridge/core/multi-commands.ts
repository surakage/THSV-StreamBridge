import { createHash } from 'node:crypto';
import type { CommandsConfig } from '../../schemas/config.js';
import type { JsonValue, NormalizedEvent } from '../../schemas/event.js';

export const MULTI_COMMANDS_CONTRACT_VERSION = '1.1.0';
export const MULTI_COMMANDS_MAX_INPUT_LENGTH = 500;
export const MULTI_COMMANDS_MAX_ARGUMENTS = 32;
export const MULTI_COMMANDS_MAX_ARGUMENT_LENGTH = 256;

export type CommandRole = 'viewer' | 'subscriber' | 'moderator' | 'broadcaster';

export interface CommandDefinition {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly minimumRole?: CommandRole;
  readonly allowBots?: boolean;
}

export interface ParsedCommand {
  readonly command: string;
  readonly invokedAs: string;
  readonly arguments: readonly string[];
  readonly rawInput: string;
  readonly prefix: string;
  readonly minimumRole: CommandRole;
  readonly allowBots: boolean;
}

export interface MultiCommandInvocation extends ParsedCommand {
  readonly contractVersion: typeof MULTI_COMMANDS_CONTRACT_VERSION;
  readonly eventId: string;
  readonly receivedAt: string;
  readonly sequence: number;
  readonly visibility: 'public';
  readonly platform: string;
  readonly channel: { readonly id?: string; readonly name: string };
  readonly user: {
    readonly id?: string;
    readonly name: string;
    readonly displayName: string;
    readonly actorType: 'human' | 'bot';
    readonly roles: readonly string[];
  };
  readonly isAlias: boolean;
  readonly authorized: boolean;
  readonly authorizationReason: string;
  readonly simulated: boolean;
}

export class InvalidMultiCommandError extends Error {}

export function parseCommandInput(
  input: string,
  definitions: readonly CommandDefinition[],
  prefix = '!',
): ParsedCommand | undefined {
  if (prefix.length !== 1 || /\s/u.test(prefix)) throw new InvalidMultiCommandError('Command prefix must be one non-whitespace character.');
  const normalized = normalizeCommandInput(input);
  if (!normalized.startsWith(prefix)) return undefined;
  if (normalized.length > MULTI_COMMANDS_MAX_INPUT_LENGTH) {
    throw new InvalidMultiCommandError(`Command input exceeds ${String(MULTI_COMMANDS_MAX_INPUT_LENGTH)} characters.`);
  }

  const tokens = tokenizeCommand(normalized.slice(prefix.length));
  if (tokens.length === 0) throw new InvalidMultiCommandError('Command name is missing.');
  const invokedAs = normalizeCommandName(tokens[0] ?? '');
  const index = buildCommandIndex(definitions);
  const definition = index.get(invokedAs);
  if (definition === undefined) return undefined;
  const args = tokens.slice(1);
  validateArguments(args);
  return {
    command: normalizeCommandName(definition.name),
    invokedAs,
    arguments: args,
    rawInput: normalized,
    prefix,
    minimumRole: definition.minimumRole ?? 'viewer',
    allowBots: definition.allowBots ?? false,
  };
}

export function projectMultiCommand(event: NormalizedEvent): MultiCommandInvocation | undefined {
  if (event.eventType !== 'command.received') return undefined;
  if (event.user === undefined) throw new InvalidMultiCommandError('A command.received event requires user data.');
  if (event.user.actorType === 'system') throw new InvalidMultiCommandError('System commands must use operator.command-received.');
  const sequence = event.metadata.bridgeSequence;
  if (sequence === undefined) throw new InvalidMultiCommandError('A command.received event requires a bridge-assigned sequence.');

  const command = readCommandName(event.payload, 'command');
  const invokedAs = readOptionalCommandName(event.payload, 'invokedAs') ?? command;
  const args = readArguments(event.payload);
  const rawInput = readOptionalString(event.payload, 'rawInput') ?? `!${invokedAs}${args.length === 0 ? '' : ` ${args.join(' ')}`}`;
  const prefix = readOptionalString(event.payload, 'prefix') ?? '!';
  if (prefix.length !== 1 || /\s/u.test(prefix)) throw new InvalidMultiCommandError('command.received payload.prefix must be one non-whitespace character.');
  if (rawInput.length > MULTI_COMMANDS_MAX_INPUT_LENGTH) throw new InvalidMultiCommandError(`command.received payload.rawInput exceeds ${String(MULTI_COMMANDS_MAX_INPUT_LENGTH)} characters.`);
  validateArguments(args);

  const minimumRole = readMinimumRole(event.payload);
  const allowBots = readOptionalBoolean(event.payload, 'allowBots') ?? false;
  const authorization = authorizeCommand(event.user.roles, event.user.actorType, minimumRole, allowBots);
  return {
    contractVersion: MULTI_COMMANDS_CONTRACT_VERSION,
    eventId: event.eventId,
    receivedAt: event.receivedAt,
    sequence,
    visibility: 'public',
    platform: event.platform,
    channel: { ...(event.channel.id === undefined ? {} : { id: event.channel.id }), name: event.channel.name },
    user: {
      ...(event.user.id === undefined ? {} : { id: event.user.id }),
      name: event.user.name,
      displayName: event.user.displayName ?? event.user.name,
      actorType: event.user.actorType,
      roles: event.user.roles,
    },
    command,
    invokedAs,
    arguments: args,
    rawInput,
    prefix,
    minimumRole,
    allowBots,
    isAlias: invokedAs !== command,
    authorized: authorization.authorized,
    authorizationReason: authorization.reason,
    simulated: event.metadata.simulated,
  };
}

export function deriveCommandEvent(event: NormalizedEvent, config: CommandsConfig): NormalizedEvent | undefined {
  if (!config.enabled || event.eventType !== 'chat.message' || event.user === undefined) return undefined;
  const message = event.payload['message'];
  if (typeof message !== 'string') return undefined;
  const parsed = parseCommandInput(message, config.definitions, config.prefix);
  if (parsed === undefined) return undefined;
  const identity = createHash('sha256').update(`${event.platform}\u0000${event.eventId}\u0000${parsed.command}`).digest('hex').slice(0, 40);
  return {
    schemaVersion: '1.0.0',
    eventId: `command-${identity}`,
    eventType: 'command.received',
    platform: event.platform,
    source: {
      adapter: event.source.adapter,
      eventId: `command-${identity}`,
      eventName: 'NormalizedCommand',
    },
    receivedAt: event.receivedAt,
    channel: event.channel,
    user: event.user,
    payload: {
      command: parsed.command,
      invokedAs: parsed.invokedAs,
      arguments: [...parsed.arguments],
      rawInput: parsed.rawInput,
      prefix: parsed.prefix,
      minimumRole: parsed.minimumRole,
      allowBots: parsed.allowBots,
    },
    metadata: {
      correlationId: event.metadata.correlationId ?? event.eventId,
      simulated: event.metadata.simulated,
      ...(event.metadata.unverifiedFields === undefined ? {} : { unverifiedFields: event.metadata.unverifiedFields }),
    },
  };
}

export function authorizeCommand(
  roles: readonly string[],
  actorType: 'human' | 'bot' | 'system',
  minimumRole: CommandRole,
  allowBots: boolean,
): { readonly authorized: boolean; readonly reason: string } {
  if (actorType === 'system') return { authorized: false, reason: 'system actors cannot invoke public commands' };
  if (actorType === 'bot' && !allowBots) return { authorized: false, reason: 'bot commands are disabled' };
  const actual = highestRole(roles);
  if (roleRank(actual) < roleRank(minimumRole)) return { authorized: false, reason: `requires ${minimumRole} role` };
  return { authorized: true, reason: 'authorized' };
}

function buildCommandIndex(definitions: readonly CommandDefinition[]): Map<string, CommandDefinition> {
  const index = new Map<string, CommandDefinition>();
  for (const definition of definitions) {
    const names = [definition.name, ...(definition.aliases ?? [])].map(normalizeCommandName);
    for (const name of names) {
      if (index.has(name)) throw new InvalidMultiCommandError(`Duplicate command name or alias: ${name}.`);
      index.set(name, definition);
    }
  }
  return index;
}

function tokenizeCommand(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  let escaping = false;
  for (const character of input.trim()) {
    if (escaping) { current += character; escaping = false; continue; }
    if (character === '\\') { escaping = true; continue; }
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
      else current += character;
      continue;
    }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (/\s/u.test(character)) {
      if (current.length > 0) { tokens.push(current); current = ''; }
      continue;
    }
    current += character;
  }
  if (escaping) throw new InvalidMultiCommandError('Command input ends with an incomplete escape.');
  if (quote !== undefined) throw new InvalidMultiCommandError('Command input contains an unclosed quote.');
  if (current.length > 0) tokens.push(current);
  return tokens;
}

function normalizeCommandInput(input: string): string {
  return input.replace(/[\p{Cc}]+/gu, ' ').trim();
}

function normalizeCommandName(value: string): string {
  const normalized = value.toLowerCase();
  if (!/^[a-z][a-z0-9-]{0,63}$/u.test(normalized)) throw new InvalidMultiCommandError(`Invalid command name: ${value || '(empty)'}.`);
  return normalized;
}

function validateArguments(args: readonly string[]): void {
  if (args.length > MULTI_COMMANDS_MAX_ARGUMENTS) throw new InvalidMultiCommandError(`Command has more than ${String(MULTI_COMMANDS_MAX_ARGUMENTS)} arguments.`);
  if (args.some((argument) => argument.length > MULTI_COMMANDS_MAX_ARGUMENT_LENGTH)) {
    throw new InvalidMultiCommandError(`A command argument exceeds ${String(MULTI_COMMANDS_MAX_ARGUMENT_LENGTH)} characters.`);
  }
}

function readCommandName(payload: Readonly<Record<string, JsonValue>>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string') throw new InvalidMultiCommandError(`command.received payload.${key} must be a string.`);
  return normalizeCommandName(value);
}

function readOptionalCommandName(payload: Readonly<Record<string, JsonValue>>, key: string): string | undefined {
  const value = payload[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new InvalidMultiCommandError(`command.received payload.${key} must be a string.`);
  return normalizeCommandName(value);
}

function readArguments(payload: Readonly<Record<string, JsonValue>>): string[] {
  const value = payload['arguments'];
  if (!Array.isArray(value) || value.some((argument) => typeof argument !== 'string')) {
    throw new InvalidMultiCommandError('command.received payload.arguments must be an array of strings.');
  }
  return [...value] as string[];
}

function readOptionalString(payload: Readonly<Record<string, JsonValue>>, key: string): string | undefined {
  const value = payload[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new InvalidMultiCommandError(`command.received payload.${key} must be a string.`);
  return value;
}

function readOptionalBoolean(payload: Readonly<Record<string, JsonValue>>, key: string): boolean | undefined {
  const value = payload[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new InvalidMultiCommandError(`command.received payload.${key} must be a boolean.`);
  return value;
}

function readMinimumRole(payload: Readonly<Record<string, JsonValue>>): CommandRole {
  const value = payload['minimumRole'] ?? 'viewer';
  if (value !== 'viewer' && value !== 'subscriber' && value !== 'moderator' && value !== 'broadcaster') {
    throw new InvalidMultiCommandError('command.received payload.minimumRole must be viewer, subscriber, moderator, or broadcaster.');
  }
  return value;
}

function highestRole(roles: readonly string[]): CommandRole {
  const normalized = new Set(roles.map((role) => role.toLowerCase()));
  if (normalized.has('broadcaster')) return 'broadcaster';
  if (normalized.has('moderator') || normalized.has('mod')) return 'moderator';
  if (normalized.has('subscriber') || normalized.has('member')) return 'subscriber';
  return 'viewer';
}

function roleRank(role: CommandRole): number {
  return { viewer: 0, subscriber: 1, moderator: 2, broadcaster: 3 }[role];
}
