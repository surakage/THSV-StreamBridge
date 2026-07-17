import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

describe('wizard launcher package', () => {
  it('contains author, description, reviewed source, and only a loopback wizard URL', async () => {
    const root = 'packages/streamerbot/wizard-launcher';
    const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8')) as { name: string; version: string; author: string; description: string; action: { source: string; importFile: string } };
    expect(manifest).toMatchObject({ version: '2.0.0-preview.1', author: 'surakage' });
    expect(manifest.description.length).toBeGreaterThan(20);
    const source = await readFile(`${root}/${manifest.action.source}`, 'utf8');
    expect(source).toContain('http://127.0.0.1:8787/wizard/');
    expect(source).not.toMatch(/token|password|authorization/i);
    const encoded = (await readFile(`${root}/${manifest.action.importFile}`, 'utf8')).trim();
    const decoded = Buffer.from(encoded, 'base64');
    expect(decoded.subarray(0, 4).toString('ascii')).toBe('SBAE');
    const exported = JSON.parse(gunzipSync(decoded.subarray(4)).toString('utf8')) as { meta: { author: string; description: string }; data: { actions: Array<{ subActions: Array<{ byteCode: string }> }> } };
    expect(exported.meta).toMatchObject({ author: manifest.author, description: manifest.description });
    expect(Buffer.from(exported.data.actions[0]?.subActions[0]?.byteCode ?? '', 'base64').toString('utf8').replaceAll('\r\n', '\n').trim()).toBe(source.replaceAll('\r\n', '\n').trim());
  });
});
