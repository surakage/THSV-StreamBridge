import { z } from 'zod';

export const STANDARD_PLATFORM_VALUES = [
  'twitch',
  'youtube',
  'kick',
  'tiktok',
  'facebook',
  'streamerbot',
  'system',
] as const;

export const EVENT_TYPE_VALUES = [
  'chat.message',
  'chat.private-message',
  'chat.system-message',
  'operator.message',
  'command.received',
  'command.private-received',
  'operator.command-received',
  'channel.follow',
  'channel.subscription',
  'channel.membership',
  'channel.gift-subscription',
  'engagement.gift',
  'engagement.donation',
  'engagement.cheer',
  'engagement.super-chat',
  'channel.raid',
  'engagement.milestone',
  'moderation.action',
  'stream.online',
  'stream.offline',
  'system.custom',
  'system.timed',
] as const;

export const PUBLIC_ALERT_EVENT_TYPE_VALUES = [
  'channel.follow',
  'channel.subscription',
  'channel.membership',
  'channel.gift-subscription',
  'engagement.gift',
  'engagement.donation',
  'engagement.cheer',
  'engagement.super-chat',
  'channel.raid',
  'engagement.milestone',
] as const;

const namespacedIdentifierSchema = z.string().min(3).max(128).regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/);
export const platformSchema = z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/);
export const eventTypeSchema = z.union([z.enum(EVENT_TYPE_VALUES), namespacedIdentifierSchema]);

const jsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type JsonValue = z.infer<typeof jsonPrimitiveSchema> | JsonValue[] | { [key: string]: JsonValue };
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([jsonPrimitiveSchema, z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);

const httpsUrlSchema = z.url().max(2_048).refine((value) => new URL(value).protocol === 'https:', 'URL must use HTTPS');
const presentationBadgeSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/),
  label: z.string().min(1).max(64),
  iconUrl: httpsUrlSchema.optional(),
}).strict();

export const normalizedEventSchema = z
  .object({
    schemaVersion: z.literal('1.0.0'),
    eventId: z.string().min(1).max(256),
    eventType: eventTypeSchema,
    platform: platformSchema,
    source: z
      .object({
        adapter: z.string().min(1).max(100),
        eventId: z.string().min(1).max(256).optional(),
        eventName: z.string().min(1).max(100),
      })
      .strict(),
    receivedAt: z.iso.datetime({ offset: true }),
    channel: z
      .object({
        id: z.string().max(256).optional(),
        name: z.string().min(1).max(256),
      })
      .strict(),
    user: z
      .object({
        id: z.string().max(256).optional(),
        name: z.string().min(1).max(256),
        displayName: z.string().min(1).max(256).optional(),
        actorType: z.enum(['human', 'bot', 'system']).default('human'),
        roles: z.array(z.string().max(64)).max(32).default([]),
        avatarUrl: httpsUrlSchema.optional(),
        nameColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        badges: z.array(presentationBadgeSchema).max(16).optional(),
      })
      .strict()
      .optional(),
    payload: z.record(z.string(), jsonValueSchema),
    metadata: z
      .object({
        correlationId: z.string().max(256).optional(),
        bridgeSequence: z.number().int().positive().optional(),
        simulated: z.boolean().default(false),
        unverifiedFields: z.array(z.string().max(256)).max(100).optional(),
        rawPayload: jsonValueSchema.optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((event, context) => {
    if ((PUBLIC_ALERT_EVENT_TYPE_VALUES as readonly string[]).includes(event.eventType) && event.source.eventId === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['source', 'eventId'],
        message: 'Public alert events require a stable source event ID so legitimate repeated alerts are not deduplicated by payload fingerprint.',
      });
    }
  });

export type NormalizedEvent = z.infer<typeof normalizedEventSchema>;
export type Platform = string;
export type EventType = string;
