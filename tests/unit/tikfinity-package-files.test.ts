import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

describe('TikFinity intake package', () => {
  it('exports five reviewed concurrent relay actions with metadata', async () => {
    const root = 'packages/streamerbot/tikfinity-intake';
    const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8')) as { name: string; version: string; author: string; description: string; actions: Array<{ name: string; source: string; importFile: string }> };
    const decoded = Buffer.from((await readFile(`${root}/${manifest.actions[0]?.importFile ?? ''}`, 'utf8')).trim(), 'base64');
    expect(decoded.subarray(0, 4).toString('ascii')).toBe('SBAE');
    const exported = JSON.parse(gunzipSync(decoded.subarray(4)).toString('utf8')) as { meta: Record<string, unknown>; data: { actions: Array<{ name: string; concurrent: boolean; triggers: unknown[]; subActions: Array<{ byteCode?: string }> }> } };
    expect(exported.meta).toMatchObject({ name: manifest.name, version: manifest.version, author: manifest.author, description: manifest.description });
    expect(exported.data.actions.map((action) => action.name)).toEqual(manifest.actions.map((action) => action.name));
    const reviewed = (await readFile(`${root}/${manifest.actions[0]?.source ?? ''}`, 'utf8')).replaceAll('\r\n', '\n').trimEnd();
    for (const action of exported.data.actions) {
      expect(action.concurrent).toBe(true);
      expect(action.triggers).toEqual([]);
      expect(Buffer.from(action.subActions[0]?.byteCode ?? '', 'base64').toString('utf8').replaceAll('\r\n', '\n').trimEnd()).toBe(reviewed);
    }
    expect(reviewed).toContain('CPH.WebsocketBroadcastJson');
    expect(reviewed).not.toContain('CPH.SetGlobalVar');
    expect(reviewed).not.toMatch(/Process\.Start|powershell|cmd\.exe/iu);
  });
});
