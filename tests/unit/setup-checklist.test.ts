import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';

interface ChecklistItem { readonly id: string; readonly text: string; readonly action: { readonly label: string; readonly target: Record<string, unknown> } }
interface ChecklistResult { readonly general: readonly ChecklistItem[]; readonly features: readonly { readonly moduleId: string; readonly name: string; readonly items: readonly ChecklistItem[] }[]; readonly openCount: number }
type BuildChecklist = (input: Record<string, unknown>) => ChecklistResult;

let buildSetupChecklist: BuildChecklist;

beforeAll(async () => {
  // The wizard script is a classic browser script; without a document only its pure logic runs.
  const context: Record<string, unknown> = {};
  runInNewContext(await readFile('wizard/browser/setup-checklist.js', 'utf8'), context);
  buildSetupChecklist = context['buildSetupChecklist'] as BuildChecklist;
});

const jukebox = {
  moduleId: 'thsv.village-jukebox', name: 'Village Jukebox', enabled: true, health: 'installed', approvedActionIds: [] as string[],
  settings: { enabled: true, rewardRequestsEnabled: true, twitchRewardId: '', kickRewardId: '' },
  configurationSchema: { properties: {
    enabled: { type: 'boolean', title: 'Enable Village Jukebox' },
    rewardRequestsEnabled: { type: 'boolean' },
    twitchRewardId: { type: 'string', title: 'Twitch Song Request reward ID' },
    kickRewardId: { type: 'string', title: 'Kick Song Request reward ID' },
  } },
  settingsUi: { fields: { twitchRewardId: { visibleWhen: { field: 'rewardRequestsEnabled', equals: true } }, kickRewardId: { visibleWhen: { field: 'rewardRequestsEnabled', equals: true } } } },
};
const resolveAction = 'THSV Addon - Village Jukebox - Resolve YouTube Track';
const settleAction = 'THSV Addon - Village Jukebox - Settle Twitch Reward';
const recommendedActionNames = { 'thsv.village-jukebox': [resolveAction, settleAction] };
const freshInput = { addOns: [jukebox], actions: [], recommendedActionNames, platforms: { twitch: { enabled: true }, kick: { enabled: false } }, sceneRoles: {} };

describe('setup checklist', () => {
  it('lists what a fresh feature still needs, with a button target for each item', () => {
    const result = buildSetupChecklist(freshInput);
    const [feature] = result.features;
    expect(feature?.items.map((item) => item.id)).toEqual(['actions-not-imported', 'reward:twitchRewardId']);
    expect(feature?.items[0]?.text).toContain(resolveAction);
    expect(feature?.items[0]?.action.target).toEqual({ kind: 'panel', panel: 'streamerbot', focus: '.universal-import-card' });
    expect(feature?.items[1]?.text).toContain('Twitch Song Request reward ID');
    expect(feature?.items[1]?.action.target).toEqual({ kind: 'addon', moduleId: 'thsv.village-jukebox', tab: 'settings', section: 'configure', field: 'twitchRewardId' });
    expect(result.openCount).toBe(2);
  });

  it('asks to approve imported actions and reports approved actions that disappeared', () => {
    const result = buildSetupChecklist({ ...freshInput, addOns: [{ ...jukebox, approvedActionIds: ['gone'], settings: { ...jukebox.settings, twitchRewardId: 'reward-1' } }], actions: [{ id: 'a1', name: resolveAction }, { id: 'a2', name: settleAction }] });
    const items = result.features[0]?.items ?? [];
    expect(items.map((item) => item.id)).toEqual(['actions-not-approved', 'approved-actions-missing']);
    expect(items[0]?.action.target).toEqual({ kind: 'addon', moduleId: 'thsv.village-jukebox', tab: 'streamerbot', section: 'approved-actions' });
  });

  it('does not ask to approve actions for a feature that never runs them', () => {
    const intakeOnly = { ...jukebox, permissions: ['events.subscribe', 'state.private'], settings: { ...jukebox.settings, twitchRewardId: 'reward-1' } };
    const imported = buildSetupChecklist({ ...freshInput, addOns: [intakeOnly], actions: [{ id: 'a1', name: resolveAction }, { id: 'a2', name: settleAction }] });
    expect(imported.openCount).toBe(0);
    const missing = buildSetupChecklist({ ...freshInput, addOns: [intakeOnly], actions: [{ id: 'a1', name: resolveAction }] });
    expect(missing.features[0]?.items.map((item) => item.id)).toEqual(['actions-not-imported']);
  });

  it('shows a feature as ready when everything it relies on is in place', () => {
    const ready = { ...jukebox, approvedActionIds: ['a1', 'a2'], settings: { ...jukebox.settings, twitchRewardId: 'reward-1' } };
    const result = buildSetupChecklist({ ...freshInput, addOns: [ready], actions: [{ id: 'a1', name: resolveAction }, { id: 'a2', name: settleAction }] });
    expect(result.features).toEqual([{ moduleId: 'thsv.village-jukebox', name: 'Village Jukebox', items: [] }]);
    expect(result.openCount).toBe(0);
  });

  it('skips reward IDs and reward actions the feature does not use, and platforms that are off', () => {
    const noRewards = { ...jukebox, approvedActionIds: ['a1'], settings: { ...jukebox.settings, rewardRequestsEnabled: false } };
    const result = buildSetupChecklist({ ...freshInput, addOns: [noRewards], actions: [{ id: 'a1', name: resolveAction }] });
    expect(result.openCount).toBe(0);
    const kickOnly = buildSetupChecklist({ ...freshInput, addOns: [{ ...jukebox, approvedActionIds: ['a1', 'a2'] }], actions: [{ id: 'a1', name: resolveAction }, { id: 'a2', name: settleAction }], platforms: { kick: { enabled: true } } });
    expect(kickOnly.features[0]?.items.map((item) => item.id)).toEqual(['reward:kickRewardId']);
  });

  it('ignores disabled add-ons and points to the inner switch when a component is switched off', () => {
    expect(buildSetupChecklist({ ...freshInput, addOns: [{ ...jukebox, enabled: false }] }).features).toEqual([]);
    const switchedOff = buildSetupChecklist({ ...freshInput, addOns: [{ ...jukebox, settings: { ...jukebox.settings, enabled: false } }] });
    expect(switchedOff.features[0]?.items.map((item) => item.id)).toEqual(['switched-off']);
  });

  it('flags role:<name> scene settings only while that role is unmapped, including saved JSON rows', () => {
    const scenes = {
      moduleId: 'thsv.scene-actions', name: 'Scene Actions', enabled: true, health: 'installed', approvedActionIds: [],
      settings: { breakScene: 'role:break', mappings: [JSON.stringify({ sceneName: 'role:ending', enabled: true }), JSON.stringify({ sceneName: 'role:starting', enabled: false })], hiddenScene: 'role:live', mode: 'manual' },
      configurationSchema: { properties: { breakScene: { title: 'Break scene' }, mappings: { title: 'Scene mappings' }, hiddenScene: {}, mode: {} } },
      settingsUi: { fields: { hiddenScene: { visibleWhen: { field: 'mode', equals: 'scene-change' } } } },
    };
    const unmapped = buildSetupChecklist({ ...freshInput, addOns: [scenes], recommendedActionNames: {} });
    expect(unmapped.features[0]?.items.map((item) => item.id)).toEqual(['scene-role:break', 'scene-role:ending']);
    expect(unmapped.features[0]?.items[0]?.action.target).toEqual({ kind: 'panel', panel: 'addons', focus: '#scene-roles' });
    const mapped = buildSetupChecklist({ ...freshInput, addOns: [scenes], recommendedActionNames: {}, sceneRoles: { break: 'BRB', ending: 'Ending' } });
    expect(mapped.openCount).toBe(0);
  });

  it('collects restarts, unsaved changes, and connection problems as general items', () => {
    const result = buildSetupChecklist({
      ...freshInput, actions: null, restartRequired: true, stagedChangeCount: 2, restartPendingModuleIds: ['thsv.village-jukebox'],
      connections: { streamerBot: 'disconnected', platforms: [{ name: 'twitch', state: 'connected' }, { name: 'kick', state: 'connecting' }, { name: 'youtube', state: 'disabled' }] },
    });
    expect(result.general.map((item) => item.id)).toEqual(['staged', 'restart', 'streamerbot', 'platform:kick', 'actions-unchecked']);
    expect(result.features[0]?.items.map((item) => item.id)).toEqual(['restart', 'reward:twitchRewardId']);
  });
});
