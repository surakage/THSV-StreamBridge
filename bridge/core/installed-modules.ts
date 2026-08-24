import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Logger } from '../services/logger.js';
import type { PlatformCapabilityId } from '../contracts/v2/capability.js';
import { inspectAddOnArchive, installAddOnArchive, safeChild, supersededInstalledPackageDirectories, validateInstalledActionIds, verifyAddOnPackage } from '../services/addon-package-manager.js';
import { validateSettings } from '../services/addon-wizard-service.js';
import { createBuiltinModules } from './builtin-modules.js';
import { ModuleRegistry, type FrameworkModule } from './module-registry.js';
import type { AddOnCapabilityBroker } from './addon-capability-broker.js';
import { VIEWER_FOUNDATION_MODULE_ID, VIEWER_FOUNDATION_PERMISSIONS, viewerFoundationIntegrationRoot } from './viewer-foundation-integration.js';
import { COMMUNITY_ANALYTICS_MODULE_ID, COMMUNITY_ANALYTICS_PERMISSIONS, communityAnalyticsIntegrationRoot } from './community-analytics-integration.js';
import { KOFI_DONATIONS_MODULE_ID, KOFI_DONATIONS_PERMISSIONS, kofiDonationsIntegrationRoot } from './kofi-donations-integration.js';
import { isBuiltInIntegrationModuleId } from './built-in-integrations.js';
import { MAIN_FEATURE_FAMILIES } from './main-feature-registry.js';

const MAXIMUM_SETTINGS_BYTES = 65_536;

function knownSettingsProperties(schema: unknown): ReadonlySet<string> {
  if (typeof schema !== 'object' || schema === null) return new Set();
  const properties = (schema as { properties?: unknown }).properties;
  if (typeof properties !== 'object' || properties === null) return new Set();
  return new Set(Object.keys(properties));
}

async function readAddOnSettings(stateRoot: string, moduleId: string, configurationSchemaPath: string, packageRoot: string): Promise<Readonly<Record<string, unknown>>> {
  const schema = JSON.parse(await readFile(safeChild(packageRoot, configurationSchemaPath), 'utf8')) as unknown;
  const path = safeChild(resolve(stateRoot), `${moduleId}/settings.json`);
  try {
    const information = await lstat(path);
    if (!information.isFile() || information.isSymbolicLink() || information.size > MAXIMUM_SETTINGS_BYTES) throw new Error(`Add-on settings must be a regular file no larger than ${String(MAXIMUM_SETTINGS_BYTES)} bytes.`);
    const raw = JSON.parse(await readFile(path, 'utf8')) as unknown;
    const input = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    // A key an older version of this add-on's schema used to accept but the current one does not
    // (renamed or removed in an update) is dropped rather than treated as a hard failure: unlike
    // the wizard's own settings-save endpoint -- where an unrecognized key really is suspect input
    // worth rejecting -- this file was written by an already-trusted earlier version of the same
    // add-on, and a settings schema evolving across versions is normal, expected change. Rejecting
    // the whole add-on over one stale key would be a self-inflicted update failure.
    const properties = knownSettingsProperties(schema);
    const known = Object.fromEntries(Object.entries(input).filter(([key]) => properties.has(key)));
    return validateSettings(schema, known);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return validateSettings(schema, {}, true);
    throw error;
  }
}

export async function createViewerFoundationIntegration(stateRoot: string): Promise<FrameworkModule> {
  const integrationRoot = await viewerFoundationIntegrationRoot();
  const imported = await import(pathToFileURL(join(integrationRoot, 'dist', 'index.js')).href) as { default?: unknown };
  if (!isFrameworkModule(imported.default) || imported.default.manifest.moduleId !== VIEWER_FOUNDATION_MODULE_ID) throw new Error('The built-in Viewer Foundation integration is invalid. Repair or update StreamBridge.');
  const settings = await readAddOnSettings(stateRoot, VIEWER_FOUNDATION_MODULE_ID, imported.default.manifest.configurationSchema, integrationRoot);
  return {
    ...imported.default,
    required: true,
    settings,
    capabilityGrant: {
      moduleId: VIEWER_FOUNDATION_MODULE_ID,
      permissions: VIEWER_FOUNDATION_PERMISSIONS,
      approvedActionIds: [],
    },
  };
}

export async function createCommunityAnalyticsIntegration(stateRoot: string): Promise<FrameworkModule> {
  const integrationRoot = await communityAnalyticsIntegrationRoot();
  const imported = await import(pathToFileURL(join(integrationRoot, 'dist', 'index.js')).href) as { default?: unknown };
  if (!isFrameworkModule(imported.default) || imported.default.manifest.moduleId !== COMMUNITY_ANALYTICS_MODULE_ID) throw new Error('The built-in Community Analytics integration is invalid. Repair or update StreamBridge.');
  const settings = await readAddOnSettings(stateRoot, COMMUNITY_ANALYTICS_MODULE_ID, imported.default.manifest.configurationSchema, integrationRoot);
  return {
    ...imported.default,
    required: false,
    settings,
    capabilityGrant: {
      moduleId: COMMUNITY_ANALYTICS_MODULE_ID,
      permissions: COMMUNITY_ANALYTICS_PERMISSIONS,
      approvedActionIds: [],
    },
  };
}

export async function createKofiDonationsIntegration(stateRoot: string): Promise<FrameworkModule> {
  const integrationRoot = await kofiDonationsIntegrationRoot();
  const imported = await import(pathToFileURL(join(integrationRoot, 'dist', 'index.js')).href) as { default?: unknown };
  if (!isFrameworkModule(imported.default) || imported.default.manifest.moduleId !== KOFI_DONATIONS_MODULE_ID) throw new Error('The built-in Ko-fi Donations integration is invalid. Repair or update StreamBridge.');
  const settings = await readAddOnSettings(stateRoot, KOFI_DONATIONS_MODULE_ID, imported.default.manifest.configurationSchema, integrationRoot);
  return {
    ...imported.default,
    required: false,
    settings,
    capabilityGrant: {
      moduleId: KOFI_DONATIONS_MODULE_ID,
      permissions: KOFI_DONATIONS_PERMISSIONS,
      approvedActionIds: [],
    },
  };
}

type ModuleFactory = () => FrameworkModule | Promise<FrameworkModule>;

function isFrameworkModule(value: unknown): value is FrameworkModule {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<FrameworkModule>;
  return candidate.manifest !== undefined && typeof candidate.required === 'boolean';
}

export async function loadInstalledAddOns(addOnsRoot: string, logger: Logger, addOnStateRoot = join(addOnsRoot, '.state')): Promise<readonly FrameworkModule[]> {
  const root = resolve(addOnsRoot);
  let directories: readonly string[];
  try { directories = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'inbox').map((entry) => entry.name).sort(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    logger.error('Unable to inspect installed add-ons; core modules will continue', { addOnsRoot: root, error });
    return [];
  }

  const superseded = await supersededInstalledPackageDirectories(root);
  const modules: FrameworkModule[] = [];
  for (const directory of directories) {
    if (superseded.has(directory)) { logger.info('Superseded legacy add-on package ignored', { directory }); continue; }
    try {
      const verified = await verifyAddOnPackage(join(root, directory), undefined, true);
      if (isBuiltInIntegrationModuleId(verified.descriptor.manifest.moduleId)) {
        logger.info('Legacy integration package ignored because the feature is built into StreamBridge', { directory, moduleId: verified.descriptor.manifest.moduleId });
        continue;
      }
      const installRecord = JSON.parse(await readFile(join(verified.root, 'installed-package.json'), 'utf8')) as { enabled?: boolean; approvedActionIds?: readonly string[] };
      if (installRecord.enabled === false) { logger.info('Installed add-on is disabled', { moduleId: verified.descriptor.manifest.moduleId }); continue; }
      if (verified.descriptor.packageKind === 'declarative') {
        modules.push({ manifest: verified.descriptor.manifest, required: false });
        logger.info('Verified declarative add-on loaded', { moduleId: verified.descriptor.manifest.moduleId, version: verified.descriptor.manifest.version });
        continue;
      }
      if (verified.descriptor.entrypoint === undefined) throw new Error('Executable add-on entrypoint is missing after validation.');
      if (verified.descriptor.manifest.eventSubscriptions.length > 0 && !verified.descriptor.permissions.includes('events.subscribe')) throw new Error('Executable add-ons with event subscriptions must request events.subscribe permission.');
      const url = pathToFileURL(join(verified.root, ...verified.descriptor.entrypoint.split('/')));
      url.searchParams.set('integrity', verified.descriptor.files.find((file) => file.path === verified.descriptor.entrypoint)?.sha256 ?? 'unknown');
      const imported = await import(url.href) as { default?: unknown; createModule?: ModuleFactory };
      const candidate = imported.createModule === undefined ? imported.default : await imported.createModule();
      if (!isFrameworkModule(candidate)) throw new Error('The entrypoint must export a FrameworkModule as default or through createModule().');
      if (JSON.stringify(candidate.manifest) !== JSON.stringify(verified.descriptor.manifest)) throw new Error('The runtime manifest does not exactly match module-package.json.');
      const settings = await readAddOnSettings(addOnStateRoot, verified.descriptor.manifest.moduleId, verified.descriptor.manifest.configurationSchema, verified.root);
      modules.push({
        ...candidate,
        required: false,
        settings,
        capabilityGrant: {
          moduleId: verified.descriptor.manifest.moduleId,
          permissions: verified.descriptor.permissions,
          approvedActionIds: validateInstalledActionIds(installRecord.approvedActionIds),
        },
      });
      logger.info('Verified add-on loaded', { moduleId: candidate.manifest.moduleId, version: candidate.manifest.version });
    } catch (error) {
      logger.error('Installed add-on was rejected; other modules remain available', { directory, error });
    }
  }
  return modules;
}

export async function synchronizeBundledExtensionPackages(packagesRoot: string, stateRoot: string, bundledRoot: string, managedModuleIds: ReadonlySet<string>, logger: Logger): Promise<void> {
  let directories;
  try { directories = await readdir(resolve(packagesRoot), { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  for (const directory of directories.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'inbox')) {
    try {
      const record = JSON.parse(await readFile(join(packagesRoot, directory.name, 'installed-package.json'), 'utf8')) as { moduleId?: unknown; version?: unknown };
      if (typeof record.moduleId !== 'string' || typeof record.version !== 'string' || !managedModuleIds.has(record.moduleId)) continue;
      const archive = new Uint8Array(await readFile(join(bundledRoot, `${record.moduleId}.thsv-addon`)));
      const bundled = await inspectAddOnArchive(archive, packagesRoot);
      if (bundled.manifest.moduleId !== record.moduleId) throw new Error(`Bundled extension identity mismatch for ${record.moduleId}.`);
      if (bundled.manifest.version === record.version) continue;
      await installAddOnArchive(archive, packagesRoot, true, {}, { stateRoot });
      logger.info('Bundled extension upgraded with StreamBridge core', { moduleId: record.moduleId, fromVersion: record.version, toVersion: bundled.manifest.version });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      logger.error('Bundled extension could not be synchronized; its installed copy remains isolated', { directory: directory.name, error });
    }
  }
}

export function filterLoadableAddOns(builtins: readonly FrameworkModule[], candidates: readonly FrameworkModule[], logger: Logger, availableCapabilities?: ReadonlySet<PlatformCapabilityId>): readonly FrameworkModule[] {
  const coreIds = new Set(builtins.map((module) => module.manifest.moduleId));
  const unique = new Map<string, FrameworkModule>();
  for (const candidate of candidates) {
    const moduleId = candidate.manifest.moduleId;
    if (coreIds.has(moduleId) || unique.has(moduleId)) {
      logger.error('Optional add-on module ID conflicts with another module; add-on rejected', { moduleId });
      continue;
    }
    unique.set(moduleId, candidate);
  }

  const cycleIds = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const visiting = new Set<string>();
  const visit = (moduleId: string): void => {
    if (visited.has(moduleId)) return;
    if (visiting.has(moduleId)) {
      const start = stack.indexOf(moduleId);
      for (const cycleId of stack.slice(start)) cycleIds.add(cycleId);
      return;
    }
    const module = unique.get(moduleId);
    if (module === undefined) return;
    visiting.add(moduleId); stack.push(moduleId);
    for (const dependency of module.manifest.dependencies) if (unique.has(dependency)) visit(dependency);
    stack.pop(); visiting.delete(moduleId); visited.add(moduleId);
  };
  for (const moduleId of unique.keys()) visit(moduleId);
  for (const moduleId of cycleIds) {
    unique.delete(moduleId);
    logger.error('Optional add-on dependency cycle rejected', { moduleId });
  }

  if (availableCapabilities !== undefined) {
    for (const [moduleId, module] of unique) {
      const missing = module.manifest.requiredCapabilities.find((capability) => !availableCapabilities.has(capability));
      if (missing === undefined) continue;
      unique.delete(moduleId);
      logger.error('Optional add-on capability is unavailable; add-on rejected', { moduleId, capability: missing });
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    const available = new Set([...coreIds, ...unique.keys()]);
    for (const [moduleId, module] of unique) {
      const missing = module.manifest.dependencies.find((dependency) => !available.has(dependency));
      if (missing === undefined) continue;
      unique.delete(moduleId); changed = true;
      logger.error('Optional add-on dependency is unavailable; add-on rejected', { moduleId, dependency: missing });
    }
  }
  return [...unique.values()];
}

export async function createInstalledModuleRegistry(logger: Logger, addOnsRoot = 'data/addons', availableCapabilities?: ReadonlySet<PlatformCapabilityId>, broker?: AddOnCapabilityBroker, addOnStateRoot?: string): Promise<ModuleRegistry> {
  const stateRoot = addOnStateRoot ?? join(addOnsRoot, '.state');
  const managedModuleIds = new Set(MAIN_FEATURE_FAMILIES.flatMap((family) => family.modules));
  await synchronizeBundledExtensionPackages(addOnsRoot, stateRoot, resolve('packages', 'extensions'), managedModuleIds, logger);
  const builtins = [...createBuiltinModules(), await createViewerFoundationIntegration(stateRoot), await createCommunityAnalyticsIntegration(stateRoot), await createKofiDonationsIntegration(stateRoot)];
  const installed = await loadInstalledAddOns(addOnsRoot, logger, stateRoot);
  return new ModuleRegistry([...builtins, ...filterLoadableAddOns(builtins, installed, logger, availableCapabilities)], logger, 5_000, broker);
}
