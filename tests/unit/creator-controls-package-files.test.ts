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
    expect(controller).toContain('providerControlOriginRequestId');
    expect(controller).toContain('categoryPilotRequestId');
    expect(controller).toContain('ReadBool("providerControlSimulated")');
    expect(controller).toContain('["simulated"] = simulated');
    expect(controller).not.toMatch(/SetGlobalVar|Process\.Start|PowerShell|cmd\.exe/iu);
  });

  it('presents profiles as short guided sections with advanced categories collapsed', async () => {
    const schema = await readFile('addons/creator-controls/schemas/config.json', 'utf8');
    const ui = await readFile('addons/creator-controls/ui/settings.json', 'utf8');
    expect(schema).toContain('"title": "Turn on Creator Controls"');
    expect(schema).toContain('"title": "Stream title"');
    expect(schema).toContain('Usually leave blank to use the latest monitored broadcast.');
    expect(schema).not.toContain('"title": "Profile 1 channel title"');
    expect(ui).toContain('"title": "2. Starting Soon"');
    expect(ui).toContain('"title": "Starting Soon categories (optional)"');
    expect(ui).toContain('"visibleWhen": { "field": "profile1Enabled", "equals": true }');
  });
});
