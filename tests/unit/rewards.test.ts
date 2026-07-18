import { describe, expect, it } from 'vitest';
import { projectRewardRedemption } from '../../bridge/core/rewards.js';
import { fixture } from '../helpers.js';

describe('reward redemption projection', () => {
  it('projects stable Twitch reward data and rejects unrelated events', async () => {
    const source = await fixture();
    expect(projectRewardRedemption(source)).toBeUndefined();
    const event = { ...source, eventType: 'reward.redemption', source: { ...source.source, eventId: 'redeem-1' }, payload: { rewardId: 'reward-1', rewardTitle: 'Hydrate', rewardCost: 100, requiresUserInput: true, input: 'Please hydrate', redemptionId: 'redeem-1', supportedOperations: ['fulfill', 'cancel'], verifiedTransport: true }, metadata: { ...source.metadata, bridgeSequence: 10 } };
    expect(projectRewardRedemption(event)).toMatchObject({ contractVersion: '2.0.0-preview.1', sourceEventId: 'redeem-1', reward: { id: 'reward-1', title: 'Hydrate', cost: 100, input: 'Please hydrate' }, redemptionId: 'redeem-1', supportedOperations: ['fulfill', 'cancel'] });
  });
});
