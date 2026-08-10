import type { NormalizedEvent } from '../../schemas/event.js';

export const MULTI_CHAT_CONTRACT_VERSION = '1.2.0';
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
  readonly fragments: readonly ChatMessageFragment[];
  readonly messageLength: number;
  readonly simulated: boolean;
}

export type ChatMessageFragment =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'emote'; readonly name: string; readonly imageUrl: string; readonly provider: string };

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
    fragments: normalizedChatFragments(event.payload['fragments'], message),
    messageLength: message.length,
    simulated: event.metadata.simulated,
  };
}

function normalizedChatFragments(raw: unknown, message: string): readonly ChatMessageFragment[] {
  if (!Array.isArray(raw)) return [{ type: 'text', text: message }];
  const fragments: ChatMessageFragment[] = [];
  for (const entry of raw.slice(0, 200)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const value = entry as Readonly<Record<string, unknown>>;
    if (value['type'] === 'text' && typeof value['text'] === 'string') {
      const text = value['text'].replace(/\p{Cc}+/gu, ' ');
      if (text.length > 0) fragments.push({ type: 'text', text });
    } else if (value['type'] === 'emote' && typeof value['name'] === 'string' && typeof value['imageUrl'] === 'string' && typeof value['provider'] === 'string' && trustedEmoteUrl(value['imageUrl'])) {
      fragments.push({ type: 'emote', name: value['name'].slice(0, 100), imageUrl: value['imageUrl'], provider: value['provider'].slice(0, 32) });
    }
  }
  return fragments.length > 0 ? fragments : [{ type: 'text', text: message }];
}

function trustedEmoteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['static-cdn.jtvnw.net', 'yt3.ggpht.com', 'yt3.googleusercontent.com', 'cdn.betterttv.net', 'cdn.frankerfacez.com', 'cdn.7tv.app', 'cdn.kick.com'].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}

export function normalizeChatPlainText(input: string): string {
  return input.replace(/[\p{Cc}\s]+/gu, ' ').trim();
}
