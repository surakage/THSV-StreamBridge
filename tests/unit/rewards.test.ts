import { describe, expect, it } from 'vitest';
import { InvalidRewardRedemptionError, projectRewardRedemption } from '../../bridge/core/rewards.js';
import { fixture } from '../helpers.js';
import type { NormalizedEvent } from '../../schemas/event.js';

async function rewardEvent(): Promise<NormalizedEvent> {
  const source = await fixture();
  return {
    ...source,
    eventType: 'reward.redemption',
    source: { ...source.source, eventId: 'redeem-1' },
    payload: { rewardId: 'reward-1', rewardTitle: 'Hydrate', rewardCost: 100, requiresUserInput: true, input: 'Please hydrate', redemptionId: 'redeem-1', supportedOperations: ['fulfill', 'cancel'], verifiedTransport: true },
    metadata: { ...source.metadata, bridgeSequence: 10 },
  };
}

describe('reward redemption projection', () => {
  it('projects stable Twitch reward data and rejects unrelated events', async () => {
    const source = await fixture();
    expect(projectRewardRedemption(source)).toBeUndefined();
    const event = await rewardEvent();
    expect(projectRewardRedemption(event)).toMatchObject({ contractVersion: '2.0.0-preview.1', sourceEventId: 'redeem-1', reward: { id: 'reward-1', title: 'Hydrate', cost: 100, input: 'Please hydrate' }, redemptionId: 'redeem-1', supportedOperations: ['fulfill', 'cancel'] });
  });

  it('rejects a redemption without an actor', async () => {
    const { user: _user, ...event } = await rewardEvent();
    void _user;
    expect(() => projectRewardRedemption(event)).toThrow(InvalidRewardRedemptionError);
  });

  it('rejects a redemption without a stable source event ID', async () => {
    const event = await rewardEvent();
    const { eventId: _sourceEventId, ...source } = event.source;
    void _sourceEventId;
    expect(() => projectRewardRedemption({ ...event, source })).toThrow('stable source event ID');
  });

  it('rejects a redemption without a bridge-assigned sequence', async () => {
    const event = await rewardEvent();
    const { bridgeSequence: _sequence, ...metadata } = event.metadata;
    void _sequence;
    expect(() => projectRewardRedemption({ ...event, metadata })).toThrow('bridge-assigned sequence');
  });

  it.each([
    ['rewardId', 'rewardId is required.'],
    ['rewardTitle', 'rewardTitle is required.'],
    ['redemptionId', 'redemptionId is required.'],
  ] as const)('rejects a redemption without %s', async (field, message) => {
    const event = await rewardEvent();
    expect(() => projectRewardRedemption({ ...event, payload: { ...event.payload, [field]: '' } })).toThrow(message);
  });

  it.each([-1, 1.5, 2_147_483_648])('rejects invalid reward cost %s', async (rewardCost) => {
    const event = await rewardEvent();
    expect(() => projectRewardRedemption({ ...event, payload: { ...event.payload, rewardCost } })).toThrow('rewardCost must be a nonnegative integer');
  });
});
