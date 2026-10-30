import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Logger } from './logger.js';

export interface WatchedApplicationVersion {
  readonly id: string;
  readonly label: string;
  readonly version: string;
}

export interface ApplicationVersionChange {
  readonly id: string;
  readonly label: string;
  readonly from: string;
  readonly to: string;
  readonly at: string;
}

export interface AppUpdateWatchOptions {
  /** Current versions of Streamer.bot, the companion apps and OBS add-on plugins. */
  readonly versions: () => Promise<readonly WatchedApplicationVersion[]>;
  /** Runs once per check that found changes: refresh compatibility data, recheck readiness, look for a StreamBridge update. */
  readonly onChange: (changes: readonly ApplicationVersionChange[]) => Promise<void>;
  readonly logger: Logger;
  readonly statePath: string;
  readonly intervalMs?: number;
  readonly now?: () => number;
}

interface StoredState {
  readonly versions: Readonly<Record<string, WatchedApplicationVersion>>;
  readonly changes: readonly ApplicationVersionChange[];
  readonly checkedAt?: string;
}

const RECENT_MS = 14 * 24 * 60 * 60 * 1000;
const MAXIMUM_CHANGES = 50;

/**
 * Notices when a program StreamBridge works with updates itself (Streamer.bot, OBS and its plugins,
 * TikTok LIVE Studio, Speaker.bot, Voicemod, TikFinity, Streamfog...). Updates like these have broken
 * triggers and scene links before without any sign until a stream. On a change it logs what moved,
 * raises one tray note, and hands the change to onChange so StreamBridge rechecks itself against the
 * new version. The first check only records versions; nothing counts as an update until a later one.
 */
export class AppUpdateWatch {
  private timer: NodeJS.Timeout | undefined;
  private state: StoredState | undefined;
  private running: Promise<void> = Promise.resolve();

  public constructor(private readonly options: AppUpdateWatchOptions) {}

  public start(): void {
    if (this.timer !== undefined) return;
    this.timer = setInterval(() => { void this.check(); }, this.options.intervalMs ?? 6 * 60 * 60 * 1000);
    this.timer.unref();
    void this.check();
  }

  public stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Runs one check now; checks never overlap. */
  public check(): Promise<void> {
    this.running = this.running.then(() => this.runCheck(), () => this.runCheck());
    return this.running;
  }

  public status(): Readonly<Record<string, unknown>> {
    const now = this.options.now?.() ?? Date.now();
    const state = this.state;
    const recent = (state?.changes ?? []).filter((change) => now - Date.parse(change.at) < RECENT_MS);
    const base = { watching: Object.values(state?.versions ?? {}).map(({ id, label, version }) => ({ id, label, version })), recentChanges: recent, ...(state?.checkedAt === undefined ? {} : { checkedAt: state.checkedAt }) };
    const latest = recent.at(-1);
    if (latest === undefined) return { ...base, signature: '' };
    const batch = recent.filter((change) => change.at === latest.at);
    const names = batch.map((change) => `${change.label} ${change.to}`);
    return {
      ...base,
      signature: `${latest.at}:${batch.map((change) => change.id).join(',')}`,
      title: batch.length === 1 ? `${batch[0]?.label ?? ''} updated` : `${String(batch.length)} programs updated`,
      text: `${names.join(', ')}. StreamBridge rechecked its triggers, scenes and connections against the new version${batch.length === 1 ? '' : 's'}. Open the pre-stream check before going live.`,
    };
  }

  /** Readiness notices for the pre-stream check; informational, they never block going live. */
  public notices(): readonly { readonly area: 'app-updates'; readonly fix: string }[] {
    const recent = this.status()['recentChanges'] as readonly ApplicationVersionChange[];
    return recent.slice(-5).map((change) => ({ area: 'app-updates', fix: `${change.label} updated from ${change.from} to ${change.to} on ${change.at.slice(0, 10)}. StreamBridge rechecked itself; if something behaves differently, run the pre-stream check and a short private test before going live.` }));
  }

  private async runCheck(): Promise<void> {
    const state = this.state ?? await this.load();
    let current: readonly WatchedApplicationVersion[];
    try { current = await this.options.versions(); } catch (error) { this.options.logger.warn('Could not read integrated program versions', { error }); return; }
    const now = this.options.now?.() ?? Date.now();
    const at = new Date(now).toISOString();
    const firstCheck = Object.keys(state.versions).length === 0;
    const changes: ApplicationVersionChange[] = [];
    const versions: Record<string, WatchedApplicationVersion> = { ...state.versions };
    for (const entry of current) {
      const previous = state.versions[entry.id];
      if (!firstCheck && previous !== undefined && previous.version !== entry.version) changes.push({ id: entry.id, label: entry.label, from: previous.version, to: entry.version, at });
      // A program first seen later (newly enabled or installed) is recorded, not reported as an update.
      versions[entry.id] = { id: entry.id, label: entry.label, version: entry.version };
    }
    this.state = { versions, changes: [...state.changes, ...changes].filter((change) => now - Date.parse(change.at) < RECENT_MS).slice(-MAXIMUM_CHANGES), checkedAt: at };
    for (const change of changes) this.options.logger.info('Integrated program updated', { app: change.label, from: change.from, to: change.to });
    await this.save();
    if (changes.length === 0) return;
    try { await this.options.onChange(changes); } catch (error) { this.options.logger.warn('Recheck after a program update failed', { error }); }
  }

  private async load(): Promise<StoredState> {
    try {
      const parsed = JSON.parse(await readFile(this.options.statePath, 'utf8')) as unknown;
      const record = isRecord(parsed) ? parsed : {};
      const versions = Object.fromEntries(Object.entries(isRecord(record['versions']) ? record['versions'] : {}).filter((entry): entry is [string, WatchedApplicationVersion] => isRecord(entry[1]) && typeof entry[1]['version'] === 'string' && typeof entry[1]['label'] === 'string'));
      const changes = (Array.isArray(record['changes']) ? record['changes'] as unknown[] : []).filter((change): change is ApplicationVersionChange => isRecord(change) && typeof change['at'] === 'string' && typeof change['label'] === 'string');
      this.state = { versions, changes, ...(typeof record['checkedAt'] === 'string' ? { checkedAt: record['checkedAt'] } : {}) };
    } catch { this.state = { versions: {}, changes: [] }; }
    return this.state;
  }

  private async save(): Promise<void> {
    try {
      await mkdir(dirname(this.options.statePath), { recursive: true });
      const temporary = `${this.options.statePath}.tmp`;
      await writeFile(temporary, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8');
      await rename(temporary, this.options.statePath);
    } catch (error) { this.options.logger.warn('Could not save integrated program versions', { error }); }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
