import type { AddOnOutboundMessageDeliveryV2, AddOnOutboundMessageRequestV2, AddOnOutboundPlatformV2 } from '../contracts/v2/addon-capability.js';

export const OUTBOUND_PLATFORM_VALUES = ['twitch', 'youtube', 'kick', 'tiktok'] as const;
export type OutboundPlatform = AddOnOutboundPlatformV2;

export const DEFAULT_OUTBOUND_CHARACTER_LIMITS: Readonly<Record<OutboundPlatform, number>> = Object.freeze({
  twitch: 500,
  youtube: 200,
  kick: 500,
  tiktok: 150,
});

export interface OutboundMessageRequest {
  readonly message: string;
  readonly routing: 'source' | 'selected';
  readonly sourcePlatform?: OutboundPlatform;
  readonly selectedPlatforms?: readonly OutboundPlatform[];
  readonly overflow?: 'reject' | 'split';
  readonly characterLimits?: Partial<Readonly<Record<OutboundPlatform, number>>>;
}

export type OutboundMessageDelivery = AddOnOutboundMessageDeliveryV2;

export type AddOnRoutableMessageRequest = AddOnOutboundMessageRequestV2;

export interface OutboundMessageDispatcher {
  send(platform: OutboundPlatform, message: string, part: number, totalParts: number, signal?: AbortSignal): Promise<void>;
}

export class OutboundMessageRouter {
  public constructor(private readonly dispatcher: OutboundMessageDispatcher) {}

  public async route(request: OutboundMessageRequest, signal?: AbortSignal): Promise<readonly OutboundMessageDelivery[]> {
    const message = normalizeOutboundMessage(request.message);
    const platforms = resolvePlatforms(request);
    const limits = { ...DEFAULT_OUTBOUND_CHARACTER_LIMITS, ...(request.characterLimits ?? {}) };
    const deliveries: OutboundMessageDelivery[] = [];
    for (const platform of platforms) {
      signal?.throwIfAborted();
      const limit = limits[platform];
      if (!Number.isInteger(limit) || limit < 40 || limit > 2_000) throw new Error(`Outbound character limit for ${platform} must be an integer from 40 through 2000.`);
      let parts: readonly string[];
      try { parts = splitMessage(message, limit, request.overflow ?? 'reject'); }
      catch (error) { deliveries.push({ platform, accepted: false, parts: 0, error: error instanceof Error ? error.message : String(error) }); continue; }
      let deliveredParts = 0;
      try {
        for (const [index, part] of parts.entries()) { signal?.throwIfAborted(); await this.dispatcher.send(platform, part, index + 1, parts.length, signal); deliveredParts += 1; }
        deliveries.push({ platform, accepted: true, parts: parts.length });
      } catch (error) {
        if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('Outbound message routing was cancelled.');
        deliveries.push({ platform, accepted: false, parts: deliveredParts, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return deliveries;
  }
}

export function splitMessage(message: string, maximumCharacters: number, overflow: 'reject' | 'split'): readonly string[] {
  const characters = Array.from(message);
  if (characters.length <= maximumCharacters) return [message];
  if (overflow === 'reject') throw new Error(`Message contains ${String(characters.length)} characters; the platform limit is ${String(maximumCharacters)}.`);
  const result: string[] = [];
  let remaining = message;
  while (Array.from(remaining).length > maximumCharacters) {
    if (result.length >= 9) throw new Error('Message would require more than 10 outbound parts.');
    const candidate = Array.from(remaining).slice(0, maximumCharacters).join('');
    const breakAt = Math.max(candidate.lastIndexOf(' '), candidate.lastIndexOf('\n'));
    const take = breakAt >= Math.floor(maximumCharacters * 0.5) ? candidate.slice(0, breakAt) : candidate;
    result.push(take.trim());
    remaining = remaining.slice(take.length).trimStart();
  }
  if (remaining.length > 0) result.push(remaining);
  return result;
}

function resolvePlatforms(request: OutboundMessageRequest): readonly OutboundPlatform[] {
  if (request.routing === 'source') {
    if (request.sourcePlatform === undefined) throw new Error('Source-routed messages require a source platform.');
    return [request.sourcePlatform];
  }
  const platforms = request.selectedPlatforms ?? [];
  if (platforms.length === 0) throw new Error('Selected-platform routing requires at least one platform.');
  if (platforms.some((platform) => !OUTBOUND_PLATFORM_VALUES.includes(platform))) throw new Error('Outbound routing contains an unsupported platform.');
  return [...new Set(platforms)];
}

function normalizeOutboundMessage(value: string): string {
  if (typeof value !== 'string') throw new Error('Outbound message must be text.');
  const normalized = value.replace(/[\p{Cc}\p{Cf}]+/gu, ' ').replace(/\s+/gu, ' ').trim();
  if (normalized.length === 0) throw new Error('Outbound message is empty after normalization.');
  if (Array.from(normalized).length > 10_000) throw new Error('Outbound message exceeds the 10000-character safety limit.');
  return normalized;
}
