import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlertPresentationController, AlertPresentationQueue, type QueuedAlert } from '../../overlays/browser/alert-queue.js';

function alert(sequence: number, priority: QueuedAlert['priority'] = 'normal', aggregation?: { readonly mode: 'sum-quantity'; readonly key: string; readonly windowMs: number }): QueuedAlert {
  return {
    sequence,
    priority,
    platform: 'tiktok',
    quantity: 1,
    display: aggregation === undefined ? { durationMs: 7000 } : { durationMs: 7000, aggregation },
  };
}

describe('browser alert presentation queue', () => {
  afterEach(() => vi.useRealTimers());
  it('keeps a gift storm bounded and aggregates matching queued gifts', () => {
    const bounded = new AlertPresentationQueue(20);
    for (let sequence = 1; sequence <= 200; sequence += 1) bounded.enqueue(alert(sequence), sequence, undefined);
    expect(bounded.length).toBe(20);

    const aggregated = new AlertPresentationQueue(20);
    const aggregation = { mode: 'sum-quantity' as const, key: 'gift:tiktok:viewer:rose', windowMs: 5000 };
    for (let sequence = 1; sequence <= 200; sequence += 1) aggregated.enqueue(alert(sequence, 'normal', aggregation), sequence, undefined);
    expect(aggregated.snapshot()).toMatchObject([{ aggregateCount: 200, quantity: 200 }]);
  });

  it('puts a raid ahead of queued low-priority alerts and requests active-card preemption', () => {
    const queue = new AlertPresentationQueue(20);
    queue.enqueue(alert(1, 'low'), 1, undefined);
    const result = queue.enqueue({ ...alert(2, 'high'), platform: 'twitch', alertType: 'raid' }, 2, alert(0, 'low'));
    expect(result.preempt).toBe(true);
    expect(queue.take()).toMatchObject({ sequence: 2, alertType: 'raid', priority: 'high' });
  });

  it('clears an expired alert and presents the next queued alert after its configured duration', () => {
    vi.useFakeTimers();
    const rendered: number[] = [];
    let clears = 0;
    const controller = new AlertPresentationController({
      capacity: 20,
      defaultDurationMs: 7000,
      render: (item) => rendered.push(item.sequence ?? -1),
      clear: () => { clears += 1; },
      playSound: () => undefined,
      onError: (error) => { throw error; },
    });
    controller.enqueue({ ...alert(1, 'low'), display: { durationMs: 1000 } }, 1);
    controller.enqueue({ ...alert(2, 'low'), display: { durationMs: 2000 } }, 2);
    expect(rendered).toEqual([1]);
    vi.advanceTimersByTime(1000);
    expect(clears).toBe(1);
    expect(rendered).toEqual([1, 2]);
  });
});
