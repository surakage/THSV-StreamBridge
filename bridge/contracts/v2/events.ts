import { z } from 'zod';
import { CORE_CONTRACT_VERSION, actorV2Schema, channelV2Schema, identifierSchema, jsonValueV2Schema, platformIdSchema } from './common.js';

export const CORE_EVENT_TYPE_VALUES_V2 = [
  'chat.message', 'chat.private-message', 'chat.system-message', 'chat.deleted', 'operator.message',
  'command.received', 'command.private-received', 'operator.command-received',
  'channel.follow', 'channel.subscription', 'channel.membership', 'channel.gift-subscription',
  'engagement.gift', 'engagement.donation', 'engagement.cheer', 'engagement.super-chat',
  'engagement.super-sticker', 'channel.raid', 'engagement.milestone',
  'reward.redemption', 'moderation.action', 'stream.online', 'stream.offline', 'system.custom', 'system.timed',
] as const;

const extensionEventTypeSchema = z.string().min(3).max(128).regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){2,}$/);
export const coreEventTypeV2Schema = z.union([z.enum(CORE_EVENT_TYPE_VALUES_V2), extensionEventTypeSchema]);

const sourceIdRequired = new Set<string>([
  'channel.follow', 'channel.subscription', 'channel.membership', 'channel.gift-subscription',
  'engagement.gift', 'engagement.donation', 'engagement.cheer', 'engagement.super-chat',
  'engagement.super-sticker', 'channel.raid', 'engagement.milestone', 'reward.redemption',
]);

export const normalizedEventV2Schema = z.object({
  schemaVersion: z.literal(CORE_CONTRACT_VERSION),
  eventId: z.string().min(1).max(256),
  eventType: coreEventTypeV2Schema,
  platform: platformIdSchema,
  source: z.object({ adapterId: identifierSchema, eventId: z.string().min(1).max(256).optional(), eventName: z.string().min(1).max(100) }).strict(),
  receivedAt: z.iso.datetime({ offset: true }),
  channel: channelV2Schema,
  actor: actorV2Schema.optional(),
  payload: z.record(z.string(), jsonValueV2Schema),
  metadata: z.object({
    correlationId: z.string().max(256).optional(),
    bridgeSequence: z.number().int().positive().optional(),
    simulated: z.boolean().default(false),
    unverifiedFields: z.array(z.string().max(256)).max(100).default([]),
    rawPayload: jsonValueV2Schema.optional(),
  }).strict(),
}).strict().superRefine((event, context) => {
  if (sourceIdRequired.has(event.eventType) && event.source.eventId === undefined) context.addIssue({ code: 'custom', path: ['source', 'eventId'], message: 'This event type requires a stable source event ID.' });
});

export type NormalizedEventV2 = z.infer<typeof normalizedEventV2Schema>;

