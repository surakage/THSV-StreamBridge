import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

interface Manifest {
  readonly name: string;
  readonly version: string;
  readonly action: { readonly name: string; readonly group: string; readonly source: string; readonly importFile: string };
  readonly contract: {
    readonly operations: readonly string[];
    readonly requiredInputArguments: readonly string[];
    readonly outputArguments: readonly string[];
    readonly safety: { readonly requiresCreatorApproval: boolean; readonly deniedTextSource: string; readonly badWordFilter: string; readonly directTriggers: boolean };
  };
}

describe('Speaker Orchestration Streamer.bot package', () => {
  it('contains a reproducible triggerless concurrent import with the reviewed safety boundary', async () => {
    const root = 'packages/streamerbot/speaker-orchestration';
    const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8')) as Manifest;
    const decoded = Buffer.from((await readFile(`${root}/${manifest.action.importFile}`, 'utf8')).trim(), 'base64');
    expect(decoded.subarray(0, 4).toString('ascii')).toBe('SBAE');
    const exported = JSON.parse(gunzipSync(decoded.subarray(4)).toString('utf8')) as {
      meta: { name: string; version: string };
      data: { actions: Array<{ name: string; group: string; concurrent: boolean; triggers: unknown[]; subActions: Array<{ type: number; enabled: boolean; byteCode?: string }> }> };
    };
    const action = exported.data.actions[0];
    expect(exported.meta).toMatchObject({ name: manifest.name, version: manifest.version });
    expect(action).toMatchObject({ name: manifest.action.name, group: manifest.action.group, concurrent: true, triggers: [] });
    const code = action?.subActions.find((item) => item.type === 99_999 && item.enabled);
    const exportedSource = Buffer.from(code?.byteCode ?? '', 'base64').toString('utf8').replaceAll('\r\n', '\n').trimEnd();
    const reviewedSource = (await readFile(`${root}/${manifest.action.source}`, 'utf8')).replaceAll('\r\n', '\n').trimEnd();
    expect(exportedSource).toBe(reviewedSource);
    for (const argument of [...manifest.contract.requiredInputArguments, ...manifest.contract.outputArguments]) expect(reviewedSource).toContain(`"${argument}"`);
    for (const operation of manifest.contract.operations) expect(reviewedSource).toContain(`"${operation}"`);
    expect(manifest.contract.safety).toEqual({
      requiresCreatorApproval: true, allowedTextSources: ['creator-template', 'creator-approved'], deniedTextSource: 'raw-event',
      badWordFilter: 'always-on', simulatedDefault: 'deny', directTriggers: false,
    });
    expect(reviewedSource).toContain('CPH.TtsSpeak(voiceAlias, message, true)');
    expect(reviewedSource).toContain('CPH.BroadcastUdp(SpeakerBotUdpPort');
    expect(reviewedSource).toContain('if (result <= 0) return Fail("Speaker.bot transport returned a non-positive dispatch result.")');
    expect(reviewedSource.indexOf('if (result <= 0)')).toBeLessThan(reviewedSource.indexOf('CPH.SetArgument("speakerDispatched", true)'));
    expect(reviewedSource).toContain('SpeakerBotUdpPort = 6669');
    expect(reviewedSource).not.toContain('RegularExpressions');
    expect(reviewedSource).not.toContain('Regex.');
    expect(reviewedSource).not.toContain('multiAlertMessage');
    expect(reviewedSource).not.toMatch(/CPH\.SetGlobalVar|Process\.Start|PowerShell|cmd\.exe|PlaySound|SendMessage/);
  });
});
