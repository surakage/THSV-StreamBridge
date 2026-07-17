import { Buffer } from 'node:buffer';
import { normalizedEventSchema, type NormalizedEvent } from '../../schemas/event.js';
import type { BridgeConfig } from '../../schemas/config.js';
import type { AdapterStatus, InputAdapter, OutputAdapter, SimulationAdapter } from '../adapters/adapter.js';
import { isSimulationAdapter } from '../adapters/adapter.js';
import type { Logger } from '../services/logger.js';
import { writeJsonAtomic } from '../services/atomic-state.js';
import type { DeduplicationStore } from '../services/deduplication-store.js';
import { EventDeduplicator } from './deduplicator.js';
import { InternalEventBus } from './event-bus.js';
import { OutputDeliveryManager } from './delivery-manager.js';
import { deriveCommandEvent, InvalidMultiCommandError } from './multi-commands.js';
import { isTimedActionsController, type TimedActionsAdapter } from '../adapters/timed-actions-adapter.js';
import { ViewerProgressionEngine } from './viewer-progression.js';
import { NoopViewerProgressionStore } from '../services/viewer-progression-store.js';

export type IngestResult = {
  readonly accepted: true;
  readonly duplicate: boolean;
  readonly eventId: string;
  readonly delivery: 'queued' | 'none';
  readonly outputs: readonly string[];
  readonly derivedEventIds?: readonly string[];
};

export type StateWriter = (path: string, value: unknown) => Promise<void>;

export class PayloadTooLargeError extends Error {}
export class InvalidEventError extends Error {
  public constructor(public readonly details: readonly string[]) { super('Event validation failed'); }
}

export interface StreamBridgeDependencies {
  readonly inputs: readonly InputAdapter[];
  readonly outputs: readonly OutputAdapter[];
  readonly deduplicationStore: DeduplicationStore;
  readonly stateWriter?: StateWriter;
  readonly viewerProgression?: ViewerProgressionEngine;
}

export class StreamBridge {
  private readonly bus = new InternalEventBus();
  private readonly deduplicator: EventDeduplicator;
  private readonly inputs: readonly InputAdapter[];
  private readonly simulationAdapter: SimulationAdapter;
  private readonly delivery: OutputDeliveryManager;
  private readonly stateWriter: StateWriter;
  private readonly timedActions: TimedActionsAdapter | undefined;
  private readonly viewerProgression: ViewerProgressionEngine;
  private readonly livePlatforms = new Set<string>();
  private running = false;
  private startedAt: string | undefined;
  private lastAcceptedEventAt: string | undefined;
  private lastAcceptedSequence = 0;
  private statePersistenceError: string | undefined;
  private nextSequence = 0;
  private lastPersistedSequence = 0;
  private stateWriteChain: Promise<void> = Promise.resolve();

  public constructor(
    private readonly config: BridgeConfig,
    private readonly logger: Logger,
    private readonly dependencies: StreamBridgeDependencies,
  ) {
    this.deduplicator = new EventDeduplicator(config.deduplication.ttlMs, config.deduplication.maxEntries);
    this.inputs = dependencies.inputs;
    this.timedActions = this.inputs.find(isTimedActionsController);
    const simulationAdapter = this.inputs.find(isSimulationAdapter);
    if (simulationAdapter === undefined) throw new Error('No simulation-capable input adapter is registered');
    this.simulationAdapter = simulationAdapter;
    this.delivery = new OutputDeliveryManager(
      dependencies.outputs,
      config.streamerbot.deliveryQueueCapacity,
      config.streamerbot.deliveryConcurrency,
      config.streamerbot.deliveryFailureThreshold,
      logger,
    );
    this.stateWriter = dependencies.stateWriter ?? writeJsonAtomic;
    this.viewerProgression = dependencies.viewerProgression ?? new ViewerProgressionEngine(config.viewerIdentity, new NoopViewerProgressionStore());
  }

  public subscribe(handler: Parameters<InternalEventBus['subscribe']>[0]): () => void { return this.bus.subscribe(handler); }

  public async start(): Promise<void> {
    if (this.running) return;
    this.deduplicator.restore(await this.dependencies.deduplicationStore.load());
    await this.viewerProgression.start();
    this.startedAt = new Date().toISOString();
    this.running = true;
    await this.delivery.start();
    for (const adapter of this.inputs) {
      if (!adapter.config.enabled) continue;
      try { await adapter.start({ logger: this.logger, emit: (event, byteLength) => this.ingest(event, byteLength) }); }
      catch (error) { this.logger.error('Input adapter startup failed; bridge remains active', { adapter: adapter.name, error }); }
    }
    this.logger.info('Bridge core started', { service: this.config.service.name });
  }

  public async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    const controller = new AbortController();
    const operations = [
      ...this.inputs.map((adapter) => adapter.stop(controller.signal)),
      this.delivery.stop(controller.signal),
      this.dependencies.deduplicationStore.flush(),
      this.viewerProgression.stop(),
    ];
    const completion = Promise.allSettled(operations).then(() => 'complete' as const);
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), this.config.service.shutdownTimeoutMs); });
    const result = await Promise.race([completion, timeout]);
    if (timer !== undefined) clearTimeout(timer);
    if (result === 'timeout') {
      controller.abort();
      this.logger.warn('Graceful shutdown timed out; remaining operations were cancelled where supported');
    }
    this.logger.info('Bridge core stopped');
  }

  public async simulate(input: unknown, byteLength?: number): Promise<IngestResult> {
    const result = await this.simulationAdapter.simulate(input, byteLength);
    if (!isIngestResult(result)) throw new Error('Simulation adapter completed without an ingest result');
    return result;
  }

  public async controlTimedActions(operation: 'start' | 'stop' | 'pause' | 'resume'): Promise<Readonly<Record<string, unknown>>> {
    if (this.timedActions === undefined) throw new Error('Timed actions adapter is not configured');
    if (operation === 'stop') this.livePlatforms.clear();
    return this.timedActions.control(operation);
  }

  public async ingest(input: unknown, byteLength?: number): Promise<IngestResult> {
    const size = byteLength ?? Buffer.byteLength(JSON.stringify(input));
    if (size > this.config.security.maxPayloadBytes) throw new PayloadTooLargeError(`Payload is ${String(size)} bytes; maximum is ${String(this.config.security.maxPayloadBytes)}`);
    const parsed = normalizedEventSchema.safeParse(input);
    if (!parsed.success) throw new InvalidEventError(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
    const validatedEvent = withoutCallerControlledMetadata(parsed.data, this.config.security.preserveRawPayloads);
    if (this.deduplicator.isDuplicate(validatedEvent)) {
      this.logger.debug('Duplicate event ignored', { eventId: validatedEvent.eventId, eventType: validatedEvent.eventType, platform: validatedEvent.platform });
      return { accepted: true, duplicate: true, eventId: validatedEvent.eventId, delivery: 'none', outputs: [] };
    }
    if (validatedEvent.eventType === 'stream.online') {
      const wasOffline = this.livePlatforms.size === 0;
      this.livePlatforms.add(validatedEvent.platform);
      if (wasOffline && this.timedActions?.controlStatus()['active'] !== true) await this.timedActions?.control('start');
    } else if (validatedEvent.eventType === 'stream.offline') {
      this.livePlatforms.delete(validatedEvent.platform);
      if (this.livePlatforms.size === 0) await this.timedActions?.control('stop');
    }

    let derivedCommand: NormalizedEvent | undefined;
    let progression: Awaited<ReturnType<ViewerProgressionEngine['process']>>;
    try { derivedCommand = deriveCommandEvent(validatedEvent, this.config.commands); }
    catch (error) {
      this.deduplicator.forget(validatedEvent);
      if (error instanceof InvalidMultiCommandError) throw new InvalidEventError([error.message]);
      throw error;
    }
    try { progression = await this.viewerProgression.process(validatedEvent); }
    catch (error) { this.deduplicator.forget(validatedEvent); throw error; }
    const attributedEvent = progression === undefined ? validatedEvent : withViewerId(validatedEvent, progression.viewerId);
    if (derivedCommand !== undefined && progression !== undefined) derivedCommand = withViewerId(derivedCommand, progression.viewerId);
    const events = [withBridgeSequence(attributedEvent, ++this.nextSequence)];
    if (derivedCommand !== undefined) events.push(withBridgeSequence(derivedCommand, ++this.nextSequence));
    if (progression?.progressionEvent !== undefined) events.push(withBridgeSequence(progression.progressionEvent, ++this.nextSequence));

    try {
      for (const event of events) await this.bus.publish(event);
      const outputs = this.delivery.enqueueBatch(events);
      const lastEvent = events.at(-1);
      if (lastEvent === undefined) throw new Error('No accepted event was produced');
      const acceptedAt = new Date().toISOString();
      const acceptedSequence = lastEvent.metadata.bridgeSequence ?? 0;
      if (acceptedSequence > this.lastAcceptedSequence) {
        this.lastAcceptedSequence = acceptedSequence;
        this.lastAcceptedEventAt = acceptedAt;
      }
      this.dependencies.deduplicationStore.scheduleSave(this.deduplicator.snapshot());
      await this.persistAcceptedState(lastEvent, acceptedAt);
      for (const event of events) this.logger.info('Event accepted for delivery', { eventId: event.eventId, eventType: event.eventType, platform: event.platform, outputs });
      return {
        accepted: true,
        duplicate: false,
        eventId: validatedEvent.eventId,
        delivery: outputs.length === 0 ? 'none' : 'queued',
        outputs,
        ...(events.length <= 1 ? {} : { derivedEventIds: events.slice(1).map((event) => event.eventId) }),
      };
    } catch (error) {
      this.deduplicator.forget(validatedEvent);
      throw error;
    }
  }

  public health(): Readonly<Record<string, unknown>> {
    return {
      status: this.running ? 'healthy' : 'stopped',
      service: this.config.service.name,
      startedAt: this.startedAt,
      lastAcceptedEventAt: this.lastAcceptedEventAt,
      ...(this.statePersistenceError === undefined ? {} : { statePersistenceError: this.statePersistenceError }),
    };
  }

  public readiness(): Readonly<Record<string, unknown>> {
    const adapterStatuses = this.adapterStatuses();
    const blocking = adapterStatuses.filter((adapter) => adapter.state !== 'connected' && adapter.state !== 'disabled');
    const ready = this.running && blocking.length === 0 && this.delivery.ready();
    return { status: ready ? 'ready' : 'not-ready', ready, adapters: adapterStatuses, outputs: this.delivery.statuses() };
  }

  public diagnostics(): Readonly<Record<string, unknown>> {
    return {
      ...this.health(),
      ...this.readiness(),
      deduplicationEntries: this.deduplicator.size,
      lastBridgeSequence: this.nextSequence,
      deduplicationPersistence: this.dependencies.deduplicationStore.status(),
      timedActions: this.timedActions?.controlStatus(),
      viewerIdentity: this.viewerProgression.status(),
    };
  }

  private adapterStatuses(): AdapterStatus[] { return this.inputs.map((adapter) => adapter.status()); }

  private async persistAcceptedState(event: NormalizedEvent, acceptedAt: string): Promise<void> {
    const bridgeSequence = event.metadata.bridgeSequence ?? 0;
    const value = { lastAcceptedEventAt: acceptedAt, lastEventId: event.eventId, bridgeSequence };
    const write = this.stateWriteChain.then(async () => {
      if (bridgeSequence <= this.lastPersistedSequence) return;
      await this.stateWriter('data/state/bridge-status.json', value);
      this.lastPersistedSequence = bridgeSequence;
    });
    this.stateWriteChain = write.catch(() => undefined);
    try {
      await write;
      this.statePersistenceError = undefined;
    } catch (error) {
      this.statePersistenceError = error instanceof Error ? error.message : String(error);
      this.logger.warn('Event was accepted but bridge status persistence failed', { eventId: event.eventId, error });
    }
  }
}

function isIngestResult(value: unknown): value is IngestResult {
  return value !== null && typeof value === 'object' && (value as Record<string, unknown>)['accepted'] === true && typeof (value as Record<string, unknown>)['eventId'] === 'string';
}

function withoutCallerControlledMetadata(event: NormalizedEvent, preserveRawPayload: boolean): NormalizedEvent {
  const { bridgeSequence: _sequence, viewerId: _viewerId, rawPayload, ...metadata } = event.metadata;
  void _sequence; void _viewerId;
  return { ...event, metadata: { ...metadata, ...(preserveRawPayload && rawPayload !== undefined ? { rawPayload } : {}) } };
}

function withBridgeSequence(event: NormalizedEvent, bridgeSequence: number): NormalizedEvent {
  return { ...event, metadata: { ...event.metadata, bridgeSequence } };
}

function withViewerId(event: NormalizedEvent, viewerId: string): NormalizedEvent {
  return { ...event, metadata: { ...event.metadata, viewerId } };
}
