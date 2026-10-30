import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { canvasIssues, duplicatePlugins, inspectObsEnvironment } from '../../bridge/services/obs-environment-doctor.js';

const REAL = 'a4820b7e-6dfd-4d4f-93a7-e8ba539d6245'; const EMPTY = '0fb899dc-f7b3-493c-81ae-74aaf4e63a80';
const scene = (name: string, canvas: string, items: number) => ({ name, id: 'scene', canvas_uuid: canvas, settings: { items: Array.from({ length: items }, (_, index) => ({ name: `item ${String(index)}` })) } });

let roots: string[] = [];
afterEach(async () => { await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))); roots = []; });

async function obsFolder(collection: unknown, aitum: unknown, log: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'thsv-obs-doctor-')); roots.push(root);
  await mkdir(join(root, 'logs'), { recursive: true }); await mkdir(join(root, 'basic', 'scenes'), { recursive: true }); await mkdir(join(root, 'basic', 'profiles', 'Streaming'), { recursive: true });
  await writeFile(join(root, 'user.ini'), '[General]\nName=x\n\n[Basic]\nProfile=Streaming\nProfileDir=Streaming\nSceneCollection=Streaming\nSceneCollectionFile=Streaming.json\n');
  await writeFile(join(root, 'basic', 'scenes', 'Streaming.json'), String.fromCharCode(0xfeff) + JSON.stringify(collection));
  await writeFile(join(root, 'basic', 'profiles', 'Streaming', 'aitum.json'), JSON.stringify(aitum));
  await writeFile(join(root, 'logs', '2026-10-29 11-48-15.txt'), log);
  return root;
}

describe('OBS environment doctor', () => {
  it('finds the duplicate Aitum plugin, the empty leftover canvas and Aitum pointing at it (the 2026-10-29 vertical bug)', async () => {
    const collection = { canvases: [{ info: { name: 'Vertical', uuid: EMPTY } }, { info: { name: 'Aitum Vertical', uuid: REAL } }], sources: [scene('Scene', EMPTY, 0), scene('🔴 Gameplay (Vertical)', REAL, 3)] };
    const log = "11:48:23.601: Dock id 'Aitum Vertical' already used!  Duplicate library?\n11:48:23.602: Dock id 'AitumStreamSuiteChat' already used!  Duplicate library?\n11:48:23.603: obs_register_source: Source 'component_source' already exists!  Duplicate library?\n";
    const root = await obsFolder(collection, { canvas: [{ name: 'Aitum Vertical', uuid: EMPTY }] }, log);
    const report = await inspectObsEnvironment(root);
    expect(report).toMatchObject({ available: true, ready: false, checkedLog: '2026-10-29 11-48-15.txt', sceneCollection: 'Streaming.json' });
    expect(report.issues.map((issue) => issue.kind)).toEqual(['duplicate-plugin', 'empty-canvas', 'aitum-canvas-missing']);
    expect(report.issues[0]?.detail).toContain('Aitum Stream Suite twice');
  });

  it('is ready after the fix, and simply unavailable when OBS is not installed', async () => {
    const collection = { canvases: [{ info: { name: 'Aitum Vertical', uuid: REAL } }], sources: [scene('🔴 Gameplay (Vertical)', REAL, 3)] };
    const root = await obsFolder(collection, { canvas: [{ name: 'Aitum Vertical', uuid: REAL }] }, '11:48:23.601: Loaded Modules:\n');
    expect(await inspectObsEnvironment(root)).toMatchObject({ available: true, ready: true, issues: [] });
    expect(await inspectObsEnvironment(undefined)).toEqual({ available: false, ready: true, issues: [] });
    expect(await inspectObsEnvironment(join(tmpdir(), 'thsv-no-obs-here'))).toMatchObject({ available: false, ready: true });
  });

  it('flags two canvases with the same name, and names other duplicated plugins as they are', () => {
    const issues = canvasIssues({ canvases: [{ info: { name: 'Vertical', uuid: 'a' } }, { info: { name: 'vertical', uuid: 'b' } }], sources: [scene('A', 'a', 1), scene('B', 'b', 1)] }, undefined);
    expect(issues.map((issue) => issue.kind)).toEqual(['duplicate-canvas-name']);
    expect(duplicatePlugins("Dock id 'MoveTransitionDock' already used!  Duplicate library?")[0]?.detail).toContain('MoveTransitionDock twice');
    expect(duplicatePlugins('nothing to see')).toEqual([]);
  });
});
