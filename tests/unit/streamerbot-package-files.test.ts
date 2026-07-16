import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

interface PackageManifest {
  readonly name: string;
  readonly version: string;
  readonly action: { readonly name: string; readonly group: string; readonly source: string; readonly importFile: string };
  readonly contract: { readonly requiredOutputArguments: readonly string[] };
}

interface ExportSubAction {
  readonly type: number;
  readonly enabled: boolean;
  readonly byteCode?: string;
}

interface StreamerBotExport {
  readonly meta: { readonly name: string; readonly version: string };
  readonly data: {
    readonly actions: readonly [{
      readonly name: string;
      readonly group: string;
      readonly enabled: boolean;
      readonly queue: string;
      readonly concurrent: boolean;
      readonly subActions: readonly ExportSubAction[];
    }];
  };
}

describe('Streamer.bot package files', () => {
  it('contains a reproducible import with the reviewed receiver source', async () => {
    const root = 'packages/streamerbot/core-receiver';
    const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8')) as PackageManifest;
    const importText = (await readFile(`${root}/${manifest.action.importFile}`, 'utf8')).trim();
    const decoded = Buffer.from(importText, 'base64');

    expect(decoded.subarray(0, 4).toString('ascii')).toBe('SBAE');
    const exported = JSON.parse(gunzipSync(decoded.subarray(4)).toString('utf8')) as StreamerBotExport;
    expect(exported.meta).toMatchObject({ name: manifest.name, version: manifest.version });
    expect(exported.data.actions).toHaveLength(1);

    const action = exported.data.actions[0];
    expect(action).toMatchObject({
      name: manifest.action.name,
      group: manifest.action.group,
      enabled: true,
      queue: '00000000-0000-0000-0000-000000000000',
      concurrent: false,
    });
    const codeActions = action.subActions.filter((subAction) => subAction.type === 99_999 && subAction.enabled && subAction.byteCode !== undefined);
    expect(codeActions).toHaveLength(1);

    const exportedSource = Buffer.from(codeActions[0]?.byteCode ?? '', 'base64').toString('utf8').replaceAll('\r\n', '\n').trimEnd();
    const reviewedSource = (await readFile(`${root}/${manifest.action.source}`, 'utf8')).replaceAll('\r\n', '\n').trimEnd();
    expect(exportedSource).toBe(reviewedSource);

    for (const argument of manifest.contract.requiredOutputArguments) {
      expect(reviewedSource).toContain(`"${argument}"`);
    }
    expect(reviewedSource).toContain('InitializeOutputs();');
    expect(reviewedSource).toContain('IsEventType(eventType)');
    expect(reviewedSource).toContain('IsPlatform(platform)');
  });
});
