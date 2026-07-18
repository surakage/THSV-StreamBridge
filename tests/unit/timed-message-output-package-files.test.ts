import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

describe('Timed Message Output Streamer.bot package', () => {
  it('packages a triggerless concurrent multi-platform sender with simulation suppression', async () => {
    const root = 'packages/streamerbot/timed-message-output';
    const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8')) as {
      action: { name: string; source: string; importFile: string };
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
    expect(source).toContain('CPH.SendMessage(message, true, true)');
    expect(source).toContain('CPH.SendYouTubeMessageToLatestMonitored(message, true, true)');
    expect(source).toContain('CPH.SendKickMessage(message, true, true)');
    expect(source).toContain('CPH.WebsocketBroadcastJson');
    expect(source).toContain('if (simulated)');
    expect(manifest.contract.executionSafety).toMatchObject({ directTriggers: false, writesGlobalVariables: false, simulatedEventsSendExternally: false });
    expect(source).not.toMatch(/CPH\.SetGlobalVar|Process\.Start|PowerShell|cmd\.exe|TtsSpeak|BroadcastUdp/);
  });
});
