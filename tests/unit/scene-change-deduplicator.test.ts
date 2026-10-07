import { describe, expect, it } from 'vitest';
import { SceneChangeDeduplicator } from '../../bridge/core/scene-change-deduplicator.js';
import { normalizeStreamerBotSceneRelay } from '../../bridge/adapters/streamerbot-scene-relay-adapter.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import { createTestBridge, testConfig } from '../helpers.js';

function directObsEvent(sceneName: string, oldSceneName: string, simulated = false): NormalizedEvent {
  return { schemaVersion: '1.0.0', eventId: `obs-scene-${sceneName}-${String(Math.random())}`, eventType: 'stream.scene-changed', platform: 'system', receivedAt: new Date().toISOString(), source: { adapter: 'obs-scene-monitor', eventName: 'CurrentProgramSceneChanged' }, channel: { name: 'OBS' }, payload: { provider: 'obs', sceneName, oldSceneName, connectionId: '00000000-0000-4000-8000-000000000001', connectionName: 'OBS default' }, metadata: { simulated } };
}
function streamerBotObsEvent(sceneName: string, relayId: string): NormalizedEvent {
  return normalizeStreamerBotSceneRelay({ type: 'thsv.scene', version: '1.0.0', provider: 'obs', sourceEventType: 'ObsSceneChanged', relayId, receivedAt: new Date().toISOString(), simulated: false, connectionId: 'sb-obs-connection', connectionName: 'Main OBS', sceneName, oldSceneName: 'Starting Soon' });
}

describe('SceneChangeDeduplicator', () => {
  it('treats the same provider scene switch from a second source as a duplicate within the window only', () => {
    let now = 1_000; const deduplicator = new SceneChangeDeduplicator(5_000, { now: () => now });
    expect(deduplicator.isDuplicate(streamerBotObsEvent('Live', 'relay-1'))).toBe(false);
    now += 300; expect(deduplicator.isDuplicate(directObsEvent('live', 'Starting Soon'))).toBe(true);
    now += 5_000; expect(deduplicator.isDuplicate(directObsEvent('Live', 'Starting Soon'))).toBe(false);
  });

  it('never drops a real quick switch back to an earlier scene, simulated events, or other event types', () => {
    let now = 0; const deduplicator = new SceneChangeDeduplicator(5_000, { now: () => now });
    expect(deduplicator.isDuplicate(directObsEvent('Live', 'BRB'))).toBe(false);
    now += 100; expect(deduplicator.isDuplicate(directObsEvent('BRB', 'Live'))).toBe(false);
    now += 100; expect(deduplicator.isDuplicate(directObsEvent('Live', 'BRB'))).toBe(false);
    expect(deduplicator.isDuplicate(directObsEvent('Live', 'BRB', true))).toBe(false);
    expect(deduplicator.isDuplicate({ ...directObsEvent('Live', 'BRB'), eventType: 'system.scene-catalog' })).toBe(false);
  });

  it('delivers one scene switch to add-ons when both Streamer.bot and the OBS watcher report it', async () => {
    const bridge = createTestBridge(await testConfig()); await bridge.start();
    const seen: string[] = []; bridge.subscribe((event) => { if (event.eventType === 'stream.scene-changed') seen.push(event.eventId); });
    await expect(bridge.ingest(streamerBotObsEvent('Live', 'relay-a'))).resolves.toMatchObject({ duplicate: false });
    await expect(bridge.ingest(directObsEvent('Live', 'Starting Soon'))).resolves.toMatchObject({ duplicate: true, deliveryStatus: 'duplicate-ignored' });
    await expect(bridge.ingest(directObsEvent('BRB', 'Live'))).resolves.toMatchObject({ duplicate: false });
    await expect(bridge.ingest(streamerBotObsEvent('BRB', 'relay-b'))).resolves.toMatchObject({ duplicate: true });
    expect(seen).toHaveLength(2);
    await bridge.stop();
  });
});
