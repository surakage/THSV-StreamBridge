import { createHash } from 'node:crypto';
import type { NormalizedEvent } from '../../schemas/event.js';

export interface Clock { now(): number; }
export interface DeduplicationEntry { readonly identity: string; readonly expiresAt: number; }

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

  public forget(event: NormalizedEvent): void { this.seen.delete(this.identity(event)); }

  public snapshot(): DeduplicationEntry[] {
    this.prune(this.clock.now());
    return [...this.seen].map(([identity, expiresAt]) => ({ identity, expiresAt }));
  }

  public restore(entries: readonly DeduplicationEntry[]): void {
    const now = this.clock.now();
    this.seen.clear();
    for (const entry of entries) if (entry.expiresAt > now) this.seen.set(entry.identity, entry.expiresAt);
    this.trim();
  }

  private identity(event: NormalizedEvent): string {
    if (event.source.eventId !== undefined) {
      return `${event.platform}:${event.eventType}:source:${event.source.eventId}`;
    }
    const stable = canonicalStringify({
      platform: event.platform,
      eventType: event.eventType,
      channel: normalizeIdentityText(event.channel.name),
      user: normalizeIdentityText(event.user?.name ?? ''),
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

export function canonicalStringify(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value !== 'object') throw new TypeError(`Unsupported canonical JSON value: ${typeof value}`);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalStringify(child)}`).join(',')}}`;
}

function normalizeIdentityText(value: string): string { return value.trim().toLocaleLowerCase('en-US'); }
