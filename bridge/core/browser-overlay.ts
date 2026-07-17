import type { NormalizedEvent } from '../../schemas/event.js';
import { projectMultiAlert, type MultiAlert } from './multi-alerts.js';
import { projectMultiChatMessage, type MultiChatMessage } from './multi-chat.js';

export const BROWSER_OVERLAY_CONTRACT_VERSION = '1.1.0';

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
  | { readonly contractVersion: typeof BROWSER_OVERLAY_CONTRACT_VERSION; readonly kind: 'alert.show'; readonly emittedAt: string; readonly payload: MultiAlert & { readonly priority: OverlayAlertPriority; readonly presentation?: OverlayActorPresentation; readonly subscription?: OverlaySubscriptionLifecycle } }
  | { readonly contractVersion: typeof BROWSER_OVERLAY_CONTRACT_VERSION; readonly kind: 'companion.action'; readonly emittedAt: string; readonly payload: { readonly eventId: string; readonly sequence: number; readonly action: 'wave' | 'eat' | 'sleep' | 'celebrate'; readonly actorName: string; readonly cost: number; readonly remainingPoints: number; readonly happiness: number; readonly fullness: number; readonly energy: number; readonly simulated: boolean } };

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

  if (event.eventType === 'companion.action') return projectCompanionAction(event, emittedAt);

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

function projectCompanionAction(event: NormalizedEvent, emittedAt: string): BrowserOverlayEvent {
  const sequence = event.metadata.bridgeSequence;
  if (sequence === undefined) throw new InvalidBrowserOverlayEventError('companion.action requires a bridge-assigned sequence.');
  const action = event.payload['action'];
  if (action !== 'wave' && action !== 'eat' && action !== 'sleep' && action !== 'celebrate') throw new InvalidBrowserOverlayEventError('companion.action payload.action is invalid.');
  const actorName = event.payload['actorName'];
  if (typeof actorName !== 'string' || actorName.length === 0 || actorName.length > 256) throw new InvalidBrowserOverlayEventError('companion.action payload.actorName must be a non-empty string of at most 256 characters.');
  return { contractVersion: BROWSER_OVERLAY_CONTRACT_VERSION, kind: 'companion.action', emittedAt, payload: { eventId: event.eventId, sequence, action, actorName, cost: boundedInteger(event, 'cost', 0, 1_000_000), remainingPoints: boundedInteger(event, 'remainingPoints', 0, Number.MAX_SAFE_INTEGER), happiness: boundedInteger(event, 'happiness', 0, 100), fullness: boundedInteger(event, 'fullness', 0, 100), energy: boundedInteger(event, 'energy', 0, 100), simulated: event.metadata.simulated } };
}

function boundedInteger(event: NormalizedEvent, key: string, minimum: number, maximum: number): number {
  const value = event.payload[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new InvalidBrowserOverlayEventError(`companion.action payload.${key} must be a safe integer from ${String(minimum)} to ${String(maximum)}.`);
  return value;
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
