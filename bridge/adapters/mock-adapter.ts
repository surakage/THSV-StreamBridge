import type { AdapterContext } from './adapter.js';
import { ManagedAdapter } from './adapter.js';

export class MockAdapter extends ManagedAdapter {
  public readonly name = 'mock';
  private context: AdapterContext | undefined;

  public async start(context: AdapterContext): Promise<void> {
    if (!this.config.enabled) { this.state = 'disabled'; return; }
    this.context = context;
    this.state = 'connected';
    this.lastError = undefined;
    context.logger.info('Mock adapter started');
  }

  public async stop(): Promise<void> {
    this.context = undefined;
    this.state = 'stopped';
  }

  public async simulate(event: unknown): Promise<void> {
    if (!this.config.enabled || !this.config.inputEnabled || this.context === undefined) {
      throw new Error('Mock adapter is disabled or not started');
    }
    this.lastEventAt = new Date().toISOString();
    await this.context.emit(event);
  }
}
