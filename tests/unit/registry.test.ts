import { describe, expect, it } from 'vitest';
import { AdapterRegistry, createDefaultAdapterRegistry } from '../../bridge/adapters/registry.js';
import { MockAdapter } from '../../bridge/adapters/mock-adapter.js';
import { platformConfig, silentLogger, testConfig } from '../helpers.js';
import type { OutputAdapter } from '../../bridge/adapters/adapter.js';

describe('AdapterRegistry', () => {
  it('creates a dynamically registered input adapter without core changes', () => {
    const registry = new AdapterRegistry().registerInput('plugin-provider', (name, config) => new MockAdapter(name, config));
    const [adapter] = registry.createInputs({ 'new-platform': { ...platformConfig(), adapter: 'plugin-provider' } });
    expect(adapter?.name).toBe('new-platform');
  });

  it('uses provider declarations as the authoritative capability source', () => {
    const registry = new AdapterRegistry().registerInput('declared', (name, config) => new MockAdapter(name, config), () => ({
      legacy: ['chatInput'], supported: ['chat.input'], verification: 'verified', limitations: [],
    }));
    const config = platformConfig();
    const adapter = registry.createInputs({ twitch: { ...config, adapter: 'declared', capabilities: [] } })[0];
    expect(adapter?.status().capabilities).toEqual(['chatInput']);
    expect(registry.capabilityReports({ twitch: { ...config, adapter: 'declared' } })[0]?.capabilities['chat.input']).toMatchObject({ supported: true, verification: 'verified' });
    expect(() => registry.createInputs({ twitch: { ...config, adapter: 'declared', capabilities: ['follows'] } })).toThrow('not declared');
  });

  it('rejects duplicate and missing providers clearly', () => {
    const registry = new AdapterRegistry().registerInput('provider', (name, config) => new MockAdapter(name, config));
    expect(() => registry.registerInput('provider', (name, config) => new MockAdapter(name, config))).toThrow('already registered');
    expect(() => registry.createInputs({ unknown: { ...platformConfig(), adapter: 'missing' } })).toThrow('No input adapter registered');
  });

  it('creates outputs through the same open registry boundary', () => {
    const output: OutputAdapter = {
      name: 'plugin-output', enabled: true,
      start: () => Promise.resolve(), stop: () => Promise.resolve(), deliver: () => Promise.resolve(),
      status: () => ({ name: 'plugin-output', state: 'connected' }),
    };
    const registry = new AdapterRegistry().registerOutput('plugin-provider', () => output);
    expect(registry.createOutputs({ custom: { enabled: true, adapter: 'plugin-provider', settings: {} } })).toEqual([output]);
  });

  it('always creates internal inputs and ignores their obsolete platform seed', () => {
    const registry = new AdapterRegistry()
      .registerInput('plugin-provider', (name, config) => new MockAdapter(name, config))
      .registerInternalInput('internal-provider', () => new MockAdapter('internal', { ...platformConfig(), adapter: 'internal-provider' }));
    const inputs = registry.createInputs({
      twitch: { ...platformConfig(), adapter: 'plugin-provider' },
      legacy: { ...platformConfig(), adapter: 'internal-provider' },
    });
    expect(inputs.map((adapter) => adapter.name)).toEqual(['twitch', 'internal']);
    expect(registry.capabilityReports({ legacy: { ...platformConfig(), adapter: 'internal-provider' } })).toEqual([]);
  });

  it('creates the Streamer.bot add-on return relay without a platform configuration entry', async () => {
    const config = await testConfig();
    expect(Object.values(config.platforms).some((platform) => platform.adapter === 'streamerbot-addon-relay')).toBe(false);
    const inputs = createDefaultAdapterRegistry(config, silentLogger).createInputs(config.platforms);
    expect(inputs.map((adapter) => adapter.name)).toContain('addons');
  });
});
