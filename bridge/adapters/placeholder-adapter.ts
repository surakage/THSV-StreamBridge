import type { AdapterContext } from './adapter.js';
import { ManagedAdapter } from './adapter.js';

export class PlaceholderAdapter extends ManagedAdapter {
  public constructor(name: string, config: ManagedAdapter['config'], private readonly note: string) {
    super(name, config);
  }

  public async start(context: AdapterContext): Promise<void> {
    if (!this.config.enabled) { this.state = 'disabled'; return; }
    this.state = 'degraded';
    this.lastError = this.note;
    context.logger.warn('Placeholder adapter enabled without production transport', { adapter: this.name, note: this.note });
  }

  public async stop(): Promise<void> { this.state = 'stopped'; }
}
