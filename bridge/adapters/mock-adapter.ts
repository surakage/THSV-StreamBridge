import { normalizedEventSchema } from '../../schemas/event.js';
import type { AdapterContext } from './adapter.js';
import { ManagedAdapter } from './adapter.js';
import { assertAdapterCapability, enforceSimulationIdentity } from './normalization.js';

export class MockAdapter extends ManagedAdapter {
  private context: AdapterContext | undefined;

  public async start(context: AdapterContext): Promise<void> {
    if (!this.config.enabled) { this.state = 'disabled'; return; }
    this.context = context;
    this.state = 'connected';
    this.lastError = undefined;
    context.logger.info('Mock adapter started', { adapter: this.name });
  }

  public async stop(): Promise<void> {
    this.context = undefined;
    this.state = 'stopped';
  }

  public async simulate(input: unknown, byteLength?: number): Promise<unknown> {
    if (!this.config.enabled || !this.config.inputEnabled || this.context === undefined) {
      throw new Error('Mock adapter is disabled or not started');
    }
    const parsed = normalizedEventSchema.safeParse(enforceSimulationIdentity(input, this.name));
    if (!parsed.success) throw parsed.error;
    assertAdapterCapability(parsed.data.eventType, this.config.capabilities);
    this.lastEventAt = new Date().toISOString();
    return this.context.emit(parsed.data, byteLength);
  }
}
