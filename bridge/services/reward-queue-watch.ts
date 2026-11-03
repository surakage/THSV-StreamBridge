import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { NormalizedEvent } from '../../schemas/event.js';

// Twitch rewards set to "Skip Reward Queue" arrive already fulfilled, and Twitch cannot refund a fulfilled
// redemption. Features that refuse and refund a redemption (a second First Five claim, a busy face filter) then
// cannot give the points back. This remembers which rewards arrived that way, so the setup checklist can say so.

const MAXIMUM_REWARDS = 200;

export interface SkipQueueReward {
  readonly rewardId: string;
  readonly title: string;
  readonly lastSeenAt: string;
}

export class RewardQueueWatch {
  private readonly rewards = new Map<string, SkipQueueReward>();
  private loaded = false;
  private writing: Promise<void> = Promise.resolve();

  public constructor(private readonly path: string, private readonly now: () => Date = () => new Date()) {}

  public async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const saved = JSON.parse(await readFile(this.path, 'utf8')) as { rewards?: unknown };
      for (const entry of Array.isArray(saved.rewards) ? saved.rewards.slice(0, MAXIMUM_REWARDS) : []) {
        const reward = entry as Partial<SkipQueueReward>;
        if (typeof reward.rewardId === 'string' && reward.rewardId) this.rewards.set(reward.rewardId, { rewardId: reward.rewardId.slice(0, 256), title: typeof reward.title === 'string' ? reward.title.slice(0, 100) : '', lastSeenAt: typeof reward.lastSeenAt === 'string' ? reward.lastSeenAt.slice(0, 40) : '' });
      }
    } catch { /* Nothing saved yet. */ }
  }

  /** Receives every accepted event; keeps real Twitch redemptions that skipped the reward queue. */
  public observe(event: NormalizedEvent): void {
    if (event.eventType !== 'reward.redemption' || event.platform !== 'twitch' || event.metadata.simulated) return;
    const rewardId = typeof event.payload['rewardId'] === 'string' ? event.payload['rewardId'].slice(0, 256) : '';
    if (!rewardId) return;
    const title = typeof event.payload['rewardTitle'] === 'string' ? event.payload['rewardTitle'].slice(0, 100) : '';
    const skipped = event.payload['skipsQueue'] === true;
    const known = this.rewards.get(rewardId);
    // A later redemption that waited in the queue means the creator turned Skip Queue off: forget the reward.
    if (!skipped) { if (known !== undefined) { this.rewards.delete(rewardId); this.save(); } return; }
    this.rewards.set(rewardId, { rewardId, title: title || known?.title || '', lastSeenAt: this.now().toISOString() });
    while (this.rewards.size > MAXIMUM_REWARDS) { const oldest = this.rewards.keys().next().value; if (oldest === undefined) break; this.rewards.delete(oldest); }
    if (known === undefined || known.title !== title) this.save();
  }

  public list(): readonly SkipQueueReward[] { return [...this.rewards.values()]; }

  private save(): void {
    const snapshot = JSON.stringify({ rewards: this.list() }, null, 2);
    this.writing = this.writing.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.tmp`;
      await writeFile(temporary, `${snapshot}\n`, 'utf8');
      await rename(temporary, this.path);
    }).catch(() => undefined);
  }

  public async flush(): Promise<void> { await this.writing; }
}
