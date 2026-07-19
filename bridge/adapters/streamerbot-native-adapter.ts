import { z } from 'zod';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { AdapterContext } from './adapter.js';
import { ManagedAdapter } from './adapter.js';
import type { StreamerBotEventRelay } from './streamerbot-event-relay.js';

const relaySchema = z.object({
  type: z.literal('thsv.platform'),
  version: z.literal('1.0.0'),
  platform: z.enum(['twitch', 'youtube', 'kick']),
  sourceEventType: z.string().min(1).max(100),
  relayId: z.string().min(1).max(256),
  sourceEventId: z.string().max(256).default(''),
  receivedAt: z.iso.datetime({ offset: true }),
  simulated: z.boolean(),
  userId: z.string().max(256).default(''),
  userName: z.string().max(256).default(''),
  displayName: z.string().max(256).default(''),
  profilePictureUrl: z.string().max(2_048).default(''),
  nameColor: z.string().max(16).default(''),
  badges: z.array(z.object({
    id: z.string().max(64),
    label: z.string().max(64),
    iconUrl: z.string().max(2_048).default(''),
  }).strict()).max(16).default([]),
  role: z.string().max(64).default(''),
  isModerator: z.boolean().default(false),
  isBroadcaster: z.boolean().default(false),
  isSubscribed: z.boolean().default(false),
  isVip: z.boolean().default(false),
  message: z.string().max(2_000).default(''),
  amount: z.string().max(32).default(''),
  currency: z.string().max(8).default(''),
  quantity: z.string().max(32).default(''),
  tier: z.string().max(100).default(''),
  itemName: z.string().max(500).default(''),
  rewardId: z.string().max(256).default(''),
  rewardTitle: z.string().max(256).default(''),
  rewardCost: z.string().max(32).default(''),
  rewardRequiresInput: z.boolean().default(false),
  redemptionId: z.string().max(256).default(''),
  channelId: z.string().max(256).default(''),
  channelName: z.string().max(256).default(''),
  argumentKeys: z.array(z.string().max(100)).max(100).default([]),
}).strict();

type NativeRelay = z.infer<typeof relaySchema>;
const STABLE_ID_REQUIRED_EVENT_TYPES = new Set<NormalizedEvent['eventType']>([
  'channel.subscription', 'channel.membership', 'channel.gift-subscription',
  'engagement.gift', 'engagement.donation', 'engagement.cheer', 'engagement.super-chat',
  'reward.redemption',
]);

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
      const result = await this.context.emit(event, Buffer.byteLength(JSON.stringify(message)));
      this.lastEventAt = new Date().toISOString();
      this.lastError = undefined;
      this.context.logger.info('Native Streamer.bot platform relay event accepted', { adapter: this.name, eventType: event.eventType, eventId: event.eventId, result });
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.context.logger.warn('Native Streamer.bot platform relay event rejected', { adapter: this.name, error });
    }
  }
}

export function normalizeStreamerBotPlatformRelay(input: unknown, channelName?: string): NormalizedEvent {
  const relay = relaySchema.parse(input);
  const eventType = normalizedEventType(relay);
  const providerSourceId = clean(relay.sourceEventId);
  if (providerSourceId === '' && STABLE_ID_REQUIRED_EVENT_TYPES.has(eventType)) {
    throw new Error(`${relay.sourceEventType} requires a provider-stable source event ID before it can reach automation.`);
  }
  const sourceId = providerSourceId || relay.relayId;
  const name = clean(relay.userName) || clean(relay.displayName) || `unknown-${relay.platform}-user`;
  const displayName = clean(relay.displayName) || name;
  const roles = normalizedRoles(relay);
  const avatarUrl = validHttps(relay.profilePictureUrl);
  const nameColor = validNameColor(relay.nameColor);
  const badges = normalizedBadges(relay, roles);
  const user = {
    ...(clean(relay.userId) === '' ? {} : { id: clean(relay.userId) }),
    name,
    displayName,
    actorType: 'human' as const,
    roles,
    ...(avatarUrl === undefined ? {} : { avatarUrl }),
    ...(nameColor === undefined ? {} : { nameColor }),
    ...(badges.length === 0 ? {} : { badges }),
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
    return { ...common, payload: { ...(clean(relay.tier) === '' ? {} : { tier: clean(relay.tier) }) } };
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
  if (eventType === 'engagement.gift') return { ...common, payload: { itemName: clean(relay.itemName) || 'Platform Gift', quantity: positiveInteger(relay.quantity, 1) } };
  if (eventType === 'reward.redemption') {
    const rewardId = clean(relay.rewardId);
    const redemptionId = clean(relay.redemptionId);
    if (rewardId === '') throw new Error(`${relay.sourceEventType} requires a reward ID.`);
    if (redemptionId === '') throw new Error(`${relay.sourceEventType} requires a provider-stable redemption ID before it can be administered.`);
    return { ...common, payload: {
      rewardId, rewardTitle: clean(relay.rewardTitle) || 'Untitled reward', rewardCost: nonnegativeInteger(relay.rewardCost),
      requiresUserInput: relay.rewardRequiresInput, ...(clean(relay.message) === '' ? {} : { input: clean(relay.message) }), redemptionId,
      supportedOperations: relay.platform === 'twitch' ? ['fulfill', 'cancel'] : [], verifiedTransport: true,
    } };
  }
  return { ...common, payload: { quantity: positiveInteger(relay.quantity, 1) } };
}

function normalizedEventType(relay: NativeRelay): NormalizedEvent['eventType'] {
  const type = relay.sourceEventType;
  if (['TwitchChatMessage', 'YouTubeMessage', 'KickChatMessage'].includes(type)) return 'chat.message';
  if (['TwitchFollow', 'YouTubeNewSubscriber', 'KickFollow'].includes(type)) return 'channel.follow';
  if (['TwitchSub', 'TwitchReSub', 'KickSubscription', 'KickResubscription'].includes(type)) return 'channel.subscription';
  if (['YouTubeNewSponsor', 'YouTubeMemberMileStone'].includes(type)) return 'channel.membership';
  if (['TwitchGiftSub', 'TwitchGiftBomb', 'YouTubeMembershipGift', 'KickGiftSubscription', 'KickMassGiftSubscription'].includes(type)) return 'channel.gift-subscription';
  if (type === 'TwitchCheer') return 'engagement.cheer';
  if (['YouTubeSuperChat', 'YouTubeSuperSticker'].includes(type)) return 'engagement.super-chat';
  if (type === 'KickGifted') return 'engagement.gift';
  if (type === 'TwitchRaid') return 'channel.raid';
  if ((relay.platform === 'twitch' && type === 'TwitchRewardRedemption') || (relay.platform === 'kick' && type === 'KickRewardRedemption')) return 'reward.redemption';
  throw new Error(`Unsupported native Streamer.bot event type: ${type}`);
}

function normalizedRoles(relay: NativeRelay): string[] {
  const roles = new Set<string>();
  const role = clean(relay.role).toLowerCase();
  if (role !== '') roles.add(role);
  if (relay.isBroadcaster) roles.add('broadcaster');
  if (relay.isModerator) roles.add('moderator');
  if (relay.isSubscribed) roles.add('subscriber');
  if (relay.isVip) roles.add('vip');
  return [...roles];
}

function normalizedBadges(relay: NativeRelay, roles: readonly string[]): { id: string; label: string; iconUrl?: string }[] {
  const badges: { id: string; label: string; iconUrl?: string }[] = [];
  const seen = new Set<string>();
  for (const [index, badge] of relay.badges.entries()) {
    const label = clean(badge.label);
    const id = badgeId(badge.id, label, index);
    if (label === '' || seen.has(id)) continue;
    const iconUrl = validHttps(badge.iconUrl);
    badges.push({ id, label, ...(iconUrl === undefined ? {} : { iconUrl }) });
    seen.add(id);
  }
  for (const role of ['broadcaster', 'moderator', 'vip', 'subscriber']) {
    if (!roles.includes(role) || seen.has(role)) continue;
    badges.push({ id: role, label: role.charAt(0).toUpperCase() + role.slice(1) });
    seen.add(role);
  }
  return badges.slice(0, 16);
}

function badgeId(rawId: string, label: string, index: number): string {
  const candidate = (clean(rawId) || label).toLowerCase().replace(/[^a-z0-9-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 64);
  return /^[a-z][a-z0-9-]*$/u.test(candidate) ? candidate : `badge-${String(index + 1)}`;
}

function clean(value: string): string { return value.replace(/[\p{Cc}\s]+/gu, ' ').trim(); }
function positiveInteger(value: string, fallback: number): number { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback; }
function nonnegativeInteger(value: string): number { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 2_147_483_647 ? parsed : 0; }
function decimalString(value: string): string | undefined { const cleaned = clean(value); return /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(cleaned) ? cleaned : undefined; }
function currencyCode(value: string): string | undefined { const cleaned = clean(value).toUpperCase(); return /^[A-Z]{3}$/.test(cleaned) ? cleaned : undefined; }
function validHttps(value: string): string | undefined { try { const url = new URL(value); return url.protocol === 'https:' ? url.toString() : undefined; } catch { return undefined; } }
function validNameColor(value: string): string | undefined { const cleaned = clean(value); return /^#[0-9a-fA-F]{6}$/u.test(cleaned) ? cleaned : undefined; }
