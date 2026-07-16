import { Buffer } from 'node:buffer';
import { normalizedEventSchema, type NormalizedEvent } from '../../schemas/event.js';
import type { BridgeConfig } from '../../schemas/config.js';
import { MockAdapter } from '../adapters/mock-adapter.js';
import { PlaceholderAdapter } from '../adapters/placeholder-adapter.js';
import { StreamerBotAdapter } from '../adapters/streamerbot-adapter.js';
import type { AdapterStatus, PlatformAdapter } from '../adapters/adapter.js';
import type { Logger } from '../services/logger.js';
import { writeJsonAtomic } from '../services/atomic-state.js';
import { EventDeduplicator } from './deduplicator.js';
import { InternalEventBus } from './event-bus.js';

export type IngestResult = { readonly accepted: true; readonly duplicate: boolean; readonly eventId: string };

export class PayloadTooLargeError extends Error {}
export class InvalidEventError extends Error {
  public constructor(public readonly details: readonly string[]) { super('Event validation failed'); }
}

export class StreamBridge {
  private readonly bus = new InternalEventBus();
  private readonly deduplicator: EventDeduplicator;
  private readonly adapters: PlatformAdapter[];
  private readonly streamerbot: StreamerBotAdapter;
  private running = false;
  private startedAt: string | undefined;
  private lastSuccessfulEventAt: string | undefined;
  public readonly mockAdapter: MockAdapter;

  public constructor(private readonly config: BridgeConfig, private readonly logger: Logger) {
    this.deduplicator = new EventDeduplicator(config.deduplication.ttlMs, config.deduplication.maxEntries);
    this.mockAdapter = new MockAdapter(config.platforms.mock);
    this.adapters = [
      new PlaceholderAdapter('twitch', config.platforms.twitch, 'Twitch production transport is deferred.'),
      new PlaceholderAdapter('youtube', config.platforms.youtube, 'YouTube production transport is deferred.'),
      new PlaceholderAdapter('kick', config.platforms.kick, 'Kick production transport is deferred.'),
      new PlaceholderAdapter('tikfinity', config.platforms.tiktok, 'TikFinity payloads and local API are unverified; only fixtures are supported.'),
      new PlaceholderAdapter('facebook', config.platforms.facebook, 'Facebook production transport is deferred.'),
      this.mockAdapter,
    ];
    this.streamerbot = new StreamerBotAdapter(config.streamerbot, logger);
    this.bus.subscribe(async (event) => {
      try { await this.streamerbot.sendEvent(event); }
      catch (error) { this.logger.warn('Streamer.bot delivery failed without stopping the bridge', { eventId: event.eventId, error }); }
    });
  }

  public async start(): Promise<void> {
    if (this.running) return;
    this.startedAt = new Date().toISOString();
    this.running = true;
    for (const adapter of this.adapters) {
      if (!adapter.config.enabled) continue;
      try { await adapter.start({ logger: this.logger, emit: (event) => this.ingest(event).then(() => undefined) }); }
      catch (error) { this.logger.error('Adapter startup failed; bridge remains active', { adapter: adapter.name, error }); }
    }
    try { await this.streamerbot.start(); }
    catch (error) { this.logger.warn('Streamer.bot startup failed; bridge remains active', { error }); }
    this.logger.info('Bridge core started', { service: this.config.service.name });
  }

  public async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    const stops = [...this.adapters.map((adapter) => adapter.stop()), this.streamerbot.stop()];
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Graceful shutdown timed out')), this.config.service.shutdownTimeoutMs));
    await Promise.race([Promise.allSettled(stops), timeout]);
    this.logger.info('Bridge core stopped');
  }

  public async ingest(input: unknown): Promise<IngestResult> {
    const size = Buffer.byteLength(JSON.stringify(input));
    if (size > this.config.security.maxPayloadBytes) throw new PayloadTooLargeError(`Payload is ${String(size)} bytes; maximum is ${String(this.config.security.maxPayloadBytes)}`);
    const parsed = normalizedEventSchema.safeParse(input);
    if (!parsed.success) throw new InvalidEventError(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
    const event = this.config.security.preserveRawPayloads ? parsed.data : withoutRawPayload(parsed.data);
    if (this.deduplicator.isDuplicate(event)) {
      this.logger.debug('Duplicate event ignored', { eventId: event.eventId, eventType: event.eventType, platform: event.platform });
      return { accepted: true, duplicate: true, eventId: event.eventId };
    }
    await this.bus.publish(event);
    this.lastSuccessfulEventAt = new Date().toISOString();
    await writeJsonAtomic('data/state/bridge-status.json', { lastSuccessfulEventAt: this.lastSuccessfulEventAt, lastEventId: event.eventId });
    this.logger.info('Event accepted', { eventId: event.eventId, eventType: event.eventType, platform: event.platform });
    return { accepted: true, duplicate: false, eventId: event.eventId };
  }

  public health(): Readonly<Record<string, unknown>> {
    return { status: this.running ? 'healthy' : 'stopped', service: this.config.service.name, startedAt: this.startedAt, lastSuccessfulEventAt: this.lastSuccessfulEventAt };
  }

  public readiness(): Readonly<Record<string, unknown>> {
    const adapterStatuses = this.adapterStatuses();
    const streamerbotStatus = this.streamerbot.status();
    const blocking = adapterStatuses.filter((adapter) => adapter.state !== 'connected' && adapter.state !== 'disabled');
    const streamerbotBlocking = this.config.streamerbot.enabled && streamerbotStatus['state'] !== 'connected';
    const ready = this.running && blocking.length === 0 && !streamerbotBlocking;
    return { status: ready ? 'ready' : 'not-ready', ready, adapters: adapterStatuses, streamerbot: streamerbotStatus };
  }

  public diagnostics(): Readonly<Record<string, unknown>> {
    return { ...this.health(), ...this.readiness(), deduplicationEntries: this.deduplicator.size };
  }

  private adapterStatuses(): AdapterStatus[] { return this.adapters.map((adapter) => adapter.status()); }
}

function withoutRawPayload(event: NormalizedEvent): NormalizedEvent {
  if (event.metadata.rawPayload === undefined) return event;
  const { rawPayload: _ignored, ...metadata } = event.metadata;
  void _ignored;
  return { ...event, metadata };
}
