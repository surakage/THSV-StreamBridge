import { lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const COMMUNITY_ANALYTICS_MODULE_ID = 'thsv.community-analytics';
export const COMMUNITY_ANALYTICS_PERMISSIONS = Object.freeze(['events.subscribe', 'state.private', 'viewer.foundation.read', 'community.analytics.provide'] as const);

export async function communityAnalyticsIntegrationRoot(): Promise<string> {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(moduleDirectory, '..', '..', 'addons', 'community-analytics'),
    resolve(moduleDirectory, '..', '..', '..', 'addons', 'community-analytics'),
    resolve(moduleDirectory, '..', '..', '..', 'integrations', 'community-analytics'),
  ];
  for (const candidate of candidates) {
    try {
      const information = await lstat(join(candidate, 'dist', 'index.js'));
      if (information.isFile() && !information.isSymbolicLink()) return candidate;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  throw new Error('The built-in Community Analytics integration is missing. Repair or update StreamBridge.');
}
