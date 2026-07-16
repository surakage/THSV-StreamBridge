import { describe, expect, it } from 'vitest';
import type { NormalizedEvent } from '../../schemas/event.js';
import { createTestBridge, fixture, testConfig } from '../helpers.js';

describe('bridge arrival sequence', () => {
  it('overwrites caller values, follows accepted arrival order, and skips duplicates', async () => {
    const bridge = createTestBridge(await testConfig());
    const published: NormalizedEvent[] = [];
    bridge.subscribe((event) => { published.push(event); });
    await bridge.start();

    const template = await fixture();
    const first = { ...template, metadata: { ...template.metadata, bridgeSequence: 999 } };
    await bridge.simulate(first);
    await bridge.simulate(first);
    await bridge.simulate({
      ...first,
      eventId: 'sequence-second',
      source: { ...first.source, eventId: 'sequence-source-second' },
      metadata: { ...first.metadata, bridgeSequence: 1 },
    });

    expect(published.map((event) => event.metadata.bridgeSequence)).toEqual([1, 2]);
    expect(bridge.diagnostics()['lastBridgeSequence']).toBe(2);
    await bridge.stop();
  });
});
