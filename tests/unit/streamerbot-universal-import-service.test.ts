import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { StreamerBotUniversalImportService } from '../../bridge/services/streamerbot-universal-import-service.js';
import type { WizardAddOnSummary } from '../../bridge/services/addon-wizard-service.js';

function decode(contentBase64: string): { data: { actions: Array<{ id: string; name: string }>; commands: Array<{ id: string }> }; meta: { name: string } } {
  const bytes = Buffer.from(contentBase64, 'base64');
  expect(bytes.subarray(0, 4).toString('ascii')).toBe('SBAE');
  return JSON.parse(gunzipSync(bytes.subarray(4)).toString('utf8')) as { data: { actions: Array<{ id: string; name: string }>; commands: Array<{ id: string }> }; meta: { name: string } };
}

describe('Streamer.bot universal import service', () => {
  it('lists required framework packages, selectable extensions, and unavailable optional add-ons', async () => {
    const catalogue = await new StreamerBotUniversalImportService().catalogue([]);
    expect(catalogue.bridgeVersion).toBe('3.6.0');
    expect(catalogue.packages.filter((item) => item.required)).toHaveLength(12);
    expect(catalogue.packages.find((item) => item.folder === 'raid-scout')).toMatchObject({ kind: 'extension', available: true });
    expect(catalogue.packages.find((item) => item.folder === 'subathon-timer')).toMatchObject({ kind: 'addon', available: false });
    expect(catalogue.packages.find((item) => item.folder === 'native-platform-intake')?.triggerRecommendations).toContain('Twitch: Chat > Message');
  });

  it('combines required packages and selected features while retaining canonical stable IDs', async () => {
    const result = await new StreamerBotUniversalImportService().build(['raid-scout']);
    const decoded = decode(result.contentBase64);
    expect(result.packageFolders).toContain('core-receiver');
    expect(result.packageFolders).toContain('raid-scout');
    expect(decoded.meta.name).toBe('THSV StreamBridge - Universal Setup');
    expect(decoded.data.actions).toContainEqual(expect.objectContaining({ id: '143fce1d-c5b0-4108-b766-ee2d0249e2d4', name: 'THSV StreamBridge - Receive Event' }));
    expect(decoded.data.actions).toContainEqual(expect.objectContaining({ id: 'e924f0ad-36c1-4687-8c05-c39466d06963', name: 'THSV Addon - Raid Scout - Suggest' }));
    expect(new Set(decoded.data.actions.map((action) => action.id)).size).toBe(decoded.data.actions.length);
    expect(result.triggerRecommendations.find((item) => item.package.includes('Raid Scout'))?.recommendations).toContain('Suggest: Attach only to a creator-controlled hotkey, deck button, or operator command.');
  });

  it('rejects optional add-on actions until the matching add-on is installed', async () => {
    await expect(new StreamerBotUniversalImportService().build(['subathon-timer'])).rejects.toThrow('Install it in the wizard');
  });

  it('builds the complete valid selection when every optional add-on is installed', async () => {
    const service = new StreamerBotUniversalImportService();
    const initial = await service.catalogue([]);
    const installedAddOns = initial.packages
      .filter((item) => item.kind === 'addon' && item.moduleId !== undefined)
      .map((item) => ({ moduleId: item.moduleId, health: 'installed', enabled: true }) as WizardAddOnSummary);
    const catalogue = await service.catalogue(installedAddOns);
    expect(catalogue.packages).toHaveLength(41);
    expect(catalogue.packages.filter((item) => item.kind === 'addon').every((item) => item.available && item.enabled)).toBe(true);

    const result = await service.build(catalogue.packages.map((item) => item.folder), installedAddOns);
    const decoded = decode(result.contentBase64);
    expect(result.packageFolders).toHaveLength(41);
    expect(new Set(decoded.data.actions.map((action) => action.id)).size).toBe(decoded.data.actions.length);
    expect(new Set(decoded.data.commands.map((command) => command.id)).size).toBe(decoded.data.commands.length);
  });
});
