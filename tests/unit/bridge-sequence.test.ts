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

  it('derives configured commands centrally after public chat in consecutive sequence order', async () => {
    const bridge = createTestBridge(await testConfig());
    const published: NormalizedEvent[] = [];
    bridge.subscribe((event) => { published.push(event); });
    await bridge.start();
    const template = await fixture();
    const commandChat = { ...template, payload: { message: '!SO "Example Viewer 🦥"' } };
    const first = await bridge.simulate(commandChat);
    const duplicate = await bridge.simulate(commandChat);

    expect(first).toMatchObject({ duplicate: false, derivedEventIds: [expect.stringMatching(/^command-/)] });
    expect(duplicate).toMatchObject({ duplicate: true, delivery: 'none' });
    expect(published.map((event) => [event.eventType, event.metadata.bridgeSequence])).toEqual([
      ['chat.message', 1], ['command.received', 2],
    ]);
    expect(published[1]?.payload).toMatchObject({ command: 'shoutout', invokedAs: 'so', arguments: ['Example Viewer 🦥'] });
    await bridge.stop();
  });
});
