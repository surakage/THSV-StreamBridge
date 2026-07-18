import { buildStreamerBotPackage, stableStreamerBotUuid } from '../services/streamerbot-package-builder.js';

export const COMMAND_GENERATION_PACKAGE_VERSION = '1.0.0';

const NAME_PATTERN = /^[a-z][a-z0-9-]*$/u;
const MAX_NAME_LENGTH = 64;
const MAX_ALIASES = 20;
const MAX_NOTE_LENGTH = 500;
const ROLES = ['viewer', 'subscriber', 'moderator', 'broadcaster'] as const;

export type CommandGenerationRole = typeof ROLES[number];

export interface CommandDesignInput {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly minimumRole?: string;
  readonly note?: string;
  readonly approvedByCreator: boolean;
}

export interface CommandDesign {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly minimumRole: CommandGenerationRole;
  readonly note: string;
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
  return { name, aliases, minimumRole: minimumRoleInput, note };
}

function isRole(value: string): value is CommandGenerationRole {
  return (ROLES as readonly string[]).includes(value);
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
  };
}

function normalizeCommandToken(value: string, field: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH || !NAME_PATTERN.test(trimmed)) {
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

function matchToken(proposed: readonly string[], liveToken: string): string | undefined {
  const lowerLive = liveToken.toLowerCase();
  return proposed.find((token) => token.toLowerCase() === lowerLive);
}

export interface GeneratedCommandPackage {
  readonly filename: string;
  readonly contentBase64: string;
  readonly actionId: string;
  readonly commandId: string;
  readonly sourceCode: string;
}

// Generates a package containing a minimal, fully reviewable stub action plus a best-effort
// native Command object. Streamer.bot's CommandData JSON field names are inferred from its own
// public changelog (camelCase to match every other field this export format already uses, since
// every existing package's action fields follow that same convention); the command-to-action
// trigger binding is deliberately not attempted, because no verified schema for it was found
// anywhere in Streamer.bot's public documentation. The generated command therefore always
// imports disabled, and the stub action's source tells the creator exactly what manual step
// remains. An incorrect guess here is inert — nothing fires until the creator opens the
// imported command in Streamer.bot's own editor and enables it. Whether Streamer.bot's importer
// accepts this shape at all is exactly what the wizard's verify-after-import step is for.
export function generateCommandPackage(design: CommandDesign): GeneratedCommandPackage {
  const actionName = `THSV Generated - ${design.name}`;
  const identitySeed = `wizard-generated:${design.name}`;
  const actionId = stableStreamerBotUuid(`${identitySeed}:action`);
  const commandId = stableStreamerBotUuid(`${identitySeed}:command`);
  const sourceCode = generateCommandActionSource(design);
  const contentBase64 = buildStreamerBotPackage(
    {
      name: actionName,
      author: 'THSV StreamBridge wizard',
      version: COMMAND_GENERATION_PACKAGE_VERSION,
      description: `Wizard-generated stub for the "${design.name}" command. Review the source before enabling.`,
      minimumStreamerBotVersion: '1.0.0',
      concurrent: true,
    },
    [{
      name: actionName,
      group: 'THSV StreamBridge / Generated',
      id: actionId,
      sourceSubActionId: stableStreamerBotUuid(`${identitySeed}:source`),
      sourceCode,
      stableIdentitySeed: identitySeed,
    }],
    [{
      id: commandId,
      name: design.name,
      group: 'THSV StreamBridge / Generated',
      enabled: false,
      commands: [design.name, ...design.aliases],
      caseSensitive: false,
      stableIdentitySeed: identitySeed,
    }],
  );
  return { filename: `thsv-generated-${design.name}.sb`, contentBase64, actionId, commandId, sourceCode };
}

function generateCommandActionSource(design: CommandDesign): string {
  const aliasList = design.aliases.length === 0 ? '(none)' : design.aliases.join(', ');
  const note = design.note.length === 0 ? '(none)' : design.note;
  return `using System;

public class CPHInline
{
    // Generated by the THSV StreamBridge setup wizard for the "${design.name}" command.
    // Aliases: ${aliasList}
    // Minimum role: ${design.minimumRole}
    // Creator note: ${note}
    //
    // This is a reviewable stub, not a finished response: it only exposes the command's
    // identity as arguments. Add your own sub-actions after it to decide what actually happens
    // (for example a native "Send Message" sub-action for your platform). The imported
    // "${design.name}" command starts disabled and unbound on purpose — open it in Streamer.bot,
    // point it at this action, review its settings, and enable it once you are satisfied.
    public bool Execute()
    {
        CPH.SetArgument("generatedCommandName", "${design.name}");
        CPH.SetArgument("generatedCommandMinimumRole", "${design.minimumRole}");
        return true;
    }
}
`;
}
