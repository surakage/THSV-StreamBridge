import { z } from 'zod';
import { CORE_CONTRACT_VERSION, jsonValueV2Schema, platformIdSchema } from './common.js';

export const timedActionExecutionV2Schema = z.object({
  contractVersion: z.literal(CORE_CONTRACT_VERSION), eventId: z.string().min(1).max(256), timerId: z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/), scheduledAt: z.iso.datetime({ offset: true }), firedAt: z.iso.datetime({ offset: true }), intervalMode: z.enum(['fixed', 'random']), selectedMessage: z.string().max(500).optional(), selectedMessages: z.partialRecord(z.enum(['twitch', 'youtube', 'kick', 'tiktok']), z.string().min(1).max(500)).default({}), targetPlatforms: z.array(platformIdSchema).max(16).default([]), deliveryPlatforms: z.array(z.enum(['twitch', 'youtube', 'kick', 'tiktok'])).max(4).default([]), targetProvider: z.enum(['event-only', 'run-existing-action']), actionId: z.uuid().optional(), actionName: z.string().min(1).max(200).optional(), creatorPayload: z.record(z.string(), jsonValueV2Schema).default({}), simulated: z.boolean(),
}).strict();
export type TimedActionExecutionV2 = z.infer<typeof timedActionExecutionV2Schema>;
