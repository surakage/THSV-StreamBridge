import { describe, expect, it } from 'vitest';
import { MockAdapter } from '../../bridge/adapters/mock-adapter.js';
import { PlaceholderAdapter } from '../../bridge/adapters/placeholder-adapter.js';
import { fixture, platformConfig, silentLogger } from '../helpers.js';
import { buildNormalizedEvent } from '../../bridge/adapters/normalization.js';

describe('adapter lifecycle', () => {
  it('does not start a disabled adapter or emit warnings', async () => {
    const adapter = new MockAdapter('mock', platformConfig(false));
    await adapter.start({ logger: silentLogger, emit: () => Promise.resolve() });
    expect(adapter.status().state).toBe('disabled');
    await expect(adapter.simulate({})).rejects.toThrow('disabled');
  });

  it('reports a deliberately enabled placeholder as degraded and then stopped', async () => {
    const adapter = new PlaceholderAdapter('future', platformConfig(true), 'not implemented');
    await adapter.start({ logger: silentLogger, emit: () => Promise.resolve() });
    expect(adapter.status()).toMatchObject({ state: 'degraded', lastError: 'not implemented' });
    await adapter.stop();
    expect(adapter.status().state).toBe('stopped');
  });

  it('provides consistent normalized event boilerplate for adapter authors', () => {
    const event = buildNormalizedEvent({
      eventType: 'plugin.special-event', platform: 'plugin', adapter: 'plugin-adapter', sourceEventName: 'Special',
      sourceEventId: 'source-1', channel: { name: 'Channel' }, payload: { value: true },
    });
    expect(event).toMatchObject({ schemaVersion: '1.0.0', eventId: 'source-1', platform: 'plugin', metadata: { simulated: false } });
  });

  it('enforces declared capabilities for simulated standard events', async () => {
    const adapter = new MockAdapter('mock', platformConfig(true));
    await adapter.start({ logger: silentLogger, emit: () => Promise.resolve() });
    const follow = await fixture('kick-follow.json');
    await expect(adapter.simulate(follow)).rejects.toThrow('required capability follows');
  });
});
