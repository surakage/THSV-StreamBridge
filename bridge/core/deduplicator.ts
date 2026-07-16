import { createHash } from 'node:crypto';
import type { NormalizedEvent } from '../../schemas/event.js';

export interface Clock { now(): number; }

export class EventDeduplicator {
  private readonly seen = new Map<string, number>();

  public constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly clock: Clock = { now: () => Date.now() },
  ) {}

  public isDuplicate(event: NormalizedEvent): boolean {
    const now = this.clock.now();
    this.prune(now);
    const identity = this.identity(event);
    const expiry = this.seen.get(identity);
    if (expiry !== undefined && expiry > now) return true;
    this.seen.set(identity, now + this.ttlMs);
    this.trim();
    return false;
  }

  public get size(): number { return this.seen.size; }

  private identity(event: NormalizedEvent): string {
    if (event.source.eventId !== undefined) {
      return `${event.platform}:${event.eventType}:source:${event.source.eventId}`;
    }
    const stable = JSON.stringify({
      platform: event.platform,
      eventType: event.eventType,
      channel: event.channel.id ?? event.channel.name,
      user: event.user?.id ?? event.user?.name ?? '',
      payload: event.payload,
    });
    return `${event.platform}:${event.eventType}:fingerprint:${createHash('sha256').update(stable).digest('hex')}`;
  }

  private prune(now: number): void {
    for (const [key, expiry] of this.seen) if (expiry <= now) this.seen.delete(key);
  }

  private trim(): void {
    while (this.seen.size > this.maxEntries) {
      const oldest = this.seen.keys().next().value;
      if (oldest === undefined) break;
      this.seen.delete(oldest);
    }
  }
}
