import { lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const KOFI_DONATIONS_MODULE_ID = 'thsv.kofi-donations';
export const KOFI_DONATIONS_PERMISSIONS = Object.freeze(['events.subscribe', 'provider.events.publish'] as const);

export async function kofiDonationsIntegrationRoot(): Promise<string> {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(moduleDirectory, '..', '..', 'addons', 'kofi-donations'),
    resolve(moduleDirectory, '..', '..', '..', 'addons', 'kofi-donations'),
    resolve(moduleDirectory, '..', '..', '..', 'integrations', 'kofi-donations'),
  ];
  for (const candidate of candidates) {
    try {
      const information = await lstat(join(candidate, 'dist', 'index.js'));
      if (information.isFile() && !information.isSymbolicLink()) return candidate;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  throw new Error('The built-in Ko-fi Donations integration is missing. Repair or update StreamBridge.');
}
