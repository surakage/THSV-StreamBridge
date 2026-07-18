import { rewardRedemptionV2Schema, type RewardRedemptionV2 } from '../contracts/v2/reward.js';
import { CORE_CONTRACT_VERSION } from '../contracts/v2/common.js';
import type { JsonValue, NormalizedEvent } from '../../schemas/event.js';

export class InvalidRewardRedemptionError extends Error {}

export function projectRewardRedemption(event: NormalizedEvent): RewardRedemptionV2 | undefined {
  if (event.eventType !== 'reward.redemption') return undefined;
  if (event.user === undefined) throw new InvalidRewardRedemptionError('Reward redemption requires an actor.');
  if (event.source.eventId === undefined) throw new InvalidRewardRedemptionError('Reward redemption requires a stable source event ID.');
  const sequence = event.metadata.bridgeSequence;
  if (sequence === undefined) throw new InvalidRewardRedemptionError('Reward redemption requires a bridge-assigned sequence.');
  const supportedOperations = readStringArray(event.payload['supportedOperations']).filter((value): value is 'fulfill' | 'cancel' => value === 'fulfill' || value === 'cancel');
  return rewardRedemptionV2Schema.parse({
    contractVersion: CORE_CONTRACT_VERSION, eventId: event.eventId, sourceEventId: event.source.eventId, receivedAt: event.receivedAt,
    platform: event.platform, channel: event.channel, actor: { ...event.user, badges: event.user.badges ?? [] },
    reward: {
      id: requiredText(event.payload['rewardId'], 'rewardId', 256), title: requiredText(event.payload['rewardTitle'], 'rewardTitle', 256),
      cost: nonnegativeInteger(event.payload['rewardCost'], 'rewardCost'), requiresUserInput: event.payload['requiresUserInput'] === true,
      ...(text(event.payload['input'], 2_000) === undefined ? {} : { input: text(event.payload['input'], 2_000) }),
    },
    redemptionId: requiredText(event.payload['redemptionId'], 'redemptionId', 256), supportedOperations,
    simulated: event.metadata.simulated, verifiedTransport: event.payload['verifiedTransport'] === true,
  });
}

function requiredText(value: JsonValue | undefined, field: string, maximum: number): string {
  const result = text(value, maximum);
  if (result === undefined || result.length === 0) throw new InvalidRewardRedemptionError(`${field} is required.`);
  return result;
}
function text(value: JsonValue | undefined, maximum: number): string | undefined {
  return typeof value === 'string' ? value.replace(/[\p{Cc}\s]+/gu, ' ').trim().slice(0, maximum) : undefined;
}
function nonnegativeInteger(value: JsonValue | undefined, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647) throw new InvalidRewardRedemptionError(`${field} must be a nonnegative integer.`);
  return value;
}
function readStringArray(value: JsonValue | undefined): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
