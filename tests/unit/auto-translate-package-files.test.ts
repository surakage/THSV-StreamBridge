import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Auto Translate Streamer.bot package', () => {
  it('uses the documented bounded HTTPS provider and never logs message text', async () => {
    const source = await readFile('packages/streamerbot/auto-translate/src/TranslateText.cs', 'utf8');
    expect(source).toContain('https://api.mymemory.translated.net/get?q=');
    expect(source).toContain('request.Timeout = timeoutSeconds * 1000');
    expect(source).toContain('MaximumSegmentBytes = 450');
    expect(source).toContain('MaximumProviderResponseCharacters = 262144');
    expect(source).toContain('ReadBoundedProviderResponse(reader)');
    expect(source).not.toContain('reader.ReadToEnd()');
    expect(source).toContain('addon.thsv.auto-translate.translation-received');
    expect(source).not.toMatch(/CPH\.Log(?:Info|Debug|Warn|Error)\([^\n]*(?:text|translatedText)/u);
    expect(source).not.toMatch(/Process\.Start|powershell|cmd\.exe/iu);
  });

  it('pins the exact broker-approved action and does not require System.Net.Http', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/auto-translate/manifest.json', 'utf8')) as { action: { id: string; references: string[] } };
    expect(manifest.action.id).toBe('b31de9cf-0d5d-4ba1-a63e-f9ffde20b27d');
    expect(manifest.action.references).not.toContain('C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.Net.Http.dll');
  });
});
