import type { Logger } from './logger.js';
import type { ObsStreamOutputSample } from './obs-direct-scene-client.js';

export interface ObsOutputHealthMonitorOptions {
  /** Active streaming outputs, or undefined while OBS is not connected. */
  readonly sample: () => Promise<readonly ObsStreamOutputSample[] | undefined>;
  readonly logger: Logger;
  readonly intervalMs?: number;
  /** How far back dropped samples are counted. */
  readonly windowMs?: number;
  /** Samples showing a drop inside the window before the output is reported. */
  readonly alertAfterDroppedSamples?: number;
  /** Continuous clean time before a reported output counts as recovered. */
  readonly recoveryMs?: number;
  readonly now?: () => number;
}

interface OutputState {
  lastDurationMs: number;
  lastSampledAt: number;
  reconnecting: boolean;
  droppedAt: number[];
  lastDropAt?: number;
  alertSince?: string;
}

const DEFAULT_INTERVAL_MS = 10_000;
const DEFAULT_WINDOW_MS = 120_000;
const DEFAULT_ALERT_AFTER = 3;
const DEFAULT_RECOVERY_MS = 60_000;

/** Creator-facing name: Aitum's "Aitum Stream Suite Output TikTok Output" becomes "TikTok Output". */
export function streamOutputLabel(name: string): string {
  if (name === 'simple_stream' || name === 'adv_stream') return 'Main stream';
  if (name === 'rtmp multitrack video') return 'Twitch Enhanced Broadcasting';
  return name.replace(/^Aitum Stream Suite Output\s+/u, '').trim() || name;
}

/**
 * Watches every active streaming output in OBS and reports one that keeps dropping and
 * reconnecting. A platform can end a LIVE on its side (TikTok does) while OBS keeps
 * retrying the dead key for hours, with every other platform still healthy. A sample
 * counts as a drop when OBS reports the output reconnecting, or when the current connection is
 * younger than the time since the previous sample (it reconnected in between).
 * A single network blip shows up in at most two samples, so it never alerts by itself.
 */
export class ObsOutputHealthMonitor {
  private readonly outputs = new Map<string, OutputState>();
  private timer: NodeJS.Timeout | undefined;
  private sampling = false;
  private obsConnected = false;
  private lastSampleAt: string | undefined;
  private lastError: string | undefined;

  public constructor(private readonly options: ObsOutputHealthMonitorOptions) {}

  public start(): void {
    if (this.timer !== undefined) return;
    this.timer = setInterval(() => void this.tick(), this.options.intervalMs ?? DEFAULT_INTERVAL_MS);
    this.timer.unref();
  }

  public stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  public status(): Readonly<Record<string, unknown>> {
    const outputs = [...this.outputs.entries()].map(([name, state]) => ({
      name,
      label: streamOutputLabel(name),
      reconnecting: state.reconnecting,
      droppedSamples: state.droppedAt.length,
      alerting: state.alertSince !== undefined,
      ...(state.alertSince === undefined ? {} : { alertSince: state.alertSince }),
    }));
    const alerts = outputs.filter((output) => output.alerting);
    return {
      running: this.timer !== undefined,
      obsConnected: this.obsConnected,
      intervalMs: this.options.intervalMs ?? DEFAULT_INTERVAL_MS,
      ...(this.lastSampleAt === undefined ? {} : { lastSampleAt: this.lastSampleAt }),
      ...(this.lastError === undefined ? {} : { lastError: this.lastError }),
      // Whether any OBS streaming output is live, left out until OBS has been sampled so a bridge
      // restart mid-stream is not mistaken for a stop. The tray uses it to remind the creator to
      // start and end their LIVE in TikTok LIVE Studio, which has no hotkey or API for it.
      ...(this.obsConnected ? { streaming: this.outputs.size > 0 } : {}),
      outputs,
      alerts,
      // The tray shows a notification whenever this changes to a non-empty value.
      signature: alerts.map((alert) => `${alert.name}:${String(alert.alertSince)}`).join('|'),
    };
  }

  /** Takes one sample. Public so tests and callers can drive it without timers. */
  public async tick(): Promise<void> {
    if (this.sampling) return;
    this.sampling = true;
    try {
      const samples = await this.options.sample();
      this.lastError = undefined;
      this.lastSampleAt = new Date(this.now()).toISOString();
      if (samples === undefined) { this.obsConnected = false; this.forgetAll('OBS disconnected'); return; }
      this.obsConnected = true;
      this.evaluate(samples);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    } finally {
      this.sampling = false;
    }
  }

  private evaluate(samples: readonly ObsStreamOutputSample[]): void {
    const now = this.now();
    const windowMs = this.options.windowMs ?? DEFAULT_WINDOW_MS;
    const seen = new Set<string>();
    for (const sample of samples) {
      seen.add(sample.name);
      const previous = this.outputs.get(sample.name);
      if (previous === undefined) {
        // A newly started output is the baseline; its first sample is not a drop.
        this.outputs.set(sample.name, { lastDurationMs: sample.durationMs, lastSampledAt: now, reconnecting: sample.reconnecting, droppedAt: sample.reconnecting ? [now] : [], ...(sample.reconnecting ? { lastDropAt: now } : {}) });
        continue;
      }
      // A healthy connection ages by the full time between samples; allow half of it for frame timing.
      const reconnectedSinceLastSample = sample.durationMs < previous.lastDurationMs || sample.durationMs < (now - previous.lastSampledAt) / 2;
      const dropped = sample.reconnecting || reconnectedSinceLastSample;
      previous.lastDurationMs = sample.durationMs;
      previous.lastSampledAt = now;
      previous.reconnecting = sample.reconnecting;
      previous.droppedAt = previous.droppedAt.filter((at) => now - at <= windowMs);
      if (dropped) { previous.droppedAt.push(now); previous.lastDropAt = now; }
      const label = streamOutputLabel(sample.name);
      if (previous.alertSince === undefined && previous.droppedAt.length >= (this.options.alertAfterDroppedSamples ?? DEFAULT_ALERT_AFTER)) {
        previous.alertSince = new Date(now).toISOString();
        this.options.logger.warn('Stream output keeps disconnecting and reconnecting; that platform may have ended the LIVE or rejected the stream key', { output: label, droppedSamples: previous.droppedAt.length, windowSeconds: Math.round(windowMs / 1000) });
      } else if (previous.alertSince !== undefined && !dropped && now - (previous.lastDropAt ?? now) >= (this.options.recoveryMs ?? DEFAULT_RECOVERY_MS)) {
        delete previous.alertSince;
        // Start counting afresh, so drops from before the recovery cannot re-trigger the alert.
        previous.droppedAt = [];
        this.options.logger.info('Stream output is stable again', { output: label });
      }
    }
    for (const name of [...this.outputs.keys()]) if (!seen.has(name)) this.forget(name, 'stopped');
  }

  private forgetAll(reason: string): void { for (const name of [...this.outputs.keys()]) this.forget(name, reason); }

  private forget(name: string, reason: string): void {
    const state = this.outputs.get(name);
    this.outputs.delete(name);
    if (state?.alertSince !== undefined) this.options.logger.info('Stream output alert cleared', { output: streamOutputLabel(name), reason });
  }

  private now(): number { return this.options.now?.() ?? Date.now(); }
}
