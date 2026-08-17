import { COMMUNITY_ANALYTICS_MODULE_ID } from './community-analytics-integration.js';
import { KOFI_DONATIONS_MODULE_ID } from './kofi-donations-integration.js';
import { VIEWER_FOUNDATION_MODULE_ID } from './viewer-foundation-integration.js';

export const BUILT_IN_INTEGRATION_IDS = Object.freeze([
  VIEWER_FOUNDATION_MODULE_ID,
  COMMUNITY_ANALYTICS_MODULE_ID,
  KOFI_DONATIONS_MODULE_ID,
] as const);

const BUILT_IN_INTEGRATION_ID_SET: ReadonlySet<string> = new Set(BUILT_IN_INTEGRATION_IDS);

export function isBuiltInIntegrationModuleId(moduleId: string): boolean {
  return BUILT_IN_INTEGRATION_ID_SET.has(moduleId);
}
