import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { OutputAdapter } from './adapter.js';
import type { FacebookPageAdapter } from './facebook-page-adapter.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import { projectMultiTimedAction } from '../core/multi-timed-actions.js';

/** Page comments have no idempotency key. Claim before posting; never replay uncertain writes. */
export class FacebookTimedOutput implements OutputAdapter {
  public readonly name = 'facebook-timed-comments';
  public readonly enabled = true;
  private claims = new Set<string>();
  private chain: Promise<void> = Promise.resolve();
  private lastError: string | undefined;
  private posted = 0;
  private readonly path: string;
  public constructor(private readonly facebook: FacebookPageAdapter, dataRoot: string, private readonly testMode: boolean) { this.path = join(dataRoot, 'state', 'facebook-timed-claims.json'); }
  public async start(): Promise<void> {
    try { const value: unknown = JSON.parse(await readFile(this.path, 'utf8')); if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) throw new Error(); this.claims = new Set(value); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.lastError = 'Facebook timed delivery history cannot be read; automatic posting is blocked.'; }
  }
  public async stop(): Promise<void> { await this.chain; }
  public status(): Readonly<Record<string, unknown>> { return { name: this.name, state: 'connected', liveDelivery: !this.testMode && this.facebook.status().enabled && this.facebook.status().outputEnabled, posted: this.posted, lastError: this.lastError }; }
  public deliver(event: NormalizedEvent): Promise<void> {
    const operation = this.chain.then(() => this.deliverOnce(event)); this.chain = operation.catch(() => undefined); return operation;
  }
  private async deliverOnce(event: NormalizedEvent): Promise<void> {
    if (event.eventType !== 'system.timed' || event.metadata.simulated || this.testMode) return;
    const action = projectMultiTimedAction(event);
    if (!action || action.targetActionId !== '7d107c29-1127-5bb1-ae8b-6f04d89a71d4' || !action.deliveryPlatforms.includes('facebook')) return;
    // Never send a stale timer after an outage, or repeat a possibly accepted Graph write.
    if (this.claims.has(event.eventId) || Date.now() - Date.parse(action.firedAt) > 120000) return;
    if (this.lastError?.includes('history cannot be read')) throw new Error(this.lastError);
    const next = [...this.claims,event.eventId].slice(-2000);
    await mkdir(join(this.path,'..'), { recursive: true });
    const temporary = this.path + '.' + randomUUID() + '.tmp';
    await writeFile(temporary, JSON.stringify(next), { mode: 0o600 }); await rename(temporary,this.path); this.claims = new Set(next);
    try { await this.facebook.postTimedComment(action.selectedMessages['facebook'] || action.selectedMessage || ''); this.posted++; this.lastError = undefined; }
    catch (error) { this.lastError = error instanceof Error ? error.message : 'Facebook timed comment failed.'; throw new Error(this.lastError, { cause: error }); }
  }
}
