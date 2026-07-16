import type { NormalizedEvent } from '../../schemas/event.js';
import { projectMultiAlert, type MultiAlert } from './multi-alerts.js';
import { projectMultiChatMessage, type MultiChatMessage } from './multi-chat.js';

export const BROWSER_OVERLAY_CONTRACT_VERSION = '1.0.0';

export type OverlayAlertPriority = 'low' | 'normal' | 'high';
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
export type BrowserOverlayEvent =
  | { readonly contractVersion: typeof BROWSER_OVERLAY_CONTRACT_VERSION; readonly kind: 'chat.add'; readonly emittedAt: string; readonly payload: MultiChatMessage & { readonly presentation: OverlayActorPresentation } }
  | { readonly contractVersion: typeof BROWSER_OVERLAY_CONTRACT_VERSION; readonly kind: 'chat.remove'; readonly emittedAt: string; readonly payload: { readonly eventId: string; readonly targetEventId: string; readonly reason?: string } }
  | { readonly contractVersion: typeof BROWSER_OVERLAY_CONTRACT_VERSION; readonly kind: 'alert.show'; readonly emittedAt: string; readonly payload: MultiAlert & { readonly priority: OverlayAlertPriority; readonly presentation?: OverlayActorPresentation; readonly subscription?: OverlaySubscriptionLifecycle } };

export class InvalidBrowserOverlayEventError extends Error {}

const HIGH_PRIORITY_ALERTS = new Set(['donation', 'cheer', 'super-chat', 'raid']);
const NORMAL_PRIORITY_ALERTS = new Set(['subscription', 'membership', 'gift-subscription', 'gift', 'milestone']);
const MESSAGE_REMOVAL_ACTIONS = new Set(['delete-message', 'message-delete', 'remove-message']);

export function projectBrowserOverlayEvent(event: NormalizedEvent): BrowserOverlayEvent | undefined {
  const emittedAt = new Date().toISOString();
  const chat = projectMultiChatMessage(event);
  if (chat !== undefined) return { contractVersion: BROWSER_OVERLAY_CONTRACT_VERSION, kind: 'chat.add', emittedAt, payload: { ...chat, presentation: actorPresentation(event) } };

  const alert = projectMultiAlert(event);
  if (alert !== undefined) return {
    contractVersion: BROWSER_OVERLAY_CONTRACT_VERSION,
    kind: 'alert.show',
    emittedAt,
    payload: {
      ...alert,
      priority: alertPriority(alert),
      ...(event.user === undefined ? {} : { presentation: actorPresentation(event) }),
      ...subscriptionLifecycle(event, alert),
    },
  };

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
