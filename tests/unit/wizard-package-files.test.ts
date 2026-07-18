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

  it('announces asynchronous results and follows the operating-system color scheme', async () => {
    const shell = await readFile('wizard/browser/index.html', 'utf8');
    const styles = await readFile('wizard/browser/styles.css', 'utf8');
    const script = await readFile('wizard/browser/app.js', 'utf8');
    expect(shell.match(/aria-live="polite"/g)).toHaveLength(9);
    expect(shell.match(/role="status"/g)).toHaveLength(9);
    expect(styles).toContain('color-scheme:light dark');
    expect(styles).toContain('@media(prefers-color-scheme:light)');
    expect(script).toContain("status.setAttribute('aria-busy','true')");
    expect(script).toContain("status.removeAttribute('aria-busy')");
    expect(script).toContain("kind==='command'&&value.managed");
    expect(script).toContain('data-admin-name');
    expect(script).toContain('THSV-managed command');
    expect(shell).toContain('Reference role (not enforced)');
    expect(shell).toContain('Configure the real permission in Streamer.bot after import.');
    expect(shell).toContain('defaults to Twitch chat as its source');
  });
});
