import { z } from 'zod';
import { CORE_CONTRACT_VERSION } from './common.js';
import { normalizedAlertEventV2Schema } from './alert.js';
import { normalizedChatMessageV2Schema } from './chat.js';
export const browserOverlayEventV2Schema = z.discriminatedUnion('kind', [
  z.object({ contractVersion: z.literal(CORE_CONTRACT_VERSION), kind: z.literal('chat.add'), emittedAt: z.iso.datetime({ offset: true }), payload: normalizedChatMessageV2Schema }).strict(),
  z.object({ contractVersion: z.literal(CORE_CONTRACT_VERSION), kind: z.literal('chat.remove'), emittedAt: z.iso.datetime({ offset: true }), payload: z.object({ eventId: z.string().min(1).max(256), targetEventId: z.string().min(1).max(256), reason: z.string().max(500).optional() }).strict() }).strict(),
  z.object({ contractVersion: z.literal(CORE_CONTRACT_VERSION), kind: z.literal('alert.show'), emittedAt: z.iso.datetime({ offset: true }), payload: normalizedAlertEventV2Schema }).strict(),
]);
export type BrowserOverlayEventV2 = z.infer<typeof browserOverlayEventV2Schema>;

