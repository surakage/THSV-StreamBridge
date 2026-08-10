import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import customCounter, { applyControl, stateFor } from '../../addons/custom-counter/dist/index.js';

function runtime(settings: Record<string, unknown> = {}, initial: Record<string, unknown> = {}) {
  let state = initial;
  return { value: () => state, context: { settings: { enabled: true, ...settings }, state: { read: vi.fn(async () => state), write: vi.fn(async (next: Record<string, unknown>) => { state = next; }) }, overlay: { publish: vi.fn(async () => undefined) }, chat: { send: vi.fn(async () => []) } } };
}

describe('Custom Counter add-on', () => {
  it('sanitizes corrupt state into one bounded persistent counter', () => {
    const state = stateFor({ counters: [{ id: '../bad', name: '', value: Number.POSITIVE_INFINITY }, { id: 'wins', name: 'Wins', value: 4 }] }, { defaultCounterId: 'main', defaultCounterName: 'Stream Counter', initialValue: 0, maximumCounters: 10 });
    expect(state.counters).toEqual([{ id: 'bad', name: 'bad', value: 0, visible: true }, { id: 'wins', name: 'Wins', value: 4, visible: true }]);
  });

  it('serializes mutations, presets, rename, visibility, and overlay projection', async () => {
    const test = runtime(); await customCounter.start(test.context);
    await applyControl({ operation: 'add', id: 'main', amount: 5, name: '', preset: 'default', reply: false }, undefined, test.context);
    await applyControl({ operation: 'rename', id: 'main', amount: 0, name: 'Boss Wins', preset: 'default', reply: false }, undefined, test.context);
    await applyControl({ operation: 'save', id: 'main', amount: 0, name: '', preset: 'before-reset', reply: false }, undefined, test.context);
    await applyControl({ operation: 'reset', id: 'main', amount: 0, name: '', preset: 'default', reply: false }, undefined, test.context);
    await applyControl({ operation: 'load', id: 'main', amount: 0, name: '', preset: 'before-reset', reply: false }, undefined, test.context);
    await applyControl({ operation: 'hide', id: 'main', amount: 0, name: '', preset: 'default', reply: false }, undefined, test.context);
    expect(test.value()).toMatchObject({ activeCounterId: 'main', counters: [{ id: 'main', name: 'Boss Wins', value: 5, visible: false }], presets: { 'before-reset': { value: 5 } } });
    expect(test.context.overlay.publish).toHaveBeenLastCalledWith('thsv.custom-counter.counter.update', expect.objectContaining({ name: 'Boss Wins', value: 5, visible: false }), { lane: 'persistent' });
  });

  it('rejects public chat mutations but accepts normalized moderator controls', async () => {
    const test = runtime({ commandEnabled: true, commandName: 'counter' }); await customCounter.start(test.context);
    const event = { schemaVersion: '1.0.0', eventId: 'event-1', eventType: 'command.received', platform: 'twitch', source: { adapter: 'test', eventId: 'event-1' }, channel: { name: 'channel' }, user: { id: 'viewer-1', name: 'viewer', actorType: 'human', roles: [] }, payload: { command: 'counter', arguments: ['main', '+1'] }, metadata: { simulated: false } };
    await customCounter.onEvent(event, test.context); expect(test.value()).toMatchObject({ counters: [{ value: 0 }] });
    await customCounter.onEvent({ ...event, eventId: 'event-2', user: { ...event.user, roles: ['MOD'] } }, test.context); expect(test.value()).toMatchObject({ counters: [{ value: 1 }] });
  });

  it('keeps Bridge-managed shortcut counters independent and ignores duplicate command mappings', async () => {
    const test = runtime({ commandEnabled: true, commandName: 'streamcounter', commandShortcuts: ['death=deaths|Deaths', 'win=wins|Wins', 'death=other|Wrong', 'streamcounter=overlap|Wrong'] });
    await customCounter.start(test.context);
    const event = { schemaVersion: '1.0.0', eventId: 'event-1', eventType: 'command.received', platform: 'twitch', source: { adapter: 'test', eventId: 'event-1' }, channel: { name: 'channel' }, user: { id: 'creator-1', name: 'creator', actorType: 'human', roles: ['broadcaster'] }, payload: { command: 'death', arguments: [] }, metadata: { simulated: false } };
    await customCounter.onEvent(event, test.context);
    await customCounter.onEvent({ ...event, eventId: 'event-2', payload: { command: 'win', arguments: [] } }, test.context);
    await customCounter.onEvent({ ...event, eventId: 'event-3' }, test.context);
    await customCounter.onEvent({ ...event, eventId: 'event-4', payload: { command: 'death', arguments: ['subtract', '1'] } }, test.context);
    await customCounter.onEvent({ ...event, eventId: 'event-5', payload: { command: 'win', arguments: ['set', '5'] } }, test.context);
    await customCounter.onEvent({ ...event, eventId: 'event-6', payload: { command: 'win', arguments: ['rename', 'Match', 'Wins'] } }, test.context);
    expect(test.value()).toMatchObject({ activeCounterId: 'wins', counters: [
      { id: 'main', value: 0 },
      { id: 'deaths', name: 'Deaths', value: 1 },
      { id: 'wins', name: 'Match Wins', value: 5 },
    ] });
  });

  it('ignores simulated automatic events and applies configured genuine event deltas', async () => {
    const test = runtime({ followDelta: 2 }); await customCounter.start(test.context);
    const event = { schemaVersion: '1.0.0', eventId: 'follow-1', eventType: 'channel.follow', platform: 'twitch', source: { adapter: 'test', eventId: 'follow-1' }, channel: { name: 'channel' }, user: { id: 'viewer-1', name: 'viewer', actorType: 'human', roles: [] }, payload: {}, metadata: { simulated: true } };
    await customCounter.onEvent(event, test.context); expect(test.value()).toMatchObject({ counters: [{ value: 0 }] });
    await customCounter.onEvent({ ...event, eventId: 'follow-2', metadata: { simulated: false } }, test.context); expect(test.value()).toMatchObject({ counters: [{ value: 2 }] });
  });
});
