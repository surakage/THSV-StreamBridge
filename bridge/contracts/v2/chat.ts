import { z } from 'zod';
import { CORE_CONTRACT_VERSION, actorV2Schema, channelV2Schema, platformIdSchema } from './common.js';

export const normalizedChatMessageV2Schema = z.object({
  contractVersion: z.literal(CORE_CONTRACT_VERSION), eventId: z.string().min(1).max(256), receivedAt: z.iso.datetime({ offset: true }), sequence: z.number().int().positive(),
  visibility: z.enum(['public', 'private', 'operator']), platform: platformIdSchema, channel: channelV2Schema, actor: actorV2Schema,
  message: z.string().min(1).max(2_000),
  reply: z.object({ eventId: z.string().min(1).max(256).optional(), actorName: z.string().min(1).max(256).optional(), excerpt: z.string().max(500).optional() }).strict().optional(),
  deleted: z.boolean().default(false), deletionReason: z.string().max(500).optional(), simulated: z.boolean(),
}).strict();
export type NormalizedChatMessageV2 = z.infer<typeof normalizedChatMessageV2Schema>;

