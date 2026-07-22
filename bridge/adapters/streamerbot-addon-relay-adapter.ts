import { createHash } from 'node:crypto';
import { z } from 'zod';
import { eventTypeSchema, jsonValueSchema, type NormalizedEvent } from '../../schemas/event.js';
import type { AdapterContext } from './adapter.js';
import { ManagedAdapter } from './adapter.js';
import type { StreamerBotEventRelay } from './streamerbot-event-relay.js';
import { addOnRelayAuthorizer } from '../services/addon-relay-authorizer.js';

// A creator-approved Streamer.bot action has no way to hand a computed result (for example, a
// fetched clip list) straight back to the add-on that requested it: runApprovedAction only
// dispatches, it never returns data (see AddOnStreamerBotCapabilityV2.runApprovedAction). This
// adapter is the return path. The action calls CPH.WebsocketBroadcastJson with this envelope, the
// same General.Custom broadcast mechanism native-platform-intake already uses one direction; this
// reuses it for the other direction. The resulting NormalizedEvent flows through the exact same
// bridge.ingest -> ModuleRegistry.publish pipeline every other event type already uses, so any
// add-on that declared eventType in its manifest's eventSubscriptions receives it via onEvent. The
// The event type is caller-chosen inside the authenticated add-on namespace (for example
// "addon.thsv.random-clip-player.clips-received"); the one-use token below binds that namespace
// to the add-on whose approved action was dispatched.
const MAXIMUM_PAYLOAD_BYTES = 65_536;
const MAXIMUM_PAYLOAD_KEYS = 100;
const LEGACY_RANDOM_CLIP_EVENTS = new Map([
  ['addon.random-clip-player.clips-received', 'addon.thsv.random-clip-player.clips-received'],
  ['addon.random-clip-player.clip-download-received', 'addon.thsv.random-clip-player.clip-download-received'],
]);

const relaySchema = z.object({
  type: z.literal('thsv.addon'),
  version: z.literal('1.0.0'),
  moduleId: z.string().min(1).max(128).regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/),
  eventType: eventTypeSchema,
  sourceEventType: z.string().min(1).max(100),
  relayId: z.string().min(1).max(256),
  relayToken: z.union([z.literal(''), z.string().min(20).max(100)]).default(''),
  receivedAt: z.iso.datetime({ offset: true }),
  simulated: z.boolean(),
  payload: z.record(z.string(), jsonValueSchema).default({}),
}).strict().superRefine((relay, context) => {
  const legacyRandomClipEvent = relay.moduleId === 'thsv.random-clip-player' && LEGACY_RANDOM_CLIP_EVENTS.has(relay.eventType);
  if (!relay.eventType.startsWith(`addon.${relay.moduleId}.`) && !legacyRandomClipEvent) context.addIssue({
    code: 'custom',
    path: ['eventType'],
    message: `Add-on relay eventType must begin with addon.${relay.moduleId}.`,
  });
});

type AddOnRelay = z.infer<typeof relaySchema>;

export class StreamerBotAddOnRelayAdapter extends ManagedAdapter {
  private unsubscribe: (() => void) | undefined;
  private context: AdapterContext | undefined;

  public constructor(name: string, config: ManagedAdapter['config'], private readonly relay: StreamerBotEventRelay) { super(name, config); }

  public async start(context: AdapterContext): Promise<void> {
    if (!this.config.enabled) { this.state = 'disabled'; return; }
    this.context = context;
    this.unsubscribe = this.relay.subscribe((message) => { void this.receive(message); });
    this.state = 'connected';
    this.lastError = undefined;
    context.logger.info('Streamer.bot add-on relay adapter started', { adapter: this.name });
  }

  public async stop(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.context = undefined;
    this.state = 'stopped';
  }

  private async receive(message: Readonly<Record<string, unknown>>): Promise<void> {
    // Captured once so a concurrent stop() clearing this.context mid-flight cannot leave the
    // catch handler below dereferencing undefined after an awaited emit() rejects.
    const context = this.context;
    if (message['type'] !== 'thsv.addon' || context === undefined) return;
    try {
      const event = normalizeStreamerBotAddOnRelay(message);
      const result = await context.emit(event, Buffer.byteLength(JSON.stringify(message)));
      this.lastEventAt = new Date().toISOString();
      this.lastError = undefined;
      context.logger.info('Streamer.bot add-on relay event accepted', { adapter: this.name, eventType: event.eventType, eventId: event.eventId, result });
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      context.logger.warn('Streamer.bot add-on relay event rejected', { adapter: this.name, error });
    }
  }
}

export function normalizeStreamerBotAddOnRelay(input: unknown): NormalizedEvent {
  const relay = relaySchema.parse(input);
  if (!isCreatorPlaybackControl(relay) && !addOnRelayAuthorizer.consume(relay.moduleId, relay.relayToken)) throw new Error('Add-on relay token is missing, expired, already used, or belongs to another module.');
  assertBoundedPayload(relay.payload);
  // Versions before Random Clip Player 1.3 used a shortened namespace. Accept only those two
  // exact historical events and canonicalize them immediately; all other add-ons still have to
  // publish inside their full module-owned namespace.
  const eventType = relay.moduleId === 'thsv.random-clip-player'
    ? LEGACY_RANDOM_CLIP_EVENTS.get(relay.eventType) ?? relay.eventType
    : relay.eventType;
  return {
    schemaVersion: '1.0.0',
    eventId: boundedEventId('streamerbot-addon-', `${relay.moduleId}-${relay.relayId}`),
    eventType,
    platform: 'system',
    source: { adapter: 'streamerbot-addon-relay', eventId: relay.relayId, eventName: relay.sourceEventType },
    receivedAt: relay.receivedAt,
    channel: { name: 'system' },
    payload: relay.payload,
    metadata: { simulated: relay.simulated, rawPayload: { moduleId: relay.moduleId } },
  };
}

function boundedEventId(prefix: string, value: string): string {
  const composed = `${prefix}${value}`;
  return composed.length <= 256 ? composed : `${prefix}sha256-${createHash('sha256').update(value).digest('hex')}`;
}

function isCreatorPlaybackControl(relay: AddOnRelay): boolean {
  if (relay.moduleId !== 'thsv.random-clip-player' || relay.eventType !== 'addon.thsv.random-clip-player.control') return false;
  if (!['THSV Addon - Random Clip Player - Enable', 'THSV Addon - Random Clip Player - Disable'].includes(relay.sourceEventType)) return false;
  return Object.keys(relay.payload).length === 1 && typeof relay.payload['enabled'] === 'boolean';
}

function assertBoundedPayload(payload: AddOnRelay['payload']): void {
  const keys = Object.keys(payload);
  if (keys.length > MAXIMUM_PAYLOAD_KEYS) throw new Error(`Add-on relay payload may contain at most ${String(MAXIMUM_PAYLOAD_KEYS)} keys.`);
  if (Buffer.byteLength(JSON.stringify(payload)) > MAXIMUM_PAYLOAD_BYTES) throw new Error(`Add-on relay payload may be at most ${String(MAXIMUM_PAYLOAD_BYTES)} bytes.`);
}
