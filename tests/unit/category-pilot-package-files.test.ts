import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Category Pilot Streamer.bot package', () => {
  it('keeps probing allowlist-only and every action in a dedicated group', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/category-pilot/manifest.json', 'utf8')) as { actions: Array<{ group: string }>; triggerSafety: string };
    expect(new Set(manifest.actions.map((action) => action.group))).toEqual(new Set(['THSV Addon - Category Pilot']));
    expect(manifest.triggerSafety).toContain('never returns paths');
    const probe = await readFile('packages/streamerbot/category-pilot/src/ProcessProbe.cs', 'utf8');
    expect(probe).toContain('Process.GetProcesses()');
    expect(probe).toContain('allowed.Contains(name)');
    expect(probe).toContain('categoryPilotRequestId');
    expect(probe).toContain('["requestId"] = requestId');
    expect(probe).not.toMatch(/MainWindowTitle|MainModule|StartInfo|CommandLine/iu);
  });
});
