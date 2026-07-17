import { describe, expect, it, vi } from 'vitest';
import { CORE_CONTRACT_VERSION } from '../../bridge/contracts/v2/common.js';
import type { ModuleManifestV2 } from '../../bridge/contracts/v2/module-manifest.js';
import { ModuleRegistry, type FrameworkModule } from '../../bridge/core/module-registry.js';
import { createBuiltinModuleRegistry } from '../../bridge/core/builtin-modules.js';
import { fixture, silentLogger } from '../helpers.js';

function moduleDefinition(moduleId: string, options: Partial<FrameworkModule> & { dependencies?: readonly string[] } = {}): FrameworkModule {
  const manifest: ModuleManifestV2 = {
    contractVersion: CORE_CONTRACT_VERSION,
    moduleId,
    name: moduleId,
    version: '1.0.0',
    minimumCoreVersion: CORE_CONTRACT_VERSION,
    maximumTestedCoreVersion: CORE_CONTRACT_VERSION,
    dependencies: [...(options.dependencies ?? [])],
    requiredCapabilities: [],
    configurationSchema: `schemas/modules/${moduleId}.json`,
    eventSubscriptions: ['chat.message'],
    commandsProvided: [], actionsProvided: [], browserSourcesProvided: [], dataStorageOwned: [],
    installationSteps: ['Install for test.'], uninstallationSteps: ['Remove after test.'], migrations: [], healthChecks: [],
  };
  return {
    manifest,
    required: options.required ?? false,
    ...(options.start === undefined ? {} : { start: options.start }),
    ...(options.stop === undefined ? {} : { stop: options.stop }),
    ...(options.onEvent === undefined ? {} : { onEvent: options.onEvent }),
  };
}

describe('ModuleRegistry', () => {
  it('registers the four required built-in core projections', async () => {
    const registry = createBuiltinModuleRegistry(silentLogger);
    await registry.start();
    expect(registry.statuses().map((status) => status.moduleId)).toEqual(['core.chat', 'core.commands', 'core.alerts', 'core.timed-actions']);
    expect(registry.ready()).toBe(true);
    await registry.stop();
  });

  it('starts dependencies before dependents and reports healthy contract statuses', async () => {
    const order: string[] = [];
    const registry = new ModuleRegistry([
      moduleDefinition('test.child', { required: true, dependencies: ['test.base'], start: async () => { order.push('child'); } }),
      moduleDefinition('test.base', { required: true, start: async () => { order.push('base'); } }),
    ], silentLogger);
    await registry.start();
    expect(order).toEqual(['base', 'child']);
    expect(registry.ready()).toBe(true);
    expect(registry.statuses()).toEqual([
      expect.objectContaining({ contractVersion: CORE_CONTRACT_VERSION, moduleId: 'test.base', status: 'healthy', failures: [] }),
      expect.objectContaining({ contractVersion: CORE_CONTRACT_VERSION, moduleId: 'test.child', status: 'healthy', failures: [] }),
    ]);
  });

  it('isolates optional startup and event-handler failures', async () => {
    const healthyHandler = vi.fn();
    const registry = new ModuleRegistry([
      moduleDefinition('test.start-failure', { start: async () => { throw new Error('optional start failed'); } }),
      moduleDefinition('test.event-failure', { onEvent: async () => { throw new Error('optional event failed'); } }),
      moduleDefinition('test.healthy', { onEvent: healthyHandler }),
    ], silentLogger);
    await registry.start();
    await registry.publish({ ...(await fixture()), metadata: { simulated: true, bridgeSequence: 1 } });
    expect(healthyHandler).toHaveBeenCalledOnce();
    expect(registry.ready()).toBe(true);
    expect(registry.statuses()).toEqual(expect.arrayContaining([
      expect.objectContaining({ moduleId: 'test.start-failure', status: 'failed' }),
      expect.objectContaining({ moduleId: 'test.event-failure', status: 'failed' }),
      expect.objectContaining({ moduleId: 'test.healthy', status: 'healthy' }),
    ]));
  });

  it('blocks readiness when a required module fails', async () => {
    const registry = new ModuleRegistry([
      moduleDefinition('test.required', { required: true, start: async () => { throw new Error('required failure'); } }),
    ], silentLogger);
    await registry.start();
    expect(registry.ready()).toBe(false);
    expect(registry.statuses()[0]).toMatchObject({ moduleId: 'test.required', status: 'failed', message: 'required failure' });
  });

  it('rejects duplicate, missing, cyclic, and self dependencies before startup', () => {
    expect(() => new ModuleRegistry([moduleDefinition('test.same'), moduleDefinition('test.same')], silentLogger)).toThrow('registered more than once');
    expect(() => new ModuleRegistry([moduleDefinition('test.child', { dependencies: ['test.missing'] })], silentLogger)).toThrow('is not installed');
    expect(() => new ModuleRegistry([
      moduleDefinition('test.one', { dependencies: ['test.two'] }),
      moduleDefinition('test.two', { dependencies: ['test.one'] }),
    ], silentLogger)).toThrow('cycle');
    expect(() => new ModuleRegistry([moduleDefinition('test.self', { dependencies: ['test.self'] })], silentLogger)).toThrow();
  });
});
