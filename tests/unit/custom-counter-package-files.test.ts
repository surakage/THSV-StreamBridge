import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

describe('Custom Counter package files', () => {
  it('keeps controls local, bounded, triggerless, and in a dedicated group', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/custom-counter/manifest.json', 'utf8')) as { actions: Array<{ group: string; source: string; arguments: Array<{ name: string }> }>; manualTriggerSetup: string[] };
    const source = await readFile('packages/streamerbot/custom-counter/src/ControlCounter.cs', 'utf8');
    expect(manifest.actions).toHaveLength(1);
    expect(manifest.actions.every((action) => action.group === 'THSV Addon - Custom Counter' && action.source === 'src/ControlCounter.cs')).toBe(true);
    expect(manifest.actions.every((action) => action.arguments.some((argument) => argument.name === 'counterId') && action.arguments.some((argument) => argument.name === 'counterName'))).toBe(true);
    expect(manifest.actions.every((action) => new Set(action.arguments.map((argument) => argument.name)).size === action.arguments.length)).toBe(true);
    expect(manifest.manualTriggerSetup.join(' ')).toContain('No direct trigger');
    expect(manifest.manualTriggerSetup.join(' ')).toContain('never require duplicated actions');
    expect(manifest.manualTriggerSetup.join(' ')).toContain('need no Streamer.bot action or Command object');
    expect(source).toContain('CPH.WebsocketBroadcastJson');
    expect(source).not.toMatch(/SetGlobalVar|Process\.Start|PowerShell|cmd\.exe/iu);
  });

  it('renders a responsive square-icon counter in the shared overlay host', async () => {
    const [html, script, styles] = await Promise.all([readFile('overlays/browser/addon-host.html', 'utf8'), readFile('overlays/browser/addon-host.js', 'utf8'), readFile('overlays/browser/addon-host.css', 'utf8')]);
    expect(html).toContain('id="counter-shell"');
    expect(script).toContain("`${moduleId}.counter.update`");
    expect(styles).toContain('.counter-icon'); expect(styles).toContain('aspect-ratio: 1');
  });

  it('documents and validates distinct Bridge-managed counter shortcuts', async () => {
    const [schemaText, wizardText, readme] = await Promise.all([
      readFile('addons/custom-counter/schemas/config.json', 'utf8'),
      readFile('addons/custom-counter/ui/settings.json', 'utf8'),
      readFile('addons/custom-counter/README.md', 'utf8'),
    ]);
    const schema = JSON.parse(schemaText) as { properties: { commandShortcuts: { maxItems: number; items: { pattern: string } } } };
    expect(schema.properties.commandShortcuts.maxItems).toBe(20);
    expect(new RegExp(schema.properties.commandShortcuts.items.pattern, 'u').test('death=deaths|Deaths')).toBe(true);
    expect(wizardText).toContain('death=deaths|Deaths');
    expect(wizardText).toContain('!death reset');
    expect(readme).toContain('!streamcounter deaths +1');
    expect(readme).toContain('!death set 5');
  });

  it('packages reusable counter ID and display-name arguments without Streamer.bot command triggers', async () => {
    const encoded = Buffer.from(await readFile('packages/streamerbot/custom-counter/THSV-StreamBridge-Custom-Counter-3.5.0.sb', 'utf8'), 'base64');
    expect(encoded.subarray(0, 4).toString('ascii')).toBe('SBAE');
    const exported = JSON.parse(gunzipSync(encoded.subarray(4)).toString('utf8')) as { data: { actions: Array<{ triggers: unknown[]; subActions: Array<{ type: number; variableName?: string }> }>; commands: unknown[] } };
    expect(exported.data.actions).toHaveLength(1);
    expect(exported.data.actions.every((action) => action.triggers.length === 0)).toBe(true);
    expect(exported.data.commands).toEqual([]);
    expect(exported.data.actions.every((action) => {
      const argumentsSet = new Set(action.subActions.filter((entry) => entry.type === 123).map((entry) => entry.variableName));
      return argumentsSet.has('counterOperation') && argumentsSet.has('counterId') && argumentsSet.has('counterName');
    })).toBe(true);
  });
});
