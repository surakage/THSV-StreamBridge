import type { JsonValue, NormalizedEvent } from '../../schemas/event.js';

export const MULTI_TIMED_ACTIONS_CONTRACT_VERSION = '1.0.0';
export type TimedScheduleType = 'session-interval';

export interface MultiTimedAction {
  readonly contractVersion: typeof MULTI_TIMED_ACTIONS_CONTRACT_VERSION;
  readonly eventId: string;
  readonly correlationId?: string;
  readonly platform: string;
  readonly receivedAt: string;
  readonly bridgeSequence: number;
  readonly timerId: string;
  readonly timerName: string;
  readonly scheduleType: TimedScheduleType;
  readonly scheduledAt: string;
  readonly firedAt: string;
  readonly occurrence: number;
  readonly missedRuns: number;
  readonly lateByMs: number;
  readonly selectionMode: 'fixed' | 'shuffle-container';
  readonly selectedMessage: string;
  readonly containerCycle: number;
  readonly containerPosition: number;
  readonly containerSize: number;
  readonly simulated: boolean;
  readonly creatorPayload: Readonly<Record<string, JsonValue>>;
  readonly targetProvider: 'event-only' | 'run-existing-action';
  readonly targetActionId?: string;
  readonly targetActionName?: string;
  readonly targetPlatforms: readonly string[];
  readonly deliveryPlatforms: readonly string[];
}

export class InvalidMultiTimedActionError extends Error {}

export function projectMultiTimedAction(event: NormalizedEvent): MultiTimedAction | undefined {
  if (event.eventType !== 'system.timed') return undefined;
  const timerId = boundedIdentifier(event.payload['timerId'], 'timerId', 64);
  const timerName = boundedText(event.payload['timerName'], 'timerName', 100);
  const scheduleType = event.payload['scheduleType'];
  if (scheduleType !== 'session-interval') throw new InvalidMultiTimedActionError('scheduleType must be session-interval.');
  const scheduledAt = timestamp(event.payload['scheduledAt'], 'scheduledAt');
  const firedAt = timestamp(event.payload['firedAt'], 'firedAt');
  const occurrence = safeInteger(event.payload['occurrence'], 'occurrence', 1);
  const missedRuns = safeInteger(event.payload['missedRuns'], 'missedRuns', 0);
  const creatorPayload = event.payload['creatorPayload'];
  if (!isRecord(creatorPayload)) throw new InvalidMultiTimedActionError('creatorPayload must be an object.');
  const lateByMs = Math.max(0, Date.parse(firedAt) - Date.parse(scheduledAt));
  const selectionMode = event.payload['selectionMode'];
  if (selectionMode !== 'fixed' && selectionMode !== 'shuffle-container') throw new InvalidMultiTimedActionError('selectionMode must be fixed or shuffle-container.');
  const selectedMessage = selectionMode === 'shuffle-container' ? boundedText(event.payload['selectedMessage'], 'selectedMessage', 500) : '';
  const containerCycle = safeInteger(event.payload['containerCycle'], 'containerCycle', 0);
  const containerPosition = safeInteger(event.payload['containerPosition'], 'containerPosition', 0);
  const containerSize = safeInteger(event.payload['containerSize'], 'containerSize', 0);
  const targetProvider = event.payload['targetProvider'];
  if (targetProvider !== 'event-only' && targetProvider !== 'run-existing-action') throw new InvalidMultiTimedActionError('targetProvider must be event-only or run-existing-action.');
  const targetActionId = targetProvider === 'run-existing-action' ? boundedUuid(event.payload['targetActionId'], 'targetActionId') : undefined;
  const targetActionName = targetProvider === 'run-existing-action' ? boundedText(event.payload['targetActionName'], 'targetActionName', 200) : undefined;
  if (targetProvider === 'run-existing-action' && event.payload['targetActionApproved'] !== true) throw new InvalidMultiTimedActionError('targetActionApproved must be true for run-existing-action.');
  const targetPlatforms = stringArray(event.payload['targetPlatforms'], 'targetPlatforms', 16, 64);
  const deliveryPlatforms = stringArray(event.payload['deliveryPlatforms'], 'deliveryPlatforms', 4, 64);
  if (!deliveryPlatforms.every((platform) => ['twitch', 'youtube', 'kick', 'tiktok'].includes(platform))) throw new InvalidMultiTimedActionError('deliveryPlatforms contains an unsupported chat platform.');
  return {
    contractVersion: MULTI_TIMED_ACTIONS_CONTRACT_VERSION,
    eventId: event.eventId,
    ...(event.metadata.correlationId === undefined ? {} : { correlationId: event.metadata.correlationId }),
    platform: event.platform,
    receivedAt: event.receivedAt,
    bridgeSequence: event.metadata.bridgeSequence ?? 0,
    timerId,
    timerName,
    scheduleType,
    scheduledAt,
    firedAt,
    occurrence,
    missedRuns,
    lateByMs,
    selectionMode,
    selectedMessage,
    containerCycle,
    containerPosition,
    containerSize,
    simulated: event.metadata.simulated,
    creatorPayload,
    targetProvider,
    ...(targetActionId === undefined ? {} : { targetActionId }),
    ...(targetActionName === undefined ? {} : { targetActionName }),
    targetPlatforms,
    deliveryPlatforms,
  };
}

function boundedIdentifier(value: JsonValue | undefined, field: string, maximum: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum || !/^[a-z][a-z0-9-]*$/u.test(value)) {
    throw new InvalidMultiTimedActionError(`${field} must be a bounded lowercase identifier.`);
  }
  return value;
}

function boundedText(value: JsonValue | undefined, field: string, maximum: number): string {
  if (typeof value !== 'string') throw new InvalidMultiTimedActionError(`${field} must be text.`);
  const normalized = value.replace(/[\p{Cc}\s]+/gu, ' ').trim();
  if (normalized.length === 0 || normalized.length > maximum) throw new InvalidMultiTimedActionError(`${field} must contain 1-${String(maximum)} characters.`);
  return normalized;
}

function boundedUuid(value: JsonValue | undefined, field: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) throw new InvalidMultiTimedActionError(`${field} must be a UUID.`);
  return value;
}

function stringArray(value: JsonValue | undefined, field: string, maximumItems: number, maximumLength: number): string[] {
  if (!Array.isArray(value) || value.length > maximumItems || !value.every((item) => typeof item === 'string' && item.length > 0 && item.length <= maximumLength)) throw new InvalidMultiTimedActionError(`${field} must be a bounded string array.`);
  return value as string[];
}

function timestamp(value: JsonValue | undefined, field: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new InvalidMultiTimedActionError(`${field} must be an ISO 8601 timestamp.`);
  return value;
}

function safeInteger(value: JsonValue | undefined, field: string, minimum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw new InvalidMultiTimedActionError(`${field} must be a safe integer at least ${String(minimum)}.`);
  return value;
}

function isRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
