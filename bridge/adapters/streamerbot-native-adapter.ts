import { z } from 'zod';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { AdapterContext } from './adapter.js';
import { ManagedAdapter } from './adapter.js';
import type { StreamerBotEventRelay } from './streamerbot-event-relay.js';

const relaySchema = z.object({
  type: z.literal('thsv.platform'),
  version: z.literal('1.0.0'),
  platform: z.enum(['twitch', 'youtube', 'kick', 'streamlabs', 'kofi']),
  sourceEventType: z.string().min(1).max(100),
  relayId: z.string().min(1).max(256),
  sourceEventId: z.string().max(256).default(''),
  receivedAt: z.iso.datetime({ offset: true }),
  simulated: z.boolean(),
  userId: z.string().max(256).default(''),
  userName: z.string().max(256).default(''),
  displayName: z.string().max(256).default(''),
  profilePictureUrl: z.string().max(2_048).default(''),
  role: z.string().max(64).default(''),
  isModerator: z.boolean().default(false),
  isBroadcaster: z.boolean().default(false),
  isSubscribed: z.boolean().default(false),
  message: z.string().max(2_000).default(''),
  amount: z.string().max(32).default(''),
  currency: z.string().max(8).default(''),
  quantity: z.string().max(32).default(''),
  tier: z.string().max(100).default(''),
  itemName: z.string().max(500).default(''),
  giftName: z.string().max(500).default(''),
  giftUrl: z.string().max(2_048).default(''),
  altText: z.string().max(1_000).default(''),
  altTextLanguage: z.string().max(16).default(''),
  durationInSeconds: z.string().max(16).default(''),
  hasVisualEffect: z.string().max(12).default(''),
  isCombo: z.string().max(12).default(''),
  comboCount: z.string().max(16).default(''),
  hypeTrainId: z.string().max(256).default(''),
  hypeTrainLevel: z.string().max(16).default(''),
  hypeTrainPrevLevel: z.string().max(16).default(''),
  hypeTrainStartedAt: z.string().max(64).default(''),
  hypeTrainExpiresAt: z.string().max(64).default(''),
  hypeTrainDuration: z.string().max(16).default(''),
  hypeTrainContributors: z.string().max(256).default(''),
  hypeTrainPercent: z.string().max(16).default(''),
  hypeTrainPercentDecimal: z.string().max(16).default(''),
  hypeTrainTopBitsUser: z.string().max(256).default(''),
  hypeTrainTopBitsUserName: z.string().max(256).default(''),
  hypeTrainTopBitsUserId: z.string().max(256).default(''),
  hypeTrainTopBitsTotal: z.string().max(32).default(''),
  adLength: z.string().max(16).default(''),
  adLengthMs: z.string().max(16).default(''),
  adScheduled: z.string().max(16).default(''),
  minutes: z.string().max(16).default(''),
  nextAdAt: z.string().max(64).default(''),
  snoozesLeft: z.string().max(16).default(''),
  channelId: z.string().max(256).default(''),
  channelName: z.string().max(256).default(''),
  months: z.string().max(16).default(''),
  fromSharedChat: z.string().max(16).default(''),
  watchStreak: z.string().max(16).default(''),
  itemCount: z.string().max(16).default(''),
  item0: z.string().max(1_024).default(''),
  charityDonationFrom: z.string().max(256).default(''),
  charityDonationAmount: z.string().max(32).default(''),
  charityDonationCurrency: z.string().max(8).default(''),
  charityDonationMessage: z.string().max(1_000).default(''),
  merchandiseFrom: z.string().max(256).default(''),
  merchandiseMessage: z.string().max(1_000).default(''),
  merchandiseProduct: z.string().max(500).default(''),
  merchandiseImageUrl: z.string().max(2_048).default(''),
  merchandiseImageEscaped: z.string().max(2_048).default(''),
  argumentKeys: z.array(z.string().max(100)).max(100).default([]),
}).strict();

type NativeRelay = z.infer<typeof relaySchema>;

export class StreamerBotNativeAdapter extends ManagedAdapter {
  private unsubscribe: (() => void) | undefined;
  private context: AdapterContext | undefined;

  public constructor(name: string, config: ManagedAdapter['config'], private readonly relay: StreamerBotEventRelay) { super(name, config); }

  public async start(context: AdapterContext): Promise<void> {
    if (!this.config.enabled) { this.state = 'disabled'; return; }
    this.context = context;
    this.unsubscribe = this.relay.subscribe((message) => { void this.receive(message); });
    this.state = 'connected';
    this.lastError = undefined;
    context.logger.info('Native Streamer.bot platform relay adapter started', { adapter: this.name });
  }

  public async stop(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.context = undefined;
    this.state = 'stopped';
  }

  private async receive(message: Readonly<Record<string, unknown>>): Promise<void> {
    if (message['type'] !== 'thsv.platform' || this.context === undefined || message['platform'] !== this.name) return;
    try {
      const event = normalizeStreamerBotPlatformRelay(message, this.name);
      await this.context.emit(event, Buffer.byteLength(JSON.stringify(message)));
      this.lastEventAt = new Date().toISOString();
      this.lastError = undefined;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.context.logger.warn('Native Streamer.bot platform relay event rejected', { adapter: this.name, error });
    }
  }
}

export function normalizeStreamerBotPlatformRelay(input: unknown, channelName?: string): NormalizedEvent {
  const relay = relaySchema.parse(input);
  const eventType = normalizedEventType(relay);
  const sourceId = clean(relay.sourceEventId) || relay.relayId;
  const name = clean(relay.userName) || clean(relay.displayName) || clean(relay.charityDonationFrom) || `unknown-${relay.platform}-user`;
  const displayName = clean(relay.displayName) || clean(relay.userName) || clean(relay.charityDonationFrom) || `unknown-${relay.platform}-user`;
  const roles = normalizedRoles(relay);
  const avatarUrl = validHttps(relay.profilePictureUrl);
  const user = {
    ...(clean(relay.userId) === '' ? {} : { id: clean(relay.userId) }),
    name,
    displayName,
    actorType: 'human' as const,
    roles,
    ...(avatarUrl === undefined ? {} : { avatarUrl }),
  };
  const common = {
    schemaVersion: '1.0.0' as const,
    eventId: `streamerbot-${relay.platform}-${sourceId}`,
    eventType,
    platform: relay.platform,
    source: { adapter: 'streamerbot-native', eventId: sourceId, eventName: relay.sourceEventType },
    receivedAt: relay.receivedAt,
    channel: {
      ...(clean(relay.channelId) === '' ? {} : { id: clean(relay.channelId) }),
      name: clean(relay.channelName) || channelName || relay.platform,
    },
    user,
    metadata: {
      simulated: relay.simulated,
      ...(clean(relay.sourceEventId) === '' ? { unverifiedFields: ['source.eventId'] } : {}),
    },
  };

  if (eventType === 'chat.message') {
    const message = clean(relay.message);
    if (message === '') throw new Error(`${relay.sourceEventType} requires a message.`);
    return { ...common, payload: { message } };
  }
  if (eventType === 'channel.follow') return { ...common, payload: {} };
  if (eventType === 'channel.subscription' || eventType === 'channel.membership') {
    return {
      ...common,
      payload: {
        ...(clean(relay.tier) === '' ? {} : { tier: clean(relay.tier) }),
        ...(clean(relay.months) === '' ? {} : { months: clean(relay.months) }),
        ...(clean(relay.fromSharedChat) === '' ? {} : { fromSharedChat: clean(relay.fromSharedChat) }),
      },
    };
  }
  if (eventType === 'channel.gift-subscription') {
    return { ...common, payload: { quantity: positiveInteger(relay.quantity, 1), ...(clean(relay.tier) === '' ? {} : { tier: clean(relay.tier) }) } };
  }
  if (eventType === 'engagement.cheer') return { ...common, payload: { quantity: positiveInteger(relay.quantity, 1), ...(clean(relay.message) === '' ? {} : { message: clean(relay.message) }) } };
  if (eventType === 'engagement.super-chat') {
    const amount = decimalString(relay.amount);
    const currency = currencyCode(relay.currency);
    if (amount === undefined || currency === undefined) throw new Error(`${relay.sourceEventType} requires amount and currency.`);
    return { ...common, payload: { amount, currency, ...(clean(relay.message) === '' ? {} : { message: clean(relay.message) }) } };
  }
  if (eventType === 'engagement.donation') {
    const amount = decimalString(relay.amount) || decimalString(relay.charityDonationAmount);
    const currency = currencyCode(relay.currency) || currencyCode(relay.charityDonationCurrency);
    if (amount === undefined || currency === undefined) throw new Error(`${relay.sourceEventType} requires amount and currency.`);
    return {
      ...common,
      payload: {
        amount,
        currency,
        ...(clean(relay.message) === '' ? (clean(relay.charityDonationMessage) === '' ? {} : { message: clean(relay.charityDonationMessage) }) : { message: clean(relay.message) }),
        ...(clean(relay.itemCount) === '' ? {} : { itemCount: positiveInteger(relay.itemCount, 0) }),
        ...(clean(relay.item0) === '' ? {} : { item0: clean(relay.item0) }),
      },
    };
  }
  if (eventType === 'engagement.gift') {
    const itemName = clean(relay.itemName) || clean(relay.giftName) || 'Platform Gift';
    const payload = {
      itemName,
      quantity: positiveInteger(relay.quantity, 1),
      ...(clean(relay.giftUrl) === '' ? {} : { giftUrl: clean(relay.giftUrl) }),
      ...(clean(relay.durationInSeconds) === '' ? {} : { durationInSeconds: clean(relay.durationInSeconds) }),
      ...(clean(relay.altText) === '' ? {} : { altText: clean(relay.altText) }),
      ...(clean(relay.altTextLanguage) === '' ? {} : { altTextLanguage: clean(relay.altTextLanguage) }),
      ...(clean(relay.hasVisualEffect) === '' ? {} : { hasVisualEffect: clean(relay.hasVisualEffect).toLowerCase() === 'true' }),
      ...(clean(relay.isCombo) === '' ? {} : { isCombo: clean(relay.isCombo).toLowerCase() === 'true' }),
      ...(clean(relay.comboCount) === '' ? {} : { comboCount: positiveInteger(relay.comboCount, 0) }),
    };
    return { ...common, payload };
  }
  if (eventType === 'system.custom') {
    return {
      ...common,
      payload: {
        ...(clean(relay.message) === '' ? {} : { message: clean(relay.message) }),
        ...(clean(relay.adLength) === '' ? {} : { adLength: clean(relay.adLength) }),
        ...(clean(relay.adLengthMs) === '' ? {} : { adLengthMs: clean(relay.adLengthMs) }),
        ...(clean(relay.adScheduled) === '' ? {} : { adScheduled: clean(relay.adScheduled).toLowerCase() === 'true' }),
        ...(clean(relay.minutes) === '' ? {} : { minutes: clean(relay.minutes) }),
        ...(clean(relay.nextAdAt) === '' ? {} : { nextAdAt: clean(relay.nextAdAt) }),
        ...(clean(relay.snoozesLeft) === '' ? {} : { snoozesLeft: clean(relay.snoozesLeft) }),
        ...(clean(relay.merchandiseMessage) === '' ? {} : { merchandiseMessage: clean(relay.merchandiseMessage) }),
        ...(clean(relay.merchandiseProduct) === '' ? {} : { merchandiseProduct: clean(relay.merchandiseProduct) }),
        ...(clean(relay.merchandiseImageUrl) === '' ? {} : { merchandiseImageUrl: clean(relay.merchandiseImageUrl) }),
        ...(clean(relay.merchandiseImageEscaped) === '' ? {} : { merchandiseImageEscaped: clean(relay.merchandiseImageEscaped) }),
      },
    };
  }
  if (eventType === 'engagement.milestone') {
    const metric = 'hype-train';
    const level = parseInt(relay.hypeTrainLevel, 10);
    const value = Number.isSafeInteger(level) && level >= 0 ? level : 1;
    if (relay.sourceEventType === 'TwitchWatchStreak') {
      return {
        ...common,
        payload: {
          metric: 'watch-streak',
          value: parseWatchStreak(relay.watchStreak),
        },
      };
    }
    return {
      ...common,
      payload: {
        metric,
        value,
        ...(clean(relay.hypeTrainId) === '' ? {} : { hypeTrainId: clean(relay.hypeTrainId) }),
        ...(clean(relay.hypeTrainStartedAt) === '' ? {} : { hypeTrainStartedAt: clean(relay.hypeTrainStartedAt) }),
        ...(clean(relay.hypeTrainExpiresAt) === '' ? {} : { hypeTrainExpiresAt: clean(relay.hypeTrainExpiresAt) }),
        ...(clean(relay.hypeTrainDuration) === '' ? {} : { hypeTrainDuration: clean(relay.hypeTrainDuration) }),
        ...(clean(relay.hypeTrainPercent) === '' ? {} : { hypeTrainPercent: clean(relay.hypeTrainPercent) }),
        ...(clean(relay.hypeTrainPercentDecimal) === '' ? {} : { hypeTrainPercentDecimal: clean(relay.hypeTrainPercentDecimal) }),
      ...(clean(relay.hypeTrainContributors) === '' ? {} : { hypeTrainContributors: clean(relay.hypeTrainContributors) }),
      ...(clean(relay.hypeTrainPrevLevel) === '' ? {} : { hypeTrainPrevLevel: clean(relay.hypeTrainPrevLevel) }),
        ...(clean(relay.hypeTrainTopBitsUser) === '' ? {} : { hypeTrainTopBitsUser: clean(relay.hypeTrainTopBitsUser) }),
        ...(clean(relay.hypeTrainTopBitsUserName) === '' ? {} : { hypeTrainTopBitsUserName: clean(relay.hypeTrainTopBitsUserName) }),
        ...(clean(relay.hypeTrainTopBitsUserId) === '' ? {} : { hypeTrainTopBitsUserId: clean(relay.hypeTrainTopBitsUserId) }),
        ...(clean(relay.hypeTrainTopBitsTotal) === '' ? {} : { hypeTrainTopBitsTotal: clean(relay.hypeTrainTopBitsTotal) }),
      },
    };
  }
  return { ...common, payload: { quantity: positiveInteger(relay.quantity, 1) } };
}

function normalizedEventType(relay: NativeRelay): NormalizedEvent['eventType'] {
  const type = relay.sourceEventType;
  if (['TwitchChatMessage', 'YouTubeMessage', 'KickChatMessage'].includes(type)) return 'chat.message';
  if (['TwitchFollow', 'YouTubeNewSubscriber', 'KickFollow'].includes(type)) return 'channel.follow';
  if (['TwitchSub', 'TwitchReSub', 'TwitchGiftPaidUpgrade', 'TwitchPayItForward', 'TwitchPrimePaidUpgrade', 'TwitchModiversary', 'KickSubscription', 'KickResubscription'].includes(type)) return 'channel.subscription';
  if (['YouTubeNewSponsor', 'YouTubeMemberMileStone'].includes(type)) return 'channel.membership';
  if (['TwitchGiftSub', 'TwitchGiftBomb', 'YouTubeMembershipGift', 'KickGiftSubscription', 'KickMassGiftSubscription'].includes(type)) return 'channel.gift-subscription';
  if (type === 'TwitchCheer') return 'engagement.cheer';
  if (type === 'TwitchPowerUpRedemption') return 'engagement.cheer';
  if (['YouTubeSuperChat', 'YouTubeSuperSticker'].includes(type)) return 'engagement.super-chat';
  if (type === 'KickGifted') return 'engagement.gift';
  if (type === 'YouTubeJewelsGifted') return 'engagement.gift';
  if (type === 'TwitchRaid') return 'channel.raid';
  if (type === 'TwitchHypeTrainStart' || type === 'TwitchHypeTrainLevelUp' || type === 'TwitchHypeTrainUpdate' || type === 'TwitchHypeTrainEnd') return 'engagement.milestone';
  if (type === 'TwitchWatchStreak') return 'engagement.milestone';
  if (type === 'TwitchAdRun') return 'system.custom';
  if (type === 'TwitchUpcomingAd') return 'system.custom';
  if (type === 'StreamlabsMerchandise') return 'system.custom';
  if (type === 'StreamlabsDonation' || type === 'StreamlabsCharityDonation' || type === 'KofiDonation' || type === 'KofiCommission') return 'engagement.donation';
  if (type === 'KofiResubscription' || type === 'KofiSubscription') return 'channel.subscription';
  if (type === 'KofiShopOrder') return 'engagement.donation';
  throw new Error(`Unsupported native Streamer.bot event type: ${type}`);
}

function parseWatchStreak(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizedRoles(relay: NativeRelay): string[] {
  const roles = new Set<string>();
  const role = clean(relay.role).toLowerCase();
  if (role !== '') roles.add(role);
  if (relay.isBroadcaster) roles.add('broadcaster');
  if (relay.isModerator) roles.add('moderator');
  if (relay.isSubscribed) roles.add('subscriber');
  return [...roles];
}

function clean(value: string): string { return value.replace(/[\p{Cc}\s]+/gu, ' ').trim(); }
function positiveInteger(value: string, fallback: number): number { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback; }
function decimalString(value: string): string | undefined { const cleaned = clean(value); return /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(cleaned) ? cleaned : undefined; }
function currencyCode(value: string): string | undefined { const cleaned = clean(value).toUpperCase(); return /^[A-Z]{3}$/.test(cleaned) ? cleaned : undefined; }
function validHttps(value: string): string | undefined { try { const url = new URL(value); return url.protocol === 'https:' ? url.toString() : undefined; } catch { return undefined; } }
