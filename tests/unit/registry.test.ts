import { describe, expect, it } from 'vitest';
import { AdapterRegistry } from '../../bridge/adapters/registry.js';
import { MockAdapter } from '../../bridge/adapters/mock-adapter.js';
import { platformConfig } from '../helpers.js';
import type { OutputAdapter } from '../../bridge/adapters/adapter.js';

describe('AdapterRegistry', () => {
  it('creates a dynamically registered input adapter without core changes', () => {
    const registry = new AdapterRegistry().registerInput('plugin-provider', (name, config) => new MockAdapter(name, config));
    const [adapter] = registry.createInputs({ 'new-platform': { ...platformConfig(), adapter: 'plugin-provider' } });
    expect(adapter?.name).toBe('new-platform');
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
});
