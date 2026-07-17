import { z } from 'zod';
import { CORE_CONTRACT_VERSION, identifierSchema } from './common.js';
export const moduleHealthStatusV2Schema = z.object({ contractVersion: z.literal(CORE_CONTRACT_VERSION), moduleId: identifierSchema, status: z.enum(['healthy', 'degraded', 'stopped', 'failed']), checkedAt: z.iso.datetime({ offset: true }), message: z.string().max(1_000).optional(), failures: z.array(z.object({ checkId: identifierSchema, message: z.string().min(1).max(1_000) }).strict()).max(100).default([]) }).strict();
export type ModuleHealthStatusV2 = z.infer<typeof moduleHealthStatusV2Schema>;

