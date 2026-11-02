import { describe, expect, it, vi } from 'vitest';
import { CORE_CONTRACT_VERSION } from '../../bridge/contracts/v2/common.js';
import { CONTROL_DECK_MODULE_IDS, ControlDeckError } from '../../bridge/contracts/v2/control-deck.js';
import type { ModuleManifestV2 } from '../../bridge/contracts/v2/module-manifest.js';
import { ModuleRegistry, type FrameworkModule } from '../../bridge/core/module-registry.js';
import { silentLogger } from '../helpers.js';

function deckModule(moduleId: string, name: string, extra: Partial<FrameworkModule> = {}): FrameworkModule {
  const manifest: ModuleManifestV2 = {
    contractVersion: CORE_CONTRACT_VERSION, moduleId, name, version: '1.0.0',
    minimumCoreVersion: CORE_CONTRACT_VERSION, maximumTestedCoreVersion: CORE_CONTRACT_VERSION,
    dependencies: [], requiredCapabilities: [], configurationSchema: `schemas/modules/${moduleId}.json`,
    eventSubscriptions: [], commandsProvided: [], actionsProvided: [], browserSourcesProvided: [], dataStorageOwned: [],
    installationSteps: ['Install for test.'], uninstallationSteps: ['Remove after test.'], migrations: [], healthChecks: [],
  };
  return { manifest, required: false, ...extra };
}

const view = (message?: string) => ({ title: 'Prize Wheel', status: '4 slices', ...(message === undefined ? {} : { message }), sections: [{ title: 'Wheel', actions: [{ operation: 'spin', label: 'Spin', tone: 'primary' as const }] }] });

async function registryWith(...modules: FrameworkModule[]): Promise<ModuleRegistry> {
  const registry = new ModuleRegistry(modules, silentLogger, 200);
  await registry.start();
  return registry;
}

describe('Control Deck registry', () => {
  it('lists every Control Deck extension in the fixed order and greys out the ones that are off, failed or have no hook', async () => {
    const registry = await registryWith(
      deckModule('thsv.prize-wheel', 'Prize Wheel', { controlDeck: vi.fn(async () => view()) }),
      deckModule('thsv.viewer-lobby', 'Viewer Lobby', { controlDeck: vi.fn(async () => view()), settings: { enabled: false } }),
      deckModule('thsv.village-jukebox', 'Village Jukebox'),
      deckModule('thsv.village-draw', 'Village Draw', { controlDeck: vi.fn(async () => view()), start: async () => { throw new Error('boom'); } }),
    );
    const { tabs } = registry.controlDeckTabs();
    expect(tabs.map((tab) => tab.moduleId)).toEqual([...CONTROL_DECK_MODULE_IDS]);
    expect(tabs.find((tab) => tab.moduleId === 'thsv.prize-wheel')).toEqual({ moduleId: 'thsv.prize-wheel', name: 'Prize Wheel', enabled: true });
    expect(tabs.find((tab) => tab.moduleId === 'thsv.viewer-lobby')).toMatchObject({ enabled: false, reason: 'Turn on Viewer Lobby in Extensions to use it here.' });
    expect(tabs.find((tab) => tab.moduleId === 'thsv.streamer-punishments')).toMatchObject({ name: 'Streamer Punishments', enabled: false, reason: 'Turn on Streamer Punishments in Extensions to use it here.' });
    expect(tabs.find((tab) => tab.moduleId === 'thsv.voice-relay')).toMatchObject({ name: 'Village Voice', enabled: false });
    expect(tabs.find((tab) => tab.moduleId === 'thsv.village-jukebox')).toMatchObject({ enabled: false, reason: 'Village Jukebox has no Control Deck controls yet.' });
    expect(tabs.find((tab) => tab.moduleId === 'thsv.village-draw')?.reason).toContain('stopped because of a problem');
  });

  it('runs a hook with the request and returns its validated view', async () => {
    const controlDeck = vi.fn(async () => view('Spun.'));
    const registry = await registryWith(deckModule('thsv.prize-wheel', 'Prize Wheel', { controlDeck }));
    await expect(registry.runControlDeck('thsv.prize-wheel', { operation: 'spin', args: { id: '1' } })).resolves.toMatchObject({ title: 'Prize Wheel', message: 'Spun.' });
    expect(controlDeck).toHaveBeenCalledWith({ operation: 'spin', args: { id: '1' } }, expect.objectContaining({ moduleId: 'thsv.prize-wheel' }));
  });

  it('refuses bad operations, disabled tabs and unknown modules before calling any hook', async () => {
    const controlDeck = vi.fn(async () => view());
    const registry = await registryWith(
      deckModule('thsv.prize-wheel', 'Prize Wheel', { controlDeck }),
      deckModule('thsv.viewer-lobby', 'Viewer Lobby', { controlDeck, settings: { enabled: false } }),
    );
    await expect(registry.runControlDeck('thsv.prize-wheel', { operation: 'Spin Now' })).rejects.toMatchObject({ name: 'ZodError' });
    await expect(registry.runControlDeck('thsv.prize-wheel', { operation: 'x'.repeat(49) })).rejects.toMatchObject({ name: 'ZodError' });
    await expect(registry.runControlDeck('thsv.prize-wheel', { operation: 'spin', extra: true } as never)).rejects.toMatchObject({ name: 'ZodError' });
    await expect(registry.runControlDeck('thsv.prize-wheel', { operation: 'spin', args: { blob: 'x'.repeat(20_000) } })).rejects.toMatchObject({ name: 'ZodError' });
    const disabled = registry.runControlDeck('thsv.viewer-lobby', { operation: 'view' });
    await expect(disabled).rejects.toBeInstanceOf(ControlDeckError);
    await expect(disabled).rejects.toMatchObject({ statusCode: 409, message: 'Turn on Viewer Lobby in Extensions to use it here.' });
    await expect(registry.runControlDeck('thsv.chat-guard', { operation: 'view' })).rejects.toMatchObject({ statusCode: 404 });
    await expect(registry.runControlDeck('thsv.goal-bars', { operation: 'view' })).rejects.toMatchObject({ statusCode: 409 });
    expect(controlDeck).not.toHaveBeenCalled();
  });

  it('refuses views that are too large or the wrong shape, and turns hook errors and timeouts into plain words', async () => {
    let result: unknown = { title: 'Prize Wheel', sections: [{ title: 'Big', items: Array.from({ length: 150 }, (_unused, index) => ({ id: String(index), label: 'x'.repeat(200), detail: 'y'.repeat(500) })) }, { title: 'More', fields: Array.from({ length: 50 }, () => ({ label: 'z', value: 'z'.repeat(500) })) }] };
    let failure: Error | undefined;
    let slow = false;
    const registry = await registryWith(deckModule('thsv.prize-wheel', 'Prize Wheel', { controlDeck: async () => {
      if (slow) await new Promise((resolve) => setTimeout(resolve, 1_000));
      if (failure) throw failure;
      return result;
    } }));
    await expect(registry.runControlDeck('thsv.prize-wheel', { operation: 'view' })).resolves.toBeDefined();
    result = { title: 'Prize Wheel', sections: Array.from({ length: 30 }, (_unused, section) => ({ title: `S${String(section)}`, fields: Array.from({ length: 50 }, () => ({ label: 'l'.repeat(80), value: 'v'.repeat(500) })) })) };
    await expect(registry.runControlDeck('thsv.prize-wheel', { operation: 'view' })).rejects.toMatchObject({ statusCode: 502, message: 'Prize Wheel sent controls this window cannot show.' });
    result = { title: 'Prize Wheel', sections: [{ title: 'Rows', items: Array.from({ length: 201 }, (_unused, index) => ({ id: String(index), label: 'row' })) }] };
    await expect(registry.runControlDeck('thsv.prize-wheel', { operation: 'view' })).rejects.toMatchObject({ statusCode: 502 });
    result = { title: 'Prize Wheel', sections: [{ title: 'Bad', actions: [{ operation: 'BAD OP', label: 'Go' }] }] };
    await expect(registry.runControlDeck('thsv.prize-wheel', { operation: 'view' })).rejects.toMatchObject({ statusCode: 502 });
    failure = new Error('The wheel is already spinning. Wait for it to stop.');
    await expect(registry.runControlDeck('thsv.prize-wheel', { operation: 'spin' })).rejects.toMatchObject({ statusCode: 409, message: 'The wheel is already spinning. Wait for it to stop.' });
    failure = undefined; slow = true;
    await expect(registry.runControlDeck('thsv.prize-wheel', { operation: 'spin' })).rejects.toMatchObject({ statusCode: 504, message: 'Prize Wheel took too long to answer. Try again.' });
  });
});
