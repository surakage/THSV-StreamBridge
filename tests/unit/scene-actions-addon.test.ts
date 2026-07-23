import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- verified executable add-on exports are intentionally loaded from plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import sceneActions, { parseSceneMappings, sceneMappingMatches } from '../../addons/scene-actions/dist/index.js';

const actionId = '68fa3646-8b6c-4ef0-bf96-19474de8b620';
const encoded = JSON.stringify({ id: 'starting-soon', enabled: true, provider: 'obs', connectionName: '', sceneName: 'Starting Soon', actionId, delaySeconds: 0 });

describe('Scene Actions add-on', () => {
  it('parses bounded mappings and skips malformed or duplicate entries', () => {
    expect(parseSceneMappings([encoded, encoded, 'not-json', JSON.stringify({ id: 'bad', provider: 'obs' })])).toEqual([{ id: 'starting-soon', enabled: true, provider: 'obs', connectionName: '', sceneName: 'Starting Soon', actionId, delaySeconds: 0 }]);
  });

  it('matches provider, optional connection, and scene case policy', () => {
    const mapping = parseSceneMappings([encoded])[0];
    expect(sceneMappingMatches(mapping, { provider: 'obs', connectionName: 'Main', sceneName: 'starting soon' }, { enabledProviders: ['obs'], caseSensitive: false })).toBe(true);
    expect(sceneMappingMatches({ ...mapping, connectionName: 'Second' }, { provider: 'obs', connectionName: 'Main', sceneName: 'Starting Soon' }, { enabledProviders: ['obs'], caseSensitive: false })).toBe(false);
  });

  it('dispatches once by approved stable ID and suppresses an immediate duplicate', async () => {
    let state: Record<string, unknown> = {};
    const runApprovedAction = vi.fn(async () => {});
    const context = { settings: { enabled: true, enabledProviders: ['obs'], mappings: [encoded], caseSensitive: false, duplicateWindowMs: 1500, loopWindowSeconds: 10, maximumRunsPerLoopWindow: 5, runOnSimulatedEvents: false }, state: { read: vi.fn(async () => state), write: vi.fn(async (value) => { state = value; }) }, streamerbot: { runApprovedAction }, schedule: { after: vi.fn() } };
    const event = { eventType: 'stream.scene-changed', payload: { provider: 'obs', sceneName: 'Starting Soon', connectionId: 'main' }, metadata: { simulated: false } };
    await sceneActions.onEvent(event, context); await sceneActions.onEvent(event, context);
    expect(runApprovedAction).toHaveBeenCalledTimes(1);
    expect(runApprovedAction).toHaveBeenCalledWith(actionId, expect.objectContaining({ sceneProvider: 'obs', sceneName: 'Starting Soon', sceneActionMappingId: 'starting-soon' }));
  });

  it('skips simulated trigger tests by default', async () => {
    const runApprovedAction = vi.fn(async () => {});
    const context = { settings: { enabled: true, enabledProviders: ['obs'], mappings: [encoded], runOnSimulatedEvents: false }, state: { read: vi.fn(async () => ({})), write: vi.fn() }, streamerbot: { runApprovedAction }, schedule: { after: vi.fn() } };
    await sceneActions.onEvent({ eventType: 'stream.scene-changed', payload: { provider: 'obs', sceneName: 'Starting Soon' }, metadata: { simulated: true } }, context);
    expect(runApprovedAction).not.toHaveBeenCalled();
  });

  it('cancels a delayed scene action when that connection changes scene again', async () => {
    let state: Record<string, unknown> = {};
    const delayed = JSON.stringify({ ...JSON.parse(encoded), delaySeconds: 5 });
    const cancel = vi.fn(() => true);
    const context = { settings: { enabled: true, enabledProviders: ['obs'], mappings: [delayed], runOnSimulatedEvents: false }, state: { read: vi.fn(async () => state), write: vi.fn(async (value) => { state = value; }) }, streamerbot: { runApprovedAction: vi.fn(async () => {}) }, schedule: { after: vi.fn(() => 'task-1'), cancel } };
    await sceneActions.onEvent({ eventType: 'stream.scene-changed', payload: { provider: 'obs', sceneName: 'Starting Soon', connectionId: 'main' }, metadata: { simulated: false } }, context);
    await sceneActions.onEvent({ eventType: 'stream.scene-changed', payload: { provider: 'obs', sceneName: 'Gameplay', connectionId: 'main' }, metadata: { simulated: false } }, context);
    expect(cancel).toHaveBeenCalledWith('task-1');
    await sceneActions.stop(context);
  });
});
