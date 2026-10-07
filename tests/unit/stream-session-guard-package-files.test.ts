import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('Stream Break & End Guard package', () => {
  it('is a bundled guided extension with detected scene pickers', async () => {
    const descriptor = JSON.parse(await readFile('addons/stream-session-guard/module-package.json', 'utf8')) as { permissions: string[]; manifest: { moduleId: string; eventSubscriptions: string[] } };
    const ui = JSON.parse(await readFile('addons/stream-session-guard/ui/settings.json', 'utf8')) as { fields: Record<string, { control?: string; providerField?: string; requireDetected?: boolean }> };
    expect(descriptor.manifest.moduleId).toBe('thsv.stream-session-guard');
    expect(descriptor.permissions).toEqual(expect.arrayContaining(['events.subscribe', 'streamerbot.run-approved-action', 'overlay.publish', 'schedule.bounded', 'state.private']));
    expect(descriptor.manifest.eventSubscriptions).toEqual(expect.arrayContaining(['stream.online', 'stream.offline', 'stream.scene-changed', 'system.scene-catalog']));
    for (const field of ['breakSceneName', 'returnSceneName', 'endingSceneName']) expect(ui.fields[field]).toMatchObject({ control: 'scene-name', providerField: 'provider', requireDetected: true });
  });

  it('keeps the one scene controller triggerless and provider bounded', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/stream-session-guard/manifest.json', 'utf8')) as { actions: Array<{ source: string; brokerDispatched?: boolean; mustRemainTriggerless?: boolean }> };
    const source = await readFile('packages/streamerbot/stream-session-guard/src/SceneController.cs', 'utf8');
    const controls = await readFile('packages/streamerbot/stream-session-guard/src/ControlAutomation.cs', 'utf8');
    const controllers = manifest.actions.filter((action) => action.source === 'src/SceneController.cs');
    expect(controllers).toHaveLength(1); expect(controllers[0]).toMatchObject({ brokerDispatched: true, mustRemainTriggerless: true });
    expect(manifest.actions.filter((action) => action.source !== 'src/SceneController.cs').every((action) => action.source === 'src/ControlAutomation.cs' && action.brokerDispatched !== true)).toBe(true);
    expect(source).toContain('CPH.ObsSetScene'); expect(source).toContain('CPH.SlobsSetScene'); expect(source).toContain('CPH.MeldStudioShowSceneByName');
    expect(source).not.toMatch(/StartStreaming|StopStreaming/iu);
    expect(controls).not.toMatch(/SetScene|ShowScene|StartStreaming|StopStreaming/iu);
  });
});
