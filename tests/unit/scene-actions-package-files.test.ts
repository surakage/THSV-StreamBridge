import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Scene Actions Streamer.bot package', () => {
  it('ships one protected intake and five editable stable-ID starter actions', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/scene-actions/manifest.json', 'utf8')) as { actions: Array<{ id: string; name: string; group: string; importFile: string }>; manualTriggerSetup: string[] };
    expect(manifest.actions).toHaveLength(6);
    expect(manifest.actions[0]).toMatchObject({ id: '18bdc91c-64eb-4787-8be9-6a921b272943', name: 'THSV Scene Actions - Intake', group: 'THSV StreamBridge - Add-ons' });
    expect(manifest.actions.slice(1).every((action) => action.group === 'THSV Scene Actions')).toBe(true);
    expect(new Set(manifest.actions.map((action) => action.importFile))).toEqual(new Set(['THSV-StreamBridge-Scene-Actions-2.4.0.sb']));
    expect(manifest.manualTriggerSetup.join(' ')).toMatch(/OBS Studio.*Streamlabs Desktop.*Meld Studio/u);
  });

  it('uses documented trigger arguments and never queries or dispatches mutable scene names', async () => {
    const source = await readFile('packages/streamerbot/scene-actions/src/RelaySceneChange.cs', 'utf8');
    expect(source).toContain('obs.sceneName'); expect(source).toContain('sd.sceneName'); expect(source).toContain('meldStudio.sceneName');
    expect(source).toContain('CPH.WebsocketBroadcastJson'); expect(source).toContain('"thsv.scene"');
    expect(source).not.toContain('ObsGetCurrentScene'); expect(source).not.toContain('SlobsGetCurrentScene'); expect(source).not.toContain('CPH.RunAction(');
  });

  it('includes a guided mapping editor instead of exposing encoded mapping lines', async () => {
    const wizard = await readFile('wizard/browser/addons.js', 'utf8');
    const ui = JSON.parse(await readFile('addons/scene-actions/ui/settings.json', 'utf8')) as { fields: { mappings: { control: string } } };
    expect(ui.fields.mappings.control).toBe('scene-mappings');
    expect(wizard).toContain('data-scene-mapping-editor');
    expect(wizard).toContain('Exact scene name');
  });
});
