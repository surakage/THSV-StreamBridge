import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Raid Scout package files', () => {
  it('ships one stable triggerless controller and exact Suggest, Confirm, and Cancel actions', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/raid-scout/manifest.json', 'utf8')) as {
      actions: Array<{ id: string; name: string; group: string; importFile: string; arguments?: Array<{ name: string; value: string }> }>;
      triggerSafety: string;
    };
    expect(manifest.actions).toHaveLength(4);
    expect(manifest.actions[0]).toMatchObject({
      id: '6a78d950-17b5-4a98-9de7-1a5b4275f31c',
      name: 'THSV Addon - Raid Scout - Controller',
      group: 'THSV StreamBridge - Add-ons',
    });
    expect(manifest.actions.slice(1).map((action) => action.arguments?.[0]?.value)).toEqual(['suggest', 'confirm', 'cancel']);
    expect(new Set(manifest.actions.map((action) => action.importFile))).toEqual(new Set(['THSV-StreamBridge-Raid-Scout-2.4.0.sb']));
    expect(manifest.triggerSafety).toContain('Controller must remain triggerless');
  });

  it('bounds Twitch discovery and keeps credentials inside fixed Helix requests', async () => {
    const controller = await readFile('packages/streamerbot/raid-scout/src/RaidScoutController.cs', 'utf8');
    for (const contract of [
      'CPH.TwitchGetBroadcaster()',
      'CPH.TwitchGetExtendedUserInfoById',
      'CPH.TwitchStartRaidById',
      'CPH.TwitchStartRaidByName',
      'https://api.twitch.tv/helix/',
      'TimeSpan.FromSeconds(10)',
      'MaximumResponseCharacters = 262144',
      'MaximumCandidates = 40',
    ]) expect(controller).toContain(contract);
    expect(controller).toContain('CPH.TwitchOAuthToken');
    expect(controller).toContain('CPH.TwitchClientId');
    expect(controller).not.toMatch(/System\.IO|File\.|Directory\.|WebClient|\.Result\b|SetGlobalVar|GetGlobalVar/u);
    expect(controller).not.toMatch(/Log(?:Info|Warn|Error)\([^;]*(?:token|clientId)/iu);
  });

  it('has a guided UI, safe default confirmation, and no public progress spam', async () => {
    const schema = JSON.parse(await readFile('addons/raid-scout/schemas/config.json', 'utf8')) as {
      properties: Record<string, { default?: unknown }>;
    };
    const ui = JSON.parse(await readFile('addons/raid-scout/ui/settings.json', 'utf8')) as {
      sections: Array<{ id: string }>;
    };
    const runtime = await readFile('addons/raid-scout/dist/index.js', 'utf8');
    expect(schema.properties['confirmationMode']?.default).toBe('required');
    expect(schema.properties['showSuggestionCard']?.default).toBe(true);
    expect(ui.sections.map((section) => section.id)).toEqual([
      'quick-start', 'discovery', 'preferred', 'limits', 'audience', 'language-category',
      'channels-history', 'messages', 'overlay-content', 'overlay-style', 'maintenance',
    ]);
    expect(runtime).not.toContain('Checking Local Database');
    expect(runtime).not.toContain('Loading raid');
    expect(runtime).not.toMatch(/innerHTML/u);
  });
});
