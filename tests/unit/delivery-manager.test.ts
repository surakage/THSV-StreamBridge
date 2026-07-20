import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { OutputAdapter } from '../../bridge/adapters/adapter.js';
import { OutputCapacityError, OutputDeliveryManager } from '../../bridge/core/delivery-manager.js';
import { fixture, silentLogger } from '../helpers.js';
import { FileDeliveryOutboxStore } from '../../bridge/services/delivery-outbox-store.js';

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
    await manager.enqueue(await fixture());
    const second = await fixture('kick-follow.json');
    await expect(manager.enqueue(second)).rejects.toThrow(OutputCapacityError);
    release?.();
    await expect.poll(() => (manager.statuses()[0]?.['delivery'] as Record<string, unknown>)['acknowledged']).toBe(1);
    await manager.stop();
  });

  it('reserves batch capacity atomically before starting any delivery', async () => {
    const output = new FakeOutput();
    const started: string[] = [];
    output.deliverImpl = (event) => { started.push(event.eventId); return Promise.resolve(); };
    const manager = new OutputDeliveryManager([output], 1, 1, 3, silentLogger);
    await manager.start();
    await expect(async () => manager.enqueueBatch([await fixture(), await fixture('kick-follow.json')])).rejects.toThrow(OutputCapacityError);
    expect(started).toEqual([]);
    expect((manager.statuses()[0]?.['delivery'] as Record<string, unknown>)['enqueued']).toBe(0);
    await manager.stop();
  });

  it('degrades readiness after repeated delivery failures and recovers on success', async () => {
    const output = new FakeOutput();
    output.deliverImpl = () => Promise.reject(new Error('delivery failed'));
    const manager = new OutputDeliveryManager([output], 10, 1, 2, silentLogger);
    await manager.start();
    await manager.enqueue(await fixture());
    await manager.enqueue(await fixture('kick-follow.json'));
    await expect.poll(() => manager.ready()).toBe(false);
    output.deliverImpl = () => Promise.resolve();
    await manager.enqueue(await fixture('youtube-super-chat.json'));
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
    for (const eventId of expected) await manager.enqueue({ ...template, eventId });

    await expect.poll(() => (manager.statuses()[0]?.['delivery'] as Record<string, unknown>)['acknowledged'], { timeout: 5_000 }).toBe(100);
    expect(started).toEqual(expected);
    expect(maximumActive).toBe(1);
    await manager.stop();
  });

  it('allows another platform lane to finish while an earlier lane is stalled', async () => {
    const output = new FakeOutput();
    let releaseFirst: (() => void) | undefined;
    const completed: string[] = [];
    output.deliverImpl = (event) => {
      if (event.eventId === 'stalled-first') return new Promise<void>((resolve) => { releaseFirst = resolve; });
      completed.push(event.eventId);
      return Promise.resolve();
    };
    const manager = new OutputDeliveryManager([output], 10, 2, 3, silentLogger);
    await manager.start();
    const template = await fixture();

    await manager.enqueue({ ...template, eventId: 'stalled-first' });
    const otherLane = await fixture('kick-follow.json');
    await manager.enqueue({ ...otherLane, eventId: 'completed-second' });

    await expect.poll(() => completed).toEqual(['completed-second']);
    expect((manager.statuses()[0]?.['delivery'] as Record<string, unknown>)['acknowledged']).toBe(1);
    releaseFirst?.();
    await expect.poll(() => (manager.statuses()[0]?.['delivery'] as Record<string, unknown>)['acknowledged']).toBe(2);
    await manager.stop();
  });

  it('replays an acknowledged-pending delivery from the durable outbox after restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thsv-outbox-restart-'));
    const stateFile = join(directory, 'outbox.json');
    const firstOutput = new FakeOutput();
    firstOutput.deliverImpl = () => new Promise<void>(() => undefined);
    const first = new OutputDeliveryManager([firstOutput], 10, 1, 3, silentLogger, { store: new FileDeliveryOutboxStore(stateFile) });
    await first.start();
    await first.enqueue(await fixture());
    await first.stop(AbortSignal.abort());

    const delivered: string[] = [];
    const recoveredOutput = new FakeOutput();
    recoveredOutput.deliverImpl = (event) => { delivered.push(event.eventId); return Promise.resolve(); };
    const recovered = new OutputDeliveryManager([recoveredOutput], 10, 1, 3, silentLogger, { store: new FileDeliveryOutboxStore(stateFile) });
    await recovered.start();
    await expect.poll(() => delivered).toEqual(['sim-twitch-chat-001']);
    await expect.poll(() => (recovered.statuses()[0]?.['delivery'] as Record<string, unknown>)['acknowledged']).toBe(1);
    await recovered.stop();
  });

  it('retries with bounded backoff and dead-letters after the configured attempt limit', async () => {
    const output = new FakeOutput();
    output.deliverImpl = () => Promise.reject(new Error('permanent failure'));
    const manager = new OutputDeliveryManager([output], 10, 1, 5, silentLogger, {
      maximumAttempts: 2, initialRetryDelayMs: 10, maximumRetryDelayMs: 10,
    });
    await manager.start();
    await manager.enqueue(await fixture());
    await expect.poll(
      () => (manager.statuses()[0]?.['delivery'] as Record<string, unknown>)['deadLettered'],
      { timeout: 5_000 },
    ).toBe(1);
    expect(manager.ready()).toBe(false);
    await manager.stop();
  });

  it('retries an earlier same-lane event before delivering later events from that lane', async () => {
    const output = new FakeOutput();
    const attempts: string[] = [];
    let firstAttempts = 0;
    output.deliverImpl = (event) => {
      attempts.push(event.eventId);
      if (event.eventId === 'first-in-lane' && firstAttempts++ === 0) return Promise.reject(new Error('transient failure'));
      return Promise.resolve();
    };
    const manager = new OutputDeliveryManager([output], 10, 2, 5, silentLogger, {
      maximumAttempts: 3, initialRetryDelayMs: 20, maximumRetryDelayMs: 20,
    });
    await manager.start();
    const template = await fixture();
    await manager.enqueue({ ...template, eventId: 'first-in-lane' });
    await manager.enqueue({ ...template, eventId: 'second-in-lane' });
    await expect.poll(() => attempts).toEqual(['first-in-lane', 'first-in-lane', 'second-in-lane']);
    await manager.stop();
  });

  it('fails closed rather than discarding a corrupt durable outbox', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thsv-outbox-corrupt-'));
    const stateFile = join(directory, 'outbox.json');
    await writeFile(stateFile, '{not-json', 'utf8');
    const manager = new OutputDeliveryManager([new FakeOutput()], 10, 1, 3, silentLogger, { store: new FileDeliveryOutboxStore(stateFile) });
    await expect(manager.start()).rejects.toThrow('could not be loaded safely');
  });
});
