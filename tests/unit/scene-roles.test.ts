import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons are intentionally plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import guard, { CONTROLLER_ACTION_ID, createSessionState, evaluate, sanitizeState } from '../../addons/stream-session-guard/dist/index.js';
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import sceneActions from '../../addons/scene-actions/dist/index.js';
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import { sceneKey } from '../../addons/raid-scout/dist/index.js';
import { AddOnCapabilityBroker } from '../../bridge/core/addon-capability-broker.js';
import { createSceneRoles, sceneMatchKey, sceneNamesMatch, sceneRoleToken, type SceneRoleMap } from '../../bridge/core/scene-roles.js';
import { inspectSceneConfiguration } from '../../bridge/services/wizard-service.js';
import type { WizardAddOnSummary } from '../../bridge/services/addon-wizard-service.js';
import { bridgeConfigSchema } from '../../schemas/config.js';
import { silentLogger, testConfig } from '../helpers.js';

const ROLES: SceneRoleMap = { starting: '📁 Starting Soon', live: 'Just Chatting', break: '🔴 Be Right Back', ending: 'Stream Ending' };

describe('scene roles', () => {
  it('maps roles to scenes and scenes back to roles, ignoring case and spaces, and emoji only when the saved name has none', () => {
    const scenes = createSceneRoles(() => ROLES);
    expect(scenes.sceneFor('break')).toBe('🔴 Be Right Back');
    expect(scenes.roleOf('🔴 Be Right Back')).toBe('break');
    expect(scenes.roleOf('  🔴 be right back ')).toBe('break');
    expect(scenes.roleOf('be right back')).toBeUndefined();
    expect(scenes.roleOf('🟠 Stream Ending')).toBe('ending');
    expect(scenes.roleOf('🟠 Be Right Back')).toBeUndefined();
    expect(sceneNamesMatch('🔴 Be Right Back', '🔴 be right back')).toBe(true);
    expect(sceneNamesMatch('🔴 Be Right Back', '🟠 Be Right Back')).toBe(false);
    expect(scenes.roleOf('Gameplay')).toBeUndefined();
    expect(scenes.roleOf('')).toBeUndefined();
    expect(sceneMatchKey('🔴🟠  BRB')).toBe('brb');
    expect(sceneMatchKey('🔴')).toBe('🔴');
  });

  it('keeps a Just Chatting scene separate from the main live scene', async () => {
    const scenes = createSceneRoles(() => ({ live: '🔴 Gameplay', chatting: '🔴 Just Chatting' }));
    expect(scenes.resolve('role:chatting')).toBe('🔴 Just Chatting');
    expect(scenes.resolve('role:live')).toBe('🔴 Gameplay');
    expect(scenes.roleOf('🔴 Just Chatting')).toBe('chatting');
    expect(scenes.roleOf('🟠 Gameplay')).toBeUndefined();
    expect(sceneRoleToken('role:Chatting')).toBe('chatting');
    const wizard = await readFile('wizard/browser/addons.js', 'utf8');
    expect(wizard).toContain("['chatting', 'Just Chatting scene'");
    expect(wizard).toContain('compact: true');
  });

  it('expands role tokens and leaves exact scene names unchanged', () => {
    const scenes = createSceneRoles(() => ({ break: 'BRB' }));
    expect(scenes.resolve('role:break')).toBe('BRB');
    expect(scenes.resolve('ROLE:Break')).toBe('BRB');
    expect(scenes.resolve('role:ending')).toBe('');
    expect(scenes.resolve(' 🔴 Be Right Back ')).toBe('🔴 Be Right Back');
    expect(scenes.resolve('role:unknown')).toBe('role:unknown');
    expect(sceneRoleToken('role:live')).toBe('live');
    expect(sceneRoleToken('Live')).toBeUndefined();
  });

  it('treats a missing or failing mapping as unmapped', () => {
    expect(createSceneRoles(() => undefined).sceneFor('break')).toBe('');
    expect(createSceneRoles(() => { throw new Error('config unavailable'); }).resolve('role:break')).toBe('');
  });

  it('gives every add-on context a read-only view of the current mapping', () => {
    let roles: SceneRoleMap = { break: 'BRB' };
    const broker = new AddOnCapabilityBroker(silentLogger, '.', { sceneRoles: () => roles });
    const context = broker.contextFor({ moduleId: 'thsv.test', permissions: [], approvedActionIds: [] });
    expect(context.scenes.sceneFor('break')).toBe('BRB');
    roles = { break: 'Intermission' };
    expect(context.scenes.resolve('role:break')).toBe('Intermission');
    expect(Object.isFrozen(context.scenes)).toBe(true);
    const unconfigured = new AddOnCapabilityBroker(silentLogger, '.').contextFor({ moduleId: 'thsv.test', permissions: [], approvedActionIds: [] });
    expect(unconfigured.scenes.resolve('role:break')).toBe('');
  });

  it('defaults every role to blank and keeps saved scene names', async () => {
    const config = await testConfig();
    const withoutRoles: Record<string, unknown> = { ...config };
    delete withoutRoles['sceneRoles'];
    expect(bridgeConfigSchema.parse(withoutRoles).sceneRoles).toEqual({ starting: '', live: '', chatting: '', break: '', ending: '', nestedScenes: { starting: '', live: '', chatting: '', break: '', ending: '' }, nestingScenePrefixes: [] });
    expect(bridgeConfigSchema.parse({ ...config, sceneRoles: { ...ROLES } }).sceneRoles).toEqual({ ...ROLES, chatting: '', nestedScenes: { starting: '', live: '', chatting: '', break: '', ending: '' }, nestingScenePrefixes: [] });
    const example = JSON.parse(await readFile('config/bridge.example.json', 'utf8')) as { sceneRoles: unknown };
    expect(example.sceneRoles).toEqual({ starting: '', live: '', chatting: '', break: '', ending: '' });
  });
});

describe('add-on scene defaults follow scene roles', () => {
  async function schemaDefaults(folder: string): Promise<Record<string, unknown>> {
    const schema = JSON.parse(await readFile(`addons/${folder}/schemas/config.json`, 'utf8')) as { properties: Record<string, { default?: unknown }> };
    return Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, value.default]));
  }

  it('ships role defaults instead of one creator\'s scene names', async () => {
    expect((await schemaDefaults('random-clip-player'))['automaticSceneNames']).toEqual(['role:break', 'role:ending']);
    expect((await schemaDefaults('starting-soon-countdown'))['automaticSceneNames']).toEqual(['role:starting']);
    expect(await schemaDefaults('stream-session-guard')).toMatchObject({ breakSceneName: 'role:break', endingSceneName: 'role:ending' });
    expect((await schemaDefaults('raid-scout'))['autoStartSceneName']).toBe('role:ending');
    const mappings = ((await schemaDefaults('scene-actions'))['mappings'] as string[]).map((entry) => (JSON.parse(entry) as { sceneName: string }).sceneName);
    expect(mappings).toEqual(['role:starting', 'role:chatting', 'role:break', 'role:ending']);
    for (const folder of ['random-clip-player', 'starting-soon-countdown', 'stream-session-guard', 'raid-scout', 'scene-actions']) {
      const source = await readFile(`addons/${folder}/dist/index.js`, 'utf8');
      expect(source, folder).not.toMatch(/'BRB'|'Stream Ending'|'Starting Soon'|\[🔴🟠\]/u);
    }
  });

  function guardRuntime(settings: Record<string, unknown>, roles: SceneRoleMap) {
    let state: Record<string, unknown> = {};
    const context = {
      settings: { enabled: true, provider: 'obs', connectionIndex: 0, breaksEnabled: true, breakScheduleMode: 'automatic', breakIntervalMinutes: 60, warningMinutes: 5, breakDurationMinutes: 5, returnMode: 'previous', returnSceneName: '', streamLimitEnabled: true, maximumStreamMinutes: 240, showOverlayWarning: true, ...settings },
      scenes: createSceneRoles(() => roles),
      approvedActionIds: [CONTROLLER_ACTION_ID],
      state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) },
      streamerbot: { runApprovedAction: vi.fn(async () => undefined) },
      overlay: { publish: vi.fn(async () => undefined) },
      schedule: { after: vi.fn(() => 'timer'), cancel: vi.fn(() => true) },
    };
    return { context, state: () => state, setState: (value: Record<string, unknown>) => { state = value; } };
  }

  it('Stream Session Guard switches to the mapped break scene and recognises the mapped ending scene', async () => {
    const test = guardRuntime({ breakSceneName: 'role:break', endingSceneName: 'role:ending' }, ROLES);
    test.setState({ ...createSessionState(sanitizeState({ currentSceneName: 'Gameplay' }), test.context.settings, 1_000), livePlatforms: ['twitch'], currentSceneName: 'Gameplay' });
    await evaluate(test.context, 3_601_000);
    expect(test.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({ sessionGuardPurpose: 'break', sessionGuardSceneName: '🔴 Be Right Back' }));
    await guard.onEvent({ eventType: 'stream.scene-changed', payload: { provider: 'obs', sceneName: 'Stream Ending' }, metadata: { simulated: false } }, test.context);
    expect(test.state()).toMatchObject({ phase: 'ending', lastReason: 'ending-scene-entered' });
  });

  it('Stream Session Guard keeps a saved exact scene name and skips the break while the role is unmapped', async () => {
    const saved = guardRuntime({ breakSceneName: 'My BRB', endingSceneName: 'role:ending' }, ROLES);
    saved.setState({ ...createSessionState(sanitizeState({ currentSceneName: 'Gameplay' }), saved.context.settings, 1_000), livePlatforms: ['twitch'], currentSceneName: 'Gameplay' });
    await evaluate(saved.context, 3_601_000);
    expect(saved.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(CONTROLLER_ACTION_ID, expect.objectContaining({ sessionGuardSceneName: 'My BRB' }));
    const unmapped = guardRuntime({ breakSceneName: 'role:break', endingSceneName: 'role:ending' }, {});
    unmapped.setState({ ...createSessionState(sanitizeState({ currentSceneName: 'Gameplay' }), unmapped.context.settings, 1_000), livePlatforms: ['twitch'], currentSceneName: 'Gameplay' });
    await evaluate(unmapped.context, 3_601_000);
    expect(unmapped.context.streamerbot.runApprovedAction).not.toHaveBeenCalled();
    expect(unmapped.state()).toMatchObject({ lastReason: 'break-scene-missing' });
  });

  it('Scene Actions runs a role mapping for the mapped scene and keeps exact-name mappings', async () => {
    const actionId = '8b58b594-06c3-45e9-9fc1-f2655b02b92f';
    const literalId = '68fa3646-8b6c-4ef0-bf96-19474de8b620';
    const mappings = [
      JSON.stringify({ id: 'be-right-back', enabled: true, provider: 'obs', connectionName: '', sceneName: 'role:break', actionId, delaySeconds: 0 }),
      JSON.stringify({ id: 'saved', enabled: true, provider: 'obs', connectionName: '', sceneName: 'Gameplay', actionId: literalId, delaySeconds: 0 }),
      JSON.stringify({ id: 'ending-soon', enabled: true, provider: 'obs', connectionName: '', sceneName: 'role:ending', actionId, delaySeconds: 0 }),
    ];
    let state: Record<string, unknown> = {};
    const runApprovedAction = vi.fn(async () => {});
    const context = { settings: { enabled: true, enabledProviders: ['obs'], mappings }, scenes: createSceneRoles(() => ({ break: '🔴 Be Right Back' })), state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) }, streamerbot: { runApprovedAction }, schedule: { after: vi.fn() } };
    await sceneActions.onEvent({ eventType: 'stream.scene-changed', payload: { provider: 'obs', sceneName: '🔴 Be Right Back', connectionId: 'main' }, metadata: { simulated: false } }, context);
    expect(runApprovedAction).toHaveBeenCalledTimes(1);
    expect(runApprovedAction).toHaveBeenCalledWith(actionId, expect.objectContaining({ sceneActionMappingId: 'be-right-back', sceneName: '🔴 Be Right Back' }));
    await sceneActions.onEvent({ eventType: 'stream.scene-changed', payload: { provider: 'obs', sceneName: 'Gameplay', connectionId: 'main' }, metadata: { simulated: false } }, context);
    expect(runApprovedAction).toHaveBeenLastCalledWith(literalId, expect.objectContaining({ sceneActionMappingId: 'saved' }));
    expect(runApprovedAction).toHaveBeenCalledTimes(2);
  });

  it('Raid Scout scene keys drop case and any leading emoji', () => {
    expect(sceneKey('🔴 Ending Soon')).toBe(sceneKey('Ending Soon'));
    expect(sceneKey('🟠 Ending Soon')).toBe('ending soon');
    expect(sceneKey('📁 Stream Ending')).toBe('stream ending');
    expect(sceneKey('Stream Ending')).not.toBe(sceneKey('Ending Soon'));
  });

  it('the pre-stream check resolves role settings and names an unmapped role', () => {
    const addOn = (settings: Record<string, unknown>): WizardAddOnSummary => ({ moduleId: 'thsv.random-clip-player', name: 'Random Clip Player', version: '4.0.14', author: 'test', description: '', changelog: '', packageKind: 'executable', permissions: [], trust: {}, enabled: true, approvedActionIds: [], health: 'installed', configurationSchema: {}, installationSteps: [], uninstallationSteps: [], settings } as unknown as WizardAddOnSummary);
    const catalog = { providers: { obs: { scenes: ['🔴 Be Right Back', 'Stream Ending'], complete: true, updatedAt: new Date().toISOString(), connections: [{ complete: true, updatedAt: new Date().toISOString() }] } } };
    const automation = { obs: { enabled: true, automationReady: true } };
    expect(inspectSceneConfiguration([addOn({ automaticSceneNames: ['role:break', 'role:ending'] })], catalog, automation, ROLES)).toMatchObject({ ready: true });
    const unmapped = inspectSceneConfiguration([addOn({ automaticSceneNames: ['role:break'] })], catalog, automation, {});
    expect(unmapped).toMatchObject({ ready: false, checks: [{ sceneName: 'role:break', issue: expect.stringContaining('break scene role is not mapped') }] });
  });
});
