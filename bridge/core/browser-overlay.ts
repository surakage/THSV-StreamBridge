import type { NormalizedEvent } from '../../schemas/event.js';
import type { BrowserOverlayConfig } from '../../schemas/config.js';
import { normalizeAlertPlainText, projectMultiAlert, type MultiAlert, type MultiAlertType } from './multi-alerts.js';
import { projectMultiChatMessage, type MultiChatMessage } from './multi-chat.js';

export const BROWSER_OVERLAY_CONTRACT_VERSION = '1.3.0';

export type OverlayAlertPriority = 'low' | 'normal' | 'high' | 'critical';
export interface OverlayActorPresentation {
  readonly avatarUrl?: string;
  readonly nameColor?: string;
  readonly badges: readonly { readonly id: string; readonly label: string; readonly iconUrl?: string | undefined }[];
}
export interface OverlaySubscriptionLifecycle {
  readonly kind?: 'new' | 'renewal' | 'upgrade';
  readonly months?: number;
  readonly streakMonths?: number;
  readonly gifted?: boolean;
  readonly gifterName?: string;
}
export interface OverlayAlertDisplay {
  readonly title: string;
  readonly detail?: string;
  readonly durationMs: number;
  readonly sound: { readonly mode: 'none' | 'chime' | 'soft-bell' | 'digital-pop' | 'celebration' | 'custom'; readonly volume: number; readonly customUrl?: string };
  readonly card: { readonly backgroundColor: string; readonly fontFamily: 'system' | 'rounded' | 'serif' | 'monospace'; readonly backgroundImageUrl?: string };
  readonly aggregation?: { readonly key: string; readonly windowMs: number; readonly mode: 'sum-quantity' };
}
export type BrowserOverlayEvent =
  | { readonly contractVersion: typeof BROWSER_OVERLAY_CONTRACT_VERSION; readonly kind: 'chat.add'; readonly emittedAt: string; readonly payload: MultiChatMessage & { readonly presentation: OverlayActorPresentation } }
  | { readonly contractVersion: typeof BROWSER_OVERLAY_CONTRACT_VERSION; readonly kind: 'chat.event'; readonly emittedAt: string; readonly payload: OverlayChatActivity }
  | { readonly contractVersion: typeof BROWSER_OVERLAY_CONTRACT_VERSION; readonly kind: 'chat.remove'; readonly emittedAt: string; readonly payload: { readonly eventId: string; readonly targetEventId: string; readonly reason?: string } }
  | { readonly contractVersion: typeof BROWSER_OVERLAY_CONTRACT_VERSION; readonly kind: 'alert.show'; readonly emittedAt: string; readonly payload: MultiAlert & { readonly priority: OverlayAlertPriority; readonly presentation?: OverlayActorPresentation; readonly subscription?: OverlaySubscriptionLifecycle; readonly display: OverlayAlertDisplay } };

export interface OverlayChatActivity {
  readonly eventId: string;
  readonly sequence: number;
  readonly platform: string;
  readonly category: ChatPlatformEventId;
  readonly label: string;
  readonly message: string;
  readonly actor?: MultiAlert['actor'];
  readonly presentation?: OverlayActorPresentation;
  readonly simulated: boolean;
}

export type ChatPlatformEventId = 'follow' | 'subscription' | 'resubscription' | 'gift-subscription' | 'gift-bomb' | 'cheer' | 'raid' | 'reward-redemption'
  | 'subscriber' | 'member' | 'membership-gift' | 'member-milestone' | 'super-chat' | 'super-sticker'
  | 'mass-gift-subscription' | 'gifted-kicks' | 'gift' | 'likes';

export class InvalidBrowserOverlayEventError extends Error {}

const HIGH_PRIORITY_ALERTS = new Set(['donation', 'cheer', 'super-chat', 'raid']);
const NORMAL_PRIORITY_ALERTS = new Set(['subscription', 'membership', 'gift-subscription', 'gift', 'milestone']);
const MESSAGE_REMOVAL_ACTIONS = new Set(['delete-message', 'message-delete', 'remove-message']);

export function projectBrowserOverlayEvent(event: NormalizedEvent, config?: BrowserOverlayConfig): BrowserOverlayEvent | undefined {
  return projectBrowserOverlayEvents(event, config)[0];
}

type AlertProfiles = BrowserOverlayConfig['alerts']['profiles'];
type AlertProfile = NonNullable<NonNullable<AlertProfiles[keyof AlertProfiles]>[MultiAlertType]>;

function alertProfileFor(config: BrowserOverlayConfig | undefined, platform: string, alertType: MultiAlertType): AlertProfile | undefined {
  const platformProfiles = config?.alerts.profiles[platform as keyof AlertProfiles];
  return platformProfiles?.[alertType];
}

export function projectBrowserOverlayEvents(event: NormalizedEvent, config?: BrowserOverlayConfig): readonly BrowserOverlayEvent[] {
  const emittedAt = new Date().toISOString();
  const chat = projectMultiChatMessage(event);
  if (chat !== undefined) return [{ contractVersion: BROWSER_OVERLAY_CONTRACT_VERSION, kind: 'chat.add', emittedAt, payload: { ...chat, presentation: actorPresentation(event) } }];

  const alert = projectMultiAlert(event);
  const profile = alert === undefined ? undefined : alertProfileFor(config, alert.platform, alert.alertType);
  if (alert !== undefined) {
    const subscription = subscriptionLifecycle(event, alert);
    const priority = profile?.priority ?? alertPriority(alert);
    const display = alertDisplay(alert, subscription.subscription, profile, config?.alertDurationMs ?? 7_000);
    const results: BrowserOverlayEvent[] = [];
    const alertEnabled = profile?.enabled !== false;
    if (alertEnabled) results.push({
      contractVersion: BROWSER_OVERLAY_CONTRACT_VERSION,
      kind: 'alert.show',
      emittedAt,
      payload: { ...alert, priority, ...(event.user === undefined ? {} : { presentation: actorPresentation(event) }), ...subscription, display },
    });
    const activity = projectChatActivity(event, alert, display, config);
    if (activity !== undefined) results.push({ contractVersion: BROWSER_OVERLAY_CONTRACT_VERSION, kind: 'chat.event', emittedAt, payload: activity });
    return results;
  }

  const activity = projectChatActivity(event, undefined, undefined, config);
  if (activity !== undefined) return [{ contractVersion: BROWSER_OVERLAY_CONTRACT_VERSION, kind: 'chat.event', emittedAt, payload: activity }];

  if (event.eventType !== 'moderation.action') return [];
  const action = event.payload['action'];
  const targetEventId = event.payload['targetEventId'] ?? event.metadata.correlationId;
  if (typeof action !== 'string' || !MESSAGE_REMOVAL_ACTIONS.has(action) || typeof targetEventId !== 'string' || targetEventId.length === 0) return [];
  const reason = event.payload['reason'];
  return [{
    contractVersion: BROWSER_OVERLAY_CONTRACT_VERSION,
    kind: 'chat.remove',
    emittedAt,
    payload: {
      eventId: event.eventId,
      targetEventId,
      ...(typeof reason === 'string' && reason.length > 0 ? { reason } : {}),
    },
  }];
}

function projectChatActivity(event: NormalizedEvent, alert: MultiAlert | undefined, display: OverlayAlertDisplay | undefined, config: BrowserOverlayConfig | undefined): OverlayChatActivity | undefined {
  if (config === undefined || !config.chat.events.enabled) return undefined;
  const platform = event.platform as keyof BrowserOverlayConfig['chat']['events']['platforms'];
  if (!(platform in config.chat.events.platforms) || !config.chat.events.platforms[platform]) return undefined;
  const category = chatActivityEventId(event);
  if (category === undefined) return undefined;
  const setting = platformEventSetting(config, platform, category);
  if (setting === undefined || !setting.enabled) return undefined;
  if (event.user !== undefined && ignoredActor(event.user, config.chat.ignoredNames)) return undefined;
  const sequence = event.metadata.bridgeSequence;
  if (sequence === undefined) throw new InvalidBrowserOverlayEventError(`${event.eventType} requires a bridge-assigned sequence for chat activity.`);
  const rawMessage = renderChatActivityTemplate(setting.template, event, alert, display);
  if (rawMessage.length === 0) return undefined;
  const actor = alert?.actor ?? (event.user === undefined || event.user.actorType === 'system' ? undefined : {
    ...(event.user.id === undefined ? {} : { id: event.user.id }),
    name: event.user.name,
    displayName: event.user.displayName ?? event.user.name,
    actorType: event.user.actorType,
    roles: event.user.roles,
  });
  return {
    eventId: event.eventId,
    sequence,
    platform: event.platform,
    category,
    label: chatActivityLabel(category),
    message: truncateCodePoints(rawMessage, config.chat.events.characterLimits[platform]),
    ...(actor === undefined ? {} : { actor }),
    ...(event.user === undefined ? {} : { presentation: actorPresentation(event) }),
    simulated: event.metadata.simulated,
  };
}

function renderChatActivityTemplate(template: string, event: NormalizedEvent, alert: MultiAlert | undefined, display: OverlayAlertDisplay | undefined): string {
  const values: Readonly<Record<string, string>> = {
    actor: event.user?.displayName ?? event.user?.name ?? alert?.actor?.displayName ?? 'The community', platform: event.platform, event: event.eventType,
    rewardTitle: typeof event.payload['rewardTitle'] === 'string' ? event.payload['rewardTitle'] : '', input: typeof event.payload['input'] === 'string' ? event.payload['input'] : '',
    amount: alert?.amount ?? '', currency: alert?.currency ?? '', quantity: alert?.quantity === undefined ? '' : String(alert.quantity), itemName: alert?.itemName ?? '',
    tier: alert?.tier ?? '', message: alert?.message ?? '', metric: alert?.metric ?? '', value: alert?.value === undefined ? '' : String(alert.value),
    months: typeof event.payload['months'] === 'number' ? String(event.payload['months']) : typeof event.payload['subMonth'] === 'number' ? String(event.payload['subMonth']) : '',
    streakMonths: typeof event.payload['streakMonths'] === 'number' ? String(event.payload['streakMonths']) : '',
  };
  const rendered = normalizeAlertPlainText(template.replace(/\{([a-z][a-zA-Z]*)\}/gu, (_match, token: string) => values[token] ?? ''));
  return rendered.length > 0 ? rendered : alert === undefined ? rewardActivityMessage(event) : [display?.title, display?.detail].filter((value): value is string => typeof value === 'string' && value.length > 0).join(' · ');
}

function chatActivityEventId(event: NormalizedEvent): ChatPlatformEventId | undefined {
  const source = event.source.eventName;
  const exact: Readonly<Record<string, ChatPlatformEventId>> = {
    TwitchFollow: 'follow', TwitchSub: 'subscription', TwitchReSub: 'resubscription', TwitchGiftSub: 'gift-subscription', TwitchGiftBomb: 'gift-bomb', TwitchCheer: 'cheer', TwitchRaid: 'raid', TwitchRewardRedemption: 'reward-redemption',
    YouTubeNewSubscriber: 'subscriber', YouTubeNewSponsor: 'member', YouTubeMembershipGift: 'membership-gift', YouTubeMemberMileStone: 'member-milestone', YouTubeSuperChat: 'super-chat', YouTubeSuperSticker: 'super-sticker',
    KickFollow: 'follow', KickSubscription: 'subscription', KickResubscription: 'resubscription', KickGiftSubscription: 'gift-subscription', KickMassGiftSubscription: 'mass-gift-subscription', KickKicksGifted: 'gifted-kicks', KickRewardRedemption: 'reward-redemption',
    'TikFinity.follow': 'follow', 'TikFinity.gift': 'gift', 'TikFinity.subscription': 'subscription', 'TikFinity.like': 'likes',
  };
  const matched = exact[source];
  if (matched !== undefined) return matched;
  if (event.platform === 'twitch') return ({ 'channel.follow': 'follow', 'channel.subscription': 'subscription', 'channel.gift-subscription': 'gift-subscription', 'engagement.cheer': 'cheer', 'channel.raid': 'raid', 'reward.redemption': 'reward-redemption' } as const)[event.eventType as 'channel.follow'];
  if (event.platform === 'youtube') return ({ 'channel.follow': 'subscriber', 'channel.membership': 'member', 'channel.gift-subscription': 'membership-gift', 'engagement.super-chat': 'super-chat' } as const)[event.eventType as 'channel.follow'];
  if (event.platform === 'kick') return ({ 'channel.follow': 'follow', 'channel.subscription': 'subscription', 'channel.gift-subscription': 'gift-subscription', 'engagement.gift': 'gifted-kicks', 'reward.redemption': 'reward-redemption' } as const)[event.eventType as 'channel.follow'];
  if (event.platform === 'tiktok') return ({ 'channel.follow': 'follow', 'channel.subscription': 'subscription', 'engagement.gift': 'gift', 'engagement.milestone': 'likes' } as const)[event.eventType as 'channel.follow'];
  return undefined;
}

function platformEventSetting(config: BrowserOverlayConfig, platform: keyof BrowserOverlayConfig['chat']['events']['platforms'], eventId: ChatPlatformEventId): { readonly enabled: boolean; readonly template: string } | undefined {
  const platformEvents = config.chat.events.platformEvents[platform] as Readonly<Record<string, { readonly enabled: boolean; readonly template: string }>>;
  return platformEvents[eventId];
}

function chatActivityLabel(category: OverlayChatActivity['category']): string {
  return ({ follow: 'FOLLOW', subscription: 'SUBSCRIPTION', resubscription: 'RESUBSCRIPTION', 'gift-subscription': 'GIFT SUB', 'gift-bomb': 'GIFT BOMB', cheer: 'BITS', raid: 'RAID', 'reward-redemption': 'REWARD', subscriber: 'SUBSCRIBER', member: 'MEMBER', 'membership-gift': 'MEMBERSHIP GIFT', 'member-milestone': 'MEMBER MILESTONE', 'super-chat': 'SUPER CHAT', 'super-sticker': 'SUPER STICKER', 'mass-gift-subscription': 'MASS GIFT', 'gifted-kicks': 'KICKS GIFTED', gift: 'GIFT', likes: 'LIKES' })[category];
}

function rewardActivityMessage(event: NormalizedEvent): string {
  if (event.eventType !== 'reward.redemption' || event.user === undefined) return '';
  const title = event.payload['rewardTitle'];
  const input = event.payload['input'];
  if (typeof title !== 'string' || title.trim().length === 0) return '';
  const actor = event.user.displayName ?? event.user.name;
  return normalizeAlertPlainText(`${actor} redeemed ${title}${typeof input === 'string' && input.trim().length > 0 ? ` · ${input}` : ''}`);
}

function truncateCodePoints(value: string, maximum: number): string {
  const points = Array.from(normalizeAlertPlainText(value));
  if (points.length <= maximum) return points.join('');
  return `${points.slice(0, Math.max(0, maximum - 1)).join('').trimEnd()}…`;
}

function ignoredActor(user: NonNullable<NormalizedEvent['user']>, ignoredNames: readonly string[]): boolean {
  const ignored = new Set(ignoredNames.map((name) => name.trim().toLocaleLowerCase('en-US')));
  return [user.name, user.displayName].some((name) => typeof name === 'string' && ignored.has(name.trim().toLocaleLowerCase('en-US')));
}

function actorPresentation(event: NormalizedEvent): OverlayActorPresentation {
  if (event.user === undefined) throw new InvalidBrowserOverlayEventError(`${event.eventType} requires an actor for overlay presentation.`);
  return {
    ...(event.user.avatarUrl === undefined ? {} : { avatarUrl: event.user.avatarUrl }),
    ...(event.user.nameColor === undefined ? {} : { nameColor: event.user.nameColor }),
    badges: event.user.badges ?? [],
  };
}

function subscriptionLifecycle(event: NormalizedEvent, alert: MultiAlert): { readonly subscription?: OverlaySubscriptionLifecycle } {
  if (!['subscription', 'membership', 'gift-subscription'].includes(alert.alertType)) return {};
  const rawKind = event.payload['subscriptionKind'];
  if (rawKind !== undefined && rawKind !== 'new' && rawKind !== 'renewal' && rawKind !== 'upgrade') throw new InvalidBrowserOverlayEventError('payload.subscriptionKind must be new, renewal, or upgrade.');
  const kind: OverlaySubscriptionLifecycle['kind'] = rawKind;
  const months = positiveInteger(event.payload['months'], 'months');
  const streakMonths = positiveInteger(event.payload['streakMonths'], 'streakMonths');
  const gifted = event.payload['gifted'];
  if (gifted !== undefined && typeof gifted !== 'boolean') throw new InvalidBrowserOverlayEventError('payload.gifted must be a boolean.');
  const gifterName = event.payload['gifterName'];
  if (gifterName !== undefined && (typeof gifterName !== 'string' || gifterName.length === 0 || gifterName.length > 256)) throw new InvalidBrowserOverlayEventError('payload.gifterName must be a non-empty string of at most 256 characters.');
  const subscription: OverlaySubscriptionLifecycle = {
    ...(kind === undefined ? {} : { kind }),
    ...(months === undefined ? {} : { months }),
    ...(streakMonths === undefined ? {} : { streakMonths }),
    ...(gifted === undefined ? {} : { gifted }),
    ...(gifterName === undefined ? {} : { gifterName }),
  };
  return Object.keys(subscription).length === 0 ? {} : { subscription };
}

function positiveInteger(value: unknown, key: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new InvalidBrowserOverlayEventError(`payload.${key} must be a positive safe integer.`);
  return value;
}

function alertPriority(alert: MultiAlert): OverlayAlertPriority {
  if (HIGH_PRIORITY_ALERTS.has(alert.alertType)) return 'high';
  if (NORMAL_PRIORITY_ALERTS.has(alert.alertType)) return 'normal';
  return 'low';
}

function alertDisplay(
  alert: MultiAlert,
  subscription: OverlaySubscriptionLifecycle | undefined,
  profile: AlertProfile | undefined,
  defaultDurationMs: number,
): OverlayAlertDisplay {
  const values = alertTemplateValues(alert);
  const defaultTitle = (values.actor ?? '') + ' · ' + (values.alertType ?? '');
  const defaultDetail = alertDetail(alert, subscription);
  const title = renderTemplate(profile?.titleTemplate, values, defaultTitle, 200);
  const detail = renderTemplate(profile?.detailTemplate, values, defaultDetail, 500);
  const aggregationSettings = profile?.aggregation ?? automaticAggregation(alert);
  const aggregation = aggregationSettings?.mode === 'sum-quantity' && alert.quantity !== undefined
    ? { mode: 'sum-quantity' as const, key: aggregationKey(alert), windowMs: aggregationSettings.windowMs }
    : undefined;
  return {
    title,
    ...(detail.length === 0 ? {} : { detail }),
    durationMs: profile?.durationMs ?? defaultDurationMs,
    sound: profile?.sound === undefined ? { mode: 'none', volume: 0.35 } : { mode: profile.sound.mode, volume: profile.sound.volume, ...(profile.sound.customUrl === undefined ? {} : { customUrl: profile.sound.customUrl }) },
    card: profile?.card === undefined ? { backgroundColor: '#171120', fontFamily: 'system' } : { backgroundColor: profile.card.backgroundColor, fontFamily: profile.card.fontFamily, ...(profile.card.backgroundImageUrl === undefined ? {} : { backgroundImageUrl: profile.card.backgroundImageUrl }) },
    ...(aggregation === undefined ? {} : { aggregation }),
  };
}

function automaticAggregation(alert: MultiAlert): { readonly mode: 'sum-quantity'; readonly windowMs: number } | undefined {
  if (alert.alertType === 'cheer') return { mode: 'sum-quantity', windowMs: 5_000 };
  if (alert.alertType === 'gift-subscription') return { mode: 'sum-quantity', windowMs: 5_000 };
  if (alert.alertType === 'gift') return { mode: 'sum-quantity', windowMs: 3_000 };
  return undefined;
}

function alertTemplateValues(alert: MultiAlert): Readonly<Record<string, string>> {
  return {
    actor: alert.actor?.displayName ?? 'The community',
    alertType: alert.alertType.replaceAll('-', ' '),
    platform: alert.platform,
    amount: alert.amount ?? '',
    currency: alert.currency ?? '',
    quantity: alert.quantity === undefined ? '' : String(alert.quantity),
    itemName: alert.itemName ?? '',
    tier: alert.tier ?? '',
    message: alert.message ?? '',
    metric: alert.metric ?? '',
    value: alert.value === undefined ? '' : String(alert.value),
  };
}

function renderTemplate(template: string | undefined, values: Readonly<Record<string, string>>, fallback: string, maximum: number): string {
  const rendered = (template ?? fallback).replace(/\{([a-z][a-zA-Z]*)\}/gu, (_match, token: string) => values[token] ?? '');
  return normalizeAlertPlainText(rendered).slice(0, maximum);
}

function alertDetail(alert: MultiAlert, subscription: OverlaySubscriptionLifecycle | undefined): string {
  if (subscription !== undefined) {
    const parts = [subscription.kind, subscription.months === undefined ? '' : `${String(subscription.months)} months`, subscription.streakMonths === undefined ? '' : `${String(subscription.streakMonths)} month streak`, subscription.gifterName === undefined ? '' : `gifted by ${subscription.gifterName}`].filter((value): value is string => typeof value === 'string' && value.length > 0);
    if (parts.length > 0) return parts.join(' · ');
  }
  if (alert.amount !== undefined && alert.currency !== undefined) return `${alert.amount} ${alert.currency}${alert.message === undefined ? '' : ` · ${alert.message}`}`;
  if (alert.quantity !== undefined) return `${String(alert.quantity)}${alert.itemName === undefined ? '' : ` × ${alert.itemName}`}`;
  return alert.message ?? alert.tier ?? (alert.value === undefined ? '' : `${alert.metric ?? 'value'}: ${String(alert.value)}`);
}

function aggregationKey(alert: MultiAlert): string {
  return [alert.alertType, alert.platform, alert.actor?.id ?? alert.actor?.name ?? 'community', alert.itemName ?? alert.tier ?? ''].join(':');
}
