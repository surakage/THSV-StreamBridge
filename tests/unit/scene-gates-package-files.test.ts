import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import { APPLY_ACTION_ID, CHECK_ACTION_ID } from '../../addons/scene-gates/dist/index.js';

describe('Scene Gates package files', () => {
  it('ships a triggerless broker Apply action and a triggerless Check action in one import', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/scene-gates/manifest.json', 'utf8')) as { version: string; actions: Array<{ id: string; name: string; group: string; importFile: string; brokerDispatched?: boolean; mustRemainTriggerless?: boolean }> };
    expect(manifest.actions.map((action) => action.id)).toEqual([APPLY_ACTION_ID as string, CHECK_ACTION_ID as string]);
    expect(manifest.actions[0]).toMatchObject({ name: 'THSV Scene Gate - Apply', brokerDispatched: true, mustRemainTriggerless: true });
    expect(manifest.actions[1]).toMatchObject({ name: 'THSV Scene Gate - Check' });
    expect(manifest.actions[1]?.brokerDispatched).toBeUndefined();
    expect(new Set(manifest.actions.map((action) => action.group))).toEqual(new Set(['THSV Extension - Scene Gates']));
    expect(new Set(manifest.actions.map((action) => action.importFile))).toEqual(new Set([`THSV-StreamBridge-Scene-Gates-${manifest.version}.sb`]));
    const decoded = Buffer.from((await readFile(`packages/streamerbot/scene-gates/THSV-StreamBridge-Scene-Gates-${manifest.version}.sb`, 'utf8')).trim(), 'base64');
    expect(decoded.subarray(0, 4).toString('ascii')).toBe('SBAE');
    const exported = JSON.parse(gunzipSync(decoded.subarray(4)).toString('utf8')) as { data: { actions: Array<{ id: string; name: string; triggers: unknown[]; subActions: Array<Record<string, unknown>> }> } };
    expect(exported.data.actions.map((action) => action.name)).toEqual(['THSV Scene Gate - Apply', 'THSV Scene Gate - Check']);
    for (const action of exported.data.actions) { expect(action.triggers).toEqual([]); expect(action.subActions.map((step) => step['type'])).toEqual([99_999]); }
    const index = JSON.parse(await readFile('packages/streamerbot/import-index.json', 'utf8')) as { packages: Array<{ folder: string; moduleId?: string; kind: string }> };
    expect(index.packages.find((entry) => entry.folder === 'scene-gates')).toMatchObject({ moduleId: 'thsv.scene-gates', kind: 'extension' });
  });

  it('applies changes with documented command and reward methods and records non-persisted gate globals', async () => {
    const apply = await readFile('packages/streamerbot/scene-gates/src/ApplySceneGates.cs', 'utf8');
    for (const text of ['thsvAddonRelayToken', 'sceneGateChanges', 'CPH.EnableCommand(target)', 'CPH.DisableCommand(target)', 'CPH.EnableReward(target)', 'CPH.DisableReward(target)', 'CPH.SetGlobalVar("thsvGate." + gate, allowed, false)', 'CPH.SetGlobalVar("thsvGateMessage." + gate, message, false)']) expect(apply).toContain(text);
    // Rewards are hidden, never paused.
    expect(apply).not.toContain('PauseReward');
    expect(apply).not.toContain('CPH.RunAction(');
  });

  it('checks a gate from Kick actions, replies on the source platform and stops the action', async () => {
    const check = await readFile('packages/streamerbot/scene-gates/src/CheckSceneGate.cs', 'utf8');
    for (const text of ['Read("gateId", 80)', 'CPH.GetGlobalVar<bool?>("thsvGate." + gate, false)', 'CPH.SendKickMessage(message, true, true)', 'CPH.SendMessage(message, true, true)', 'CPH.SendYouTubeMessageToLatestMonitored(message, true, true)', 'CPH.SetArgument("sceneGateAllowed", false)', 'return false;']) expect(check).toContain(text);
    expect(check).not.toContain('SetGlobalVar');
    const readme = await readFile('addons/scene-gates/README.md', 'utf8');
    for (const heading of ['## What you need', '## Set it up', '## Chat commands', '## Good to know']) expect(readme).toContain(heading);
    expect(readme).toContain('reject it yourself from the Kick reward queue');
  });

  it('edits gates as labelled rows with dropdowns and a Streamer.bot command picker', async () => {
    const ui = JSON.parse(await readFile('addons/scene-gates/ui/settings.json', 'utf8')) as { fields: { gates: { control: string; columns: Array<{ label: string; type?: string; suggestions?: string; options?: Array<{ value: string }> }> } } };
    expect(ui.fields.gates.control).toBe('row-list');
    expect(ui.fields.gates.columns.map((column) => column.label)).toEqual(['On', 'Name', 'Type', 'Command or reward ID', 'Allowed scenes', 'Wrong-scene message']);
    expect(ui.fields.gates.columns[2]?.options?.map((option) => option.value)).toEqual(['command', 'twitch-reward', 'check-only']);
    expect(ui.fields.gates.columns[3]?.suggestions).toBe('streamerbot-commands');
    const wizard = await readFile('wizard/browser/addons.js', 'utf8');
    expect(wizard).toContain("column?.type === 'select'");
    expect(wizard).toContain('list="row-list-streamerbot-commands"');
    expect(wizard).toContain("'thsv.scene-gates': ['THSV Scene Gate - Apply']");
  });
});
