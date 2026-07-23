import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Quote Vault Streamer.bot package', () => {
  it('contains only bounded creator controls and no quote-file access', async () => {
    const source = await readFile('packages/streamerbot/quote-vault/src/QuoteVaultControl.cs', 'utf8');
    expect(source).toContain('addon.thsv.quote-vault.control');
    expect(source).toContain('quoteVaultSourcePlatform');
    expect(source).toContain('sourcePlatform != "twitch"');
    expect(source).toContain('CPH.WebsocketBroadcastJson');
    expect(source).not.toMatch(/System\.IO|File\.|StreamWriter|Process\.Start|powershell|cmd\.exe/iu);
    expect(source).not.toMatch(/AddQuoteFor(?:Twitch|YouTube|Kick)/u);
  });

  it('packages two optional controls with editable platform arguments', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/quote-vault/manifest.json', 'utf8')) as {
      minimumStreamerBotVersion: string;
      actions: Array<{ name: string; group: string; importFile: string; arguments: Array<{ name: string; value: string }> }>;
    };
    expect(manifest.minimumStreamerBotVersion).toBe('1.0.5-alpha.33');
    expect(manifest.actions.map((action) => action.name)).toEqual([
      'THSV Addon - Quote Vault - Random Quote',
      'THSV Addon - Quote Vault - Statistics',
    ]);
    expect(manifest.actions.every((action) => action.group === 'THSV StreamBridge - Add-ons')).toBe(true);
    expect(new Set(manifest.actions.map((action) => action.importFile))).toEqual(new Set(['THSV-StreamBridge-Quote-Vault-2.4.0.sb']));
    expect(manifest.actions.every((action) => action.arguments.some((argument) => argument.name === 'quoteVaultSourcePlatform' && argument.value === 'twitch'))).toBe(true);
  });
});
