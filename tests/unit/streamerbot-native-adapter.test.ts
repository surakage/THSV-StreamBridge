import { describe, expect, it } from 'vitest';
import { normalizeStreamerBotPlatformRelay } from '../../bridge/adapters/streamerbot-native-adapter.js';

function relay(platform: 'twitch' | 'youtube' | 'kick' | 'streamlabs' | 'kofi', sourceEventType: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'thsv.platform', version: '1.0.0', platform, sourceEventType, relayId: `relay-${platform}-${sourceEventType}`,
    sourceEventId: `source-${platform}-${sourceEventType}`, sourceEventIdVerified: true, receivedAt: '2026-07-17T00:00:00.000Z', simulated: true,
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

  it('normalizes Twitch power-up redemption as cheer-like engagement', () => {
    const event = normalizeStreamerBotPlatformRelay(relay('twitch', 'TwitchPowerUpRedemption', {
      quantity: '42', userName: 'kofistreambot', displayName: 'KofiStreamBot',
      powerUpType: 'message_effect', counter: '1', tempCounter: '1', userCounter: '1', tempUserCounter: '1',
    }));
    expect(event).toMatchObject({
      eventType: 'engagement.cheer',
      payload: {
        quantity: 42,
        powerUpType: 'message_effect',
        counter: 1,
        userCounter: 1,
      },
      user: {
        name: 'kofistreambot',
        displayName: 'KofiStreamBot',
      },
    });
  });

  it('normalizes Twitch gift paid upgrade as subscription', () => {
    const event = normalizeStreamerBotPlatformRelay(relay('twitch', 'TwitchGiftPaidUpgrade', { tier: '3000', userName: 'suraruisuh', displayName: 'Suraruisuh' }));
    expect(event).toMatchObject({
      eventType: 'channel.subscription',
      payload: { tier: '3000' },
      user: { name: 'suraruisuh', displayName: 'Suraruisuh' },
    });
  });

  it('normalizes Twitch pay-it-forward as a single gifted subscription', () => {
    const event = normalizeStreamerBotPlatformRelay(relay('twitch', 'TwitchPayItForward', { userName: 'vartaras', displayName: 'Vartaras' }));
    expect(event).toMatchObject({
      eventType: 'channel.gift-subscription',
      payload: { quantity: 1 },
      user: { name: 'vartaras', displayName: 'Vartaras' },
    });
  });

  it('normalizes Twitch prime paid upgrade as subscription', () => {
    const event = normalizeStreamerBotPlatformRelay(relay('twitch', 'TwitchPrimePaidUpgrade', { tier: '1000', userName: 'soundalerts', displayName: 'SoundAlerts' }));
    expect(event).toMatchObject({
      eventType: 'channel.subscription',
      payload: { tier: '1000' },
      user: { name: 'soundalerts', displayName: 'SoundAlerts' },
    });
  });

  it('normalizes Twitch hype train start as milestone', () => {
    const event = normalizeStreamerBotPlatformRelay(relay('twitch', 'TwitchHypeTrainStart', {
      userName: 'champrul',
      displayName: 'Champrul',
      quantity: '420',
      hypeTrainId: 'e22e65b7-ba41-4a87-a3f2-33d0af009502',
      hypeTrainLevel: '1',
      hypeTrainStartedAt: '2026-07-24T03:52:08.000Z',
      hypeTrainExpiresAt: '2026-07-24T03:54:08.000Z',
      hypeTrainDuration: '120',
      hypeTrainContributors: '1',
      hypeTrainPercent: '50%',
      hypeTrainPercentDecimal: '0.5',
      hypeTrainTopBitsUser: 'champrul',
      hypeTrainTopBitsUserName: 'champrul',
      hypeTrainTopBitsUserId: '238943193',
      hypeTrainTopBitsTotal: '420',
    }));
    expect(event).toMatchObject({
      eventType: 'engagement.milestone',
      payload: {
        metric: 'hype-train',
        value: 1,
        hypeTrainId: 'e22e65b7-ba41-4a87-a3f2-33d0af009502',
        hypeTrainTopBitsUserId: '238943193',
      },
      user: {
        name: 'champrul',
        displayName: 'Champrul',
      },
    });
  });

  it('normalizes Twitch hype train level up as milestone', () => {
    const event = normalizeStreamerBotPlatformRelay(relay('twitch', 'TwitchHypeTrainLevelUp', {
      userName: 'suraruisuh_bot',
      displayName: 'Suraruisuh Bot',
      quantity: '420',
      hypeTrainId: 'd7a15d6c-2c58-49d3-832d-012a34f65b2f',
      hypeTrainLevel: '42',
      hypeTrainPrevLevel: '1',
      hypeTrainStartedAt: '2026-07-24T03:52:10.000Z',
      hypeTrainExpiresAt: '2026-07-24T03:54:10.000Z',
      hypeTrainDuration: '120',
      hypeTrainContributors: '1',
      hypeTrainPercent: '50%',
      hypeTrainPercentDecimal: '0.5',
      hypeTrainTopBitsUser: 'suraruisuh_bot',
      hypeTrainTopBitsUserName: 'suraruisuh_bot',
      hypeTrainTopBitsUserId: '708932066',
      hypeTrainTopBitsTotal: '420',
    }));
    expect(event).toMatchObject({
      eventType: 'engagement.milestone',
      payload: {
        metric: 'hype-train',
        value: 42,
        hypeTrainId: 'd7a15d6c-2c58-49d3-832d-012a34f65b2f',
        hypeTrainPrevLevel: '1',
        hypeTrainTopBitsUserId: '708932066',
      },
      user: {
        name: 'suraruisuh_bot',
        displayName: 'Suraruisuh Bot',
      },
    });
  });

  it('normalizes Twitch hype train update as milestone', () => {
    const event = normalizeStreamerBotPlatformRelay(relay('twitch', 'TwitchHypeTrainUpdate', {
      userName: 'soundalerts',
      displayName: 'SoundAlerts',
      quantity: '420',
      hypeTrainId: 'ab67e578-f961-4cb0-b57d-fe66d45c8872',
      hypeTrainLevel: '2',
      hypeTrainPrevLevel: '1',
      hypeTrainStartedAt: '2026-07-24T03:52:11.000Z',
      hypeTrainExpiresAt: '2026-07-24T03:54:11.000Z',
      hypeTrainDuration: '120',
      hypeTrainContributors: '1',
      hypeTrainPercent: '50%',
      hypeTrainPercentDecimal: '0.5',
      hypeTrainTopBitsUser: 'soundalerts',
      hypeTrainTopBitsUserName: 'soundalerts',
      hypeTrainTopBitsUserId: '216527497',
      hypeTrainTopBitsTotal: '420',
    }));
    expect(event).toMatchObject({
      eventType: 'engagement.milestone',
      payload: {
        metric: 'hype-train',
        value: 2,
        hypeTrainId: 'ab67e578-f961-4cb0-b57d-fe66d45c8872',
        hypeTrainPrevLevel: '1',
        hypeTrainTopBitsUserId: '216527497',
      },
      user: {
        name: 'soundalerts',
        displayName: 'SoundAlerts',
      },
    });
  });

  it('normalizes Twitch hype train end as milestone', () => {
    const event = normalizeStreamerBotPlatformRelay(relay('twitch', 'TwitchHypeTrainEnd', {
      userName: 'sery_bot',
      displayName: 'Sery_Bot',
      quantity: '420',
      hypeTrainId: '98d05c16-0f42-4081-bf4f-8becde6f1952',
      hypeTrainLevel: '1',
      hypeTrainStartedAt: '2026-07-24T03:47:12.000Z',
      hypeTrainContributors: '1',
      hypeTrainPercent: '50%',
      hypeTrainPercentDecimal: '0.5',
      hypeTrainTopBitsUser: 'sery_bot',
      hypeTrainTopBitsUserName: 'Sery_Bot',
      hypeTrainTopBitsUserId: '402337290',
      hypeTrainTopBitsTotal: '420',
    }));
    expect(event).toMatchObject({
      eventType: 'engagement.milestone',
      payload: {
        metric: 'hype-train',
        value: 1,
        hypeTrainId: '98d05c16-0f42-4081-bf4f-8becde6f1952',
        hypeTrainTopBitsUserId: '402337290',
      },
      user: {
        name: 'sery_bot',
        displayName: 'Sery_Bot',
      },
    });
  });

  it('normalizes Twitch modiversary as a public milestone', () => {
    const event = normalizeStreamerBotPlatformRelay(relay('twitch', 'TwitchModiversary', {
      userName: 'suraruisuh',
      displayName: 'Suraruisuh',
      quantity: '420',
      months: '42',
      fromSharedChat: 'True',
    }));
    expect(event).toMatchObject({
      eventType: 'engagement.milestone',
      payload: {
        metric: 'modiversary',
        value: 42,
        fromSharedChat: true,
      },
      user: {
        name: 'suraruisuh',
        displayName: 'Suraruisuh',
      },
    });
  });

  it('normalizes Twitch watch streak as milestone', () => {
    const event = normalizeStreamerBotPlatformRelay(relay('twitch', 'TwitchWatchStreak', {
      userName: 'kofistreambot',
      displayName: 'KofiStreamBot',
      watchStreak: '42',
    }));
    expect(event).toMatchObject({
      eventType: 'engagement.milestone',
      payload: {
        metric: 'watch-streak',
        value: 42,
      },
      user: {
        name: 'kofistreambot',
        displayName: 'KofiStreamBot',
      },
    });
  });

  it('normalizes Twitch ad runs as custom system events', () => {
    const event = normalizeStreamerBotPlatformRelay(relay('twitch', 'TwitchAdRun', {
      userName: 'suraruisuh',
      displayName: 'Suraruisuh',
      adLength: '90',
      adLengthMs: '90000',
      adScheduled: 'True',
    }));
    expect(event).toMatchObject({
      eventType: 'system.custom',
      payload: {
        adLength: '90',
        adLengthMs: '90000',
        adScheduled: true,
      },
      user: {
        name: 'suraruisuh',
        displayName: 'Suraruisuh',
      },
    });
  });

  it('normalizes Twitch upcoming ad as custom system events', () => {
    const event = normalizeStreamerBotPlatformRelay(relay('twitch', 'TwitchUpcomingAd', {
      userName: 'suraruisuh',
      displayName: 'Suraruisuh',
      minutes: '3',
      nextAdAt: '7/24/2026 3:57:36 AM',
      snoozesLeft: '3',
      adLength: '60',
    }));
    expect(event).toMatchObject({
      eventType: 'system.custom',
      payload: {
        minutes: '3',
        nextAdAt: '7/24/2026 3:57:36 AM',
        snoozesLeft: '3',
        adLength: '60',
      },
      user: {
        name: 'suraruisuh',
        displayName: 'Suraruisuh',
      },
    });
  });

  it('normalizes exact YouTube Super Chat money strings', () => {
    const event = normalizeStreamerBotPlatformRelay(relay('youtube', 'YouTubeSuperChat', { amount: '5.00', currency: 'usd', message: 'Great stream' }));
    expect(event).toMatchObject({ eventType: 'engagement.super-chat', payload: { amount: '5.00', currency: 'USD', message: 'Great stream' } });
  });

  it('normalizes Kick mass gifts', () => {
    const event = normalizeStreamerBotPlatformRelay(relay('kick', 'KickMassGiftSubscription', { quantity: '10', tier: 'Tier 1' }));
    expect(event).toMatchObject({ eventType: 'channel.gift-subscription', payload: { quantity: 10, tier: 'Tier 1' } });
  });

  it('normalizes YouTube jewels gifts as alerts', () => {
    const event = normalizeStreamerBotPlatformRelay(relay('youtube', 'YouTubeJewelsGifted', {
      itemName: 'Test Gift',
      quantity: '42',
      giftUrl: 'https://example.com/video',
      altText: 'This is a test gift',
      altTextLanguage: 'en',
      durationInSeconds: '10',
      hasVisualEffect: 'false',
      isCombo: 'false',
      comboCount: '0',
      eventTimestamp: '7/24/2026 3:35:53 AM',
    }));
    expect(event).toMatchObject({
      eventType: 'engagement.gift',
      payload: {
        itemName: 'Test Gift',
        quantity: 42,
        giftUrl: 'https://example.com/video',
        altText: 'This is a test gift',
        altTextLanguage: 'en',
        durationInSeconds: '10',
        hasVisualEffect: false,
        isCombo: false,
        comboCount: 0,
        eventTimestamp: '7/24/2026 3:35:53 AM',
      },
    });
  });

  it('normalizes Streamlabs donation as engagement donation', () => {
    const event = normalizeStreamerBotPlatformRelay(
      relay('streamlabs', 'StreamlabsDonation', {
        userName: 'TestUser',
        displayName: 'TestUser',
        amount: '42',
        currency: 'USD',
        message: 'This is a Streamlabs donation test',
      }),
    );
    expect(event).toMatchObject({
      eventType: 'engagement.donation',
      user: {
        name: 'TestUser',
      },
      payload: {
        amount: '42',
        currency: 'USD',
        message: 'This is a Streamlabs donation test',
      },
    });
  });

  it('normalizes Streamlabs merchandise as a purchase alert', () => {
    const event = normalizeStreamerBotPlatformRelay(
      relay('streamlabs', 'StreamlabsMerchandise', {
        userName: 'TestUser',
        merchandiseMessage: 'Test user bought a hat',
        merchandiseProduct: 'Vintage Hoodie',
        merchandiseImageUrl: 'https://example.com/image.png',
        merchandiseImageEscaped: 'https://example.com/image-escaped.png',
      }),
    );
    expect(event).toMatchObject({
      eventType: 'engagement.purchase',
      user: {
        name: 'TestUser',
      },
      payload: {
        itemName: 'Vintage Hoodie',
        quantity: 1,
        message: 'Test user bought a hat',
        imageUrl: 'https://example.com/image.png',
      },
    });
  });

  it('normalizes Streamlabs charity donation as engagement donation', () => {
    const event = normalizeStreamerBotPlatformRelay(
      relay('streamlabs', 'StreamlabsCharityDonation', {
        userName: 'TestUser',
        displayName: 'TestUser',
        charityDonationAmount: '42',
        charityDonationCurrency: 'usd',
        charityDonationMessage: 'This is a Streamlabs charity donation test',
      }),
    );
    expect(event).toMatchObject({
      eventType: 'engagement.donation',
      user: {
        name: 'TestUser',
      },
      payload: {
        amount: '42',
        currency: 'USD',
        message: 'This is a Streamlabs charity donation test',
      },
    });
  });

  it('normalizes Kofi donation as engagement donation', () => {
    const event = normalizeStreamerBotPlatformRelay(
      relay('kofi', 'KofiDonation', {
        userName: 'TestUser',
        amount: '42',
        currency: 'USD',
        message: 'This is a Kofi Donation Trigger test',
      }),
    );
    expect(event).toMatchObject({
      eventType: 'engagement.donation',
      user: {
        name: 'TestUser',
      },
      payload: {
        amount: '42',
        currency: 'USD',
        message: 'This is a Kofi Donation Trigger test',
      },
    });
  });

  it('normalizes Kofi commission as engagement donation', () => {
    const event = normalizeStreamerBotPlatformRelay(
      relay('kofi', 'KofiCommission', {
        userName: 'TestUser',
        amount: '42',
        currency: 'USD',
        message: 'This is a Kofi Commission Trigger test',
      }),
    );
    expect(event).toMatchObject({
      eventType: 'engagement.donation',
      user: {
        name: 'TestUser',
      },
      payload: {
        amount: '42',
        currency: 'USD',
        message: 'This is a Kofi Commission Trigger test',
      },
    });
  });

  it('normalizes Kofi resubscription as channel subscription', () => {
    const event = normalizeStreamerBotPlatformRelay(
      relay('kofi', 'KofiResubscription', {
        userName: 'TestUser',
        tier: 'Test Tier',
        amount: '42',
        currency: 'USD',
        message: 'This is a Kofi Resubscription Trigger test',
      }),
    );
    expect(event).toMatchObject({
      eventType: 'channel.subscription',
      user: {
        name: 'TestUser',
      },
      payload: {
        tier: 'Test Tier',
        amount: '42',
        currency: 'USD',
        message: 'This is a Kofi Resubscription Trigger test',
        subscriptionKind: 'renewal',
      },
    });
  });

  it('normalizes Kofi subscription as channel subscription', () => {
    const event = normalizeStreamerBotPlatformRelay(
      relay('kofi', 'KofiSubscription', {
        userName: 'TestUser',
        tier: 'Test Tier',
        amount: '42',
        currency: 'USD',
        message: 'This is a Kofi Subscription Trigger test',
      }),
    );
    expect(event).toMatchObject({
      eventType: 'channel.subscription',
      user: {
        name: 'TestUser',
      },
      payload: {
        tier: 'Test Tier',
        amount: '42',
        currency: 'USD',
        message: 'This is a Kofi Subscription Trigger test',
        subscriptionKind: 'new',
      },
    });
  });

  it('normalizes Kofi shop order as a purchase alert', () => {
    const event = normalizeStreamerBotPlatformRelay(
      relay('kofi', 'KofiShopOrder', {
        userName: 'TestUser',
        amount: '42',
        currency: 'USD',
        itemCount: '1',
        item0: 'abc123456',
        message: 'This is a Kofi Shop Order Trigger test',
      }),
    );
    expect(event).toMatchObject({
      eventType: 'engagement.purchase',
      user: {
        name: 'TestUser',
      },
      payload: {
        amount: '42',
        currency: 'USD',
        message: 'This is a Kofi Shop Order Trigger test',
        itemName: 'abc123456',
        quantity: 1,
      },
    });
  });

  it('marks generated fallback IDs as unverified', () => {
    const event = normalizeStreamerBotPlatformRelay(relay('twitch', 'TwitchFollow', { sourceEventId: '', sourceEventIdVerified: false }));
    expect(event.metadata.unverifiedFields).toEqual(['source.eventId']);
  });

  it('rejects unsupported trigger types', () => {
    expect(() => normalizeStreamerBotPlatformRelay(relay('twitch', 'TwitchUnknown'))).toThrow('Unsupported native Streamer.bot event type');
  });
});
