import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { AdapterContext } from './adapter.js';
import { ManagedAdapter } from './adapter.js';
import type { StreamerBotEventRelay } from './streamerbot-event-relay.js';

const sceneRelaySchema = z.object({
  type: z.literal('thsv.scene'),
  version: z.literal('1.0.0'),
  provider: z.enum(['obs', 'streamlabs', 'meld']),
  sourceEventType: z.string().min(1).max(100),
  relayId: z.string().min(1).max(256),
  receivedAt: z.iso.datetime({ offset: true }),
  simulated: z.boolean(),
  connectionId: z.string().max(256).default(''),
  connectionName: z.string().max(256).default(''),
  sceneName: z.string().min(1).max(256),
  oldSceneName: z.string().max(256).default(''),
}).strict();

export class StreamerBotSceneRelayAdapter extends ManagedAdapter {
  private unsubscribe: (() => void) | undefined;
  private context: AdapterContext | undefined;

  public constructor(name: string, config: ManagedAdapter['config'], private readonly relay: StreamerBotEventRelay) { super(name, config); }

  public async start(context: AdapterContext): Promise<void> {
    if (!this.config.enabled) { this.state = 'disabled'; return; }
    this.context = context;
    this.unsubscribe = this.relay.subscribe((message) => { void this.receive(message); });
    this.state = 'connected';
    this.lastError = undefined;
    context.logger.info('Streamer.bot scene relay adapter started', { adapter: this.name });
  }

  public async stop(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.context = undefined;
    this.state = 'stopped';
  }

  private async receive(message: Readonly<Record<string, unknown>>): Promise<void> {
    const context = this.context;
    if (message['type'] !== 'thsv.scene' || context === undefined) return;
    try {
      const event = normalizeStreamerBotSceneRelay(message);
      const result = await context.emit(event, Buffer.byteLength(JSON.stringify(message)));
      this.lastEventAt = new Date().toISOString();
      this.lastError = undefined;
      context.logger.info('Streamer.bot scene relay event accepted', { adapter: this.name, provider: event.payload['provider'], sceneName: event.payload['sceneName'], result });
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      context.logger.warn('Streamer.bot scene relay event rejected', { adapter: this.name, error });
    }
  }
}

export function normalizeStreamerBotSceneRelay(input: unknown): NormalizedEvent {
  const relay = sceneRelaySchema.parse(input);
  const connectionId = clean(relay.connectionId);
  const connectionName = clean(relay.connectionName);
  const sceneName = clean(relay.sceneName);
  const oldSceneName = clean(relay.oldSceneName);
  if (sceneName === '') throw new Error('Scene relay requires a non-empty scene name.');
  return {
    schemaVersion: '1.0.0',
    eventId: boundedEventId(`streamerbot-scene-${relay.provider}-`, relay.relayId),
    eventType: 'stream.scene-changed',
    platform: 'system',
    source: { adapter: 'streamerbot-scene-relay', eventId: relay.relayId, eventName: relay.sourceEventType },
    receivedAt: relay.receivedAt,
    channel: { ...(connectionId === '' ? {} : { id: connectionId }), name: connectionName || relay.provider },
    payload: {
      provider: relay.provider,
      sceneName,
      ...(oldSceneName === '' ? {} : { oldSceneName }),
      ...(connectionId === '' ? {} : { connectionId }),
      ...(connectionName === '' ? {} : { connectionName }),
    },
    metadata: { simulated: relay.simulated },
  };
}

function boundedEventId(prefix: string, value: string): string {
  const composed = `${prefix}${value}`;
  return composed.length <= 256 ? composed : `${prefix}sha256-${createHash('sha256').update(value).digest('hex')}`;
}

function clean(value: string): string { return value.replace(/[\p{Cc}\s]+/gu, ' ').trim(); }
