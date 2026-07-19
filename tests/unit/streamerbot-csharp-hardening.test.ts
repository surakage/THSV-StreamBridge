import { readFile, readdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

async function csharpSources(): Promise<Array<{ file: string; source: string }>> {
  const root = 'packages/streamerbot';
  const packages = await readdir(root, { withFileTypes: true });
  const results: Array<{ file: string; source: string }> = [];
  for (const entry of packages) {
    if (!entry.isDirectory()) continue;
    const sourceRoot = path.join(root, entry.name, 'src');
    let files: string[];
    try { files = await readdir(sourceRoot); } catch { continue; }
    for (const file of files.filter((value) => value.endsWith('.cs'))) {
      const fullPath = path.join(sourceRoot, file);
      results.push({ file: fullPath, source: await readFile(fullPath, 'utf8') });
    }
  }
  return results;
}

describe('active Streamer.bot C# hardening', () => {
  it('embeds the reviewed compiler references in every current import', async () => {
    const packages = await readdir('packages/streamerbot', { withFileTypes: true });
    for (const entry of packages) {
      if (!entry.isDirectory()) continue;
      let manifest: { action?: { importFile: string }; actions?: Array<{ importFile: string }> };
      try { manifest = JSON.parse(await readFile(`packages/streamerbot/${entry.name}/manifest.json`, 'utf8')) as typeof manifest; } catch { continue; }
      const importFile = manifest.action?.importFile ?? manifest.actions?.[0]?.importFile;
      if (importFile === undefined) continue;
      const encoded = Buffer.from((await readFile(`packages/streamerbot/${entry.name}/${importFile}`, 'utf8')).trim(), 'base64');
      const exported = JSON.parse(gunzipSync(encoded.subarray(4)).toString('utf8')) as { data: { actions: Array<{ subActions: Array<{ type: number; references?: string[]; byteCode?: string }> }> } };
      for (const action of exported.data.actions) {
        const code = action.subActions.find((subAction) => subAction.type === 99_999);
        expect(code?.references, entry.name).toEqual(expect.arrayContaining([
          'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\mscorlib.dll',
          'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.dll',
        ]));
        const source = Buffer.from(code?.byteCode ?? '', 'base64').toString('utf8');
        if (source.includes('Newtonsoft.Json')) expect(code?.references, entry.name).toContain('.\\Newtonsoft.Json.dll');
      }
    }
  });

  it('does not persist secrets or log raw external exception messages', async () => {
    for (const { file, source } of await csharpSources()) {
      expect(source, file).toMatch(/^\/\/ Purpose:/u);
      expect(source, file).toMatch(/^\/\/ References:/mu);
      expect(source, file).not.toContain('CPH.SetGlobalVar');
      expect(source, file).not.toMatch(/\bargs\s*(?:\.|\[)/u);
      expect(source, file).not.toMatch(/exception\.Message/u);
      expect(source, file).not.toMatch(/Log(?:Error|Warn|Info)\([^\n]*(?:userName|installPath)/u);
    }
  });

  it('keeps every privileged boundary explicitly gated', async () => {
    const read = (file: string) => readFile(`packages/streamerbot/${file}`, 'utf8');
    expect(await read('native-platform-intake/src/RelayPlatform.cs')).toContain('CPH.GetEventType().ToString()');
    expect(await read('tikfinity-intake/src/RelayTikfinity.cs')).toContain('KindForAction(actionName)');
    expect(await read('timed-message-output/src/SendTimedMessage.cs')).toContain('multiTimedSimulated');
    expect(await read('command-administration/src/ProcessCommandAdministration.cs')).toContain('commandAdminApproved');
    expect(await read('reward-administration/src/ProcessRewardAdministration.cs')).toContain('rewardAdminApproved');
    expect(await read('bridge-launcher/src/LaunchBridge.cs')).toContain('start.ps1');
    expect(await read('bridge-launcher/src/ShutdownBridge.cs')).toContain('stop.ps1');
  });
});
