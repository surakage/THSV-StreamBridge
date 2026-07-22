import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('User Translate Streamer.bot package', () => {
  it('uses a documented HTTPS provider with timeouts and never logs translated text', async () => {
    const source = await readFile('packages/streamerbot/user-translate/src/TranslateText.cs', 'utf8');
    expect(source).toContain('https://api.mymemory.translated.net/get?q=');
    expect(source).toContain('request.Timeout = timeoutSeconds * 1000');
    expect(source).toContain('MaximumSegmentBytes = 450');
    expect(source).toContain('MaximumProviderResponseCharacters = 262144');
    expect(source).toContain('ReadBoundedProviderResponse(reader)');
    expect(source).not.toContain('reader.ReadToEnd()');
    expect(source).toContain('addon.thsv.user-translate.translation-received');
    expect(source).not.toMatch(/CPH\.Log(?:Info|Debug|Warn|Error)\([^\n]*(?:text|translatedText)/u);
    expect(source).not.toMatch(/Process\.Start|powershell|cmd\.exe/iu);
  });

  it('pins the broker-approved action and only declares required references', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/user-translate/manifest.json', 'utf8')) as { actions: Array<{ id: string; references: string[] }> };
    expect(manifest.actions[0]?.id).toBe('a6c9d452-7627-4bc2-b0b3-46735d8aa120');
    expect(manifest.actions[0]?.references).not.toContain('C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.Net.Http.dll');
  });
});
