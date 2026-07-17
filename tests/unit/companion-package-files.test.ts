import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

describe('Bloom Companion Streamer.bot package', () => {
  it('has author metadata and remains projection-only', async () => {
    const root = 'packages/streamerbot/companion-actions';
    const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8')) as { name: string; version: string; author?: string; description?: string; action: { name: string; group: string; source: string; importFile: string }; contract: { acceptedEventTypes: string[]; requiredInputArguments: string[]; outputArguments: string[] } };
    const source = await readFile(`${root}/src/ProcessCompanionAction.cs`, 'utf8');
    expect(manifest.author).toBe('surakage');
    expect(manifest.description).toContain('Bloom companion');
    expect(manifest.contract.acceptedEventTypes).toEqual(['companion.action']);
    expect(source).toContain('eventType != "companion.action"');
    expect(source).not.toContain('CPH.SetGlobalVar');
    expect(source).not.toContain('CPH.RunAction');
    expect(source).not.toMatch(/Process\.Start|PowerShell|cmd\.exe/u);
    const decoded = Buffer.from((await readFile(`${root}/${manifest.action.importFile}`, 'utf8')).trim(), 'base64');
    expect(decoded.subarray(0, 4).toString('ascii')).toBe('SBAE');
    const exported = JSON.parse(gunzipSync(decoded.subarray(4)).toString('utf8')) as { meta: { name: string; version: string }; data: { actions: Array<{ name: string; group: string; concurrent: boolean; subActions: Array<{ type: number; enabled: boolean; byteCode?: string }> }> } };
    expect(exported.meta).toMatchObject({ name: manifest.name, version: manifest.version });
    const action = exported.data.actions[0];
    expect(action).toMatchObject({ name: manifest.action.name, group: manifest.action.group, concurrent: true });
    const code = action?.subActions.filter((item) => item.type === 99_999 && item.enabled) ?? [];
    expect(code).toHaveLength(1);
    expect(Buffer.from(code[0]?.byteCode ?? '', 'base64').toString('utf8').replaceAll('\r\n', '\n').trimEnd()).toBe(source.replaceAll('\r\n', '\n').trimEnd());
    for (const argument of [...manifest.contract.requiredInputArguments, ...manifest.contract.outputArguments]) expect(source).toContain(`"${argument}"`);
  });
});
