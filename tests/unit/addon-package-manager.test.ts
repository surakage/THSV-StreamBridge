import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installAddOnPackage, listInstalledAddOnPackages, removeAddOnPackage, setAddOnApprovedActionIds, verifyAddOnPackage } from '../../bridge/services/addon-package-manager.js';
import { loadInstalledAddOns } from '../../bridge/core/installed-modules.js';
import { filterLoadableAddOns } from '../../bridge/core/installed-modules.js';
import type { FrameworkModule } from '../../bridge/core/module-registry.js';
import { silentLogger } from '../helpers.js';

const temporary: string[] = [];
async function workspace(): Promise<string> { const path = await mkdtemp(join(tmpdir(), 'thsv-addon-')); temporary.push(path); return path; }
afterEach(async () => { await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

async function migrationPackage(root: string, version: string, migrations: Array<{ from: string; to: string; script: string }>, migrationSource?: string): Promise<void> {
  const moduleId = 'sample.migrating';
  const manifest = {
    contractVersion: '2.0.0-preview.1', moduleId, name: 'Migrating Sample', version,
    minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', dependencies: [], requiredCapabilities: [],
    configurationSchema: 'schemas/config.json', eventSubscriptions: [], commandsProvided: [], actionsProvided: [], browserSourcesProvided: [],
    dataStorageOwned: migrations.length === 0 ? [] : [`data/addons/.state/${moduleId}/`], installationSteps: ['Install.'], uninstallationSteps: ['Remove.'], migrations, healthChecks: [],
  };
  const contents = new Map<string, string>([['dist/index.mjs', `export default ${JSON.stringify({ manifest, required: false })};\n`], ['schemas/config.json', '{}\n']]);
  if (migrationSource !== undefined && migrations[0] !== undefined) contents.set(migrations[0].script, migrationSource);
  for (const [path, content] of contents) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), content); }
  const files = [...contents].map(([path, content]) => ({ path, size: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex') }));
  await writeFile(join(root, 'module-package.json'), JSON.stringify({ packageFormat: 'thsv-addon-v2', manifest, entrypoint: 'dist/index.mjs', files }, null, 2) + '\n');
}

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

  it('persists exact creator-approved action IDs and preserves them across package upgrades', async () => {
    const root = await workspace(); const source = join(root, 'source'); const addOns = join(root, 'addons');
    await cp('examples/addons/no-op', source, { recursive: true });
    const descriptorPath = join(source, 'module-package.json');
    const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8')) as { permissions: string[] };
    descriptor.permissions.push('streamerbot.run-approved-action');
    await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
    await installAddOnPackage(source, addOns, true);
    const actionId = '11111111-1111-4111-8111-111111111111';
    await expect(setAddOnApprovedActionIds('sample.no-op', addOns, [actionId], false)).rejects.toThrow('explicit creator approval');
    await setAddOnApprovedActionIds('sample.no-op', addOns, [actionId], true);
    await expect(listInstalledAddOnPackages(addOns)).resolves.toEqual([expect.objectContaining({ moduleId: 'sample.no-op', approvedActionIds: [actionId] })]);
    await installAddOnPackage(source, addOns, true);
    await expect(listInstalledAddOnPackages(addOns)).resolves.toEqual([expect.objectContaining({ approvedActionIds: [actionId] })]);
    await expect(setAddOnApprovedActionIds('sample.no-op', addOns, ['not-an-id'], true)).rejects.toThrow('valid UUIDs');
    await expect(setAddOnApprovedActionIds('sample.no-op', addOns, ['143fce1d-c5b0-4108-b766-ee2d0249e2d4'], true)).rejects.toThrow('Core Receiver');
  });

  it('re-verifies the creator-private staging copy before any add-on code can execute', async () => {
    const root = await workspace();
    const addOns = join(root, 'addons');
    await expect(installAddOnPackage('examples/addons/no-op', addOns, true, {
      stagePreparedHook: async (stage) => writeFile(join(stage, 'dist', 'index.js'), 'tampered after source verification\n'),
    })).rejects.toThrow('size mismatch');
    await expect(readFile(join(addOns, 'sample.no-op', 'installed-package.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('runs ordered add-on data migrations and rolls code and state back when a later migration fails', async () => {
    const root = await workspace(); const addOns = join(root, 'data', 'addons');
    const v1 = join(root, 'v1'); await mkdir(v1); await migrationPackage(v1, '1.0.0', []);
    await installAddOnPackage(v1, addOns, true);
    const storage = join(addOns, '.state', 'sample.migrating');
    await mkdir(storage, { recursive: true }); await writeFile(join(storage, 'state.json'), JSON.stringify({ format: 1 }));

    const v2 = join(root, 'v2'); await mkdir(v2); await migrationPackage(v2, '2.0.0', [{ from: '1.0.0', to: '2.0.0', script: 'migrations/001.mjs' }],
      `import { readFile, writeFile } from 'node:fs/promises'; import { join } from 'node:path'; export async function migrate(context) { const path = join(context.storageRoot, 'state.json'); const state = JSON.parse(await readFile(path, 'utf8')); await writeFile(path, JSON.stringify({ ...state, format: 2, migratedFrom: context.fromVersion })); }\n`);
    await installAddOnPackage(v2, addOns, true);
    await expect(readFile(join(storage, 'state.json'), 'utf8')).resolves.toContain('"format":2');

    const v3 = join(root, 'v3'); await mkdir(v3); await migrationPackage(v3, '3.0.0', [{ from: '2.0.0', to: '3.0.0', script: 'migrations/002.mjs' }],
      `import { writeFile } from 'node:fs/promises'; import { join } from 'node:path'; export async function migrate(context) { await writeFile(join(context.storageRoot, 'state.json'), '{"format":3}'); throw new Error('migration failed'); }\n`);
    await expect(installAddOnPackage(v3, addOns, true)).rejects.toThrow('migration failed');
    await expect(readFile(join(storage, 'state.json'), 'utf8')).resolves.toContain('"format":2');
    await expect(readFile(join(addOns, 'sample.migrating', 'installed-package.json'), 'utf8')).resolves.toContain('"version": "2.0.0"');

    const hanging = join(root, 'hanging'); await mkdir(hanging); await migrationPackage(hanging, '3.0.0', [{ from: '2.0.0', to: '3.0.0', script: 'migrations/hang.mjs' }],
      `export async function migrate() { await new Promise(() => setInterval(() => undefined, 1000)); }\n`);
    await expect(installAddOnPackage(hanging, addOns, true, { migrationTimeoutMs: 100 })).rejects.toThrow('exceeded 100 ms');
    await expect(readFile(join(storage, 'state.json'), 'utf8')).resolves.toContain('"format":2');
    await expect(readFile(join(addOns, 'sample.migrating', 'installed-package.json'), 'utf8')).resolves.toContain('"version": "2.0.0"');
  });

  it('rejects one corrupted installed add-on without preventing a verified neighbor from loading', async () => {
    const root = await workspace(); const addOns = join(root, 'addons');
    await installAddOnPackage('examples/addons/no-op', addOns, true);
    await cp(join(addOns, 'sample.no-op'), join(addOns, 'broken.module'), { recursive: true });
    await writeFile(join(addOns, 'broken.module', 'dist', 'index.js'), 'broken\n');
    const modules = await loadInstalledAddOns(addOns, silentLogger);
    expect(modules.map((module) => module.manifest.moduleId)).toEqual(['sample.no-op']);
  });

  it('rejects an executable event subscriber that did not request events.subscribe', async () => {
    const root = await workspace(); const source = join(root, 'source'); const addOns = join(root, 'addons');
    await cp('examples/addons/no-op', source, { recursive: true });
    const descriptorPath = join(source, 'module-package.json');
    const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8')) as { permissions: string[] };
    descriptor.permissions = [];
    await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
    await installAddOnPackage(source, addOns, true);
    await expect(loadInstalledAddOns(addOns, silentLogger)).resolves.toEqual([]);
  });

  it('filters duplicate, missing, and cyclic optional dependencies while keeping healthy neighbors', () => {
    const base = (moduleId: string, dependencies: readonly string[] = [], requiredCapabilities: FrameworkModule['manifest']['requiredCapabilities'] = []): FrameworkModule => ({
      manifest: {
        contractVersion: '2.0.0-preview.1', moduleId, name: moduleId, version: '1.0.0', minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1',
        dependencies: [...dependencies], requiredCapabilities: [...requiredCapabilities], configurationSchema: 'schemas/config.json', eventSubscriptions: [], commandsProvided: [], actionsProvided: [], browserSourcesProvided: [], dataStorageOwned: [], installationSteps: ['Install.'], uninstallationSteps: ['Remove.'], migrations: [], healthChecks: [],
      },
      required: moduleId.startsWith('core.'),
    });
    const filtered = filterLoadableAddOns([base('core.chat')], [
      base('core.chat'), base('addon.healthy', ['core.chat']), base('addon.missing', ['addon.absent']),
      base('addon.cycle-a', ['addon.cycle-b']), base('addon.cycle-b', ['addon.cycle-a']), base('addon.dependent', ['addon.cycle-a']),
      base('addon.healthy'),
    ], silentLogger);
    expect(filtered.map((module) => module.manifest.moduleId)).toEqual(['addon.healthy']);

    const capabilityFiltered = filterLoadableAddOns([], [base('addon.chat', [], ['chat.input']), base('addon.rewards', [], ['channel-rewards.create']), base('addon.dependent', ['addon.rewards'])], silentLogger, new Set(['chat.input']));
    expect(capabilityFiltered.map((module) => module.manifest.moduleId)).toEqual(['addon.chat']);
  });
});
