import { z } from 'zod';
import { moduleManifestV2Schema } from './module-manifest.js';

export function isSafeAddOnPath(value: string): boolean {
  if (value.length === 0 || value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/u.test(value)) return false;
  const segments = value.split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

export const addOnPackageFileV2Schema = z.object({
  path: z.string().min(1).max(500).refine(isSafeAddOnPath, 'Package file paths must be relative, forward-slash paths without traversal.'),
  size: z.number().int().min(0).max(1_073_741_824),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const addOnPackageV2Schema = z.object({
  packageFormat: z.literal('thsv-addon-v2'),
  manifest: moduleManifestV2Schema,
  entrypoint: z.string().min(1).max(500).refine(isSafeAddOnPath, 'The entrypoint must be a safe relative path.').refine((path) => path.endsWith('.js') || path.endsWith('.mjs'), 'The entrypoint must be JavaScript.'),
  files: z.array(addOnPackageFileV2Schema).min(1).max(10_000),
}).strict().superRefine((descriptor, context) => {
  const paths = new Set<string>();
  for (const [index, file] of descriptor.files.entries()) {
    if (paths.has(file.path)) context.addIssue({ code: 'custom', path: ['files', index, 'path'], message: 'Package file paths must be unique.' });
    paths.add(file.path);
  }
  if (!paths.has(descriptor.entrypoint)) context.addIssue({ code: 'custom', path: ['entrypoint'], message: 'The entrypoint must be listed in files.' });
  if (!paths.has(descriptor.manifest.configurationSchema)) context.addIssue({ code: 'custom', path: ['manifest', 'configurationSchema'], message: 'The configuration schema must be included in files.' });
  for (const [index, migration] of descriptor.manifest.migrations.entries()) {
    if (!paths.has(migration.script)) context.addIssue({ code: 'custom', path: ['manifest', 'migrations', index, 'script'], message: 'Migration scripts must be included in files.' });
  }
});

export type AddOnPackageV2 = z.infer<typeof addOnPackageV2Schema>;
