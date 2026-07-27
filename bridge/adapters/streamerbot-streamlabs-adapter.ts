import { createHash } from 'node:crypto';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { AdapterContext } from './adapter.js';
import { ManagedAdapter } from './adapter.js';
import type { StreamerBotEventRelay } from './streamerbot-event-relay.js';

type JsonRecord = Readonly<Record<string, unknown>>;

/**
 * Receives Streamlabs events from Streamer.bot's existing authenticated WebSocket subscription.
 * StreamBridge never reads, copies, stores, or exports the creator's Streamlabs credential.
 */
export class StreamerBotStreamlabsAdapter extends ManagedAdapter {
  private unsubscribe: (() => void) | undefined;
  private context: AdapterContext | undefined;

  public constructor(name: string, config: ManagedAdapter['config'], private readonly relay: StreamerBotEventRelay) { super(name, config); }

  public async start(context: AdapterContext): Promise<void> {
    if (!this.config.enabled) { this.state = 'disabled'; return; }
    this.context = context;
    this.unsubscribe = this.relay.subscribe((message) => { void this.receive(message); });
    this.state = 'connected';
    this.lastError = undefined;
    context.logger.info('Native Streamer.bot Streamlabs intake started', { adapter: this.name });
  }

  public async stop(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.context = undefined;
    this.state = 'stopped';
  }

  private async receive(message: JsonRecord): Promise<void> {
    const context = this.context;
    if (context === undefined || !isStreamlabsDonationEnvelope(message)) return;
    try {
      const events = normalizeStreamerBotStreamlabsDonations(message);
      for (const event of events) await context.emit(event, Buffer.byteLength(JSON.stringify(message)));
      this.lastEventAt = new Date().toISOString();
      this.lastError = undefined;
      context.logger.info('Native Streamer.bot Streamlabs donation accepted', { adapter: this.name, accepted: events.length });
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      context.logger.warn('Native Streamer.bot Streamlabs donation rejected', { adapter: this.name, error });
    }
  }
}

export function isStreamlabsDonationEnvelope(value: JsonRecord): boolean {
  const event = record(value['event']);
  return event?.['source'] === 'Streamlabs' && event['type'] === 'Donation' && record(value['data']) !== undefined;
}

export function normalizeStreamerBotStreamlabsDonations(input: unknown): readonly NormalizedEvent[] {
  const envelope = record(input);
  if (envelope === undefined || !isStreamlabsDonationEnvelope(envelope)) throw new Error('Expected a Streamer.bot Streamlabs.Donation event envelope.');
  const data = record(envelope['data']);
  if (data === undefined) throw new Error('Streamlabs.Donation did not contain event data.');
  const candidates = donationCandidates(data);
  if (candidates.length === 0) throw new Error('Streamlabs.Donation did not contain a donation record.');
  const receivedAt = isoDate(envelope['time']) ?? isoDate(data['timestamp']) ?? new Date().toISOString();
  return candidates.map((candidate, index) => normalizeDonation(data, candidate, receivedAt, index));
}

function normalizeDonation(data: JsonRecord, donation: JsonRecord, receivedAt: string, index: number): NormalizedEvent {
  const simulated = booleanValue(donation['isTest']) ?? booleanValue(data['isTest']) ?? false;
  const itemStableId = firstText(donation['donation_id'], donation['donationId'], donation['_id'], donation['id'], donation['event_id'], donation['eventId']);
  const envelopeStableId = firstText(data['donation_id'], data['donationId'], data['event_id'], data['eventId']);
  const stableId = itemStableId || (envelopeStableId === '' ? '' : `${envelopeStableId}:${String(index)}`);
  const rawSourceId = stableId || (simulated ? simulatedIdentity(data, donation, receivedAt, index) : '');
  const sourceId = boundedProviderIdentity(rawSourceId);
  if (sourceId === '') throw new Error('Live Streamlabs donations require a stable event_id, donation_id, _id, or id from Streamer.bot.');
  const amount = decimalValue(firstDefined(donation['amount'], donation['donationAmount'], data['donationAmount']));
  const currency = currencyValue(firstDefined(donation['currency'], donation['donationCurrency'], data['donationCurrency']));
  if (amount === undefined || currency === undefined) throw new Error('Streamlabs.Donation requires an exact amount and three-letter currency code.');
  const name = clean(firstText(donation['name'], donation['from'], donation['donationFrom'], data['donationFrom'])) || 'Anonymous';
  const message = clean(firstText(donation['message'], donation['donationMessage'], data['donationMessage']));
  const eventId = boundedIdentity('streamerbot-streamlabs-', sourceId);
  return {
    schemaVersion: '1.0.0',
    eventId,
    eventType: 'engagement.donation',
    platform: 'streamlabs',
    source: { adapter: 'streamerbot-streamlabs', eventId: sourceId, eventName: 'StreamlabsDonation' },
    receivedAt,
    channel: { name: 'streamlabs' },
    user: { name, displayName: name, actorType: 'human', roles: [] },
    payload: { amount, currency, ...(message === '' ? {} : { message }) },
    metadata: { simulated, ...(stableId === '' ? { unverifiedFields: ['source.eventId'] } : {}) },
  };
}

function donationCandidates(data: JsonRecord): readonly JsonRecord[] {
  const message = data['message'];
  if (Array.isArray(message)) return message.flatMap((value) => { const item = record(value); return item === undefined ? [] : [item]; }).slice(0, 100);
  const donation = record(data['donation']);
  if (donation !== undefined) return [donation];
  return [data];
}

function simulatedIdentity(data: JsonRecord, donation: JsonRecord, receivedAt: string, index: number): string {
  const digest = createHash('sha256').update(JSON.stringify({ data, donation, receivedAt, index })).digest('hex');
  return `simulated:${digest}`;
}

function boundedIdentity(prefix: string, value: string): string {
  const combined = `${prefix}${value}`;
  return combined.length <= 256 ? combined : `${prefix}sha256-${createHash('sha256').update(value).digest('hex')}`;
}

function boundedProviderIdentity(value: string): string {
  return value.length <= 256 ? value : `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function decimalValue(value: unknown): string | undefined {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return undefined;
    value = value.toFixed(6).replace(/0+$/u, '').replace(/\.$/u, '');
  }
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().replace(/,/gu, '');
  return /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/u.test(normalized) ? normalized : undefined;
}

function currencyValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/u.test(normalized) ? normalized : undefined;
}

function isoDate(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  return undefined;
}

function firstDefined(...values: readonly unknown[]): unknown { return values.find((value) => value !== undefined && value !== null); }
function firstText(...values: readonly unknown[]): string { for (const value of values) if ((typeof value === 'string' || typeof value === 'number') && String(value).trim() !== '') return String(value).trim(); return ''; }
function clean(value: string): string { return value.replace(/[\p{Cc}\s]+/gu, ' ').trim().slice(0, 2_000); }
function record(value: unknown): JsonRecord | undefined { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonRecord : undefined; }
