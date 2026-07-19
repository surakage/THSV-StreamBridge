const priorityRank = { low: 1, normal: 2, high: 3, critical: 4 };

export class AlertPresentationQueue {
  constructor(capacity) {
    this.items = [];
    this.setCapacity(capacity);
  }

  setCapacity(capacity) {
    this.capacity = Math.max(1, Number(capacity) || 1);
    this.trim();
  }

  enqueue(alert, queuedAt, activeAlert) {
    const aggregation = alert.display && alert.display.aggregation;
    if (aggregation) {
      const existing = this.items.find((queued) => queued.display && queued.display.aggregation && queued.display.aggregation.key === aggregation.key && queuedAt - queued.queuedAt <= aggregation.windowMs);
      if (existing) {
        existing.aggregateCount += 1;
        existing.quantity = Number(existing.quantity || 0) + Number(alert.quantity || 0);
        existing.queuedAt = queuedAt;
        return { aggregated: true, preempt: false };
      }
    }

    this.items.push({ ...alert, queuedAt, aggregateCount: Number(alert.aggregateCount || 1) });
    this.items.sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority] || Number(a.sequence || 0) - Number(b.sequence || 0));
    this.trim();
    return { aggregated: false, preempt: activeAlert !== undefined && priorityRank[alert.priority] > priorityRank[activeAlert.priority] };
  }

  take() { return this.items.shift(); }
  get length() { return this.items.length; }
  snapshot() { return this.items.map((item) => ({ ...item })); }

  trim() {
    while (this.items.length > this.capacity) {
      const lowestRank = Math.min(...this.items.map((queued) => priorityRank[queued.priority]));
      this.items.splice(this.items.findIndex((queued) => priorityRank[queued.priority] === lowestRank), 1);
    }
  }
}

export class AlertPresentationController {
  constructor(options) {
    this.queue = new AlertPresentationQueue(options.capacity);
    this.defaultDurationMs = options.defaultDurationMs;
    this.render = options.render;
    this.clear = options.clear;
    this.playSound = options.playSound;
    this.onError = options.onError;
    const schedule = options.schedule || ((callback, delay) => globalThis.setTimeout(callback, delay));
    const cancel = options.cancel || ((timer) => globalThis.clearTimeout(timer));
    // Keep browser timer functions detached from the controller instance. Chromium
    // rejects Window.setTimeout/clearTimeout when they are invoked with this object
    // as their receiver ("Illegal invocation").
    this.schedule = (callback, delay) => schedule(callback, delay);
    this.cancel = (timer) => cancel(timer);
    this.activeAlert = undefined;
    this.timer = undefined;
    this.pendingAggregates = new Map();
    this.recentFollows = [];
  }

  configure(capacity, defaultDurationMs) {
    this.queue.setCapacity(capacity);
    this.defaultDurationMs = defaultDurationMs;
  }

  enqueue(alert, queuedAt = Date.now()) {
    if (alert.alertType === 'follow') {
      this.recentFollows = this.recentFollows.filter((time) => queuedAt - time <= 10000);
      if (this.recentFollows.length >= 5) return;
      this.recentFollows.push(queuedAt);
    }
    const aggregation = alert.display && alert.display.aggregation;
    if (aggregation) {
      const pending = this.pendingAggregates.get(aggregation.key);
      if (pending) {
        pending.alert.aggregateCount += 1;
        pending.alert.quantity = Number(pending.alert.quantity || 0) + Number(alert.quantity || 0);
        return;
      }
      const buffered = { ...alert, aggregateCount: 1 };
      const timer = this.schedule(() => {
        this.pendingAggregates.delete(aggregation.key);
        this.enqueueReady(buffered, queuedAt + aggregation.windowMs);
      }, aggregation.windowMs);
      this.pendingAggregates.set(aggregation.key, { alert: buffered, timer });
      return;
    }
    this.enqueueReady(alert, queuedAt);
  }

  enqueueReady(alert, queuedAt) {
    const result = this.queue.enqueue(alert, queuedAt, this.activeAlert);
    if (result.aggregated) return;
    if (result.preempt) {
      this.cancel(this.timer);
      this.clear();
      this.activeAlert = undefined;
      this.timer = undefined;
    }
    this.showNext();
  }

  showNext() {
    while (this.activeAlert === undefined && this.queue.length > 0) {
      const next = this.queue.take();
      try {
        this.render(next);
        this.activeAlert = next;
        this.playSound(next);
        const baseDuration = next.display ? next.display.durationMs : this.defaultDurationMs;
        const duration = ['subscription', 'membership', 'gift-subscription'].includes(next.alertType) ? Math.max(4000, baseDuration) : baseDuration;
        this.timer = this.schedule(() => this.finish(), duration);
      } catch (error) {
        this.clear();
        this.onError(error);
      }
    }
  }

  finish() {
    this.clear();
    this.activeAlert = undefined;
    this.timer = undefined;
    this.showNext();
  }
}
