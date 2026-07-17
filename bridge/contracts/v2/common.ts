import { z } from 'zod';

export const CORE_CONTRACT_VERSION = '2.0.0-preview.1' as const;
export const identifierSchema = z.string().min(1).max(128).regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/);
export const platformIdSchema = z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/);
export const httpsUrlSchema = z.url().max(2_048).refine((value) => new URL(value).protocol === 'https:', 'URL must use HTTPS');

const jsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type JsonValueV2 = z.infer<typeof jsonPrimitiveSchema> | JsonValueV2[] | { [key: string]: JsonValueV2 };
export const jsonValueV2Schema: z.ZodType<JsonValueV2> = z.lazy(() =>
  z.union([jsonPrimitiveSchema, z.array(jsonValueV2Schema), z.record(z.string(), jsonValueV2Schema)]),
);

export const actorV2Schema = z.object({
  id: z.string().min(1).max(256).optional(),
  name: z.string().min(1).max(256),
  displayName: z.string().min(1).max(256).optional(),
  actorType: z.enum(['human', 'bot', 'system']).default('human'),
  roles: z.array(z.string().max(64)).max(32).default([]),
  avatarUrl: httpsUrlSchema.optional(),
  nameColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  badges: z.array(z.object({
    id: identifierSchema,
    label: z.string().min(1).max(64),
    iconUrl: httpsUrlSchema.optional(),
  }).strict()).max(16).default([]),
}).strict();

export const channelV2Schema = z.object({
  id: z.string().min(1).max(256).optional(),
  name: z.string().min(1).max(256),
}).strict();

