import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

interface Manifest {
  readonly name: string;
  readonly version: string;
  readonly author: string;
  readonly description: string;
  readonly action: { readonly name: string; readonly group: string; readonly source: string; readonly importFile: string };
  readonly requiredGlobalVariables: readonly string[];
  readonly verificationStatus: string;
}

describe('Bridge Launcher Streamer.bot package', () => {
  it('reads its install path from a global variable rather than a hardcoded path', async () => {
    const root = 'packages/streamerbot/bridge-launcher';
    const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8')) as Manifest;
    const decoded = Buffer.from((await readFile(`${root}/${manifest.action.importFile}`, 'utf8')).trim(), 'base64');
    expect(decoded.subarray(0, 4).toString('ascii')).toBe('SBAE');
    const exported = JSON.parse(gunzipSync(decoded.subarray(4)).toString('utf8')) as {
      meta: { name: string; version: string; author: string; description: string };
      data: { actions: Array<{ name: string; group: string; concurrent: boolean; triggers: unknown[]; subActions: Array<{ type: number; enabled: boolean; byteCode?: string }> }> };
    };
    expect(exported.meta).toMatchObject({ name: manifest.name, version: manifest.version, author: manifest.author, description: manifest.description });
    const action = exported.data.actions[0];
    // No trigger is baked into the export: no confirmed schema for a Streamer.bot startup
    // trigger exists anywhere in its public documentation, so the creator adds it themselves
    // through Streamer.bot's own trigger picker, which needs no guess at all.
    expect(action).toMatchObject({ name: manifest.action.name, group: manifest.action.group, concurrent: true, triggers: [] });

    const code = action?.subActions.find((item) => item.type === 99_999 && item.enabled);
    const exportedSource = Buffer.from(code?.byteCode ?? '', 'base64').toString('utf8').replaceAll('\r\n', '\n').trimEnd();
    const reviewedSource = (await readFile(`${root}/${manifest.action.source}`, 'utf8')).replaceAll('\r\n', '\n').trimEnd();
    expect(exportedSource).toBe(reviewedSource);

    for (const variable of manifest.requiredGlobalVariables) {
      expect(reviewedSource).toContain(`"${variable}"`);
      expect(reviewedSource).toContain('CPH.GetGlobalVar');
    }
    // The whole point of this package: the install path must never be a literal path baked into
    // source, or every creator would need to edit and recompile the C# themselves.
    expect(reviewedSource).not.toMatch(/[A-Za-z]:\\[^"]*StreamBridge/);
    expect(reviewedSource).not.toMatch(/token|password|authorization/i);

    // This is the one package in the project that intentionally launches an external process —
    // that must stay an explicit, reviewed choice, not something any other package does too.
    expect(reviewedSource).toContain('Process.Start');

    // Live Streamer.bot Alpha compilation of this exact source has not been confirmed yet; this
    // must stay explicit so the package is never mistaken for verified.
    expect(manifest.verificationStatus).toBe('implementation complete; live Streamer.bot Alpha compilation pending');
  });
});
