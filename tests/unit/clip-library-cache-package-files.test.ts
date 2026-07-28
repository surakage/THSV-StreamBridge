import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
describe('Clip Library Cache Streamer.bot package', () => {
  it('uses one triggerless bounded GetClipsForUser action', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/clip-library-cache/manifest.json', 'utf8')) as { actions: Array<{ id: string; group: string; excludeFromHistory: boolean; excludeFromPending: boolean }>; manualTriggerSetup: { refresh: unknown[] } };
    expect(manifest.actions[0]).toMatchObject({ id: '6d957f70-37fa-47d9-aa42-36f54fdb034c', group: 'THSV Addon - Clip Library Cache', excludeFromHistory: true, excludeFromPending: true }); expect(manifest.manualTriggerSetup.refresh).toEqual([]);
    const source = await readFile('packages/streamerbot/clip-library-cache/src/RefreshClips.cs', 'utf8'); expect(source).toContain('GetClipsForUser'); expect(source).not.toContain('TwitchOAuthToken'); expect(source).not.toContain('TwitchGetClipDownloadUrls');
  });
});
