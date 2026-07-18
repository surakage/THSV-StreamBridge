import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

interface ManifestAction {
  readonly name: string;
  readonly group: string;
  readonly source: string;
  readonly importFile: string;
}

interface Manifest {
  readonly name: string;
  readonly version: string;
  readonly author: string;
  readonly description: string;
  readonly actions: readonly ManifestAction[];
  readonly requiredGlobalVariables: readonly string[];
  readonly verificationStatus: string;
}

describe('Bridge Launcher Streamer.bot package', () => {
  it('both actions read their install path from a global variable rather than a hardcoded path', async () => {
    const root = 'packages/streamerbot/bridge-launcher';
    const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8')) as Manifest;
    expect(manifest.actions).toHaveLength(2);
    const importFile = manifest.actions[0]?.importFile;
    if (importFile === undefined) throw new Error('Manifest has no actions.');
    const decoded = Buffer.from((await readFile(`${root}/${importFile}`, 'utf8')).trim(), 'base64');
    expect(decoded.subarray(0, 4).toString('ascii')).toBe('SBAE');
    const exported = JSON.parse(gunzipSync(decoded.subarray(4)).toString('utf8')) as {
      meta: { name: string; version: string; author: string; description: string };
      data: { actions: Array<{ name: string; group: string; concurrent: boolean; triggers: unknown[]; subActions: Array<{ type: number; enabled: boolean; byteCode?: string }> }> };
    };
    expect(exported.meta).toMatchObject({ name: manifest.name, version: manifest.version, author: manifest.author, description: manifest.description });
    expect(exported.data.actions).toHaveLength(2);

    for (const [index, manifestAction] of manifest.actions.entries()) {
      const action = exported.data.actions[index];
      // No trigger is baked into either export: no confirmed schema for a Streamer.bot startup
      // or stream-offline trigger exists anywhere in its public documentation, so the creator
      // adds them through Streamer.bot's own trigger picker, which needs no guess at all.
      expect(action).toMatchObject({ name: manifestAction.name, group: manifestAction.group, concurrent: true, triggers: [] });

      const code = action?.subActions.find((item) => item.type === 99_999 && item.enabled);
      const exportedSource = Buffer.from(code?.byteCode ?? '', 'base64').toString('utf8').replaceAll('\r\n', '\n').trimEnd();
      const reviewedSource = (await readFile(`${root}/${manifestAction.source}`, 'utf8')).replaceAll('\r\n', '\n').trimEnd();
      expect(exportedSource).toBe(reviewedSource);

      for (const variable of manifest.requiredGlobalVariables) {
        expect(reviewedSource).toContain(`"${variable}"`);
        expect(reviewedSource).toContain('CPH.GetGlobalVar');
      }
      // The whole point of this package: the install path must never be a literal path baked
      // into source, or every creator would need to edit and recompile the C# themselves.
      expect(reviewedSource).not.toMatch(/[A-Za-z]:\\[^"]*StreamBridge/);
    }

    // Live Streamer.bot Alpha compilation of this exact source has not been confirmed yet; this
    // must stay explicit so the package is never mistaken for verified.
    expect(manifest.verificationStatus).toBe('implementation complete; live Streamer.bot Alpha compilation pending');
  });

  it('the launch action never mentions tokens or credentials and is the only one that starts an external process', async () => {
    const source = await readFile('packages/streamerbot/bridge-launcher/src/LaunchBridge.cs', 'utf8');
    expect(source).not.toMatch(/token|password|authorization/i);
    expect(source).toContain('Process.Start');
  });

  it('the shutdown action reads the control token from disk fresh every run rather than storing a copy of it', async () => {
    const source = await readFile('packages/streamerbot/bridge-launcher/src/ShutdownBridge.cs', 'utf8');
    expect(source).toContain('control-token');
    expect(source).toContain('File.ReadAllText');
    // It authenticates with the bridge's own token, so it legitimately mentions "authorization"
    // and "token" — what must never appear is an actual literal secret value baked into source.
    expect(source).not.toMatch(/CPH\.SetGlobalVar\(\s*"[^"]*(token|password)/i);
    expect(source).toContain('/shutdown');
    expect(source).not.toContain('Process.Start');
  });
});
