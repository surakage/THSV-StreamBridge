import { z } from 'zod';

export const rewardAdministrationRequestSchema = z.object({
  platform: z.enum(['twitch', 'kick']),
  operation: z.enum(['enable', 'disable', 'pause', 'unpause', 'fulfill', 'cancel']),
  rewardId: z.string().trim().min(1).max(256),
  redemptionId: z.string().trim().min(1).max(256).optional(),
  approvedByCreator: z.literal(true),
  requestId: z.uuid().optional(),
}).strict().superRefine((request, context) => {
  if (request.platform === 'kick') context.addIssue({ code: 'custom', path: ['operation'], message: 'Kick reward mutation controls are unavailable because Streamer.bot has not documented them.' });
  if ((request.operation === 'fulfill' || request.operation === 'cancel') && request.redemptionId === undefined) context.addIssue({ code: 'custom', path: ['redemptionId'], message: 'Redemption operations require redemptionId.' });
});

export type RewardAdministrationRequest = z.infer<typeof rewardAdministrationRequestSchema>;
