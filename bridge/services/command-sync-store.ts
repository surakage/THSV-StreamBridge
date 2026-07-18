import { readFile } from 'node:fs/promises';
import { commandSyncStateSchema, type CommandSyncState, type SyncedCommand } from '../contracts/v2/command-sync.js';
import type { Logger } from './logger.js';
import { writeJsonAtomic } from './atomic-state.js';

const EMPTY_STATE: CommandSyncState = { version: 1, commands: [] };

export interface CommandSyncStore {
  load(): Promise<CommandSyncState>;
  scheduleSave(state: CommandSyncState): void;
  flush(): Promise<void>;
  status(): Readonly<Record<string, unknown>>;
}

export class NoopCommandSyncStore implements CommandSyncStore {
  public async load(): Promise<CommandSyncState> { return EMPTY_STATE; }
  public scheduleSave(): void {}
  public async flush(): Promise<void> {}
  public status(): Readonly<Record<string, unknown>> { return { enabled: false }; }
}

export class FileCommandSyncStore implements CommandSyncStore {
  private pending: CommandSyncState | undefined;
  private timer: NodeJS.Timeout | undefined;
  private writeQueue: Promise<void> = Promise.resolve();
  private lastError: string | undefined;

  public constructor(private readonly path: string, private readonly logger: Logger, private readonly delayMs = 100) {}

  public async load(): Promise<CommandSyncState> {
    try {
      const input = JSON.parse(await readFile(this.path, 'utf8')) as unknown;
      const parsed = commandSyncStateSchema.safeParse(input);
      if (!parsed.success) throw new Error(`Command sync state is invalid: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
      return parsed.data;
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? (error as NodeJS.ErrnoException).code : undefined;
      if (code !== 'ENOENT') {
        this.lastError = error instanceof Error ? error.message : String(error);
        // A corrupted sync mirror only degrades command-sync/drift reporting; the bridge
        // itself, and every other module, must keep starting normally. This is the
        // fault-isolation lesson from the viewer-progression/companion startup-crash fix.
        this.logger.warn('Command sync state could not be loaded; starting with an empty mirror', { error });
      }
      return EMPTY_STATE;
    }
  }

  public scheduleSave(state: CommandSyncState): void {
    this.pending = state;
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
    const state = this.pending;
    this.pending = undefined;
    if (state === undefined) return;
    this.writeQueue = this.writeQueue.then(() => writeJsonAtomic(this.path, state)).then(() => {
      this.lastError = undefined;
    }).catch((error: unknown) => {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.logger.warn('Command sync state write failed', { error });
    });
  }
}

// Reconciles the bridge's own command mirror against a fresh live inspection. This only ever
// updates entries the mirror already tracks (framework or wizard-generated commands) — it never
// adds an entry for a command it has not been told to track, which is exactly what keeps this
// from becoming a second, independently-populated command database.
export function reconcileCommandSync(previous: readonly SyncedCommand[], observed: readonly { readonly id: string; readonly name: string }[], now: string): SyncedCommand[] {
  const observedById = new Map(observed.map((entry) => [entry.id, entry] as const));
  return previous.map((entry) => {
    const live = observedById.get(entry.streamerBotId);
    if (live === undefined) return { ...entry, driftStatus: 'missing' };
    return { ...entry, name: live.name, driftStatus: live.name === entry.name ? 'in-sync' : 'renamed', lastSeenAt: now };
  });
}
