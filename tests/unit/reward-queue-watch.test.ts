import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RewardQueueWatch } from '../../bridge/services/reward-queue-watch.js';
import type { NormalizedEvent } from '../../schemas/event.js';

function redemption(rewardId: string, skipsQueue: boolean, simulated = false, platform = 'twitch'): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: `redemption-${rewardId}-${String(skipsQueue)}`, eventType: 'reward.redemption', platform,
    source: { adapter: 'streamerbot-native', eventId: 'source-1', eventName: 'TwitchRewardRedemption' }, receivedAt: '2026-11-03T02:00:00.000Z', channel: { name: 'channel' },
    payload: { rewardId, rewardTitle: `Reward ${rewardId}`, skipsQueue }, metadata: { simulated },
  };
}

describe('Reward queue watch', () => {
  it('remembers Twitch rewards that skip the queue, forgets them once they stop, and saves the list', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'reward-queue-')), 'reward-queue.json');
    const watch = new RewardQueueWatch(path, () => new Date('2026-11-03T02:00:00.000Z'));
    await watch.load();
    watch.observe(redemption('first-five-3', true));
    watch.observe(redemption('hydrate', false));
    watch.observe(redemption('preview', true, true));
    watch.observe(redemption('kick-reward', true, false, 'kick'));
    expect(watch.list()).toEqual([{ rewardId: 'first-five-3', title: 'Reward first-five-3', lastSeenAt: '2026-11-03T02:00:00.000Z' }]);
    await watch.flush();
    const reloaded = new RewardQueueWatch(path); await reloaded.load();
    expect(reloaded.list().map((reward) => reward.rewardId)).toEqual(['first-five-3']);
    reloaded.observe(redemption('first-five-3', false));
    expect(reloaded.list()).toEqual([]);
    await reloaded.flush();
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ rewards: [] });
  });
});
