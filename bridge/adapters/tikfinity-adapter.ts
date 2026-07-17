import { z } from 'zod';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { AdapterContext } from './adapter.js';
import { ManagedAdapter } from './adapter.js';
import type { StreamerBotEventRelay } from './streamerbot-event-relay.js';

const relaySchema = z.object({
  type: z.literal('thsv.tikfinity'),
  version: z.literal('1.0.0'),
  kind: z.enum(['chat', 'follow', 'gift', 'like']),
  relayId: z.string().min(1).max(256),
  receivedAt: z.iso.datetime({ offset: true }),
  simulated: z.boolean(),
  userId: z.string().max(256).default(''),
  username: z.string().max(256).default(''),
  nickname: z.string().max(256).default(''),
  profilePictureUrl: z.string().max(2_048).default(''),
  commandParams: z.string().max(2_000).default(''),
  giftId: z.string().max(256).default(''),
  giftName: z.string().max(500).default(''),
  coins: z.string().max(32).default(''),
  repeatCount: z.string().max(32).default(''),
  likeCount: z.string().max(32).default(''),
  totalLikeCount: z.string().max(32).default(''),
  argumentKeys: z.array(z.string().max(100)).max(100).default([]),
}).strict();

export class TikfinityAdapter extends ManagedAdapter {
  private unsubscribe: (() => void) | undefined;
  private context: AdapterContext | undefined;

  public constructor(name: string, config: ManagedAdapter['config'], private readonly relay: StreamerBotEventRelay) { super(name, config); }

  public async start(context: AdapterContext): Promise<void> {
    if (!this.config.enabled) { this.state = 'disabled'; return; }
    this.context = context;
    this.unsubscribe = this.relay.subscribe((message) => { void this.receive(message); });
    this.state = 'connected';
    this.lastError = undefined;
    context.logger.info('TikFinity Streamer.bot relay adapter started', { adapter: this.name });
  }

  public async stop(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.context = undefined;
    this.state = 'stopped';
  }

  private async receive(message: Readonly<Record<string, unknown>>): Promise<void> {
    if (message['type'] !== 'thsv.tikfinity' || this.context === undefined) return;
    try {
      const event = normalizeTikfinityRelay(message, this.name);
      await this.context.emit(event, Buffer.byteLength(JSON.stringify(message)));
      this.lastEventAt = new Date().toISOString();
      this.lastError = undefined;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.context.logger.warn('TikFinity relay event rejected', { adapter: this.name, error });
    }
  }
}

export function normalizeTikfinityRelay(input: unknown, channelName = 'tiktok'): NormalizedEvent {
  const relay = relaySchema.parse(input);
  const userName = clean(relay.username) || clean(relay.nickname) || 'unknown-tiktok-user';
  const displayName = clean(relay.nickname) || userName;
  const avatarUrl = validHttps(relay.profilePictureUrl);
  const user = {
    ...(clean(relay.userId) === '' ? {} : { id: clean(relay.userId) }),
    name: userName,
    displayName,
    actorType: 'human' as const,
    roles: [] as string[],
    ...(avatarUrl === undefined ? {} : { avatarUrl }),
  };
  const common = {
    schemaVersion: '1.0.0' as const,
    eventId: `tikfinity-${relay.kind}-${relay.relayId}`,
    platform: 'tiktok',
    source: { adapter: 'tikfinity-streamerbot', eventId: relay.relayId, eventName: `TikFinity.${relay.kind}` },
    receivedAt: relay.receivedAt,
    channel: { name: channelName },
    user,
    metadata: {
      simulated: relay.simulated,
      unverifiedFields: ['source.eventId', 'metadata.simulated', ...relay.argumentKeys.map((key) => `tikfinity.${key}`)].slice(0, 100),
    },
  };
  if (relay.kind === 'chat') {
    const message = clean(relay.commandParams);
    if (message === '') throw new Error('TikFinity chat relay requires commandParams.');
    return { ...common, eventType: 'chat.message', payload: { message } };
  }
  if (relay.kind === 'follow') return { ...common, eventType: 'channel.follow', payload: {} };
  if (relay.kind === 'gift') {
    const itemName = clean(relay.giftName) || (clean(relay.giftId) === '' ? 'TikTok Gift' : `TikTok Gift ${clean(relay.giftId)}`);
    const coins = nonNegativeInteger(relay.coins);
    return { ...common, eventType: 'engagement.gift', payload: { itemName, quantity: positiveInteger(relay.repeatCount, 1), ...(coins === undefined ? {} : { coins }) } };
  }
  return { ...common, eventType: 'engagement.milestone', payload: { metric: 'likes', value: nonNegativeInteger(relay.totalLikeCount) ?? nonNegativeInteger(relay.likeCount) ?? 0 } };
}

function clean(value: string): string { return value.replace(/[\p{Cc}\s]+/gu, ' ').trim(); }
function positiveInteger(value: string, fallback: number): number { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback; }
function nonNegativeInteger(value: string): number | undefined { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined; }
function validHttps(value: string): string | undefined { try { const url = new URL(value); return url.protocol === 'https:' ? url.toString() : undefined; } catch { return undefined; } }
