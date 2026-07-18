import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installAddOnPackage, removeAddOnPackage, verifyAddOnPackage } from '../../bridge/services/addon-package-manager.js';
import { loadInstalledAddOns } from '../../bridge/core/installed-modules.js';
import { filterLoadableAddOns } from '../../bridge/core/installed-modules.js';
import type { FrameworkModule } from '../../bridge/core/module-registry.js';
import { silentLogger } from '../helpers.js';

const temporary: string[] = [];
async function workspace(): Promise<string> { const path = await mkdtemp(join(tmpdir(), 'thsv-addon-')); temporary.push(path); return path; }
afterEach(async () => { await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe('Stage 9 add-on packages', () => {
  it('verifies the public no-op sample and its complete hash manifest', async () => {
    const verified = await verifyAddOnPackage('examples/addons/no-op');
    expect(verified.descriptor).toMatchObject({ packageFormat: 'thsv-addon-v2', entrypoint: 'dist/index.js', manifest: { moduleId: 'sample.no-op' } });
  });

  it('rejects tampering, unlisted files, traversal, and incompatible core versions', async () => {
    const root = await workspace();
    await cp('examples/addons/no-op', root, { recursive: true });
    await writeFile(join(root, 'dist', 'index.js'), 'tampered\n');
    await expect(verifyAddOnPackage(root)).rejects.toThrow('size mismatch');
    await cp('examples/addons/no-op', root, { recursive: true, force: true });
    await writeFile(join(root, 'unexpected.js'), 'nope\n');
    await expect(verifyAddOnPackage(root)).rejects.toThrow('Unexpected: unexpected.js');
    const descriptor = JSON.parse(await readFile(join(root, 'module-package.json'), 'utf8')) as Record<string, unknown>;
    descriptor['entrypoint'] = '../outside.js';
    await writeFile(join(root, 'module-package.json'), JSON.stringify(descriptor));
    await expect(verifyAddOnPackage(root)).rejects.toThrow('safe relative path');
    await expect(verifyAddOnPackage('examples/addons/no-op', '1.0.0')).rejects.toThrow('requires core');
  });

  it('requires approval, installs atomically, loads the sample, and removes code without deleting owned state', async () => {
    const root = await workspace();
    const addOns = join(root, 'addons');
    const state = join(root, 'state', 'sample.no-op');
    await expect(installAddOnPackage('examples/addons/no-op', addOns, false)).rejects.toThrow('explicit creator approval');
    const installed = await installAddOnPackage('examples/addons/no-op', addOns, true);
    expect(installed.root).toBe(join(addOns, 'sample.no-op'));
    const modules = await loadInstalledAddOns(addOns, silentLogger);
    expect(modules.map((module) => module.manifest.moduleId)).toEqual(['sample.no-op']);
    await mkdir(state, { recursive: true }); await writeFile(join(state, 'creator.json'), '{"kept":true}\n');
    await expect(removeAddOnPackage('sample.no-op', addOns, false)).rejects.toThrow('explicit creator approval');
    await removeAddOnPackage('sample.no-op', addOns, true);
    await expect(readFile(join(state, 'creator.json'), 'utf8')).resolves.toContain('kept');
  });

  it('rejects one corrupted installed add-on without preventing a verified neighbor from loading', async () => {
    const root = await workspace(); const addOns = join(root, 'addons');
    await installAddOnPackage('examples/addons/no-op', addOns, true);
    await cp(join(addOns, 'sample.no-op'), join(addOns, 'broken.module'), { recursive: true });
    await writeFile(join(addOns, 'broken.module', 'dist', 'index.js'), 'broken\n');
    const modules = await loadInstalledAddOns(addOns, silentLogger);
    expect(modules.map((module) => module.manifest.moduleId)).toEqual(['sample.no-op']);
  });

  it('filters duplicate, missing, and cyclic optional dependencies while keeping healthy neighbors', () => {
    const base = (moduleId: string, dependencies: readonly string[] = []): FrameworkModule => ({
      manifest: {
        contractVersion: '2.0.0-preview.1', moduleId, name: moduleId, version: '1.0.0', minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1',
        dependencies: [...dependencies], requiredCapabilities: [], configurationSchema: 'schemas/config.json', eventSubscriptions: [], commandsProvided: [], actionsProvided: [], browserSourcesProvided: [], dataStorageOwned: [], installationSteps: ['Install.'], uninstallationSteps: ['Remove.'], migrations: [], healthChecks: [],
      },
      required: moduleId.startsWith('core.'),
    });
    const filtered = filterLoadableAddOns([base('core.chat')], [
      base('core.chat'), base('addon.healthy', ['core.chat']), base('addon.missing', ['addon.absent']),
      base('addon.cycle-a', ['addon.cycle-b']), base('addon.cycle-b', ['addon.cycle-a']), base('addon.dependent', ['addon.cycle-a']),
      base('addon.healthy'),
    ], silentLogger);
    expect(filtered.map((module) => module.manifest.moduleId)).toEqual(['addon.healthy']);
  });
});
