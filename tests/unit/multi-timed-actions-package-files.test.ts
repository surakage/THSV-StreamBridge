import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

describe('Multi-Timed Actions Streamer.bot package', () => {
  it('contains a reproducible triggerless concurrent projection with one approved action provider', async () => {
    const root = 'packages/streamerbot/multi-timed-actions';
    const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8')) as {
      name: string; version: string;
      action: { name: string; group: string; source: string; importFile: string };
      contract: { requiredInputArguments: string[]; outputArguments: string[]; executionSafety: Record<string, unknown> };
    };
    const decoded = Buffer.from((await readFile(`${root}/${manifest.action.importFile}`, 'utf8')).trim(), 'base64');
    expect(decoded.subarray(0, 4).toString('ascii')).toBe('SBAE');
    const exported = JSON.parse(gunzipSync(decoded.subarray(4)).toString('utf8')) as {
      data: { actions: Array<{ name: string; concurrent: boolean; triggers: unknown[]; subActions: Array<{ type: number; enabled: boolean; byteCode?: string }> }> };
    };
    const action = exported.data.actions[0];
    expect(action).toMatchObject({ name: manifest.action.name, concurrent: true, triggers: [] });
    const source = (await readFile(`${root}/${manifest.action.source}`, 'utf8')).replaceAll('\r\n', '\n').trimEnd();
    const packaged = Buffer.from(action?.subActions.find((item) => item.type === 99_999 && item.enabled)?.byteCode ?? '', 'base64').toString('utf8').replaceAll('\r\n', '\n').trimEnd();
    expect(packaged).toBe(source);
    for (const argument of [...manifest.contract.requiredInputArguments, ...manifest.contract.outputArguments]) expect(source).toContain(`"${argument}"`);
    expect(manifest.contract.executionSafety).toMatchObject({ runsCreatorActions: 'only-explicitly-approved-existing-action-by-id', writesGlobalVariables: false, directTriggers: false });
    expect(source).toContain('CPH.RunActionById(targetActionId, false)');
    expect(source).toContain('if (!dispatched) CPH.LogWarn');
    expect(source).toContain('targetActionApproved');
    expect(source).toContain('actionId == new Guid(ThisActionId)');
    expect(source).toContain('multiTimedSelectedMessages');
    expect(source).toContain('selectionMode != "platform-shuffle"');
    expect(source).not.toMatch(/CPH\.RunAction\(|CPH\.SetGlobalVar|Process\.Start|PowerShell|cmd\.exe|TtsSpeak|BroadcastUdp/);
    expect(source).toContain('reader.DateParseHandling = DateParseHandling.None');
  });
});
