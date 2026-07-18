import type { NormalizedEvent } from '../../schemas/event.js';
import type { BrowserOverlayConfig } from '../../schemas/config.js';
import { normalizeAlertPlainText, projectMultiAlert, type MultiAlert } from './multi-alerts.js';
import { projectMultiChatMessage, type MultiChatMessage } from './multi-chat.js';

export const BROWSER_OVERLAY_CONTRACT_VERSION = '1.2.0';

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
  readonly sound: { readonly mode: 'none' | 'chime'; readonly volume: number };
  readonly aggregation?: { readonly key: string; readonly windowMs: number; readonly mode: 'sum-quantity' };
}
export type BrowserOverlayEvent =
  | { readonly contractVersion: typeof BROWSER_OVERLAY_CONTRACT_VERSION; readonly kind: 'chat.add'; readonly emittedAt: string; readonly payload: MultiChatMessage & { readonly presentation: OverlayActorPresentation } }
  | { readonly contractVersion: typeof BROWSER_OVERLAY_CONTRACT_VERSION; readonly kind: 'chat.remove'; readonly emittedAt: string; readonly payload: { readonly eventId: string; readonly targetEventId: string; readonly reason?: string } }
  | { readonly contractVersion: typeof BROWSER_OVERLAY_CONTRACT_VERSION; readonly kind: 'alert.show'; readonly emittedAt: string; readonly payload: MultiAlert & { readonly priority: OverlayAlertPriority; readonly presentation?: OverlayActorPresentation; readonly subscription?: OverlaySubscriptionLifecycle; readonly display: OverlayAlertDisplay } };

export class InvalidBrowserOverlayEventError extends Error {}

const HIGH_PRIORITY_ALERTS = new Set(['donation', 'cheer', 'super-chat', 'raid']);
const NORMAL_PRIORITY_ALERTS = new Set(['subscription', 'membership', 'gift-subscription', 'gift', 'milestone']);
const MESSAGE_REMOVAL_ACTIONS = new Set(['delete-message', 'message-delete', 'remove-message']);

export function projectBrowserOverlayEvent(event: NormalizedEvent, config?: BrowserOverlayConfig): BrowserOverlayEvent | undefined {
  const emittedAt = new Date().toISOString();
  const chat = projectMultiChatMessage(event);
  if (chat !== undefined) return { contractVersion: BROWSER_OVERLAY_CONTRACT_VERSION, kind: 'chat.add', emittedAt, payload: { ...chat, presentation: actorPresentation(event) } };

  const alert = projectMultiAlert(event);
  const profile = alert === undefined ? undefined : config?.alerts.profiles[alert.alertType];
  if (alert !== undefined && profile?.enabled === false) return undefined;
  if (alert !== undefined && profile !== undefined && profile.platforms.length > 0 && !profile.platforms.includes(alert.platform as (typeof profile.platforms)[number])) return undefined;
  if (alert !== undefined) {
    const subscription = subscriptionLifecycle(event, alert);
    const priority = profile?.priority ?? alertPriority(alert);
    return {
    contractVersion: BROWSER_OVERLAY_CONTRACT_VERSION,
    kind: 'alert.show',
    emittedAt,
    payload: {
      ...alert,
      priority,
      ...(event.user === undefined ? {} : { presentation: actorPresentation(event) }),
      ...subscription,
      display: alertDisplay(alert, subscription.subscription, profile, config?.alertDurationMs ?? 7_000),
    },
    };
  }

  if (event.eventType !== 'moderation.action') return undefined;
  const action = event.payload['action'];
  const targetEventId = event.payload['targetEventId'] ?? event.metadata.correlationId;
  if (typeof action !== 'string' || !MESSAGE_REMOVAL_ACTIONS.has(action) || typeof targetEventId !== 'string' || targetEventId.length === 0) return undefined;
  const reason = event.payload['reason'];
  return {
    contractVersion: BROWSER_OVERLAY_CONTRACT_VERSION,
    kind: 'chat.remove',
    emittedAt,
    payload: {
      eventId: event.eventId,
      targetEventId,
      ...(typeof reason === 'string' && reason.length > 0 ? { reason } : {}),
    },
  };
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
  profile: BrowserOverlayConfig['alerts']['profiles'][keyof BrowserOverlayConfig['alerts']['profiles']],
  defaultDurationMs: number,
): OverlayAlertDisplay {
  const values = alertTemplateValues(alert);
  const defaultTitle = (values.actor ?? '') + ' · ' + (values.alertType ?? '');
  const defaultDetail = alertDetail(alert, subscription);
  const title = renderTemplate(profile?.titleTemplate, values, defaultTitle, 200);
  const detail = renderTemplate(profile?.detailTemplate, values, defaultDetail, 500);
  const aggregation = profile?.aggregation.mode === 'sum-quantity' && alert.quantity !== undefined
    ? { mode: 'sum-quantity' as const, key: aggregationKey(alert), windowMs: profile.aggregation.windowMs }
    : undefined;
  return {
    title,
    ...(detail.length === 0 ? {} : { detail }),
    durationMs: profile?.durationMs ?? defaultDurationMs,
    sound: profile?.sound ?? { mode: 'none', volume: 0.35 },
    ...(aggregation === undefined ? {} : { aggregation }),
  };
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
