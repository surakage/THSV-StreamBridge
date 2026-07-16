import type { JsonValue, NormalizedEvent } from '../../schemas/event.js';

export const MULTI_TIMED_ACTIONS_CONTRACT_VERSION = '1.0.0';
export type TimedScheduleType = 'once' | 'interval';

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
  readonly simulated: boolean;
  readonly creatorPayload: Readonly<Record<string, JsonValue>>;
}

export class InvalidMultiTimedActionError extends Error {}

export function projectMultiTimedAction(event: NormalizedEvent): MultiTimedAction | undefined {
  if (event.eventType !== 'system.timed') return undefined;
  const timerId = boundedIdentifier(event.payload['timerId'], 'timerId', 64);
  const timerName = boundedText(event.payload['timerName'], 'timerName', 100);
  const scheduleType = event.payload['scheduleType'];
  if (scheduleType !== 'once' && scheduleType !== 'interval') throw new InvalidMultiTimedActionError('scheduleType must be once or interval.');
  const scheduledAt = timestamp(event.payload['scheduledAt'], 'scheduledAt');
  const firedAt = timestamp(event.payload['firedAt'], 'firedAt');
  const occurrence = safeInteger(event.payload['occurrence'], 'occurrence', 1);
  const missedRuns = safeInteger(event.payload['missedRuns'], 'missedRuns', 0);
  const creatorPayload = event.payload['creatorPayload'];
  if (!isRecord(creatorPayload)) throw new InvalidMultiTimedActionError('creatorPayload must be an object.');
  const lateByMs = Math.max(0, Date.parse(firedAt) - Date.parse(scheduledAt));
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
    simulated: event.metadata.simulated,
    creatorPayload,
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
