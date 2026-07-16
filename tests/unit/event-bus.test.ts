import { describe, expect, it, vi } from 'vitest';
import { InternalEventBus } from '../../bridge/core/event-bus.js';
import { fixture } from '../helpers.js';

describe('InternalEventBus', () => {
  it('fans out and aggregates subscriber failures', async () => {
    const bus = new InternalEventBus();
    const successful = vi.fn();
    bus.subscribe(successful);
    bus.subscribe(() => { throw new Error('first failure'); });
    bus.subscribe(() => Promise.reject(new Error('second failure')));
    await expect(bus.publish(await fixture())).rejects.toBeInstanceOf(AggregateError);
    expect(successful).toHaveBeenCalledOnce();
  });

  it('unsubscribes handlers', async () => {
    const bus = new InternalEventBus();
    const handler = vi.fn();
    const unsubscribe = bus.subscribe(handler);
    unsubscribe();
    await bus.publish(await fixture());
    expect(handler).not.toHaveBeenCalled();
  });
});
