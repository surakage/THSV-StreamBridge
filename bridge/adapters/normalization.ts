import { randomUUID } from 'node:crypto';
import type { Capability } from '../../schemas/config.js';
import { normalizedEventSchema, type EventType, type JsonValue, type NormalizedEvent } from '../../schemas/event.js';

export interface EventBuilderInput {
  readonly eventType: EventType;
  readonly platform: string;
  readonly adapter: string;
  readonly sourceEventName: string;
  readonly sourceEventId?: string;
  readonly channel: NormalizedEvent['channel'];
  readonly user?: NormalizedEvent['user'];
  readonly payload?: Readonly<Record<string, JsonValue>>;
  readonly simulated?: boolean;
  readonly unverifiedFields?: readonly string[];
  readonly receivedAt?: string;
}

export function buildNormalizedEvent(input: EventBuilderInput): NormalizedEvent {
  return normalizedEventSchema.parse({
    schemaVersion: '1.0.0',
    eventId: input.sourceEventId ?? randomUUID(),
    eventType: input.eventType,
    platform: input.platform,
    source: { adapter: input.adapter, eventName: input.sourceEventName, ...(input.sourceEventId === undefined ? {} : { eventId: input.sourceEventId }) },
    receivedAt: input.receivedAt ?? new Date().toISOString(),
    channel: input.channel,
    ...(input.user === undefined ? {} : { user: input.user }),
    payload: input.payload ?? {},
    metadata: {
      simulated: input.simulated ?? false,
      ...(input.unverifiedFields === undefined ? {} : { unverifiedFields: [...input.unverifiedFields] }),
    },
  });
}

export function enforceSimulationIdentity(input: unknown, adapter: string): unknown {
  if (!isRecord(input)) return input;
  const source = isRecord(input['source']) ? input['source'] : {};
  const metadata = isRecord(input['metadata']) ? input['metadata'] : {};
  return { ...input, source: { ...source, adapter }, metadata: { ...metadata, simulated: true } };
}

export function assertAdapterCapability(eventType: EventType, capabilities: readonly Capability[]): void {
  const required = capabilityForEvent(eventType);
  if (required !== undefined && !capabilities.includes(required)) throw new Error(`Adapter does not declare required capability ${required} for ${eventType}`);
}

function capabilityForEvent(eventType: EventType): Capability | undefined {
  if (['chat.message', 'chat.private-message', 'chat.system-message', 'command.received', 'command.private-received', 'operator.command-received'].includes(eventType)) return 'chatInput';
  if (eventType === 'channel.follow') return 'follows';
  if (['channel.subscription', 'channel.membership', 'channel.gift-subscription'].includes(eventType)) return 'subscriptions';
  if (eventType === 'engagement.gift') return 'gifts';
  if (['engagement.donation', 'engagement.cheer', 'engagement.super-chat'].includes(eventType)) return 'donations';
  if (eventType === 'channel.raid') return 'raids';
  if (eventType === 'moderation.action') return 'moderation';
  if (eventType === 'engagement.milestone') return 'engagement';
  if (['stream.online', 'stream.offline'].includes(eventType)) return 'channelUpdates';
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
