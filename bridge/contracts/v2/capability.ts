import { z } from 'zod';
import { CORE_CONTRACT_VERSION, platformIdSchema } from './common.js';

export const PLATFORM_CAPABILITY_IDS = [
  'chat.input', 'chat.output', 'commands', 'follows', 'subscriptions', 'gift-subscriptions',
  'raids', 'cheers', 'donations', 'gifts', 'moderation', 'stream-status',
  'channel-rewards.read', 'channel-rewards.redemptions', 'channel-rewards.create',
  'channel-rewards.update', 'channel-rewards.fulfill', 'channel-rewards.cancel',
] as const;

export const platformCapabilityIdSchema = z.enum(PLATFORM_CAPABILITY_IDS);
export const capabilitySupportSchema = z.object({
  supported: z.boolean(),
  verification: z.enum(['verified', 'unverified', 'unsupported']),
  reason: z.string().min(1).max(500).optional(),
}).strict().superRefine((value, context) => {
  if (!value.supported && value.reason === undefined) context.addIssue({ code: 'custom', path: ['reason'], message: 'Unavailable capabilities require a reason.' });
  if (value.supported && value.verification === 'unsupported') context.addIssue({ code: 'custom', path: ['verification'], message: 'A supported capability cannot be marked unsupported.' });
});

export const platformCapabilityReportSchema = z.object({
  contractVersion: z.literal(CORE_CONTRACT_VERSION),
  platform: platformIdSchema,
  adapterId: z.string().min(1).max(100),
  reportedAt: z.iso.datetime({ offset: true }),
  capabilities: z.record(platformCapabilityIdSchema, capabilitySupportSchema),
  limitations: z.array(z.string().min(1).max(500)).max(100).default([]),
}).strict();

export type PlatformCapabilityId = z.infer<typeof platformCapabilityIdSchema>;
export type PlatformCapabilityReport = z.infer<typeof platformCapabilityReportSchema>;

