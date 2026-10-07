import { describe, expect, it, vi } from 'vitest';
import { DirectSceneEventSync } from '../../bridge/services/direct-scene-event-sync.js';
import type { NormalizedEvent } from '../../schemas/event.js';
const snapshot = (currentScene: string) => ({ connectionId: 'obs', connectionName: 'OBS', scenes: [], currentScene });
describe('direct scene event delivery', () => {
  it('does not run scene actions on startup or unchanged snapshots', async () => {
    const emit = vi.fn(async () => {}), sync = new DirectSceneEventSync(emit, vi.fn());
    sync.observe('obs', snapshot('Ending')); sync.observe('obs', snapshot('Ending'));
    await Promise.resolve(); expect(emit).not.toHaveBeenCalled();
  });
  it('publishes entry and exit in order so break ads are tied to entering BRB', async () => {
    const emit = vi.fn(async (event: NormalizedEvent) => { void event; }), sync = new DirectSceneEventSync(emit, vi.fn());
    sync.observe('obs', snapshot('Gameplay')); sync.observe('obs', snapshot('BRB')); sync.observe('obs', snapshot('Gameplay'));
    await vi.waitFor(() => expect(emit).toHaveBeenCalledTimes(2));
    expect(emit.mock.calls[0]?.[0]).toMatchObject({ eventType: 'stream.scene-changed', payload: { oldSceneName: 'Gameplay', sceneName: 'BRB' } });
    expect(emit.mock.calls[1]?.[0]).toMatchObject({ payload: { oldSceneName: 'BRB', sceneName: 'Gameplay' } });
  });
  it('recovers delivery after a failure and ignores other providers', async () => {
    const warn = vi.fn(), emit = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined), sync = new DirectSceneEventSync(emit, warn);
    sync.observe('meld', snapshot('BRB')); sync.observe('obs', snapshot('Gameplay')); sync.observe('obs', snapshot('BRB')); sync.observe('obs', snapshot('Chatting'));
    await vi.waitFor(() => expect(emit).toHaveBeenCalledTimes(2)); expect(warn).toHaveBeenCalledTimes(1);
  });
});
