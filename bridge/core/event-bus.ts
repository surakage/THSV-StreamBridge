import type { NormalizedEvent } from '../../schemas/event.js';

export type EventHandler = (event: NormalizedEvent) => void | Promise<void>;

export class InternalEventBus {
  private readonly handlers = new Set<EventHandler>();

  public subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  public async publish(event: NormalizedEvent): Promise<void> {
    const results = await Promise.allSettled([...this.handlers].map(async (handler) => handler(event)));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length > 0) throw new AggregateError(failures.map((failure) => failure.reason as unknown), 'Event bus handler failure');
  }
}
