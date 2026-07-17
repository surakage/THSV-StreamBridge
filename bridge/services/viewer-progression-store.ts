import { readFile } from 'node:fs/promises';
import { writeJsonAtomic } from './atomic-state.js';

export interface ViewerProgressionStore {
  load(): Promise<unknown>;
  save(value: unknown): Promise<void>;
  scheduleSave(value: unknown): void;
  flush(): Promise<void>;
  status(): Readonly<Record<string, unknown>>;
}

export class FileViewerProgressionStore implements ViewerProgressionStore {
  private timer: NodeJS.Timeout | undefined;
  private pending: unknown;
  private writeChain: Promise<void> = Promise.resolve();
  private lastError: string | undefined;

  public constructor(private readonly path: string, private readonly debounceMs = 100) {}

  public async load(): Promise<unknown> {
    try { return JSON.parse(await readFile(this.path, 'utf8')) as unknown; }
    catch (error) {
      if (isMissing(error)) return undefined;
      throw new Error(`Unable to load viewer progression state: ${formatError(error)}`, { cause: error });
    }
  }

  public async save(value: unknown): Promise<void> {
    this.pending = undefined;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    const write = this.writeChain.then(() => writeJsonAtomic(this.path, value));
    this.writeChain = write.catch(() => undefined);
    try { await write; this.lastError = undefined; }
    catch (error) { this.lastError = formatError(error); throw error; }
  }

  public scheduleSave(value: unknown): void {
    this.pending = value;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.persistPending().catch((error: unknown) => { this.lastError = formatError(error); });
    }, this.debounceMs);
  }

  public async flush(): Promise<void> {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    await this.persistPending();
    await this.writeChain;
    if (this.lastError !== undefined) throw new Error(`Unable to persist viewer progression state: ${this.lastError}`);
  }

  public status(): Readonly<Record<string, unknown>> { return { type: 'file', path: this.path, pending: this.pending !== undefined, ...(this.lastError === undefined ? {} : { lastError: this.lastError }) }; }

  private async persistPending(): Promise<void> {
    const value = this.pending;
    this.pending = undefined;
    if (value === undefined) return;
    await this.save(value);
  }
}

export class NoopViewerProgressionStore implements ViewerProgressionStore {
  public async load(): Promise<unknown> { return undefined; }
  public async save(value: unknown): Promise<void> { void value; return Promise.resolve(); }
  public scheduleSave(value: unknown): void { void value; }
  public async flush(): Promise<void> { return Promise.resolve(); }
  public status(): Readonly<Record<string, unknown>> { return { type: 'none', pending: false }; }
}

function isMissing(error: unknown): boolean { return error !== null && typeof error === 'object' && (error as NodeJS.ErrnoException).code === 'ENOENT'; }
function formatError(error: unknown): string { return error instanceof Error ? error.message : String(error); }
