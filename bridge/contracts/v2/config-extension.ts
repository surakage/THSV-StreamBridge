import { z } from 'zod';
import { CORE_CONTRACT_VERSION, identifierSchema, jsonValueV2Schema } from './common.js';
export const configurationExtensionV2Schema = z.object({ contractVersion: z.literal(CORE_CONTRACT_VERSION), moduleId: identifierSchema, schemaVersion: z.string().min(1).max(50), enabled: z.boolean(), config: z.record(z.string(), jsonValueV2Schema) }).strict();
export type ConfigurationExtensionV2 = z.infer<typeof configurationExtensionV2Schema>;

