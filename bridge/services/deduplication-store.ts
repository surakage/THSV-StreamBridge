import { readFile } from 'node:fs/promises';
import type { DeduplicationEntry } from '../core/deduplicator.js';
import type { Logger } from './logger.js';
import { writeJsonAtomic } from './atomic-state.js';

export interface DeduplicationStore {
  load(): Promise<readonly DeduplicationEntry[]>;
  scheduleSave(entries: readonly DeduplicationEntry[]): void;
  flush(): Promise<void>;
  status(): Readonly<Record<string, unknown>>;
}

export class NoopDeduplicationStore implements DeduplicationStore {
  public async load(): Promise<readonly DeduplicationEntry[]> { return []; }
  public scheduleSave(): void {}
  public async flush(): Promise<void> {}
  public status(): Readonly<Record<string, unknown>> { return { enabled: false }; }
}

export class FileDeduplicationStore implements DeduplicationStore {
  private pending: readonly DeduplicationEntry[] | undefined;
  private timer: NodeJS.Timeout | undefined;
  private writeQueue: Promise<void> = Promise.resolve();
  private lastError: string | undefined;

  public constructor(private readonly path: string, private readonly logger: Logger, private readonly delayMs = 100) {}

  public async load(): Promise<readonly DeduplicationEntry[]> {
    try {
      const input = JSON.parse(await readFile(this.path, 'utf8')) as unknown;
      if (!Array.isArray(input)) throw new Error('Deduplication state must be an array');
      return input.filter(isEntry);
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? (error as NodeJS.ErrnoException).code : undefined;
      if (code !== 'ENOENT') {
        this.lastError = error instanceof Error ? error.message : String(error);
        this.logger.warn('Deduplication state could not be loaded; starting with an empty cache', { error });
      }
      return [];
    }
  }

  public scheduleSave(entries: readonly DeduplicationEntry[]): void {
    this.pending = entries;
    if (this.timer !== undefined) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.commitPending();
    }, this.delayMs);
  }

  public async flush(): Promise<void> {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.commitPending();
    await this.writeQueue;
  }

  public status(): Readonly<Record<string, unknown>> {
    return { enabled: true, path: this.path, ...(this.lastError === undefined ? {} : { lastError: this.lastError }) };
  }

  private commitPending(): void {
    const entries = this.pending;
    this.pending = undefined;
    if (entries === undefined) return;
    this.writeQueue = this.writeQueue.then(() => writeJsonAtomic(this.path, entries)).then(() => {
      this.lastError = undefined;
    }).catch((error: unknown) => {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.logger.warn('Deduplication state write failed', { error });
    });
  }
}

function isEntry(value: unknown): value is DeduplicationEntry {
  return value !== null && typeof value === 'object' && typeof (value as Record<string, unknown>)['identity'] === 'string' && typeof (value as Record<string, unknown>)['expiresAt'] === 'number';
}
