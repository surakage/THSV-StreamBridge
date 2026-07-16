import type { JsonValue, NormalizedEvent } from '../../schemas/event.js';

export const MULTI_ALERTS_CONTRACT_VERSION = '1.0.0';
export const MULTI_ALERTS_MAX_TEXT_LENGTH = 500;

export type MultiAlertType = 'follow' | 'subscription' | 'membership' | 'gift-subscription' | 'gift' | 'donation' | 'cheer' | 'super-chat' | 'raid' | 'milestone';

const ALERT_TYPES: Readonly<Partial<Record<string, MultiAlertType>>> = {
  'channel.follow': 'follow',
  'channel.subscription': 'subscription',
  'channel.membership': 'membership',
  'channel.gift-subscription': 'gift-subscription',
  'engagement.gift': 'gift',
  'engagement.donation': 'donation',
  'engagement.cheer': 'cheer',
  'engagement.super-chat': 'super-chat',
  'channel.raid': 'raid',
  'engagement.milestone': 'milestone',
};

export interface MultiAlert {
  readonly contractVersion: typeof MULTI_ALERTS_CONTRACT_VERSION;
  readonly eventId: string;
  readonly receivedAt: string;
  readonly sequence: number;
  readonly visibility: 'public';
  readonly alertType: MultiAlertType;
  readonly platform: string;
  readonly channel: { readonly id?: string; readonly name: string };
  readonly actor?: {
    readonly id?: string;
    readonly name: string;
    readonly displayName: string;
    readonly actorType: 'human' | 'bot';
    readonly roles: readonly string[];
  };
  readonly amount?: string;
  readonly currency?: string;
  readonly quantity?: number;
  readonly itemName?: string;
  readonly tier?: string;
  readonly message?: string;
  readonly metric?: string;
  readonly value?: number;
  readonly simulated: boolean;
  readonly verifiedTransport: boolean;
  readonly unverifiedFields: readonly string[];
}

export class InvalidMultiAlertError extends Error {}

export function projectMultiAlert(event: NormalizedEvent): MultiAlert | undefined {
  const alertType = ALERT_TYPES[event.eventType];
  if (alertType === undefined) return undefined;
  const sequence = event.metadata.bridgeSequence;
  if (sequence === undefined) throw new InvalidMultiAlertError(`${event.eventType} requires a bridge-assigned sequence.`);
  if (alertType !== 'milestone' && event.user === undefined) throw new InvalidMultiAlertError(`${event.eventType} requires user data.`);
  if (event.user?.actorType === 'system') throw new InvalidMultiAlertError(`${event.eventType} cannot use a system actor.`);

  const amount = readOptionalAmount(event.payload);
  const currency = readOptionalCurrency(event.payload);
  const quantity = readOptionalPositiveInteger(event.payload, 'quantity');
  const itemName = readOptionalText(event.payload, 'itemName');
  const tier = readOptionalText(event.payload, 'tier');
  const message = readOptionalText(event.payload, 'message');
  const metric = readOptionalIdentifier(event.payload, 'metric');
  const value = readOptionalNonNegativeInteger(event.payload, 'value');

  if ((alertType === 'donation' || alertType === 'super-chat') && (amount === undefined || currency === undefined)) {
    throw new InvalidMultiAlertError(`${event.eventType} requires decimal-string payload.amount and ISO payload.currency.`);
  }
  if (alertType === 'gift' && (itemName === undefined || quantity === undefined)) {
    throw new InvalidMultiAlertError('engagement.gift requires payload.itemName and positive integer payload.quantity.');
  }
  if ((alertType === 'gift-subscription' || alertType === 'raid') && quantity === undefined) {
    throw new InvalidMultiAlertError(`${event.eventType} requires positive integer payload.quantity.`);
  }
  if (alertType === 'cheer' && quantity === undefined && amount === undefined) {
    throw new InvalidMultiAlertError('engagement.cheer requires payload.quantity or payload.amount.');
  }
  if (alertType === 'milestone' && (metric === undefined || value === undefined)) {
    throw new InvalidMultiAlertError('engagement.milestone requires payload.metric and non-negative integer payload.value.');
  }

  const unverifiedFields = event.metadata.unverifiedFields ?? [];
  return {
    contractVersion: MULTI_ALERTS_CONTRACT_VERSION,
    eventId: event.eventId,
    receivedAt: event.receivedAt,
    sequence,
    visibility: 'public',
    alertType,
    platform: event.platform,
    channel: { ...(event.channel.id === undefined ? {} : { id: event.channel.id }), name: event.channel.name },
    ...(event.user === undefined ? {} : { actor: {
      ...(event.user.id === undefined ? {} : { id: event.user.id }),
      name: event.user.name,
      displayName: event.user.displayName ?? event.user.name,
      actorType: event.user.actorType,
      roles: event.user.roles,
    } }),
    ...(amount === undefined ? {} : { amount }),
    ...(currency === undefined ? {} : { currency }),
    ...(quantity === undefined ? {} : { quantity }),
    ...(itemName === undefined ? {} : { itemName }),
    ...(tier === undefined ? {} : { tier }),
    ...(message === undefined ? {} : { message }),
    ...(metric === undefined ? {} : { metric }),
    ...(value === undefined ? {} : { value }),
    simulated: event.metadata.simulated,
    verifiedTransport: unverifiedFields.length === 0,
    unverifiedFields,
  };
}

export function normalizeAlertPlainText(input: string): string {
  return input.replace(/[\p{Cc}\s]+/gu, ' ').trim();
}

function readOptionalAmount(payload: Readonly<Record<string, JsonValue>>): string | undefined {
  const value = payload['amount'];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/u.test(value)) {
    throw new InvalidMultiAlertError('payload.amount must be a non-negative decimal string with at most 12 integer and 6 fractional digits.');
  }
  return value;
}

function readOptionalCurrency(payload: Readonly<Record<string, JsonValue>>): string | undefined {
  const value = payload['currency'];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[A-Z]{3}$/u.test(value)) throw new InvalidMultiAlertError('payload.currency must be an uppercase three-letter ISO code.');
  return value;
}

function readOptionalPositiveInteger(payload: Readonly<Record<string, JsonValue>>, key: string): number | undefined {
  const value = payload[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new InvalidMultiAlertError(`payload.${key} must be a positive safe integer.`);
  return value;
}

function readOptionalNonNegativeInteger(payload: Readonly<Record<string, JsonValue>>, key: string): number | undefined {
  const value = payload[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new InvalidMultiAlertError(`payload.${key} must be a non-negative safe integer.`);
  return value;
}

function readOptionalText(payload: Readonly<Record<string, JsonValue>>, key: string): string | undefined {
  const value = payload[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new InvalidMultiAlertError(`payload.${key} must be a string.`);
  const normalized = normalizeAlertPlainText(value);
  if (normalized.length === 0) throw new InvalidMultiAlertError(`payload.${key} is empty after normalization.`);
  if (normalized.length > MULTI_ALERTS_MAX_TEXT_LENGTH) throw new InvalidMultiAlertError(`payload.${key} exceeds ${String(MULTI_ALERTS_MAX_TEXT_LENGTH)} characters.`);
  return normalized;
}

function readOptionalIdentifier(payload: Readonly<Record<string, JsonValue>>, key: string): string | undefined {
  const value = payload[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/u.test(value)) throw new InvalidMultiAlertError(`payload.${key} must be a lowercase identifier.`);
  return value;
}
