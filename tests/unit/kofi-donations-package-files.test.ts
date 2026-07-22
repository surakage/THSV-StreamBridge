import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Ko-fi Donations Streamer.bot package', () => {
  it('guides creators through Streamer.bot setup before enabling the add-on', async () => {
    const settingsUi = JSON.parse(await readFile('addons/kofi-donations/ui/settings.json', 'utf8')) as {
      intro: string;
      sections: Array<{ id: string; open?: boolean; notice?: string; fields: string[] }>;
    };
    expect(settingsUi.intro).toContain('Complete the Streamer.bot connection first');
    expect(settingsUi.sections.map((section) => section.id)).toEqual(['prerequisites', 'connection', 'privacy', 'presentation', 'delivery']);
    expect(settingsUi.sections[0]).toMatchObject({ open: true, fields: [] });
    expect(settingsUi.sections[0]?.notice).toContain('Integrations > Ko-Fi > Donation');
    expect(settingsUi.sections[3]?.notice).toContain('Alerts > Ko-fi > Donation');
    expect(settingsUi.sections.slice(1).every((section) => section.open !== true)).toBe(true);
  });

  it('requires Ko-fi messageId and never substitutes a generated financial identity', async () => {
    const source = await readFile('packages/streamerbot/kofi-donations/src/RelayKoFiDonation.cs', 'utf8');
    expect(source).toContain('Read("messageId", 256)');
    expect(source).toContain('stable messageId');
    expect(source).toContain('["relayId"] = messageId');
    expect(source).not.toContain('Guid.NewGuid');
    expect(source).toContain('CultureInfo.InvariantCulture');
    expect(source).not.toMatch(/Process\.Start|powershell|cmd\.exe/iu);
  });

  it('ships as its own import with a single donation-only action and bounded references', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/kofi-donations/manifest.json', 'utf8')) as { action: { id: string; importFile: string; references: string[] }; manualTriggerSetup: string[] };
    expect(manifest.action.id).toBe('e61c4b43-6cf0-5d56-a1c9-2176ae09c312');
    expect(manifest.action.importFile).toBe('THSV-StreamBridge-KoFi-Donations-1.0.1.sb');
    expect(manifest.manualTriggerSetup).toEqual(['Integrations > Ko-Fi > Donation']);
    expect(manifest.action.references).toEqual(expect.arrayContaining(['.\\Newtonsoft.Json.dll']));
  });
});
