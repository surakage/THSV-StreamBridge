import { describe, expect, it, vi } from 'vitest';
import { isNestingSceneName, NestingSceneFilter, nestingScenesFrom } from '../../bridge/core/nesting-scene-filter.js';
import { DirectSceneHardwareSync } from '../../bridge/services/direct-scene-hardware-sync.js';
import { normalizeStreamerBotSceneRelay } from '../../bridge/adapters/streamerbot-scene-relay-adapter.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import { sceneRolesSchema } from '../../schemas/config.js';
import { createTestBridge, testConfig } from '../helpers.js';

function sceneEvent(sceneName: string, oldSceneName: string, simulated = false): NormalizedEvent {
  return { schemaVersion: '1.0.0', eventId: `obs-scene-${String(Math.random())}`, eventType: 'stream.scene-changed', platform: 'system', receivedAt: new Date().toISOString(), source: { adapter: 'obs-scene-monitor', eventName: 'CurrentProgramSceneChanged' }, channel: { name: 'OBS' }, payload: { provider: 'obs', sceneName, oldSceneName, connectionId: 'obs-main', connectionName: 'OBS' }, metadata: { simulated } };
}
function catalogEvent(currentScene: string): NormalizedEvent {
  return { ...sceneEvent('', ''), eventType: 'system.scene-catalog', payload: { provider: 'obs', connectionIndex: 0, scenes: ['🔴 Gameplay', '🟠 Gameplay'], complete: true, currentScene } };
}

describe('nesting scenes', () => {
  it('matches scene names by prefix, ignoring case and surrounding spaces', () => {
    expect(isNestingSceneName(' 🟠 Gameplay', { prefixes: ['🟠'] })).toBe(true);
    expect(isNestingSceneName('🔴 Gameplay', { prefixes: ['🟠'] })).toBe(false);
    expect(isNestingSceneName('src - Camera', { prefixes: ['SRC'] })).toBe(true);
    expect(isNestingSceneName('🟠 Gameplay', { prefixes: [] })).toBe(false);
    expect(isNestingSceneName('', { prefixes: ['🟠'] })).toBe(false);
  });

  it('matches the nested scene picked for each role by exact name', () => {
    const nesting = nestingScenesFrom({ nestedScenes: { starting: '', live: '🟠 Gameplay', chatting: '', break: '🟠 Be Right Back', ending: '' }, nestingScenePrefixes: [] });
    expect(isNestingSceneName(' 🟠 gameplay ', nesting)).toBe(true);
    expect(isNestingSceneName('🟠 Be Right Back', nesting)).toBe(true);
    expect(isNestingSceneName('🟠 Gameplay Camera', nesting)).toBe(false);
    expect(isNestingSceneName('🔴 Gameplay', nesting)).toBe(false);
    const filter = new NestingSceneFilter(() => nesting);
    expect(filter.apply(sceneEvent('🔴 Gameplay', '🔴 Starting Soon')).kind).toBe('pass');
    expect(filter.apply(sceneEvent('🟠 Gameplay', '🔴 Gameplay')).kind).toBe('ignore');
    expect(filter.apply(sceneEvent('🔴 Gameplay', '🟠 Gameplay')).kind).toBe('ignore');
  });

  it('defaults to no nesting prefixes and keeps saved ones', () => {
    expect(sceneRolesSchema.parse({}).nestingScenePrefixes).toEqual([]);
    expect(sceneRolesSchema.parse({}).nestedScenes).toEqual({ starting: '', live: '', chatting: '', break: '', ending: '' });
    expect(sceneRolesSchema.parse({ nestedScenes: { live: '🟠 Gameplay' } }).nestedScenes.live).toBe('🟠 Gameplay');
    expect(sceneRolesSchema.parse({ nestingScenePrefixes: ['🟠'] }).nestingScenePrefixes).toEqual(['🟠']);
  });

  it('passes everything through when no prefix is set', () => {
    const filter = new NestingSceneFilter(() => ({}));
    const event = sceneEvent('🟠 Gameplay', '🔴 Gameplay');
    expect(filter.apply(event)).toEqual({ kind: 'pass', event });
  });

  it('ignores a nesting scene and the return to the same scene, and reports the real previous scene on the next switch', () => {
    const filter = new NestingSceneFilter(() => ({ prefixes: ['🟠'] }));
    expect(filter.apply(sceneEvent('🔴 Gameplay', '🔴 Starting Soon')).kind).toBe('pass');
    expect(filter.apply(sceneEvent('🟠 Starting Soon', '🔴 Gameplay'))).toEqual({ kind: 'ignore', reason: 'nesting-scene' });
    expect(filter.apply(sceneEvent('🟠 Gameplay', '🟠 Starting Soon'))).toEqual({ kind: 'ignore', reason: 'nesting-scene' });
    expect(filter.apply(sceneEvent('🔴 Gameplay', '🟠 Gameplay'))).toEqual({ kind: 'ignore', reason: 'returned-to-same-scene' });
    expect(filter.apply(sceneEvent('🟠 Be Right Back', '🔴 Gameplay')).kind).toBe('ignore');
    const next = filter.apply(sceneEvent('🔴 Be Right Back', '🟠 Be Right Back'));
    expect(next.kind).toBe('pass');
    expect(next.kind === 'pass' ? next.event.payload['oldSceneName'] : undefined).toBe('🔴 Gameplay');
  });

  it('still notices leaving a nesting scene when the switch into it was never reported', () => {
    const filter = new NestingSceneFilter(() => ({ prefixes: ['🟠'] }));
    expect(filter.apply(sceneEvent('🔴 Gameplay', '🔴 Starting Soon')).kind).toBe('pass');
    expect(filter.apply(sceneEvent('🔴 Gameplay', '🟠 Gameplay')).kind).toBe('ignore');
  });

  it('never filters simulated scene changes', () => {
    const filter = new NestingSceneFilter(() => ({ prefixes: ['🟠'] }));
    expect(filter.apply(sceneEvent('🟠 Gameplay', '🔴 Gameplay', true)).kind).toBe('pass');
  });

  it('reports the last real scene as current in scene snapshots while a nesting scene is live', () => {
    const filter = new NestingSceneFilter(() => ({ prefixes: ['🟠'] }));
    const first = filter.apply(catalogEvent('🟠 Gameplay'));
    expect(first.kind === 'pass' ? first.event.payload : undefined).not.toHaveProperty('currentScene');
    expect(filter.apply(catalogEvent('🔴 Gameplay')).kind).toBe('pass');
    const later = filter.apply(catalogEvent('🟠 Gameplay'));
    expect(later.kind === 'pass' ? later.event.payload : undefined).toMatchObject({ currentScene: '🔴 Gameplay', scenes: ['🔴 Gameplay', '🟠 Gameplay'] });
  });

  it('keeps nesting scene switches away from add-ons and timers in the bridge', async () => {
    const config = await testConfig(); config.sceneRoles.nestingScenePrefixes = ['🟠'];
    const bridge = createTestBridge(config); await bridge.start();
    const seen: string[] = []; bridge.subscribe((event) => { if (event.eventType === 'stream.scene-changed') seen.push(typeof event.payload['sceneName'] === 'string' ? event.payload['sceneName'] : ''); });
    await expect(bridge.ingest(sceneEvent('🔴 Gameplay', '🔴 Starting Soon'))).resolves.toMatchObject({ duplicate: false });
    await expect(bridge.ingest(sceneEvent('🟠 Starting Soon', '🔴 Gameplay'))).resolves.toMatchObject({ duplicate: true, deliveryStatus: 'duplicate-ignored' });
    await expect(bridge.ingest(normalizeStreamerBotSceneRelay({ type: 'thsv.scene', version: '1.0.0', provider: 'obs', sourceEventType: 'ObsSceneChanged', relayId: 'relay-1', receivedAt: new Date().toISOString(), simulated: false, sceneName: '🔴 Gameplay' }))).resolves.toMatchObject({ duplicate: true });
    await expect(bridge.ingest(sceneEvent('🔴 Be Right Back', '🔴 Gameplay'))).resolves.toMatchObject({ duplicate: false });
    expect(seen).toEqual(['🔴 Gameplay', '🔴 Be Right Back']);
    await bridge.stop();
  });

  it('leaves the lights on the last real scene while a nesting scene is live', async () => {
    const run = vi.fn(async () => {});
    const sync = new DirectSceneHardwareSync('3a8b1ff6-bc5d-409d-b670-f6217d4d1550', run, vi.fn(), (scene) => isNestingSceneName(scene, { prefixes: ['🟠'] }));
    const snapshot = (currentScene: string) => ({ connectionId: 'obs-main', connectionName: 'OBS', scenes: [], currentScene });
    sync.observe('obs', snapshot('🔴 Gameplay')); sync.observe('obs', snapshot('🟠 Gameplay')); sync.observe('obs', snapshot('🔴 Gameplay'));
    await Promise.resolve();
    expect(run).not.toHaveBeenCalled();
    sync.observe('obs', snapshot('🔴 Be Right Back'));
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  });
});
