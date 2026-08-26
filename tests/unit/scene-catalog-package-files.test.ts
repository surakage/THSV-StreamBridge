import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Scene Catalog Streamer.bot package and wizard controls', () => {
  it('uses OBS GetSceneList read-only and never changes a scene', async () => {
    const source = await readFile('packages/streamerbot/scene-catalog/src/RefreshSceneCatalog.cs', 'utf8');
    const service = await readFile('apps/bridge-service.ts', 'utf8');
    expect(source).toContain('ObsSendRaw("GetSceneList"'); expect(source).toContain('WebsocketBroadcastJson'); expect(source).toContain('thsv.scene-catalog');
    expect(service).toContain("sceneCatalog.refresh({ provider: 'obs', connectionIndex: 0 })");
    expect(source).not.toMatch(/SetCurrentProgramScene|SetCurrentPreviewScene|ObsSetScene|SlobsSetScene|MeldShowScene/u);
  });

  it('enables exact-name picker controls for all four scene-driven features', async () => {
    const wizard = await readFile('wizard/browser/addons.js', 'utf8');
    const countdown = JSON.parse(await readFile('addons/starting-soon-countdown/ui/settings.json', 'utf8')) as { fields: Record<string, { control?: string }> };
    const clips = JSON.parse(await readFile('addons/random-clip-player/ui/settings.json', 'utf8')) as { fields: Record<string, { control?: string }> };
    const raid = JSON.parse(await readFile('addons/raid-scout/ui/settings.json', 'utf8')) as { fields: Record<string, { control?: string; providerField?: string }> };
    expect(countdown.fields.automaticSceneNames?.control).toBe('scene-list'); expect(clips.fields.automaticSceneNames?.control).toBe('scene-list');
    expect(raid.fields.autoStartSceneName).toMatchObject({ control: 'scene-name', providerField: 'autoStartProvider' });
    expect(wizard).toContain('data-scene-mapping-field="sceneName" data-scene-name-input'); expect(wizard).toContain('Manual entry stays available');
    expect(wizard).toContain('data-scene-name-picker'); expect(wizard).toContain('Detected scene<select data-scene-catalog-select>');
    expect(wizard).not.toContain('<datalist id="scene-catalog-');
  });
});
