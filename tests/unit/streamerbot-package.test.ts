import { describe, expect, it } from 'vitest';
import { buildStreamerBotEventArguments, STREAMERBOT_PACKAGE_CONTRACT_VERSION } from '../../bridge/adapters/streamerbot-package.js';
import { fixture } from '../helpers.js';

describe('Streamer.bot package contract', () => {
  it('maps a normalized event to stable portable action arguments', async () => {
    const event = await fixture();
    const args = buildStreamerBotEventArguments(event);

    expect(args).toMatchObject({
      streamBridgeContractVersion: STREAMERBOT_PACKAGE_CONTRACT_VERSION,
      streamBridgeSchemaVersion: '1.0.0',
      streamBridgeEventId: event.eventId,
      streamBridgeEventType: event.eventType,
      streamBridgePlatform: event.platform,
      streamBridgeSourceAdapter: event.source.adapter,
      streamBridgeChannelName: event.channel.name,
      streamBridgeUserName: event.user?.name,
      streamBridgeSimulated: true,
    });
    expect(JSON.parse(args.streamBridgeEvent)).toEqual(event);
    expect(JSON.parse(args.streamBridgeUserRoles)).toEqual(event.user?.roles);
    expect(JSON.parse(args.streamBridgePayload)).toEqual(event.payload);
    expect(JSON.parse(args.streamBridgeMetadata)).toEqual(event.metadata);
  });

  it('uses empty portable values when optional identities are absent', async () => {
    const event = { ...(await fixture()), user: undefined, channel: { name: 'Channel' }, metadata: { simulated: false } };
    const args = buildStreamerBotEventArguments(event);

    expect(args.streamBridgeChannelId).toBe('');
    expect(args.streamBridgeUserId).toBe('');
    expect(args.streamBridgeUserName).toBe('');
    expect(args.streamBridgeUserDisplayName).toBe('');
    expect(args.streamBridgeCorrelationId).toBe('');
    expect(args.streamBridgeUserRoles).toBe('[]');
  });
});
