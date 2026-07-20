import { z } from 'zod';
import { CORE_CONTRACT_VERSION, identifierSchema } from './common.js';
import { platformCapabilityIdSchema } from './capability.js';

const providedObjectSchema = z.object({ id: identifierSchema, name: z.string().min(1).max(200) }).strict();
const semverSchema = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/);
const migrationSchema = z.object({
  from: semverSchema,
  to: semverSchema,
  script: z.string().min(1).max(500).refine((value) => !value.includes('\\') && !value.startsWith('/') && !/^[A-Za-z]:/u.test(value) && value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..') && (value.endsWith('.js') || value.endsWith('.mjs')), 'Migration scripts must be safe relative JavaScript paths.'),
}).strict();
export const moduleManifestV2Schema = z.object({
  contractVersion: z.literal(CORE_CONTRACT_VERSION), moduleId: identifierSchema, name: z.string().min(1).max(200), version: semverSchema, minimumCoreVersion: z.string().min(1).max(50), maximumTestedCoreVersion: z.string().min(1).max(50), dependencies: z.array(identifierSchema).max(50).default([]), requiredCapabilities: z.array(platformCapabilityIdSchema).max(50).default([]), configurationSchema: z.string().min(1).max(500), eventSubscriptions: z.array(identifierSchema).max(100).default([]), commandsProvided: z.array(providedObjectSchema).max(100).default([]), actionsProvided: z.array(providedObjectSchema).max(100).default([]), browserSourcesProvided: z.array(providedObjectSchema.extend({ path: z.string().startsWith('/').max(500) }).strict()).max(50).default([]), dataStorageOwned: z.array(z.string().min(1).max(500)).max(100).default([]), installationSteps: z.array(z.string().min(1).max(1_000)).max(100), uninstallationSteps: z.array(z.string().min(1).max(1_000)).max(100), migrations: z.array(migrationSchema).max(100).default([]), healthChecks: z.array(z.object({ id: identifierSchema, description: z.string().min(1).max(500) }).strict()).max(50).default([]),
}).strict().superRefine((manifest, context) => {
  if (manifest.dependencies.includes(manifest.moduleId)) context.addIssue({ code: 'custom', path: ['dependencies'], message: 'A module cannot depend on itself.' });
  if (manifest.browserSourcesProvided.length > 0) context.addIssue({ code: 'custom', path: ['browserSourcesProvided'], message: 'Add-on browser sources are reserved for a future host contract and cannot be declared yet.' });
  const migrationStarts = new Set<string>();
  for (const [index, migration] of manifest.migrations.entries()) {
    if (migration.from === migration.to) context.addIssue({ code: 'custom', path: ['migrations', index], message: 'A migration must change the version.' });
    if (migrationStarts.has(migration.from)) context.addIssue({ code: 'custom', path: ['migrations', index, 'from'], message: 'Each migration source version must have exactly one next step.' });
    migrationStarts.add(migration.from);
  }
  if (manifest.migrations.length > 0 && !manifest.dataStorageOwned.includes(`data/addons/.state/${manifest.moduleId}/`)) context.addIssue({ code: 'custom', path: ['dataStorageOwned'], message: `Migrating add-ons must declare data/addons/.state/${manifest.moduleId}/ as owned storage.` });
});
export type ModuleManifestV2 = z.infer<typeof moduleManifestV2Schema>;
