import { z } from 'zod';
import { CORE_CONTRACT_VERSION, identifierSchema } from './common.js';
import { platformCapabilityIdSchema } from './capability.js';

const providedObjectSchema = z.object({ id: identifierSchema, name: z.string().min(1).max(200) }).strict();
export const moduleManifestV2Schema = z.object({
  contractVersion: z.literal(CORE_CONTRACT_VERSION), moduleId: identifierSchema, name: z.string().min(1).max(200), version: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/), minimumCoreVersion: z.string().min(1).max(50), maximumTestedCoreVersion: z.string().min(1).max(50), dependencies: z.array(identifierSchema).max(50).default([]), requiredCapabilities: z.array(platformCapabilityIdSchema).max(50).default([]), configurationSchema: z.string().min(1).max(500), eventSubscriptions: z.array(identifierSchema).max(100).default([]), commandsProvided: z.array(providedObjectSchema).max(100).default([]), actionsProvided: z.array(providedObjectSchema).max(100).default([]), browserSourcesProvided: z.array(providedObjectSchema.extend({ path: z.string().startsWith('/').max(500) }).strict()).max(50).default([]), dataStorageOwned: z.array(z.string().min(1).max(500)).max(100).default([]), installationSteps: z.array(z.string().min(1).max(1_000)).max(100), uninstallationSteps: z.array(z.string().min(1).max(1_000)).max(100), migrations: z.array(z.object({ from: z.string().min(1), to: z.string().min(1), script: z.string().min(1).max(500) }).strict()).max(100).default([]), healthChecks: z.array(z.object({ id: identifierSchema, description: z.string().min(1).max(500) }).strict()).max(50).default([]),
}).strict().superRefine((manifest, context) => {
  if (manifest.dependencies.includes(manifest.moduleId)) context.addIssue({ code: 'custom', path: ['dependencies'], message: 'A module cannot depend on itself.' });
});
export type ModuleManifestV2 = z.infer<typeof moduleManifestV2Schema>;

