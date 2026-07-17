export const SPEAKER_ORCHESTRATION_CONTRACT_VERSION = '1.0.0';
export const SPEAKER_MAX_MESSAGE_LENGTH = 500;
export const SPEAKER_MAX_VOICE_ALIAS_LENGTH = 100;

export type SpeakerOperation = 'speak' | 'stop' | 'pause' | 'resume' | 'clear';
export type SpeakerTextSource = 'creator-template' | 'creator-approved';

export interface SpeakerOrchestrationInput {
  readonly operation: SpeakerOperation;
  readonly approvedByCreator: boolean;
  readonly simulated: boolean;
  readonly allowSimulated?: boolean;
  readonly dryRun?: boolean;
  readonly requestId?: string;
  readonly voiceAlias?: string;
  readonly message?: string;
  readonly textSource?: SpeakerTextSource | 'raw-event';
}

export interface SpeakerOrchestrationRequest {
  readonly contractVersion: typeof SPEAKER_ORCHESTRATION_CONTRACT_VERSION;
  readonly operation: SpeakerOperation;
  readonly requestId?: string;
  readonly transport: 'speakerbot-cph' | 'speakerbot-udp';
  readonly shouldDispatch: boolean;
  readonly dryRun: boolean;
  readonly simulated: boolean;
  readonly badWordFilter: true;
  readonly voiceAlias?: string;
  readonly message?: string;
  readonly textSource?: SpeakerTextSource;
}

export class InvalidSpeakerOrchestrationError extends Error {}

export function createSpeakerOrchestrationRequest(input: SpeakerOrchestrationInput): SpeakerOrchestrationRequest {
  if (!input.approvedByCreator) throw new InvalidSpeakerOrchestrationError('Speaker.bot operations require explicit creator approval.');
  if (input.simulated && input.allowSimulated !== true) {
    throw new InvalidSpeakerOrchestrationError('Simulated events are denied unless speakerAllowSimulated is explicitly enabled.');
  }
  const requestId = input.requestId === undefined ? undefined : normalizeIdentifier(input.requestId, 'requestId', 128);
  const dryRun = input.dryRun === true;

  if (input.operation === 'speak') {
    if (input.textSource === undefined || input.textSource === 'raw-event') {
      throw new InvalidSpeakerOrchestrationError('Speech text must come from a creator template or an explicitly creator-approved source.');
    }
    if (input.voiceAlias === undefined) throw new InvalidSpeakerOrchestrationError('Speech requires a creator-configured voice alias.');
    if (input.message === undefined) throw new InvalidSpeakerOrchestrationError('Speech requires a message.');
    return {
      contractVersion: SPEAKER_ORCHESTRATION_CONTRACT_VERSION,
      operation: input.operation,
      ...(requestId === undefined ? {} : { requestId }),
      transport: 'speakerbot-cph',
      shouldDispatch: !dryRun,
      dryRun,
      simulated: input.simulated,
      badWordFilter: true,
      voiceAlias: normalizePlainText(input.voiceAlias, 'voiceAlias', SPEAKER_MAX_VOICE_ALIAS_LENGTH),
      message: normalizePlainText(input.message, 'message', SPEAKER_MAX_MESSAGE_LENGTH),
      textSource: input.textSource,
    };
  }

  if (input.voiceAlias !== undefined || input.message !== undefined || input.textSource !== undefined) {
    throw new InvalidSpeakerOrchestrationError(`${input.operation} does not accept speech text or a voice alias.`);
  }
  return {
    contractVersion: SPEAKER_ORCHESTRATION_CONTRACT_VERSION,
    operation: input.operation,
    ...(requestId === undefined ? {} : { requestId }),
    transport: 'speakerbot-udp',
    shouldDispatch: !dryRun,
    dryRun,
    simulated: input.simulated,
    badWordFilter: true,
  };
}

function normalizeIdentifier(input: string, field: string, maximum: number): string {
  const value = input.trim();
  if (value.length === 0 || value.length > maximum || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)) {
    throw new InvalidSpeakerOrchestrationError(`${field} must be a bounded identifier.`);
  }
  return value;
}

function normalizePlainText(input: string, field: string, maximum: number): string {
  const value = input.replace(/[\p{Cc}\s]+/gu, ' ').trim();
  if (value.length === 0) throw new InvalidSpeakerOrchestrationError(`${field} is empty after normalization.`);
  if (value.length > maximum) throw new InvalidSpeakerOrchestrationError(`${field} exceeds ${String(maximum)} characters.`);
  return value;
}
