export const COMMAND_ADMINISTRATION_CONTRACT_VERSION = '1.0.0';
export const COMMAND_ADMINISTRATION_MAX_ID_LENGTH = 128;

export type CommandAdministrationOperation = 'enable' | 'disable';

export interface CommandAdministrationInput {
  // Deliberately untyped as a bare string, not CommandAdministrationOperation: this is the
  // boundary where a wizard HTTP handler's parsed request body first reaches domain logic, and
  // the runtime check below must stay meaningful regardless of what the caller claims the type
  // is — the same reason readMinimumRole/IsRole-style validators elsewhere in this project
  // accept a loose input type and narrow it themselves rather than trusting the caller's cast.
  readonly operation: string;
  readonly commandId: string;
  readonly approvedByCreator: boolean;
  readonly requestId?: string;
}

export interface CommandAdministrationRequest {
  readonly contractVersion: typeof COMMAND_ADMINISTRATION_CONTRACT_VERSION;
  readonly operation: CommandAdministrationOperation;
  readonly commandId: string;
  readonly requestId?: string;
}

export class InvalidCommandAdministrationError extends Error {}

// Mirrors the same creator-approval gate Speaker Orchestration established for any operation
// that mutates Streamer.bot state: the wizard must have already confirmed the operator wants
// this specific change before a request is even built, not just before it is dispatched.
export function createCommandAdministrationRequest(input: CommandAdministrationInput): CommandAdministrationRequest {
  if (!input.approvedByCreator) throw new InvalidCommandAdministrationError('Command administration operations require explicit creator approval.');
  if (input.operation !== 'enable' && input.operation !== 'disable') throw new InvalidCommandAdministrationError('operation must be enable or disable.');
  const commandId = input.commandId.trim();
  if (commandId.length === 0 || commandId.length > COMMAND_ADMINISTRATION_MAX_ID_LENGTH) {
    throw new InvalidCommandAdministrationError(`commandId must be a non-empty Streamer.bot command ID of at most ${String(COMMAND_ADMINISTRATION_MAX_ID_LENGTH)} characters.`);
  }
  const requestId = input.requestId === undefined ? undefined : normalizeRequestId(input.requestId);
  return {
    contractVersion: COMMAND_ADMINISTRATION_CONTRACT_VERSION,
    operation: input.operation,
    commandId,
    ...(requestId === undefined ? {} : { requestId }),
  };
}

function normalizeRequestId(input: string): string {
  const value = input.trim();
  if (value.length === 0 || value.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)) {
    throw new InvalidCommandAdministrationError('requestId must be a bounded identifier.');
  }
  return value;
}
