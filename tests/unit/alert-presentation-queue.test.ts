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

  it('invokes browser timer callbacks without binding them to the controller', () => {
    let scheduled: (() => void) | undefined;
    const controller = new AlertPresentationController({
      capacity: 20,
      defaultDurationMs: 7000,
      render: () => undefined,
      clear: () => undefined,
      playSound: () => undefined,
      onError: (error) => { throw error; },
      schedule: function (this: unknown, callback: () => void) {
        expect(this).toBeUndefined();
        scheduled = callback;
        return 1 as unknown as NodeJS.Timeout;
      },
      cancel: function (this: unknown) { expect(this).toBeUndefined(); },
    });
    controller.enqueue(alert(1, 'low'));
    controller.enqueue(alert(2, 'high'));
    expect(scheduled).toBeTypeOf('function');
  });

  it('debounces quantity storms into one summed alert after the configured window', () => {
    vi.useFakeTimers();
    const rendered: QueuedAlert[] = [];
    const controller = new AlertPresentationController({ capacity: 20, defaultDurationMs: 7000, render: (item) => rendered.push(item), clear: () => undefined, playSound: () => undefined, onError: (error) => { throw error; } });
    const aggregation = { mode: 'sum-quantity' as const, key: 'cheer:twitch:viewer', windowMs: 5000 };
    controller.enqueue({ ...alert(1), alertType: 'cheer', quantity: 100, display: { durationMs: 7000, aggregation } }, 1000);
    controller.enqueue({ ...alert(2), alertType: 'cheer', quantity: 50, display: { durationMs: 7000, aggregation } }, 2000);
    expect(rendered).toEqual([]);
    vi.advanceTimersByTime(5000);
    expect(rendered).toMatchObject([{ alertType: 'cheer', quantity: 150, aggregateCount: 2 }]);
  });

  it('shows at most five follows per ten-second burst', () => {
    const rendered: QueuedAlert[] = [];
    const controller = new AlertPresentationController({ capacity: 20, defaultDurationMs: 1, render: (item) => rendered.push(item), clear: () => undefined, playSound: () => undefined, onError: (error) => { throw error; }, schedule: () => 1 as unknown as NodeJS.Timeout });
    for (let sequence = 1; sequence <= 20; sequence += 1) controller.enqueue({ ...alert(sequence, 'low'), alertType: 'follow' }, sequence);
    controller.finish(); controller.finish(); controller.finish(); controller.finish();
    expect(rendered).toHaveLength(5);
  });

  it('paces subscriptions for at least four seconds even with a shorter card duration', () => {
    const delays: number[] = [];
    const controller = new AlertPresentationController({ capacity: 20, defaultDurationMs: 1000, render: () => undefined, clear: () => undefined, playSound: () => undefined, onError: (error) => { throw error; }, schedule: (_callback, delay) => { delays.push(delay); return 1 as unknown as NodeJS.Timeout; } });
    controller.enqueue({ ...alert(1), alertType: 'subscription', display: { durationMs: 1000 } });
    expect(delays).toEqual([4000]);
  });
});
