import { lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VIEWER_FOUNDATION_MODULE_ID = 'thsv.viewer-foundation';
export const VIEWER_FOUNDATION_PERMISSIONS = Object.freeze(['events.subscribe', 'state.private', 'viewer.foundation.provide', 'chat.send'] as const);

export async function viewerFoundationIntegrationRoot(): Promise<string> {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(moduleDirectory, '..', '..', 'addons', 'viewer-foundation'),
    resolve(moduleDirectory, '..', '..', '..', 'addons', 'viewer-foundation'),
    resolve(moduleDirectory, '..', '..', '..', 'integrations', 'viewer-foundation'),
  ];
  for (const candidate of candidates) {
    try {
      const information = await lstat(join(candidate, 'dist', 'index.js'));
      if (information.isFile() && !information.isSymbolicLink()) return candidate;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  throw new Error('The built-in Viewer Foundation integration is missing. Repair or update StreamBridge.');
}
