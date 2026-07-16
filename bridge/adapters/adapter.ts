import type { Capability, PlatformConfig } from '../../schemas/config.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { Logger } from '../services/logger.js';

export type ConnectionState = 'disabled' | 'stopped' | 'connecting' | 'connected' | 'degraded' | 'error';

export interface AdapterStatus {
  readonly name: string;
  readonly state: ConnectionState;
  readonly capabilities: readonly Capability[];
  readonly lastEventAt?: string;
  readonly lastError?: string;
  readonly reconnectAttempts: number;
  readonly liveDelivery?: boolean;
}

export interface AdapterContext {
  readonly logger: Logger;
  readonly emit: (event: unknown, byteLength?: number) => Promise<unknown>;
}

export interface InputAdapter {
  readonly name: string;
  readonly config: PlatformConfig;
  start(context: AdapterContext): Promise<void>;
  stop(signal?: AbortSignal): Promise<void>;
  status(): AdapterStatus;
}

export interface SimulationAdapter extends InputAdapter {
  simulate(event: unknown, byteLength?: number): Promise<unknown>;
}

export interface OutputAdapter {
  readonly name: string;
  readonly enabled: boolean;
  start(): Promise<void>;
  stop(signal?: AbortSignal): Promise<void>;
  deliver(event: NormalizedEvent): Promise<void>;
  status(): Readonly<Record<string, unknown>>;
}

export abstract class ManagedAdapter implements InputAdapter {
  protected state: ConnectionState = 'stopped';
  protected lastEventAt: string | undefined;
  protected lastError: string | undefined;
  protected reconnectAttempts = 0;

  public constructor(public readonly name: string, public readonly config: PlatformConfig) {}
  public abstract start(context: AdapterContext): Promise<void>;
  public abstract stop(signal?: AbortSignal): Promise<void>;

  public status(): AdapterStatus {
    return {
      name: this.name,
      state: this.config.enabled ? this.state : 'disabled',
      capabilities: this.config.capabilities,
      ...(this.lastEventAt === undefined ? {} : { lastEventAt: this.lastEventAt }),
      ...(this.lastError === undefined ? {} : { lastError: this.lastError }),
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  protected fail(error: unknown): void {
    this.state = 'error';
    this.lastError = error instanceof Error ? error.message : String(error);
  }
}

export function isSimulationAdapter(adapter: InputAdapter): adapter is SimulationAdapter {
  return 'simulate' in adapter && typeof (adapter as Partial<SimulationAdapter>).simulate === 'function';
}
