import { createHash } from 'node:crypto';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { AdapterContext } from './adapter.js';
import { ManagedAdapter } from './adapter.js';
import type { StreamerBotEventRelay } from './streamerbot-event-relay.js';
import { booleanValue, boundedIdentity, boundedProviderIdentity, clean, currencyValue, decimalValue, firstDefined, firstText, isoDate, record } from './streamerbot-streamlabs-adapter.js';

type JsonRecord = Readonly<Record<string, unknown>>;

/**
 * Receives StreamElements tips from Streamer.bot's own StreamElements integration (StreamElements.Tip over its
 * authenticated WebSocket). The creator connects StreamElements inside Streamer.bot; StreamBridge never reads,
 * copies, stores, or exports the StreamElements token.
 */
export class StreamerBotStreamElementsAdapter extends ManagedAdapter {
  private unsubscribe: (() => void) | undefined;
  private context: AdapterContext | undefined;

  public constructor(name: string, config: ManagedAdapter['config'], private readonly relay: StreamerBotEventRelay) { super(name, config); }

  public async start(context: AdapterContext): Promise<void> {
    if (!this.config.enabled) { this.state = 'disabled'; return; }
    this.context = context;
    this.unsubscribe = this.relay.subscribe((message) => { void this.receive(message); });
    this.state = 'connected';
    this.lastError = undefined;
    context.logger.info('Native Streamer.bot StreamElements intake started', { adapter: this.name });
  }

  public async stop(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.context = undefined;
    this.state = 'stopped';
  }

  private async receive(message: JsonRecord): Promise<void> {
    const context = this.context;
    if (context === undefined || !isStreamElementsTipEnvelope(message)) return;
    try {
      const event = normalizeStreamerBotStreamElementsTip(message);
      await context.emit(event, Buffer.byteLength(JSON.stringify(message)));
      this.lastEventAt = new Date().toISOString();
      this.lastError = undefined;
      context.logger.info('Native Streamer.bot StreamElements tip accepted', { adapter: this.name });
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      context.logger.warn('Native Streamer.bot StreamElements tip rejected', { adapter: this.name, error });
    }
  }
}

export function isStreamElementsTipEnvelope(value: JsonRecord): boolean {
  const event = record(value['event']);
  return event?.['source'] === 'StreamElements' && event['type'] === 'Tip' && record(value['data']) !== undefined;
}

/**
 * Streamer.bot does not document the WebSocket payload for StreamElements.Tip, so this accepts the shapes it can take:
 * its action variables (tipUsername, tipAmount, tipCurrency, tipMessage), plain fields (username, amount, ...) and
 * StreamElements' own activity record nested under data/tip ({ _id, data: { tipId, username, amount, ... } }).
 */
export function normalizeStreamerBotStreamElementsTip(input: unknown): NormalizedEvent {
  const envelope = record(input);
  if (envelope === undefined || !isStreamElementsTipEnvelope(envelope)) throw new Error('Expected a Streamer.bot StreamElements.Tip event envelope.');
  const data = record(envelope['data']);
  if (data === undefined) throw new Error('StreamElements.Tip did not contain event data.');
  const outer = record(data['tip']) ?? record(data['activity']) ?? data;
  const tip = record(outer['data']) ?? outer;
  const receivedAt = isoDate(envelope['time']) ?? isoDate(firstDefined(outer['createdAt'], data['createdAt'], data['timestamp'])) ?? new Date().toISOString();
  const simulated = booleanValue(firstDefined(tip['isTest'], data['isTest'], outer['isMock'], tip['isMock'], data['isMock'], outer['provider'] === 'emulator' ? 'true' : undefined)) ?? false;
  const amount = decimalValue(firstDefined(tip['amount'], tip['tipAmount'], data['tipAmount'], data['amount']));
  const currency = currencyValue(firstDefined(tip['currency'], tip['tipCurrency'], data['tipCurrency'], data['currency']));
  if (amount === undefined || currency === undefined) throw new Error('StreamElements.Tip requires an exact amount and three-letter currency code.');
  const name = clean(firstText(tip['displayName'], tip['username'], tip['tipUsername'], tip['name'], data['tipUsername'], data['username'])) || 'Anonymous';
  const message = clean(firstText(tip['message'], tip['tipMessage'], data['tipMessage'], data['message']));
  const stableId = firstText(tip['tipId'], data['tipId'], outer['_id'], outer['id'], outer['activityId'], data['_id'], data['id'], data['activityId']);
  // Money events need the provider's own ID (the same rule as Streamlabs): a live tip without one fails closed rather
  // than being fingerprinted from donor, amount or time. Only test tips get an isolated simulated identity.
  if (stableId === '' && !simulated) throw new Error('Live StreamElements tips require a stable tipId, _id, id, or activityId from Streamer.bot.');
  const sourceId = boundedProviderIdentity(stableId || `simulated:${createHash('sha256').update(JSON.stringify({ data, receivedAt })).digest('hex')}`);
  return {
    schemaVersion: '1.0.0',
    eventId: boundedIdentity('streamerbot-streamelements-', sourceId),
    eventType: 'engagement.donation',
    platform: 'streamelements',
    source: { adapter: 'streamerbot-streamelements', eventId: sourceId, eventName: 'StreamElementsTip' },
    receivedAt,
    channel: { name: 'streamelements' },
    user: { name, displayName: name, actorType: 'human', roles: [] },
    payload: { amount, currency, ...(message === '' ? {} : { message }) },
    metadata: { simulated, ...(stableId === '' ? { unverifiedFields: ['source.eventId'] } : {}) },
  };
}
