import type { NormalizedEvent } from '../../schemas/event.js';
import type { OutputAdapter } from '../adapters/adapter.js';
import type { Logger } from '../services/logger.js';
import { OutputCapacityError, OutputUnavailableError } from './delivery-errors.js';

export { OutputCapacityError, OutputUnavailableError } from './delivery-errors.js';

interface DeliveryMetrics {
  enqueued: number;
  delivered: number;
  failed: number;
  consecutiveFailures: number;
  active: number;
  lastSuccessAt: string | undefined;
  lastFailureAt: string | undefined;
  lastError: string | undefined;
}

interface OutputRuntime {
  readonly adapter: OutputAdapter;
  readonly queue: NormalizedEvent[];
  readonly metrics: DeliveryMetrics;
}

export class LegacyInMemoryOutputDeliveryManager {
  private readonly runtimes: OutputRuntime[];
  private stopping = false;
  private drainWaiters: Array<() => void> = [];

  public constructor(
    outputs: readonly OutputAdapter[],
    private readonly queueCapacity: number,
    private readonly concurrency: number,
    private readonly failureThreshold: number,
    private readonly logger: Logger,
  ) {
    this.runtimes = outputs.map((adapter) => ({
      adapter,
      queue: [],
      metrics: { enqueued: 0, delivered: 0, failed: 0, consecutiveFailures: 0, active: 0, lastSuccessAt: undefined, lastFailureAt: undefined, lastError: undefined },
    }));
  }

  public async start(): Promise<void> {
    this.stopping = false;
    for (const runtime of this.runtimes) {
      try { await runtime.adapter.start(); }
      catch (error) { this.logger.warn('Output adapter startup failed; bridge remains active', { output: runtime.adapter.name, error }); }
    }
  }

  public enqueue(event: NormalizedEvent): readonly string[] {
    return this.enqueueBatch([event]);
  }

  public enqueueBatch(events: readonly NormalizedEvent[]): readonly string[] {
    if (this.stopping) throw new OutputUnavailableError('Output delivery is stopping');
    const enabled = this.runtimes.filter((runtime) => runtime.adapter.enabled);
    for (const runtime of enabled) {
      const state = runtime.adapter.status()['state'];
      if (state !== 'connected') throw new OutputUnavailableError(`Output ${runtime.adapter.name} is not connected`);
      if (runtime.queue.length + runtime.metrics.active + events.length > this.queueCapacity) throw new OutputCapacityError(`Output ${runtime.adapter.name} queue is full`);
    }
    for (const runtime of enabled) {
      runtime.queue.push(...events);
      runtime.metrics.enqueued += events.length;
      this.pump(runtime);
    }
    return enabled.map((runtime) => runtime.adapter.name);
  }

  public async stop(signal?: AbortSignal): Promise<void> {
    this.stopping = true;
    if (this.hasPending() && !signal?.aborted) {
      await new Promise<void>((resolve) => {
        this.drainWaiters.push(resolve);
        signal?.addEventListener('abort', () => resolve(), { once: true });
      });
    }
    if (signal?.aborted) for (const runtime of this.runtimes) runtime.queue.splice(0);
    await Promise.allSettled(this.runtimes.map((runtime) => runtime.adapter.stop(signal)));
  }

  public statuses(): ReadonlyArray<Readonly<Record<string, unknown>>> {
    return this.runtimes.map(({ adapter, queue, metrics }) => ({
      ...adapter.status(),
      delivery: {
        queueDepth: queue.length,
        active: metrics.active,
        enqueued: metrics.enqueued,
        delivered: metrics.delivered,
        failed: metrics.failed,
        consecutiveFailures: metrics.consecutiveFailures,
        degraded: metrics.consecutiveFailures >= this.failureThreshold,
        ...(metrics.lastSuccessAt === undefined ? {} : { lastSuccessAt: metrics.lastSuccessAt }),
        ...(metrics.lastFailureAt === undefined ? {} : { lastFailureAt: metrics.lastFailureAt }),
        ...(metrics.lastError === undefined ? {} : { lastError: metrics.lastError }),
      },
    }));
  }

  public ready(): boolean {
    return this.statuses().every((status) => status['state'] === 'disabled' || (status['state'] === 'connected' && !isDeliveryDegraded(status)));
  }

  private pump(runtime: OutputRuntime): void {
    while (runtime.metrics.active < this.concurrency && runtime.queue.length > 0) {
      const event = runtime.queue.shift();
      if (event === undefined) break;
      runtime.metrics.active += 1;
      void runtime.adapter.deliver(event).then(() => {
        runtime.metrics.delivered += 1;
        runtime.metrics.consecutiveFailures = 0;
        runtime.metrics.lastSuccessAt = new Date().toISOString();
        runtime.metrics.lastError = undefined;
      }).catch((error: unknown) => {
        runtime.metrics.failed += 1;
        runtime.metrics.consecutiveFailures += 1;
        runtime.metrics.lastFailureAt = new Date().toISOString();
        runtime.metrics.lastError = error instanceof Error ? error.message : String(error);
        this.logger.warn('Output delivery failed', { output: runtime.adapter.name, eventId: event.eventId, error });
      }).finally(() => {
        runtime.metrics.active -= 1;
        this.pump(runtime);
        this.resolveDrained();
      });
    }
  }

  private hasPending(): boolean {
    return this.runtimes.some((runtime) => runtime.queue.length > 0 || runtime.metrics.active > 0);
  }

  private resolveDrained(): void {
    if (this.hasPending()) return;
    for (const resolve of this.drainWaiters.splice(0)) resolve();
  }
}

export { DurableOutputDeliveryManager as OutputDeliveryManager } from './durable-delivery-manager.js';

function isDeliveryDegraded(status: Readonly<Record<string, unknown>>): boolean {
  const delivery = status['delivery'];
  return delivery !== null && typeof delivery === 'object' && (delivery as Record<string, unknown>)['degraded'] === true;
}
