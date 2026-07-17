import { z } from 'zod';
import { CORE_CONTRACT_VERSION, actorV2Schema, channelV2Schema, platformIdSchema } from './common.js';

export const rewardRedemptionV2Schema = z.object({
  contractVersion: z.literal(CORE_CONTRACT_VERSION), eventId: z.string().min(1).max(256), sourceEventId: z.string().min(1).max(256), receivedAt: z.iso.datetime({ offset: true }), platform: platformIdSchema, channel: channelV2Schema, actor: actorV2Schema,
  reward: z.object({ id: z.string().min(1).max(256), title: z.string().min(1).max(256), cost: z.number().int().nonnegative().max(2_147_483_647), requiresUserInput: z.boolean().default(false), input: z.string().max(2_000).optional() }).strict(),
  redemptionId: z.string().min(1).max(256), supportedOperations: z.array(z.enum(['fulfill', 'cancel'])).max(2).default([]), simulated: z.boolean(), verifiedTransport: z.boolean(),
}).strict();
export type RewardRedemptionV2 = z.infer<typeof rewardRedemptionV2Schema>;

