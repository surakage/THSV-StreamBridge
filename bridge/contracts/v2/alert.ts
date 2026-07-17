import { z } from 'zod';
import { CORE_CONTRACT_VERSION, actorV2Schema, channelV2Schema, platformIdSchema } from './common.js';

export const ALERT_TYPE_VALUES_V2 = ['follow', 'subscription', 'membership', 'gift-subscription', 'gift', 'donation', 'cheer', 'super-chat', 'super-sticker', 'raid', 'milestone', 'kick', 'share', 'like-milestone'] as const;
export const normalizedAlertEventV2Schema = z.object({
  contractVersion: z.literal(CORE_CONTRACT_VERSION), eventId: z.string().min(1).max(256), receivedAt: z.iso.datetime({ offset: true }), sequence: z.number().int().positive(), platform: platformIdSchema, channel: channelV2Schema, actor: actorV2Schema.optional(), alertType: z.enum(ALERT_TYPE_VALUES_V2),
  amount: z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/).optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional(), quantity: z.number().int().positive().max(1_000_000).optional(), itemName: z.string().max(500).optional(), tier: z.string().max(100).optional(), message: z.string().max(500).optional(), priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'), simulated: z.boolean(), verifiedTransport: z.boolean(), unverifiedFields: z.array(z.string().max(256)).max(100).default([]),
}).strict();
export type NormalizedAlertEventV2 = z.infer<typeof normalizedAlertEventV2Schema>;

