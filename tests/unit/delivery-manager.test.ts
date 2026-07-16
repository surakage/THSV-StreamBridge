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

  it('starts a 100-event burst in FIFO order while respecting configured concurrency', async () => {
    const output = new FakeOutput();
    const started: string[] = [];
    let active = 0;
    let maximumActive = 0;
    output.deliverImpl = async (event) => {
      started.push(event.eventId);
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, Number(event.eventId.split('-').at(-1)) % 3));
      active -= 1;
    };
    const manager = new OutputDeliveryManager([output], 100, 2, 3, silentLogger);
    await manager.start();
    const template = await fixture();
    const expected = Array.from({ length: 100 }, (_, index) => `burst-${String(index).padStart(3, '0')}`);
    for (const eventId of expected) manager.enqueue({ ...template, eventId });

    await expect.poll(() => (manager.statuses()[0]?.['delivery'] as Record<string, unknown>)['delivered'], { timeout: 5_000 }).toBe(100);
    expect(started).toEqual(expected);
    expect(maximumActive).toBe(2);
    await manager.stop();
  });
});
