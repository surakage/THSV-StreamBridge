import type { Capability, PlatformConfig } from '../../schemas/config.js';
import type { Logger } from '../services/logger.js';

export type ConnectionState = 'disabled' | 'stopped' | 'connecting' | 'connected' | 'degraded' | 'error';

export interface AdapterStatus {
  readonly name: string;
  readonly state: ConnectionState;
  readonly capabilities: readonly Capability[];
  readonly lastEventAt?: string;
  readonly lastError?: string;
  readonly reconnectAttempts: number;
}

export interface AdapterContext {
  readonly logger: Logger;
  readonly emit: (event: unknown) => Promise<void>;
}

export interface PlatformAdapter {
  readonly name: string;
  readonly config: PlatformConfig;
  start(context: AdapterContext): Promise<void>;
  stop(): Promise<void>;
  status(): AdapterStatus;
}

export abstract class ManagedAdapter implements PlatformAdapter {
  protected state: ConnectionState = 'stopped';
  protected lastEventAt: string | undefined;
  protected lastError: string | undefined;
  protected reconnectAttempts = 0;

  public abstract readonly name: string;
  public constructor(public readonly config: PlatformConfig) {}
  public abstract start(context: AdapterContext): Promise<void>;
  public abstract stop(): Promise<void>;

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
