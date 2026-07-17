import { z } from 'zod';
import { CORE_CONTRACT_VERSION, actorV2Schema, channelV2Schema, jsonValueV2Schema, platformIdSchema } from './common.js';

export const normalizedCommandEventV2Schema = z.object({
  contractVersion: z.literal(CORE_CONTRACT_VERSION), eventId: z.string().min(1).max(256), receivedAt: z.iso.datetime({ offset: true }), sequence: z.number().int().positive(),
  visibility: z.enum(['public', 'private', 'operator']), platform: platformIdSchema, channel: channelV2Schema, actor: actorV2Schema,
  command: z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/), invokedAs: z.string().min(1).max(64), arguments: z.array(z.string().max(256)).max(32), rawInput: z.string().max(500),
  authorized: z.boolean(), authorizationReason: z.string().min(1).max(500), actionId: z.uuid().optional(), responseData: z.record(z.string(), jsonValueV2Schema).default({}), simulated: z.boolean(),
}).strict();
export type NormalizedCommandEventV2 = z.infer<typeof normalizedCommandEventV2Schema>;
