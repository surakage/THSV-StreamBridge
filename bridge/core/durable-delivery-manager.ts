import { randomUUID } from 'node:crypto';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { OutputAdapter } from '../adapters/adapter.js';
import type { Logger } from '../services/logger.js';
import type { DeliveryDeadLetter, DeliveryOutboxRecord, DeliveryOutboxSnapshot, DeliveryOutboxStore } from '../services/delivery-outbox-store.js';
import { MemoryDeliveryOutboxStore } from '../services/delivery-outbox-store.js';
import { OutputCapacityError, OutputUnavailableError } from './delivery-errors.js';

interface DeliveryMetrics {
  enqueued: number; acknowledged: number; failedAttempts: number; deadLettered: number;
  consecutiveFailures: number; lastSuccessAt?: string; lastFailureAt?: string; lastError?: string;
}
interface OutputRuntime {
  readonly adapter: OutputAdapter;
  readonly queue: DeliveryOutboxRecord[];
  readonly active: Map<string, DeliveryOutboxRecord>;
  readonly metrics: DeliveryMetrics;
  retryTimer: NodeJS.Timeout | undefined;
}
export interface DeliveryManagerOptions {
  readonly store?: DeliveryOutboxStore;
  readonly maximumAttempts?: number;
  readonly initialRetryDelayMs?: number;
  readonly maximumRetryDelayMs?: number;
  readonly deadLetterCapacity?: number;
}

export class DurableOutputDeliveryManager {
  private readonly runtimes: OutputRuntime[];
  private readonly store: DeliveryOutboxStore;
  private readonly maximumAttempts: number;
  private readonly initialRetryDelayMs: number;
  private readonly maximumRetryDelayMs: number;
  private readonly deadLetterCapacity: number;
  private deadLetters: DeliveryDeadLetter[] = [];
  private stopping = false;
  private persistenceError: string | undefined;
  private persistChain: Promise<void> = Promise.resolve();
  private drainWaiters: Array<() => void> = [];

  public constructor(
    outputs: readonly OutputAdapter[], private readonly queueCapacity: number, private readonly concurrency: number,
    private readonly failureThreshold: number, private readonly logger: Logger, options: DeliveryManagerOptions = {},
  ) {
    this.runtimes = outputs.map((adapter) => ({
      adapter, queue: [], active: new Map(), retryTimer: undefined,
      metrics: { enqueued: 0, acknowledged: 0, failedAttempts: 0, deadLettered: 0, consecutiveFailures: 0 },
    }));
    this.store = options.store ?? new MemoryDeliveryOutboxStore();
    this.maximumAttempts = options.maximumAttempts ?? 8;
    this.initialRetryDelayMs = options.initialRetryDelayMs ?? 500;
    this.maximumRetryDelayMs = options.maximumRetryDelayMs ?? 30_000;
    this.deadLetterCapacity = options.deadLetterCapacity ?? 1_000;
  }

  public async start(): Promise<void> {
    this.stopping = false;
    const snapshot = await this.store.load();
    this.deadLetters = [...snapshot.deadLetters];
    for (const runtime of this.runtimes) runtime.queue.splice(0);
    for (const record of snapshot.pending) {
      const runtime = this.runtimes.find((candidate) => candidate.adapter.name === record.output);
      if (runtime === undefined) {
        this.addDeadLetter(record, 'Configured output no longer exists');
      } else runtime.queue.push(record);
    }
    for (const runtime of this.runtimes) {
      try { await runtime.adapter.start(); }
      catch (error) { this.logger.warn('Output adapter startup failed; durable queue remains available', { output: runtime.adapter.name, error }); }
      runtime.metrics.enqueued += runtime.queue.length;
      this.pump(runtime);
    }
    if (snapshot.pending.length !== this.pendingRecords().length) await this.persist();
  }

  public async enqueue(event: NormalizedEvent): Promise<readonly string[]> { return this.enqueueBatch([event]); }

  public async enqueueBatch(events: readonly NormalizedEvent[]): Promise<readonly string[]> {
    if (this.stopping) throw new OutputUnavailableError('Output delivery is stopping');
    const enabled = this.runtimes.filter((runtime) => runtime.adapter.enabled);
    for (const runtime of enabled) {
      if (runtime.adapter.status()['state'] !== 'connected') throw new OutputUnavailableError(`Output ${runtime.adapter.name} is not connected`);
      if (runtime.queue.length + runtime.active.size + events.length > this.queueCapacity) throw new OutputCapacityError(`Output ${runtime.adapter.name} queue is full`);
    }
    const queuedAt = new Date().toISOString();
    for (const runtime of enabled) {
      for (const event of events) runtime.queue.push({ id: randomUUID(), output: runtime.adapter.name, lane: deliveryLane(event), event, queuedAt, attempts: 0 });
      runtime.metrics.enqueued += events.length;
    }
    await this.persist();
    for (const runtime of enabled) this.pump(runtime);
    return enabled.map((runtime) => runtime.adapter.name);
  }

  public async stop(signal?: AbortSignal): Promise<void> {
    this.stopping = true;
    for (const runtime of this.runtimes) {
      if (runtime.retryTimer !== undefined) clearTimeout(runtime.retryTimer);
      runtime.retryTimer = undefined;
    }
    if (this.hasActive() && !signal?.aborted) await new Promise<void>((resolve) => {
      this.drainWaiters.push(resolve);
      signal?.addEventListener('abort', () => resolve(), { once: true });
    });
    await this.persist();
    await Promise.allSettled(this.runtimes.map((runtime) => runtime.adapter.stop(signal)));
  }

  public statuses(): ReadonlyArray<Readonly<Record<string, unknown>>> {
    return this.runtimes.map((runtime) => ({
      ...runtime.adapter.status(),
      delivery: {
        state: this.persistenceError === undefined ? 'durable' : 'persistence-error',
        queued: runtime.queue.length, active: runtime.active.size, enqueued: runtime.metrics.enqueued,
        acknowledged: runtime.metrics.acknowledged, failedAttempts: runtime.metrics.failedAttempts,
        deadLettered: this.deadLetters.filter((record) => record.output === runtime.adapter.name).length,
        consecutiveFailures: runtime.metrics.consecutiveFailures,
        degraded: this.persistenceError !== undefined || runtime.metrics.consecutiveFailures >= this.failureThreshold || this.deadLetters.some((record) => record.output === runtime.adapter.name),
        ...(runtime.metrics.lastSuccessAt === undefined ? {} : { lastSuccessAt: runtime.metrics.lastSuccessAt }),
        ...(runtime.metrics.lastFailureAt === undefined ? {} : { lastFailureAt: runtime.metrics.lastFailureAt }),
        ...(runtime.metrics.lastError === undefined ? {} : { lastError: runtime.metrics.lastError }),
      },
      outbox: this.store.status(),
    }));
  }

  public ready(): boolean {
    return this.persistenceError === undefined && this.statuses().every((status) => status['state'] === 'disabled' || (status['state'] === 'connected' && !isDeliveryDegraded(status)));
  }

  private pump(runtime: OutputRuntime): void {
    if (this.stopping || runtime.adapter.status()['state'] !== 'connected') return;
    if (runtime.retryTimer !== undefined) { clearTimeout(runtime.retryTimer); runtime.retryTimer = undefined; }
    while (runtime.active.size < this.concurrency) {
      const index = nextEligibleIndex(runtime);
      if (index < 0) break;
      const [record] = runtime.queue.splice(index, 1);
      if (record === undefined) break;
      runtime.active.set(record.id, record);
      void this.deliver(runtime, record);
    }
    const nextDue = earliestDue(runtime.queue);
    if (nextDue !== undefined && runtime.active.size < this.concurrency) {
      runtime.retryTimer = setTimeout(() => { runtime.retryTimer = undefined; this.pump(runtime); }, Math.max(1, nextDue - Date.now()));
    }
  }

  private async deliver(runtime: OutputRuntime, record: DeliveryOutboxRecord): Promise<void> {
    try {
      await runtime.adapter.deliver(record.event);
      runtime.active.delete(record.id);
      runtime.metrics.acknowledged += 1;
      runtime.metrics.consecutiveFailures = 0;
      runtime.metrics.lastSuccessAt = new Date().toISOString();
      delete runtime.metrics.lastError;
      await this.persist();
    } catch (error) {
      runtime.active.delete(record.id);
      record.attempts += 1;
      record.lastError = error instanceof Error ? error.message : String(error);
      runtime.metrics.failedAttempts += 1;
      runtime.metrics.consecutiveFailures += 1;
      runtime.metrics.lastFailureAt = new Date().toISOString();
      runtime.metrics.lastError = record.lastError;
      if (record.attempts >= this.maximumAttempts) {
        this.addDeadLetter(record, record.lastError);
        runtime.metrics.deadLettered += 1;
        this.logger.error('Output delivery moved to the dead-letter queue', { output: runtime.adapter.name, eventId: record.event.eventId, attempts: record.attempts });
      } else {
        const delay = Math.min(this.initialRetryDelayMs * 2 ** (record.attempts - 1), this.maximumRetryDelayMs);
        record.nextAttemptAt = new Date(Date.now() + delay).toISOString();
        const nextSameLane = runtime.queue.findIndex((queued) => queued.lane === record.lane);
        if (nextSameLane < 0) runtime.queue.push(record);
        else runtime.queue.splice(nextSameLane, 0, record);
        this.logger.warn('Output delivery failed; durable retry scheduled', { output: runtime.adapter.name, eventId: record.event.eventId, attempt: record.attempts, delayMs: delay, error });
      }
      await this.persist().catch(() => undefined);
    } finally {
      this.pump(runtime);
      this.resolveDrained();
    }
  }

  private addDeadLetter(record: DeliveryOutboxRecord, error: string): void {
    const { nextAttemptAt: _nextAttemptAt, ...rest } = record;
    void _nextAttemptAt;
    this.deadLetters.push({ ...rest, lastError: error, failedAt: new Date().toISOString() });
    if (this.deadLetters.length > this.deadLetterCapacity) this.deadLetters.splice(0, this.deadLetters.length - this.deadLetterCapacity);
  }

  private pendingRecords(): DeliveryOutboxRecord[] { return this.runtimes.flatMap((runtime) => [...runtime.queue, ...runtime.active.values()]); }
  private snapshot(): DeliveryOutboxSnapshot { return { version: 1, pending: this.pendingRecords(), deadLetters: this.deadLetters }; }

  private async persist(): Promise<void> {
    const snapshot = structuredClone(this.snapshot());
    const write = this.persistChain.then(() => this.store.save(snapshot));
    this.persistChain = write.catch(() => undefined);
    try { await write; this.persistenceError = undefined; }
    catch (error) {
      this.persistenceError = error instanceof Error ? error.message : String(error);
      this.logger.error('Delivery outbox persistence failed', { error });
      throw new OutputUnavailableError('Delivery outbox could not be persisted safely');
    }
  }

  private hasActive(): boolean { return this.runtimes.some((runtime) => runtime.active.size > 0); }
  private resolveDrained(): void { if (!this.hasActive()) for (const resolve of this.drainWaiters.splice(0)) resolve(); }
}

function deliveryLane(event: NormalizedEvent): string { return `${event.platform}:${event.channel.id ?? event.channel.name}`; }
function nextEligibleIndex(runtime: OutputRuntime): number {
  const activeLanes = new Set([...runtime.active.values()].map((record) => record.lane));
  const blockedLanes = new Set<string>();
  const now = Date.now();
  for (let index = 0; index < runtime.queue.length; index += 1) {
    const record = runtime.queue[index];
    if (record === undefined || activeLanes.has(record.lane) || blockedLanes.has(record.lane)) continue;
    const due = record.nextAttemptAt === undefined ? 0 : Date.parse(record.nextAttemptAt);
    if (due > now) { blockedLanes.add(record.lane); continue; }
    return index;
  }
  return -1;
}
function earliestDue(records: readonly DeliveryOutboxRecord[]): number | undefined {
  const values = records.flatMap((record) => record.nextAttemptAt === undefined ? [] : [Date.parse(record.nextAttemptAt)]).filter((value) => value > Date.now());
  return values.length === 0 ? undefined : Math.min(...values);
}
function isDeliveryDegraded(status: Readonly<Record<string, unknown>>): boolean {
  const delivery = status['delivery'];
  return delivery !== null && typeof delivery === 'object' && (delivery as Record<string, unknown>)['degraded'] === true;
}
