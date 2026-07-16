import { describe, expect, it } from 'vitest';
import { MockAdapter } from '../../bridge/adapters/mock-adapter.js';
import { platformConfig, silentLogger } from '../helpers.js';

describe('adapter lifecycle', () => {
  it('does not start a disabled adapter or emit warnings', async () => {
    const adapter = new MockAdapter(platformConfig(false));
    await adapter.start({ logger: silentLogger, emit: () => Promise.resolve() });
    expect(adapter.status().state).toBe('disabled');
    await expect(adapter.simulate({})).rejects.toThrow('disabled');
  });
});
