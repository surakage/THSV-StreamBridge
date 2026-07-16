import { describe, expect, it } from 'vitest';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { OutputAdapter } from '../../bridge/adapters/adapter.js';
import { OutputCapacityError, OutputDeliveryManager } from '../../bridge/core/delivery-manager.js';
import { fixture, silentLogger } from '../helpers.js';

class FakeOutput implements OutputAdapter {
  public readonly name = 'fake';
  public readonly enabled = true;
  public state = 'stopped';
  public deliverImpl: (event: NormalizedEvent) => Promise<void> = () => Promise.resolve();
  public async start(): Promise<void> { this.state = 'connected'; }
  public async stop(): Promise<void> { this.state = 'stopped'; }
  public async deliver(event: NormalizedEvent): Promise<void> { await this.deliverImpl(event); }
  public status(): Readonly<Record<string, unknown>> { return { name: this.name, state: this.state }; }
}

describe('OutputDeliveryManager', () => {
  it('caps queued and active deliveries', async () => {
    const output = new FakeOutput();
    let release: (() => void) | undefined;
    output.deliverImpl = () => new Promise<void>((resolve) => { release = resolve; });
    const manager = new OutputDeliveryManager([output], 1, 1, 3, silentLogger);
    await manager.start();
    manager.enqueue(await fixture());
    const second = await fixture('kick-follow.json');
    expect(() => manager.enqueue(second)).toThrow(OutputCapacityError);
    release?.();
    await expect.poll(() => (manager.statuses()[0]?.['delivery'] as Record<string, unknown>)['delivered']).toBe(1);
    await manager.stop();
  });

  it('degrades readiness after repeated delivery failures and recovers on success', async () => {
    const output = new FakeOutput();
    output.deliverImpl = () => Promise.reject(new Error('delivery failed'));
    const manager = new OutputDeliveryManager([output], 10, 1, 2, silentLogger);
    await manager.start();
    manager.enqueue(await fixture());
    manager.enqueue(await fixture('kick-follow.json'));
    await expect.poll(() => manager.ready()).toBe(false);
    output.deliverImpl = () => Promise.resolve();
    manager.enqueue(await fixture('facebook-donation.json'));
    await expect.poll(() => manager.ready()).toBe(true);
    await manager.stop();
  });
});
