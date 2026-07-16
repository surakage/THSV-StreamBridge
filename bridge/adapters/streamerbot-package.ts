import type { NormalizedEvent } from '../../schemas/event.js';

export const STREAMERBOT_PACKAGE_CONTRACT_VERSION = '1.0.0';

export interface StreamerBotEventArguments {
  readonly streamBridgeContractVersion: string;
  readonly streamBridgeEvent: string;
  readonly streamBridgeSchemaVersion: string;
  readonly streamBridgeEventId: string;
  readonly streamBridgeEventType: string;
  readonly streamBridgePlatform: string;
  readonly streamBridgeSourceAdapter: string;
  readonly streamBridgeChannelId: string;
  readonly streamBridgeChannelName: string;
  readonly streamBridgeUserId: string;
  readonly streamBridgeUserName: string;
  readonly streamBridgeUserDisplayName: string;
  readonly streamBridgeUserRoles: string;
  readonly streamBridgePayload: string;
  readonly streamBridgeMetadata: string;
  readonly streamBridgeCorrelationId: string;
  readonly streamBridgeSimulated: boolean;
}

export function buildStreamerBotEventArguments(event: NormalizedEvent): StreamerBotEventArguments {
  return {
    streamBridgeContractVersion: STREAMERBOT_PACKAGE_CONTRACT_VERSION,
    streamBridgeEvent: JSON.stringify(event),
    streamBridgeSchemaVersion: event.schemaVersion,
    streamBridgeEventId: event.eventId,
    streamBridgeEventType: event.eventType,
    streamBridgePlatform: event.platform,
    streamBridgeSourceAdapter: event.source.adapter,
    streamBridgeChannelId: event.channel.id ?? '',
    streamBridgeChannelName: event.channel.name,
    streamBridgeUserId: event.user?.id ?? '',
    streamBridgeUserName: event.user?.name ?? '',
    streamBridgeUserDisplayName: event.user?.displayName ?? event.user?.name ?? '',
    streamBridgeUserRoles: JSON.stringify(event.user?.roles ?? []),
    streamBridgePayload: JSON.stringify(event.payload),
    streamBridgeMetadata: JSON.stringify(event.metadata),
    streamBridgeCorrelationId: event.metadata.correlationId ?? '',
    streamBridgeSimulated: event.metadata.simulated,
  };
}
