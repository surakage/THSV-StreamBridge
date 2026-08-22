import { describe, expect, it } from 'vitest';
import type { NormalizedEvent } from '../../schemas/event.js';
import { MainFeatureCoordinator } from '../../bridge/core/main-feature-coordinator.js';

function event(eventType: string, payload: Record<string, unknown> = {}, platform = 'system', receivedAt = '2026-08-15T12:00:00.000Z'): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: `${eventType}-${platform}-${receivedAt}`, eventType, platform,
    source: { adapter: 'test', eventId: `${eventType}-source`, eventName: eventType }, receivedAt,
    channel: { name: 'system' }, payload, metadata: { simulated: false },
  } as NormalizedEvent;
}

const modules = [
  'thsv.live-beacon', 'thsv.starting-soon-countdown', 'thsv.scene-actions', 'thsv.ad-break-companion',
  'thsv.raid-scout', 'thsv.clip-library-cache', 'thsv.random-clip-player', 'thsv.clip-courier',
  'thsv.first-five', 'thsv.fan-crown', 'thsv.viewer-spotlight', 'thsv.village-roll-call', 'thsv.village-hydration-station',
  'thsv.automated-shoutouts', 'thsv.discord-chat-archive', 'thsv.chat-guard', 'thsv.quote-vault',
  'thsv.follower-pulse', 'thsv.community-analytics', 'thsv.custom-counter', 'thsv.chat-play-pack',
  'thsv.village-fun-commands', 'thsv.voice-relay', 'thsv.user-translate',
].map((moduleId) => ({ moduleId, status: 'healthy', failures: [] }));

describe('MainFeatureCoordinator', () => {
  it('presents one privacy-safe Broadcast Director lifecycle across existing component events', () => {
    const coordinator = new MainFeatureCoordinator();
    coordinator.observe(event('stream.online', {}, 'twitch'));
    coordinator.observe(event('stream.online', {}, 'youtube'));
    coordinator.observe(event('stream.scene-changed', { sceneName: 'Stream Ending' }));
    coordinator.observe(event('addon.thsv.ad-break-companion.started', { adLengthMs: 180_000 }));
    coordinator.observe(event('addon.thsv.raid-scout.control', { action: 'suggest' }));
    coordinator.observe(event('addon.thsv.raid-scout.controller-result', { operation: 'discover', success: true }));
    const snapshot = coordinator.snapshot(modules, {}, Date.parse('2026-08-15T12:00:01.000Z'));
    expect(snapshot).toMatchObject({ contractVersion: '1.0.0' });
    expect(snapshot['catalog']).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'broadcast-director', managementMode: 'bridge-managed-components' })]));
    expect(String(snapshot['privacy'])).toContain('no viewer identity');
    expect(snapshot['broadcastDirector']).toMatchObject({
      status: 'healthy', stage: 'ending', livePlatforms: ['twitch', 'youtube'], currentScene: 'Stream Ending',
      ad: { state: 'active' }, raid: { state: 'selected', operation: 'discover', error: '' },
    });
    coordinator.observe(event('stream.offline', {}, 'twitch'));
    coordinator.observe(event('stream.offline', {}, 'youtube'));
    expect(coordinator.snapshot(modules, {})['broadcastDirector']).toMatchObject({ stage: 'offline', livePlatforms: [], ad: { state: 'idle' }, raid: { state: 'complete' } });
  });

  it('presents one Clip Engine inventory and retains a bounded operational failure only', () => {
    const coordinator = new MainFeatureCoordinator();
    coordinator.observe(event('addon.thsv.clip-library-cache.snapshot', { clips: Array.from({ length: 40 }, (_, id) => ({ id })) }));
    coordinator.observe(event('addon.thsv.random-clip-player.clip-download-received', { clipId: 'one', landscapeUrl: 'https://clips.twitch.tv/one.mp4' }));
    coordinator.observe(event('addon.thsv.raid-scout.controller-result', { operation: 'clip-download', success: false, controllerError: 'No playable URL.' }));
    expect(coordinator.snapshot(modules, { mediaSlot: { ownerModuleId: 'thsv.raid-scout' } })['clipEngine']).toMatchObject({
      status: 'healthy', librarySize: 40, randomClipResponses: 1, lastError: 'No playable URL.',
      media: { ownerModuleId: 'thsv.raid-scout' },
    });
    expect(JSON.stringify(coordinator.snapshot(modules, {}))).not.toContain('clipId');
  });

  it('ignores simulated lifecycle previews and reports missing optional components without failing installed ones', () => {
    const coordinator = new MainFeatureCoordinator();
    coordinator.observe({ ...event('stream.online', {}, 'twitch'), metadata: { simulated: true } });
    const snapshot = coordinator.snapshot([{ moduleId: 'thsv.random-clip-player', status: 'healthy', failures: [] }], {});
    expect(snapshot['broadcastDirector']).toMatchObject({ status: 'not-installed', stage: 'offline' });
    expect(snapshot['clipEngine']).toMatchObject({ status: 'healthy' });
  });

  it('combines Community Rewards activity without retaining redemption or viewer data', () => {
    const coordinator = new MainFeatureCoordinator();
    coordinator.observe(event('stream.online', {}, 'twitch'));
    coordinator.observe(event('reward.redemption', { rewardId: 'private-reward', rewardTitle: 'Hydration', userInput: 'secret text' }, 'twitch'));
    coordinator.observe(event('addon.thsv.first-five.controller-result', { operation: 'claim', success: true, userName: 'ViewerName' }));
    coordinator.observe(event('addon.thsv.fan-crown.controller-result', { operation: 'claim', success: false, error: 'provider rejected' }));
    const snapshot = coordinator.snapshot(modules, { modules: { 'thsv.first-five': { failed: 2 } } });
    expect(snapshot['communityRewards']).toMatchObject({ status: 'healthy', redemptions: 1, operations: 2, failures: 1, lastComponent: 'thsv.fan-crown', capabilityFailures: 2 });
    const serialized = JSON.stringify(snapshot['communityRewards']);
    expect(serialized).not.toContain('private-reward');
    expect(serialized).not.toContain('ViewerName');
    expect(serialized).not.toContain('secret text');
  });

  it('combines Community Messaging throughput and delivery health without retaining chat text', () => {
    const coordinator = new MainFeatureCoordinator();
    coordinator.observe(event('stream.online', {}, 'youtube'));
    coordinator.observe(event('chat.message', { message: 'private chat contents' }, 'youtube'));
    coordinator.observe(event('addon.thsv.automated-shoutouts.twitch-profile-received', { displayName: 'PrivateCreator' }));
    coordinator.observe(event('addon.thsv.discord-chat-archive.delivery-received', { succeeded: false, error: 'webhook secret' }));
    coordinator.observe(event('addon.thsv.chat-guard.moderation-result', { success: true, userId: 'private-user-id' }));
    const snapshot = coordinator.snapshot(modules, { outboundRequests: { 'thsv.discord-chat-archive': { pending: 1 } }, modules: { 'thsv.chat-guard': { failed: 3 } } });
    expect(snapshot['communityMessaging']).toMatchObject({ status: 'healthy', messagesObserved: 1, platforms: { youtube: { messages: 1, lastActivityAt: '2026-08-15T12:00:00.000Z' } }, operations: 3, failures: 1, outboundPending: 1, capabilityFailures: 3, lastComponent: 'thsv.chat-guard' });
    const serialized = JSON.stringify(snapshot['communityMessaging']);
    expect(serialized).not.toContain('private chat contents');
    expect(serialized).not.toContain('PrivateCreator');
    expect(serialized).not.toContain('webhook secret');
    expect(serialized).not.toContain('private-user-id');
  });

  it('surfaces missing lifecycle triggers and accepts a read-only current-scene snapshot', () => {
    const coordinator = new MainFeatureCoordinator();
    coordinator.observe(event('system.scene-catalog', { provider: 'obs', currentScene: 'BRB' }, 'system', '2026-08-15T12:00:00.000Z'));
    coordinator.observe(event('chat.message', { message: 'not retained' }, 'tiktok', '2026-08-15T12:00:01.000Z'));
    coordinator.observe(event('addon.thsv.ad-break-companion.upcoming', {}, 'system', '2026-08-15T12:00:02.000Z'));
    const snapshot = coordinator.snapshot(modules, {}, Date.parse('2026-08-15T12:00:03.000Z'));
    expect(snapshot['broadcastDirector']).toMatchObject({
      currentScene: 'BRB',
      scene: { name: 'BRB', provider: 'obs', source: 'snapshot' },
      lifecycle: { status: 'missing-live-signal', firstUnmatchedActivityAt: '2026-08-15T12:00:01.000Z', lastUnmatchedActivityAt: '2026-08-15T12:00:02.000Z' },
      ad: { upcomingEvents: 1, startedEvents: 0 },
    });
    expect(JSON.stringify(snapshot)).not.toContain('not retained');
    coordinator.observe(event('stream.online', {}, 'twitch', '2026-08-15T12:00:04.000Z'));
    expect(coordinator.snapshot(modules, {}, Date.parse('2026-08-15T12:00:05.000Z'))['broadcastDirector']).toMatchObject({ lifecycle: { status: 'live' }, livePlatforms: ['twitch'] });
  });

  it('starts fresh Community Rewards and Messaging session counters on the next live cycle', () => {
    const coordinator = new MainFeatureCoordinator();
    coordinator.observe(event('stream.online', {}, 'twitch'));
    coordinator.observe(event('reward.redemption', {}, 'twitch'));
    coordinator.observe(event('chat.message', {}, 'twitch'));
    coordinator.observe(event('stream.offline', {}, 'twitch'));
    expect(coordinator.snapshot(modules, {})['communityMessaging']).toMatchObject({ messagesObserved: 1 });
    coordinator.observe(event('stream.online', {}, 'youtube', '2026-08-15T13:00:00.000Z'));
    expect(coordinator.snapshot(modules, {})['communityRewards']).toMatchObject({ redemptions: 0, operations: 0, failures: 0 });
    expect(coordinator.snapshot(modules, {})['communityMessaging']).toMatchObject({ messagesObserved: 0, operations: 0, failures: 0 });
  });

  it('combines promoted insights, play, and voice components without retaining payload data', () => {
    const coordinator = new MainFeatureCoordinator();
    coordinator.observe(event('stream.online', {}, 'twitch'));
    coordinator.observe(event('addon.thsv.follower-pulse.snapshot-page', { userName: 'PrivateFollower', success: true }));
    coordinator.observe(event('addon.thsv.community-analytics.control', { viewerId: 'private-viewer', success: false }));
    coordinator.observe(event('addon.thsv.custom-counter.control', { counterName: 'Deaths', success: true }));
    coordinator.observe(event('addon.thsv.chat-play-pack.trivia-received', { answer: 'secret', succeeded: false }));
    coordinator.observe(event('addon.thsv.voice-relay.control', { spokenText: 'private speech', success: true }));
    coordinator.observe(event('addon.thsv.user-translate.translation-received', { translatedText: 'private translation', success: true }));
    const snapshot = coordinator.snapshot(modules, {
      outboundRequests: { 'thsv.voice-relay': { pending: 1 } },
      modules: { 'thsv.community-analytics': { failed: 2 } },
    });
    expect(snapshot['communityInsights']).toMatchObject({ status: 'healthy', operations: 2, failures: 1, capabilityFailures: 2 });
    expect(snapshot['communityPlay']).toMatchObject({ status: 'healthy', operations: 2, failures: 1 });
    expect(snapshot['voiceLanguage']).toMatchObject({ status: 'healthy', operations: 2, failures: 0, outboundPending: 1 });
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain('PrivateFollower');
    expect(serialized).not.toContain('private-viewer');
    expect(serialized).not.toContain('private speech');
    expect(serialized).not.toContain('private translation');
  });
});
