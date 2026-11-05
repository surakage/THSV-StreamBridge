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
    const commandChat = { ...template, payload: { message: '!P "Example Viewer 🦥"' } };
    const first = await bridge.simulate(commandChat);
    const duplicate = await bridge.simulate(commandChat);

    expect(first).toMatchObject({ duplicate: false, derivedEventIds: [expect.stringMatching(/^command-/)] });
    expect(duplicate).toMatchObject({ duplicate: true, delivery: 'none' });
    expect(published.map((event) => [event.eventType, event.metadata.bridgeSequence])).toEqual([
      ['chat.message', 1], ['command.received', 2],
    ]);
    expect(published[1]?.payload).toMatchObject({ command: 'ping', invokedAs: 'p', arguments: ['Example Viewer 🦥'] });
    await bridge.stop();
  });

  it('keeps a bot account from running commands, but its chat still arrives as a bot', async () => {
    const config = await testConfig();
    const bridge = createTestBridge({ ...config, browserOverlay: { ...config.browserOverlay, chat: { ...config.browserOverlay.chat, ignoredNames: ['MyOwnAccount'] } } });
    const published: NormalizedEvent[] = [];
    bridge.subscribe((event) => { published.push(event); });
    await bridge.start();
    const template = await fixture();
    const from = (name: string, id: string): NormalizedEvent => ({
      ...template, eventId: id, source: { ...template.source, eventId: id },
      user: { name, displayName: name, actorType: 'human', roles: [], badges: [] }, payload: { message: '!P' },
    });

    await bridge.simulate(from('Sery_Bot', 'gate-bot'));
    expect(published.map((event) => [event.eventType, event.user?.actorType])).toEqual([['chat.message', 'bot']]);

    published.length = 0;
    await bridge.simulate(from('MyOwnAccount', 'gate-own'));
    expect(published.map((event) => event.eventType)).toEqual(['chat.message', 'command.received']);

    published.length = 0;
    await bridge.simulate(from('Viewer', 'gate-viewer'));
    expect(published.map((event) => [event.eventType, event.user?.actorType])).toEqual([['chat.message', 'human'], ['command.received', 'human']]);
    await bridge.stop();
  });
});
