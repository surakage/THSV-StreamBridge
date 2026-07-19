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

export const ADD_ON_PERMISSION_VALUES = [
  'events.subscribe',
  'streamerbot.run-approved-action',
  'overlay.publish',
  'chat.send',
  'schedule.bounded',
  'state.private',
] as const;
export const addOnPermissionV2Schema = z.enum(ADD_ON_PERMISSION_VALUES);
export type AddOnPermissionV2 = z.infer<typeof addOnPermissionV2Schema>;

export const addOnPackageV2Schema = z.object({
  packageFormat: z.literal('thsv-addon-v2'),
  packageKind: z.enum(['declarative', 'executable']).default('executable'),
  author: z.string().trim().min(1).max(200).default('Unknown publisher'),
  description: z.string().trim().min(1).max(1_000).default('No description supplied.'),
  changelog: z.string().trim().max(10_000).default(''),
  permissions: z.array(addOnPermissionV2Schema).max(20).default([]),
  manifest: moduleManifestV2Schema,
  entrypoint: z.string().min(1).max(500).refine(isSafeAddOnPath, 'The entrypoint must be a safe relative path.').refine((path) => path.endsWith('.js') || path.endsWith('.mjs'), 'The entrypoint must be JavaScript.').optional(),
  settingsUi: z.string().min(1).max(500).refine(isSafeAddOnPath, 'The settings UI schema must be a safe relative path.').optional(),
  files: z.array(addOnPackageFileV2Schema).min(1).max(10_000),
}).strict().superRefine((descriptor, context) => {
  const paths = new Set<string>();
  for (const [index, file] of descriptor.files.entries()) {
    if (paths.has(file.path)) context.addIssue({ code: 'custom', path: ['files', index, 'path'], message: 'Package file paths must be unique.' });
    paths.add(file.path);
  }
  if (descriptor.packageKind === 'executable' && descriptor.entrypoint === undefined) context.addIssue({ code: 'custom', path: ['entrypoint'], message: 'Executable add-ons require a JavaScript entrypoint.' });
  if (descriptor.packageKind === 'declarative' && descriptor.entrypoint !== undefined) context.addIssue({ code: 'custom', path: ['entrypoint'], message: 'Declarative add-ons must not include an executable entrypoint.' });
  if (descriptor.entrypoint !== undefined && !paths.has(descriptor.entrypoint)) context.addIssue({ code: 'custom', path: ['entrypoint'], message: 'The entrypoint must be listed in files.' });
  if (!paths.has(descriptor.manifest.configurationSchema)) context.addIssue({ code: 'custom', path: ['manifest', 'configurationSchema'], message: 'The configuration schema must be included in files.' });
  if (descriptor.settingsUi !== undefined && !paths.has(descriptor.settingsUi)) context.addIssue({ code: 'custom', path: ['settingsUi'], message: 'The settings UI schema must be included in files.' });
  if (descriptor.packageKind === 'declarative' && descriptor.manifest.migrations.length > 0) context.addIssue({ code: 'custom', path: ['manifest', 'migrations'], message: 'Declarative add-ons cannot run JavaScript migrations.' });
  for (const [index, migration] of descriptor.manifest.migrations.entries()) {
    if (!paths.has(migration.script)) context.addIssue({ code: 'custom', path: ['manifest', 'migrations', index, 'script'], message: 'Migration scripts must be included in files.' });
  }
});

export type AddOnPackageV2 = z.infer<typeof addOnPackageV2Schema>;
