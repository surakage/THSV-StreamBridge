import type { NormalizedEvent } from '../../schemas/event.js';

export const MULTI_CHAT_CONTRACT_VERSION = '1.1.0';
export const MULTI_CHAT_MAX_MESSAGE_LENGTH = 2_000;

export interface MultiChatMessage {
  readonly contractVersion: typeof MULTI_CHAT_CONTRACT_VERSION;
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
    readonly isBroadcaster: boolean;
    readonly isModerator: boolean;
    readonly isSubscriber: boolean;
    readonly isBot: boolean;
  };
  readonly message: string;
  readonly messageLength: number;
  readonly simulated: boolean;
}

export class InvalidMultiChatEventError extends Error {}

export function projectMultiChatMessage(event: NormalizedEvent): MultiChatMessage | undefined {
  if (event.eventType !== 'chat.message') return undefined;
  if (event.user === undefined) throw new InvalidMultiChatEventError('A chat.message event requires user data.');
  if (event.user.actorType === 'system') throw new InvalidMultiChatEventError('System messages must use chat.system-message, not public chat.message.');
  const sequence = event.metadata.bridgeSequence;
  if (sequence === undefined) throw new InvalidMultiChatEventError('A chat.message event requires a bridge-assigned sequence.');

  const rawMessage = event.payload['message'];
  if (typeof rawMessage !== 'string') throw new InvalidMultiChatEventError('chat.message payload.message must be a string.');

  const message = normalizeChatPlainText(rawMessage);
  if (message.length === 0) throw new InvalidMultiChatEventError('chat.message payload.message is empty after normalization.');
  if (message.length > MULTI_CHAT_MAX_MESSAGE_LENGTH) {
    throw new InvalidMultiChatEventError(`chat.message payload.message exceeds ${String(MULTI_CHAT_MAX_MESSAGE_LENGTH)} characters.`);
  }

  const normalizedRoles = new Set(event.user.roles.map((role) => role.toLowerCase()));
  return {
    contractVersion: MULTI_CHAT_CONTRACT_VERSION,
    eventId: event.eventId,
    receivedAt: event.receivedAt,
    sequence,
    visibility: 'public',
    platform: event.platform,
    channel: {
      ...(event.channel.id === undefined ? {} : { id: event.channel.id }),
      name: event.channel.name,
    },
    user: {
      ...(event.user.id === undefined ? {} : { id: event.user.id }),
      name: event.user.name,
      displayName: event.user.displayName ?? event.user.name,
      actorType: event.user.actorType,
      roles: event.user.roles,
      isBroadcaster: normalizedRoles.has('broadcaster'),
      isModerator: normalizedRoles.has('moderator') || normalizedRoles.has('mod'),
      isSubscriber: normalizedRoles.has('subscriber') || normalizedRoles.has('member'),
      isBot: event.user.actorType === 'bot',
    },
    message,
    messageLength: message.length,
    simulated: event.metadata.simulated,
  };
}

export function normalizeChatPlainText(input: string): string {
  return input.replace(/[\p{Cc}\s]+/gu, ' ').trim();
}
