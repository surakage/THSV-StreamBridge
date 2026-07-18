import { describe, expect, it } from 'vitest';
import { normalizeStreamerBotPlatformRelay } from '../../bridge/adapters/streamerbot-native-adapter.js';

function relay(platform: 'twitch' | 'youtube' | 'kick', sourceEventType: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'thsv.platform', version: '1.0.0', platform, sourceEventType, relayId: `relay-${platform}-${sourceEventType}`,
    sourceEventId: `source-${platform}-${sourceEventType}`, receivedAt: '2026-07-17T00:00:00.000Z', simulated: true,
    userId: 'viewer-1', userName: 'viewer_login', displayName: 'Viewer Name', profilePictureUrl: '', role: 'Viewer',
    isModerator: false, isBroadcaster: false, isSubscribed: false, message: '', amount: '', currency: '', quantity: '', tier: '', itemName: '',
    channelId: 'channel-1', channelName: 'Example Channel', argumentKeys: [], ...overrides,
  };
}

describe('native Streamer.bot platform relay adapter', () => {
  it.each([
    ['twitch', 'TwitchChatMessage'],
    ['youtube', 'YouTubeMessage'],
    ['kick', 'KickChatMessage'],
  ] as const)('normalizes %s chat', (platform, sourceEventType) => {
    const event = normalizeStreamerBotPlatformRelay(relay(platform, sourceEventType, { message: ' Hello 🦥 ' }));
    expect(event).toMatchObject({ platform, eventType: 'chat.message', payload: { message: 'Hello 🦥' }, metadata: { simulated: true } });
  });

  it('normalizes Twitch roles and cheer quantity', () => {
    const event = normalizeStreamerBotPlatformRelay(relay('twitch', 'TwitchCheer', { quantity: '250', isModerator: true, isSubscribed: true, message: 'Nice stream!' }));
    expect(event).toMatchObject({ eventType: 'engagement.cheer', user: { roles: ['viewer', 'moderator', 'subscriber'] }, payload: { quantity: 250, message: 'Nice stream!' } });
  });

  it('normalizes exact YouTube Super Chat money strings', () => {
    const event = normalizeStreamerBotPlatformRelay(relay('youtube', 'YouTubeSuperChat', { amount: '5.00', currency: 'usd', message: 'Great stream' }));
    expect(event).toMatchObject({ eventType: 'engagement.super-chat', payload: { amount: '5.00', currency: 'USD', message: 'Great stream' } });
  });

  it('normalizes Kick mass gifts', () => {
    const event = normalizeStreamerBotPlatformRelay(relay('kick', 'KickMassGiftSubscription', { quantity: '10', tier: 'Tier 1' }));
    expect(event).toMatchObject({ eventType: 'channel.gift-subscription', payload: { quantity: 10, tier: 'Tier 1' } });
  });

  it.each([
    ['twitch', 'TwitchRewardRedemption', ['fulfill', 'cancel']],
    ['kick', 'KickRewardRedemption', []],
  ] as const)('normalizes %s reward redemptions with honest operations', (platform, sourceEventType, supportedOperations) => {
    const event = normalizeStreamerBotPlatformRelay(relay(platform, sourceEventType, { rewardId: 'reward-1', rewardTitle: 'Hydrate', rewardCost: '100', rewardRequiresInput: true, redemptionId: 'redeem-1', message: 'Water please' }));
    expect(event).toMatchObject({ eventType: 'reward.redemption', payload: { rewardId: 'reward-1', rewardTitle: 'Hydrate', rewardCost: 100, requiresUserInput: true, redemptionId: 'redeem-1', input: 'Water please', supportedOperations, verifiedTransport: true } });
  });

  it('marks generated fallback IDs as unverified', () => {
    const event = normalizeStreamerBotPlatformRelay(relay('twitch', 'TwitchFollow', { sourceEventId: '' }));
    expect(event.metadata.unverifiedFields).toEqual(['source.eventId']);
  });

  it('rejects unsupported trigger types', () => {
    expect(() => normalizeStreamerBotPlatformRelay(relay('twitch', 'TwitchUnknown'))).toThrow('Unsupported native Streamer.bot event type');
  });
});
