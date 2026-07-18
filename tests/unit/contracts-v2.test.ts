import { describe, expect, it } from 'vitest';
import {
  CORE_CONTRACT_VERSION,
  PLATFORM_CAPABILITY_IDS,
  browserOverlayEventV2Schema,
  moduleManifestV2Schema,
  normalizedEventV2Schema,
  platformCapabilityReportSchema,
  rewardRedemptionV2Schema,
} from '../../bridge/contracts/v2/index.js';

const baseEvent = {
  schemaVersion: CORE_CONTRACT_VERSION,
  eventId: 'event-1',
  eventType: 'chat.message',
  platform: 'twitch',
  source: { adapterId: 'core.twitch-streamerbot', eventId: 'source-1', eventName: 'ChatMessage' },
  receivedAt: '2026-07-17T20:00:00.000Z',
  channel: { id: 'channel-1', name: 'Channel' },
  actor: { id: 'user-1', name: 'viewer', displayName: 'Viewer', actorType: 'human', roles: [], badges: [] },
  payload: { message: 'Hello' },
  metadata: { simulated: false, unverifiedFields: [] },
};

describe('v2 preview contracts', () => {
  it('accepts a core event without viewer profiles and rejects excluded core event types', () => {
    expect(normalizedEventV2Schema.safeParse(baseEvent).success).toBe(true);
    expect(normalizedEventV2Schema.safeParse({ ...baseEvent, eventType: 'viewer.progression' }).success).toBe(false);
    expect(normalizedEventV2Schema.safeParse({ ...baseEvent, eventType: 'companion.action' }).success).toBe(false);
    expect(normalizedEventV2Schema.safeParse({ ...baseEvent, metadata: { ...baseEvent.metadata, viewerId: 'legacy-viewer' } }).success).toBe(false);
  });

  it('requires stable source identities for alerts and reward redemptions', () => {
    const source = { adapterId: 'core.twitch-streamerbot', eventName: 'RewardRedemption' };
    expect(normalizedEventV2Schema.safeParse({ ...baseEvent, eventType: 'reward.redemption', source }).success).toBe(false);
  });

  it('reports every capability with explicit verification and unavailable reasons', () => {
    const capabilities = Object.fromEntries(PLATFORM_CAPABILITY_IDS.map((id) => [id, id === 'chat.input'
      ? { supported: true, verification: 'verified' }
      : { supported: false, verification: 'unsupported', reason: 'Not provided by this adapter.' }]));
    const report = { contractVersion: CORE_CONTRACT_VERSION, platform: 'youtube', adapterId: 'core.youtube-streamerbot', reportedAt: '2026-07-17T20:00:00.000Z', capabilities, limitations: [] };
    expect(platformCapabilityReportSchema.safeParse(report).success).toBe(true);
    expect(platformCapabilityReportSchema.safeParse({ ...report, capabilities: { ...capabilities, commands: { supported: false, verification: 'unsupported' } } }).success).toBe(false);
  });

  it('defines a complete add-on manifest and rejects self-dependencies', () => {
    const manifest = {
      contractVersion: CORE_CONTRACT_VERSION,
      moduleId: 'addon.example',
      name: 'Example Add-on',
      version: '1.0.0',
      minimumCoreVersion: '2.0.0-preview.1',
      maximumTestedCoreVersion: '2.0.0-preview.1',
      dependencies: [], requiredCapabilities: ['chat.input'], configurationSchema: 'schemas/example.json',
      eventSubscriptions: ['chat.message'], commandsProvided: [], actionsProvided: [], browserSourcesProvided: [], dataStorageOwned: [],
      installationSteps: ['Verify the package signature.'], uninstallationSteps: ['Disable the module.'], migrations: [],
      healthChecks: [{ id: 'addon.example.ready', description: 'Confirms the no-op add-on loaded.' }],
    };
    expect(moduleManifestV2Schema.safeParse(manifest).success).toBe(true);
    expect(moduleManifestV2Schema.safeParse({ ...manifest, dependencies: ['addon.example'] }).success).toBe(false);
  });

  it('keeps browser-overlay v2 free of companion event branches', () => {
    const chat = {
      contractVersion: CORE_CONTRACT_VERSION, eventId: 'event-1', receivedAt: '2026-07-17T20:00:00.000Z', sequence: 1,
      visibility: 'public', platform: 'twitch', channel: baseEvent.channel, actor: baseEvent.actor, message: 'Hello', deleted: false, simulated: false,
    };
    expect(browserOverlayEventV2Schema.safeParse({ contractVersion: CORE_CONTRACT_VERSION, kind: 'chat.add', emittedAt: '2026-07-17T20:00:00.000Z', payload: chat }).success).toBe(true);
    expect(browserOverlayEventV2Schema.safeParse({ contractVersion: CORE_CONTRACT_VERSION, kind: 'companion.action', emittedAt: '2026-07-17T20:00:00.000Z', payload: {} }).success).toBe(false);
  });

  it('requires a bounded display contract for browser alert events', () => {
    const alert = {
      contractVersion: CORE_CONTRACT_VERSION, eventId: 'alert-1', receivedAt: '2026-07-17T20:00:00.000Z', sequence: 2,
      platform: 'youtube', channel: baseEvent.channel, actor: baseEvent.actor, alertType: 'super-chat', amount: '5.00', currency: 'USD',
      priority: 'critical', simulated: true, verifiedTransport: false, unverifiedFields: [],
      display: { title: 'Viewer supported with 5.00 USD', detail: 'Test alert', durationMs: 7_000, sound: { mode: 'chime', volume: 0.3 } },
    };
    const event = { contractVersion: CORE_CONTRACT_VERSION, kind: 'alert.show', emittedAt: '2026-07-17T20:00:00.000Z', payload: alert };
    expect(browserOverlayEventV2Schema.safeParse(event).success).toBe(true);
    expect(browserOverlayEventV2Schema.safeParse({ ...event, payload: { ...alert, display: { ...alert.display, durationMs: 0 } } }).success).toBe(false);
  });

  it('keeps Twitch and Kick reward operations explicit per redemption', () => {
    const redemption = {
      contractVersion: CORE_CONTRACT_VERSION, eventId: 'reward-1', sourceEventId: 'source-reward-1', receivedAt: '2026-07-17T20:00:00.000Z',
      platform: 'kick', channel: baseEvent.channel, actor: baseEvent.actor,
      reward: { id: 'reward-id', title: 'Hydrate', cost: 100, requiresUserInput: false }, redemptionId: 'redemption-id',
      supportedOperations: [], simulated: false, verifiedTransport: true,
    };
    expect(rewardRedemptionV2Schema.safeParse(redemption).success).toBe(true);
    expect(rewardRedemptionV2Schema.safeParse({ ...redemption, supportedOperations: ['create'] }).success).toBe(false);
  });
});
