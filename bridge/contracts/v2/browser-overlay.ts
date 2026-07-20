import { z } from 'zod';
import { CORE_CONTRACT_VERSION } from './common.js';
import { normalizedAlertEventV2Schema } from './alert.js';
import { normalizedChatMessageV2Schema } from './chat.js';
export const alertDisplayV2Schema = z.object({
  title: z.string().min(1).max(200), detail: z.string().max(500).optional(), durationMs: z.number().int().min(1_000).max(60_000),
  sound: z.object({ mode: z.enum(['none', 'chime']), volume: z.number().min(0).max(1) }).strict(),
  aggregation: z.object({ mode: z.literal('sum-quantity'), key: z.string().min(1).max(500), windowMs: z.number().int().min(500).max(30_000) }).strict().optional(),
}).strict();
export const browserAlertPayloadV2Schema = normalizedAlertEventV2Schema.extend({ display: alertDisplayV2Schema }).strict();
export const browserOverlayEventV2Schema = z.discriminatedUnion('kind', [
  z.object({ contractVersion: z.literal(CORE_CONTRACT_VERSION), kind: z.literal('chat.add'), emittedAt: z.iso.datetime({ offset: true }), payload: normalizedChatMessageV2Schema }).strict(),
  z.object({ contractVersion: z.literal(CORE_CONTRACT_VERSION), kind: z.literal('chat.remove'), emittedAt: z.iso.datetime({ offset: true }), payload: z.object({ eventId: z.string().min(1).max(256), targetEventId: z.string().min(1).max(256), reason: z.string().max(500).optional() }).strict() }).strict(),
  z.object({ contractVersion: z.literal(CORE_CONTRACT_VERSION), kind: z.literal('alert.show'), emittedAt: z.iso.datetime({ offset: true }), payload: browserAlertPayloadV2Schema }).strict(),
]);
export type BrowserOverlayEventV2 = z.infer<typeof browserOverlayEventV2Schema>;
