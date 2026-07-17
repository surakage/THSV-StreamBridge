import { readFile } from 'node:fs/promises';
import { writeJsonAtomic } from './atomic-state.js';

export interface CompanionStore {
  load(): Promise<unknown>;
  save(value: unknown): Promise<void>;
  flush(): Promise<void>;
  status(): Readonly<Record<string, unknown>>;
}

export class FileCompanionStore implements CompanionStore {
  private writeChain: Promise<void> = Promise.resolve();
  private lastError: string | undefined;

  public constructor(private readonly path: string) {}

  public async load(): Promise<unknown> {
    try { return JSON.parse(await readFile(this.path, 'utf8')) as unknown; }
    catch (error) {
      if (error !== null && typeof error === 'object' && (error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw new Error(`Unable to load companion state: ${formatError(error)}`, { cause: error });
    }
  }

  public async save(value: unknown): Promise<void> {
    const write = this.writeChain.then(() => writeJsonAtomic(this.path, value));
    this.writeChain = write.catch(() => undefined);
    try { await write; this.lastError = undefined; }
    catch (error) { this.lastError = formatError(error); throw error; }
  }

  public async flush(): Promise<void> {
    await this.writeChain;
    if (this.lastError !== undefined) throw new Error(`Unable to persist companion state: ${this.lastError}`);
  }

  public status(): Readonly<Record<string, unknown>> { return { type: 'file', path: this.path, ...(this.lastError === undefined ? {} : { lastError: this.lastError }) }; }
}

export class NoopCompanionStore implements CompanionStore {
  public async load(): Promise<unknown> { return undefined; }
  public async save(value: unknown): Promise<void> { void value; }
  public async flush(): Promise<void> { return Promise.resolve(); }
  public status(): Readonly<Record<string, unknown>> { return { type: 'none' }; }
}

function formatError(error: unknown): string { return error instanceof Error ? error.message : String(error); }
