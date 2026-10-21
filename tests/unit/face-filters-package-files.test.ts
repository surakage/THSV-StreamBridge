import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import { REPORT_VOICE_ACTION_ID, SET_VOICE_ACTION_ID, VOICE_OFF_ACTION_ID, manifest as runtimeManifest } from '../../addons/face-filters/dist/index.js';

describe('Face Filters package files', () => {
  it('ships triggerless Activate and Deactivate Lens broker actions guarding the Streamfog sub-actions', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/face-filters/manifest.json', 'utf8')) as { actions: Array<{ id: string; importFile: string }> };
    expect(manifest.actions).toHaveLength(5);
    expect(manifest.actions[0]).toMatchObject({ id: '5b0f3c2e-7a1d-4e8b-9c64-2f1a8d7e3b51', brokerDispatched: true, mustRemainTriggerless: true });
    expect(manifest.actions[1]).toMatchObject({ id: 'c3a7e2d4-6b1f-4f0a-8e52-9d4b7a1c6e38', name: 'THSV Extension - Face Filters - Deactivate Lens', brokerDispatched: true, mustRemainTriggerless: true });
    const runtime = await readFile('addons/face-filters/dist/index.js', 'utf8');
    expect(runtime).toContain(`ACTIVATE_ACTION_ID = '${manifest.actions[0]?.id ?? ''}'`);
    expect(runtime).toContain(`DEACTIVATE_ACTION_ID = '${manifest.actions[1]?.id ?? ''}'`);
    const decoded = Buffer.from((await readFile(`packages/streamerbot/face-filters/${manifest.actions[0]?.importFile ?? ''}`, 'utf8')).trim(), 'base64');
    expect(decoded.subarray(0, 4).toString('ascii')).toBe('SBAE');
    const exported = JSON.parse(gunzipSync(decoded.subarray(4)).toString('utf8')) as { data: { actions: Array<{ triggers: unknown[]; subActions: Array<Record<string, unknown>> }> } };
    const action = exported.data.actions[0];
    expect(action?.triggers).toEqual([]);
    expect(action?.subActions.map((step) => step['type'])).toEqual([99_999, 37_004]);
    expect(action?.subActions[1]).toMatchObject({ lensName: '%faceFilterLensName%', duration: '%faceFilterDuration%' });
    // Streamfog's Deactivate Lens is sub-action type 37002 (verified by the creator on Streamer.bot 1.1.0).
    const deactivate = exported.data.actions[1];
    expect(deactivate?.triggers).toEqual([]);
    expect(deactivate?.subActions.map((step) => step['type'])).toEqual([99_999, 37_002]);
    const guard = await readFile('packages/streamerbot/face-filters/src/ActivateLens.cs', 'utf8');
    expect(guard).toContain('thsvAddonRelayToken');
    expect(guard).toContain('seconds < 5 || seconds > 600');
    expect(await readFile('packages/streamerbot/face-filters/src/DeactivateLens.cs', 'utf8')).toContain('token.Length >= 20');
    // Voicemod voices: Set Voice, Voice Off and Report Voice are triggerless C# actions guarded by the broker token.
    expect(manifest.actions.slice(2).map((action) => action.id)).toEqual([SET_VOICE_ACTION_ID as string, VOICE_OFF_ACTION_ID as string, REPORT_VOICE_ACTION_ID as string]);
    for (const voiceAction of exported.data.actions.slice(2)) { expect(voiceAction.triggers).toEqual([]); expect(voiceAction.subActions.map((step) => step['type'])).toEqual([99_999]); }
    const setVoice = await readFile('packages/streamerbot/face-filters/src/SetVoice.cs', 'utf8');
    for (const text of ['thsvAddonRelayToken', 'CPH.VoiceModSelectVoice(voiceId)', 'CPH.VoiceModVoiceChangerOn()']) expect(setVoice).toContain(text);
    expect(await readFile('packages/streamerbot/face-filters/src/VoiceOff.cs', 'utf8')).toContain('CPH.VoiceModVoiceChangerOff()');
    expect(await readFile('packages/streamerbot/face-filters/src/ReportVoice.cs', 'utf8')).toContain('"addon.thsv.face-filters.voice-current"');
  });

  it('edits lenses as labelled rows that save in the same one-line format the runtime parses', async () => {
    const ui = JSON.parse(await readFile('addons/face-filters/ui/settings.json', 'utf8')) as { fields: { lenses: { control: string; itemLabel: string; columns: Array<{ label: string; type?: string }> } } };
    expect(ui.fields.lenses).toMatchObject({ control: 'row-list', itemLabel: 'lens' });
    expect(ui.fields.lenses.columns.map((column) => column.label)).toEqual(['Name', 'Streamfog lens', 'Chat command', 'Twitch reward ID', 'Kick reward ID', 'Seconds', 'Voicemod voice ID']);
    expect(ui.fields.lenses.columns[5]?.type).toBe('number');
    // Rows saved in the older five-box layout are placed into the matching boxes.
    expect((ui.fields.lenses as unknown as { legacyColumnOrder: number[] }).legacyColumnOrder).toEqual([0, 1, 2, 3, 5]);
    const wizard = await readFile('wizard/browser/addons.js', 'utf8');
    expect(wizard).toContain("ui.control === 'row-list'");
    expect(wizard).toContain("cells.join(' | ')");
    expect(wizard).toContain("form.querySelectorAll('[data-row-list-editor]').forEach(syncRowListEditor);");
    const styles = await readFile('wizard/browser/styles.css', 'utf8');
    expect(styles).toContain('.row-list-editor{display:grid;gap:.75rem;min-width:0;container-type:inline-size}');
    // Header and rows share one grid (subgrid), so titles line up with their inputs whatever the Remove button's width.
    expect(styles).toContain('.row-list-head,.row-list-row{display:grid;grid-column:1/-1;grid-template-columns:subgrid;');
    expect(styles).toContain('@container (max-width:720px){.row-list-table,.row-list-rows{grid-template-columns:minmax(0,1fr)}.row-list-head{display:none}');
  });

  it('keeps the descriptor manifest identical to the runtime manifest', async () => {
    const descriptor = JSON.parse(await readFile('addons/face-filters/module-package.json', 'utf8')) as { manifest: unknown; permissions: string[] };
    expect(descriptor.manifest).toEqual(JSON.parse(JSON.stringify(runtimeManifest)));
    expect([...descriptor.permissions].sort()).toEqual(['chat.send', 'events.subscribe', 'schedule.bounded', 'streamerbot.run-approved-action']);
  });
});
