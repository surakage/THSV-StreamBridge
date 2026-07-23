import { describe, expect, it } from 'vitest';
import { normalizeStreamerBotSceneRelay } from '../../bridge/adapters/streamerbot-scene-relay-adapter.js';

function relay(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: 'thsv.scene', version: '1.0.0', provider: 'obs', sourceEventType: 'ObsSceneChanged', relayId: 'scene-1', receivedAt: '2026-07-22T12:00:00.000Z', simulated: false, connectionId: 'obs-main', connectionName: 'OBS', sceneName: 'Starting Soon', oldSceneName: 'Gameplay', ...overrides };
}

describe('Streamer.bot scene relay adapter', () => {
  it('normalizes documented OBS scene arguments without retaining a raw payload', () => {
    expect(normalizeStreamerBotSceneRelay(relay())).toEqual({
      schemaVersion: '1.0.0', eventId: 'streamerbot-scene-obs-scene-1', eventType: 'stream.scene-changed', platform: 'system',
      source: { adapter: 'streamerbot-scene-relay', eventId: 'scene-1', eventName: 'ObsSceneChanged' }, receivedAt: '2026-07-22T12:00:00.000Z',
      channel: { id: 'obs-main', name: 'OBS' }, payload: { provider: 'obs', sceneName: 'Starting Soon', oldSceneName: 'Gameplay', connectionId: 'obs-main', connectionName: 'OBS' }, metadata: { simulated: false },
    });
  });

  it('supports Streamlabs and Meld while omitting unavailable optional fields', () => {
    expect(normalizeStreamerBotSceneRelay(relay({ provider: 'streamlabs', connectionId: '', connectionName: '', sceneName: 'BRB', oldSceneName: '' }))).toMatchObject({ channel: { name: 'streamlabs' }, payload: { provider: 'streamlabs', sceneName: 'BRB' } });
    expect(normalizeStreamerBotSceneRelay(relay({ provider: 'meld', sceneName: 'Ending Soon' }))).toMatchObject({ payload: { provider: 'meld', sceneName: 'Ending Soon' } });
  });

  it('rejects unknown providers, blank scene names, extra keys, and malformed envelopes', () => {
    expect(() => normalizeStreamerBotSceneRelay(relay({ provider: 'xsplit' }))).toThrow();
    expect(() => normalizeStreamerBotSceneRelay(relay({ sceneName: '  ' }))).toThrow('non-empty scene name');
    expect(() => normalizeStreamerBotSceneRelay(relay({ secret: 'no' }))).toThrow();
    expect(() => normalizeStreamerBotSceneRelay({ type: 'thsv.scene' })).toThrow();
  });

  it('hashes an oversized composed event identity', () => {
    expect(normalizeStreamerBotSceneRelay(relay({ relayId: 'x'.repeat(256) })).eventId).toMatch(/^streamerbot-scene-obs-sha256-[a-f0-9]{64}$/u);
  });
});
