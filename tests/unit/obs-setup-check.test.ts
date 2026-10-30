import { mkdir, mkdtemp, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkObsCanvases, checkObsSetup, findDuplicateObsPlugins, findEmptyObsCanvases } from '../../bridge/services/obs-setup-check.js';

const duplicateLog = [
  '12:00:01.000: Loading module: aitum-stream-suite.dll',
  "12:00:02.000: Dock id 'Aitum Vertical' already used! Duplicate library?",
  "12:00:02.100: Dock id 'Aitum Outputs' already used! Duplicate library?",
  "12:00:02.200: Dock id 'Aitum Vertical' already used! Duplicate library?",
].join('\r\n');

describe('OBS setup check', () => {
  it('names each duplicated plugin dock once', () => {
    expect(findDuplicateObsPlugins(duplicateLog)).toEqual(['Aitum Vertical', 'Aitum Outputs']);
    expect(findDuplicateObsPlugins('12:00:01.000: Loading module: aitum-stream-suite.dll')).toEqual([]);
  });

  it('reads only the newest OBS log and explains the fix', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thsv-obs-logs-'));
    await writeFile(join(directory, '2026-10-29 19-20-00.txt'), duplicateLog);
    await writeFile(join(directory, '2026-10-29 19-25-00.txt'), '12:00:01.000: Loading module: aitum-stream-suite.dll');
    await utimes(join(directory, '2026-10-29 19-20-00.txt'), new Date('2026-10-29T19:20:00Z'), new Date('2026-10-29T19:20:00Z'));
    await utimes(join(directory, '2026-10-29 19-25-00.txt'), new Date('2026-10-29T19:25:00Z'), new Date('2026-10-29T19:25:00Z'));
    expect(await checkObsSetup(directory)).toMatchObject({ id: 'optional-obs-setup', ready: true });

    await utimes(join(directory, '2026-10-29 19-20-00.txt'), new Date('2026-10-29T19:30:00Z'), new Date('2026-10-29T19:30:00Z'));
    const check = await checkObsSetup(directory);
    expect(check).toMatchObject({ ready: false });
    expect(check?.detail).toContain('Aitum Vertical, Aitum Outputs');
    expect(check?.recovery).toContain('Recycle Bin');
  });

  it('skips the check when OBS has never written a log', async () => {
    expect(await checkObsSetup(join(tmpdir(), 'thsv-no-obs-logs-here'))).toBeUndefined();
  });

  const leftoverCollection = {
    name: 'THSV',
    canvases: [
      { info: { name: 'Aitum Vertical', uuid: 'canvas-aitum', flags: 7 } },
      { info: { name: 'Vertical', uuid: 'canvas-empty', flags: 7 } },
    ],
    sources: [
      { id: 'scene', name: 'Starting Soon' },
      { id: 'scene', name: 'Starting Soon (Vertical)', canvas_uuid: 'canvas-aitum' },
      { id: 'group', name: 'Alerts (Vertical)', canvas_uuid: 'canvas-aitum' },
      { id: 'browser_source', name: 'Chat', canvas_uuid: 'canvas-empty' },
    ],
  };

  it('names an empty extra canvas only when another extra canvas has scenes', () => {
    expect(findEmptyObsCanvases(leftoverCollection)).toEqual(['Vertical']);
    expect(findEmptyObsCanvases({ ...leftoverCollection, canvases: leftoverCollection.canvases.slice(1) })).toEqual([]);
    expect(findEmptyObsCanvases({ name: 'Old OBS', sources: [] })).toEqual([]);
    expect(findEmptyObsCanvases('not a collection')).toEqual([]);
  });

  it('reads the active scene collection from user.ini and explains the fix', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thsv-obs-config-'));
    await mkdir(join(directory, 'basic', 'scenes'), { recursive: true });
    await writeFile(join(directory, 'user.ini'), '[Basic]\r\nSceneCollection=THSV\r\nSceneCollectionFile=THSV\r\n');
    await writeFile(join(directory, 'basic', 'scenes', 'THSV.json'), JSON.stringify(leftoverCollection));
    await writeFile(join(directory, 'basic', 'scenes', 'Spare.json'), JSON.stringify({ name: 'Spare', canvases: [], sources: [] }));
    const check = await checkObsCanvases(directory);
    expect(check).toMatchObject({ id: 'optional-obs-canvases', label: 'OBS canvases', ready: false });
    expect(check?.detail).toContain('"Vertical"');
    expect(check?.recovery).toContain('Aitum Stream Suite');

    await writeFile(join(directory, 'user.ini'), '[Basic]\r\nSceneCollectionFile=Spare\r\n');
    expect(await checkObsCanvases(directory)).toMatchObject({ ready: true });
  });

  it('skips the canvas check when OBS has no scene collection', async () => {
    expect(await checkObsCanvases(join(tmpdir(), 'thsv-no-obs-config-here'))).toBeUndefined();
  });
});
