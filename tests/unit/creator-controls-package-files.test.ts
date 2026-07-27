import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Creator Controls Streamer.bot package', () => {
  it('keeps the mutation controller triggerless and places every action in its own group', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/creator-controls/manifest.json', 'utf8')) as { actions: Array<{ id: string; name: string; group: string; source: string }>; triggerSafety: string };
    expect(manifest.actions).toHaveLength(4);
    expect(new Set(manifest.actions.map((action) => action.group))).toEqual(new Set(['THSV Addon - Creator Controls']));
    expect(manifest.triggerSafety).toContain('Provider Controller must remain triggerless');
    const controller = await readFile('packages/streamerbot/creator-controls/src/ProviderController.cs', 'utf8');
    expect(controller).toContain('thsvAddonRelayToken');
    expect(controller).toContain('CPH.SetChannelGameById');
    expect(controller).toContain('CPH.YouTubeSetCategory');
    expect(controller).toContain('CPH.KickSetCategory');
    expect(controller).not.toMatch(/SetGlobalVar|Process\.Start|PowerShell|cmd\.exe/iu);
  });
});
