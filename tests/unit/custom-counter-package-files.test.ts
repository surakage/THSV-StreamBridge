import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Custom Counter package files', () => {
  it('keeps controls local, bounded, triggerless, and in a dedicated group', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/custom-counter/manifest.json', 'utf8')) as { actions: Array<{ group: string; source: string }>; manualTriggerSetup: string[] };
    const source = await readFile('packages/streamerbot/custom-counter/src/ControlCounter.cs', 'utf8');
    expect(manifest.actions).toHaveLength(11);
    expect(manifest.actions.every((action) => action.group === 'THSV Addon - Custom Counter' && action.source === 'src/ControlCounter.cs')).toBe(true);
    expect(manifest.manualTriggerSetup.join(' ')).toContain('No direct trigger');
    expect(source).toContain('CPH.WebsocketBroadcastJson');
    expect(source).not.toMatch(/SetGlobalVar|Process\.Start|PowerShell|cmd\.exe/iu);
  });

  it('renders a responsive square-icon counter in the shared overlay host', async () => {
    const [html, script, styles] = await Promise.all([readFile('overlays/browser/addon-host.html', 'utf8'), readFile('overlays/browser/addon-host.js', 'utf8'), readFile('overlays/browser/addon-host.css', 'utf8')]);
    expect(html).toContain('id="counter-shell"');
    expect(script).toContain("`${moduleId}.counter.update`");
    expect(styles).toContain('.counter-icon'); expect(styles).toContain('aspect-ratio: 1');
  });
});
