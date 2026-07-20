import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Logger } from '../services/logger.js';
import type { PlatformCapabilityId } from '../contracts/v2/capability.js';
import { validateInstalledActionIds, verifyAddOnPackage } from '../services/addon-package-manager.js';
import { createBuiltinModules } from './builtin-modules.js';
import { ModuleRegistry, type FrameworkModule } from './module-registry.js';
import type { AddOnCapabilityBroker } from './addon-capability-broker.js';

type ModuleFactory = () => FrameworkModule | Promise<FrameworkModule>;

function isFrameworkModule(value: unknown): value is FrameworkModule {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<FrameworkModule>;
  return candidate.manifest !== undefined && typeof candidate.required === 'boolean';
}

export async function loadInstalledAddOns(addOnsRoot: string, logger: Logger): Promise<readonly FrameworkModule[]> {
  const root = resolve(addOnsRoot);
  let directories: readonly string[];
  try { directories = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => entry.name).sort(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    logger.error('Unable to inspect installed add-ons; core modules will continue', { addOnsRoot: root, error });
    return [];
  }

  const modules: FrameworkModule[] = [];
  for (const directory of directories) {
    try {
      const verified = await verifyAddOnPackage(join(root, directory), undefined, true);
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
      modules.push({
        ...candidate,
        required: false,
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

export async function createInstalledModuleRegistry(logger: Logger, addOnsRoot = 'data/addons', availableCapabilities?: ReadonlySet<PlatformCapabilityId>, broker?: AddOnCapabilityBroker): Promise<ModuleRegistry> {
  const builtins = createBuiltinModules();
  const installed = await loadInstalledAddOns(addOnsRoot, logger);
  return new ModuleRegistry([...builtins, ...filterLoadableAddOns(builtins, installed, logger, availableCapabilities)], logger, 5_000, broker);
}
