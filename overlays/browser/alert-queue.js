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

    this.items.push({ ...alert, queuedAt, aggregateCount: 1 });
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
    this.schedule = options.schedule || setTimeout;
    this.cancel = options.cancel || clearTimeout;
    this.activeAlert = undefined;
    this.timer = undefined;
  }

  configure(capacity, defaultDurationMs) {
    this.queue.setCapacity(capacity);
    this.defaultDurationMs = defaultDurationMs;
  }

  enqueue(alert, queuedAt = Date.now()) {
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
        this.timer = this.schedule(() => this.finish(), next.display ? next.display.durationMs : this.defaultDurationMs);
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
