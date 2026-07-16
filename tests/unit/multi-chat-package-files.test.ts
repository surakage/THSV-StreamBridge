import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

interface Manifest {
  readonly name: string;
  readonly version: string;
  readonly action: { readonly name: string; readonly group: string; readonly source: string; readonly importFile: string };
  readonly contract: { readonly requiredInputArguments: readonly string[]; readonly outputArguments: readonly string[] };
}

describe('Multi-Chat Streamer.bot package', () => {
  it('contains a reproducible import with the reviewed source and declared contract', async () => {
    const root = 'packages/streamerbot/multi-chat';
    const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8')) as Manifest;
    const decoded = Buffer.from((await readFile(`${root}/${manifest.action.importFile}`, 'utf8')).trim(), 'base64');
    expect(decoded.subarray(0, 4).toString('ascii')).toBe('SBAE');

    const exported = JSON.parse(gunzipSync(decoded.subarray(4)).toString('utf8')) as {
      meta: { name: string; version: string };
      data: { actions: Array<{ name: string; group: string; concurrent: boolean; subActions: Array<{ type: number; enabled: boolean; byteCode?: string }> }> };
    };
    expect(exported.meta).toMatchObject({ name: manifest.name, version: manifest.version });
    expect(exported.data.actions).toHaveLength(1);
    expect(exported.data.actions[0]).toMatchObject({ name: manifest.action.name, group: manifest.action.group, concurrent: false });

    const codeActions = exported.data.actions[0]?.subActions.filter((action) => action.type === 99_999 && action.enabled) ?? [];
    expect(codeActions).toHaveLength(1);
    const exportedSource = Buffer.from(codeActions[0]?.byteCode ?? '', 'base64').toString('utf8').replaceAll('\r\n', '\n').trimEnd();
    const reviewedSource = (await readFile(`${root}/${manifest.action.source}`, 'utf8')).replaceAll('\r\n', '\n').trimEnd();
    expect(exportedSource).toBe(reviewedSource);

    for (const argument of [...manifest.contract.requiredInputArguments, ...manifest.contract.outputArguments]) {
      expect(reviewedSource).toContain(`"${argument}"`);
    }
    expect(reviewedSource).toContain('eventType != "chat.message"');
    expect(reviewedSource).not.toContain('CPH.SetGlobalVar');
    expect(reviewedSource).not.toContain('CPH.RunAction');
  });
});
