import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

describe('Viewer Progression Streamer.bot package', () => {
  it('contains a reproducible projection-only import with the declared contract', async () => {
    const root = 'packages/streamerbot/viewer-progression';
    const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8')) as {
      name: string; version: string;
      action: { name: string; group: string; source: string; importFile: string };
      contract: { requiredInputArguments: string[]; outputArguments: string[] };
    };
    const decoded = Buffer.from((await readFile(`${root}/${manifest.action.importFile}`, 'utf8')).trim(), 'base64');
    expect(decoded.subarray(0, 4).toString('ascii')).toBe('SBAE');
    const exported = JSON.parse(gunzipSync(decoded.subarray(4)).toString('utf8')) as {
      meta: { name: string; version: string };
      data: { actions: Array<{ name: string; group: string; concurrent: boolean; subActions: Array<{ type: number; enabled: boolean; byteCode?: string }> }> };
    };
    expect(exported.meta).toMatchObject({ name: manifest.name, version: manifest.version });
    const action = exported.data.actions[0];
    expect(action).toMatchObject({ name: manifest.action.name, group: manifest.action.group, concurrent: true });
    const code = action?.subActions.filter((item) => item.type === 99_999 && item.enabled) ?? [];
    expect(code).toHaveLength(1);
    const exportedSource = Buffer.from(code[0]?.byteCode ?? '', 'base64').toString('utf8').replaceAll('\r\n', '\n').trimEnd();
    const reviewedSource = (await readFile(`${root}/${manifest.action.source}`, 'utf8')).replaceAll('\r\n', '\n').trimEnd();
    expect(exportedSource).toBe(reviewedSource);
    for (const argument of [...manifest.contract.requiredInputArguments, ...manifest.contract.outputArguments]) expect(reviewedSource).toContain(`"${argument}"`);
    expect(reviewedSource).toContain('eventType != "viewer.progression"');
    expect(reviewedSource).not.toContain('CPH.SetGlobalVar');
    expect(reviewedSource).not.toContain('CPH.RunAction');
    expect(reviewedSource).not.toMatch(/Process\.Start|PowerShell|cmd\.exe/u);
  });
});
