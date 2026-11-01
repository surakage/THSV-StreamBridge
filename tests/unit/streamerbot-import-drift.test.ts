import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareImportedActions, importDriftNotices, sourceFingerprint, type ExpectedPackage } from '../../bridge/services/streamerbot-import-drift.js';

const CURRENT = 'public class CPHInline { public bool Execute() { CPH.LogInfo("v2"); return true; } }';
const OLDER = 'public class CPHInline { public bool Execute() { CPH.LogInfo("v1"); return true; } }';
const EDITED = 'public class CPHInline { public bool Execute() { CPH.ObsSetScene("My scene"); return true; } }';

const saved = (id: string, code: string): Record<string, unknown> => ({ id, name: id, subActions: [{ type: 123 }, { type: 99_999, byteCode: Buffer.from(code.replace(/\n/gu, '\r\n')).toString('base64') }] });
const pkg = (folder: string, ids: readonly string[]): ExpectedPackage => ({ folder, name: folder, actions: ids.map((id) => ({ id, name: `Action ${id}`, importFile: `${folder}.sb`, sourceHash: sourceFingerprint(CURRENT) })) });
const released = new Set([sourceFingerprint(OLDER), sourceFingerprint(CURRENT)]);

describe('Stream Doctor: what to re-import', () => {
  it('ignores line endings, comments and the release number in a User-Agent', () => {
    expect(sourceFingerprint('// Purpose: old wording\nint a = 1;\r\n\r\nvar ua = "THSV-StreamBridge-Translate/4.1.5";  ')).toBe(sourceFingerprint('int a = 1;\nvar ua = "THSV-StreamBridge-Translate/4.1.6";'));
    expect(sourceFingerprint('int a = 1;')).not.toBe(sourceFingerprint('int a = 2;'));
  });

  it('asks for a re-import of older or missing actions and leaves never-imported packages alone', () => {
    const report = compareImportedActions([saved('a1', CURRENT), saved('b1', OLDER)], [pkg('alpha', ['a1']), pkg('beta', ['b1', 'b2']), pkg('gamma', ['g1'])], released);
    expect(report.packages.map((entry) => entry.folder)).toEqual(['alpha', 'beta']);
    expect(report.packages[0]?.reimport).toBe(false);
    expect(report.packages[1]?.actions.map((action) => action.state)).toEqual(['outdated', 'missing']);
    expect(report.reimportCount).toBe(1);
    const notices = importDriftNotices(report);
    expect(notices).toHaveLength(1);
    expect(notices[0]?.['fix']).toBe('beta: "Action b1" is from an older StreamBridge release, and "Action b2" is missing from Streamer.bot. Re-import beta.sb in Streamer.bot.');
  });

  it('protects creator edits: no re-import nudge, and a warning when a re-import would replace them', () => {
    const edits = compareImportedActions([saved('s1', EDITED)], [pkg('scenes', ['s1'])], released);
    expect(edits.packages[0]?.customized).toEqual(['Action s1']);
    expect(importDriftNotices(edits)).toEqual([]);
    const mixed = compareImportedActions([saved('s1', EDITED), saved('s2', OLDER)], [pkg('scenes', ['s1', 's2'])], released);
    expect(importDriftNotices(mixed)[0]?.['fix']).toContain('You changed "Action s1", and re-importing replaces it');
  });

  it('says what a re-import resets: triggers the creator added and edited settings', () => {
    const launch = { ...saved('l1', OLDER), triggers: [{ type: 706 }, { type: 702 }], subActions: [{ type: 123, variableName: 'thsvBridgeInstallPath', value: 'F:\\Bridge\\Managed Bridge' }, { type: 99_999, byteCode: Buffer.from(OLDER).toString('base64') }] };
    const monitor = { ...saved('m1', CURRENT), triggers: [{ type: 701 }] };
    const expected: ExpectedPackage = { folder: 'bridge-launcher', name: 'Bridge Launcher', actions: [
      { id: 'l1', name: 'Launch Bridge', importFile: 'launcher.sb', sourceHash: sourceFingerprint(CURRENT), shippedTriggers: 1, triggerSetup: ['Core > Streamer.bot > Streamer.bot Started'], editableArguments: { thsvBridgeInstallPath: '' } },
      { id: 'm1', name: 'Monitor Connections', importFile: 'launcher.sb', sourceHash: sourceFingerprint(CURRENT), shippedTriggers: 0, triggerSetup: ['Core > Timed Actions > THSV StreamBridge Health'] },
    ] };
    const fix = importDriftNotices(compareImportedActions([launch, monitor], [expected], released))[0]?.['fix'];
    expect(fix).toContain('Re-importing resets your setup, so afterwards: re-add the trigger you added to "Launch Bridge" (Core > Streamer.bot > Streamer.bot Started)');
    expect(fix).toContain('set thsvBridgeInstallPath in "Launch Bridge" back to F:\\Bridge\\Managed Bridge');
    expect(fix).toContain('re-add the trigger you added to "Monitor Connections" (Core > Timed Actions > THSV StreamBridge Health)');
  });

  it('never suggests re-importing a package of creator-filled starter templates', () => {
    const scenes: ExpectedPackage = { folder: 'scene-actions', name: 'Scene Actions', actions: [
      { id: 'i1', name: 'Intake', importFile: 'scenes.sb', sourceHash: sourceFingerprint(CURRENT) },
      { id: 't1', name: 'Starting Soon', importFile: 'scenes.sb', sourceHash: sourceFingerprint(CURRENT), creatorTemplate: true },
      { id: 't2', name: 'Just Chatting', importFile: 'scenes.sb', sourceHash: sourceFingerprint(CURRENT), creatorTemplate: true },
    ] };
    const report = compareImportedActions([saved('i1', OLDER), saved('t1', EDITED)], [scenes], released);
    expect(report.packages[0]?.reimport).toBe(false);
    expect(importDriftNotices(report)).toEqual([]);
  });

  it('records every action source this release ships in the released-source history', async () => {
    const history = JSON.parse(await readFile('packages/streamerbot/source-history.json', 'utf8')) as { hashes: string[] };
    const hashes = new Set(history.hashes);
    const missing: string[] = [];
    for (const folder of await readdir('packages/streamerbot', { withFileTypes: true })) {
      if (!folder.isDirectory()) continue;
      const source = join('packages/streamerbot', folder.name, 'src');
      const files = await readdir(source).catch(() => [] as string[]);
      for (const file of files.filter((name) => name.endsWith('.cs'))) if (!hashes.has(sourceFingerprint(await readFile(join(source, file), 'utf8')))) missing.push(`${folder.name}/src/${file}`);
    }
    // After changing action code, run: npx tsx tools/build-streamerbot-source-history.ts
    expect(missing).toEqual([]);
  });
});
