import { readFile, stat } from 'node:fs/promises';
import type { NormalizedEvent } from '../../schemas/event.js';
import { normalizedEventSchema } from '../../schemas/event.js';
import { writeJsonAtomic } from './atomic-state.js';

export interface DeliveryOutboxRecord {
  readonly id: string;
  readonly output: string;
  readonly lane: string;
  readonly event: NormalizedEvent;
  readonly queuedAt: string;
  attempts: number;
  nextAttemptAt?: string;
  lastError?: string;
}

export interface DeliveryDeadLetter extends DeliveryOutboxRecord {
  readonly failedAt: string;
}

export interface DeliveryOutboxSnapshot {
  readonly version: 1;
  readonly pending: readonly DeliveryOutboxRecord[];
  readonly deadLetters: readonly DeliveryDeadLetter[];
}

export interface DeliveryOutboxStore {
  load(): Promise<DeliveryOutboxSnapshot>;
  save(snapshot: DeliveryOutboxSnapshot): Promise<void>;
  status(): Readonly<Record<string, unknown>>;
}

const EMPTY_SNAPSHOT: DeliveryOutboxSnapshot = { version: 1, pending: [], deadLetters: [] };
const MAX_STATE_FILE_BYTES = 64 * 1024 * 1024;
const MAX_RECORDS = 200_000;

export class MemoryDeliveryOutboxStore implements DeliveryOutboxStore {
  private snapshot: DeliveryOutboxSnapshot = EMPTY_SNAPSHOT;
  public async load(): Promise<DeliveryOutboxSnapshot> { return structuredClone(this.snapshot); }
  public async save(snapshot: DeliveryOutboxSnapshot): Promise<void> { this.snapshot = structuredClone(snapshot); }
  public status(): Readonly<Record<string, unknown>> { return { enabled: false, durable: false }; }
}

export class FileDeliveryOutboxStore implements DeliveryOutboxStore {
  private lastError: string | undefined;
  public constructor(private readonly path: string) {}

  public async load(): Promise<DeliveryOutboxSnapshot> {
    try {
      const information = await stat(this.path);
      if (information.size > MAX_STATE_FILE_BYTES) throw new Error(`Delivery outbox exceeds ${String(MAX_STATE_FILE_BYTES)} bytes`);
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as unknown;
      const snapshot = parseSnapshot(parsed);
      this.lastError = undefined;
      return snapshot;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY_SNAPSHOT;
      this.lastError = error instanceof Error ? error.message : String(error);
      throw new Error(`Delivery outbox could not be loaded safely: ${this.lastError}`, { cause: error });
    }
  }

  public async save(snapshot: DeliveryOutboxSnapshot): Promise<void> {
    try {
      await writeJsonAtomic(this.path, snapshot);
      this.lastError = undefined;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  public status(): Readonly<Record<string, unknown>> {
    return { enabled: true, durable: true, path: this.path, ...(this.lastError === undefined ? {} : { lastError: this.lastError }) };
  }
}

function parseSnapshot(input: unknown): DeliveryOutboxSnapshot {
  if (!isRecord(input) || input['version'] !== 1 || !Array.isArray(input['pending']) || !Array.isArray(input['deadLetters'])) throw new Error('Delivery outbox schema is invalid');
  if (input['pending'].length + input['deadLetters'].length > MAX_RECORDS) throw new Error(`Delivery outbox contains more than ${String(MAX_RECORDS)} records`);
  return {
    version: 1,
    pending: input['pending'].map((value) => parseRecord(value, false)),
    deadLetters: input['deadLetters'].map((value) => parseRecord(value, true)),
  };
}

function parseRecord(input: unknown, deadLetter: false): DeliveryOutboxRecord;
function parseRecord(input: unknown, deadLetter: true): DeliveryDeadLetter;
function parseRecord(input: unknown, deadLetter: boolean): DeliveryOutboxRecord | DeliveryDeadLetter {
  if (!isRecord(input)) throw new Error('Delivery outbox record must be an object');
  const event = normalizedEventSchema.safeParse(input['event']);
  if (!event.success || !isText(input['id'], 256) || !isText(input['output'], 64) || !isText(input['lane'], 600) || !isIso(input['queuedAt']) || !Number.isInteger(input['attempts']) || Number(input['attempts']) < 0) throw new Error('Delivery outbox record is invalid');
  if (input['nextAttemptAt'] !== undefined && !isIso(input['nextAttemptAt'])) throw new Error('Delivery outbox retry timestamp is invalid');
  if (input['lastError'] !== undefined && !isText(input['lastError'], 1_000)) throw new Error('Delivery outbox error is invalid');
  if (deadLetter && !isIso(input['failedAt'])) throw new Error('Delivery dead-letter timestamp is invalid');
  return {
    id: input['id'], output: input['output'], lane: input['lane'], event: event.data,
    queuedAt: input['queuedAt'], attempts: Number(input['attempts']),
    ...(input['nextAttemptAt'] === undefined ? {} : { nextAttemptAt: input['nextAttemptAt'] }),
    ...(input['lastError'] === undefined ? {} : { lastError: input['lastError'] }),
    ...(deadLetter ? { failedAt: input['failedAt'] } : {}),
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isText(value: unknown, maximum: number): value is string { return typeof value === 'string' && value.length > 0 && value.length <= maximum; }
function isIso(value: unknown): value is string { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
